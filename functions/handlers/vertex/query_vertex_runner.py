# functions/handlers/vertex/query_vertex_runner.py
import asyncio
import traceback
import time # Ensure time is imported
from firebase_admin import firestore
from common.core import logger
from vertexai.preview.reasoning_engines import ReasoningEngine

def _run_vertex_stream_query_sync(
        remote_app: ReasoningEngine,
        message_text: str,
        adk_user_id: str,
        current_adk_session_id: str,
        run_doc_ref # Firestore document reference
) -> tuple[str, list, bool, int]:
    """
    Synchronously runs the stream_query method on the remote Vertex AI agent
    and writes events directly to a Firestore document.
    """
    accumulated_text_response = ""
    query_errors_from_stream = []
    stream_had_exceptions = False
    event_count = 0
    stream_start_time = time.monotonic()

    logger.info(f"[VertexRunner/Sync] Starting stream_query for Session: {current_adk_session_id}, writing to run doc: {run_doc_ref.id}")

    try:
        for event_idx, event_obj in enumerate(remote_app.stream_query(
                message=message_text,
                user_id=adk_user_id,
                session_id=current_adk_session_id
        )):
            event_count = event_idx + 1
            event_data_dict = {}
            if hasattr(event_obj, 'model_dump') and callable(event_obj.model_dump):
                event_data_dict = event_obj.model_dump()
            elif isinstance(event_obj, dict):
                logger.warn(f"[VertexRunner/Sync] Received a dict instead of a Pydantic model for event {event_count}.")
                event_data_dict = event_obj
            else:
                logger.error(f"[VertexRunner/Sync] Unexpected event type for event {event_count}: {type(event_obj)}. Skipping.")
                run_doc_ref.update({"outputEvents": firestore.ArrayUnion([{"type": "unknown_event_format", "raw": str(event_obj)}])})
                continue

            event_type = event_data_dict.get("type")
            if not event_type or event_type == "unspecified":
                inferred_type = "unknown_part"
                try:
                    content = event_data_dict.get("content")
                    if content and isinstance(content, dict):
                        parts = content.get("parts")
                        if parts and isinstance(parts, list) and len(parts) > 0:
                            first_part = parts[0]
                            if first_part and isinstance(first_part, dict):
                                part_keys = list(first_part.keys())
                                if part_keys:
                                    inferred_type = part_keys[0]
                except Exception as e_infer:
                    logger.warn(f"[VertexRunner/Sync] Could not infer event type for event {event_count}: {e_infer}")
                event_data_dict["type"] = inferred_type

                # Write event to Firestore document
            try:
                # CORRECTED
                run_doc_ref.update({"outputEvents": firestore.ArrayUnion([event_data_dict])})
            except Exception as e_firestore_update:
                logger.error(f"[VertexRunner/Sync] Failed to write event {event_count} to Firestore for run {run_doc_ref.id}: {e_firestore_update}")
                query_errors_from_stream.append(f"Firestore write error for event {event_count}: {str(e_firestore_update)[:150]}")
                stream_had_exceptions = True

            content = event_data_dict.get("content")
            if content and isinstance(content, dict):
                parts = content.get("parts")
                if parts and isinstance(parts, list):
                    for part in parts:
                        if 'text' in part and isinstance(part['text'], str):
                            accumulated_text_response += part['text']

            if event_data_dict.get('error_message'):
                error_msg = f"Error in event stream from Vertex (event {event_count}): {event_data_dict['error_message']}"
                logger.warn(f"[VertexRunner/Sync] {error_msg} for session {current_adk_session_id}")
                query_errors_from_stream.append(error_msg)
                stream_had_exceptions = True

    except Exception as e_stream_query:
        error_msg = f"Exception during remote_app.stream_query for session {current_adk_session_id}: {type(e_stream_query).__name__} - {str(e_stream_query)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        query_errors_from_stream.append(f"Agent stream query error (sync wrapper): {str(e_stream_query)[:200]}")
        stream_had_exceptions = True
    finally:
        stream_duration = time.monotonic() - stream_start_time
        logger.info(f"[VertexRunner/Sync] stream_query finished for Session: {current_adk_session_id}. Events: {event_count}, Duration: {stream_duration:.2f}s, Exceptions: {stream_had_exceptions}")

    return accumulated_text_response, query_errors_from_stream, stream_had_exceptions, event_count

async def run_vertex_stream_query(
        remote_app: ReasoningEngine,
        message_text: str,
        adk_user_id: str,
        current_adk_session_id: str,
        run_doc_ref
) -> tuple[str, list, bool, int]:
    """
    Asynchronously runs the stream_query by dispatching the synchronous call to a thread.
    """
    logger.info(f"[VertexRunner/Async] Dispatching stream_query to thread for Session: {current_adk_session_id}, User: {adk_user_id}.")
    try:
        final_text_response, query_errors, had_exceptions, num_events = await asyncio.to_thread(
            _run_vertex_stream_query_sync,
            remote_app,
            message_text,
            adk_user_id,
            current_adk_session_id,
            run_doc_ref
        )
        logger.debug(f"[VertexRunner/Async] Threaded stream_query for session '{current_adk_session_id}' completed. Events: {num_events}, Exceptions: {had_exceptions}")
        return final_text_response, query_errors, had_exceptions, num_events
    except Exception as e_to_thread:
        error_msg = f"[VertexRunner/Async] Exception from asyncio.to_thread running _run_vertex_stream_query_sync (session {current_adk_session_id}): {type(e_to_thread).__name__} - {str(e_to_thread)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        return "", [f"Async wrapper error for stream_query: {str(e_to_thread)[:200]}"], True, 0


__all__ = ['run_vertex_stream_query']  