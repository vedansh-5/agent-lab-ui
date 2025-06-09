# functions/handlers/vertex/query_logic.py
import json
import asyncio
import traceback
import os # Make sure os is imported
from datetime import datetime, timedelta, timezone
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines

# ADK imports
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService, VertexAiSessionService
from google.adk.artifacts import InMemoryArtifactService
from google.adk.memory import InMemoryMemoryService
from google.genai.types import Content, Part


from google.cloud.logging_v2.services.logging_service_v2 import LoggingServiceV2Client

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import instantiate_adk_agent_from_config

logging_client = LoggingServiceV2Client()

def get_reasoning_engine_id_from_name(resource_name: str) -> str | None:
    if not resource_name: return None
    parts = resource_name.split('/')
    if len(parts) == 6 and parts[0] == 'projects' and parts[2] == 'locations' and parts[4] == 'reasoningEngines':
        return parts[5]
    logger.warn(f"Could not parse reasoning_engine_id from resource_name: {resource_name}")
    return None

def _fetch_vertex_logs_sync(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time_dt_aware: datetime):
    log_errors_thread = []
    try:
        end_time_dt_ideal = start_time_dt_aware + timedelta(minutes=5)
        end_time_dt_actual = min(datetime.now(timezone.utc), end_time_dt_ideal)

        log_filter_parts = [
            f'resource.type="aiplatform.googleapis.com/ReasoningEngine"',
            f'resource.labels.reasoning_engine_id="{reasoning_engine_id}"',
            f'resource.labels.location="{location}"',
            f'severity>="WARNING"',
            f'timestamp >= "{start_time_dt_aware.isoformat()}"',
            f'timestamp <= "{end_time_dt_actual.isoformat()}"'
        ]
        if adk_session_id:
            log_filter_parts.append(f'(jsonPayload.session_id="{adk_session_id}" OR jsonPayload.adk_session_id="{adk_session_id}" OR textPayload:"{adk_session_id}")')

        final_log_filter = " AND ".join(log_filter_parts)

        log_request = {
            "resource_names": [f"projects/{project_id}"],
            "filter": final_log_filter,
            "order_by": "timestamp desc",
            "page_size": 10 # Fetch a limited number of recent warning/error logs
        }
        entries_iterator = logging_client.list_log_entries(request=log_request)

        for entry in entries_iterator:
            message = ""
            if entry.text_payload: message = entry.text_payload
            elif entry.json_payload:
                payload_message = entry.json_payload.get('message', entry.json_payload.get('msg', str(entry.json_payload)))
                message = payload_message if isinstance(payload_message, str) else json.dumps(payload_message)
            py_datetime = entry.timestamp.replace(tzinfo=timezone.utc)
            log_errors_thread.append(f"[{entry.severity.name} @ {py_datetime.strftime('%Y-%m-%dT%H:%M:%SZ')}]: {message}"[:1000]) # Limit length
            if len(log_errors_thread) >= 5: break # Limit to 5 log entries
    except Exception as e_thread:
        log_errors_thread.append(f"INTERNAL_LOG_FETCH_ERROR (thread): {str(e_thread)}")
    return log_errors_thread

async def fetch_vertex_logs(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time_dt: datetime):
    if not reasoning_engine_id:
        logger.info("fetch_vertex_logs: reasoning_engine_id is missing, skipping log fetch.")
        return []
    start_time_dt_aware = start_time_dt if start_time_dt.tzinfo else start_time_dt.replace(tzinfo=timezone.utc)
    logger.info(f"Dispatching synchronous log fetch to thread for engine {reasoning_engine_id}, session {adk_session_id or 'N/A'}.")
    try:
        log_errors = await asyncio.to_thread(
            _fetch_vertex_logs_sync, project_id, location, reasoning_engine_id, adk_session_id, start_time_dt_aware
        )
        logger.info(f"Async wrapper: Received {len(log_errors)} log entries from thread.")
        return log_errors
    except Exception as e_async_wrapper:
        logger.error(f"Async wrapper: Error calling _fetch_vertex_logs_sync via to_thread: {e_async_wrapper}")
        return [f"INTERNAL_ASYNC_LOG_FETCH_ERROR: {str(e_async_wrapper)}"]


