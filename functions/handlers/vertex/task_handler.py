# functions/handlers/vertex/task_handler.py
import asyncio
import traceback
from firebase_admin import firestore
from common.core import db, logger
from common.config import get_gcp_project_config
from common.adk_helpers import instantiate_adk_agent_from_config, get_model_config_from_firestore

# ... (other imports from the original query_orchestrator will be needed here)
from .query_utils import get_reasoning_engine_id_from_name
from .query_log_fetcher import fetch_vertex_logs_for_query
from .query_session_manager import ensure_adk_session
from .query_vertex_runner import run_vertex_stream_query
from .query_local_diagnostics import try_local_diagnostic_run
from datetime import datetime, timezone
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


async def _execute_and_stream_to_firestore(
        chat_id: str,
        assistant_message_id: str,
        agent_id: str | None,
        model_id: str | None,
        adk_user_id: str
):
    """
    Orchestrates querying a deployed Vertex AI agent OR a model, streaming events to Firestore.
    """
    assistant_message_ref = db.collection("chats").document(chat_id).collection("messages").document(assistant_message_id)
    assistant_message_snap = assistant_message_ref.get()
    if not assistant_message_snap.exists:
        logger.error(f"[TaskExecutor] Assistant message {assistant_message_id} not found. Aborting task.")
        return

    assistant_message_data = assistant_message_snap.to_dict()
    parent_message_id = assistant_message_data.get("parentMessageId")
    if not parent_message_id:
        logger.error(f"[TaskExecutor] Assistant message {assistant_message_id} has no parent. Cannot construct history.")
        return

    conversation_history = await get_full_message_history(chat_id, parent_message_id)

    # Format for ADK: combine all messages into one string
    # A more sophisticated approach might use structured input later
    full_message_text = "\n\n".join([msg.get("content", "") for msg in conversation_history])

    query_start_time_utc = datetime.now(timezone.utc)
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

    # For Agents, they must be deployed. For Models, they run ephemerally.
    if agent_id:
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
        # If the content wasn't streamed directly, set it here
        if "content" not in assistant_message_ref.get().to_dict():
            final_update_payload["content"] = final_state_data.get("finalResponseText", "")

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