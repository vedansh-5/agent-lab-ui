import json
import asyncio
import traceback
from datetime import datetime, timedelta, timezone # For logging timestamp range
from firebase_admin import firestore
from firebase_functions import https_fn
from google.cloud.aiplatform_v1beta1 import ReasoningEngineServiceClient
from google.cloud.aiplatform_v1beta1.types import ReasoningEngine as ReasoningEngineProto
from vertexai import agent_engines as deployed_agent_engines
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
from google.adk.sessions import VertexAiSessionService
# Corrected import for LoggingServiceV2Client
from google.cloud.logging_v2.services.logging_service_v2 import LoggingServiceV2Client

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_tool,
    sanitize_adk_agent_name,
    instantiate_adk_agent_from_config
)

# Initialize the Cloud Logging client
logging_client = LoggingServiceV2Client()

def get_reasoning_engine_id_from_name(resource_name: str) -> str | None:
    """Extracts the reasoning engine ID from its full resource name."""
    if not resource_name: return None
    parts = resource_name.split('/')
    if len(parts) == 6 and parts[0] == 'projects' and parts[2] == 'locations' and parts[4] == 'reasoningEngines':
        return parts[5]
    logger.warning(f"Could not parse reasoning_engine_id from resource_name: {resource_name}")
    return None

async def fetch_vertex_logs(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time: datetime):
    """
    Fetches WARNING and ERROR logs from Cloud Logging for a given reasoning engine and session.
    """
    if not reasoning_engine_id:
        logger.info("fetch_vertex_logs: reasoning_engine_id is missing, skipping log fetch.")
        return []

    log_errors = []
    try:
        end_time_dt = datetime.now(timezone.utc)
        start_time_dt_aware = start_time if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)

        start_time_str = start_time_dt_aware.isoformat()
        effective_end_time = end_time_dt
        if (end_time_dt - start_time_dt_aware) > timedelta(minutes=5): # Limit window to 5 mins
            effective_end_time = start_time_dt_aware + timedelta(minutes=5)
        end_time_str = effective_end_time.isoformat()

        log_filter_parts = [
            f'resource.type="aiplatform.googleapis.com/ReasoningEngine"',
            f'resource.labels.reasoning_engine_id="{reasoning_engine_id}"',
            f'resource.labels.location="{location}"',
            f'severity>="WARNING"',
            f'timestamp>="{start_time_str}"',
            f'timestamp<="{end_time_str}"'
        ]

        if adk_session_id:
            log_filter_parts.append(f'"{adk_session_id}"')
            logger.info(f"Log filter will attempt to include session_id (broad search): {adk_session_id}")

        final_log_filter = " AND ".join(log_filter_parts)
        logger.info(f"Constructed Cloud Logging filter: {final_log_filter}")

        # Corrected call: Removed page_size
        entries_iterator = logging_client.list_log_entries(
            resource_names=[f"projects/{project_id}"],
            filter=final_log_filter,
            order_by="timestamp desc"
            # page_size=20 # <--- REMOVED THIS ARGUMENT
        )

        for entry in entries_iterator:
            message = ""
            if entry.text_payload:
                message = entry.text_payload
            elif entry.json_payload:
                payload_message = entry.json_payload.get('message', entry.json_payload.get('msg'))
                if payload_message and isinstance(payload_message, str):
                    message = payload_message
                else:
                    message = json.dumps(entry.json_payload)

            py_datetime = entry.timestamp.ToDatetime(tzinfo=timezone.utc)
            log_entry_str = f"[{entry.severity.name} @ {py_datetime.strftime('%Y-%m-%dT%H:%M:%SZ')}]: {message}"
            log_errors.append(log_entry_str[:1000])
            if len(log_errors) >= 5: # Limit to 5 most recent error/warning logs for the UI
                logger.info("Reached limit of 5 log entries to fetch.")
                break

        if log_errors:
            logger.info(f"Fetched {len(log_errors)} relevant log entries from Cloud Logging for engine {reasoning_engine_id}, session {adk_session_id or 'N/A'}.")
        else:
            logger.info(f"No WARNING/ERROR logs found in Cloud Logging for engine {reasoning_engine_id}, session {adk_session_id or 'N/A'} in the time window.")

    except Exception as e:
        logger.error(f"Error fetching logs from Cloud Logging: {e}\n{traceback.format_exc()}")
        log_errors.append(f"INTERNAL_LOG_FETCH_ERROR: Error retrieving diagnostic logs: {str(e)}")
    return log_errors


