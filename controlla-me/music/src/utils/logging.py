"""Structured logging setup using structlog.

Dual output:
- stderr: colorized dev-friendly format (ConsoleRenderer)
- file:   JSON-L, one event per line, daily rotation, 30-day retention

Log directory: music/logs/ (created automatically).
File pattern:  music.jsonl -> music.jsonl.2026-03-20 (rotates at midnight UTC).
"""

from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path

import structlog

# ---------------------------------------------------------------------------
# Log directory — sibling of music/src -> music/logs/
# ---------------------------------------------------------------------------
_LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
_LOG_RETENTION_DAYS = 30


def _ensure_log_dir() -> Path:
    """Create logs directory if it doesn't exist."""
    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    return _LOG_DIR


def setup_logging(level: str = "INFO") -> None:
    """Configure structlog with console (stderr) + JSON-L file output.

    Uses structlog -> stdlib bridge so both handlers receive every event.
    Console: colorized human-readable output.
    File:    JSON-L with daily rotation at midnight UTC, 30-day retention.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)
    log_dir = _ensure_log_dir()

    # --- Shared pre-chain (runs before stdlib formatters) ---
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    # --- Console handler (stderr, colorized) ---
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=structlog.dev.ConsoleRenderer(),
            foreign_pre_chain=shared_processors,
        )
    )

    # --- File handler (JSON-L, daily rotation) ---
    file_handler = logging.handlers.TimedRotatingFileHandler(
        filename=str(log_dir / "music.jsonl"),
        when="midnight",
        interval=1,
        backupCount=_LOG_RETENTION_DAYS,
        encoding="utf-8",
        utc=True,
    )
    file_handler.suffix = "%Y-%m-%d"
    file_handler.setLevel(log_level)
    file_handler.setFormatter(
        structlog.stdlib.ProcessorFormatter(
            processor=structlog.processors.JSONRenderer(),
            foreign_pre_chain=shared_processors,
        )
    )

    # --- Root logger: receives all structlog events via stdlib bridge ---
    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)
    root_logger.setLevel(log_level)

    # --- structlog config: route everything through stdlib ---
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_log_level,
            structlog.processors.StackInfoRenderer(),
            structlog.dev.set_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_log_dir() -> Path:
    """Return the log directory path (creates it if needed)."""
    return _ensure_log_dir()
