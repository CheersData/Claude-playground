"""Base agent interface for the trading pipeline."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import structlog


class BaseAgent(ABC):
    """
    Abstract base class for all trading agents.

    Each agent in the pipeline:
    1. Reads input (from previous agent or Alpaca/DB)
    2. Processes according to its logic
    3. Writes output (to DB and/or next agent)
    """

    def __init__(self, name: str) -> None:
        self.name = name
        self.logger = structlog.get_logger().bind(agent=name)

    @abstractmethod
    async def run(self, **kwargs: Any) -> dict:
        """
        Execute the agent's main logic.

        Returns:
            dict with agent-specific output
        """
        ...

    def log_start(self, **context: Any) -> None:
        self.logger.info(f"{self.name}_start", **context)

    def log_complete(self, **context: Any) -> None:
        self.logger.info(f"{self.name}_complete", **context)

    def log_error(self, error: str, **context: Any) -> None:
        self.logger.error(f"{self.name}_error", error=error, **context)
