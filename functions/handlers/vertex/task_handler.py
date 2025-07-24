# functions/handlers/vertex/task_handler.py
import asyncio
import traceback
import json
import uuid  # Import uuid to generate message IDs
from datetime import datetime, timezone
from google.cloud import tasks_v2

from firebase_admin import firestore
from firebase_functions import https_fn

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import get_model_config_from_firestore

# NEW import for A2A client logic
import httpx
from a2a.types import Message as A2AMessage, TextPart


from .query_utils import get_reasoning_engine_id_from_name
from .query_log_fetcher import fetch_vertex_logs_for_query
from .query_session_manager import ensure_adk_session
from .query_vertex_runner import run_vertex_stream_query
from .query_local_diagnostics import try_local_diagnostic_run
from vertexai.agent_engines import get as get_engine
from google.adk.sessions import VertexAiSessionService

async def get_full_message_history(chat_id, leaf_message_id):
    """Reconstructs the conversation history leading up to a specific message."""
    messages = {}
    messages_collection = db.collection("chats").document(chat_id).collection("messages")
    docs = messages_collection.get()
    for doc in docs:
        messages[doc.id] = doc.to_dict()

    history = []
    current_id = leaf_message_id
    while current_id and current_id in messages:
        message = messages[current_id]
        history.insert(0, message)
        current_id = message.get("parentMessageId")
    return history

async def _run_a2a_agent_and_stream(
        participant_config: dict,
        conversation_history: list,
        assistant_message_ref
):
    """
    Handles the logic for running an A2A agent.
    """
    endpoint_url = participant_config.get("endpointUrl")
    if not endpoint_url:
        raise ValueError("A2A agent config is missing 'endpointUrl'.")

        # 1. Construct the message payload for the A2A agent
    last_user_message = next((msg for msg in reversed(conversation_history) if msg.get("participant", "").startswith("user:")), None)

    if not last_user_message or not last_user_message.get("content"):
        logger.warn(f"[A2AExecutor] No user content found in history for A2A agent call. Sending an empty message.")
        a2a_message_content = ""
    else:
        a2a_message_content = last_user_message.get("content")

        # FIX 1: Construct the A2AMessage with all required fields (role, messageId).
    a2a_message = A2AMessage(
        messageId=str(uuid.uuid4()),
        role="user",
        parts=[TextPart(text=a2a_message_content)]
    )

    # FIX 2: Construct the full JSON-RPC request payload for the 'message/stream' method.
    rpc_request_payload = {
        "jsonrpc": "2.0",
        "method": "message/stream",
        "id": f"agentlab-stream-{uuid.uuid4().hex}",
        "params": {
            "message": a2a_message.model_dump(exclude_none=True)
        }
    }

    errors = []
    final_text = ""
    rpc_endpoint_url = endpoint_url.rstrip('/')

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            logger.info(f"[A2AExecutor] Sending 'message/stream' RPC to {rpc_endpoint_url}")

            # Use client.stream with a POST request to handle the SSE response.
            async with client.stream("POST", rpc_endpoint_url, json=rpc_request_payload, headers={"Accept": "text/event-stream"}) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data:"):
                        try:
                            event_json = line[len("data:"):].strip()
                            rpc_response = json.loads(event_json)

                            event_data = rpc_response.get("result", {})
                            if not event_data:
                                if rpc_response.get("error"):
                                    err_msg = f"A2A stream returned an error: {rpc_response['error']}"
                                    logger.error(f"[A2AExecutor] {err_msg}")
                                    errors.append(err_msg)
                                continue

                            adk_like_event = {"type": "a2a_event", "source_event": event_data}
                            assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([adk_like_event])})

                            event_kind = event_data.get("kind")
                            is_final_event = event_data.get("final", False)

                            if event_kind == "artifact-update" and event_data.get("artifact"):
                                for part in event_data["artifact"].get("parts", []):
                                    if part.get("text"):
                                        final_text += part["text"]

                            if event_kind == "status-update" and event_data.get("status"):
                                task_state = event_data["status"].get("state")
                                if task_state == "failed":
                                    error_detail = event_data["status"].get("message", "Unknown error from A2A agent.")
                                    errors.append(f"A2A agent task failed: {error_detail}")

                            if is_final_event:
                                logger.info(f"[A2AExecutor] Received final event from stream.")
                                break

                        except json.JSONDecodeError:
                            logger.warn(f"[A2AExecutor] Could not decode JSON from event line: {line}")
                        except Exception as e_event_proc:
                            logger.error(f"[A2AExecutor] Error processing event: {e_event_proc}")
                            errors.append(f"Error processing A2A event: {str(e_event_proc)}")

        except httpx.HTTPStatusError as e:
            error_msg = f"A2A agent returned an error: {e.response.status_code} - {e.response.text[:200]}"
            logger.error(f"[A2AExecutor] {error_msg}")
            errors.append(error_msg)
        except Exception as e:
            error_msg = f"Failed to communicate with A2A agent: {str(e)}"
            logger.error(f"[A2AExecutor] {error_msg}\n{traceback.format_exc()}")
            errors.append(error_msg)

    return {"finalResponseText": final_text, "queryErrorDetails": errors}


