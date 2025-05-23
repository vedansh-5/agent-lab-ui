import json
import asyncio
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from google.cloud.aiplatform_v1beta1 import ReasoningEngineServiceClient
from google.cloud.aiplatform_v1beta1.types import ReasoningEngine as ReasoningEngineProto
from vertexai import agent_engines as deployed_agent_engines # Specific import
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
from google.adk.sessions import VertexAiSessionService

from common.core import db, logger
from common.config import get_gcp_project_config
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_tool,
    sanitize_adk_agent_name,
    instantiate_adk_agent_from_config
)

# Note: Authentication checks (if req.auth) are expected to be handled by the
# https_fn.on_call wrapper in main.py, or can be added here if these logic
# functions might be called directly in other contexts.

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Agent config (agentConfig) and Firestore document ID (agentDocId) are required."
        )

    logger.info(f"Initiating deployment for agent '{agent_doc_id}'. Config keys: {list(agent_config_data.keys())}")

    # Update Firestore status to 'deploying_initiated'
    try:
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "deploying_initiated",
            "lastDeploymentAttemptAt": firestore.SERVER_TIMESTAMP,
            "vertexAiResourceName": firestore.DELETE_FIELD, # Clear old one
            "deploymentError": firestore.DELETE_FIELD,    # Clear old error
            "lastDeployedAt": firestore.DELETE_FIELD      # Clear old success time
        })
        logger.info(f"Agent '{agent_doc_id}' status in Firestore set to 'deploying_initiated'.")
    except Exception as e:
        # This is a critical failure if we can't even update Firestore before starting.
        logger.error(f"CRITICAL: Failed to update agent '{agent_doc_id}' status to 'deploying_initiated' "
                     f"before deployment attempt: {e}. Aborting deployment.")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.ABORTED,
            message=f"Failed to set initial deployment status in Firestore for agent {agent_doc_id}. Deployment aborted."
        )

    initialize_vertex_ai() # Ensures Vertex AI SDK is ready

    agent_type_str = agent_config_data.get("agentType")
    AgentClass = {
        "Agent": Agent, "SequentialAgent": SequentialAgent,
        "LoopAgent": LoopAgent, "ParallelAgent": ParallelAgent
    }.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent '{agent_doc_id}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error", "deploymentError": error_msg,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP # Mark time of this failed attempt
        })
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

    parent_agent_name_str = agent_config_data.get("name", f"default_agent_name_{agent_doc_id}")
    # Sanitize the user-provided name for use as the ADK agent's internal 'name' property
    parent_adk_name = sanitize_adk_agent_name(parent_agent_name_str, prefix_if_needed=f"agent_{agent_doc_id}_")
    agent_description = agent_config_data.get("description")

    common_args_for_parent = {"name": parent_adk_name, "description": agent_description}
    adk_agent = None
    instantiated_parent_tools = []
    for tool_conf in agent_config_data.get("tools", []):
        try:
            instantiated_parent_tools.append(instantiate_tool(tool_conf))
        except ValueError as e:
            logger.warning(f"Skipping tool for parent agent '{parent_adk_name}' due to error: {e}")


    if AgentClass == Agent:
        adk_agent = Agent(
            **common_args_for_parent,
            model=agent_config_data.get("model", "gemini-1.5-flash-001"),
            instruction=agent_config_data.get("instruction"),
            tools=instantiated_parent_tools
        )
    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config_data.get("childAgents", [])
        if not child_agent_configs:
            error_msg = f"{AgentClass.__name__} '{parent_adk_name}' requires at least one child agent, but none were provided."
            logger.error(error_msg)
            db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

        instantiated_child_agents = [
            instantiate_adk_agent_from_config(child_config, parent_adk_name_for_context=parent_adk_name, child_index=idx)
            for idx, child_config in enumerate(child_agent_configs)
        ]
        adk_agent = AgentClass(**common_args_for_parent, sub_agents=instantiated_child_agents)
    elif AgentClass == LoopAgent:
        # For LoopAgent, the 'instruction' and 'tools' from the main config apply to the looped agent.
        loop_child_adk_name = sanitize_adk_agent_name(f"{parent_adk_name}_looped_child", prefix_if_needed="looped_")
        looped_child_agent_instance = Agent(
            name=loop_child_adk_name,
            model=agent_config_data.get("model", "gemini-1.5-flash-001"),
            instruction=agent_config_data.get("instruction"),
            tools=instantiated_parent_tools # Tools are for the agent being looped
        )
        max_loops_val = int(agent_config_data.get("maxLoops", 3))
        adk_agent = LoopAgent(**common_args_for_parent, agent=looped_child_agent_instance, max_loops=max_loops_val)

    if adk_agent is None:
        # This should ideally be caught by previous checks, but as a safeguard:
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}' with type '{agent_type_str}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise ValueError(error_msg) # This will be caught by the decorator

    logger.info(f"ADK Agent object '{adk_agent.name}' of type {AgentClass.__name__} prepared for deployment.")

    # Define requirements for the ADK deployment package
    # Ensure gofannon is available if Gofannon tools are used, and the ADK version is compatible.
    requirements_list = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.0", "gofannon"] # Adjust as needed

    # Generate the display name for Vertex AI Reasoning Engine
    # Use the original user-provided name from config for better readability in Vertex AI Console
    config_name_for_display = agent_config_data.get("name", agent_doc_id)
    deployment_display_name = generate_vertex_deployment_display_name(config_name_for_display, agent_doc_id)

    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'.")

    try:
        # This is the potentially long-running call to Vertex AI
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent deployed via AgentLabUI: {deployment_display_name}")
            # location can be specified if not default from vertexai.init()
        )
        # If create() completes successfully within the Cloud Function timeout
        logger.info(f"Vertex AI agent deployment successful (create call returned) for '{agent_doc_id}'. "
                    f"Resource name: {remote_app.resource_name}, Display name: '{deployment_display_name}'.")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name,
            "deploymentStatus": "deployed", # Or 'deploying_in_progress' if create is async and needs polling
            "lastDeployedAt": firestore.SERVER_TIMESTAMP,
            "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name,
                "message": f"Agent deployment for '{deployment_display_name}' initiated and confirmed completed by Vertex AI."}

    except Exception as e:
        # This block handles errors from adk_agent instantiation (if not caught earlier)
        # OR errors from deployed_agent_engines.create() if it fails relatively quickly
        # (e.g., bad ADK config, permissions issues, immediate Vertex AI rejection).
        # If the Cloud Function times out during the .create() call, this block is NOT hit for the timeout itself.
        # The client would receive a DEADLINE_EXCEEDED error from Firebase Functions.
        # Firestore status would remain 'deploying_initiated', and polling from client would be needed.

        tb_str = traceback.format_exc()
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}' (ADK name: '{adk_agent.name}', Display: '{deployment_display_name}'): {str(e)}"
        logger.error(f"{error_message_for_log}\n{tb_str}")

        # Update Firestore to 'error' because the deployment call itself failed or setup failed.
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": str(e)[:1000], # Store a snippet of the error
            "lastDeployedAt": firestore.SERVER_TIMESTAMP # Mark time of this failed attempt
        })

        if isinstance(e, https_fn.HttpsError): # Re-raise if already an HttpsError
            raise
            # Specific error checks for user-friendly messages
        if "validation error" in str(e).lower() and "pydantic" in str(e).lower():
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
                message=f"Agent configuration validation failed: {str(e)[:300]}. Check agent names and other parameters."
            )
            # General internal error for other exceptions
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Deployment to Vertex AI failed: {str(e)[:300]}"
        )


