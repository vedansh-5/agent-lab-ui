import requests
from firebase_admin import firestore
from firebase_functions import https_fn
from common.core import db, logger
from common.config import GOFANNON_MANIFEST_URL
# The decorator is applied in main.py, so the logic function doesn't need it here.

def _get_gofannon_tool_manifest_logic(req: https_fn.CallableRequest):
    # Authentication check is good practice here, or rely on the decorator in main.py
    # and the Callable Function's built-in auth checking.
    # For direct calls to this logic (e.g. testing), explicit check is safer.
    if not req.auth:
        # This error will be caught and logged by the handle_exceptions_and_log decorator
        # if it's applied to the calling function in main.py.
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required to fetch Gofannon tool manifest."
        )

    logger.info("Fetching Gofannon tool manifest (logic part).")
    try:
        # Option 1: Fetch live from Gofannon URL each time (as in original)
        # response = requests.get(GOFANNON_MANIFEST_URL, timeout=10)
        # response.raise_for_status() # Raise an exception for HTTP errors
        # tools_manifest_data = response.json()
        # if not isinstance(tools_manifest_data, dict) or "tools" not in tools_manifest_data:
        #    logger.error(f"Fetched Gofannon manifest is not in expected format: {tools_manifest_data}")
        #    raise ValueError("Gofannon manifest format error.")
        # actual_tools = tools_manifest_data.get("tools", [])

        # Option 2: Return a hardcoded/simplified manifest (as in original get_gofannon_tool_manifest)
        # This seems to be what the original code was doing despite the URL constant.
        # If fetching live is intended, uncomment Option 1 and adjust.
        tools_manifest_data_to_store = {
            "tools": [{
                "id": "gofannon.open_notify_space.iss_locator.IssLocator",
                "name": "ISS Locator",
                "description": "Locates the International Space Station.",
                "module_path": "gofannon.open_notify_space.iss_locator", # Make sure this path is valid in the Cloud Functions environment
                "class_name": "IssLocator"
            }],
            # "last_updated_url": GOFANNON_MANIFEST_URL # Keep track of source if fetched live
        }
        # Add server timestamp for when this version of the manifest was stored/generated
        manifest_with_timestamp = {**tools_manifest_data_to_store, "last_updated_firestore": firestore.SERVER_TIMESTAMP}

        # Store/update in Firestore
        db.collection("gofannonToolManifest").document("latest").set(manifest_with_timestamp)
        logger.info("Gofannon tool manifest (hardcoded version) updated/set in Firestore.")

        return {"success": True, "manifest": tools_manifest_data_to_store} # Return the data without Firestore timestamp for client

    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching Gofannon manifest from URL '{GOFANNON_MANIFEST_URL}': {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAVAILABLE,
            message=f"Could not fetch tool manifest: {e}"
        )
    except ValueError as e: # For format errors if fetching live
        logger.error(f"Error processing Gofannon manifest: {e}")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Error processing tool manifest: {e}"
        )

__all__ = ['_get_gofannon_tool_manifest_logic']