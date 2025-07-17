# functions/handlers/vertex/query_orchestrator.py
import asyncio
import traceback
from datetime import datetime, timezone

from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
from google.adk.sessions import VertexAiSessionService

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai

from .query_utils import get_reasoning_engine_id_from_name
from .query_log_fetcher import fetch_vertex_logs_for_query
from .query_session_manager import ensure_adk_session
from .query_vertex_runner import run_vertex_stream_query
from .query_local_diagnostics import try_local_diagnostic_run


async def _execute_and_stream_to_firestore(
        resource_name: str,
        message_text: str,
        adk_user_id: str,
        session_id_from_client: str | None,
        firestore_agent_id: str,
        run_doc_ref
):
    """
    Orchestrates querying a deployed Vertex AI agent, streaming events to Firestore.
    Handles session management, remote query execution, error logging, and local diagnostics.
    Returns the final state of the query to be written to Firestore.
    """
    query_start_time_utc = datetime.now(timezone.utc)
    logger.info(f"[QueryExecutor] Initiating query for Vertex Resource: '{resource_name}', writing to run doc: {run_doc_ref.id}.")

    project_id, location, _ = get_gcp_project_config()
    session_service = VertexAiSessionService(project=project_id, location=location)

    # 1. Get or create ADK session
    current_adk_session_id, session_errors = await ensure_adk_session(
        session_service, resource_name, adk_user_id, session_id_from_client
    )

    if current_adk_session_id:
        run_doc_ref.update({"adkSessionId": current_adk_session_id})

    if not current_adk_session_id:
        logger.error(f"[QueryExecutor] Critical session management failure for user '{adk_user_id}'. Errors: {session_errors}")
        return {"finalResponseText": "", "adkSessionId": None, "queryErrorDetails": session_errors or ["Session ID could not be established."]}

        # 2. Get the remote DeployedReasoningEngine instance
    remote_app = None
    try:
        remote_app = deployed_agent_engines.get(resource_name)
        logger.info(f"[QueryExecutor] Successfully retrieved remote Vertex AI agent instance: '{remote_app.name}'.")
    except Exception as e_get_remote_app:
        error_msg = f"Failed to get remote Vertex AI agent instance '{resource_name}': {type(e_get_remote_app).__name__} - {str(e_get_remote_app)}"
        logger.error(f"[QueryExecutor] {error_msg}\n{traceback.format_exc()}")
        reasoning_engine_id_for_log = get_reasoning_engine_id_from_name(resource_name)
        log_errors = []
        if reasoning_engine_id_for_log:
            log_errors = await fetch_vertex_logs_for_query(project_id, location, reasoning_engine_id_for_log, current_adk_session_id, query_start_time_utc)
        return {"finalResponseText": "", "adkSessionId": current_adk_session_id, "queryErrorDetails": [error_msg] + log_errors}

        # 3. Run the stream_query, which now writes to Firestore via run_doc_ref
    final_text_response, query_errors_from_stream, stream_had_exceptions, num_events = await run_vertex_stream_query(
        remote_app, message_text, adk_user_id, current_adk_session_id, run_doc_ref
    )
    logger.info(f"[QueryExecutor] Remote query completed. Events streamed: {num_events}, Text length: {len(final_text_response)}, Exceptions: {stream_had_exceptions}.")

    # 4. Error handling and diagnostics
    combined_query_errors = list(query_errors_from_stream)

    if stream_had_exceptions or not final_text_response or num_events == 0:
        logger.warn(f"[QueryExecutor] Remote query for run '{run_doc_ref.id}' indicates potential issues. Fetching Vertex logs.")
        reasoning_engine_id_val = get_reasoning_engine_id_from_name(resource_name)
        if reasoning_engine_id_val:
            fetched_log_errors = await fetch_vertex_logs_for_query(project_id, location, reasoning_engine_id_val, current_adk_session_id, query_start_time_utc)
            if fetched_log_errors:
                logger.info(f"[QueryExecutor] Fetched {len(fetched_log_errors)} Vertex log entries for diagnostic.")
                combined_query_errors.extend(fetched_log_errors)
        else:
            logger.warn(f"[QueryExecutor] Could not parse reasoning_engine_id from '{resource_name}'; skipping Vertex log fetch.")

    if num_events == 0 and not final_text_response and not combined_query_errors:
        logger.warn(f"[QueryExecutor] Critical: Remote query for run '{run_doc_ref.id}' produced no events, no text, and no errors. Attempting local diagnostic run.")
        local_diag_errors = await try_local_diagnostic_run(
            firestore_agent_id, adk_user_id, message_text, project_id, location
        )
        if local_diag_errors:
            logger.info(f"[QueryExecutor] Local diagnostic run for '{firestore_agent_id}' completed with {len(local_diag_errors)} diagnostic messages.")
            combined_query_errors.extend(local_diag_errors)

    if num_events > 0 and not final_text_response and not combined_query_errors:
        err_msg_no_text = "Agent produced events but no discernible text output. Check agent logic or event structure."
        logger.warn(f"[QueryExecutor] {err_msg_no_text} Run: {run_doc_ref.id}")
        combined_query_errors.append(err_msg_no_text)

        # 5. Return the final state.
    response_payload = {
        "finalResponseText": final_text_response,
        "adkSessionId": current_adk_session_id,
        "queryErrorDetails": combined_query_errors if combined_query_errors else None
    }
    logger.info(f"[QueryExecutor] Completed query for run '{run_doc_ref.id}'. Returning final state.")
    return response_payload


