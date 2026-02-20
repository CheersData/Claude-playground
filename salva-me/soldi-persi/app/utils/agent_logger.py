"""Logging dedicato per le chiamate degli agenti AI.

Scrive file di log completi (request + response) nella cartella logs/.
Ogni chiamata produce un file separato con timestamp + nome agente.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path

# Cartella logs/ alla root del progetto (soldi-persi/logs/)
LOGS_DIR = Path(__file__).parent.parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

logger = logging.getLogger("soldi_persi")

# --- File handler per il log generale (logs/soldi_persi.log) ---
_file_handler = logging.FileHandler(LOGS_DIR / "soldi_persi.log", encoding="utf-8")
_file_handler.setLevel(logging.DEBUG)
_file_handler.setFormatter(
    logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
)

# --- Console handler ---
_console_handler = logging.StreamHandler()
_console_handler.setLevel(logging.INFO)
_console_handler.setFormatter(
    logging.Formatter(
        "\033[36m%(asctime)s\033[0m | %(levelname)-8s | \033[33m%(name)s\033[0m | %(message)s",
        datefmt="%H:%M:%S",
    )
)

# Configura il logger root del progetto
logger.setLevel(logging.DEBUG)
if not logger.handlers:
    logger.addHandler(_file_handler)
    logger.addHandler(_console_handler)


def _safe_json_dump(obj: dict | list, indent: int = 2) -> str:
    """JSON dump sicuro che non esplode su oggetti non serializzabili."""
    try:
        return json.dumps(obj, indent=indent, ensure_ascii=False, default=str)
    except Exception:
        return str(obj)


def log_agent_call(
    agent_name: str,
    model: str,
    system_prompt: str,
    user_message: str,
    raw_response: str | None = None,
    parsed_response: dict | list | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    elapsed_seconds: float = 0,
    error: str | None = None,
    is_image_call: bool = False,
):
    """Logga una chiamata completa ad un agente: request + response.

    Scrive:
    - Una riga sintetica su console e soldi_persi.log
    - Un file dettagliato per ogni chiamata in logs/calls/
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    status = "ERROR" if error else "OK"

    # --- Riga sintetica ---
    summary = (
        f"[{agent_name}] model={model} | status={status} | "
        f"tokens_in={input_tokens} tokens_out={output_tokens} | "
        f"time={elapsed_seconds:.1f}s"
    )
    if error:
        summary += f" | error={error}"
    logger.info(summary)

    # --- File dettagliato per questa chiamata ---
    calls_dir = LOGS_DIR / "calls"
    calls_dir.mkdir(exist_ok=True)

    safe_name = agent_name.replace(" ", "_").lower()
    filename = f"{timestamp}_{safe_name}.log"
    filepath = calls_dir / filename

    separator = "=" * 80
    section = "-" * 80

    lines = [
        separator,
        f"AGENT CALL: {agent_name}",
        f"Timestamp:  {datetime.now().isoformat()}",
        f"Model:      {model}",
        f"Status:     {status}",
        f"Tokens In:  {input_tokens}",
        f"Tokens Out: {output_tokens}",
        f"Time:       {elapsed_seconds:.2f}s",
        separator,
        "",
        section,
        "SYSTEM PROMPT",
        section,
        system_prompt,
        "",
        section,
        "USER MESSAGE" + (" (image omitted)" if is_image_call else ""),
        section,
        user_message if not is_image_call else "[Image data omitted — see text portion below]\n" + user_message,
        "",
    ]

    if raw_response is not None:
        lines.extend([
            section,
            "RAW RESPONSE (full text from Claude)",
            section,
            raw_response,
            "",
        ])

    if parsed_response is not None:
        lines.extend([
            section,
            "PARSED JSON",
            section,
            _safe_json_dump(parsed_response),
            "",
        ])

    if error:
        lines.extend([
            section,
            "ERROR",
            section,
            error,
            "",
        ])

    lines.append(separator)

    filepath.write_text("\n".join(lines), encoding="utf-8")
    logger.debug("Call log saved to %s", filepath)

    return filepath
