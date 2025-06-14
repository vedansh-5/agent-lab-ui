# functions/common/adk_helpers.py
import re
import os
import importlib
import traceback
from .core import logger
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent # LlmAgent is aliased as Agent
from google.adk.tools.agent_tool import AgentTool
from google.adk.models.lite_llm import LiteLlm
from google.genai import types as genai_types # For GenerateContentConfig

# This dictionary should mirror the structure of MODEL_PROVIDERS_LITELLM in agentConstants.js
PYTHON_AGENT_CONSTANTS = {
    "gemini": {
        "id": "gemini",
        "apiBase": "https://generativelanguage.googleapis.com/v1beta",
        "requiresApiKeyInEnv": "GOOGLE_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
        "liteLlmModelPrefix": "gemini" # For models like gemini-1.5-flash, will become gemini/gemini-1.5-flash
    },
    "openai": {
        "id": "openai",
        "apiBase": "https://api.openai.com/v1",
        "requiresApiKeyInEnv": "OPENAI_API_KEY",
        "allowsCustomBase": True,
        "allowsCustomKey": True,
        "liteLlmModelPrefix": "openai" # For models like gpt-4o, will become openai/gpt-4o
    },
    "anthropic": {
        "id": "anthropic",
        "apiBase": "https://api.anthropic.com/v1",
        "requiresApiKeyInEnv": "ANTHROPIC_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
        "liteLlmModelPrefix": "anthropic" # For claude-3-opus, will become anthropic/claude-3-opus
    },
    "azure": {
        "id": "azure",
        "apiBase": None, # Should be set via AZURE_API_BASE env var or user override
        "requiresApiKeyInEnv": "AZURE_API_KEY",
        "allowsCustomBase": True,
        "allowsCustomKey": True,
        "liteLlmModelPrefix": None # Azure models are prefixed with "azure/" explicitly
    },
    "together_ai": {
        "id": "together_ai",
        "apiBase": "https://api.together.xyz/v1",
        "requiresApiKeyInEnv": "TOGETHER_AI_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
        "liteLlmModelPrefix": "together_ai" # For models like meta-llama/Llama-3..., will become together_ai/meta-llama/Llama-3...
    },
    "custom": {
        "id": "custom",
        "apiBase": None, # User must provide
        "requiresApiKeyInEnv": None, # User handles keys
        "allowsCustomBase": True,
        "allowsCustomKey": True,
        "liteLlmModelPrefix": None # No prefixing for custom
    }
}

def get_provider_constants_py(provider_id: str):
    return PYTHON_AGENT_CONSTANTS.get(provider_id)