async def _execute_and_stream_to_firestore(
        chat_id: str,
        assistant_message_id: str,
        agent_id: str | None,
        model_id: str | None,
        adk_user_id: str
):
    """
    Orchestrates querying a deployed Vertex AI agent OR a model OR an A2A agent, streaming events to Firestore.
    """
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)
    assistant_message_snap = assistant_message_ref.get()
    if not assistant_message_snap.exists:
        logger.error(f"[TaskExecutor] Assistant message {assistant_message_id} not found. Aborting task.")
        return

    assistant_message_data = assistant_message_snap.to_dict()
    parent_message_id = assistant_message_data.get("parentMessageId")
    if not parent_message_id:
        # If there's no parent, it's the first message. The history is just the input message.
        conversation_history = [{"content": assistant_message_data.get("run", {}).get("inputMessage", "")}]
    else:
        conversation_history = await get_full_message_history(chat_id, parent_message_id)

        # Format for ADK: combine all messages into one string
    # A more sophisticated approach might use structured input later
    full_message_text = "\n\n".join([msg.get("content", "") for msg in conversation_history])

    logger.info(f"[TaskExecutor] Initiating query for assistant message: {assistant_message_id}.")

    project_id, location, _ = get_gcp_project_config()

    # Determine participant config (agent or model)
    if agent_id:
        participant_config_ref = db.collection("agents").document(agent_id)
    elif model_id:
        participant_config_ref = db.collection("models").document(model_id)
    else: # Should not happen due to orchestrator validation
        raise ValueError("Task requires either agentId or modelId")

    participant_snap = participant_config_ref.get()
    if not participant_snap.exists:
        raise ValueError(f"Participant config not found for ID: {agent_id or model_id}")
    participant_config = participant_snap.to_dict()

    agent_platform = participant_config.get("platform")

    # BRANCHING LOGIC BASED ON PLATFORM
    if agent_id and agent_platform == 'a2a':
        logger.info(f"[TaskExecutor] Executing A2A agent: {agent_id}")
        return await _run_a2a_agent_and_stream(participant_config, conversation_history, assistant_message_ref)

    elif agent_id: # Defaults to google_vertex
        resource_name = participant_config.get("vertexAiResourceName")
        if not resource_name or participant_config.get("deploymentStatus") != "deployed":
            raise ValueError(f"Agent {agent_id} is not successfully deployed.")

        session_service = VertexAiSessionService(project=project_id, location=location)
        current_adk_session_id, session_errors = await ensure_adk_session(
            session_service, resource_name, adk_user_id, session_id_from_client=None # Sessions are managed by chat now
        )

        if not current_adk_session_id:
            raise ValueError(f"Failed to establish ADK session: {session_errors}")

        remote_app = get_engine(resource_name)

        final_text, errors, had_exceptions, num_events = await run_vertex_stream_query(
            remote_app, full_message_text, adk_user_id, current_adk_session_id, assistant_message_ref
        )
        return {"finalResponseText": final_text, "queryErrorDetails": errors}

    elif model_id:
        # This is for ephemeral model execution. It uses the same logic as local diagnostics.
        # It instantiates a temporary, tool-less agent with the model's config.
        model_only_agent_config = {
            "name": f"ephemeral_model_run_{model_id[:6]}",
            "agentType": "Agent",
            "tools": [], # No tools for direct model queries
            "modelId": model_id, # Key change: reference the model
        }

        # This will now fetch model config and merge it inside
        local_adk_agent = await instantiate_adk_agent_from_config(
            model_only_agent_config,
            parent_adk_name_for_context=f"model_run_{chat_id[:4]}"
        )

        # This part reuses the local diagnostic runner logic
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.adk.artifacts import InMemoryArtifactService
        from google.adk.memory import InMemoryMemoryService
        from google.genai.types import Content, Part

        runner = Runner(agent=local_adk_agent, app_name=local_adk_agent.name, session_service=InMemorySessionService(), artifact_service=InMemoryArtifactService(), memory_service=InMemoryMemoryService())
        session = await runner.session_service.create_session(app_name=runner.app_name, user_id=adk_user_id)

        message_content = Content(role="user", parts=[Part(text=full_message_text)])

        final_text = ""
        errors = []
        try:
            async for event_obj in runner.run_async(user_id=adk_user_id, session_id=session.id, new_message=message_content):
                event_dict = event_obj.model_dump()
                # Stream events to Firestore for live UI updates
                assistant_message_ref.update({"run.outputEvents": firestore.ArrayUnion([event_dict])})
                content = event_dict.get("content", {})
                if content and content.get("parts"):
                    for part in content["parts"]:
                        if "text" in part:
                            final_text += part["text"]
        except Exception as e_model_run:
            logger.error(f"Error during ephemeral model run for model {model_id}: {e_model_run}")
            errors.append(f"Model run failed: {str(e_model_run)}")

        return {"finalResponseText": final_text, "queryErrorDetails": errors}

