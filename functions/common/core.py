import os
import firebase_admin
from firebase_admin import firestore
from firebase_functions import logger, options

# Initialize Firebase Admin SDK - this runs once when the module is imported
try:
    firebase_admin.initialize_app()
except ValueError as e:
    if "already initialized" in str(e).lower():
        logger.info("Firebase Admin SDK already initialized.")
    else:
        raise

db = firestore.client() # Initialize Firestore client globally

def setup_global_options():
    """Sets global options for Firebase Functions."""
    if os.environ.get('FUNCTION_TARGET', None): # Ensures this runs in the Cloud Functions environment
        options.set_global_options(
            region="us-central1",
            # memory=options.MemoryOption.MB_256 # Default, can be overridden per function
            # timeout_sec=60 # Default, can be overridden per function
        )
        logger.info("Global Firebase Functions options set for us-central1.")

    # Call setup when this module is imported if in Cloud Functions environment
if os.environ.get('FUNCTION_TARGET', None):
    setup_global_options()

# Export logger for other modules to use consistently
__all__ = ['db', 'logger', 'setup_global_options']