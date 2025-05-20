import os
import json
import importlib
import requests
import traceback # For full traceback
import asyncio # For running async code within sync function

import functools # For decorator wrapping

from firebase_functions import https_fn, options, logger
import firebase_admin
from firebase_admin import firestore

# Initialize Firebase Admin SDK
firebase_admin.initialize_app()
db = firestore.client() # Initialize Firestore client globally or per function as needed


# --- CORS Configuration ---
CORS_ORIGINS = [
    "http://localhost:3000",
    f"https://{os.environ.get('GCP_PROJECT', 'your-project-id')}.web.app",
    f"https://{os.environ.get('GCP_PROJECT', 'your-project-id')}.firebaseapp.com"
]
if os.environ.get('FUNCTION_TARGET', None):
    options.set_global_options(
        region="us-central1",
        # cors=options.CorsOptions(cors_origins=CORS_ORIGINS, cors_methods=["get", "post", "options", "delete"])
    )

# --- Global Constants ---
GOFANNON_MANIFEST_URL = "https://raw.githubusercontent.com/The-AI-Alliance/gofannon/main/manifest.json"

# --- Error Handling Decorator ---
def handle_exceptions_and_log(func): # Synchronous decorator
    @functools.wraps(func)
    def wrapper(req: https_fn.CallableRequest, *args, **kwargs): # Synchronous wrapper
        func_name = func.__name__
        try:
            logger.info(f"Function {func_name} called with data: {req.data}")
            return func(req, *args, **kwargs) # Direct synchronous call
        except https_fn.HttpsError as e:
            logger.warn(f"Function {func_name} raised HttpsError: {e.message} (Code: {e.code.value})")
            raise
        except Exception as e:
            error_message = f"An unexpected error occurred in {func_name}."
            tb_str = traceback.format_exc()
            logger.error(f"{error_message}\nOriginal Exception: {str(e)}\nTraceback:\n{tb_str}")
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"{error_message} Please check logs for details. Error ID: {req.instance_id}"
            )
    return wrapper

# --- Helper Functions (Internal Logic) ---
def _get_gcp_project_config():
    project_id = None
    try:
        project_id = firebase_admin.get_app().project_id
        if project_id: logger.info(f"Retrieved project ID from firebase_admin: {project_id}")
    except Exception as e:
        logger.warning(f"Could not get project ID from firebase_admin.get_app().project_id: {e}. Falling back.")
    if not project_id:
        project_id = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        if project_id: logger.info(f"Retrieved project ID from environment variables: {project_id}")
    location = "us-central1"
    if not project_id:
        logger.error("GCP Project ID could not be determined.")
        raise ValueError("GCP Project ID not found.")
    staging_bucket_name = f"{project_id}-adk-staging"
    staging_bucket = f"gs://{staging_bucket_name}"
    logger.info(f"Using Project ID: {project_id}, Location: {location}, Staging Bucket: {staging_bucket}")
    return project_id, location, staging_bucket

def _initialize_vertex_ai():
    import vertexai
    project_id, location, staging_bucket = _get_gcp_project_config()
    try:
        vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)
        logger.info(f"Vertex AI initialized for project {project_id} in {location}")
    except Exception as e:
        if "Vertex AI SDK has already been initialized" in str(e):
            logger.info("Vertex AI SDK was already initialized.")
        else:
            logger.error(f"Error initializing Vertex AI: {e}\n{traceback.format_exc()}")
            raise

def _instantiate_tool(tool_config):
    logger.info(f"Attempting to instantiate tool: {tool_config}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")
    module_path, class_name = tool_config.get("module_path"), tool_config.get("class_name")
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
        except Exception as e:
            tool_id_for_log = tool_config.get('id', class_name or 'N/A')
            logger.error(f"Error instantiating Gofannon tool {tool_id_for_log}: {e}\n{traceback.format_exc()}")
            raise ValueError(f"Error instantiating tool {tool_id_for_log}: {e}")
    raise ValueError(f"Unsupported or incomplete tool configuration for tool ID {tool_config.get('id', 'N/A')}")


