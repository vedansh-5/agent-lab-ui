# functions/handlers/vertex/deployment_logic.py
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines

from common.core import db, logger
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_adk_agent_from_config,
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

    initialize_vertex_ai()
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

    if adk_agent is None:
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}' (Original Name: '{original_config_name}'). This is unexpected after instantiation attempt."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=error_msg)

        # --- Deployment to Vertex AI ---
    # Base requirements
    requirements_list = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.1", "gofannon"]

    # Add custom tool repositories if provided
    custom_repo_urls = agent_config_data.get("usedCustomRepoUrls", [])
    if isinstance(custom_repo_urls, list):
        for repo_url in custom_repo_urls:
            if isinstance(repo_url, str) and repo_url.strip():
                # Basic validation: should start with http/https or git+
                if repo_url.startswith("https://") or repo_url.startswith("http://") or repo_url.startswith("git+"):
                    # ADK expects pip installable format, e.g., git+https://...
                    pip_install_url = repo_url if repo_url.startswith("git+") else f"git+{repo_url}"
                    if pip_install_url not in requirements_list: # Avoid duplicates
                        requirements_list.append(pip_install_url)
                        logger.info(f"Added custom tool repository to requirements: {pip_install_url}")
                else:
                    logger.warning(f"Skipping invalid custom repository URL: {repo_url}")
        logger.info(f"Final requirements list for ADK deployment: {requirements_list}")


    deployment_display_name = generate_vertex_deployment_display_name(original_config_name, agent_doc_id)

    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' (from original config '{original_config_name}') to Vertex AI with display_name: '{deployment_display_name}'. Requirements: {requirements_list}")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent (config: {original_config_name}) deployed via AgentLabUI: {deployment_display_name}")
        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}' (Original Name: '{original_config_name}'). Resource: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": f"Agent '{deployment_display_name}' deployment initiated."}

    except Exception as e_deploy:
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