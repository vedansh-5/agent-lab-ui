# functions/handlers/vertex/query_orchestrator.py
import asyncio
import traceback
import json
import os
from datetime import datetime, timezone

from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines # For deployed_agent_engines.get()
from google.adk.sessions import VertexAiSessionService # CORRECT IMPORT for session service

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai # For vertexai.init() only

# Import new modularized components
from .query_utils import get_reasoning_engine_id_from_name
from .query_log_fetcher import fetch_vertex_logs_for_query
from .query_session_manager import ensure_adk_session
from .query_vertex_runner import run_vertex_stream_query
from .query_local_diagnostics import try_local_diagnostic_run

# This function is the main entry point called by the Firebase Function wrapper.
async def _orchestrate_vertex_query(
        resource_name: str,
        message_text: str,
        adk_user_id: str,
        session_id_from_client: str | None,
        firestore_agent_id: str,
        # firebase_auth_uid: str # available via req.auth in the calling wrapper
):
    """
    Orchestrates querying a deployed Vertex AI agent.
    Handles session management, remote query execution, error logging, and local diagnostics.
    """
    query_start_time_utc = datetime.now(timezone.utc)
    logger.info(f"[QueryOrchestrator] Initiating query for Vertex Resource: '{resource_name}', ADK User: '{adk_user_id}', Agent FS ID: '{firestore_agent_id}'.")
    logger.debug(f"[QueryOrchestrator] Message: '{message_text[:100]}...', Client Session ID: '{session_id_from_client or 'None'}'")

    project_id, location, _ = get_gcp_project_config()
    try:
        initialize_vertex_ai() # Ensures vertexai.init() is called if not already
    except Exception as e_init_vertex:
        logger.error(f"[QueryOrchestrator] Failed to initialize Vertex AI SDK: {e_init_vertex}")
        return {
            "events": [], "responseText": "", "adkSessionId": None,
            "queryErrorDetails": [f"Vertex AI SDK initialization failed: {str(e_init_vertex)}"]
        }

        # CORRECT INSTANTIATION of VertexAiSessionService
    session_service = VertexAiSessionService(project=project_id, location=location)
    logger.info(f"[QueryOrchestrator] VertexAiSessionService initialized for project '{project_id}', location '{location}'.")

    # 1. Get or create ADK session
    current_adk_session_id, session_errors = await ensure_adk_session(
        session_service, resource_name, adk_user_id, session_id_from_client
    )
    if not current_adk_session_id:
        logger.error(f"[QueryOrchestrator] Critical session management failure for user '{adk_user_id}'. Errors: {session_errors}")
        return {"events": [], "responseText": "", "adkSessionId": None, "queryErrorDetails": session_errors or ["Session ID could not be established."]}

        # 2. Get the remote DeployedReasoningEngine instance
    try:
        # deployed_agent_engines is the alias for vertexai.agent_engines (or vertexai.preview.reasoning_engines)
        remote_app = deployed_agent_engines.get(resource_name)
        logger.info(f"[QueryOrchestrator] Successfully retrieved remote Vertex AI agent instance: '{remote_app.name}'.")
    except Exception as e_get_remote_app:
        error_msg = f"Failed to get remote Vertex AI agent instance '{resource_name}': {type(e_get_remote_app).__name__} - {str(e_get_remote_app)}"
        logger.error(f"[QueryOrchestrator] {error_msg}\n{traceback.format_exc()}")
        reasoning_engine_id_for_log = get_reasoning_engine_id_from_name(resource_name)
        log_errors = []
        if reasoning_engine_id_for_log:
            log_errors = await fetch_vertex_logs_for_query(project_id, location, reasoning_engine_id_for_log, current_adk_session_id, query_start_time_utc)
        return {"events": [], "responseText": "", "adkSessionId": current_adk_session_id, "queryErrorDetails": [error_msg] + log_errors}

        # 3. Run the stream_query
    all_events, final_text_response, query_errors_from_stream, stream_had_exceptions, num_events = await run_vertex_stream_query(
        remote_app, message_text, adk_user_id, current_adk_session_id
    )
    logger.info(f"[QueryOrchestrator] Remote query completed. Events: {num_events}, Text length: {len(final_text_response)}, Exceptions in stream: {stream_had_exceptions}.")

    # 4. Error handling and diagnostics
    combined_query_errors = list(query_errors_from_stream)

    if stream_had_exceptions or not final_text_response or num_events == 0 :
        logger.warn(f"[QueryOrchestrator] Remote query for session '{current_adk_session_id}' indicates potential issues. Fetching Vertex logs.")
        reasoning_engine_id_val = get_reasoning_engine_id_from_name(resource_name)
        if reasoning_engine_id_val:
            fetched_log_errors = await fetch_vertex_logs_for_query(project_id, location, reasoning_engine_id_val, current_adk_session_id, query_start_time_utc)
            if fetched_log_errors:
                logger.info(f"[QueryOrchestrator] Fetched {len(fetched_log_errors)} Vertex log entries for diagnostic.")
                combined_query_errors.extend(fetched_log_errors)
        else:
            logger.warn(f"[QueryOrchestrator] Could not parse reasoning_engine_id from '{resource_name}'; skipping Vertex log fetch.")

    if not final_text_response and not combined_query_errors and all_events:
        logger.info(f"[QueryOrchestrator] Fallback: No text_delta in stream, checking last events for session {current_adk_session_id}")
        for event_item in reversed(all_events):
            if isinstance(event_item, dict) and event_item.get('content') and event_item['content'].get('parts'):
                temp_text_parts = [part.get('text', '') for part in event_item['content']['parts'] if 'text' in part and isinstance(part['text'], str)]
                temp_text = "".join(temp_text_parts)
                if temp_text:
                    final_text_response = f"(Content from event type '{event_item.get('type', 'unknown')}'): {temp_text}"
                    logger.info(f"[QueryOrchestrator] Fallback: Found text in event type '{event_item.get('type')}': '{final_text_response[:100]}...'")
                    break

    if num_events == 0 and not final_text_response and not combined_query_errors:
        logger.warn(f"[QueryOrchestrator] Critical: Remote query for agent '{firestore_agent_id}' (session {current_adk_session_id}) produced no events, no text, and no errors. Attempting local diagnostic run.")
        local_diag_errors = await try_local_diagnostic_run(
            firestore_agent_id, adk_user_id, message_text, project_id, location
        )
        if local_diag_errors:
            logger.info(f"[QueryOrchestrator] Local diagnostic run for '{firestore_agent_id}' completed with {len(local_diag_errors)} diagnostic messages.")
            combined_query_errors.extend(local_diag_errors)
    elif num_events == 0 and not final_text_response and combined_query_errors:
        logger.warn(f"[QueryOrchestrator] Query for session '{current_adk_session_id}' had errors and yielded no events/text. Errors: {combined_query_errors}")
    elif num_events > 0 and not final_text_response and not combined_query_errors:
        err_msg_no_text = "Agent produced events but no discernible text output. Check agent logic or event structure."
        logger.warn(f"[QueryOrchestrator] {err_msg_no_text} Session: {current_adk_session_id}")
        combined_query_errors.append(err_msg_no_text)

    if not final_text_response and combined_query_errors:
        logger.info(f"[QueryOrchestrator] Query for session {current_adk_session_id} resulted in errors but no text response. Providing errors as primary feedback.")

    response_payload = {
        "events": all_events,
        "responseText": final_text_response,
        "adkSessionId": current_adk_session_id,
        "queryErrorDetails": combined_query_errors if combined_query_errors else None
    }
    logger.info(f"[QueryOrchestrator] Completed query for session '{current_adk_session_id}'. Returning response with {len(all_events)} events, text length {len(final_text_response)}, {len(combined_query_errors or [])} error details.")
    return response_payload