async def _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location):
    query_start_time = datetime.now(timezone.utc)
    _current_session_id_from_client = session_id_from_client
    current_adk_session_id = None
    query_error_details_from_stream = []
    fetched_log_errors = []

    session_service = VertexAiSessionService(project=project_id, location=location)
    try:
        remote_app = deployed_agent_engines.get(resource_name)
    except Exception as e_get_app:
        logger.error(f"Query Logic (Prep): Failed to retrieve remote app '{resource_name}'. Error: {e_get_app}")
        query_error_details_from_stream.append(f"Failed to access agent resource '{resource_name}': {str(e_get_app)}")
        return {
            "events": [], "responseText": "", "adkSessionId": None,
            "queryErrorDetails": query_error_details_from_stream
        }

    logger.info(f"Query Logic (Prep): Retrieved remote app for querying: {remote_app.name} (Display: {remote_app.display_name})")

    if _current_session_id_from_client:
        logger.info(f"Query Logic (Prep): Attempting to retrieve ADK session: '{_current_session_id_from_client}' for ADK user: '{adk_user_id}'")
        try:
            retrieved_session = await session_service.get_session(
                app_name=resource_name, user_id=adk_user_id, session_id=_current_session_id_from_client
            )
            if retrieved_session:
                current_adk_session_id = retrieved_session.id
                logger.info(f"Query Logic (Prep): Successfully retrieved existing ADK session ID: {current_adk_session_id}")
            else:
                logger.warn(f"Query Logic (Prep): get_session for '{_current_session_id_from_client}' returned None. Will create a new session.")
        except Exception as e:
            logger.warn(f"Query Logic (Prep): Failed to retrieve session '{_current_session_id_from_client}'. Error: {e}. Will create a new session.")

    if not current_adk_session_id:
        try:
            logger.info(f"Query Logic (Prep): Creating new ADK session for ADK user: '{adk_user_id}' on app: '{resource_name}'")
            new_session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
            current_adk_session_id = new_session.id
            logger.info(f"Query Logic (Prep): Created new ADK session ID: {current_adk_session_id}")
        except Exception as e_create_sess:
            logger.error(f"Query Logic (Prep): Failed to create new ADK session. Error: {e_create_sess}")
            query_error_details_from_stream.append(f"Failed to create agent session: {str(e_create_sess)}")
            return {
                "events": [], "responseText": "", "adkSessionId": None,
                "queryErrorDetails": query_error_details_from_stream
            }

    if not current_adk_session_id:
        query_error_details_from_stream.append("Critical error: Could not establish an ADK session.")
        return {
            "events": [], "responseText": "", "adkSessionId": None,
            "queryErrorDetails": query_error_details_from_stream
        }

    logger.info(f"Query Logic (Iteration): Using ADK session: '{current_adk_session_id}' for ADK user: '{adk_user_id}' with message: '{message_text[:100]}...'")
    all_events, final_text_response = [], ""
    event_idx = 0

    try:
        for event in remote_app.stream_query(
                message=message_text, user_id=adk_user_id, session_id=current_adk_session_id
        ):
            try:
                logger.info(f"Query Logic (Event {event_idx}): type={event.get('type')}, "
                            f"content_keys={list(event.get('content', {}).keys()) if event.get('content') else 'NoContent'}")
                all_events.append(event)

                if event.get('type') == 'text_delta' and event.get('content') and event['content'].get('parts'):
                    for part in event['content']['parts']:
                        if 'text' in part:
                            final_text_response += part['text']
                elif event.get('type') == 'tool_code_execution_output' and event.get('content') and event['content'].get('parts'):
                    for part in event['content']['parts']:
                        if 'text' in part:
                            logger.info(f"Query Logic (Tool Output): {part['text'][:200]}...")
                event_idx += 1
            except Exception as e_inner_loop:
                logger.error(f"Query Logic (Error processing event {event_idx} for session {current_adk_session_id}): {e_inner_loop}\n{traceback.format_exc()}")
                query_error_details_from_stream.append(f"Error processing agent event {event_idx}: {str(e_inner_loop)}")

    except Exception as stream_exception:
        logger.error(f"Query Logic (Exception during ADK stream_query for session {current_adk_session_id}): {stream_exception}\n{traceback.format_exc()}")
        query_error_details_from_stream.append(f"Agent execution error during stream: {str(stream_exception)}")

    logger.info(f"Query Logic (Stream Complete for session {current_adk_session_id}): {event_idx} events processed. Response length: {len(final_text_response)}")

    reasoning_engine_id = get_reasoning_engine_id_from_name(resource_name)
    if reasoning_engine_id:
        logger.info(f"Query Logic (Log Fetch): Attempting to fetch logs for engine {reasoning_engine_id}, session {current_adk_session_id}")
        fetched_log_errors = await fetch_vertex_logs(project_id, location, reasoning_engine_id, current_adk_session_id, query_start_time)
    else:
        logger.warning(f"Query Logic (Log Fetch): Skipped fetching logs for session {current_adk_session_id}, could not determine reasoning_engine_id from '{resource_name}'.")

    if not final_text_response and all_events and not query_error_details_from_stream and not fetched_log_errors:
        logger.info(f"Query Logic (Fallback Text for session {current_adk_session_id}): No 'text_delta' events found. Checking last events for any text part.")
        for event in reversed(all_events):
            if event.get('content') and event['content'].get('parts'):
                temp_text = ""
                for part in event['content']['parts']:
                    if 'text' in part:
                        temp_text += part['text']
                if temp_text:
                    final_text_response = temp_text
                    logger.info(f"Query Logic (Fallback Text for session {current_adk_session_id}): Found text in non-text_delta event (type: {event.get('type')}): {final_text_response[:100]}...")
                    break

    combined_query_errors = query_error_details_from_stream + fetched_log_errors
    if combined_query_errors:
        logger.error(f"Query Logic (Result for session '{current_adk_session_id}'): Errors encountered: {combined_query_errors}")

    return {
        "events": all_events,
        "responseText": final_text_response,
        "adkSessionId": current_adk_session_id,
        "queryErrorDetails": combined_query_errors if combined_query_errors else None
    }

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Agent config (agentConfig) and Firestore document ID (agentDocId) are required."
        )

    logger.info(f"Initiating deployment for agent '{agent_doc_id}'. Config keys: {list(agent_config_data.keys())}")

    try:
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "deploying_initiated",
            "lastDeploymentAttemptAt": firestore.SERVER_TIMESTAMP,
            "vertexAiResourceName": firestore.DELETE_FIELD,
            "deploymentError": firestore.DELETE_FIELD,
            "lastDeployedAt": firestore.DELETE_FIELD
        })
        logger.info(f"Agent '{agent_doc_id}' status in Firestore set to 'deploying_initiated'.")
    except Exception as e:
        logger.error(f"CRITICAL: Failed to update agent '{agent_doc_id}' status to 'deploying_initiated' "
                     f"before deployment attempt: {e}. Aborting deployment.")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.ABORTED,
            message=f"Failed to set initial deployment status in Firestore for agent {agent_doc_id}. Deployment aborted."
        )

    initialize_vertex_ai()

    agent_type_str = agent_config_data.get("agentType")
    AgentClass = {
        "Agent": Agent, "SequentialAgent": SequentialAgent,
        "LoopAgent": LoopAgent, "ParallelAgent": ParallelAgent
    }.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent '{agent_doc_id}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error", "deploymentError": error_msg,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

    parent_agent_name_str = agent_config_data.get("name", f"default_agent_name_{agent_doc_id}")
    parent_adk_name = sanitize_adk_agent_name(parent_agent_name_str, prefix_if_needed=f"agent_{agent_doc_id}_")
    agent_description = agent_config_data.get("description")

    common_args_for_parent = {"name": parent_adk_name, "description": agent_description}
    adk_agent = None
    instantiated_parent_tools = []
    for tool_conf in agent_config_data.get("tools", []):
        try:
            instantiated_parent_tools.append(instantiate_tool(tool_conf))
        except ValueError as e:
            logger.warning(f"Skipping tool for parent agent '{parent_adk_name}' due to error: {e}")


    if AgentClass == Agent:
        adk_agent = Agent(
            **common_args_for_parent,
            model=agent_config_data.get("model", "gemini-1.5-flash-001"),
            instruction=agent_config_data.get("instruction"),
            tools=instantiated_parent_tools
        )
    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config_data.get("childAgents", [])
        if not child_agent_configs:
            error_msg = f"{AgentClass.__name__} '{parent_adk_name}' requires at least one child agent, but none were provided."
            logger.error(error_msg)
            db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

        instantiated_child_agents = [
            instantiate_adk_agent_from_config(child_config, parent_adk_name_for_context=parent_adk_name, child_index=idx)
            for idx, child_config in enumerate(child_agent_configs)
        ]
        adk_agent = AgentClass(**common_args_for_parent, sub_agents=instantiated_child_agents)
    elif AgentClass == LoopAgent:
        loop_child_adk_name = sanitize_adk_agent_name(f"{parent_adk_name}_looped_child", prefix_if_needed="looped_")
        looped_child_agent_instance = Agent(
            name=loop_child_adk_name,
            model=agent_config_data.get("model", "gemini-1.5-flash-001"),
            instruction=agent_config_data.get("instruction"),
            tools=instantiated_parent_tools
        )
        max_loops_val = int(agent_config_data.get("maxLoops", 3))
        adk_agent = LoopAgent(**common_args_for_parent, agent=looped_child_agent_instance, max_loops=max_loops_val)

    if adk_agent is None:
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}' with type '{agent_type_str}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise ValueError(error_msg)

    logger.info(f"ADK Agent object '{adk_agent.name}' of type {AgentClass.__name__} prepared for deployment.")
    requirements_list = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.0", "gofannon"]
    config_name_for_display = agent_config_data.get("name", agent_doc_id)
    deployment_display_name = generate_vertex_deployment_display_name(config_name_for_display, agent_doc_id)
    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'.")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent deployed via AgentLabUI: {deployment_display_name}")
        )
        logger.info(f"Vertex AI agent deployment successful (create call returned) for '{agent_doc_id}'. "
                    f"Resource name: {remote_app.resource_name}, Display name: '{deployment_display_name}'.")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name,
            "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP,
            "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name,
                "message": f"Agent deployment for '{deployment_display_name}' initiated and confirmed completed by Vertex AI."}

    except Exception as e:
        tb_str = traceback.format_exc()
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}' (ADK name: '{adk_agent.name}', Display: '{deployment_display_name}'): {str(e)}"
        logger.error(f"{error_message_for_log}\n{tb_str}")
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": str(e)[:1000],
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })
        if isinstance(e, https_fn.HttpsError): raise
        if "validation error" in str(e).lower() and "pydantic" in str(e).lower():
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"Agent configuration validation failed: {str(e)[:300]}. Check agent names and other parameters."
            )
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Deployment to Vertex AI failed: {str(e)[:300]}"
        )

