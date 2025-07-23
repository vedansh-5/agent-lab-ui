import logging
import os
import sys

import click
import uvicorn

from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentSkill
from agent_executor import SmolAgentExecutor
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Agent and Server Configuration ---

# This function creates and configures the main ASGI application
def create_app():
    """Creates and configures the A2A Starlette application."""
    if not os.getenv("OPENAI_API_KEY"):
        logger.warning("OPENAI_API_KEY environment variable not set. The agent may not function correctly.")

        # Determine host and port from environment variables, essential for Cloud Run
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8080))

    # The APP_URL is crucial for the AgentCard so clients know how to reach the agent.
    # On Cloud Run, this will be the public URL of the service.
    # Locally, it points to localhost.
    app_url = os.getenv("APP_URL", f"http://localhost:{port}/")

    # Define the agent's skill
    skill = AgentSkill(
        id="smol_dev_skill",
        name="Generate and Execute Code",
        description="Takes a natural language prompt, generates a plan and Python code to accomplish the task, executes the code, and returns the result.",
        tags=["smol-agent", "code-generation", "execution"],
        examples=["write a python script that calculates the 10th fibonacci number and prints it"],
    )

    # Define the Agent Card
    agent_card = AgentCard(
        name="Smol Developer Agent",
        description="An AI agent that can generate and execute code based on a prompt.",
        url=app_url,
        version="1.0.0",
        defaultInputModes=["text"],
        defaultOutputModes=["text"],
        capabilities=AgentCapabilities(streaming=True),
        skills=[skill],
    )

    # Set up the A2A request handler with our custom agent executor
    request_handler = DefaultRequestHandler(
        agent_executor=SmolAgentExecutor(),
        task_store=InMemoryTaskStore(),
    )

    # Create the A2A server application
    server = A2AStarletteApplication(
        agent_card=agent_card, http_handler=request_handler
    )

    return server.build()

# Create the app instance for Gunicorn to find
app = create_app()

# --- Click command for local execution ---
@click.command()
@click.option('--host', 'host', default='localhost', help="Host for local server.")
@click.option('--port', 'port', default=8080, help="Port for local server.")
def cli(host: str, port: int):
    """Starts the Smol Agent A2A server for local development."""
    logger.info(f"Starting local server on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port)

# This block allows running `uv run .` for local development
if __name__ == "__main__":
    # this ensures that `cli()` runs when using `uv run .`
    if not hasattr(sys, '_called_from_uvicorn'):
        cli()  