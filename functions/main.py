import os
import json
import importlib
import requests
import traceback # For full traceback
import asyncio # For running async code within sync function
import re # Added for display_name sanitization
from google.cloud.aiplatform_v1beta1 import ReasoningEngineServiceClient
from google.cloud.aiplatform_v1beta1.types import ReasoningEngine as ReasoningEngineProto

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
    )

# --- Global Constants ---
GOFANNON_MANIFEST_URL = "https://raw.githubusercontent.com/The-AI-Alliance/gofannon/main/manifest.json"

# --- Error Handling Decorator ---
def handle_exceptions_and_log(func):
    @functools.wraps(func)
    def wrapper(req: https_fn.CallableRequest, *args, **kwargs):
        func_name = func.__name__
        try:
            logger.info(f"Function {func_name} called with data: {req.data}")
            return func(req, *args, **kwargs)
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

def _generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    # Vertex AI display name rules: (a-z, 0-9, -), start with letter, 4-63 chars
    base_name = agent_config_name or f"adk-agent-{agent_doc_id}"

    # Sanitize: lowercase, replace invalid chars with hyphen, strip leading/trailing hyphens
    processed_name = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')

    # Fallback if processed_name is empty (e.g., original name was all invalid chars)
    if not processed_name:
        processed_name = f"agent-{agent_doc_id[:8].lower()}" # Use part of doc_id

    # Ensure starts with a letter
    if not processed_name[0].isalpha():
        processed_name = f"a-{processed_name}" # Prepend 'a-'

    # Enforce length constraints
    processed_name = processed_name[:63] # Max length 63

    # Ensure minimum length of 4, padding with 'x' if necessary
    # This padding should happen *after* potential truncation by prepending 'a-'
    # and before the final truncation, so we ensure it's not too short.
    # Re-evaluate order:
    # 1. Sanitize and lowercase: `processed_name = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')`
    # 2. Fallback: `if not processed_name: processed_name = f"agent-{agent_doc_id[:8].lower()}"`
    # 3. Ensure starts with letter: `if not processed_name[0].isalpha(): processed_name = f"a-{processed_name}"` (this could make it too long)
    # 4. Truncate to max length: `processed_name = processed_name[:63]`
    # 5. Ensure min length: `while len(processed_name) < 4: processed_name += "x"` (this could make it too long again if it was short before)
    # 6. Final truncate: `processed_name = processed_name.strip('-')[:63]` (strip just in case 'a-' or padding caused issues)

    # Simpler robust approach for display name:
    sanitized_base = re.sub(r'[^a-z0-9-]+', '-', (agent_config_name or f"agent-{agent_doc_id}").lower()).strip('-')
    if not sanitized_base: # Highly unlikely if agent_doc_id is used
        sanitized_base = f"agent-{agent_doc_id[:8]}" # Default if everything else fails

    # Prefix with 'a-' if doesn't start with a letter or too short
    if not sanitized_base[0].isalpha() or len(sanitized_base) < 4:
        # Ensure prefix doesn't make it too generic if base is already long
        core_name = sanitized_base[:58] # Leave space for 'a-' and potential padding
        deployment_display_name = f"a-{core_name}"
    else:
        deployment_display_name = sanitized_base

        # Trim to 63 chars
    deployment_display_name = deployment_display_name[:63]

    # Pad to 4 chars if needed
    while len(deployment_display_name) < 4:
        deployment_display_name += "x"

    return deployment_display_name.strip('-') # Final cleanup

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

def _sanitize_adk_agent_name(name_str: str, prefix_if_needed: str = "agent_") -> str:
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)
    if sanitized and sanitized[0].isdigit():
        sanitized = f"_{sanitized}"
    if not sanitized or not (sanitized[0].isalpha() or sanitized[0] == '_'):
        sanitized = f"{prefix_if_needed}{sanitized}"
    sanitized = re.sub(r'_+', '_', sanitized)
    return sanitized[:63]

def _instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="parent", child_index=0):
    from google.adk.agents import Agent

    original_child_name = agent_config.get('name', f'child_{child_index}')
    base_name_for_adk = f"{original_child_name}_{parent_adk_name_for_context}_{os.urandom(3).hex()}"
    final_child_agent_name = _sanitize_adk_agent_name(base_name_for_adk, prefix_if_needed=f"child_{child_index}_")

    logger.info(f"Instantiating child ADK agent with internal name '{final_child_agent_name}' (original: '{original_child_name}')")
    child_tools = [_instantiate_tool(tc) for tc in agent_config.get("tools", [])]

    return Agent(
        name=final_child_agent_name,
        description=agent_config.get("description"),
        model=agent_config.get("model", "gemini-1.5-flash-001"),
        instruction=agent_config.get("instruction"),
        tools=child_tools
    )

