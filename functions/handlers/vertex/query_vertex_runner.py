# functions/handlers/vertex/query_vertex_runner.py
import asyncio
import traceback
import time # Ensure time is imported
from common.core import logger
from vertexai import agent_engines as deployed_agent_engines # Keep this import
# Corrected import and type hint:
# The class for a deployed engine instance is typically ReasoningEngine within this module
from vertexai.preview.reasoning_engines import ReasoningEngine

def _run_vertex_stream_query_sync(
        remote_app: ReasoningEngine, # Corrected type hint
        message_text: str,
        adk_user_id: str,
        current_adk_session_id: str
) -> tuple[list, str, list, bool, int]:
    """
    Synchronously runs the stream_query method on the remote Vertex AI agent.
    This function is intended to be run in a separate thread.
    """
    all_events_from_stream = []
    accumulated_text_response = ""
    query_errors_from_stream = []
    stream_had_exceptions = False
    event_count = 0
    stream_start_time = time.monotonic()

    logger.info(f"[VertexRunner/Sync] Starting stream_query for Session: {current_adk_session_id}, User: {adk_user_id}, Msg: '{message_text[:70]}...'")

    try:
        # The stream_query is an iterable
        for event_idx, event_data in enumerate(remote_app.stream_query(
                message=message_text,
                user_id=adk_user_id,
                session_id=current_adk_session_id
        )):
            event_count = event_idx + 1
            logger.debug(f"[VertexRunner/Sync] Received event {event_count} for session {current_adk_session_id}: {str(event_data)[:200]}...") # Log truncated event
            all_events_from_stream.append(event_data) # Store the raw event data

            # Accumulate text from 'text_delta' type events
            if isinstance(event_data, dict): # ADK events are typically dicts when streamed
                if event_data.get('type') == 'text_delta' and \
                        event_data.get('content', {}).get('parts'):
                    for part in event_data['content']['parts']:
                        if 'text' in part and isinstance(part['text'], str):
                            accumulated_text_response += part['text']
                            # Check for error messages within the event stream itself
                if event_data.get('error_message'):
                    error_msg = f"Error in event stream from Vertex (event {event_count}): {event_data['error_message']}"
                    logger.warn(f"[VertexRunner/Sync] {error_msg} for session {current_adk_session_id}")
                    query_errors_from_stream.append(error_msg)
                    stream_had_exceptions = True # Mark that an error occurred within the stream
            else: # Should not happen with ADK events
                logger.warn(f"[VertexRunner/Sync] Received non-dict event {event_count} for session {current_adk_session_id}: {type(event_data)}")


    except Exception as e_stream_query:
        error_msg = f"Exception during remote_app.stream_query for session {current_adk_session_id}: {type(e_stream_query).__name__} - {str(e_stream_query)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        query_errors_from_stream.append(f"Agent stream query error (sync wrapper): {str(e_stream_query)[:200]}")
        stream_had_exceptions = True
    finally:
        stream_duration = time.monotonic() - stream_start_time
        logger.info(f"[VertexRunner/Sync] stream_query finished for Session: {current_adk_session_id}. Events: {event_count}, Duration: {stream_duration:.2f}s, Exceptions: {stream_had_exceptions}")

    return all_events_from_stream, accumulated_text_response, query_errors_from_stream, stream_had_exceptions, event_count

async def run_vertex_stream_query(
        remote_app: ReasoningEngine, # Corrected type hint
        message_text: str,
        adk_user_id: str,
        current_adk_session_id: str
) -> tuple[list, str, list, bool, int]:
    """
    Asynchronously runs the stream_query by dispatching the synchronous call to a thread.
    """
    logger.info(f"[VertexRunner/Async] Dispatching stream_query to thread for Session: {current_adk_session_id}, User: {adk_user_id}.")
    try:
        all_events, final_text_response, query_errors, had_exceptions, num_events = await asyncio.to_thread(
            _run_vertex_stream_query_sync,
            remote_app,
            message_text,
            adk_user_id,
            current_adk_session_id
        )
        logger.debug(f"[VertexRunner/Async] Threaded stream_query for session '{current_adk_session_id}' completed. Events: {num_events}, Exceptions: {had_exceptions}")
        return all_events, final_text_response, query_errors, had_exceptions, num_events
    except Exception as e_to_thread:
        error_msg = f"[VertexRunner/Async] Exception from asyncio.to_thread running _run_vertex_stream_query_sync (session {current_adk_session_id}): {type(e_to_thread).__name__} - {str(e_to_thread)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        return [], "", [f"Async wrapper error for stream_query: {str(e_to_thread)[:200]}"], True, 0


__all__ = ['run_vertex_stream_query']