import os
import json
import importlib
import requests # For Gofannon manifest  

from firebase_functions import https_fn, options
from firebase_admin import initialize_app, firestore

initialize_app()

# Set CORS options for callable functions from your React app  
options.set_global_options(
    region="us-central1", # Or your preferred region  
    # cors=options.CorsOptions(
    #     cors_origins=[
    #         "http://localhost:3000", # For local React dev
    #         "https://your-firebase-app-name.web.app",
    #         "https://your-firebase-app-name.firebaseapp.com"
    #     ],
    #     cors_methods=["get", "post", "options"] # Add other methods if needed
    # )
)

# --- Vertex AI/ADK Specific Imports (place where needed) ---  
# These might need to be within function scopes if initialization is per-call  
# import vertexai  
# from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent  
# from vertexai.preview import reasoning_engines # For local testing within function if any  
# from vertexai import agent_engines as deployed_agent_engines # For deployed engines  

# --- Gofannon Tool Manifest ---  
GOFANNON_MANIFEST_URL = "https://raw.githubusercontent.com/The-AI-Alliance/gofannon/main/manifest.json" # HYPOTHETICAL URL  

@https_fn.on_call()
def get_gofannon_tool_manifest(req: https_fn.CallableRequest):
    """Fetches and stores/returns the Gofannon tool manifest."""
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required."
        )
    try:
        # For simplicity, fetch every time. Cache in Firestore for production.  
        # response = requests.get(GOFANNON_MANIFEST_URL)  
        # response.raise_for_status() # Raise an exception for HTTP errors  
        # tools_manifest = response.json()  

        # --- HYPOTHETICAL manifest structure ---  
        # For now, let's hardcode a simplified example structure  
        # In reality, you'd parse the Gofannon library or use a manifest file  
        tools_manifest = {
            "tools": [
                {
                    "id": "gofannon.open_notify_space.iss_locator.IssLocator",
                    "name": "ISS Locator",
                    "description": "Locates the International Space Station.",
                    "module_path": "gofannon.open_notify_space.iss_locator",
                    "class_name": "IssLocator"
                },
                # Add more known Gofannon tools or a way to discover them  
            ],
            "last_updated": firestore.SERVER_TIMESTAMP
        }

        db = firestore.client()
        manifest_ref = db.collection("gofannonToolManifest").document("latest")
        manifest_ref.set(tools_manifest) # Overwrite or update as needed  

        return {"success": True, "manifest": tools_manifest}
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Gofannon manifest: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="An unexpected error occurred.")


def _get_gcp_project_config():
    # In Cloud Functions, PROJECT_ID and LOCATION are often available as env vars  
    # or can be fetched. For Vertex AI, explicit setting is good.  
    project_id = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
    # Default location, make this configurable if needed  
    location = "us-central1"
    if not project_id:
        raise ValueError("GCP Project ID not found in environment variables.")
    staging_bucket = f"gs://{project_id}-adk-staging" # Ensure this bucket exists or can be created  
    return project_id, location, staging_bucket

def _initialize_vertex_ai():
    import vertexai # Import here to avoid issues if not always needed  
    project_id, location, staging_bucket = _get_gcp_project_config()
    try:
        vertexai.init(project=project_id, location=location, staging_bucket=staging_bucket)
        print(f"Vertex AI initialized for project {project_id} in {location} with staging bucket {staging_bucket}")
    except Exception as e:
        print(f"Error initializing Vertex AI: {e}")
        # Check if already initialized (less common in Cloud Functions, but can happen with global state)  
        if "Vertex AI SDK has already been initialized" not in str(e):
            raise
        print("Vertex AI SDK was already initialized.")