def _iterate_stream_query_sync(remote_app, message_text, adk_user_id, current_adk_session_id):
    all_events_thread = []
    final_text_response_thread = ""
    query_error_details_thread = []
    stream_had_exceptions_thread = False
    event_idx_thread = 0
    try:
        for event in remote_app.stream_query(message=message_text, user_id=adk_user_id, session_id=current_adk_session_id):
            all_events_thread.append(event)
            if event.get('type') == 'text_delta' and event.get('content', {}).get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part: final_text_response_thread += part['text']
            if event.get('error_message'):
                error_msg = f"Error in event stream (thread): {event['error_message']}"
                query_error_details_thread.append(error_msg)
                stream_had_exceptions_thread = True
            event_idx_thread += 1
    except Exception as e_thread:
        query_error_details_thread.append(f"Agent stream error (thread): {str(e_thread)}\n{traceback.format_exc()}")
        stream_had_exceptions_thread = True
    return all_events_thread, final_text_response_thread, query_error_details_thread, stream_had_exceptions_thread, event_idx_thread


async def _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location, firestore_agent_id):
    query_start_time_utc = datetime.now(timezone.utc)
    current_adk_session_id = None
    local_diagnostic_errors = []
    agent_config_data = None # Initialize for potential use in local diagnostic error message

    session_service = VertexAiSessionService(project=project_id, location=location)
    try:
        remote_app = deployed_agent_engines.get(resource_name)
    except Exception as e_get_app:
        logger.error(f"Query Prep: Failed to get remote app '{resource_name}'. Error: {e_get_app}")
        reasoning_engine_id_val_fallback = get_reasoning_engine_id_from_name(resource_name)
        log_errors_fallback = []
        if reasoning_engine_id_val_fallback:
            log_errors_fallback = await fetch_vertex_logs(project_id, location, reasoning_engine_id_val_fallback, None, query_start_time_utc)
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": [f"Failed to access agent: {str(e_get_app)}"] + log_errors_fallback}

    logger.info(f"Query Prep: Retrieved remote app: {remote_app.name}")

    if session_id_from_client:
        try:
            retrieved_session = await session_service.get_session(app_name=resource_name, user_id=adk_user_id, session_id=session_id_from_client)
            if retrieved_session: current_adk_session_id = retrieved_session.id
            else: logger.warn(f"Query Prep: get_session for '{session_id_from_client}' returned None.")
        except Exception as e:
            logger.warn(f"Query Prep: Failed to retrieve session '{session_id_from_client}'. Error: {e}. Will create new.")
    if not current_adk_session_id:
        try:
            new_session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
            current_adk_session_id = new_session.id
            logger.info(f"Query Prep: Created new ADK session: {current_adk_session_id}")
        except Exception as e_create_sess:
            logger.error(f"Query Prep: Failed to create new ADK session. Error: {e_create_sess}")
            return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": [f"Session creation failed: {str(e_create_sess)}"]}
    if not current_adk_session_id:
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": ["Critical: No ADK session."]}

    logger.info(f"Query Iteration: Dispatching stream_query to thread for ADK session '{current_adk_session_id}', user '{adk_user_id}', msg: '{message_text[:50]}...'")

    try:
        all_events, final_text_response, query_error_details_from_stream, stream_had_exceptions, event_idx = await asyncio.to_thread(
            _iterate_stream_query_sync,
            remote_app,
            message_text,
            adk_user_id,
            current_adk_session_id
        )
        logger.debug(f"Threaded query for session '{current_adk_session_id}' completed. Events: {event_idx}, Exceptions: {stream_had_exceptions}")
    except Exception as e_to_thread:
        logger.error(f"Exception from asyncio.to_thread running _iterate_stream_query_sync (session {current_adk_session_id}): {e_to_thread}\n{traceback.format_exc()}")
        query_error_details_from_stream = [f"Async wrapper error for stream_query: {str(e_to_thread)}"]
        stream_had_exceptions = True
        all_events, final_text_response, event_idx = [], "", 0

    logger.info(f"Query Stream Complete (session {current_adk_session_id}): {event_idx} events. Resp len: {len(final_text_response)}. Stream exceptions: {stream_had_exceptions}")

    fetched_log_errors = []
    if stream_had_exceptions or not final_text_response or not all_events:
        reasoning_engine_id_val = get_reasoning_engine_id_from_name(resource_name)
        if reasoning_engine_id_val:
            fetched_log_errors = await fetch_vertex_logs(project_id, location, reasoning_engine_id_val, current_adk_session_id, query_start_time_utc)
        else:
            logger.warn("Could not determine reasoning_engine_id; skipping Vertex log fetch.")

    if not final_text_response and not query_error_details_from_stream and not fetched_log_errors and all_events:
        logger.info(f"Query Fallback: No text_delta, checking last events for session {current_adk_session_id}")
        for event_item in reversed(all_events):
            if event_item.get('content') and event_item['content'].get('parts'):
                temp_text = "".join(part.get('text', '') for part in event_item['content']['parts'] if 'text' in part)
                if temp_text:
                    final_text_response = f"(Content from event type '{event_item.get('type')}'): {temp_text}"
                    logger.info(f"Query Fallback: Found text in event {event_item.get('type')}: {final_text_response[:100]}...")
                    break

    combined_errors = query_error_details_from_stream + fetched_log_errors

    # ***** START OF LOCAL DIAGNOSTIC RUN BLOCK *****
    if not all_events and not final_text_response and not combined_errors:
        logger.warn(f"Remote query for agent '{firestore_agent_id}' (session {current_adk_session_id}) resulted in no events, no response, and no errors. Attempting local diagnostic run.")

        # Store original environment variables that might be relevant to LiteLLM or ADK
        original_env_vars = {
            key: os.environ.get(key) for key in [
                "GOOGLE_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", # Common LiteLLM keys
                "GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION" # For some LiteLLM Vertex integrations
            ]
        }

        try:
            logger.info("Local Diagnostic: Environment setup for LiteLLM based run.")
            # For local diagnostic, API keys needed by LiteLLM (e.g. GOOGLE_API_KEY for google/* models)
            # must be available in the Firebase Function's environment.
            # We don't typically modify them here unless we are overriding for specific test.
            # Ensure GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION are set if this function
            # might be calling a LiteLLM provider that uses them (e.g. vertex_ai/*).
            # This diagnostic runs *within the Firebase Function's environment*.
            if project_id and "GOOGLE_CLOUD_PROJECT" not in os.environ:
                os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
                logger.info(f"Local Diagnostic: Temporarily set GOOGLE_CLOUD_PROJECT to {project_id}")
            if location and "GOOGLE_CLOUD_LOCATION" not in os.environ:
                os.environ["GOOGLE_CLOUD_LOCATION"] = location
                logger.info(f"Local Diagnostic: Temporarily set GOOGLE_CLOUD_LOCATION to {location}")


            agent_doc_ref = db.collection("agents").document(firestore_agent_id)
            agent_snap = agent_doc_ref.get()
            if not agent_snap.exists:
                local_diagnostic_errors.append(f"Local Diagnostic: Agent config document '{firestore_agent_id}' not found in Firestore.")
            else:
                agent_config_data = agent_snap.to_dict()
                if not agent_config_data:
                    local_diagnostic_errors.append(f"Local Diagnostic: Agent config data for '{firestore_agent_id}' is empty.")
                else:
                    logger.info(f"Local Diagnostic: Instantiating agent '{agent_config_data.get('name', 'N/A')}' (config ID: {firestore_agent_id}) for local error check.")
                    # instantiate_adk_agent_from_config now always uses LiteLlm internally
                    local_adk_agent = instantiate_adk_agent_from_config(agent_config_data, parent_adk_name_for_context=f"local_diag_{firestore_agent_id[:4]}")

                    local_session_service = InMemorySessionService()
                    local_artifact_service = InMemoryArtifactService()
                    local_memory_service = InMemoryMemoryService()

                    local_runner = Runner(
                        agent=local_adk_agent,
                        app_name=agent_config_data.get('name', f"local_diag_app_{firestore_agent_id[:4]}"),
                        session_service=local_session_service,
                        artifact_service=local_artifact_service,
                        memory_service=local_memory_service
                    )

                    local_session = await local_session_service.create_session(
                        app_name=local_runner.app_name,
                        user_id=adk_user_id,
                    )

                    local_message_content = Content(role="user", parts=[Part(text=message_text)])

                    logger.info(f"Local Diagnostic: Running agent '{local_adk_agent.name}' locally for session '{local_session.id}'.")
                    local_events_count = 0
                    async for _event in local_runner.run_async(user_id=adk_user_id, session_id=local_session.id, new_message=local_message_content):
                        local_events_count +=1
                    logger.info(f"Local Diagnostic: Local run completed with {local_events_count} events without raising an exception.")
                    local_diagnostic_errors.append("Local Diagnostic: Agent ran locally without raising an exception. Issue might be specific to remote environment/services or a non-ADK Python error during remote execution not caught by stream_query.")

        except Exception as e_local_diag:
            logger.error(f"Local Diagnostic: Error during local agent run for '{firestore_agent_id}': {e_local_diag}", exc_info=True)
            tb_str = traceback.format_exc()
            diag_agent_name_for_error = agent_config_data.get('name', firestore_agent_id) if agent_config_data else firestore_agent_id
            local_diagnostic_errors.append(f"LOCAL DIAGNOSTIC ERROR for agent '{diag_agent_name_for_error}':\n{type(e_local_diag).__name__}: {str(e_local_diag)}\nTraceback:\n{tb_str}")
        finally: # Restore environment
            logger.info("Local Diagnostic: Restoring original environment variables.")
            for key, value in original_env_vars.items():
                if value is None:
                    if key in os.environ:
                        del os.environ[key]
                        logger.info(f"Local Diagnostic: Cleared env var {key}")
                else:
                    os.environ[key] = value
                    logger.info(f"Local Diagnostic: Restored env var {key}")
            logger.info("Local Diagnostic: Original environment variables restored.")

        if local_diagnostic_errors:
            combined_errors.extend(local_diagnostic_errors)
            # ***** END OF LOCAL DIAGNOSTIC RUN BLOCK *****

    if not combined_errors and not final_text_response and not all_events:
        combined_errors.append("Agent produced no events and no text response. Check Vertex logs for deployment or runtime issues. Local diagnostic run did not surface ADK-level errors.")
        logger.warn(f"Query for session {current_adk_session_id} resulted in no events and no text response, even after local diagnostic.")

    return {
        "events": all_events, "responseText": final_text_response,
        "adkSessionId": current_adk_session_id,
        "queryErrorDetails": combined_errors if combined_errors else None
    }