def _delete_vertex_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    agent_doc_id = req.data.get("agentDocId")

    if not resource_name or not agent_doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Vertex AI resourceName and agentDocId are required for deletion."
        )

    logger.info(f"Attempting to delete Vertex AI agent '{resource_name}' (Firestore doc: '{agent_doc_id}').")
    initialize_vertex_ai()

    try:
        agent_to_delete = deployed_agent_engines.get(resource_name)
        agent_to_delete.delete(force=True)
        logger.info(f"Vertex AI Agent '{resource_name}' deletion process successfully initiated.")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": firestore.DELETE_FIELD,
            "deploymentStatus": "deleted",
            "lastDeployedAt": firestore.DELETE_FIELD,
            "deploymentError": firestore.DELETE_FIELD,
            "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
        })
        return {"success": True, "message": f"Agent '{resource_name}' deletion initiated successfully."}
    except Exception as e:
        logger.error(f"Error deleting Vertex AI agent '{resource_name}': {e}")
        tb_str = traceback.format_exc()
        logger.debug(f"Traceback for delete_vertex_agent error:\n{tb_str}")

        if "NotFound" in str(e) or "could not be found" in str(e).lower():
            logger.warn(f"Agent '{resource_name}' was not found on Vertex AI during deletion attempt. Updating Firestore.")
            db.collection("agents").document(agent_doc_id).update({
                "vertexAiResourceName": firestore.DELETE_FIELD,
                "deploymentStatus": "not_found_on_vertex",
                "lastDeployedAt": firestore.DELETE_FIELD,
                "deploymentError": "Agent not found on Vertex AI during deletion attempt.",
                "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
            })
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message=f"Agent '{resource_name}' not found on Vertex AI. It might have been already deleted."
            )
        if not isinstance(e, https_fn.HttpsError):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"Failed to delete agent '{resource_name}': {str(e)[:200]}"
            )
        raise