# --- Tool Management Handler ---
@https_fn.on_call()
@handle_exceptions_and_log
def get_gofannon_tool_manifest(req: https_fn.CallableRequest): # Synchronous
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    logger.info("Fetching Gofannon tool manifest.")
    try:
        tools_manifest_data = {
            "tools": [{
                "id": "gofannon.open_notify_space.iss_locator.IssLocator", "name": "ISS Locator",
                "description": "Locates the International Space Station.",
                "module_path": "gofannon.open_notify_space.iss_locator", "class_name": "IssLocator"
            }], "last_updated": firestore.SERVER_TIMESTAMP
        }
        db.collection("gofannonToolManifest").document("latest").set(tools_manifest_data)
        logger.info("Gofannon tool manifest updated in Firestore.")
        return {"success": True, "manifest": tools_manifest_data}
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching Gofannon manifest from URL: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAVAILABLE, message=f"Could not fetch tool manifest: {e}")


    # --- Agent Deployment and Management Handlers ---
@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540)
@handle_exceptions_and_log
def deploy_agent_to_vertex(req: https_fn.CallableRequest): # Synchronous
    if not req.auth: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    agent_config_data, agent_doc_id = req.data.get("agentConfig"), req.data.get("agentDocId")
    if not agent_config_data or not agent_doc_id: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config and agentDocId are required.")

    logger.info(f"Deploying agent {agent_doc_id} with config: {agent_config_data}")
    _initialize_vertex_ai()
    from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
    from vertexai import agent_engines as deployed_agent_engines

    try:
        tools_list = [_instantiate_tool(tc) for tc in agent_config_data.get("tools", [])]
        AgentClass = {"Agent": Agent, "SequentialAgent": SequentialAgent, "LoopAgent": LoopAgent, "ParallelAgent": ParallelAgent}.get(agent_config_data.get("agentType", "Agent"), Agent)
        adk_agent = AgentClass(
            name=agent_config_data.get("name", f"adk-agent-{agent_doc_id}")[:63],
            model=agent_config_data.get("model", "gemini-1.5-flash-001"),
            description=agent_config_data.get("description"),
            instruction=agent_config_data.get("instruction"), tools=tools_list
        )
        logger.info(f"ADK Agent object created: {adk_agent.name} of type {AgentClass.__name__}")
        requirements = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.0", "gofannon"]
        display_name = "".join(filter(str.isalnum, agent_config_data.get("name", f"deployed-agent-{agent_doc_id}").lower().replace(" ", "-")))[:60]

        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent, requirements=requirements, display_name=display_name,
            description=agent_config_data.get("description", f"Agent: {display_name}")
        )
        logger.info(f"Agent deployment initiated for {agent_doc_id}. Resource name: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": "Agent deployment initiated."}
    except Exception as e:
        logger.error(f"Error during agent deployment for {agent_doc_id}: {e}")
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": str(e), "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        if not isinstance(e, https_fn.HttpsError): raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment failed: {str(e)[:200]}")
        raise

@https_fn.on_call()
@handle_exceptions_and_log
def delete_vertex_agent(req: https_fn.CallableRequest): # Synchronous
    if not req.auth: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    resource_name, agent_doc_id = req.data.get("resourceName"), req.data.get("agentDocId")
    if not resource_name or not agent_doc_id: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Vertex AI resourceName and agentDocId are required.")

    logger.info(f"Deleting Vertex agent {resource_name} for Firestore doc {agent_doc_id}.")
    _initialize_vertex_ai()
    from vertexai import agent_engines as deployed_agent_engines
    try:
        deployed_agent_engines.get(resource_name).delete(force=True)
        logger.info(f"Vertex Agent {resource_name} deletion process initiated.")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": firestore.DELETE_FIELD, "deploymentStatus": "deleted",
            "lastDeployedAt": firestore.DELETE_FIELD, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "message": f"Agent {resource_name} deletion initiated."}
    except Exception as e:
        logger.error(f"Error deleting Vertex agent {resource_name}: {e}")
        if "NotFound" in str(e): raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent {resource_name} not found.")
        if not isinstance(e, https_fn.HttpsError): raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to delete agent: {str(e)[:200]}")
        raise

    # --- Agent Runtime Handler ---
