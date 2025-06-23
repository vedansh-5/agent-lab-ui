# functions/handlers/vertex/query_log_fetcher.py
import asyncio
import traceback
import json
import time
from datetime import datetime, timedelta, timezone
from google.cloud.logging_v2.services.logging_service_v2 import LoggingServiceV2Client
from common.core import logger

logging_client = LoggingServiceV2Client()

def _fetch_vertex_logs_sync(project_id: str, location: str, reasoning_engine_id: str, adk_session_id: str | None, start_time_dt_aware: datetime):
    """
    Synchronously fetches recent warning/error logs from Vertex AI for a specific reasoning engine.
    This function is intended to be run in a separate thread.
    """
    log_entries_for_client = []
    log_fetch_start_time = time.monotonic()
    logger.info(f"[LogFetch/Sync] Starting for Engine: {reasoning_engine_id}, Session: {adk_session_id or 'N/A'}, Start: {start_time_dt_aware.isoformat()}")

    try:
        # Define a slightly larger window to catch logs around the query time
        # Cap end_time at current time to avoid querying future logs
        end_time_dt_ideal = start_time_dt_aware + timedelta(minutes=5) # Fetch logs up to 5 mins after query start
        end_time_dt_actual = min(datetime.now(timezone.utc), end_time_dt_ideal)

        log_filter_parts = [
            f'resource.type="aiplatform.googleapis.com/ReasoningEngine"',
            f'resource.labels.reasoning_engine_id="{reasoning_engine_id}"',
            f'resource.labels.location="{location}"',
            f'severity>="WARNING"', # Fetch WARNING, ERROR, CRITICAL, ALERT, EMERGENCY
            f'timestamp >= "{start_time_dt_aware.isoformat()}"',
            f'timestamp <= "{end_time_dt_actual.isoformat()}"'
        ]

        # Add session ID to filter if available, attempting common log formats
        if adk_session_id:
            session_filter = (
                f'(jsonPayload.session_id="{adk_session_id}" OR '
                f'jsonPayload.adk_session_id="{adk_session_id}" OR '
                f'textPayload:"{adk_session_id}")' # Basic text search for session ID
            )
            log_filter_parts.append(session_filter)

        final_log_filter = " AND ".join(log_filter_parts)
        logger.debug(f"[LogFetch/Sync] Constructed log filter: {final_log_filter}")

        log_request = {
            "resource_names": [f"projects/{project_id}"],
            "filter": final_log_filter,
            "order_by": "timestamp desc", # Get most recent relevant logs first
            "page_size": 10 # Limit the number of logs fetched for brevity
        }

        entries_iterator = logging_client.list_log_entries(request=log_request)
        fetched_count = 0
        for entry in entries_iterator:
            message_content = ""
            if entry.text_payload:
                message_content = entry.text_payload
            elif entry.json_payload:
                # Try to extract a meaningful message from common payload structures
                payload_message_field = entry.json_payload.get('message', entry.json_payload.get('msg', str(entry.json_payload)))
                message_content = payload_message_field if isinstance(payload_message_field, str) else json.dumps(payload_message_field)

                # Ensure timestamp is timezone-aware (should be from proto) and format
            py_datetime = entry.timestamp.replace(tzinfo=timezone.utc) if hasattr(entry, 'timestamp') and entry.timestamp else datetime.now(timezone.utc)

            log_entries_for_client.append(
                f"[{entry.severity.name} @ {py_datetime.strftime('%Y-%m-%dT%H:%M:%SZ')}]: {message_content}"[:1000] # Truncate long messages
            )
            fetched_count +=1
            if fetched_count >= 5: # Stop after 5 relevant log entries
                logger.info(f"[LogFetch/Sync] Reached limit of 5 log entries for Engine: {reasoning_engine_id}.")
                break
        logger.info(f"[LogFetch/Sync] Fetched {len(log_entries_for_client)} log entries for Engine: {reasoning_engine_id}. Duration: {time.monotonic() - log_fetch_start_time:.2f}s")

    except Exception as e_sync_fetch:
        error_msg = f"[LogFetch/Sync] Error fetching logs for Engine {reasoning_engine_id}: {type(e_sync_fetch).__name__} - {str(e_sync_fetch)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        log_entries_for_client.append(f"INTERNAL_LOG_FETCH_ERROR (sync): {str(e_sync_fetch)[:200]}")

    return log_entries_for_client

async def fetch_vertex_logs_for_query(project_id: str, location: str, reasoning_engine_id: str | None, adk_session_id: str | None, query_start_time_utc: datetime):
    """
    Asynchronously fetches recent warning/error logs from Vertex AI for a specific reasoning engine,
    typically invoked when a query seems to have issues.
    """
    if not reasoning_engine_id:
        logger.info("[LogFetch/Async] Reasoning_engine_id is missing, skipping Vertex log fetch.")
        return []

        # Ensure start_time is timezone-aware (UTC)
    start_time_dt_aware = query_start_time_utc if query_start_time_utc.tzinfo else query_start_time_utc.replace(tzinfo=timezone.utc)
    logger.info(f"[LogFetch/Async] Dispatching log fetch for Engine: {reasoning_engine_id}, Session: {adk_session_id or 'N/A'}, QueryStart: {start_time_dt_aware.isoformat()}")

    try:
        # Run the synchronous log fetching function in a separate thread
        log_entries = await asyncio.to_thread(
            _fetch_vertex_logs_sync, project_id, location, reasoning_engine_id, adk_session_id, start_time_dt_aware
        )
        logger.info(f"[LogFetch/Async] Received {len(log_entries)} log entries from sync task for Engine: {reasoning_engine_id}.")
        return log_entries
    except Exception as e_async_wrapper:
        error_msg = f"[LogFetch/Async] Error in to_thread call for _fetch_vertex_logs_sync (Engine: {reasoning_engine_id}): {type(e_async_wrapper).__name__} - {str(e_async_wrapper)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        return [f"INTERNAL_ASYNC_LOG_FETCH_ERROR: {str(e_async_wrapper)[:200]}"]

__all__ = ['fetch_vertex_logs_for_query']  