def _query_deployed_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId")
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId")
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_auth_uid"

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="resourceName, message, adkUserId, and agentDocId are required.")

    logger.info(f"Query Agent Wrapper: Agent '{resource_name}' (FS ID: {firestore_agent_id}) by adk_user '{adk_user_id}', firebase_auth_uid '{firebase_auth_uid}'.")
    initialize_vertex_ai() # Still needed for VertexAiSessionService, and reasoning_engine.get()
    project_id, location, _ = get_gcp_project_config()
    result_data = {}

    try:
        result_data = asyncio.run(
            _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location, firestore_agent_id)
        )
    except asyncio.TimeoutError:
        logger.error(f"Query for agent '{resource_name}' timed out during asyncio.run.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED, message="Agent query timed out.")
    except Exception as e:
        logger.error(f"Error during asyncio.run for query: {e}\n{traceback.format_exc()}")
        detailed_traceback = traceback.format_exc()
        logger.error(f"Full traceback for asyncio.run error: \n{detailed_traceback}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Async execution error: {str(e)}. See function logs for details.")

    if not result_data:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Async query logic did not return data unexpectedly.")

    serialized_events = []
    if result_data.get("events"):
        for event_obj in result_data["events"]:
            if hasattr(event_obj, 'model_dump_json'):
                serialized_events.append(event_obj.model_dump_json())
            elif isinstance(event_obj, dict):
                serialized_events.append(json.dumps(event_obj))
            else:
                serialized_events.append(str(event_obj))

    run_data_to_store = {
        "firebaseUserId": firebase_auth_uid, "adkUserId": adk_user_id,
        "adkSessionId": result_data.get("adkSessionId"), "vertexAiResourceName": resource_name,
        "inputMessage": message_text,
        "outputEventsRaw": json.dumps(serialized_events),
        "finalResponseText": result_data.get("responseText", ""),
        "queryErrorDetails": result_data.get("queryErrorDetails"),
        "timestamp": firestore.SERVER_TIMESTAMP
    }
    try:
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data_to_store)
        logger.info(f"Query Agent Wrapper: Run saved for agent '{firestore_agent_id}'.")
    except Exception as e_firestore_run:
        logger.error(f"Failed to save run data to Firestore for agent '{firestore_agent_id}': {e_firestore_run}")

    return {"success": True, **result_data}  