import os
import json
import importlib
import requests
import traceback # For full traceback

import functools # For decorator wrapping

from firebase_functions import https_fn, options, logger
from firebase_admin import initialize_app, firestore

# Initialize Firebase Admin SDK
initialize_app()
db = firestore.client() # Initialize Firestore client globally or per function as needed


# --- CORS Configuration ---
# Set global CORS options for all callable functions
# Adjust origins as per your frontend hosting
CORS_ORIGINS = [
    "http://localhost:3000",  # For local React development
    f"https://{os.environ.get('GCP_PROJECT', 'your-project-id')}.web.app",
    f"https://{os.environ.get('GCP_PROJECT', 'your-project-id')}.firebaseapp.com"
]
if os.environ.get('FUNCTION_TARGET', None): # Running in Cloud Functions environment
    options.set_global_options(
        region="us-central1", # Or your preferred region
        # cors=options.CorsOptions(
        #     cors_origins=CORS_ORIGINS,
        #     cors_methods=["get", "post", "options", "delete"] # Add methods as needed
        # )
    )

# --- Global Constants ---
GOFANNON_MANIFEST_URL = "https://raw.githubusercontent.com/The-AI-Alliance/gofannon/main/manifest.json" # HYPOTHETICAL

# --- Error Handling Decorator ---
def handle_exceptions_and_log(func):
    @functools.wraps(func)
    def wrapper(req: https_fn.CallableRequest, *args, **kwargs):
        func_name = func.__name__
        try:
            logger.info(f"Function {func_name} called with data: {req.data}")
            return func(req, *args, **kwargs)
        except https_fn.HttpsError as e:
            # HttpsError is an "expected" error type for the client.
            # Log it but re-raise as is.
            logger.warn(f"Function {func_name} raised HttpsError: {e.message} (Code: {e.code.value})")
            raise
        except Exception as e:
            # For any other unexpected exception, log the full traceback.
            error_message = f"An unexpected error occurred in {func_name}."
            tb_str = traceback.format_exc()
            logger.error(f"{error_message}\nOriginal Exception: {str(e)}\nTraceback:\n{tb_str}")
            # Return a generic internal error to the client.
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"{error_message} Please check logs for details. Error ID: {req.instance_id}" # Instance ID can help find logs
            )
    return wrapper

# --- Helper Functions (Internal Logic) ---
def _get_gcp_project_config():
    project_id = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    location = "us-central1" # Make configurable if needed
    if not project_id:
        logger.error("GCP Project ID not found in environment variables.")
        raise ValueError("GCP Project ID not found.")
    staging_bucket_name = f"{project_id}-adk-staging"
    staging_bucket = f"gs://{staging_bucket_name}"
    logger.info(f"Using Project ID: {project_id}, Location: {location}, Staging Bucket: {staging_bucket}")
    # You might want to check if the bucket exists or ensure it's created,
    # though vertexai.init can sometimes create it.
    return project_id, location, staging_bucket

def _initialize_vertex_ai():
    import vertexai # Import late to optimize cold starts for functions not using it
    project_id, location, staging_bucket = _get_gcp_project_config()
    try:
        # Check if already initialized (though in CF, usually fresh per instance)
        # This check is more for local testing or long-lived environments.
        # A simple way to check might be to see if a default project is set.
        # if not vertexai.preview.global_config.project: # Example check, SDK might change
        vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)
        logger.info(f"Vertex AI initialized for project {project_id} in {location} with staging bucket {staging_bucket}")
    except Exception as e:
        if "Vertex AI SDK has already been initialized" in str(e):
            logger.info("Vertex AI SDK was already initialized.")
        else:
            logger.error(f"Error initializing Vertex AI: {e}")
            logger.error(traceback.format_exc())
            raise  # Re-raise to be caught by the endpoint's handler

