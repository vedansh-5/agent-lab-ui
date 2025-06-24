# functions/handlers/mcp_handler.py (New File)
import asyncio
import traceback
from firebase_functions import https_fn
from mcp.client.sse import sse_client
from common.core import logger

async def _list_mcp_server_tools_logic_async(req: https_fn.CallableRequest):
    if not req.auth:
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAUTHENTICATED,
            message="Authentication required to list MCP server tools."
        )

    server_url = req.data.get("serverUrl")
    if not server_url or not isinstance(server_url, str):
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INVALID_ARGUMENT,
            message="'serverUrl' is required and must be a string."
        )

    logger.info(f"Attempting to list tools from MCP server: {server_url}")

    try:
        async with sse_client(base_url=server_url) as mcp_client:
            # Ensure connect() is called if MCPClientSession doesn't auto-connect
            # await mcp_client.connect() # This might not be needed depending on MCPClientSession impl.

            mcp_server_tools = await mcp_client.list_tools()

            # The mcp_server_tools will be a list of mcp.common.Tool objects
            # We need to serialize them into a JSON-friendly format for the client.
            # A Tool object has attributes like 'name', 'description', 'input_schema', 'output_schema'.
            # Schemas are Pydantic models, so .model_dump_json() or .model_dump() can be used.

            tools_for_client = []
            for tool_obj in mcp_server_tools:
                tools_for_client.append({
                    "name": tool_obj.name,
                    "description": tool_obj.description,
                    # Decide if schemas are needed by UI. If so, serialize them.
                    # "input_schema_json": tool_obj.input_schema.model_dump_json() if tool_obj.input_schema else None,
                    # "output_schema_json": tool_obj.output_schema.model_dump_json() if tool_obj.output_schema else None,
                    # For now, UI primarily needs name and description for selection.
                    # The backend will use the original tool name for filtering when creating MCPToolset.
                })
            logger.info(f"Successfully listed {len(tools_for_client)} tools from MCP server: {server_url}")
            return {"success": True, "tools": tools_for_client, "serverUrl": server_url}

    except ConnectionRefusedError:
        logger.error(f"Connection refused by MCP server at {server_url}.")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.UNAVAILABLE,
            message=f"Could not connect to MCP server at {server_url}. Server might be down or URL incorrect."
        )
    except asyncio.TimeoutError: # If mcp_client methods have timeouts
        logger.error(f"Timeout while communicating with MCP server at {server_url}.")
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED,
            message=f"Request to MCP server at {server_url} timed out."
        )
    except Exception as e:
        logger.error(f"Error listing tools from MCP server {server_url}: {e}\n{traceback.format_exc()}", exc_info=True)
        raise https_fn.HttpsError(
            code=https_fn.FunctionsErrorCode.INTERNAL,
            message=f"An unexpected error occurred while listing tools from MCP server: {str(e)[:200]}"
        )

    # Wrapper for Firebase Functions if needed (e.g. if main.py calls a sync version)
# For direct async call from main.py, this specific wrapper isn't strictly necessary there.
def _list_mcp_server_tools_logic(req: https_fn.CallableRequest):
    return asyncio.run(_list_mcp_server_tools_logic_async(req))


__all__ = ['_list_mcp_server_tools_logic', '_list_mcp_server_tools_logic_async']