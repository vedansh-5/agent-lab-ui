# functions/handlers/vertex/query_utils.py
from common.core import logger

def get_reasoning_engine_id_from_name(resource_name: str) -> str | None:
    """
    Parses the reasoning engine ID from a full Vertex AI resource name.
    Example: projects/123/locations/us-central1/reasoningEngines/abc -> abc
    """
    if not resource_name:
        logger.warn("get_reasoning_engine_id_from_name: Received empty resource_name.")
        return None
    parts = resource_name.split('/')
    if len(parts) == 6 and \
            parts[0] == 'projects' and \
            parts[2] == 'locations' and \
            parts[4] == 'reasoningEngines':
        engine_id = parts[5]
        logger.debug(f"Parsed reasoning_engine_id '{engine_id}' from resource_name: {resource_name}")
        return engine_id
    logger.warn(f"Could not parse reasoning_engine_id from invalid resource_name format: {resource_name}")
    return None

__all__ = ['get_reasoning_engine_id_from_name']  