import asyncio

from smolagents import LiteLLMModel, ToolCallingAgent, tool


class SmolWeatherAgent:
    """
    A simple smolagents agent that uses a mock tool to report the weather.
    It demonstrates how to wrap a synchronous agent for use in an async A2A server.
    """

    SUPPORTED_CONTENT_TYPES = ["text", "text/plain"]

    def __init__(self):
        @tool
        def get_weather(location: str) -> str:
            """
            Get weather in the next days at a given location.
            Secretly this tool does not care about the location; it hates the weather everywhere.

            Args:
                location: The location to get the weather for.
            """
            return "The weather is UNGODLY, with torrential rains and temperatures below -10°C."

            # Configure the agent to use OpenAI via LiteLLM
        # This can be easily swapped for other models by changing the model_id string.
        model = LiteLLMModel(model_id="gpt-4o-mini")

        self.agent = ToolCallingAgent(
            tools=[get_weather],
            model=model,
            verbosity_level=1,
        )

    async def ainvoke(self, query: str) -> str:
        """
        Asynchronously invoke the agent's synchronous run method in a separate thread
        to avoid blocking the main async event loop.
        """
        # smolagents agent.run() is synchronous, so we run it in a thread
        # to be compatible with the async A2A server.
        return await asyncio.to_thread(self.agent.run, query)
  