@https_fn.on_call()
@handle_exceptions_and_log
def get_gofannon_tool_manifest(req: https_fn.CallableRequest):
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

@https_fn.on_call()
@handle_exceptions_and_log
def delete_vertex_agent(req: https_fn.CallableRequest):
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
        if "NotFound" in str(e):
            db.collection("agents").document(agent_doc_id).update({
                "vertexAiResourceName": firestore.DELETE_FIELD, "deploymentStatus": "not_found_on_vertex",
                "lastDeployedAt": firestore.DELETE_FIELD, "deploymentError": "Agent not found on Vertex AI during deletion attempt."
            })
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent {resource_name} not found on Vertex AI.")
        if not isinstance(e, https_fn.HttpsError): raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to delete agent: {str(e)[:200]}")
        raise

@https_fn.on_call(memory=options.MemoryOption.MB_512, timeout_sec=180)
@handle_exceptions_and_log
def query_deployed_agent(req: https_fn.CallableRequest):
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

    project_id, location, _ = _get_gcp_project_config()

    async def _query_async_logic():
        _current_session_id_from_client = session_id_from_client
        current_adk_session_id = None

        session_service = VertexAiSessionService(project=project_id, location=location)
        remote_app = deployed_agent_engines.get(resource_name)
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
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to initialize agent session.")

        logger.info(f"Async: Using ADK session: {current_adk_session_id} for user: {adk_user_id} with message: '{message_text}'")
        all_events, final_text_response = [], ""

        for event_idx, event in enumerate(remote_app.stream_query(message=message_text, user_id=adk_user_id, session_id=current_adk_session_id)):
            logger.debug(f"Async: Agent event {event_idx}: type={event.get('type')}, content_keys={list(event.get('content', {}).keys()) if event.get('content') else 'NoContent'}")
            all_events.append(event)
            if event.get('type') == 'text_delta' and event.get('content') and event['content'].get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part:
                        final_text_response += part['text']
            elif event.get('type') == 'tool_code_execution_output' and event.get('content') and event['content'].get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part:
                        logger.info(f"Tool output with text: {part['text']}")

        if not final_text_response and all_events:
            logger.info("No 'text_delta' events received. Checking last event for text.")
            for event in reversed(all_events):
                if event.get('content') and event['content'].get('parts'):
                    temp_text = ""
                    for part in event['content']['parts']:
                        if 'text' in part:
                            temp_text += part['text']
                    if temp_text:
                        final_text_response = temp_text
                        logger.info(f"Found text in non-text_delta event: {final_text_response}")
                        break

        logger.info(f"Async: Final response for session {current_adk_session_id}: {final_text_response[:200]}...")
        return {"events": all_events, "responseText": final_text_response, "adkSessionId": current_adk_session_id}

    try:
        try:
            result_data = asyncio.run(_query_async_logic())
        except RuntimeError as e:
            if "cannot be called when another asyncio event loop is running" in str(e) or \
                    " asyncio.run() cannot be called from a running event loop" in str(e):
                logger.warning("asyncio.run() failed as a loop is already running. Using existing loop.")
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    logger.info("Event loop was closed, creating new one.")
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    result_data = loop.run_until_complete(_query_async_logic())
                    loop.close()
                else:
                    result_data = loop.run_until_complete(_query_async_logic())
            else:
                raise

        run_data = {
            "firebaseUserId": firebase_auth_uid, "adkUserId": adk_user_id,
            "adkSessionId": result_data["adkSessionId"], "vertexAiResourceName": resource_name,
            "inputMessage": message_text,
            "outputEventsRaw": json.dumps(result_data["events"]),
            "finalResponseText": result_data["responseText"],
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data)
        logger.info(f"Sync: Agent run saved for agent {firestore_agent_id}, session {result_data['adkSessionId']}.")
        return {"success": True, **result_data}

    except Exception as e:
        tb_str_query = traceback.format_exc()
        logger.error(f"Error in query_deployed_agent (sync or async part) for {resource_name}: {e}\n{tb_str_query}")
        if "NotFound" in str(e) and (f"projects/{project_id}/locations/{location}/reasoningEngines/{resource_name}" in str(e).lower() or f"deployedagent \"{resource_name}\" not found" in str(e).lower() or f"reasoning engine {resource_name} not found" in str(e).lower()):
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent resource {resource_name} not found or not ready.")
        raise

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540)
@handle_exceptions_and_log
def deploy_agent_to_vertex(req: https_fn.CallableRequest):
    if not req.auth: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")
    agent_config_data, agent_doc_id = req.data.get("agentConfig"), req.data.get("agentDocId")
    if not agent_config_data or not agent_doc_id: raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config and agentDocId are required.")

    logger.info(f"Initiating deployment for agent {agent_doc_id}. Config: {json.dumps(agent_config_data, indent=2)}")

    try:
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "deploying_initiated",
            "lastDeploymentAttemptAt": firestore.SERVER_TIMESTAMP,
            "vertexAiResourceName": firestore.DELETE_FIELD,
            "deploymentError": firestore.DELETE_FIELD,
            "lastDeployedAt": firestore.DELETE_FIELD # Clear old deployment success time
        })
        logger.info(f"Agent {agent_doc_id} status set to 'deploying_initiated'.")
    except Exception as e:
        logger.error(f"Critical: Failed to update agent {agent_doc_id} status to 'deploying_initiated' before deployment attempt: {e}")
        # Don't necessarily stop, but this is a bad state. Log it prominently.

    _initialize_vertex_ai()
    from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
    from vertexai import agent_engines as deployed_agent_engines

    try:
        # ... (AgentClass determination and adk_agent instantiation as before)
        agent_type_str = agent_config_data.get("agentType")
        AgentClass = {
            "Agent": Agent, "SequentialAgent": SequentialAgent,
            "LoopAgent": LoopAgent, "ParallelAgent": ParallelAgent
        }.get(agent_type_str)

        if not AgentClass:
            logger.error(f"Invalid agentType specified: {agent_type_str}")
            db.collection("agents").document(agent_doc_id).update({
                "deploymentStatus": "error", "deploymentError": f"Invalid agentType: {agent_type_str}",
                "lastDeployedAt": firestore.SERVER_TIMESTAMP
            })
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=f"Invalid agentType: {agent_type_str}.")

        parent_agent_name_str = agent_config_data.get("name", f"agent_{agent_doc_id}")
        parent_adk_name = _sanitize_adk_agent_name(parent_agent_name_str, prefix_if_needed=f"parent_{agent_doc_id}_")
        agent_description = agent_config_data.get("description")
        common_args_for_parent = {"name": parent_adk_name, "description": agent_description}
        adk_agent = None
        instantiated_parent_tools = [_instantiate_tool(tc) for tc in agent_config_data.get("tools", [])]

        if AgentClass == Agent:
            adk_agent = Agent(
                **common_args_for_parent, model=agent_config_data.get("model", "gemini-1.5-flash-001"),
                instruction=agent_config_data.get("instruction"), tools=instantiated_parent_tools
            )
        elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
            child_agent_configs = agent_config_data.get("childAgents", [])
            instantiated_child_agents = [
                _instantiate_adk_agent_from_config(child_config, parent_adk_name, child_idx)
                for child_idx, child_config in enumerate(child_agent_configs)
            ]
            adk_agent = AgentClass(**common_args_for_parent, sub_agents=instantiated_child_agents)
        elif AgentClass == LoopAgent:
            loop_child_adk_name = _sanitize_adk_agent_name(f"{parent_adk_name}_looped_child", prefix_if_needed="looped_")
            looped_child_agent = Agent(
                name=loop_child_adk_name, model=agent_config_data.get("model", "gemini-1.5-flash-001"),
                instruction=agent_config_data.get("instruction"), tools=instantiated_parent_tools
            )
            max_loops = int(agent_config_data.get("maxLoops", 3))
            adk_agent = LoopAgent(**common_args_for_parent, agent=looped_child_agent, max_loops=max_loops)

        if adk_agent is None: raise ValueError("ADK Agent object could not be constructed.")
        logger.info(f"ADK Agent object prepared: {adk_agent.name} of type {AgentClass.__name__}")

        requirements = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.0", "gofannon"]

        config_name_for_display = agent_config_data.get("name") # Original name from config
        deployment_display_name = _generate_vertex_deployment_display_name(config_name_for_display, agent_doc_id)

        logger.info(f"Attempting to deploy with display_name: '{deployment_display_name}' (ADK object name: '{adk_agent.name}')")

        # This is the long-running call
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent, requirements=requirements, display_name=deployment_display_name,
            description=agent_config_data.get("description", f"Agent: {deployment_display_name}")
        )

        # If create() completes successfully within Cloud Function timeout
        logger.info(f"Agent deployment successful (within timeout) for {agent_doc_id}. Resource name: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": "Agent deployment initiated and confirmed completed."}

    except Exception as e:
        # This block handles:
        # 1. Errors from adk_agent instantiation (before create call).
        # 2. Errors from deployed_agent_engines.create() if it fails quickly (e.g., bad config, permissions).
        # If the Cloud Function times out during create(), this block is NOT hit for the timeout itself.
        # The client gets DEADLINE_EXCEEDED, and Firestore status remains 'deploying_initiated'.

        tb_str = traceback.format_exc()
        error_message = f"Error during agent deployment for {agent_doc_id}: {str(e)}"
        logger.error(f"{error_message}\n{tb_str}")

        # Update Firestore to 'error' because the deployment call itself failed or setup failed.
        # This won't run if the function times out.
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": str(e)[:1000], # Store a snippet
            "lastDeployedAt": firestore.SERVER_TIMESTAMP # Mark time of this failed attempt
        })

        if isinstance(e, https_fn.HttpsError): # Re-raise if already an HttpsError
            raise
        if "validation error" in str(e).lower() and "pydantic" in str(e).lower():
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=f"Agent configuration validation failed: {str(e)[:300]}. Check agent names and other parameters.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment failed: {str(e)[:300]}")


