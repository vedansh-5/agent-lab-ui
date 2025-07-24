import logging
import os
import sys

import click
import uvicorn
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from agent import SmolWeatherAgent
from agent_executor import SmolAgentExecutor
from dotenv import load_dotenv


# Load environment variables from .env file for local development
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_agent_card(host: str, port: int, app_url_override: str | None) -> AgentCard:
    """Constructs the AgentCard, detecting the URL for Cloud Run."""
    if app_url_override:
        # On Cloud Run, the service URL is provided, but not the port.
        # 'auto' is a special value we use to signal we need to get the URL from Cloud Run metadata.
        # This environment variable is automatically set by Cloud Run.
        if app_url_override == "auto":
            service_url = os.getenv("SERVICE_URL", f"http://{host}:{port}/")
            logger.info(f"service_url is set to: {service_url}");
        else:
            service_url = app_url_override
    else:
        service_url = f"http://{host}:{port}/"

    logger.info(f"AgentCard URL set to: {service_url}")

    skill = AgentSkill(
        id="get_weather",
        name="Get Weather Forecast",
        description="Provides a completely unserious and pessimistic weather forecast.",
        tags=["weather", "forecast", "humor"],
        examples=["What is the weather like in Paris?"],
    )

    return AgentCard(
        name="Smol Weather Agent",
        description="An agent that provides delightfully grim weather forecasts.",
        url=service_url,
        version="0.1.0",
        default_input_modes=SmolWeatherAgent.SUPPORTED_CONTENT_TYPES,
        default_output_modes=SmolWeatherAgent.SUPPORTED_CONTENT_TYPES,
        capabilities=AgentCapabilities(streaming=False), # This agent is not streaming
        skills=[skill],
    )


@click.command()
@click.option("--host", default="0.0.0.0", help="Host to bind the server to.")
@click.option("--port", default=None, type=int, help="Port to bind the server to. Overridden by $PORT env var.")
@click.option("--app-url-override", default=None, help="Manually override the agent's public URL. Use 'auto' for Cloud Run detection.")
def main(host: str, port: int | None, app_url_override: str | None):
    """Entry point for the A2A + smolagents server."""
    # Cloud Run provides the port to listen on via the PORT environment variable.
    run_port = port if port is not None else int(os.getenv("PORT", 8080))

    # Check for API key
    if not os.getenv("OPENAI_API_KEY"):
        logger.error("OPENAI_API_KEY environment variable not set. The agent will not work.")
        sys.exit(1)

    agent_card = get_agent_card(host, run_port, app_url_override)
    logger.info(f"agent_card is set to: {agent_card}")

    request_handler = DefaultRequestHandler(
        agent_executor=SmolAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )
    server = A2AStarletteApplication(
        agent_card=agent_card, http_handler=request_handler
    )

    logger.info(f"Starting Smolagents A2A server on {host}:{run_port}")
    uvicorn.run(server.build(), host=host, port=run_port)


if __name__ == "__main__":
    main()