def _delete_vertex_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    agent_doc_id = req.data.get("agentDocId")

    if not resource_name or not agent_doc_id:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="Vertex AI resourceName and agentDocId are required for deletion."
        )

    logger.info(f"Attempting to delete Vertex AI agent '{resource_name}' (Firestore doc: '{agent_doc_id}').")
    initialize_vertex_ai() # Ensure SDK is ready

    try:
        # Get the deployed agent engine object
        agent_to_delete = deployed_agent_engines.get(resource_name)
        agent_to_delete.delete(force=True) # force=True to attempt deletion even if not in ideal state
        logger.info(f"Vertex AI Agent '{resource_name}' deletion process successfully initiated.")

        # Update Firestore to reflect deletion
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": firestore.DELETE_FIELD,
            "deploymentStatus": "deleted", # Or 'deleted_from_vertex'
            "lastDeployedAt": firestore.DELETE_FIELD,
            "deploymentError": firestore.DELETE_FIELD,
            "lastStatusCheckAt": firestore.SERVER_TIMESTAMP # Mark time of this action
        })
        return {"success": True, "message": f"Agent '{resource_name}' deletion initiated successfully."}
    except Exception as e:
        logger.error(f"Error deleting Vertex AI agent '{resource_name}': {e}")
        tb_str = traceback.format_exc()
        logger.debug(f"Traceback for delete_vertex_agent error:\n{tb_str}")

        # Handle "Not Found" specifically
        if "NotFound" in str(e) or "could not be found" in str(e).lower():
            logger.warn(f"Agent '{resource_name}' was not found on Vertex AI during deletion attempt. Updating Firestore.")
            db.collection("agents").document(agent_doc_id).update({
                "vertexAiResourceName": firestore.DELETE_FIELD,
                "deploymentStatus": "not_found_on_vertex",
                "lastDeployedAt": firestore.DELETE_FIELD,
                "deploymentError": "Agent not found on Vertex AI during deletion attempt.",
                "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
            })
            # It's not an error from the user's perspective if it's already gone
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND, # Let client know it wasn't found
                message=f"Agent '{resource_name}' not found on Vertex AI. It might have been already deleted."
            )

            # For other errors, raise an internal error
        if not isinstance(e, https_fn.HttpsError):
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"Failed to delete agent '{resource_name}': {str(e)[:200]}"
            )
        raise # Re-raise if it was already an HttpsError

