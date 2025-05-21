import functools
import traceback
import vertexai
from firebase_functions import https_fn # For HttpsError and type hinting
from .core import logger
from .config import get_gcp_project_config

# --- Error Handling Decorator ---
def handle_exceptions_and_log(func):
    @functools.wraps(func)
    def wrapper(req: https_fn.CallableRequest, *args, **kwargs):
        func_name = func.__name__ # Will be the inner *_logic function name
        try:
            # The 'req.data' logging might be too verbose for some data.
            # Consider logging only keys or a summary if data is large/sensitive.
            logger.info(f"Function {func_name} (logic part) called with data keys: {list(req.data.keys()) if isinstance(req.data, dict) else 'Non-dict data'}")
            return func(req, *args, **kwargs)
        except https_fn.HttpsError as e:
            logger.warn(f"Function {func_name} (logic part) raised HttpsError: {e.message} (Code: {e.code.value})")
            raise # Re-raise HttpsError as it's already structured for Firebase
        except Exception as e:
            error_message = f"An unexpected error occurred in {func_name} (logic part)."
            tb_str = traceback.format_exc()
            logger.error(f"{error_message}\nOriginal Exception: {str(e)}\nTraceback:\n{tb_str}")
            # Instance ID might not be directly available here if decorator applied to logic func.
            # The outer Cloud Function wrapper in main.py would have the req.
            # For now, let's assume instance_id is less critical in this abstracted log.
            # If needed, the decorator could be modified or instance_id passed.
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"{error_message} Please check logs for details." # Avoid exposing instance_id directly from deeper logic.
            )
    return wrapper


def initialize_vertex_ai():
    """
    Initializes the Vertex AI SDK with project, location, and staging bucket.
    """
    project_id, location, staging_bucket = get_gcp_project_config()
    try:
        vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)
        logger.info(f"Vertex AI initialized for project {project_id} in {location}")
    except Exception as e:
        if "Vertex AI SDK has already been initialized" in str(e):
            logger.info("Vertex AI SDK was already initialized.")
        else:
            logger.error(f"Error initializing Vertex AI: {e}\n{traceback.format_exc()}")
            raise # Propagate error to be caught by handler or decorator

__all__ = ['handle_exceptions_and_log', 'initialize_vertex_ai']