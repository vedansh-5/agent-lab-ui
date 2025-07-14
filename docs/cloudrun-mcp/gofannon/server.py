from typing import Any
import httpx
from fastmcp import FastMCP
import logging
import os

from os import getenv
# Gofannon Imports - https://github.com/The-AI-Alliance/gofannon/blob/main/docs/mcp/index.md
from gofannon.arxiv.get_article import GetArticle
from gofannon.arxiv.search import Search
from gofannon.get_url_content.get_url_content import GetUrlContent
from gofannon.google_search.google_search import GoogleSearch

logger = logging.getLogger(__name__)
logging.basicConfig(format="[%(levelname)s]: %(message)s", level=logging.INFO)


port = getenv('PORT', 8080)
mcp = FastMCP("Gofannon Demo MCP Server on Cloud Run")

# Add arxiv
get_article = GetArticle()
get_article.export_to_mcp(mcp)
search = Search()
search.export_to_mcp(mcp)

# Add url content
get_url_content = GetUrlContent()
get_url_content.export_to_mcp(mcp)

# Add google search
google_search = GoogleSearch(getenv('GOOGLE_SEARCH_API_KEY'), getenv('GOOGLE_SEARCH_ENGINE_ID'))
google_search.export_to_mcp(mcp)

from starlette.requests import Request
from starlette.responses import PlainTextResponse

@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> PlainTextResponse:
    return PlainTextResponse("OK")

