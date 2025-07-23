import logging
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState, UnsupportedOperationError
from a2a.utils import new_task
from a2a.utils.errors import ServerError
from agent import SmolAgentWrapper

logger = logging.getLogger(__name__)

class SmolAgentExecutor(AgentExecutor):
    """
    An AgentExecutor that integrates the SmolAgentWrapper with the A2A protocol.
    It handles the lifecycle of a task, streaming updates from the agent back to the client.
    """

    def __init__(self):
        self.agent = SmolAgentWrapper()

    async def execute(
            self,
            context: RequestContext,
            event_queue: EventQueue,
    ) -> None:
        """
        Executes a task based on the user's input from the RequestContext.
        """
        query = context.get_user_input()
        task = context.current_task

        if not task:
            task = new_task(context.message)
            await event_queue.enqueue_event(task)

        updater = TaskUpdater(event_queue, task.id, task.contextId)

        try:
            # Stream results from the smol agent
            async for item in self.agent.stream(query):
                status = item["status"]
                content = item["content"]

                if status == "working":
                    # Send an intermediate status update
                    await updater.update_status(
                        TaskState.working,
                        updater.new_agent_message_from_text(content)
                    )
                elif status == "completed":
                    # The task is done, send the final artifact and complete the task
                    await updater.add_artifact_from_text(
                        content, name="smol_agent_result"
                    )
                    await updater.complete()
                elif status == "failed":
                    # The task failed, send an error message and fail the task
                    await updater.failed(
                        updater.new_agent_message_from_text(content)
                    )
        except Exception as e:
            logger.error(f"Executor error for task {task.id}: {e}", exc_info=True)
            await updater.failed(
                updater.new_agent_message_from_text(f"A critical error occurred: {e}")
            )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        # Smol-agent execution is synchronous within its steps, so cancellation is not straightforward.
        # This is a placeholder for a more advanced implementation.
        raise ServerError(error=UnsupportedOperationError(message="Cancellation is not supported for this agent."))  