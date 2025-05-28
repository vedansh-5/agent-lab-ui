# functions/handlers/deployment_logic.py
import traceback
from firebase_admin import firestore
from firebase_functions import https_fn
from vertexai import agent_engines as deployed_agent_engines
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent

from common.core import db, logger
from common.utils import initialize_vertex_ai
from common.adk_helpers import (
    generate_vertex_deployment_display_name,
    instantiate_tool,
    sanitize_adk_agent_name,
    instantiate_adk_agent_from_config
)

def _deploy_agent_to_vertex_logic(req: https_fn.CallableRequest):
    agent_config_data = req.data.get("agentConfig")
    agent_doc_id = req.data.get("agentDocId")

    if not agent_config_data or not agent_doc_id:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message="Agent config (agentConfig) and Firestore document ID (agentDocId) are required.")

    logger.info(f"Initiating deployment for agent '{agent_doc_id}'. Config keys: {list(agent_config_data.keys())}")

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

    agent_type_str = agent_config_data.get("agentType")
    AgentClass = {"Agent": Agent, "SequentialAgent": SequentialAgent, "LoopAgent": LoopAgent, "ParallelAgent": ParallelAgent}.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent '{agent_doc_id}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg, "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

    parent_agent_name_str = agent_config_data.get("name", f"default_agent_name_{agent_doc_id}")
    parent_adk_name = sanitize_adk_agent_name(parent_agent_name_str, prefix_if_needed=f"agent_{agent_doc_id}_")

    instantiated_parent_tools = []
    for tool_conf in agent_config_data.get("tools", []):
        try:
            instantiated_parent_tools.append(instantiate_tool(tool_conf))
        except ValueError as e:
            logger.warning(f"Skipping tool for parent agent '{parent_adk_name}' due to error: {e}")

    adk_agent_tool_config = None
    if agent_config_data.get("enableCodeExecution", False):
        adk_agent_tool_config = {"code_execution_config": {"enabled": True}}
        logger.info(f"Code execution will be enabled for agent '{parent_adk_name}' or its looped child via tool_config.")
    else:
        logger.info(f"Code execution will be DISABLED for agent '{parent_adk_name}' or its looped child (tool_config is None).")

    adk_agent = None

    # Explicitly define constructor arguments for Agent to avoid passing disallowed kwargs
    agent_constructor_kwargs = {
        "name": parent_adk_name,
        "description": agent_config_data.get("description"),
        "model": agent_config_data.get("model", "gemini-1.5-flash-001"),
        "instruction": agent_config_data.get("instruction"),
        "tools": instantiated_parent_tools,
        "tool_config": adk_agent_tool_config
    }

    if AgentClass == Agent:
        logger.debug(f"DEBUG: Instantiating Agent with explicitly built kwargs: {list(agent_constructor_kwargs.keys())}")
        try:
            adk_agent = Agent(**agent_constructor_kwargs)
        except Exception as e_agent_init:
            logger.error(f"Pydantic or Init Error during Agent instantiation: {e_agent_init}")
            logger.error(f"Args passed: {agent_constructor_kwargs}")
            raise e_agent_init

    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config_data.get("childAgents", [])
        if not child_agent_configs:
            error_msg = f"{AgentClass.__name__} '{parent_adk_name}' requires at least one child agent."
            logger.error(error_msg)
            db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
            raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT, message=error_msg)

        instantiated_child_agents = [
            instantiate_adk_agent_from_config(child_config, parent_adk_name_for_context=parent_adk_name, child_index=idx)
            for idx, child_config in enumerate(child_agent_configs)
        ]
        orchestrator_kwargs = {
            "name": parent_adk_name,
            "description": agent_config_data.get("description"),
            "sub_agents": instantiated_child_agents
        }
        logger.debug(f"DEBUG: Instantiating {AgentClass.__name__} with explicitly built kwargs: {list(orchestrator_kwargs.keys())}")
        adk_agent = AgentClass(**orchestrator_kwargs)

    elif AgentClass == LoopAgent:
        loop_child_adk_name = sanitize_adk_agent_name(f"{parent_adk_name}_looped_child", prefix_if_needed="looped_")
        looped_child_kwargs = {
            **agent_constructor_kwargs,
            "name": loop_child_adk_name,
        }
        logger.debug(f"DEBUG: Instantiating Looped Child Agent with explicitly built kwargs: {list(looped_child_kwargs.keys())}")
        try:
            looped_child_agent_instance = Agent(**looped_child_kwargs)
        except Exception as e_loop_child_init:
            logger.error(f"Pydantic or Init Error during Looped Child Agent instantiation: {e_loop_child_init}")
            logger.error(f"Args passed to looped child: {looped_child_kwargs}")
            raise e_loop_child_init

        max_loops_val = int(agent_config_data.get("maxLoops", 3))
        loop_agent_kwargs = {
            "name": parent_adk_name,
            "description": agent_config_data.get("description"),
            "agent": looped_child_agent_instance,
            "max_loops": max_loops_val
        }
        logger.debug(f"DEBUG: Instantiating LoopAgent with explicitly built kwargs: {list(loop_agent_kwargs.keys())}")
        adk_agent = LoopAgent(**loop_agent_kwargs)

    if adk_agent is None:
        error_msg = f"ADK Agent object could not be constructed for agent '{agent_doc_id}' type '{agent_type_str}'."
        logger.error(error_msg)
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": error_msg})
        raise ValueError(error_msg)

    logger.info(f"ADK Agent object '{adk_agent.name}' of type {AgentClass.__name__} prepared for deployment.")
    requirements_list = ["google-cloud-aiplatform[adk,agent_engines]>=1.93.1", "gofannon"]
    config_name_for_display = agent_config_data.get("name", agent_doc_id)
    deployment_display_name = generate_vertex_deployment_display_name(config_name_for_display, agent_doc_id)
    logger.info(f"Attempting to deploy ADK agent '{adk_agent.name}' to Vertex AI with display_name: '{deployment_display_name}'.")

    try:
        remote_app = deployed_agent_engines.create(
            agent_engine=adk_agent,
            requirements=requirements_list,
            display_name=deployment_display_name,
            description=agent_config_data.get("description", f"ADK Agent deployed via AgentLabUI: {deployment_display_name}")
        )
        logger.info(f"Vertex AI agent deployment successful for '{agent_doc_id}'. Resource: {remote_app.resource_name}")
        db.collection("agents").document(agent_doc_id).update({
            "vertexAiResourceName": remote_app.resource_name, "deploymentStatus": "deployed",
            "lastDeployedAt": firestore.SERVER_TIMESTAMP, "deploymentError": firestore.DELETE_FIELD
        })
        return {"success": True, "resourceName": remote_app.resource_name, "message": f"Agent '{deployment_display_name}' deployment initiated."}

    except Exception as e:
        tb_str = traceback.format_exc()
        error_message_for_log = f"Error during Vertex AI agent deployment for '{agent_doc_id}' (ADK name: '{getattr(adk_agent, 'name', 'N/A')}', Display: '{deployment_display_name}'): {str(e)}"
        logger.error(f"{error_message_for_log}\n{tb_str}")
        db.collection("agents").document(agent_doc_id).update({"deploymentStatus": "error", "deploymentError": str(e)[:1000], "lastDeployedAt": firestore.SERVER_TIMESTAMP})
        if isinstance(e, https_fn.HttpsError): raise
        if "validation error" in str(e).lower() and "LlmAgent" in str(e) and "Extra inputs are not permitted" in str(e).lower():
            logger.error(f"Pydantic validation error suggests an issue with how Agent args are built or an ADK internal. Detail: {str(e)}")
            raise https_fn.HttpsError(
                code=https_fn.FunctionsErrorCode.INTERNAL,
                message=f"Internal configuration error: Pydantic validation for LlmAgent failed. Args passed to Agent constructor should be checked. Detail: {str(e)[:300]}"
            )
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.INTERNAL, message=f"Deployment to Vertex AI failed: {str(e)[:300]}")  