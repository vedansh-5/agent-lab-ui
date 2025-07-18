# functions/handlers/vertex/query_orchestrator.py
import traceback
import json
from datetime import datetime, timezone
from google.cloud import tasks_v2

from firebase_admin import firestore
from firebase_functions import https_fn

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai

# Keep the executor function here, as it's now imported by the new task handler
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
    This function remains but is now called by the background task handler.
    """
    query_start_time_utc = datetime.now(timezone.utc)
    logger.info(f"[QueryExecutor] Initiating query for Vertex Resource: '{resource_name}', writing to run doc: {run_doc_ref.id}.")

    project_id, location, _ = get_gcp_project_config()
    # This now needs to be imported here for session management inside the task
    from vertexai.preview.reasoning_engines import ReasoningEngine
    from vertexai.agent_engines import get as get_engine
    from google.adk.sessions import VertexAiSessionService

    session_service = VertexAiSessionService(project=project_id, location=location)

    current_adk_session_id, session_errors = await ensure_adk_session(
        session_service, resource_name, adk_user_id, session_id_from_client
    )

    if current_adk_session_id:
        run_doc_ref.update({"adkSessionId": current_adk_session_id})

    if not current_adk_session_id:
        logger.error(f"[QueryExecutor] Critical session failure for user '{adk_user_id}'. Errors: {session_errors}")
        return {"finalResponseText": "", "adkSessionId": None, "queryErrorDetails": session_errors or ["Session ID could not be established."]}

    remote_app = None
    try:
        remote_app = get_engine(resource_name)
        logger.info(f"[QueryExecutor] Successfully retrieved remote agent instance: '{remote_app.name}'.")
    except Exception as e_get_remote_app:
        error_msg = f"Failed to get remote agent instance '{resource_name}': {e_get_remote_app}"
        logger.error(f"[QueryExecutor] {error_msg}\n{traceback.format_exc()}")
        # ... (error handling logic remains the same)
        return {"finalResponseText": "", "adkSessionId": current_adk_session_id, "queryErrorDetails": [error_msg]}


    final_text_response, query_errors_from_stream, stream_had_exceptions, num_events = await run_vertex_stream_query(
        remote_app, message_text, adk_user_id, current_adk_session_id, run_doc_ref
    )

    # ... (rest of the error handling and diagnostic logic remains the same)
    combined_query_errors = list(query_errors_from_stream)
    if stream_had_exceptions or not final_text_response or num_events == 0:
        reasoning_engine_id_val = get_reasoning_engine_id_from_name(resource_name)
        if reasoning_engine_id_val:
            fetched_log_errors = await fetch_vertex_logs_for_query(project_id, location, reasoning_engine_id_val, current_adk_session_id, query_start_time_utc)
            combined_query_errors.extend(fetched_log_errors)

    if num_events == 0 and not final_text_response and not combined_query_errors:
        local_diag_errors = await try_local_diagnostic_run(firestore_agent_id, adk_user_id, message_text, project_id, location)
        combined_query_errors.extend(local_diag_errors)

    response_payload = {
        "finalResponseText": final_text_response,
        "adkSessionId": current_adk_session_id,
        "queryErrorDetails": combined_query_errors if combined_query_errors else None
    }
    return response_payload


def query_deployed_agent_orchestrator_logic(req: https_fn.CallableRequest):
    """
    IMMEDIATE RESPONSE: Validates the request, creates a run document,
    enqueues a Cloud Task for background processing, and returns the runId.
    """
    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId")
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId")
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_firebase_auth_uid"

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Missing required parameters.")

    initialize_vertex_ai()
    project_id, location, _ = get_gcp_project_config()

    # 1. Create the initial Firestore document
    run_doc_ref = db.collection("agents").document(firestore_agent_id).collection("runs").document()
    run_id = run_doc_ref.id
    initial_run_data = {
        "id": run_id,
        "status": "pending",
        "firebaseUserId": firebase_auth_uid,
        "adkUserId": adk_user_id,
        "vertexAiResourceName": resource_name,
        "inputMessage": message_text,
        "outputEvents": [],
        "timestamp": firestore.SERVER_TIMESTAMP,
        "clientProvidedSessionId": session_id_from_client
    }
    run_doc_ref.set(initial_run_data)
    logger.info(f"[Orchestrator] Created 'pending' run document: {run_id}")

    # 2. Enqueue the Cloud Task for background execution
    try:
        tasks_client = tasks_v2.CloudTasksClient()
        # The queue name must match the one defined in the task handler function in main.py
        queue_path = tasks_client.queue_path(project_id, location, "executeAgentRunTask")

        task_payload = {
            "runId": run_id,
            "agentId": firestore_agent_id,
            "resourceName": resource_name,
            "message": message_text,
            "adkUserId": adk_user_id,
            "sessionId": session_id_from_client,
        }

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                # The URL points to the new function name, which must be valid.
                "url": f"https://{location}-{project_id}.cloudfunctions.net/executeAgentRunTask",
                "headers": {"Content-type": "application/json"},
                "body": json.dumps({"data": task_payload}).encode(),
            }
        }

        tasks_client.create_task(parent=queue_path, task=task)
        logger.info(f"[Orchestrator] Enqueued task for run_id: {run_id}")

    except Exception as e:
        logger.error(f"[Orchestrator] CRITICAL: Failed to enqueue task for run {run_id}: {e}")
        run_doc_ref.update({
            "status": "error",
            "queryErrorDetails": [f"Failed to start agent run (task enqueue error): {e}"]
        })
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to start the agent run.")

        # 3. Immediately return the runId to the client
    return {"success": True, "runId": run_id, "adkSessionId": None}

__all__ = ['query_deployed_agent_orchestrator_logic', '_execute_and_stream_to_firestore']