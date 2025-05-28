# functions/handlers/query_logic.py
import json
import asyncio
import traceback
from datetime import datetime, timedelta, timezone
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
from google.adk.sessions import VertexAiSessionService
from google.cloud.logging_v2.services.logging_service_v2 import LoggingServiceV2Client

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai

logging_client = LoggingServiceV2Client()

def get_reasoning_engine_id_from_name(resource_name: str) -> str | None:
    if not resource_name: return None
    parts = resource_name.split('/')
    if len(parts) == 6 and parts[0] == 'projects' and parts[2] == 'locations' and parts[4] == 'reasoningEngines':
        return parts[5]
    logger.warning(f"Could not parse reasoning_engine_id from resource_name: {resource_name}")
    return None

async def fetch_vertex_logs(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time: datetime):
    if not reasoning_engine_id:
        logger.info("fetch_vertex_logs: reasoning_engine_id is missing, skipping log fetch.")
        return []
    log_errors = []
    try:
        end_time_dt = datetime.now(timezone.utc)
        start_time_dt_aware = start_time if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)
        start_time_str = start_time_dt_aware.isoformat()
        effective_end_time = end_time_dt
        if (end_time_dt - start_time_dt_aware) > timedelta(minutes=5):
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
            log_filter_parts.append(f'jsonPayload.session_id="{adk_session_id}" OR textPayload:"{adk_session_id}"') # More specific session ID filtering
        final_log_filter = " AND ".join(log_filter_parts)
        logger.info(f"Constructed Cloud Logging filter: {final_log_filter}")

        entries_iterator = logging_client.list_log_entries(
            resource_names=[f"projects/{project_id}"],
            filter=final_log_filter,
            order_by="timestamp desc"
        )
        for entry in entries_iterator:
            message = ""
            if entry.text_payload: message = entry.text_payload
            elif entry.json_payload:
                payload_message = entry.json_payload.get('message', entry.json_payload.get('msg'))
                message = payload_message if isinstance(payload_message, str) else json.dumps(entry.json_payload)

            py_datetime = entry.timestamp.ToDatetime(tzinfo=timezone.utc)
            log_errors.append(f"[{entry.severity.name} @ {py_datetime.strftime('%Y-%m-%dT%H:%M:%SZ')}]: {message}"[:1000]) # Limit length
            if len(log_errors) >= 5: break # Limit to 5 recent logs

        logger.info(f"Fetched {len(log_errors)} relevant log entries for engine {reasoning_engine_id}, session {adk_session_id or 'N/A'}.")
    except Exception as e:
        logger.error(f"Error fetching logs from Cloud Logging: {e}\n{traceback.format_exc()}")
        log_errors.append(f"INTERNAL_LOG_FETCH_ERROR: {str(e)}")
    return log_errors

