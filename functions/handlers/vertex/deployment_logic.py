# functions/handlers/vertex/deployment_logic.py
import traceback
import re
import time
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
import os

from common.core import db, logger
from common.config import get_gcp_project_config # Assuming this provides project_id, location
from common.utils import initialize_vertex_ai # For vertexai.init
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_adk_agent_from_config,
    PYTHON_AGENT_CONSTANTS # Import this
)

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config (agentConfig) and Firestore document ID (agentDocId) are required.")

    original_config_name = agent_config_data.get('name', 'N/A')
    logger.info(f"Initiating deployment for agent '{agent_doc_id}'. Config name: '{original_config_name}'")

    try:
        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "deploying_initiated", "lastDeploymentAttemptAt": firestore.SERVER_TIMESTAMP,
            "vertexAiResourceName": firestore.DELETE_FIELD, "deploymentError": firestore.DELETE_FIELD,
            "lastDeployedAt": firestore.DELETE_FIELD
        })
        logger.info(f"Agent '{agent_doc_id}' status in Firestore set to 'deploying_initiated'.")
    except Exception as e:
        logger.error(f"CRITICAL: Failed to update agent '{agent_doc_id}' status to 'deploying_initiated': {e}. Aborting.")
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.ABORTED, message=f"Failed to set initial deployment status for agent {agent_doc_id}.")

    initialize_vertex_ai() # Ensures vertexai.init() is called
    adk_agent = None

    try:
        adk_agent = instantiate_adk_agent_from_config(agent_config_data, parent_adk_name_for_context=f"root_{agent_doc_id[:4]}")
        logger.info(f"Root ADK Agent object '{adk_agent.name}' of type {type(adk_agent).__name__} prepared for deployment.")
    except ValueError as e_instantiate:
        error_msg = f"Failed to instantiate agent hierarchy for '{agent_doc_id}' (Original Name: '{original_config_name}'): {str(e_instantiate)}"
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)
    except Exception as e_unhandled_instantiate:
        error_msg = f"Unexpected error during agent hierarchy instantiation for '{agent_doc_id}' (Original Name: '{original_config_name}'): {str(e_unhandled_instantiate)}"
        logger.error(f"{error_msg}\n{traceback.format_exc()}")
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

    if adk_agent is None: # Should be caught by above, but defensive
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

    requirements_list = [
        "google-cloud-aiplatform[adk,agent_engines]>=1.93.1", # Ensure correct ADK version for Agent Engine
        "gofannon", # If used
        "litellm>=1.72.0" # Ensure LiteLLM is present
    ]
    # Add custom tool repo URLs from agent_config_data.get("usedCustomRepoUrls", []) as before...
    custom_repo_urls = agent_config_data.get("usedCustomRepoUrls", [])
    if isinstance(custom_repo_urls, list):
        for repo_url_original in custom_repo_urls:
            if isinstance(repo_url_original, str) and repo_url_original.strip():
                # ... (Your existing logic for formatting repo_url_for_pip and adding to requirements_list)
                # This part of your code seemed mostly fine.
                repo_url_raw = repo_url_original.strip()

                if not (repo_url_raw.startswith("https://") or repo_url_raw.startswith("http://") or \
                        repo_url_raw.startswith("git@") or repo_url_raw.startswith("git+")): # Allow common git URL starts
                    logger.warning(f"Skipping custom repository URL with unrecognized scheme: {repo_url_raw}")
                    continue

                base_url_for_pip = repo_url_raw
                fragment_str = ""
                if "#" in repo_url_raw:
                    base_url_for_pip, fragment_str = repo_url_raw.split("#", 1)

                if base_url_for_pip.startswith("git@"):
                    path_with_potential_ref = base_url_for_pip.split(":", 1)[1]
                    host_part = base_url_for_pip.split(":")[0]
                    base_url_for_pip = f"git+ssh://{host_part}/{path_with_potential_ref}"
                elif not base_url_for_pip.startswith("git+"):
                    base_url_for_pip = "git+" + base_url_for_pip

                user_specified_ref = None
                match_repo_and_ref = re.match(r"^(.*\/[^@/]+(?:\.git)?)(?:@([^#]+))?$", base_url_for_pip)
                repo_path_for_install = base_url_for_pip

                if match_repo_and_ref:
                    repo_path_for_install = match_repo_and_ref.group(1)
                    if match_repo_and_ref.group(2):
                        user_specified_ref = match_repo_and_ref.group(2)
                        repo_path_for_install += f"@{user_specified_ref}"

                is_commit_hash_ref = bool(user_specified_ref and re.fullmatch(r"[0-9a-fA-F]{7,40}", user_specified_ref))

                parsed_egg_name = None
                if fragment_str and "egg=" in fragment_str:
                    egg_match_in_fragment = re.search(r"egg=([^&\[\]]+)", fragment_str)
                    if egg_match_in_fragment:
                        parsed_egg_name = egg_match_in_fragment.group(1)
                if not parsed_egg_name:
                    url_for_egg_guess = repo_url_raw.split("://",1)[-1].split('@')[0].split('#')[0]
                    egg_name_match_guess = re.search(r'/([^/]+?)(?:\.git)?$', url_for_egg_guess)
                    parsed_egg_name = egg_name_match_guess.group(1) if egg_name_match_guess else f"customrepo{int(time.time())}"
                sanitized_egg_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', parsed_egg_name)

                current_egg_name_for_fragment = sanitized_egg_name
                if not is_commit_hash_ref: # Add timestamp extra if not a commit hash
                    timestamp_val = int(time.time())
                    current_egg_name_for_fragment += f"[upd{timestamp_val}]"

                new_fragment_parts = [f"egg={current_egg_name_for_fragment}"]
                if fragment_str:
                    for part in fragment_str.split('&'):
                        if not part.startswith("egg="):
                            new_fragment_parts.append(part)
                final_install_string = f"{repo_path_for_install}#{'&'.join(new_fragment_parts)}"

                if final_install_string not in requirements_list:
                    requirements_list.append(final_install_string)
                    logger.info(f"Added custom tool repository to requirements: {final_install_string}")


    deployment_display_name = generate_vertex_deployment_display_name(original_config_name, agent_doc_id)

    # --- Collect Environment Variables for Vertex AI Agent Engine ---
    vertex_env_vars = {}
    # Standard ADK/Google vars
    project_id_for_vertex, location_for_vertex, _ = get_gcp_project_config()
    if project_id_for_vertex: vertex_env_vars["GOOGLE_CLOUD_PROJECT"] = project_id_for_vertex
    if location_for_vertex: vertex_env_vars["GOOGLE_CLOUD_LOCATION"] = location_for_vertex
    if "GOOGLE_GENAI_USE_VERTEXAI" in os.environ: # Propagate if set in function env
        vertex_env_vars["GOOGLE_GENAI_USE_VERTEXAI"] = os.environ["GOOGLE_GENAI_USE_VERTEXAI"]

        # LiteLLM Provider API Keys & Azure Specific Vars
    # These need to be present in the Firebase Function's environment to be passed to Vertex.
    # The UI should ensure users are aware of this, or allow specifying them at deployment time
    # which would then be securely passed to this function.
    for provider_id, consts in PYTHON_AGENT_CONSTANTS.items():
        env_key_name = consts.get("requiresApiKeyInEnv")
        if env_key_name and os.getenv(env_key_name):
            vertex_env_vars[env_key_name] = os.getenv(env_key_name)
            logger.info(f"Adding env var '{env_key_name}' for Vertex AI deployment from function's environment.")

        if provider_id == "azure": # Azure specific environment variables for LiteLLM
            for azure_env_key in ["AZURE_API_BASE", "AZURE_API_VERSION"]:
                if os.getenv(azure_env_key):
                    vertex_env_vars[azure_env_key] = os.getenv(azure_env_key)
                    logger.info(f"Adding Azure env var '{azure_env_key}' for Vertex AI deployment from function's environment.")
                    # Add any other critical environment variables needed by your tools or LiteLLM providers

    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'. Requirements: {requirements_list}. Environment Variables for Vertex: {list(vertex_env_vars.keys())}")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent: {deployment_display_name}"),

        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}'. Resource: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": f"Agent '{deployment_display_name}' deployment initiated."}
    except Exception as e_deploy:
        # ... (your existing error handling for deployment failure) ...
        tb_str = traceback.format_exc()
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}' (ADK name: '{getattr(adk_agent, 'name', 'N/A')}', Display: '{deployment_display_name}'): {str(e_deploy)}"
        logger.error(f"{error_message_for_log}\nFull Traceback:\n{tb_str}")

        firestore_error_message = f"Deployment Error: {type(e_deploy).__name__} - {str(e_deploy)[:500]}"
        if "validation error" in str(e_deploy).lower() and ("Agent" in str(e_deploy) or "LlmAgent" in str(e_deploy)):
            if "Extra inputs are not permitted" in str(e_deploy):
                firestore_error_message = f"ADK Pydantic validation error (likely during remote_app.create). Detail: {str(e_deploy)[:300]}"
            else:
                firestore_error_message = f"ADK Pydantic validation error for Agent/LlmAgent components. Detail: {str(e_deploy)[:300]}"

        db.collection("agents").document(agent_doc_id).update({
            "deploymentStatus": "error",
            "deploymentError": firestore_error_message,
            "lastDeployedAt": firestore.SERVER_TIMESTAMP
        })

        if isinstance(e_deploy, https_fn.HttpsError): raise
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment to Vertex AI failed: {str(e_deploy)[:300]}. See function logs for details.")

__all__ = ['_deploy_agent_to_vertex_logic']  