def _instantiate_tool(tool_config):
    """ Instantiates a tool based on its configuration. """
    # tool_config could be like:  
    # {"id": "gofannon.open_notify_space.iss_locator.IssLocator", "module_path": "...", "class_name": "..."}  
    # OR {"id": "adk.sample_tool", "type": "adk_prebuilt"}  
    print(f"Attempting to instantiate tool: {tool_config}")
    if tool_config.get("module_path") and tool_config.get("class_name"):
        try:
            module = importlib.import_module(tool_config["module_path"])
            ToolClass = getattr(module, tool_config["class_name"])
            # Assuming Gofannon tools might have an export_to_adk() or similar  
            # or are directly ADK compatible.  
            instance = ToolClass()
            if hasattr(instance, 'export_to_adk'):
                return instance.export_to_adk()
            return instance # Assuming it's an ADK compatible tool  
        except Exception as e:
            print(f"Error instantiating Gofannon tool {tool_config['id']}: {e}")
            raise
            # Add logic for ADK prebuilt tools if you have a way to identify them
    # elif tool_config.get("type") == "adk_prebuilt":  
    #     if tool_config["id"] == "adk.WeatherTool": # Example  
    #         from google.adk.tools import WeatherTool # Example  
    #         return WeatherTool(...)  
    else:
        raise ValueError(f"Unsupported tool configuration: {tool_config}")

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540) # Adjust resources  
def deploy_agent_to_vertex(req: https_fn.CallableRequest):
    """  
    Deploys an agent configuration to Vertex AI.  
    Expects agent_config in req.data.  
    """
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId") # Firestore document ID of the agent  

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config and ID required.")

    _initialize_vertex_ai() # Initialize Vertex AI SDK  
    from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # ADK imports  
    from vertexai import agent_engines as deployed_agent_engines # For deployed engines  


    try:
        print(f"Received agent config for deployment: {agent_config_data}")

        tools_list = []
        if agent_config_data.get("tools"):
            for tool_conf in agent_config_data["tools"]: # tool_conf is a dict like {"id": "...", "name": "..."}  
                # Fetch full tool details if only ID is stored, or assume full config is passed  
                # For now, assume tool_conf has 'module_path' and 'class_name' if it's from Gofannon  
                # This part needs robust logic to map stored tool IDs/configs to instantiable objects  
                # This might involve looking up the tool in the Gofannon manifest from Firestore  
                # For simplicity, we'll rely on the client sending enough info or hardcode a lookup  
                if "gofannon" in tool_conf["id"]: # Simple check  
                    # Example: Assuming client sends full config needed for instantiation,
                    # or you fetch it from the manifest stored in Firestore.
                    # This is a placeholder - you need a robust way to get instantiation details.
                    gofannon_tool_details = tool_conf # Simplified  
                    tools_list.append(_instantiate_tool(gofannon_tool_details))
                    # else: handle other ADK tools

        # Select Agent Type  
        agent_type_str = agent_config_data.get("agentType", "Agent") # Default to base Agent  
        AgentClass = Agent # Default  
        if agent_type_str == "SequentialAgent":
            AgentClass = SequentialAgent
        elif agent_type_str == "LoopAgent":
            AgentClass = LoopAgent
        elif agent_type_str == "ParallelAgent":
            AgentClass = ParallelAgent

        adk_agent = AgentClass(
            name=agent_config_data.get("name", "my-adk-agent"),
            model=agent_config_data.get("model", "gemini-1.5-flash-001"), # Ensure model is valid  
            description=agent_config_data.get("description", "A helpful agent."),
            instruction=agent_config_data.get("instruction", "You are a helpful agent."),
            tools=tools_list,
            # Add other parameters as needed: temperature, etc.  
        )
        print(f"ADK Agent object created: {adk_agent.name}")

        # ADK/Vertex AI deployment requirements  
        requirements = [
            "google-cloud-aiplatform[adk,agent_engines]>=1.93.0", # Match your version  
            "gofannon" # Ensure Gofannon is available in the deployment environment  
        ]
        # You might need to add specific versions of cloudpickle, pydantic if issues arise  
        # as seen in your colab logs.  

        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements,
            display_name=agent_config_data.get("name", "my-deployed-agent"),
            description=agent_config_data.get("description")
        )
        print(f"Agent deployment initiated. Resource name: {remote_app.resource_name}")

        # Update Firestore with the resource name and status  
        db = firestore.client()
        agent_ref = db.collection("agents").document(agent_doc_id)
        agent_ref.update({
            "vertexAiResourceName": remote_app.resource_name,
            "deploymentStatus": "deployed", # Or "deploying" and monitor LRO  
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })

        return {"success": True, "resourceName": remote_app.resource_name}

    except Exception as e:
        print(f"Error deploying agent: {e}")
        # Update Firestore with error status  
        db = firestore.client()
        agent_ref = db.collection("agents").document(agent_doc_id)
        agent_ref.update({"deploymentStatus": "error", "deploymentError": str(e)})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))