async def _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location):
    query_start_time = datetime.now(timezone.utc)
    current_adk_session_id = None
    query_error_details_from_stream = []

    session_service = VertexAiSessionService(project=project_id, location=location)
    try:
        remote_app = deployed_agent_engines.get(resource_name)
    except Exception as e_get_app:
        logger.error(f"Query Prep: Failed to get remote app '{resource_name}'. Error: {e_get_app}")
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": [f"Failed to access agent: {str(e_get_app)}"]}

    logger.info(f"Query Prep: Retrieved remote app: {remote_app.name}")

    if session_id_from_client:
        try:
            retrieved_session = await session_service.get_session(app_name=resource_name, user_id=adk_user_id, session_id=session_id_from_client)
            if retrieved_session: current_adk_session_id = retrieved_session.id
            else: logger.warning(f"Query Prep: get_session for '{session_id_from_client}' returned None.")
        except Exception as e:
            logger.warning(f"Query Prep: Failed to retrieve session '{session_id_from_client}'. Error: {e}. Will create new.")

    if not current_adk_session_id:
        try:
            new_session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
            current_adk_session_id = new_session.id
            logger.info(f"Query Prep: Created new ADK session: {current_adk_session_id}")
        except Exception as e_create_sess:
            logger.error(f"Query Prep: Failed to create new ADK session. Error: {e_create_sess}")
            return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": [f"Session creation failed: {str(e_create_sess)}"]}

    if not current_adk_session_id: # Should not happen if above logic is correct
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": ["Critical: No ADK session."]}

    logger.info(f"Query Iteration: ADK session '{current_adk_session_id}', user '{adk_user_id}', msg: '{message_text[:50]}...'")
    all_events, final_text_response = [], ""
    event_idx = 0
    try:
        async for event in remote_app.stream_query(message=message_text, user_id=adk_user_id, session_id=current_adk_session_id):
            logger.debug(f"Query Event {event_idx}: type={event.get('type')}")
            all_events.append(event)
            if event.get('type') == 'text_delta' and event.get('content', {}).get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part: final_text_response += part['text']
            event_idx += 1
    except Exception as stream_exception:
        logger.error(f"Query Stream Exception (session {current_adk_session_id}): {stream_exception}\n{traceback.format_exc()}")
        query_error_details_from_stream.append(f"Agent stream error: {str(stream_exception)}")

    logger.info(f"Query Stream Complete (session {current_adk_session_id}): {event_idx} events. Resp len: {len(final_text_response)}")

    fetched_log_errors = []
    reasoning_engine_id_val = get_reasoning_engine_id_from_name(resource_name)
    if reasoning_engine_id_val:
        fetched_log_errors = await fetch_vertex_logs(project_id, location, reasoning_engine_id_val, current_adk_session_id, query_start_time)

        # Fallback for empty response but no explicit errors
    if not final_text_response and not query_error_details_from_stream and not fetched_log_errors and all_events:
        logger.info(f"Query Fallback: No text_delta, checking last events for session {current_adk_session_id}")
        for event in reversed(all_events): # Check last events
            if event.get('content') and event['content'].get('parts'):
                temp_text = "".join(part.get('text', '') for part in event['content']['parts'] if 'text' in part)
                if temp_text:
                    final_text_response = f"(Content from event type '{event.get('type')}'): {temp_text}"
                    logger.info(f"Query Fallback: Found text in event {event.get('type')}: {final_text_response[:100]}...")
                    break


    combined_errors = query_error_details_from_stream + fetched_log_errors
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

    logger.info(f"Query Agent Wrapper: Agent '{resource_name}' by user '{adk_user_id}'.")
    initialize_vertex_ai()
    project_id, location, _ = get_gcp_project_config()
    result_data = {}

    try:
        # Cloud Functions v2 Python runtime supports top-level await,
        # but for broader compatibility and explicit loop management:
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError: # No current event loop
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        if loop.is_running():
            logger.warning("Asyncio loop is already running. This might lead to issues in some environments. Attempting to use existing loop.")
            # This is often problematic. If this happens, ensure the Cloud Function is defined as async if possible,
            # or use nest_asyncio if absolutely necessary and understand its implications.
            # For now, we proceed, but this is a flag.
            result_data = loop.run_until_complete(
                _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location)
            )
        else:
            result_data = loop.run_until_complete(
                _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location)
            )

    except asyncio.TimeoutError: # Should be handled within _query_async_logic_internal or if wrapped with wait_for
        logger.error(f"Query for agent '{resource_name}' timed out.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED, message="Agent query timed out.")
    except Exception as e: # Catch other errors during asyncio execution
        logger.error(f"Error during asyncio execution for query: {e}\n{traceback.format_exc()}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Async execution error: {str(e)}")


    if not result_data: # Should be caught by errors above
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Async query logic did not return data.")

    run_data_to_store = {
        "firebaseUserId": firebase_auth_uid, "adkUserId": adk_user_id,
        "adkSessionId": result_data.get("adkSessionId"), "vertexAiResourceName": resource_name,
        "inputMessage": message_text, "outputEventsRaw": json.dumps(result_data.get("events", [])),
        "finalResponseText": result_data.get("responseText", ""),
        "queryErrorDetails": result_data.get("queryErrorDetails"), "timestamp": firestore.SERVER_TIMESTAMP
    }
    db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data_to_store)
    logger.info(f"Query Agent Wrapper: Run saved for agent '{firestore_agent_id}'.")
    return {"success": True, **result_data}  