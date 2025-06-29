# functions/main.py
# main.py - Entry point for Firebase Functions

from firebase_functions import https_fn, options
from common.utils import handle_exceptions_and_log
import asyncio # For running async logic from mcp_handler

# Import the logic functions from their respective handlers
from handlers.vertex_agent_handler import (
    _deploy_agent_to_vertex_logic,
    _delete_vertex_agent_logic,
    query_deployed_agent_orchestrator_logic as _query_deployed_agent_logic,
    _check_vertex_agent_deployment_status_logic
)
from handlers.gofannon_handler import _get_gofannon_tool_manifest_logic
from handlers.context_handler import (
    _fetch_web_page_content_logic,
    _fetch_git_repo_contents_logic,
    _process_pdf_content_logic
)
# Import new MCP handler
from handlers.mcp_handler import _list_mcp_server_tools_logic_async


# --- Cloud Function Definitions ---

@https_fn.on_call(memory=options.MemoryOption.GB_1)
@handle_exceptions_and_log
def get_gofannon_tool_manifest(req: https_fn.CallableRequest):
    return _get_gofannon_tool_manifest_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=540)
@handle_exceptions_and_log
def deploy_agent_to_vertex(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to deploy agents.")
    return _deploy_agent_to_vertex_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1)
@handle_exceptions_and_log
def delete_vertex_agent(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to delete agent deployments.")
    return _delete_vertex_agent_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_2, timeout_sec=180, cpu=1)
@handle_exceptions_and_log
def query_deployed_agent(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to query agents.")
    return _query_deployed_agent_logic(req)


@https_fn.on_call(memory=options.MemoryOption.GB_1)
@handle_exceptions_and_log
def check_vertex_agent_deployment_status(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(code=https_fn.FunctionsErrorCode.UNAUTHENTICATED, message="Authentication required to check agent status.")
    return _check_vertex_agent_deployment_status_logic(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=60)
@handle_exceptions_and_log
def fetch_web_page_content(req: https_fn.CallableRequest):
    return _fetch_web_page_content_logic(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=300)
@handle_exceptions_and_log
def fetch_git_repo_contents(req: https_fn.CallableRequest):
    return _fetch_git_repo_contents_logic(req)

@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=120)
@handle_exceptions_and_log
def process_pdf_content(req: https_fn.CallableRequest):
    return _process_pdf_content_logic(req)

# New Function for MCP Tools
@https_fn.on_call(memory=options.MemoryOption.GB_1, timeout_sec=120) # Increased timeout for potential network calls
@handle_exceptions_and_log
def list_mcp_server_tools(req: https_fn.CallableRequest):
    # _list_mcp_server_tools_logic_async is async, so we need to run it in an event loop
    return asyncio.run(_list_mcp_server_tools_logic_async(req))