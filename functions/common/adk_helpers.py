import re
import os
import importlib
import traceback
from .core import logger

# Import ADK built-in tools and executors
try:
    from google.adk.tools import google_search as adk_google_search_tool_declaration
    # from google.adk.tools import VertexAiSearchTool # Placeholder if to be supported via ToolSelector later
except ImportError:
    logger.warn("Could not import 'google.adk.tools.google_search'. Ensure 'google-cloud-aiplatform[adk,agent_engines]' is installed and compatible.")
    adk_google_search_tool_declaration = None
    # VertexAiSearchTool = None

try:
    from google.adk.code_executors import BuiltInCodeExecutor
except ImportError:
    logger.warn("Could not import 'google.adk.code_executors.BuiltInCodeExecutor'. Built-in code execution will not be available.")
    BuiltInCodeExecutor = None


def generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    """
    Generates a Vertex AI compliant display name for an agent deployment.
    Vertex AI display name rules: (a-z, 0-9, -), start with letter, 4-63 chars.
    """
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

    while len(deployment_display_name) < 4 and len(deployment_display_name) < 63:
        deployment_display_name += "x"

    return deployment_display_name.strip('-')[:63]


def instantiate_tool(tool_config):
    """
    Instantiates a tool (Gofannon, ADK compatible, or ADK built-in FunctionDeclaration) from its configuration.
    """
    logger.info(f"Attempting to instantiate tool: {tool_config.get('id', 'N/A')} with type: {tool_config.get('type', 'N/A')}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")

    tool_type = tool_config.get("type")
    tool_id = tool_config.get("id")

    # Handle ADK Built-in FunctionDeclaration tools
    if tool_type == 'adk_builtin_search' and tool_id == 'google_search_adk':
        if adk_google_search_tool_declaration:
            logger.info("Instantiating ADK Built-in Google Search tool from predefined declaration.")
            return adk_google_search_tool_declaration
        else:
            logger.error("ADK Google Search tool (google_search_adk) selected, but 'google.adk.tools.google_search' failed to import.")
            raise ValueError("ADK Google Search tool selected, but its declaration could not be imported. Check ADK installation and logs.")

            # Placeholder for Vertex AI Search tool if it were to be configured through tool_config
    # elif tool_type == 'adk_builtin_vertex_search' and tool_id == 'vertex_ai_search_adk':
    #     if VertexAiSearchTool:
    #         data_store_id = tool_config.get("data_store_id") # This would need to be passed in tool_config
    #         if not data_store_id:
    #             raise ValueError("Vertex AI Search tool selected, but 'data_store_id' is missing in tool_config.")
    #         logger.info(f"Instantiating ADK Vertex AI Search tool for datastore: {data_store_id}")
    #         # VertexAiSearchTool itself is a class that needs to be instantiated.
    #         # Its .export_to_adk() method would return the FunctionDeclaration.
    #         # Or, if the ADK Agent can take the Tool class instance directly:
    #         return VertexAiSearchTool(data_store_id=data_store_id)
    #     else:
    #         logger.error("ADK Vertex AI Search tool (vertex_ai_search_adk) selected, but 'google.adk.tools.VertexAiSearchTool' failed to import.")
    #         raise ValueError("ADK Vertex AI Search tool selected, but its class could not be imported. Check ADK installation and logs.")


    # Handle Gofannon tools (or other tools defined by module_path and class_name)
    module_path = tool_config.get("module_path")
    class_name = tool_config.get("class_name")

    if module_path and class_name: # Implies Gofannon or similar custom tool
        try:
            module = importlib.import_module(module_path)
            ToolClass = getattr(module, class_name)
            instance = ToolClass()

            if hasattr(instance, 'export_to_adk') and callable(instance.export_to_adk):
                adk_tool_spec = instance.export_to_adk()
                logger.info(f"Successfully instantiated and exported Gofannon tool '{tool_id or class_name}' to ADK spec.")
                return adk_tool_spec
            else:
                logger.info(f"Successfully instantiated tool '{tool_id or class_name}' (assumed ADK compatible or Langchain tool without explicit export_to_adk).")
                return instance # This might be a Langchain tool instance or a pre-wrapped ADK tool
        except Exception as e:
            tool_id_for_log = tool_id or class_name or 'N/A'
            logger.error(f"Error instantiating tool '{tool_id_for_log}' from module/class: {e}\n{traceback.format_exc()}")
            raise ValueError(f"Error instantiating tool {tool_id_for_log} from module/class: {e}")

            # Fallback if no conditions met
    error_msg = (f"Unsupported or incomplete tool configuration for tool ID '{tool_id or 'N/A'}'. "
                 f"Type: '{tool_type}'. Ensure 'module_path' and 'class_name' are provided for custom/Gofannon tools, "
                 "or it's a recognized 'adk_builtin_...' type with necessary ADK library imports succeeding.")
    logger.error(error_msg)
    raise ValueError(error_msg)


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
        logger.warning(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}"
        return generic_name[:63]
    return sanitized


def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="parent", child_index=0):
    from google.adk.agents import Agent # LlmAgent is the base, Agent is an LlmAgent

    original_child_name = agent_config.get('name', f'child_agent_{child_index}')
    base_name_for_adk = f"{original_child_name}_{parent_adk_name_for_context}_{os.urandom(3).hex()}"
    final_child_agent_name = sanitize_adk_agent_name(base_name_for_adk, prefix_if_needed=f"child_{child_index}_")

    logger.info(f"Instantiating child ADK agent with internal ADK name '{final_child_agent_name}' (original user-defined: '{original_child_name}')")

    child_tools_configs = agent_config.get("tools", [])
    instantiated_child_tools = []
    for tc_idx, tc in enumerate(child_tools_configs):
        try:
            instantiated_child_tools.append(instantiate_tool(tc))
        except ValueError as e:
            logger.error(f"Skipping tool for child agent '{final_child_agent_name}' due to instantiation error: {e} (Tool config: {tc.get('id', f'index_{tc_idx}')})")

            # Determine executors for the child agent
    child_agent_executors = []
    if agent_config.get("enableCodeExecution"): # Check child agent's own config
        if BuiltInCodeExecutor:
            child_agent_executors.append(BuiltInCodeExecutor)
            logger.info(f"BuiltInCodeExecutor enabled for child agent '{final_child_agent_name}'.")
        else:
            logger.warn(f"Child agent '{final_child_agent_name}' requested code execution, but BuiltInCodeExecutor could not be imported. Skipping executor.")

    return Agent( # Agent is an LlmAgent, which accepts 'executor'
        name=final_child_agent_name,
        description=agent_config.get("description"),
        model=agent_config.get("model", "gemini-1.5-flash-001"),
        instruction=agent_config.get("instruction"),
        tools=instantiated_child_tools,
        executor=child_agent_executors if child_agent_executors else None
    )

__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    'instantiate_adk_agent_from_config'
]  