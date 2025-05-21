import json
import os # To build the path to the manifest file
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from common.core import db, logger
# Removed: import requests
# Removed: from common.config import GOFANNON_MANIFEST_URL

# Path to the local Gofannon manifest file
# __file__ is the path to the current script (gofannon_handler.py)
# os.path.dirname(__file__) gives the directory of the current script (functions/handlers)
# os.path.join('..', 'gofannon_manifest.json') goes up one level (to 'functions') and then to the file
MANIFEST_FILE_PATH = os.path.join(os.path.dirname(__file__), '..', 'gofannon_manifest.json')

def _get_gofannon_tool_manifest_logic(req: https_fn.CallableRequest):
    # Authentication check
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required to fetch Gofannon tool manifest."
        )

    logger.info(f"Fetching Gofannon tool manifest from local file: {MANIFEST_FILE_PATH} (logic part).")
    try:
        if not os.path.exists(MANIFEST_FILE_PATH):
            logger.error(f"Local Gofannon manifest file not found at: {MANIFEST_FILE_PATH}")
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message="Local Gofannon manifest file not found. Please ensure 'gofannon_manifest.json' exists in the 'functions' directory."
            )

        with open(MANIFEST_FILE_PATH, 'r') as f:
            tools_manifest_data = json.load(f)

        if not isinstance(tools_manifest_data, dict) or "tools" not in tools_manifest_data:
            logger.error(f"Local Gofannon manifest is not in expected format: {tools_manifest_data}")
            raise ValueError("Local Gofannon manifest format error. It must be a JSON object with a 'tools' array.")

            # Add server timestamp for when this version of the manifest was stored/generated
        # and mark the source.
        manifest_with_timestamp = {
            **tools_manifest_data,
            "last_updated_firestore": firestore.SERVER_TIMESTAMP,
            "source": "local_project_file" # Clearly indicate the origin
        }

        # Store/update in Firestore (this allows the client to fetch it without calling the function every time if cached)
        db.collection("gofannonToolManifest").document("latest").set(manifest_with_timestamp)
        logger.info("Local Gofannon tool manifest updated/set in Firestore.")

        # Return the manifest data (without Firestore timestamp) to the client for immediate use
        return {"success": True, "manifest": tools_manifest_data}

    except FileNotFoundError: # Should be caught by os.path.exists, but as a robust fallback
        logger.error(f"Local Gofannon manifest file not found (FileNotFoundError) at: {MANIFEST_FILE_PATH}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.NOT_FOUND,
            message="Local Gofannon manifest file could not be read."
        )
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding JSON from local Gofannon manifest '{MANIFEST_FILE_PATH}': {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message=f"Error parsing local tool manifest: {e}. Ensure it is valid JSON."
        )
    except ValueError as e: # For format errors
        logger.error(f"Error processing local Gofannon manifest: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Error processing local tool manifest: {e}"
        )
    except Exception as e: # Catch-all for other unexpected errors during file read or processing
        logger.error(f"Unexpected error loading local Gofannon manifest: {e}\n{traceback.format_exc()}", exc_info=True) # Added traceback
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message="An unexpected error occurred while loading the tool manifest."
        )

__all__ = ['_get_gofannon_tool_manifest_logic']