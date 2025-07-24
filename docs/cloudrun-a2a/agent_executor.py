import logging

from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.types import (
    InvalidParamsError,
    Part,
    Task,
    TextPart,
    UnsupportedOperationError,
)
from a2a.utils import completed_task, new_artifact
from a2a.utils.errors import ServerError
from agent import SmolWeatherAgent


logger = logging.getLogger(__name__)


class SmolAgentExecutor(AgentExecutor):
    """
    An AgentExecutor that bridges the A2A server with our SmolWeatherAgent.
    """

    def __init__(self):
        self.agent = SmolWeatherAgent()

    async def execute(
            self,
            context: RequestContext,
            event_queue: EventQueue,
    ) -> None:
        """
        Executes the agent logic for an incoming request.
        """
        if self._validate_request(context):
            raise ServerError(error=InvalidParamsError())

        query = context.get_user_input()
        logger.info(f"Received query for session {context.context_id}: '{query}'")

        try:
            # Asynchronously invoke the agent. The agent itself runs its sync logic in a thread.
            result_text = await self.agent.ainvoke(query)
            logger.info(f"Agent for session {context.context_id} returned: '{result_text}'")

            # Create an artifact with the text part
            artifact = new_artifact(
                parts=[Part(root=TextPart(text=result_text))],
                name=f'weather_report_{context.task_id}',
            )

            # Create a completed task event with the artifact
            task_completion = completed_task(
                context.task_id,
                context.context_id,
                artifacts=[artifact],
                history=[context.message],
            )

            await event_queue.enqueue_event(task_completion)

        except Exception as e:
            logger.error(f"Error invoking agent for session {context.context_id}: {e}", exc_info=True)
            # You could enqueue a failed task event here if desired
            raise ServerError(
                error=ValueError(f"Error invoking smolagent: {e}")
            ) from e

    async def cancel(
            self, request: RequestContext, event_queue: EventQueue
    ) -> Task | None:
        # Cancellation is not implemented for this simple agent
        raise ServerError(error=UnsupportedOperationError())

    def _validate_request(self, context: RequestContext) -> bool:
        # No special validation needed for this simple agent
        return False