async def _run_agent_task_logic(data: dict):
    """
    Handles the background task of running an agent query and streaming results.
    """
    chat_id = data.get("chatId")
    assistant_message_id = data.get("assistantMessageId")
    agent_id = data.get("agentId")
    model_id = data.get("modelId")
    adk_user_id = data.get("adkUserId")

    logger.info(f"[TaskHandler] Starting execution for message: {assistant_message_id}")
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)

    try:
        assistant_message_ref.update({"run.status": "running"})

        final_state_data = await _execute_and_stream_to_firestore(
            chat_id=chat_id,
            assistant_message_id=assistant_message_id,
            agent_id=agent_id,
            model_id=model_id,
            adk_user_id=adk_user_id
        )

        final_update_payload = {
            "content": final_state_data.get("finalResponseText", ""),
            "run.status": "error" if final_state_data.get("queryErrorDetails") else "completed",
            "run.finalResponseText": final_state_data.get("finalResponseText", ""),
            "run.queryErrorDetails": final_state_data.get("queryErrorDetails"),
            "run.completedTimestamp": firestore.SERVER_TIMESTAMP
        }

        assistant_message_ref.update(final_update_payload)
        logger.info(f"[TaskHandler] Message {assistant_message_id} completed with status: {final_update_payload['run.status']}")

    except Exception as e:
        error_msg = f"Unhandled exception in task handler for message {assistant_message_id}: {type(e).__name__} - {e}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        assistant_message_ref.update({
            "run.status": "error",
            "run.queryErrorDetails": firestore.ArrayUnion([f"Task handler exception: {error_msg}"]),
            "run.completedTimestamp": firestore.SERVER_TIMESTAMP
        })

def run_agent_task_wrapper(data: dict):
    """Synchronous wrapper to run the async task logic."""
    asyncio.run(_run_agent_task_logic(data))

__all__ = ['run_agent_task_wrapper']