def _instantiate_tool(tool_config):
    logger.info(f"Attempting to instantiate tool: {tool_config}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")

    module_path = tool_config.get("module_path")
    class_name = tool_config.get("class_name")

    if module_path and class_name:
        try:
            module = importlib.import_module(module_path)
            ToolClass = getattr(module, class_name)
            instance = ToolClass()
            if hasattr(instance, 'export_to_adk'):
                adk_tool = instance.export_to_adk()
                logger.info(f"Successfully instantiated and exported Gofannon tool {tool_config.get('id', class_name)} to ADK.")
                return adk_tool
            logger.info(f"Successfully instantiated Gofannon tool {tool_config.get('id', class_name)} (ADK compatible).")
            return instance
        except ImportError:
            logger.error(f"Module {module_path} not found for tool {tool_config.get('id', class_name)}.")
            raise
        except AttributeError:
            logger.error(f"Class {class_name} not found in module {module_path} for tool {tool_config.get('id', class_name)}.")
            raise
        except Exception as e:
            logger.error(f"Error instantiating Gofannon tool {tool_config.get('id', 'N/A')}: {e}")
            logger.error(traceback.format_exc())
            raise
    else:
        # Placeholder for other ADK tool types if needed
        # e.g., if tool_config.get("type") == "adk_prebuilt":
        # from google.adk.tools import SomeADKTool
        # return SomeADKTool(...)
        logger.error(f"Unsupported or incomplete tool configuration: {tool_config}")
        raise ValueError(f"Unsupported or incomplete tool configuration for tool ID {tool_config.get('id', 'N/A')}")


    # --- Tool Management Handler ---
@https_fn.on_call()
@handle_exceptions_and_log
def get_gofannon_tool_manifest(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    logger.info("Fetching Gofannon tool manifest.")
    try:
        # In a real scenario, you might fetch from GOFANNON_MANIFEST_URL
        # response = requests.get(GOFANNON_MANIFEST_URL, timeout=10)
        # response.raise_for_status()
        # tools_manifest_data = response.json()

        # Using hardcoded example for now as per original
        tools_manifest_data = {
            "tools": [
                {
                    "id": "gofannon.open_notify_space.iss_locator.IssLocator",
                    "name": "ISS Locator",
                    "description": "Locates the International Space Station.",
                    "module_path": "gofannon.open_notify_space.iss_locator", # Critical for instantiation
                    "class_name": "IssLocator"                               # Critical for instantiation
                },
                # Example of another potential Gofannon tool
                # {
                #     "id": "gofannon.sample_weather.weather_tool.SimpleWeather",
                #     "name": "Simple Weather Tool",
                #     "description": "Gets a simple weather forecast.",
                #     "module_path": "gofannon.sample_weather.weather_tool",
                #     "class_name": "SimpleWeather"
                # },
            ],
            "last_updated": firestore.SERVER_TIMESTAMP # Firestore server timestamp
        }

        manifest_ref = db.collection("gofannonToolManifest").document("latest")
        manifest_ref.set(tools_manifest_data)
        logger.info("Gofannon tool manifest updated in Firestore.")
        return {"success": True, "manifest": tools_manifest_data}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching Gofannon manifest from URL: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAVAILABLE, message=f"Could not fetch tool manifest: {e}")
        # The generic exception will be caught by the decorator if any other error occurs