async def _query_async_logic_internal(resource_name, message_text, adk_user_id, session_id_from_client, project_id, location):
    """Internal async logic for querying the agent.
    Handles async session management and then iterates (synchronously) over the agent's response stream.
    """
    _current_session_id_from_client = session_id_from_client
    current_adk_session_id = None

    # Initialize Vertex AI session service (these are async methods)
    session_service = VertexAiSessionService(project=project_id, location=location)
    # Get the remote application (deployed agent engine)
    # .get() is synchronous
    remote_app = deployed_agent_engines.get(resource_name)
    logger.info(f"Query Logic (Prep): Retrieved remote app for querying: {remote_app.name} (Display: {remote_app.display_name})")

    # Attempt to retrieve an existing ADK session if a session_id is provided
    if _current_session_id_from_client:
        logger.info(f"Query Logic (Prep): Attempting to retrieve ADK session: '{_current_session_id_from_client}' "
                    f"for ADK user: '{adk_user_id}' on app: '{resource_name}'")
        try:
            # get_session is an async method
            retrieved_session = await session_service.get_session(
                app_name=resource_name, user_id=adk_user_id, session_id=_current_session_id_from_client
            )
            if retrieved_session:
                current_adk_session_id = retrieved_session.id
                logger.info(f"Query Logic (Prep): Successfully retrieved existing ADK session ID: {current_adk_session_id}")
            else:
                logger.warn(f"Query Logic (Prep): get_session for '{_current_session_id_from_client}' returned None. Will create a new session.")
        except Exception as e:
            logger.warn(f"Query Logic (Prep): Failed to retrieve session '{_current_session_id_from_client}'. Error: {e}. Will create a new session.")

            # If no existing session was found or retrieved, create a new one
    if not current_adk_session_id:
        logger.info(f"Query Logic (Prep): Creating new ADK session for ADK user: '{adk_user_id}' on app: '{resource_name}'")
        # create_session is an async method
        new_session = await session_service.create_session(app_name=resource_name, user_id=adk_user_id)
        current_adk_session_id = new_session.id
        logger.info(f"Query Logic (Prep): Created new ADK session ID: {current_adk_session_id}")

    if not current_adk_session_id:
        # This should not happen if session creation is successful
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Failed to initialize or retrieve agent session ID.")

    logger.info(f"Query Logic (Iteration): Using ADK session: '{current_adk_session_id}' for ADK user: '{adk_user_id}' with message: '{message_text[:100]}...'")
    all_events, final_text_response = [], ""
    event_idx = 0

    # stream_query on DeployedAgentEngine returns a SYNCHRONOUS generator.
    # Therefore, we use a standard 'for' loop here.
    # This loop will run synchronously and block within this async function.
    for event in remote_app.stream_query(
            message=message_text, user_id=adk_user_id, session_id=current_adk_session_id
    ):
        logger.info(f"Query Logic (Event {event_idx}): type={event.get('type')}, "
                     f"content_keys={list(event.get('content', {}).keys()) if event.get('content') else 'NoContent'}")
        all_events.append(event) # Store all events for potential full history or debugging

        # Extract text from 'text_delta' events (common for Gemini-based agents)
        if event.get('type') == 'text_delta' and event.get('content') and event['content'].get('parts'):
            for part in event['content']['parts']:
                if 'text' in part:
                    final_text_response += part['text']
                    # Log tool outputs if present
        elif event.get('type') == 'tool_code_execution_output' and event.get('content') and event['content'].get('parts'):
            for part in event['content']['parts']:
                if 'text' in part: # Some tool outputs might just be structured data
                    logger.info(f"Query Logic (Tool Output): {part['text'][:200]}...")

        event_idx += 1

        # If no 'text_delta' events produced text, try to find text in other final events
    if not final_text_response and all_events:
        logger.info("Query Logic (Fallback Text): No 'text_delta' events found. Checking last events for any text part.")
        for event in reversed(all_events): # Check from the end
            if event.get('content') and event['content'].get('parts'):
                temp_text = ""
                for part in event['content']['parts']:
                    if 'text' in part:
                        temp_text += part['text']
                if temp_text:
                    final_text_response = temp_text
                    logger.info(f"Query Logic (Fallback Text): Found text in non-text_delta event (type: {event.get('type')}): {final_text_response[:100]}...")
                    break # Use the first text found from the end

    logger.info(f"Query Logic (Result): Final accumulated response text for session '{current_adk_session_id}': {final_text_response[:200]}...")
    logger.info(f"Query Logic (Result): Number of events: {len(all_events)}")

    return {"events": all_events, "responseText": final_text_response, "adkSessionId": current_adk_session_id}

