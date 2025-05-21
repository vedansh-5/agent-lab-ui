import re
import os
import importlib
import traceback
from .core import logger

def generate_vertex_deployment_display_name(agent_config_name: str, agent_doc_id: str) -> str:
    """
    Generates a Vertex AI compliant display name for an agent deployment.
    Vertex AI display name rules: (a-z, 0-9, -), start with letter, 4-63 chars.
    """
    base_name = agent_config_name or f"adk-agent-{agent_doc_id}"
    sanitized_base = re.sub(r'[^a-z0-9-]+', '-', base_name.lower()).strip('-')

    if not sanitized_base: # Highly unlikely if agent_doc_id is used
        sanitized_base = f"agent-{agent_doc_id[:8]}"

        # Prefix with 'a-' if doesn't start with a letter OR if too short, to ensure prefixing helps meet min length
    # This also handles the case where sanitized_base might be "123", which becomes "a-123"
    if not sanitized_base[0].isalpha() or len(sanitized_base) < 2 : # check <2 to allow for "a-" + 2 chars to make 4
        core_name = sanitized_base[:59] # Leave space for 'a-' and padding up to 4
        deployment_display_name = f"a-{core_name}"
    else:
        deployment_display_name = sanitized_base

        # Trim to 63 chars
    deployment_display_name = deployment_display_name[:63]

    # Pad to 4 chars if needed, ensuring it doesn't exceed 63
    while len(deployment_display_name) < 4 and len(deployment_display_name) < 63:
        deployment_display_name += "x"

        # Final trim and cleanup if padding made it too long (edge case)
    return deployment_display_name.strip('-')[:63]


def instantiate_tool(tool_config):
    """
    Instantiates a tool (Gofannon or ADK compatible) from its configuration.
    """
    logger.info(f"Attempting to instantiate tool: {tool_config.get('id', 'N/A')}")
    if not isinstance(tool_config, dict):
        raise ValueError(f"Tool configuration must be a dictionary, got {type(tool_config)}")

    module_path = tool_config.get("module_path")
    class_name = tool_config.get("class_name")

    if module_path and class_name:
        try:
            module = importlib.import_module(module_path)
            ToolClass = getattr(module, class_name)
            instance = ToolClass() # Assumes constructor takes no arguments

            # Check for Gofannon's export_to_adk method
            if hasattr(instance, 'export_to_adk') and callable(instance.export_to_adk):
                adk_tool_spec = instance.export_to_adk()
                logger.info(f"Successfully instantiated and exported Gofannon tool '{tool_config.get('id', class_name)}' to ADK spec.")
                return adk_tool_spec # This should be the ADK compatible tool spec (e.g., FunctionDeclaration)
            else:
                # If no export_to_adk, assume the instance itself is ADK-compatible (e.g., a Langchain tool converted or native ADK tool)
                logger.info(f"Successfully instantiated tool '{tool_config.get('id', class_name)}' (assumed ADK compatible or Langchain tool).")
                return instance # This might be a Langchain tool instance or a pre-wrapped ADK tool
        except Exception as e:
            tool_id_for_log = tool_config.get('id', class_name or 'N/A')
            logger.error(f"Error instantiating tool '{tool_id_for_log}': {e}\n{traceback.format_exc()}")
            raise ValueError(f"Error instantiating tool {tool_id_for_log}: {e}")
    else:
        # Handle other types of tool definitions if necessary (e.g., direct FunctionDeclaration JSON)
        raise ValueError(f"Unsupported or incomplete tool configuration for tool ID {tool_config.get('id', 'N/A')}. Missing module_path or class_name.")


def sanitize_adk_agent_name(name_str: str, prefix_if_needed: str = "agent_") -> str:
    """
    Sanitizes a string to be a valid Python identifier for ADK agent names.
    ADK agent names often become Python class names or variable names internally.
    Should be 1-63 characters, and match ^[a-zA-Z_][a-zA-Z0-9_]*$
    """
    # Replace invalid characters with underscore
    sanitized = re.sub(r'[^a-zA-Z0-9_]', '_', name_str)

    # Remove leading/trailing underscores that might result from replacement
    sanitized = sanitized.strip('_')

    # If it starts with a digit, prefix with an underscore (or the provided prefix)
    if sanitized and sanitized[0].isdigit():
        sanitized = f"_{sanitized}" # Common practice for Python identifiers

    # If empty after sanitization or doesn't start with letter/underscore, use prefix
    if not sanitized or not (sanitized[0].isalpha() or sanitized[0] == '_'):
        # Ensure prefix itself doesn't create issues if name_str was e.g., "-foo"
        # which becomes "_foo" then prefix_if_needed + "_foo"
        temp_name = re.sub(r'[^a-zA-Z0-9_]', '_', name_str) # Re-sanitize original for prefixing
        sanitized = f"{prefix_if_needed.strip('_')}_{temp_name.strip('_')}"
        sanitized = re.sub(r'_+', '_', sanitized).strip('_') # Clean up multiple underscores

    # Ensure it's not empty again after all transformations
    if not sanitized:
        sanitized = f"{prefix_if_needed.strip('_')}_default_agent_name"

        # Enforce length (ADK/Vertex might have specific limits, 63 is common)
    sanitized = sanitized[:63]

    # Final check for Python identifier validity, though prior steps should cover most.
    # This regex is strict: ^[a-zA-Z_][a-zA-Z0-9_]*$
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", sanitized):
        # Fallback if sanitization somehow failed to produce a valid identifier
        logger.warning(f"Sanitized name '{sanitized}' from '{name_str}' is still not a valid Python identifier. Using a generic fallback.")
        # Generate a more robust fallback, ensuring uniqueness if multiple fallbacks happen
        generic_name = f"{prefix_if_needed.strip('_')}_{os.urandom(4).hex()}"
        return generic_name[:63]

    return sanitized


def instantiate_adk_agent_from_config(agent_config, parent_adk_name_for_context="parent", child_index=0):
    """
    Instantiates a child ADK Agent from its configuration dictionary.
    This is used for child agents within SequentialAgent, ParallelAgent.
    """
    # This import is here to avoid circular dependencies if adk_helpers is imported by modules
    # that google.adk.agents might depend on during its own import.
    # Or, ensure google.adk.agents is imported at the top of the calling handler module.
    from google.adk.agents import Agent

    original_child_name = agent_config.get('name', f'child_agent_{child_index}')
    # Create a unique but descriptive base for the ADK internal name
    # Using parts of parent name and a random hex helps ensure uniqueness and traceability
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
            # Decide if this should be a fatal error for the child agent or just skip the tool

    return Agent(
        name=final_child_agent_name, # This is the internal ADK name
        description=agent_config.get("description"),
        model=agent_config.get("model", "gemini-1.5-flash-001"), # Default model
        instruction=agent_config.get("instruction"),
        tools=instantiated_child_tools
    )

__all__ = [
    'generate_vertex_deployment_display_name',
    'instantiate_tool',
    'sanitize_adk_agent_name',
    'instantiate_adk_agent_from_config'
]