# functions/handlers/vertex_agent_handler.py

# Import the specific orchestrator logic function
from .vertex.query_orchestrator import query_deployed_agent_orchestrator_logic

# Import existing logic functions for deployment and management
from .vertex.deployment_logic import _deploy_agent_to_vertex_logic
from .vertex.management_logic import _delete_vertex_agent_logic, _check_vertex_agent_deployment_status_logic

# Re-export them to maintain the public interface for main.py
__all__ = [
    '_deploy_agent_to_vertex_logic',
    '_delete_vertex_agent_logic',
    'query_deployed_agent_orchestrator_logic',
    '_check_vertex_agent_deployment_status_logic'
]  