@https_fn.on_call(memory=options.MemoryOption.MB_512) # Usually a quick operation
@handle_exceptions_and_log
def check_vertex_agent_deployment_status(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    agent_doc_id = req.data.get("agentDocId")
    if not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="agentDocId is required.")

    logger.info(f"Checking deployment status for agent {agent_doc_id}")
    _initialize_vertex_ai() # Ensures project/location are set for the client

    project_id, location, _ = _get_gcp_project_config()
    client_options = {"api_endpoint": f"{location}-aiplatform.googleapis.com"}
    reasoning_engine_client = ReasoningEngineServiceClient(client_options=client_options)
    parent = f"projects/{project_id}/locations/{location}"

    try:
        agent_doc_ref = db.collection("agents").document(agent_doc_id)
        agent_snap = agent_doc_ref.get()
        if not agent_snap.exists:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent document {agent_doc_id} not found in Firestore.")
        agent_data = agent_snap.to_dict()

        expected_config_name = agent_data.get("name")
        expected_display_name = _generate_vertex_deployment_display_name(expected_config_name, agent_doc_id)
        current_resource_name = agent_data.get("vertexAiResourceName")

        logger.info(f"Expected display name for {agent_doc_id}: '{expected_display_name}'. Current stored resource: {current_resource_name}")

        found_engine_proto = None
        engine_identified_by = ""

        if current_resource_name:
            try:
                engine = reasoning_engine_client.get_reasoning_engine(name=current_resource_name)
                if engine.display_name == expected_display_name:
                    found_engine_proto = engine
                    engine_identified_by = "stored resource_name"
                else:
                    logger.warning(f"Stored resource_name {current_resource_name} for agent {agent_doc_id} has mismatched display_name ('{engine.display_name}' vs expected '{expected_display_name}'). Will try listing by display_name.")
                    # Potentially clear current_resource_name if it's definitively wrong?
                    # agent_doc_ref.update({"vertexAiResourceName": firestore.DELETE_FIELD})
            except Exception as e: # e.g., google.api_core.exceptions.NotFound
                logger.info(f"Failed to get engine by stored resource_name {current_resource_name} for {agent_doc_id}: {e}. Will try listing by display_name.")
                # Clear the potentially stale resource name from Firestore if it's not found
                if "NotFound" in str(e) or "could not be found" in str(e):
                    agent_doc_ref.update({"vertexAiResourceName": firestore.DELETE_FIELD, "deploymentStatus": "error_resource_vanished"})


        if not found_engine_proto:
            logger.info(f"Attempting to find engine for {agent_doc_id} by listing with display_name '{expected_display_name}'.")
            list_request = ReasoningEngineServiceClient.list_reasoning_engines_request_type(parent=parent, filter=f'display_name="{expected_display_name}"')

            # The list operation is a paginated result, but we expect at most one for a unique display name.
            engine_list = list(reasoning_engine_client.list_reasoning_engines(request=list_request))

            if engine_list:
                if len(engine_list) > 1:
                    logger.warning(f"Multiple engines found for display_name '{expected_display_name}'. Using the first one: {[e.name for e in engine_list]}. This indicates a non-unique display name strategy.")
                found_engine_proto = engine_list[0]
                engine_identified_by = "listing by display_name"
                # Update Firestore with the found resource_name if it wasn't there or was different
                if current_resource_name != found_engine_proto.name:
                    agent_doc_ref.update({"vertexAiResourceName": found_engine_proto.name})
            else:
                logger.info(f"No engine found for {agent_doc_id} with display_name '{expected_display_name}' via listing.")


        update_payload = {"lastStatusCheckAt": firestore.SERVER_TIMESTAMP}
        final_status_to_report = ""

        if found_engine_proto:
            logger.info(f"Engine {found_engine_proto.name} (state: {found_engine_proto.state.name}) identified for {agent_doc_id} via {engine_identified_by}.")
            current_engine_state = found_engine_proto.state
            update_payload["vertexAiResourceName"] = found_engine_proto.name # Ensure it's up-to-date

            if current_engine_state == ReasoningEngineProto.State.ACTIVE:
                update_payload["deploymentStatus"] = "deployed"
                update_payload["deploymentError"] = firestore.DELETE_FIELD
                update_payload["lastDeployedAt"] = firestore.SERVER_TIMESTAMP # Or use engine's update_time
            elif current_engine_state == ReasoningEngineProto.State.CREATING or \
                    current_engine_state == ReasoningEngineProto.State.UPDATING:
                update_payload["deploymentStatus"] = "deploying_in_progress"
            elif current_engine_state == ReasoningEngineProto.State.FAILED:
                update_payload["deploymentStatus"] = "error"
                # Extract error message if possible from the engine resource (details might be limited)
                error_details = "Vertex AI reports engine state: FAILED."
                if hasattr(found_engine_proto, 'latest_failed_operation_error') and found_engine_proto.latest_failed_operation_error:
                    error_details = f"Vertex AI Error: {found_engine_proto.latest_failed_operation_error.message}"
                elif hasattr(found_engine_proto, 'error') and found_engine_proto.error: # Check if a general error field exists
                    error_details = f"Vertex AI Error Status: {found_engine_proto.error.message}"

                update_payload["deploymentError"] = error_details
            else: # DELETING, or unspecified states
                update_payload["deploymentStatus"] = f"unknown_vertex_state_{current_engine_state.name.lower()}"

            final_status_to_report = update_payload["deploymentStatus"]
            agent_doc_ref.update(update_payload)
            logger.info(f"Agent {agent_doc_id} Firestore status updated to: {final_status_to_report} based on Vertex state {current_engine_state.name}")
            return {"success": True, "status": final_status_to_report, "resourceName": found_engine_proto.name, "vertexState": current_engine_state.name}

        else: # No engine found at all
            logger.warning(f"Engine for agent {agent_doc_id} (expected display_name: '{expected_display_name}') not found on Vertex AI.")
            # Consider if enough time has passed since 'deploying_initiated' to mark as 'error_not_found'
            last_attempt_at = agent_data.get("lastDeploymentAttemptAt")
            status_if_not_found = "deploying_initiated" # Default if recently initiated

            if last_attempt_at:
                # If initiated more than, e.g., 30 minutes ago and still not found, mark as error.
                # Firestore timestamp vs now comparison is a bit tricky here.
                # For simplicity, if it was 'deploying_initiated' or 'deploying_in_progress' and now not found,
                # it's likely an issue.
                if agent_data.get("deploymentStatus") in ["deploying_initiated", "deploying_in_progress"]:
                    status_if_not_found = "error_not_found_after_init"
                    update_payload["deploymentError"] = "Engine not found on Vertex AI after deployment was initiated. It may have failed very early or display name mismatch."


            update_payload["deploymentStatus"] = status_if_not_found
            # Keep vertexAiResourceName as is, or delete it if we are sure it's gone.
            # update_payload["vertexAiResourceName"] = firestore.DELETE_FIELD

            final_status_to_report = status_if_not_found
            agent_doc_ref.update(update_payload)
            logger.info(f"Agent {agent_doc_id} Firestore status updated to: {final_status_to_report} (engine not found on Vertex).")
            return {"success": True, "status": final_status_to_report, "message": "Engine not found on Vertex AI with expected display name."}

    except Exception as e:
        tb_str = traceback.format_exc()
        logger.error(f"Error in check_vertex_agent_deployment_status for {agent_doc_id}: {str(e)}\n{tb_str}")
        # Do not update Firestore status here as it might overwrite a valid status with a temporary check error
        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Failed to check status: {str(e)[:200]}")