@https_fn.on_call(memory=options.MemoryOption.MB_512, timeout_sec=120) # Adjust  
def query_deployed_agent(req: https_fn.CallableRequest):
    """  
    Queries a deployed agent on Vertex AI.  
    Expects resourceName, message, userId, sessionId in req.data.  
    """
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    resource_name = req.data.get("resourceName")
    message = req.data.get("message")
    user_id = req.data.get("userId") # For ADK session  
    session_id_from_client = req.data.get("sessionId") # Client might manage session IDs  

    if not all([resource_name, message, user_id]):
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                                  message="Resource name, message, and userId are required.")

    _initialize_vertex_ai()
    from vertexai import agent_engines as deployed_agent_engines

    try:
        remote_app = deployed_agent_engines.get(resource_name)
        print(f"Retrieved remote app: {remote_app.name}")

        # Session management: ADK can create/get sessions.  
        # If the client provides a session ID, try to use it. Otherwise, create a new one.  
        # The `user_id` parameter in ADK `create_session` is important for tracking.  
        current_session_id = None
        if session_id_from_client:
            try:
                # Note: ADK's get_session might behave differently for deployed engines.  
                # Check SDK docs for how to manage/reuse sessions with deployed AgentEngines.  
                # For simplicity, we might create a new session or rely on implicit session handling  
                # if `session_id` for `stream_query` is sufficient.  
                # The Colab example uses `remote_app.create_session(user_id=...)`  
                # Let's assume a session per query for simplicity in this backend,  
                # or the client passes a session_id that `stream_query` can use.  
                # If create_session returns a dict, get the id.  
                session_obj = remote_app.create_session(user_id=user_id) # This user_id is for the ADK session.  
                current_session_id = session_obj.get("id") if isinstance(session_obj, dict) else session_obj.id
                print(f"Created/using session: {current_session_id} for user {user_id}")
            except Exception as e:
                print(f"Could not get/create session with ID {session_id_from_client}: {e}. Proceeding without explicit session ID if possible.")
                # Fallback or error based on ADK behavior  

        all_events = []
        final_text_response = ""

        # The user_id here for stream_query might be the ADK session's user_id  
        # The session_id is the one obtained from create_session or passed by client  
        for event in remote_app.stream_query(
                message=message,
                user_id=user_id, # ADK session user_id
                session_id=current_session_id # The ID of the session created above
        ):
            print(f"Agent event: {event}")
            all_events.append(event) # Store the raw event  
            if event.get('content') and event['content'].get('parts'):
                for part in event['content']['parts']:
                    if 'text' in part:
                        final_text_response += part['text']

                        # Save the run to Firestore
        db = firestore.client()
        agent_doc_id = resource_name.split("/")[-1] # Hacky way to get agent ID if it matches resource name part  
        # Better to pass agentDocId to this function too
        # This needs a proper way to link back to the agent's Firestore document  
        # For now, let's assume `resourceName` can be used to find the agent or we pass `agentDocId`  
        # agent_ref_for_run = db.collection("agents").document(???) # how to get agentDocId?  

        run_data = {
            "userId": req.auth.uid, # Firebase auth user  
            "adkUserId": user_id, # User ID used for ADK session  
            "sessionId": current_session_id,
            "resourceName": resource_name,
            "inputMessage": message,
            "outputEvents": all_events, # Store all events for detailed history  
            "finalResponse": final_text_response,
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        # To store under agents/{agentId}/runs/{runId}  
        # You'll need the Firestore agentId. This could be passed from client or derived.  
        # Assuming resourceName is unique and can be used as a key part, or client passes agentDocId.  
        # Let's assume the client will pass agentDocId that corresponds to the Firestore document.  
        firestore_agent_id = req.data.get("agentDocId")
        if firestore_agent_id:
            db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data)
        else:
            # Fallback, less ideal: store in a generic 'allAgentRuns' collection  
            db.collection("allAgentRuns").add(run_data)


        return {"success": True, "events": all_events, "responseText": final_text_response, "sessionId": current_session_id}

    except Exception as e:
        print(f"Error querying agent: {e}")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))

@https_fn.on_call()
def delete_vertex_agent(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required.")

    resource_name = req.data.get("resourceName")
    agent_doc_id = req.data.get("agentDocId")

    if not resource_name or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Resource name and agent ID required.")

    _initialize_vertex_ai()
    from vertexai import agent_engines as deployed_agent_engines

    try:
        print(f"Attempting to delete agent: {resource_name}")
        remote_app_to_delete = deployed_agent_engines.get(resource_name)
        remote_app_to_delete.delete(force=True)
        print(f"Agent {resource_name} deletion process initiated.")

        # Update Firestore  
        db = firestore.client()
        agent_ref = db.collection("agents").document(agent_doc_id)
        agent_ref.update({
            "vertexAiResourceName": firestore.DELETE_FIELD, # Remove the field  
            "deploymentStatus": "deleted",
            "lastDeployedAt": firestore.DELETE_FIELD
        })
        return {"success": True, "message": f"Agent {resource_name} deleted successfully."}
    except Exception as e:
        print(f"Error deleting agent {resource_name}: {e}")
        # Optionally update Firestore with error status for deletion  
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=str(e))  
