# functions/handlers/vertex/task_handler.py
import asyncio
import traceback
from firebase_admin import firestore
from common.core import db, logger

# The main execution logic, which we will now use in the task handler
from .query_orchestrator import _execute_and_stream_to_firestore

async def _run_agent_task_logic(data: dict):
    """
    Handles the background task of running an agent query and streaming results.
    This function is triggered by a Cloud Task.
    """
    run_id = data.get("runId")
    agent_id = data.get("agentId")
    resource_name = data.get("resourceName")
    message_text = data.get("message")
    adk_user_id = data.get("adkUserId")
    session_id_from_client = data.get("sessionId")

    if not all([run_id, agent_id, resource_name, message_text, adk_user_id]):
        logger.error(f"[TaskHandler] Missing required data in task payload for run {run_id} on agent {agent_id}. Payload: {data}")
        return

    logger.info(f"[TaskHandler] Starting agent execution for run_id: {run_id}, agent_id: {agent_id}")
    run_doc_ref = db.collection("agents").document(agent_id).collection("runs").document(run_id)

    try:
        # Mark the run as actively running
        run_doc_ref.update({"status": "running"})

        final_state_data = await _execute_and_stream_to_firestore(
            resource_name=resource_name,
            message_text=message_text,
            adk_user_id=adk_user_id,
            session_id_from_client=session_id_from_client,
            firestore_agent_id=agent_id,
            run_doc_ref=run_doc_ref
        )

        # Update the document with the final state from the executor
        final_update_payload = {
            "status": "error" if final_state_data.get("queryErrorDetails") else "completed",
            "finalResponseText": final_state_data.get("finalResponseText", ""),
            "queryErrorDetails": final_state_data.get("queryErrorDetails"),
            "adkSessionId": final_state_data.get("adkSessionId"), # Ensure session ID is saved
            "completedTimestamp": firestore.SERVER_TIMESTAMP
        }
        run_doc_ref.update(final_update_payload)
        logger.info(f"[TaskHandler] Run {run_id} completed with status: {final_update_payload['status']}")

    except Exception as e:
        error_msg = f"Unhandled exception in task handler for run {run_id}: {type(e).__name__} - {e}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        try:
            run_doc_ref.update({
                "status": "error",
                "queryErrorDetails": firestore.ArrayUnion([f"Task handler exception: {error_msg}"]),
                "completedTimestamp": firestore.SERVER_TIMESTAMP
            })
        except Exception as e_firestore:
            logger.error(f"[TaskHandler] CRITICAL: Failed to write final error state to Firestore for run {run_id}: {e_firestore}")

def run_agent_task_wrapper(data: dict):
    """Synchronous wrapper to run the async task logic."""
    asyncio.run(_run_agent_task_logic(data))

__all__ = ['run_agent_task_wrapper']