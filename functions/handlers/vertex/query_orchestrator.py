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
from common.adk_helpers import get_model_config_from_firestore

# The executor logic is now in the task handler, so we remove the import here.

def query_deployed_agent_orchestrator_logic(req: https_fn.CallableRequest):
    """
    IMMEDIATE RESPONSE: Validates request, creates a placeholder message in Firestore,
    enqueues a Cloud Task, and returns the new messageId.
    """
    data = req.data
    agent_id = data.get("agentId")
    model_id = data.get("modelId")
    message_text = data.get("message")
    adk_user_id = data.get("adkUserId")
    chat_id = data.get("chatId")
    parent_message_id = data.get("parentMessageId") # Can be null
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_firebase_auth_uid"

    if not chat_id or not adk_user_id or not message_text:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="chatId, adkUserId, and message are required.")
    if not agent_id and not model_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Either agentId or modelId must be provided.")

    initialize_vertex_ai()
    project_id, location, _ = get_gcp_project_config()

    # 1. Create the user's message and the placeholder assistant message in a batch
    batch = db.batch()
    chat_ref = db.collection("chats").document(chat_id)
    messages_col_ref = chat_ref.collection("messages")

    # User Message
    user_message_ref = messages_col_ref.document()
    user_message_id = user_message_ref.id
    user_message_data = {
        "id": user_message_id,
        "content": message_text,
        "participant": f"user:{firebase_auth_uid}",
        "parentMessageId": parent_message_id,
        "childMessageIds": [],
        "timestamp": firestore.SERVER_TIMESTAMP,
    }
    batch.set(user_message_ref, user_message_data)

    # Update parent if it exists
    if parent_message_id:
        parent_message_ref = messages_col_ref.document(parent_message_id)
        batch.update(parent_message_ref, {"childMessageIds": firestore.ArrayUnion(user_message_id)})

        # Assistant's placeholder message
    assistant_message_ref = messages_col_ref.document()
    assistant_message_id = assistant_message_ref.id
    participant_id = f"agent:{agent_id}" if agent_id else f"model:{model_id}"
    assistant_message_data = {
        "id": assistant_message_id,
        "content": "",
        "participant": participant_id,
        "parentMessageId": user_message_id,
        "childMessageIds": [],
        "timestamp": firestore.SERVER_TIMESTAMP,
        "run": {
            "status": "pending",
            "inputMessage": message_text,
            "outputEvents": [],
        }
    }
    batch.set(assistant_message_ref, assistant_message_data)

    # Link user message to assistant placeholder
    batch.update(user_message_ref, {"childMessageIds": firestore.ArrayUnion([assistant_message_id])})

    # Update chat's last interacted timestamp
    batch.update(chat_ref, {"lastInteractedAt": firestore.SERVER_TIMESTAMP})

    batch.commit()
    logger.info(f"[Orchestrator] Created placeholder messages for chat {chat_id}. User: {user_message_id}, Assistant: {assistant_message_id}")

    # 2. Enqueue the Cloud Task for background execution
    try:
        tasks_client = tasks_v2.CloudTasksClient()
        queue_path = tasks_client.queue_path(project_id, location, "executeAgentRunTask") # lowercase for queue name

        task_payload = {
            "chatId": chat_id,
            "assistantMessageId": assistant_message_id,
            "agentId": agent_id,
            "modelId": model_id,
            "adkUserId": adk_user_id,
        }

        task = {
            "http_request": {
                "http_method": tasks_v2.HttpMethod.POST,
                "url": f"https://{location}-{project_id}.cloudfunctions.net/executeAgentRunTask",
                "headers": {"Content-type": "application/json"},
                "body": json.dumps({"data": task_payload}).encode(),
            }
        }

        tasks_client.create_task(parent=queue_path, task=task)
        logger.info(f"[Orchestrator] Enqueued task for assistantMessageId: {assistant_message_id}")

    except Exception as e:
        logger.error(f"[Orchestrator] CRITICAL: Failed to enqueue task for message {assistant_message_id}: {e}")
        assistant_message_ref.update({
            "run.status": "error",
            "run.queryErrorDetails": [f"Failed to start agent run (task enqueue error): {e}"]
        })
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to start the agent run.")

        # 3. Immediately return the ID of the assistant's message to the client
    return {"success": True, "assistantMessageId": assistant_message_id}

__all__ = ['query_deployed_agent_orchestrator_logic']