def _query_deployed_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId")
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId")
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_auth_uid"

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="resourceName, message, adkUserId, and agentDocId are required to query an agent."
        )

    logger.info(f"Query Agent (Sync Wrapper): Agent '{resource_name}' (FS doc: '{firestore_agent_id}') "
                f"by ADK user '{adk_user_id}', client session: '{session_id_from_client or 'None'}'.")

    initialize_vertex_ai()
    project_id, location, _ = get_gcp_project_config()

    result_data = {}
    try:
        try:
            result_data = asyncio.run(_query_async_logic_internal(
                resource_name, message_text, adk_user_id, session_id_from_client, project_id, location
            ))
        except RuntimeError as e:
            if "cannot be called when another asyncio event loop is running" in str(e) or \
                    "asyncio.run() cannot be called from a running event loop" in str(e):
                logger.warning("asyncio.run() failed as a loop is already running. Attempting to use existing loop for query.")
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    logger.info("Event loop was closed, creating a new one for query.")
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                result_data = loop.run_until_complete(_query_async_logic_internal(
                    resource_name, message_text, adk_user_id, session_id_from_client, project_id, location
                ))
            else:
                raise

        if not result_data:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Async query logic did not return data.")

        run_data_to_store = {
            "firebaseUserId": firebase_auth_uid,
            "adkUserId": adk_user_id,
            "adkSessionId": result_data.get("adkSessionId"),
            "vertexAiResourceName": resource_name,
            "inputMessage": message_text,
            "outputEventsRaw": json.dumps(result_data.get("events", [])),
            "finalResponseText": result_data.get("responseText", ""),
            "queryErrorDetails": result_data.get("queryErrorDetails"),
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data_to_store)
        logger.info(f"Query Agent (Sync Wrapper): Agent run successfully saved to Firestore for agent '{firestore_agent_id}', ADK session '{result_data.get('adkSessionId')}'.")

        return {"success": True, **result_data}

    except Exception as e:
        tb_str_query = traceback.format_exc()
        logger.error(f"Error in _query_deployed_agent_logic (sync or async part) for agent '{resource_name}': {e}\n{tb_str_query}")
        err_str_lower = str(e).lower()
        is_not_found_error = (
                "NotFound" in str(e) and
                (f"projects/{project_id}/locations/{location}/reasoningEngines/{resource_name}".lower() in err_str_lower or
                 f"deployedagent \"{resource_name}\" not found" in err_str_lower or
                 f"reasoning engine {resource_name} not found" in err_str_lower or
                 f"resource not found: locations/{location}/reasoningengines/{resource_name}" in err_str_lower or
                 f"could not be found" in err_str_lower
                 )
        )

        if is_not_found_error:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message=f"Agent resource '{resource_name}' not found on Vertex AI or is not ready. Please ensure it's deployed correctly."
            )
        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to query agent '{resource_name}': {str(e)[:300]}"
        )