def _prepare_agent_kwargs_from_config(agent_config, adk_agent_name: str, context_for_log: str = ""):
    logger.info(f"Preparing kwargs for ADK agent '{adk_agent_name}' {context_for_log}. Original config name: '{agent_config.get('name', 'N/A')}'")

    instantiated_tools = []
    user_defined_tools_config = agent_config.get("tools", [])
    for tc_idx, tc in enumerate(user_defined_tools_config):
        try:
            tool_instance = instantiate_tool(tc)
            instantiated_tools.append(tool_instance)
            logger.info(f"Successfully instantiated tool '{tc.get('id', f'index_{tc_idx}')}' for agent '{adk_agent_name}'.")
        except ValueError as e:
            logger.warn(f"Skipping tool for agent '{adk_agent_name}' due to error: {e} (Tool config: {tc.get('id', f'index_{tc_idx}')})")

    selected_provider_id = agent_config.get("selectedProviderId")
    base_model_name_from_config = agent_config.get("litellm_model_string")
    user_api_base_override = agent_config.get("litellm_api_base")
    user_api_key_override = agent_config.get("litellm_api_key")

    if not selected_provider_id:
        logger.warn(f"Missing 'selectedProviderId' in agent config '{agent_config.get('name', 'N/A')}' {context_for_log}. Attempting to infer.")
        if base_model_name_from_config:
            if "gpt" in base_model_name_from_config.lower(): selected_provider_id = "openai"
            elif "gemini" in base_model_name_from_config.lower(): selected_provider_id = "gemini"
            elif "claude" in base_model_name_from_config.lower(): selected_provider_id = "anthropic"
            elif "mixtral" in base_model_name_from_config.lower() or "llama" in base_model_name_from_config.lower() : selected_provider_id = "together_ai"
        if not selected_provider_id :
            selected_provider_id = "gemini"
            base_model_name_from_config = base_model_name_from_config or "gemini-1.5-flash-latest"
            logger.warn(f"Could not infer provider. Defaulting to '{selected_provider_id}' and model '{base_model_name_from_config}'.")

    if not base_model_name_from_config:
        if selected_provider_id == "openai": base_model_name_from_config = "gpt-3.5-turbo"
        elif selected_provider_id == "gemini": base_model_name_from_config = "gemini-1.5-flash-latest"
        elif selected_provider_id == "anthropic": base_model_name_from_config = "claude-3-haiku-20240307"
        elif selected_provider_id == "together_ai": base_model_name_from_config = "mistralai/Mixtral-8x7B-Instruct-v0.1"
        else: base_model_name_from_config = "gemini-1.5-flash-latest" # Fallback default
        logger.warn(f"Missing 'litellm_model_string'. Defaulting to '{base_model_name_from_config}' for provider '{selected_provider_id}'.")

    provider_constants = get_provider_constants_py(selected_provider_id)
    if not provider_constants:
        logger.error(f"Invalid 'selectedProviderId': {selected_provider_id}. Cannot determine API configuration.")
        raise ValueError(f"Invalid provider ID: {selected_provider_id}")

    final_api_base = None
    if user_api_base_override and provider_constants.get("allowsCustomBase"):
        final_api_base = user_api_base_override
    elif provider_constants.get("apiBase"):
        final_api_base = provider_constants.get("apiBase")

    if selected_provider_id == "azure":
        # For Azure, AZURE_API_BASE from env is primary unless user overrides.
        final_api_base = os.getenv("AZURE_API_BASE")
        if user_api_base_override: # User override takes precedence even for Azure
            final_api_base = user_api_base_override
        if not final_api_base :
            logger.error("Azure provider: AZURE_API_BASE env var not set and not overridden by user. LiteLLM will likely fail.")

    final_api_key = None
    if user_api_key_override and provider_constants.get("allowsCustomKey"):
        final_api_key = user_api_key_override
    else:
        api_key_env_var_name = provider_constants.get("requiresApiKeyInEnv")
        if api_key_env_var_name:
            final_api_key = os.getenv(api_key_env_var_name)
            if not final_api_key:
                logger.warn(f"API key env var '{api_key_env_var_name}' for provider '{selected_provider_id}' not set. LiteLLM may fail if key is required.")

                # Determine the final model string for LiteLLM
    final_model_str_for_litellm = base_model_name_from_config

    if selected_provider_id == "custom":
        # For custom provider, the user is expected to provide the full model string.
        # No prefixing is done by default.
        pass
    elif selected_provider_id == "azure":
        # Azure has its own prefixing convention, typically azure/<deployment_name>.
        # The base_model_name_from_config for Azure should be the deployment name.
        if not final_model_str_for_litellm.startswith("azure/"):
            final_model_str_for_litellm = f"azure/{final_model_str_for_litellm}"
    else:
        # For other standard providers (openai, anthropic, together_ai, gemini, etc.)
        lite_llm_prefix = provider_constants.get("liteLlmModelPrefix")
        if lite_llm_prefix: # Check if a prefix is defined for this provider
            # Prepend the prefix if the model string doesn't already start with "prefix/"
            # This handles cases where base_model_name_from_config might be "gpt-3.5-turbo" or "meta-llama/Llama-3"
            if not final_model_str_for_litellm.startswith(f"{lite_llm_prefix}/"):
                final_model_str_for_litellm = f"{lite_llm_prefix}/{final_model_str_for_litellm}"
                # If it already starts with the prefix, no change is needed.
        else:
            # This case might occur if a new provider is added to PYTHON_AGENT_CONSTANTS
            # without a liteLlmModelPrefix, and it's not 'custom' or 'azure'.
            logger.warn(
                f"Provider '{selected_provider_id}' is not 'custom' or 'azure' but has no 'liteLlmModelPrefix' defined "
                f"in PYTHON_AGENT_CONSTANTS. Using model string as is: '{base_model_name_from_config}'. "
                f"This might lead to errors if LiteLLM expects a prefixed model string for this provider."
            )

    logger.info(f"Configuring LiteLlm for agent '{adk_agent_name}' (Provider: {selected_provider_id}): "
                f"Model='{final_model_str_for_litellm}', API Base='{final_api_base or 'Default/Env'}', KeySet={'Yes' if final_api_key else 'No'}")

    if selected_provider_id == "azure" and not os.getenv("AZURE_API_VERSION"):
        logger.warn("Azure provider: AZURE_API_VERSION env var not set. LiteLLM may require it.")

    actual_model_for_adk = LiteLlm(
        model=final_model_str_for_litellm,
        api_base=final_api_base,
        api_key=final_api_key
    )

    agent_kwargs = {
        "name": adk_agent_name,
        "description": agent_config.get("description"),
        "model": actual_model_for_adk,
        "instruction": agent_config.get("instruction"),
        "tools": instantiated_tools,
        "output_key": agent_config.get("outputKey"),
    }

    model_settings = agent_config.get("modelSettings", {})
    current_generate_content_config_kwargs = {}

    if "temperature" in model_settings and model_settings["temperature"] is not None:
        try: current_generate_content_config_kwargs["temperature"] = float(model_settings["temperature"])
        except (ValueError, TypeError): logger.warning(f"Invalid temperature: {model_settings['temperature']}")
    if "maxOutputTokens" in model_settings and model_settings["maxOutputTokens"] is not None:
        try: current_generate_content_config_kwargs["max_output_tokens"] = int(model_settings["maxOutputTokens"])
        except (ValueError, TypeError): logger.warning(f"Invalid maxOutputTokens: {model_settings['maxOutputTokens']}")
    if "topP" in model_settings and model_settings["topP"] is not None:
        try: current_generate_content_config_kwargs["top_p"] = float(model_settings["topP"])
        except (ValueError, TypeError): logger.warning(f"Invalid topP: {model_settings['topP']}")
    if "topK" in model_settings and model_settings["topK"] is not None:
        try: current_generate_content_config_kwargs["top_k"] = int(model_settings["topK"])
        except (ValueError, TypeError): logger.warning(f"Invalid topK: {model_settings['topK']}")
    if "stopSequences" in model_settings and isinstance(model_settings["stopSequences"], list):
        current_generate_content_config_kwargs["stop_sequences"] = [str(seq) for seq in model_settings["stopSequences"]]

    if current_generate_content_config_kwargs:
        agent_kwargs["generate_content_config"] = genai_types.GenerateContentConfig(**current_generate_content_config_kwargs)
        logger.info(f"Agent '{adk_agent_name}' will use GenerateContentConfig: {agent_kwargs['generate_content_config']}")

    return {k: v for k, v in agent_kwargs.items() if v is not None}

def generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    base_name = agent_config_name or f"adk-agent-{agent_doc_id}"
    sanitized_base = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')
    if not sanitized_base:
        sanitized_base = f"agent-{agent_doc_id[:8]}"
    if not sanitized_base[0].isalpha() or len(sanitized_base) < 2 :
        core_name = sanitized_base[:59]
        deployment_display_name = f"a-{core_name}"
    else:
        deployment_display_name = sanitized_base
    deployment_display_name = deployment_display_name[:63]
    while len(deployment_display_name) < 4 and len(deployment_display_name) < 63 :
        deployment_display_name += "x"
    return deployment_display_name.strip('-')[:63]

def instantiate_tool(tool_config):
    logger.info(f"Attempting to instantiate tool: {tool_config.get('id', 'N/A')}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")

    module_path = tool_config.get("module_path")
    class_name = tool_config.get("class_name")

    if module_path and class_name:
        try:
            module = importlib.import_module(module_path)
            ToolClass = getattr(module, class_name)
            instance_specific_kwargs = tool_config.get('configuration', {})
            if instance_specific_kwargs:
                logger.info(f"Instantiating tool '{tool_config.get('id', class_name)}' with specific configuration keys: {list(instance_specific_kwargs.keys())}")
            else:
                logger.info(f"Instantiating tool '{tool_config.get('id', class_name)}' with no specific instance configuration.")

            instance = ToolClass(**instance_specific_kwargs)

            if hasattr(instance, 'export_to_adk') and callable(instance.export_to_adk):
                adk_tool_spec = instance.export_to_adk()
                tool_source_type = "Gofannon-compatible tool"
                logger.info(f"Successfully instantiated and exported {tool_source_type} '{tool_config.get('id', class_name)}' to ADK spec.")
                return adk_tool_spec
            else:
                logger.info(f"Successfully instantiated tool '{tool_config.get('id', class_name)}' (assumed ADK native or directly compatible, e.g., Langchain tool).")
                return instance
        except Exception as e:
            tool_id_for_log = tool_config.get('id', class_name or 'N/A')
            if isinstance(e, (ImportError, ModuleNotFoundError)):
                logger.error(f"Error instantiating tool '{tool_id_for_log}': Could not import module '{module_path}'. Ensure this module is available in the Cloud Function's Python environment. Error: {e}\n{traceback.format_exc()}")
            else:
                logger.error(f"Error instantiating tool '{tool_id_for_log}': {e}\n{traceback.format_exc()}")
            raise ValueError(f"Error instantiating tool {tool_id_for_log}: {e}")
    else:
        tool_id = tool_config.get("id")
        tool_type = tool_config.get("type")
        if tool_id == 'google_search_adk' and tool_type == 'adk_builtin_search':
            logger.info(f"Recognized ADK built-in Google Search tool config: {tool_id}")
            return "google_search"
        elif tool_id == 'vertex_ai_search_adk' and tool_type == 'adk_builtin_vertex_search':
            logger.info(f"Recognized ADK built-in Vertex AI Search tool config: {tool_id}")
            return "vertex_ai_search"
        else:
            raise ValueError(f"Unsupported or incomplete tool configuration for tool ID {tool_config.get('id', 'N/A')}. Missing module_path/class_name or not a recognized built-in.")


