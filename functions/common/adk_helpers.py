# functions/common/adk_helpers.py
import re
import os
import importlib
import traceback
from .core import logger
from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
from google.adk.tools.agent_tool import AgentTool
from google.adk.models.lite_llm import LiteLlm

# This dictionary should mirror the structure of MODEL_PROVIDERS_LITELLM in agentConstants.js
# For simplicity in this example, I'm defining it directly. In a real app,
# you might generate this from a shared source or ensure they are manually synced.
PYTHON_AGENT_CONSTANTS = {
    "google": {
        "id": "google",
        "apiBase": "https://generativelanguage.googleapis.com/v1beta",
        "requiresApiKeyInEnv": "GOOGLE_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
    },
    "openai": {
        "id": "openai",
        "apiBase": "https://api.openai.com/v1",
        "requiresApiKeyInEnv": "OPENAI_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
    },
    "anthropic": {
        "id": "anthropic",
        "apiBase": "https://api.anthropic.com/v1",
        "requiresApiKeyInEnv": "ANTHROPIC_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
    },
    "azure": {
        "id": "azure",
        "apiBase": "https://your-resource-name.openai.azure.com", # Placeholder, see resolution logic
        "requiresApiKeyInEnv": "AZURE_API_KEY", # also needs AZURE_API_BASE, AZURE_API_VERSION
        "allowsCustomBase": True,
        "allowsCustomKey": True,
    },
    "groq": {
        "id": "groq",
        "apiBase": "https://api.groq.com/openai/v1",
        "requiresApiKeyInEnv": "GROQ_API_KEY",
        "allowsCustomBase": False,
        "allowsCustomKey": False,
    },
    "ollama": {
        "id": "ollama",
        "apiBase": "http://localhost:11434", # Default
        "requiresApiKeyInEnv": None,
        "allowsCustomBase": True,
        "allowsCustomKey": False,
    },
    "custom": {
        "id": "custom",
        "apiBase": "http://localhost:8000/v1", # Placeholder, user must define
        "requiresApiKeyInEnv": None,
        "allowsCustomBase": True,
        "allowsCustomKey": True,
    }
    # Add other providers here if they are in agentConstants.js
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

            # --- Model Configuration with new logic ---
    selected_provider_id = agent_config.get("selectedProviderId")
    # This is the model string LiteLLM expects (e.g., "gpt-4o", "gemini/gemini-1.5-flash-latest")
    model_for_litellm = agent_config.get("litellm_model_string")
    user_api_base_override = agent_config.get("litellm_api_base") # This will be None if not provided or not allowed
    user_api_key_override = agent_config.get("litellm_api_key")   # This will be None if not provided or not allowed

    if not selected_provider_id:
        # Fallback for older data that might not have selectedProviderId
        logger.warn(f"Missing 'selectedProviderId' in agent config '{agent_config.get('name', 'N/A')}' {context_for_log}. Attempting to infer or default.")
        if model_for_litellm:
            # Try to infer by checking prefixes if they were part of model_for_litellm
            # This is a simplified inference. A more robust way would be to check the prefix part from JS constants.
            if model_for_litellm.startswith("google/") or model_for_litellm.startswith("gemini/"):
                selected_provider_id = "google"
            elif model_for_litellm.startswith("openai/"):
                selected_provider_id = "openai"
            elif model_for_litellm.startswith("anthropic/"):
                selected_provider_id = "anthropic"
            elif model_for_litellm.startswith("azure/"):
                selected_provider_id = "azure"
            elif model_for_litellm.startswith("groq/"):
                selected_provider_id = "groq"
            elif model_for_litellm.startswith("ollama/"):
                selected_provider_id = "ollama"
                # Add more inferences if needed
            if not selected_provider_id:
                selected_provider_id = "custom" # Fallback to custom if no prefix match
                logger.warn(f"Could not infer provider for model '{model_for_litellm}'. Defaulting to 'custom'.")
        else: # No model string and no provider ID
            selected_provider_id = "google" # Absolute default provider
            model_for_litellm = "gemini/gemini-1.5-flash-latest" # Absolute default model
            logger.warn(f"Missing both 'selectedProviderId' and 'litellm_model_string'. Defaulting to provider '{selected_provider_id}' and model '{model_for_litellm}'.")


    if not model_for_litellm:
        # This case should be rare if the above default logic for missing providerId also sets a default model
        default_model_str = "gemini/gemini-1.5-flash-latest"
        logger.warn(f"Missing 'litellm_model_string' in agent config '{agent_config.get('name', 'N/A')}' {context_for_log}. Defaulting to '{default_model_str}'.")
        model_for_litellm = default_model_str
        if not selected_provider_id: selected_provider_id = "google" # Ensure provider matches default model

    provider_constants = get_provider_constants_py(selected_provider_id)
    if not provider_constants:
        logger.error(f"Invalid 'selectedProviderId': {selected_provider_id} found in agent config '{agent_config.get('name', 'N/A')}'. Cannot determine API configuration.")
        raise ValueError(f"Invalid provider ID: {selected_provider_id}")

        # Determine final API Base
    final_api_base = None
    if user_api_base_override and provider_constants.get("allowsCustomBase"):
        final_api_base = user_api_base_override
        logger.info(f"Using user-provided API base for '{selected_provider_id}': {final_api_base}")
    else:
        final_api_base = provider_constants.get("apiBase")
        # Specific handling for Azure: prefer AZURE_API_BASE env var if constant is placeholder
        if selected_provider_id == "azure" and final_api_base == "https://your-resource-name.openai.azure.com":
            env_azure_base = os.getenv("AZURE_API_BASE")
            if env_azure_base:
                final_api_base = env_azure_base
                logger.info(f"Using AZURE_API_BASE environment variable for Azure API base: {final_api_base}")
            else:
                logger.warn("Azure provider selected, constant API base is a placeholder, and AZURE_API_BASE env var not set. Deployment may fail if not overridden by user.")

    if not final_api_base or final_api_base in ["https://your-resource-name.openai.azure.com", "http://localhost:8000/v1"]: # Check for common placeholders
        # For custom, if the placeholder is still there, it's an error unless user provided one.
        if selected_provider_id == "custom" and not user_api_base_override:
            logger.error(f"API base for 'custom' provider must be overridden by user. Found placeholder: '{final_api_base}'.")
            raise ValueError(f"API base for 'custom' provider is missing.")
            # For Azure, if placeholder and no env var and no user override, it's a problem.
        if selected_provider_id == "azure" and final_api_base == "https://your-resource-name.openai.azure.com" and not user_api_base_override:
            logger.error(f"API base for 'azure' provider is a placeholder and not set via env (AZURE_API_BASE) or user override.")
            raise ValueError(f"API base for 'azure' provider is misconfigured.")


            # Determine final API Key
    final_api_key = None
    if user_api_key_override and provider_constants.get("allowsCustomKey"):
        final_api_key = user_api_key_override
        logger.info(f"Using user-provided API key for '{selected_provider_id}'.")
    else:
        api_key_env_var_name = provider_constants.get("requiresApiKeyInEnv")
        if api_key_env_var_name:
            final_api_key = os.getenv(api_key_env_var_name)
            if not final_api_key:
                logger.warn(f"API key environment variable '{api_key_env_var_name}' for provider '{selected_provider_id}' is not set. LiteLLM may fail if key is required.")
                # If no requiresApiKeyInEnv and no user override, final_api_key remains None (e.g. for Ollama or some custom setups)

    logger.info(f"Configuring LiteLlm for agent '{adk_agent_name}' (Provider: {selected_provider_id}): "
                f"Model='{model_for_litellm}', API Base='{final_api_base}', "
                f"API Key Source: {'User Override' if user_api_key_override and provider_constants.get('allowsCustomKey') else (f'Env Var ({api_key_env_var_name})' if provider_constants.get('requiresApiKeyInEnv') and final_api_key else ('Not from Env Var' if provider_constants.get('requiresApiKeyInEnv') else 'Not Applicable/Set'))}")

    # LiteLLM also uses AZURE_API_VERSION for Azure, ensure it's in the environment if needed
    if selected_provider_id == "azure" and not os.getenv("AZURE_API_VERSION"):
        logger.warn("Azure provider selected, but AZURE_API_VERSION environment variable is not set. LiteLLM may require it.")

    actual_model_for_adk = LiteLlm(
        model=model_for_litellm,
        api_base=final_api_base,
        api_key=final_api_key
        # Add other LiteLLM params like temperature, max_tokens if they are part of agent_config
    )

    # --- Code Execution Handling (model for code executor) ---
    final_tool_config_for_agent = None
    enable_code_execution = agent_config.get("enableCodeExecution", False)

    # Code execution sub-agent will use a default Google model configured via LiteLLM.
    # Its API key (GOOGLE_API_KEY) must be in the environment.
    code_exec_provider_id_for_sub_agent = "google" # Explicitly use Google for code execution agent
    code_exec_model_str_for_sub_agent = "gemini/gemini-1.5-flash-latest"

    code_exec_provider_consts = get_provider_constants_py(code_exec_provider_id_for_sub_agent)
    if not code_exec_provider_consts: # Should not happen if 'google' is in PYTHON_AGENT_CONSTANTS
        logger.error(f"FATAL: Default provider '{code_exec_provider_id_for_sub_agent}' for code execution agent not found in constants.")
        raise ValueError(f"Code execution sub-agent provider '{code_exec_provider_id_for_sub_agent}' misconfiguration.")

    code_exec_api_base = code_exec_provider_consts.get("apiBase")
    code_exec_api_key_env_var = code_exec_provider_consts.get("requiresApiKeyInEnv")
    code_exec_api_key = os.getenv(code_exec_api_key_env_var) if code_exec_api_key_env_var else None

    if not code_exec_api_key and code_exec_api_key_env_var:
        logger.warn(f"API key for code execution sub-agent (env var '{code_exec_api_key_env_var}') is not set. Code execution may fail.")

    code_executor_sub_agent_model_instance = LiteLlm(
        model=code_exec_model_str_for_sub_agent,
        api_base=code_exec_api_base,
        api_key=code_exec_api_key
    )

    if enable_code_execution:
        if not instantiated_tools:
            final_tool_config_for_agent = {"code_execution_config": {"enabled": True}}
            logger.info(f"Enabling direct code execution for agent '{adk_agent_name}' (no other tools).")
        else:
            logger.info(f"Agent '{adk_agent_name}' requires code execution AND other tools. Wrapping code execution in an AgentTool.")
            code_executor_sub_agent = _create_code_executor_agent(base_name=adk_agent_name, model_instance=code_executor_sub_agent_model_instance)
            code_execution_agent_tool = AgentTool(agent=code_executor_sub_agent)
            instantiated_tools.append(code_execution_agent_tool)
            logger.info(f"Added AgentTool for code execution to tools list for '{adk_agent_name}'. Main agent tool_config remains None.")
    else:
        logger.info(f"Code execution is DISABLED for agent '{adk_agent_name}'.")

    agent_kwargs = {
        "name": adk_agent_name,
        "description": agent_config.get("description"),
        "model": actual_model_for_adk,
        "instruction": agent_config.get("instruction"),
        "tools": instantiated_tools,
        "tool_config": final_tool_config_for_agent,
        "output_key": agent_config.get("outputKey"),
    }
    return {k: v for k, v in agent_kwargs.items() if v is not None}

def generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    base_name = agent_config_name or f"adk-agent-{agent_doc_id}"
    sanitized_base = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')
    if not sanitized_base:
        sanitized_base = f"agent-{agent_doc_id[:8]}"
    if not sanitized_base[0].isalpha() or len(sanitized_base) < 2 : # Vertex display names must start with a letter and be min 2 chars.
        core_name = sanitized_base[:59] # Max length 63. a- + 1 char for uniqueness + 59 = 62.
        deployment_display_name = f"a-{core_name}" # Ensure it starts with a letter
    else:
        deployment_display_name = sanitized_base
    deployment_display_name = deployment_display_name[:63] # Enforce max length
    # Ensure min length of 4 for ADK deployment display name (ADK internal requirement sometimes)
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
    else: # This block handles ADK built-in tools like google_search or vertex_ai_search
        tool_id = tool_config.get("id")
        tool_type = tool_config.get("type") # e.g. 'adk_builtin_search', 'adk_builtin_vertex_search'
        if tool_id == 'google_search_adk' and tool_type == 'adk_builtin_search':
            # ADK handles "google_search" tool internally when specified in `Agent(tools=["google_search"])`
            # or tool_config. This function might not need to return a specific object for it,
            # as _prepare_agent_kwargs_from_config will construct the list of strings/objects for ADK.
            # However, to be consistent, if we want to return an "object" for it:
            logger.info(f"Recognized ADK built-in Google Search tool config: {tool_id}")
            return "google_search" # ADK expects this string for the tool
        elif tool_id == 'vertex_ai_search_adk' and tool_type == 'adk_builtin_vertex_search':
            logger.info(f"Recognized ADK built-in Vertex AI Search tool config: {tool_id}")
            # Potentially, if config for datastore ID was supported, it would be passed here.
            # For now, just the string.
            return "vertex_ai_search" # ADK expects this string
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
    sanitized = sanitized[:63] # ADK name length limit
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", sanitized):
        logger.warn(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}"
        return generic_name[:63]
    return sanitized

def _create_code_executor_agent(base_name: str, model_instance: LiteLlm) -> Agent:
    code_exec_agent_name = sanitize_adk_agent_name(f"{base_name}_code_executor_sub_agent")
    logger.info(f"Creating dedicated Code Executor sub-agent: {code_exec_agent_name} using model from passed instance: {model_instance.model}")
    code_exec_agent = Agent(
        name=code_exec_agent_name,
        description="An agent that can execute Python code.",
        model=model_instance,
        instruction="You are a code execution utility. Execute the provided code.",
        tool_config={"code_execution_config": {"enabled": True}}
    )
    return code_exec_agent


def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="root", child_index=0):
    original_agent_name = agent_config.get('name', f'agent_cfg_{child_index}')
    # Generate a more unique base name for ADK to avoid collisions, especially with child agents
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
        if not child_agent_configs:
            raise ValueError(f"{AgentClass.__name__} '{original_agent_name}' requires at least one child agent in its configuration.")

        instantiated_child_agents = []
        for idx, child_config in enumerate(child_agent_configs):
            try:
                # Ensure child config has necessary fields, especially if coming from older data
                if 'selectedProviderId' not in child_config and 'litellm_model_string' not in child_config :
                    logger.warn(f"Child agent config for '{child_config.get('name', 'N/A')}' (index {idx}) is missing model info. Defaulting in recursive call.")
                    # _prepare_agent_kwargs_from_config will apply defaults if these are missing

                child_agent_instance = instantiate_adk_agent_from_config( # Recursive call
                    child_config,
                    parent_adk_name_for_context=adk_agent_name, # Pass current agent's ADK name as context
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
        # LoopAgent wraps a single LlmAgent. Its own config (instruction, model, tools) defines this inner agent.
        # The ADK name for this inner LlmAgent needs to be unique.
        looped_agent_config_name = f"{original_agent_name}_looped_child_config" # For logging
        looped_agent_adk_name = sanitize_adk_agent_name(f"{adk_agent_name}_looped_child_instance", prefix_if_needed="looped_")

        looped_agent_kwargs = _prepare_agent_kwargs_from_config(
            agent_config, # The LoopAgent's own config (model, instruction, tools) is used for its internal LlmAgent
            looped_agent_adk_name,
            context_for_log=f"(looped child of LoopAgent '{adk_agent_name}', original config: '{looped_agent_config_name}')"
        )
        logger.debug(f"Final kwargs for Looped Child ADK Agent '{looped_agent_adk_name}' (for LoopAgent '{adk_agent_name}'): {looped_agent_kwargs}")
        try:
            looped_child_agent_instance = Agent(**looped_agent_kwargs) # This is the LlmAgent that gets looped
        except Exception as e_loop_child_init:
            logger.error(f"Initialization Error for Looped Child Agent '{looped_agent_adk_name}' (from config '{looped_agent_config_name}'): {e_loop_child_init}")
            logger.error(f"Args passed to looped child Agent constructor: {looped_agent_kwargs}")
            detailed_traceback = traceback.format_exc()
            logger.error(f"Traceback:\n{detailed_traceback}")
            raise ValueError(f"Failed to instantiate looped child agent for '{original_agent_name}': {e_loop_child_init}.")

        max_loops_val = int(agent_config.get("maxLoops", 3))
        loop_agent_kwargs = {
            "name": adk_agent_name, # The ADK name of the LoopAgent orchestrator itself
            "description": agent_config.get("description"),
            "agent": looped_child_agent_instance, # The LlmAgent to be looped
            "max_loops": max_loops_val
        }
        logger.debug(f"Final kwargs for LoopAgent '{adk_agent_name}': {{name, description, max_loops, agent_name: {looped_child_agent_instance.name}}}")
        return LoopAgent(**loop_agent_kwargs)

    else:
        # This case should not be reached due to AgentClass validation at the beginning
        raise ValueError(f"Unhandled agent type '{agent_type_str}' during recursive instantiation for '{original_agent_name}'.")


__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    # '_prepare_agent_kwargs_from_config', # Typically internal, but can be useful for debugging
    'instantiate_adk_agent_from_config'
]  