# --- Agent Deployment and Management Handlers ---
@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540) # Ensure sufficient resources
@handle_exceptions_and_log
def deploy_agent_to_vertex(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config and agentDocId are required.")

    logger.info(f"Deploying agent {agent_doc_id} with config: {agent_config_data}")
    _initialize_vertex_ai()
    from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # ADK imports
    from vertexai import agent_engines as deployed_agent_engines # For deployed engines

    try:
        tools_list = []
        if agent_config_data.get("tools"):
            for tool_conf in agent_config_data["tools"]:
                # tool_conf should contain {id, name, module_path, class_name}
                tools_list.append(_instantiate_tool(tool_conf))

        AgentClass = {
            "Agent": Agent,
            "SequentialAgent": SequentialAgent,
            "LoopAgent": LoopAgent,
            "ParallelAgent": ParallelAgent
        }.get(agent_config_data.get("agentType", "Agent"), Agent)

        adk_agent = AgentClass(
            name=agent_config_data.get("name", f"adk-agent-{agent_doc_id}")[:63], # Vertex AI names have length limits
            model=agent_config_data.get("model", "gemini-1.5-flash-001"),
            description=agent_config_data.get("description", "A helpful agent deployed from AgentWebUI."),
            instruction=agent_config_data.get("instruction", "You are a helpful agent."),
            tools=tools_list,
        )
        logger.info(f"ADK Agent object created: {adk_agent.name} of type {AgentClass.__name__}")

        requirements_list = [
            "google-cloud-aiplatform[adk,agent_engines]>=1.93.0", # Pin your version
            "gofannon" # Ensure Gofannon is included
            # "cloudpickle==X.Y.Z", # Add specific versions if needed
            # "pydantic==A.B.C"
        ]
        logger.info(f"Deployment requirements: {requirements_list}")

        # Ensure display_name is within Vertex AI limits (typically 63 chars, specific pattern)
        display_name_raw = agent_config_data.get("name", f"deployed-agent-{agent_doc_id}")
        display_name_vertex = "".join(filter(str.isalnum, display_name_raw.lower().replace(" ", "-")))[:60]


        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=display_name_vertex,
            description=agent_config_data.get("description", f"Agent: {display_name_vertex}")
            # common_config={'temperature': 0.5} # Example for model config
        )
        logger.info(f"Agent deployment initiated for {agent_doc_id}. Resource name: {remote_app.resource_name}")

        agent_ref = db.collection("agents").document(agent_doc_id)
        agent_ref.update({
            "vertexAiResourceName": remote_app.resource_name,
            "deploymentStatus": "deployed", # Or "deploying" and use LRO polling if needed
            "lastDeployedAt": firestore.SERVER_TIMESTAMP,
            "deploymentError": firestore.DELETE_FIELD # Clear any previous error
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": "Agent deployment initiated."}

    except Exception as e: # Catch specific errors if needed, otherwise decorator handles
        logger.error(f"Error during agent deployment for {agent_doc_id}: {e}")
        agent_ref = db.collection("agents").document(agent_doc_id)
        agent_ref.update({
            "deploymentStatus": "error",
            "deploymentError": str(e),
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })
        # Re-raise so decorator can log full traceback and return standard HttpsError
        # If it's already an HttpsError (e.g. from _instantiate_tool via arg error), it's fine
        if not isinstance(e, https_fn.HttpsError):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment failed: {e}")
        else:
            raise # re-raise the HttpsError


@https_fn.on_call()
@handle_exceptions_and_log
def delete_vertex_agent(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    resource_name = req.data.get("resourceName")
    agent_doc_id = req.data.get("agentDocId")

    if not resource_name or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Vertex AI resourceName and agentDocId are required.")

    logger.info(f"Deleting Vertex agent {resource_name} for Firestore doc {agent_doc_id}.")
    _initialize_vertex_ai()
    from vertexai import agent_engines as deployed_agent_engines

    try:
        remote_app_to_delete = deployed_agent_engines.get(resource_name)
        # This is a long-running operation. `delete()` might return an LRO object.
        # For simplicity here, we'll assume it's synchronous enough or handle LRO if ADK changes.
        # The `force=True` is important as shown in your Colab.
        remote_app_to_delete.delete(force=True)
        logger.info(f"Vertex Agent {resource_name} deletion process initiated successfully.")

        agent_ref = db.collection("agents").document(agent_doc_id)
        agent_ref.update({
            "vertexAiResourceName": firestore.DELETE_FIELD,
            "deploymentStatus": "deleted",
            "lastDeployedAt": firestore.DELETE_FIELD, # Clear deployment timestamp
            "deploymentError": firestore.DELETE_FIELD # Clear any error
        })
        return {"success": True, "message": f"Agent {resource_name} deletion initiated."}
    except Exception as e: # Catch specific Vertex AI not found errors, etc.
        logger.error(f"Error deleting Vertex agent {resource_name}: {e}")
        # Optionally update Firestore with deletion error status
        # agent_ref = db.collection("agents").document(agent_doc_id)
        # agent_ref.update({"deploymentStatus": "delete_error", "deploymentError": str(e)})
        if "NotFound" in str(e): # Example specific error check
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent {resource_name} not found on Vertex AI.")
        if not isinstance(e, https_fn.HttpsError):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to delete agent: {e}")
        else:
            raise


        # --- Agent Runtime Handler ---
@https_fn.on_call(memory=options.MemoryOption.MB_512, timeout_sec=180) # Adjust as needed
@handle_exceptions_and_log
def query_deployed_agent(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    # `adk_user_id` is the user_id concept for ADK session management, distinct from Firebase Auth UID.
    # It could be the Firebase UID or a hash of it, or another unique identifier.
    adk_user_id = req.data.get("adkUserId") # e.g., could be req.auth.uid
    # `session_id_from_client` is if the client is trying to maintain a conversation session.
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId") # Firestore document ID of the agent

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="resourceName, message, adkUserId, and agentDocId are required."
        )

    logger.info(f"Querying agent {resource_name} (doc: {firestore_agent_id}) by ADK user {adk_user_id}, session {session_id_from_client or 'new'}.")
    _initialize_vertex_ai()
    from vertexai import agent_engines as deployed_agent_engines

    try:
        remote_app = deployed_agent_engines.get(resource_name)
        logger.info(f"Retrieved remote app for querying: {remote_app.name}")

        # ADK Session Management with Deployed Engines:
        # The `create_session` method on a deployed engine typically sets up a session.
        # The `id` from this session should be used in subsequent `stream_query` calls.
        # If `session_id_from_client` is provided, we'd ideally reuse it, but ADK's `get_session`
        # on deployed engines might not work the same as local `AdkApp`.
        # For deployed engines, it's often simpler to create a session for the interaction
        # or rely on how `stream_query` itself handles sessioning if `session_id` is passed.
        # The Colab example: `remote_session = remote_app.create_session(user_id="u_456")`
        # then `stream_query(..., session_id=remote_session["id"], user_id="u_456")`
        # So, we need to create/get a session.
        adk_session = remote_app.create_session(user_id=adk_user_id) # Pass the ADK user ID
        current_adk_session_id = adk_session.get("id") if isinstance(adk_session, dict) else adk_session.id
        logger.info(f"Using ADK session ID: {current_adk_session_id} for ADK user: {adk_user_id}")


        all_events = []
        final_text_response = ""

        # The user_id for stream_query is the one associated with the ADK session.
        for event in remote_app.stream_query(
                message=message_text,
                user_id=adk_user_id, # ADK User ID
                session_id=current_adk_session_id # ADK Session ID
        ):
            logger.debug(f"Agent event received: {event}") # Use debug for verbose logs
            all_events.append(event)
            if event.get('content') and event['content'].get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part:
                        final_text_response += part['text']
        logger.info(f"Final aggregated text response: {final_text_response[:200]}...")


        # Save run to Firestore
        run_data = {
            "firebaseUserId": req.auth.uid, # Firebase authenticated user
            "adkUserId": adk_user_id,       # User ID used for ADK session
            "adkSessionId": current_adk_session_id,
            "vertexAiResourceName": resource_name,
            "inputMessage": message_text,
            "outputEventsRaw": json.dumps(all_events), # Store raw events as JSON string if complex
            # "outputEvents": all_events, # Or store as array if simple enough for Firestore
            "finalResponseText": final_text_response,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data)
        logger.info(f"Agent run saved to Firestore for agent {firestore_agent_id}.")

        return {
            "success": True,
            "events": all_events, # Client can decide how to process this
            "responseText": final_text_response,
            "adkSessionId": current_adk_session_id # Return session ID for potential reuse by client
        }
    except Exception as e:
        logger.error(f"Error querying agent {resource_name}: {e}")
        # If it's a Vertex AI / ADK specific error (e.g. agent not found, quota issue)
        # one might want to return a more specific HttpsError code.
        if "NotFound" in str(e):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent resource {resource_name} not found or not ready.")
        if not isinstance(e, https_fn.HttpsError):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to query agent: {e}")
        else:
            raise