def sanitize_adk_agent_name(name_str: str, prefix_if_needed: str = "agent_") -> str:
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)
    sanitized = sanitized.strip('_')
    if sanitized and sanitized[0].isdigit():
        sanitized = f"_{sanitized}"
    if not sanitized or not (sanitized[0].isalpha() or sanitized[0] == '_'):
        temp_name = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)
        sanitized = f"{prefix_if_needed.strip('_')}_{temp_name.strip('_')}"
        sanitized = re.sub(r'_+', '_', sanitized).strip('_')
    if not sanitized:
        sanitized = f"{prefix_if_needed.strip('_')}_default_agent_name"
    sanitized = sanitized[:63]
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", sanitized):
        logger.warn(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}"
        return generic_name[:63]
    return sanitized

def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="root", child_index=0):
    original_agent_name = agent_config.get('name', f'agent_cfg_{child_index}')
    unique_base_name_for_adk = f"{original_agent_name}_{parent_adk_name_for_context}_{os.urandom(2).hex()}"
    adk_agent_name = sanitize_adk_agent_name(unique_base_name_for_adk, prefix_if_needed=f"agent_{child_index}_")

    agent_type_str = agent_config.get("agentType")
    AgentClass = {
        "Agent": Agent,
        "SequentialAgent": SequentialAgent,
        "LoopAgent": LoopAgent,
        "ParallelAgent": ParallelAgent
    }.get(agent_type_str)

    if not AgentClass:
        error_msg = f"Invalid agentType specified: '{agent_type_str}' for agent config: {original_agent_name}"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Instantiating ADK Agent: Name='{adk_agent_name}', Type='{AgentClass.__name__}', Original Config Name='{original_agent_name}' (Context: parent='{parent_adk_name_for_context}', index={child_index})")

    if AgentClass == Agent:
        agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config,
            adk_agent_name,
            context_for_log=f"(type: LlmAgent, parent: {parent_adk_name_for_context}, original: {original_agent_name})"
        )
        logger.debug(f"Final kwargs for LlmAgent '{adk_agent_name}': {agent_kwargs}")
        try:
            return Agent(**agent_kwargs)
        except Exception as e_agent_init:
            logger.error(f"Initialization Error for LlmAgent '{adk_agent_name}' (from config '{original_agent_name}'): {e_agent_init}")
            logger.error(f"Args passed: {agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate LlmAgent '{original_agent_name}': {e_agent_init}.")

    elif AgentClass == SequentialAgent or AgentClass == ParallelAgent:
        child_agent_configs = agent_config.get("childAgents", [])
        if not child_agent_configs: # Allow empty for these types if needed
            logger.info(f"{AgentClass.__name__} '{original_agent_name}' has no child agents configured.")
            instantiated_child_agents = []
        else:
            instantiated_child_agents = []
            for idx, child_config in enumerate(child_agent_configs):
                try:
                    if 'selectedProviderId' not in child_config and 'litellm_model_string' not in child_config :
                        logger.warn(f"Child agent config for '{child_config.get('name', 'N/A')}' (index {idx}) is missing model info. Defaulting in recursive call.")
                    child_agent_instance = instantiate_adk_agent_from_config(
                        child_config,
                        parent_adk_name_for_context=adk_agent_name,
                        child_index=idx
                    )
                    instantiated_child_agents.append(child_agent_instance)
                except Exception as e_child:
                    logger.error(f"Failed to instantiate child agent at index {idx} for {AgentClass.__name__} '{original_agent_name}': {e_child}")
                    raise ValueError(f"Error processing child agent for '{original_agent_name}': {e_child}")

        orchestrator_kwargs = {
            "name": adk_agent_name,
            "description": agent_config.get("description"),
            "sub_agents": instantiated_child_agents
        }
        logger.debug(f"Final kwargs for {AgentClass.__name__} '{adk_agent_name}': {{name, description, num_sub_agents: {len(instantiated_child_agents)}}}")
        return AgentClass(**orchestrator_kwargs)

    elif AgentClass == LoopAgent:
        looped_agent_config_name = f"{original_agent_name}_looped_child_config"
        looped_agent_adk_name = sanitize_adk_agent_name(f"{adk_agent_name}_looped_child_instance", prefix_if_needed="looped_")

        looped_agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config, # LoopAgent uses its own config for the looped child
            looped_agent_adk_name,
            context_for_log=f"(looped child of LoopAgent '{adk_agent_name}', original config: '{looped_agent_config_name}')"
        )
        logger.debug(f"Final kwargs for Looped Child ADK Agent '{looped_agent_adk_name}' (for LoopAgent '{adk_agent_name}'): {looped_agent_kwargs}")
        try:
            looped_child_agent_instance = Agent(**looped_agent_kwargs)
        except Exception as e_loop_child_init:
            logger.error(f"Initialization Error for Looped Child Agent '{looped_agent_adk_name}' (from config '{looped_agent_config_name}'): {e_loop_child_init}")
            logger.error(f"Args passed to looped child Agent constructor: {looped_agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate looped child agent for '{original_agent_name}': {e_loop_child_init}.")

        max_loops_val_str = agent_config.get("maxLoops", "3") # Get as string first
        try:
            max_loops_val = int(max_loops_val_str)
            if max_loops_val <= 0:
                logger.warning(f"MaxLoops for LoopAgent '{adk_agent_name}' is {max_loops_val}, which is not positive. Defaulting to 3.")
                max_loops_val = 3
        except ValueError:
            logger.warning(f"Invalid MaxLoops value '{max_loops_val_str}' for LoopAgent '{adk_agent_name}'. Defaulting to 3.")
            max_loops_val = 3


        loop_agent_kwargs = {
            "name": adk_agent_name,
            "description": agent_config.get("description"),
            "agent": looped_child_agent_instance,
            "max_loops": max_loops_val
        }
        logger.debug(f"Final kwargs for LoopAgent '{adk_agent_name}': {{name, description, max_loops, agent_name: {looped_child_agent_instance.name}}}")
        return LoopAgent(**loop_agent_kwargs)

    else:
        raise ValueError(f"Unhandled agent type '{agent_type_str}' during recursive instantiation for '{original_agent_name}'.")


__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    'instantiate_adk_agent_from_config'
]