def query_deployed_agent_orchestrator_logic(req: https_fn.CallableRequest):
    """
    Synchronous wrapper that initiates an agent query, creates a run document in Firestore,
    and returns the run ID to the client. The query execution and Firestore updates
    happen within this function's lifecycle.
    """
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
        logger.error(f"[QueryOrchestrator] Validation Error: {error_message}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_message)

    logger.info(f"[QueryOrchestrator] Request for Vertex Agent: '{resource_name}', FS ID: '{firestore_agent_id}', ADK User: '{adk_user_id}'.")
    initialize_vertex_ai()

    run_doc_ref = db.collection("agents").document(firestore_agent_id).collection("runs").document()
    run_id = run_doc_ref.id

    initial_run_data = {
        "id": run_id,
        "status": "initiated",
        "firebaseUserId": firebase_auth_uid,
        "adkUserId": adk_user_id,
        "vertexAiResourceName": resource_name,
        "inputMessage": message_text,
        "events": [],
        "startTimestamp": firestore.SERVER_TIMESTAMP,
        "timestamp": firestore.SERVER_TIMESTAMP,
        "clientProvidedSessionId": session_id_from_client
    }

    try:
        run_doc_ref.set(initial_run_data)
        logger.info(f"[QueryOrchestrator] Created initial run document: {run_id}")
        run_doc_ref.update({"status": "running"})
    except Exception as e_firestore_set:
        logger.error(f"[QueryOrchestrator] CRITICAL: Failed to create initial run document for agent '{firestore_agent_id}': {e_firestore_set}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to initiate agent run in database.")

    final_state_data = {}
    try:
        final_state_data = asyncio.run(
            _execute_and_stream_to_firestore(
                resource_name, message_text, adk_user_id,
                session_id_from_client, firestore_agent_id, run_doc_ref
            )
        )
    except Exception as e_async_run:
        full_tb_str = traceback.format_exc()
        logger.error(f"[QueryOrchestrator] Unhandled error during asyncio.run for run '{run_id}': {type(e_async_run).__name__} - {str(e_async_run)}\n{full_tb_str}")
        final_state_data = {
            "finalResponseText": "",
            "queryErrorDetails": [f"Orchestrator execution error: {str(e_async_run)[:200]}"]
        }

    final_update_payload = {
        "status": "error" if final_state_data.get("queryErrorDetails") else "completed",
        "finalResponseText": final_state_data.get("finalResponseText", ""),
        "queryErrorDetails": final_state_data.get("queryErrorDetails"),
        "adkSessionId": final_state_data.get("adkSessionId"),
        "completedTimestamp": firestore.SERVER_TIMESTAMP
    }

    try:
        run_doc_ref.update(final_update_payload)
        logger.info(f"[QueryOrchestrator] Final state written to run document '{run_id}'. Status: {final_update_payload['status']}.")
    except Exception as e_firestore_update:
        logger.error(f"[QueryOrchestrator] Failed to write final update to run doc '{run_id}': {e_firestore_update}")

    client_response_payload = {
        "success": True,
        "runId": run_id,
        "adkSessionId": final_state_data.get("adkSessionId"),
        "responseText": final_state_data.get("finalResponseText", ""),
        "queryErrorDetails": final_state_data.get("queryErrorDetails")
    }

    logger.debug(f"[QueryOrchestrator] Final payload for client: runId='{run_id}', adkSessionId='{client_response_payload['adkSessionId']}'")
    return client_response_payload


__all__ = ['query_deployed_agent_orchestrator_logic']  