@https_fn.on_call(memory=options.MemoryOption.MB_512, timeout_sec=180)
@handle_exceptions_and_log
def query_deployed_agent(req: https_fn.CallableRequest): # Synchronous handler
    if not req.auth: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId")
    session_id_from_client = req.data.get("sessionId")
    firestore_agent_id = req.data.get("agentDocId")
    firebase_auth_uid = req.auth.uid

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="resourceName, message, adkUserId, and agentDocId are required.")

    logger.info(f"Sync: Querying agent {resource_name} (doc: {firestore_agent_id}) by ADK user {adk_user_id}, client session: {session_id_from_client or 'None'}.")
    _initialize_vertex_ai()

    from vertexai import agent_engines as deployed_agent_engines
    from google.adk.sessions import VertexAiSessionService

    # These are obtained synchronously
    project_id, location, _ = _get_gcp_project_config()

    # Define an async inner function for awaitable operations
    async def _query_async_logic():
        # Re-scope session_id_from_client if it's modified for logging/control flow clarity,
        # though it's passed by value from the outer scope.
        _current_session_id_from_client = session_id_from_client
        current_adk_session_id = None

        session_service = VertexAiSessionService(project=project_id, location=location)
        remote_app = deployed_agent_engines.get(resource_name) # This is a sync call
        logger.info(f"Async: Retrieved remote app for querying: {remote_app.name}")

        if _current_session_id_from_client:
            logger.info(f"Async: Attempting to retrieve ADK session: {_current_session_id_from_client} for user: {adk_user_id} on app: {resource_name}")
            try:
                retrieved_session = await session_service.get_session(
                    app_name=resource_name, user_id=adk_user_id, session_id=_current_session_id_from_client
                )
                if retrieved_session:
                    current_adk_session_id = retrieved_session.id
                    logger.info(f"Async: Retrieved existing ADK session ID: {current_adk_session_id}")
                else:
                    logger.warn(f"Async: get_session for {_current_session_id_from_client} returned None. Will create new.")
            except Exception as e:
                logger.warn(f"Async: Failed to retrieve session {_current_session_id_from_client}. Error: {e}. Will create new.")

        if not current_adk_session_id:
            logger.info(f"Async: Creating new ADK session for user: {adk_user_id} on app: {resource_name}")
            new_session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
            current_adk_session_id = new_session.id
            logger.info(f"Async: Created new ADK session ID: {current_adk_session_id}")

        if not current_adk_session_id:
            # This path should ideally not be hit if create_session works.
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to initialize agent session.")

        logger.info(f"Async: Using ADK session: {current_adk_session_id} for user: {adk_user_id}")
        all_events, final_text_response = [], ""
        for event in remote_app.stream_query(message=message_text, user_id=adk_user_id, session_id=current_adk_session_id): # Sync iteration
            logger.debug(f"Async: Agent event: {event}")
            all_events.append(event)
            if event.get('content') and event['content'].get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part: final_text_response += part['text']
        logger.info(f"Async: Final response for session {current_adk_session_id}: {final_text_response[:200]}...")
        return {"events": all_events, "responseText": final_text_response, "adkSessionId": current_adk_session_id}

    try:
        # Manage event loop for the async part
        # asyncio.run() is simpler if no loop is already running.
        # If Firebase runs its own loop (unlikely for sync handlers), this might need adjustment,
        # but for a sync handler, creating a new loop or using asyncio.run() is standard.
        try:
            result_data = asyncio.run(_query_async_logic())
        except RuntimeError as e: # Fallback if asyncio.run() says a loop is already running
            if "cannot be called when another asyncio event loop is running" in str(e):
                logger.warning("asyncio.run() failed as a loop is already running. Using existing loop or manual loop.")
                loop = asyncio.get_event_loop()
                if loop.is_closed(): # Should not happen if get_event_loop found one
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    result_data = loop.run_until_complete(_query_async_logic())
                    loop.close()
                else: # loop is running
                    result_data = loop.run_until_complete(_query_async_logic()) # This might still be problematic if not careful with tasks
            else:
                raise


                # Firestore save (synchronous)
        run_data = {
            "firebaseUserId": firebase_auth_uid, "adkUserId": adk_user_id,
            "adkSessionId": result_data["adkSessionId"], "vertexAiResourceName": resource_name,
            "inputMessage": message_text, "outputEventsRaw": json.dumps(result_data["events"]),
            "finalResponseText": result_data["responseText"], "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data)
        logger.info(f"Sync: Agent run saved for agent {firestore_agent_id}, session {result_data['adkSessionId']}.")
        return {"success": True, **result_data}

    except Exception as e: # Catch-all for errors during async execution or outer sync part
        # The decorator will handle logging the full traceback and converting to HttpsError
        # Add specific error mapping if needed here, before re-raising.
        if "NotFound" in str(e) and ("reasoningEngines" in str(e) or "DeployedAgent" in str(e) or f"'{resource_name}' not found" in str(e)):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent resource {resource_name} not found or not ready.")
        raise # Re-raise for the decorator to handle