def _query_deployed_agent_logic(req: https_fn.CallableRequest):
    resource_name = req.data.get("resourceName")
    message_text = req.data.get("message")
    adk_user_id = req.data.get("adkUserId") # This is crucial, ADK uses this for session management
    session_id_from_client = req.data.get("sessionId") # Optional, client can pass to continue a session
    firestore_agent_id = req.data.get("agentDocId") # For logging the run to the correct agent in Firestore
    firebase_auth_uid = req.auth.uid if req.auth else "unknown_auth_uid" # UID of the Firebase authenticated user

    if not all([resource_name, message_text, adk_user_id, firestore_agent_id]):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="resourceName, message, adkUserId, and agentDocId are required to query an agent."
        )

    logger.info(f"Query Agent (Sync Wrapper): Agent '{resource_name}' (FS doc: '{firestore_agent_id}') "
                f"by ADK user '{adk_user_id}', client session: '{session_id_from_client or 'None'}'.")

    initialize_vertex_ai() # Ensure Vertex AI SDK is ready
    project_id, location, _ = get_gcp_project_config() # Needed for session service and error messages

    result_data = {}
    try:
        # asyncio.run() is the standard way to run an async function from sync code.
        # Handling for "event loop is already running" is important in some environments
        # (like Jupyter notebooks or certain web frameworks), less common in standard CFs
        # but good to keep.
        try:
            # Pass necessary parameters to the internal async logic function
            result_data = asyncio.run(_query_async_logic_internal(
                resource_name, message_text, adk_user_id, session_id_from_client, project_id, location
            ))
        except RuntimeError as e:
            if "cannot be called when another asyncio event loop is running" in str(e) or \
                    "asyncio.run() cannot be called from a running event loop" in str(e):
                logger.warning("asyncio.run() failed as a loop is already running. Attempting to use existing loop for query.")
                loop = asyncio.get_event_loop()
                if loop.is_closed():
                    logger.info("Event loop was closed, creating a new one for query.")
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    result_data = loop.run_until_complete(_query_async_logic_internal(
                        resource_name, message_text, adk_user_id, session_id_from_client, project_id, location
                    ))
                    # loop.close() # Closing manually created loops can be tricky if they might be reused.
                    # For CFs, often okay as instance might be short-lived.
                else:
                    logger.info("Using existing, running event loop for query.")
                    result_data = loop.run_until_complete(_query_async_logic_internal(
                        resource_name, message_text, adk_user_id, session_id_from_client, project_id, location
                    ))
            else:
                raise # Re-raise other RuntimeError exceptions

        if not result_data: # Should not happen if async logic completes
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message="Async query logic did not return data.")


            # Log the agent run to Firestore
        run_data_to_store = {
            "firebaseUserId": firebase_auth_uid, # The user authenticated with Firebase
            "adkUserId": adk_user_id,          # The identifier used by ADK for session affinity
            "adkSessionId": result_data["adkSessionId"],
            "vertexAiResourceName": resource_name,
            "inputMessage": message_text,
            "outputEventsRaw": json.dumps(result_data["events"]), # Store all events as a JSON string
            "finalResponseText": result_data["responseText"],
            "timestamp": firestore.SERVER_TIMESTAMP
        }
        # Add to subcollection "runs" under the specific agent document
        db.collection("agents").document(firestore_agent_id).collection("runs").add(run_data_to_store)
        logger.info(f"Query Agent (Sync Wrapper): Agent run successfully saved to Firestore for agent '{firestore_agent_id}', ADK session '{result_data['adkSessionId']}'.")

        # Return success and the data from the async logic
        return {"success": True, **result_data}

    except Exception as e:
        tb_str_query = traceback.format_exc()
        logger.error(f"Error in query_deployed_agent_logic (sync or async part) for agent '{resource_name}': {e}\n{tb_str_query}")

        # Specific check for "Not Found" errors related to the Reasoning Engine/Deployed Agent
        # The error messages from Vertex AI can vary slightly.
        err_str_lower = str(e).lower()
        is_not_found_error = (
                "NotFound" in str(e) and # gRPC status
                (f"projects/{project_id}/locations/{location}/reasoningEngines/{resource_name}".lower() in err_str_lower or
                 f"deployedagent \"{resource_name}\" not found" in err_str_lower or # ADK SDK message
                 f"reasoning engine {resource_name} not found" in err_str_lower or # Vertex AI API message
                 f"resource not found: locations/{location}/reasoningengines/{resource_name}" in err_str_lower) # Another variation
        )

        if is_not_found_error:
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.NOT_FOUND,
                message=f"Agent resource '{resource_name}' not found on Vertex AI or is not ready. Please ensure it's deployed correctly."
            )

            # If not a specific known error, re-raise to be caught by the main decorator
        # The decorator will convert it to a generic INTERNAL HttpsError.
        raise # This will be caught by @handle_exceptions_and_log if applied in main.py


