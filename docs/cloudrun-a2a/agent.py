import asyncio
import logging
import os
from collections.abc import AsyncIterable
from typing import Any

import smol_dev
from litellm import completion

# Set the model for smol-dev to use. This can be configured via environment variables.
smol_dev.MODEL = os.getenv("SMOL_MODEL", "gemini/gemini-1.5-flash")

logger = logging.getLogger(__name__)

class SmolAgentWrapper:
    """A wrapper for the smol-dev agent to integrate with the A2A protocol."""

    SUPPORTED_CONTENT_TYPES = ["text/plain"]

    async def stream(self, query: str) -> AsyncIterable[dict[str, Any]]:
        """
        Processes a user query by generating a plan, writing code, and executing it.
        Yields progress updates throughout the process.

        Args:
            query: The user's natural language prompt.

        Yields:
            A dictionary containing the status and content of each step.
        """
        try:
            # 1. Generate the plan
            yield {"status": "working", "content": "Generating plan..."}
            plan = await asyncio.to_thread(smol_dev.plan, query)
            yield {"status": "working", "content": f"**Plan Generated:**\n\n{plan}"}

            # 2. Generate the code
            yield {"status": "working", "content": "Generating code..."}
            # The smol_dev.code function expects a file path, but we can pass the plan directly
            # by simulating the file content.
            generated_code = await asyncio.to_thread(smol_dev.code, plan, query)
            yield {"status": "working", "content": f"**Code Generated:**\n```python\n{generated_code}\n```"}

            # 3. Execute the code
            yield {"status": "working", "content": "Executing code..."}

            # WARNING: Executing LLM-generated code is dangerous.
            # In a real application, this must be done in a secure, sandboxed environment.
            execution_result = await asyncio.to_thread(smol_dev.execute, generated_code)

            final_output = f"**Execution Result:**\n\n{execution_result}"
            yield {"status": "completed", "content": final_output}

        except Exception as e:
            logger.error(f"Error in SmolAgentWrapper: {e}", exc_info=True)
            yield {"status": "failed", "content": f"An error occurred: {str(e)}"}  