def query_deployed_agent_orchestrator_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId")
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId")
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_firebase_auth_uid"

    required_params = {
        "resourceName": resource_name, "message": message_text,
        "adkUserId": adk_user_id, "agentDocId": firestore_agent_id
    }
    missing_params = [key for key, value in required_params.items() if not value]
    if missing_params:
        error_message = f"Missing required parameters: {', '.join(missing_params)}."
        logger.error(f"[QueryWrapper] Validation Error: {error_message}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_message)

    logger.info(f"[QueryWrapper] Request for Vertex Agent: '{resource_name}', FS ID: '{firestore_agent_id}', ADK User: '{adk_user_id}', Firebase Auth UID: '{firebase_auth_uid}'.")

    initialize_vertex_ai() # Ensures SDK is initialized for things like deployed_agent_engines.get()

    result_data = {}
    try:
        result_data = asyncio.run(
            _orchestrate_vertex_query(
                resource_name, message_text, adk_user_id,
                session_id_from_client, firestore_agent_id
            )
        )
    except asyncio.TimeoutError:
        logger.error(f"[QueryWrapper] Query for agent '{resource_name}' timed out at asyncio.run level.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED, message="Agent query processing timed out.")
    except Exception as e_async_run:
        full_tb_str = traceback.format_exc()
        logger.error(f"[QueryWrapper] Unexpected error during asyncio.run for query to '{resource_name}': {type(e_async_run).__name__} - {str(e_async_run)}\n{full_tb_str}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Async execution error: {str(e_async_run)[:200]}. See function logs for details.")

    if not isinstance(result_data, dict):
        logger.error(f"[QueryWrapper] Internal error: _orchestrate_vertex_query did not return a dictionary. Got: {type(result_data)}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Internal server error processing agent query.")

    serialized_events_for_client = []
    raw_events_from_orchestrator = result_data.get("events", [])
    if raw_events_from_orchestrator:
        for event_obj_or_dict in raw_events_from_orchestrator:
            if hasattr(event_obj_or_dict, 'model_dump_json') and callable(event_obj_or_dict.model_dump_json):
                serialized_events_for_client.append(event_obj_or_dict.model_dump_json())
            elif isinstance(event_obj_or_dict, dict):
                try:
                    serialized_events_for_client.append(json.dumps(event_obj_or_dict))
                except TypeError as e_json:
                    logger.warn(f"[QueryWrapper] Failed to JSON dump an event dict: {e_json}. Storing as string: {str(event_obj_or_dict)[:200]}")
                    serialized_events_for_client.append(str(event_obj_or_dict))
            else:
                serialized_events_for_client.append(str(event_obj_or_dict))

    run_data_to_store_in_firestore = {
        "firebaseUserId": firebase_auth_uid,
        "adkUserId": adk_user_id,
        "adkSessionId": result_data.get("adkSessionId"),
        "vertexAiResourceName": resource_name,
        "inputMessage": message_text,
        "outputEventsRawJsonList": serialized_events_for_client,
        "finalResponseText": result_data.get("responseText", ""),
        "queryErrorDetails": result_data.get("queryErrorDetails"),
        "timestamp": firestore.SERVER_TIMESTAMP
    }

    try:
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data_to_store_in_firestore)
        logger.info(f"[QueryWrapper] Run history saved to Firestore for agent '{firestore_agent_id}', session '{result_data.get('adkSessionId')}'.")
    except Exception as e_firestore_save_run:
        logger.error(f"[QueryWrapper] Failed to save run data to Firestore for agent '{firestore_agent_id}': {type(e_firestore_save_run).__name__} - {str(e_firestore_save_run)}")

    client_response_payload = {
        "success": True,
        "events": serialized_events_for_client,
        "responseText": result_data.get("responseText", ""),
        "adkSessionId": result_data.get("adkSessionId"),
        "queryErrorDetails": result_data.get("queryErrorDetails")
    }
    logger.debug(f"[QueryWrapper] Final payload for client: adkSessionId='{client_response_payload['adkSessionId']}', responseText length={len(client_response_payload['responseText'])}, num_events={len(client_response_payload['events'])}, num_errors={len(client_response_payload['queryErrorDetails'] or [])}")
    return client_response_payload

__all__ = ['query_deployed_agent_orchestrator_logic']