def _check_vertex_agent_deployment_status_logic(req: https_fn.CallableRequest):
    agent_doc_id = req.data.get("agentDocId")
    if not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="agentDocId is required.")

    logger.info(f"Checking deployment status for agent Firestore doc ID: {agent_doc_id}")
    initialize_vertex_ai() # Ensures project/location are set for any subsequent SDK calls

    project_id, location, _ = get_gcp_project_config()
    # Client for ReasoningEngineService (used by ADK under the hood for some operations)
    client_options = {"api_endpoint": f"{location}-aiplatform.googleapis.com"}
    reasoning_engine_client = ReasoningEngineServiceClient(client_options=client_options)
    parent_path = f"projects/{project_id}/locations/{location}"

    try:
        agent_doc_ref = db.collection("agents").document(agent_doc_id)
        agent_snap = agent_doc_ref.get()
        if not agent_snap.exists:
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.NOT_FOUND, message=f"Agent document {agent_doc_id} not found in Firestore.")
        agent_data = agent_snap.to_dict()

        # Determine the expected display name on Vertex AI
        expected_config_name = agent_data.get("name") # User-defined name from agent config
        expected_vertex_display_name = generate_vertex_deployment_display_name(expected_config_name, agent_doc_id)
        current_stored_resource_name = agent_data.get("vertexAiResourceName")

        logger.info(f"For agent '{agent_doc_id}', expected Vertex display name: '{expected_vertex_display_name}'. "
                    f"Currently stored resource_name in Firestore: '{current_stored_resource_name or 'None'}'.")

        found_engine_proto = None # This will hold the ReasoningEngine protobuf object if found
        identification_method = "" # How the engine was found (by stored name or by listing)

        # 1. Try to get the engine using the stored resource_name (if available)
        if current_stored_resource_name:
            try:
                engine = reasoning_engine_client.get_reasoning_engine(name=current_stored_resource_name)
                # Verify if the display name matches what we expect for this agentDocId
                if engine.display_name == expected_vertex_display_name:
                    found_engine_proto = engine
                    identification_method = "by stored resource_name"
                    logger.info(f"Successfully fetched engine by stored resource_name: {current_stored_resource_name}")
                else:
                    logger.warning(f"Stored resource_name '{current_stored_resource_name}' for agent '{agent_doc_id}' "
                                   f"has a mismatched display_name on Vertex AI ('{engine.display_name}' vs expected "
                                   f"'{expected_vertex_display_name}'). Will attempt to find by display_name listing.")
                    # Optionally, consider clearing the mismatched current_stored_resource_name from Firestore here
                    # agent_doc_ref.update({"vertexAiResourceName": firestore.DELETE_FIELD, "deploymentError": "Mismatched display name on Vertex."})
            except Exception as e: # Catches google.api_core.exceptions.NotFound and other errors
                logger.info(f"Failed to get engine by stored resource_name '{current_stored_resource_name}' "
                            f"for agent '{agent_doc_id}'. Error: {e}. Will attempt listing by display_name.")
                if "NotFound" in str(e) or "could not be found" in str(e).lower():
                    # If the stored resource name is definitively not found on Vertex, clear it from Firestore
                    # and mark status appropriately.
                    agent_doc_ref.update({
                        "vertexAiResourceName": firestore.DELETE_FIELD,
                        "deploymentStatus": "error_resource_vanished", # A specific status
                        "deploymentError": "Stored Vertex AI resource was not found.",
                        "lastStatusCheckAt": firestore.SERVER_TIMESTAMP
                    })
                    # Continue to try finding by display name, in case a new deployment exists.

        # 2. If not found by stored name, or if stored name was problematic, try listing by display_name
        if not found_engine_proto:
            logger.info(f"Attempting to find engine for agent '{agent_doc_id}' by listing with "
                        f"display_name filter: 'display_name=\"{expected_vertex_display_name}\"'.")
            # Create a request to list reasoning engines with a filter on the display_name
            list_request = ReasoningEngineServiceClient.list_reasoning_engines_request_type(
                parent=parent_path,
                filter=f'display_name="{expected_vertex_display_name}"'
            )
            # The list operation is paginated, but display_names should ideally be unique per project/location if managed well.
            engine_list_results = list(reasoning_engine_client.list_reasoning_engines(request=list_request))

            if engine_list_results:
                if len(engine_list_results) > 1:
                    logger.warning(f"Multiple ({len(engine_list_results)}) engines found for display_name '{expected_vertex_display_name}'. "
                                   f"Using the first one: {[e.name for e in engine_list_results]}. "
                                   "This may indicate a non-unique display name strategy or old/stale deployments.")
                found_engine_proto = engine_list_results[0] # Take the first one found
                identification_method = "by listing via display_name"
                logger.info(f"Found engine '{found_engine_proto.name}' via display_name listing.")
                # If found by listing, update Firestore with the correct resource_name if it was missing or different
                if current_stored_resource_name != found_engine_proto.name:
                    agent_doc_ref.update({"vertexAiResourceName": found_engine_proto.name})
                    logger.info(f"Updated Firestore resource_name for '{agent_doc_id}' to '{found_engine_proto.name}'.")
            else:
                logger.info(f"No engine found for agent '{agent_doc_id}' with display_name '{expected_vertex_display_name}' via listing.")

                # --- Process the found engine (or lack thereof) and update Firestore ---
        firestore_update_payload = {"lastStatusCheckAt": firestore.SERVER_TIMESTAMP}
        final_status_to_report_to_client = ""
        vertex_resource_name_for_client = None
        vertex_state_for_client = None

        if found_engine_proto:
            logger.info(f"Engine '{found_engine_proto.name}' (State on Vertex: {found_engine_proto.state.name}) "
                        f"identified for agent '{agent_doc_id}' via {identification_method}.")
            current_engine_vertex_state = found_engine_proto.state
            vertex_resource_name_for_client = found_engine_proto.name
            vertex_state_for_client = current_engine_vertex_state.name

            firestore_update_payload["vertexAiResourceName"] = found_engine_proto.name # Ensure it's up-to-date

            if current_engine_vertex_state == ReasoningEngineProto.State.ACTIVE:
                firestore_update_payload["deploymentStatus"] = "deployed"
                firestore_update_payload["deploymentError"] = firestore.DELETE_FIELD # Clear any old error
                # Update lastDeployedAt using engine's update_time for accuracy, or server timestamp as fallback
                engine_update_time_fs = firestore.Timestamp.from_pb(found_engine_proto.update_time) if hasattr(found_engine_proto, 'update_time') and found_engine_proto.update_time else firestore.SERVER_TIMESTAMP
                firestore_update_payload["lastDeployedAt"] = engine_update_time_fs
            elif current_engine_vertex_state == ReasoningEngineProto.State.CREATING or \
                    current_engine_vertex_state == ReasoningEngineProto.State.UPDATING:
                firestore_update_payload["deploymentStatus"] = "deploying_in_progress"
                # Keep any existing deploymentError, or clear if appropriate
            elif current_engine_vertex_state == ReasoningEngineProto.State.FAILED:
                firestore_update_payload["deploymentStatus"] = "error"
                error_details = "Vertex AI reports engine state: FAILED."
                # Attempt to get more specific error from the engine proto if available
                # This structure can vary, check proto definition for ReasoningEngine.error or similar fields.
                # Example: if hasattr(found_engine_proto, 'error_details') and found_engine_proto.error_details:
                #    error_details = f"Vertex AI Error: {found_engine_proto.error_details.message}"
                # Using a generic message if specific error field is not readily known/stable.
                if hasattr(found_engine_proto, 'latest_failed_operation_error') and found_engine_proto.latest_failed_operation_error:
                    error_details = f"Vertex AI Error: {found_engine_proto.latest_failed_operation_error.message}"
                elif hasattr(found_engine_proto, 'error') and found_engine_proto.error: # Check if a general error field exists
                    error_details = f"Vertex AI Error Status: {found_engine_proto.error.message}"
                firestore_update_payload["deploymentError"] = error_details
            else: # DELETING, or other unspecified states
                firestore_update_payload["deploymentStatus"] = f"unknown_vertex_state_{current_engine_vertex_state.name.lower()}"
                logger.warning(f"Engine '{found_engine_proto.name}' is in an unhandled state: {current_engine_vertex_state.name}")

            final_status_to_report_to_client = firestore_update_payload["deploymentStatus"]

        else: # No engine found on Vertex AI at all for this agent
            logger.warning(f"Engine for agent '{agent_doc_id}' (expected display_name: '{expected_vertex_display_name}') "
                           "was NOT found on Vertex AI by any method.")
            # Determine appropriate status if not found.
            # If it was 'deploying_initiated' or 'deploying_in_progress', and now not found, it's an error.
            current_fs_status = agent_data.get("deploymentStatus")
            if current_fs_status in ["deploying_initiated", "deploying_in_progress"]:
                firestore_update_payload["deploymentStatus"] = "error_not_found_after_init"
                firestore_update_payload["deploymentError"] = ("Engine not found on Vertex AI after deployment was initiated. "
                                                               "It may have failed very early, had a display name mismatch, or was deleted externally.")
            elif current_fs_status == "deployed": # Was deployed, but now gone
                firestore_update_payload["deploymentStatus"] = "error_resource_vanished"
                firestore_update_payload["deploymentError"] = "Previously deployed engine is no longer found on Vertex AI."
            else: # e.g., 'not_deployed', 'error', 'deleted' - keep or set to a generic 'not_found'
                firestore_update_payload["deploymentStatus"] = "not_found_on_vertex" # Or keep existing if it reflects a deliberate undeployed state

            # Clear resource name if we are sure it's gone and we couldn't find a replacement
            firestore_update_payload["vertexAiResourceName"] = firestore.DELETE_FIELD
            final_status_to_report_to_client = firestore_update_payload["deploymentStatus"]

            # Apply the Firestore updates
        agent_doc_ref.update(firestore_update_payload)
        logger.info(f"Agent '{agent_doc_id}' Firestore status updated to: '{final_status_to_report_to_client}' "
                    f"(based on Vertex check).")

        # Prepare response for the client
        response_payload = {
            "success": True,
            "status": final_status_to_report_to_client,
            "resourceName": vertex_resource_name_for_client, # null if not found
            "vertexState": vertex_state_for_client # null if not found
        }
        if not vertex_resource_name_for_client:
            response_payload["message"] = f"Engine with display name '{expected_vertex_display_name}' not found on Vertex AI."

        return response_payload

    except Exception as e:
        # This catches errors during the check logic itself (e.g., Firestore access issues, unexpected client errors)
        tb_str = traceback.format_exc()
        logger.error(f"Error in _check_vertex_agent_deployment_status_logic for agent '{agent_doc_id}': {str(e)}\n{tb_str}")
        # Do NOT update Firestore status here, as it might overwrite a valid status with a temporary check error.
        # Let the @handle_exceptions_and_log decorator handle this.
        if isinstance(e, https_fn.HttpsError): raise
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"Failed to check agent deployment status: {str(e)[:200]}"
        )


__all__ = [
    '_deploy_agent_to_vertex_logic',
    '_delete_vertex_agent_logic',
    '_query_deployed_agent_logic',
    '_check_vertex_agent_deployment_status_logic'
]