def _check_vertex_agent_deployment_status_logic(req: https_fn.CallableRequest):
    agent_doc_id = req.data.get("agentDocId")
    if not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="agentDocId is required.")

    logger.info(f"Checking deployment status for agent Firestore doc ID: {agent_doc_id}")
    initialize_vertex_ai()

    project_id, location, _ = get_gcp_project_config()
    client_options = {"api_endpoint": f"{location}-aiplatform.googleapis.com"}
    reasoning_engine_client = ReasoningEngineServiceClient(client_options=client_options)
    parent_path = f"projects/{project_id}/locations/{location}"

    try:
        agent_doc_ref = db.collection("agents").document(agent_doc_id)
        agent_snap = agent_doc_ref.get()
        if not agent_snap.exists:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent document {agent_doc_id} not found in Firestore.")
        agent_data = agent_snap.to_dict()

        expected_config_name = agent_data.get("name")
        expected_vertex_display_name = generate_vertex_deployment_display_name(expected_config_name, agent_doc_id)
        current_stored_resource_name = agent_data.get("vertexAiResourceName")

        logger.info(f"For agent '{agent_doc_id}', expected Vertex display name: '{expected_vertex_display_name}'. "
                    f"Currently stored resource_name in Firestore: '{current_stored_resource_name or 'None'}'.")

        found_engine_proto = None
        identification_method = ""

        if current_stored_resource_name:
            try:
                engine = reasoning_engine_client.get_reasoning_engine(name=current_stored_resource_name)
                if engine.display_name == expected_vertex_display_name:
                    found_engine_proto = engine
                    identification_method = "by stored resource_name"
                    logger.info(f"Successfully fetched engine by stored resource_name: {current_stored_resource_name}")
                else:
                    logger.warning(f"Stored resource_name '{current_stored_resource_name}' for agent '{agent_doc_id}' "
                                   f"has a mismatched display_name on Vertex AI ('{engine.display_name}' vs expected "
                                   f"'{expected_vertex_display_name}'). Will attempt to find by display_name listing.")
            except Exception as e:
                logger.info(f"Failed to get engine by stored resource_name '{current_stored_resource_name}' "
                            f"for agent '{agent_doc_id}'. Error: {e}. Will attempt listing by display_name.")
                if "NotFound" in str(e) or "could not be found" in str(e).lower():
                    agent_doc_ref.update({
                        "vertexAiResourceName": firestore.DELETE_FIELD,
                        "deploymentStatus": "error_resource_vanished",
                        "deploymentError": "Stored Vertex AI resource was not found.",
                        "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
                    })

        if not found_engine_proto:
            logger.info(f"Attempting to find engine for agent '{agent_doc_id}' by listing with "
                        f"display_name filter: 'display_name=\"{expected_vertex_display_name}\"'.")
            list_request = ReasoningEngineServiceClient.list_reasoning_engines_request_type(
                parent=parent_path,
                filter=f'display_name="{expected_vertex_display_name}"'
            )
            engine_list_results = list(reasoning_engine_client.list_reasoning_engines(request=list_request))

            if engine_list_results:
                if len(engine_list_results) > 1:
                    logger.warning(f"Multiple ({len(engine_list_results)}) engines found for display_name '{expected_vertex_display_name}'. "
                                   f"Using the first one: {[e.name for e in engine_list_results]}.")
                found_engine_proto = engine_list_results[0]
                identification_method = "by listing via display_name"
                logger.info(f"Found engine '{found_engine_proto.name}' via display_name listing.")
                if current_stored_resource_name != found_engine_proto.name:
                    agent_doc_ref.update({"vertexAiResourceName": found_engine_proto.name})
                    logger.info(f"Updated Firestore resource_name for '{agent_doc_id}' to '{found_engine_proto.name}'.")
            else:
                logger.info(f"No engine found for agent '{agent_doc_id}' with display_name '{expected_vertex_display_name}' via listing.")

        firestore_update_payload = {"lastStatusCheckAt": firestore.SERVER_TIMESTAMP}
        final_status_to_report_to_client = ""
        vertex_resource_name_for_client = None
        vertex_state_for_client = None

        if found_engine_proto:
            logger.info(f"Engine '{found_engine_proto.name}' (State on Vertex: {found_engine_proto.state.name}) "
                        f"identified for agent '{agent_doc_id}' via {identification_method}.")
            current_engine_vertex_state = found_engine_proto.state
            vertex_resource_name_for_client = found_engine_proto.name
            vertex_state_for_client = current_engine_vertex_state.name
            firestore_update_payload["vertexAiResourceName"] = found_engine_proto.name

            if current_engine_vertex_state == ReasoningEngineProto.State.ACTIVE:
                firestore_update_payload["deploymentStatus"] = "deployed"
                firestore_update_payload["deploymentError"] = firestore.DELETE_FIELD
                engine_update_time_fs = firestore.Timestamp.from_pb(found_engine_proto.update_time) if hasattr(found_engine_proto, 'update_time') and found_engine_proto.update_time else firestore.SERVER_TIMESTAMP
                firestore_update_payload["lastDeployedAt"] = engine_update_time_fs
            elif current_engine_vertex_state == ReasoningEngineProto.State.CREATING or \
                    current_engine_vertex_state == ReasoningEngineProto.State.UPDATING:
                firestore_update_payload["deploymentStatus"] = "deploying_in_progress"
            elif current_engine_vertex_state == ReasoningEngineProto.State.FAILED:
                firestore_update_payload["deploymentStatus"] = "error"
                error_details = "Vertex AI reports engine state: FAILED."
                if hasattr(found_engine_proto, 'latest_failed_operation_error') and found_engine_proto.latest_failed_operation_error:
                    error_details = f"Vertex AI Error: {found_engine_proto.latest_failed_operation_error.message}"
                elif hasattr(found_engine_proto, 'error') and found_engine_proto.error:
                    error_details = f"Vertex AI Error Status: {found_engine_proto.error.message}"
                firestore_update_payload["deploymentError"] = error_details
            else:
                firestore_update_payload["deploymentStatus"] = f"unknown_vertex_state_{current_engine_vertex_state.name.lower()}"
                logger.warning(f"Engine '{found_engine_proto.name}' is in an unhandled state: {current_engine_vertex_state.name}")

            final_status_to_report_to_client = firestore_update_payload["deploymentStatus"]

        else:
            logger.warning(f"Engine for agent '{agent_doc_id}' (expected display_name: '{expected_vertex_display_name}') "
                           "was NOT found on Vertex AI by any method.")
            current_fs_status = agent_data.get("deploymentStatus")
            if current_fs_status in ["deploying_initiated", "deploying_in_progress"]:
                firestore_update_payload["deploymentStatus"] = "error_not_found_after_init"
                firestore_update_payload["deploymentError"] = ("Engine not found on Vertex AI after deployment was initiated. "
                                                               "It may have failed very early, had a display name mismatch, or was deleted externally.")
            elif current_fs_status == "deployed":
                firestore_update_payload["deploymentStatus"] = "error_resource_vanished"
                firestore_update_payload["deploymentError"] = "Previously deployed engine is no longer found on Vertex AI."
            else:
                firestore_update_payload["deploymentStatus"] = "not_found_on_vertex"
            firestore_update_payload["vertexAiResourceName"] = firestore.DELETE_FIELD
            final_status_to_report_to_client = firestore_update_payload["deploymentStatus"]

        agent_doc_ref.update(firestore_update_payload)
        logger.info(f"Agent '{agent_doc_id}' Firestore status updated to: '{final_status_to_report_to_client}' "
                    f"(based on Vertex check).")

        response_payload = {
            "success": True,
            "status": final_status_to_report_to_client,
            "resourceName": vertex_resource_name_for_client,
            "vertexState": vertex_state_for_client
        }
        if not vertex_resource_name_for_client:
            response_payload["message"] = f"Engine with display name '{expected_vertex_display_name}' not found on Vertex AI."

        return response_payload

    except Exception as e:
        tb_str = traceback.format_exc()
        logger.error(f"Error in _check_vertex_agent_deployment_status_logic for agent '{agent_doc_id}': {str(e)}\n{tb_str}")
        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to check agent deployment status: {str(e)[:200]}"
        )

__all__ = [
    '_deploy_agent_to_vertex_logic',
    '_delete_vertex_agent_logic',
    '_query_deployed_agent_logic',
    '_check_vertex_agent_deployment_status_logic'
]  