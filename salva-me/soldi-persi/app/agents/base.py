import json
import logging
from abc import ABC, abstractmethod

import anthropic
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Classe base per tutti gli agenti."""

    def __init__(self, name: str, model: str | None = None):
        self.name = name
        self.model = model or settings.DEFAULT_MODEL
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Ritorna il system prompt dell'agente."""
        pass

    @abstractmethod
    def get_output_model(self) -> type[BaseModel]:
        """Ritorna il Pydantic model per l'output."""
        pass

    async def run(self, user_message: str, **kwargs) -> dict:
        """Esegue l'agente e ritorna output strutturato."""
        logger.info("Agent %s starting with model %s", self.name, self.model)
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=self.get_system_prompt(),
                messages=[{"role": "user", "content": user_message}],
                **kwargs,
            )

            # Estrai testo dalla risposta
            raw_text = response.content[0].text

            # Pulisci e parsa JSON
            json_str = self._extract_json(raw_text)
            parsed = json.loads(json_str)

            logger.info("Agent %s completed successfully", self.name)
            return {
                "status": "success",
                "data": parsed,
                "model": self.model,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
            }

        except json.JSONDecodeError as e:
            logger.error("Agent %s JSON parsing failed: %s", self.name, e)
            return {
                "status": "error",
                "error": f"JSON parsing failed: {str(e)}",
                "raw_response": raw_text if "raw_text" in dir() else None,
            }
        except Exception as e:
            logger.error("Agent %s failed: %s", self.name, e)
            return {
                "status": "error",
                "error": f"{self.name} failed: {str(e)}",
            }

    def _extract_json(self, text: str) -> str:
        """Estrae JSON dal testo, gestendo markdown code blocks."""
        text = text.strip()
        if text.startswith("```"):
            # Rimuovi code block markers
            lines = text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            text = "\n".join(lines)
        # Trova il primo [ o { e l'ultimo ] o }
        start_array = text.find("[")
        start_obj = text.find("{")
        if start_array == -1 and start_obj == -1:
            raise ValueError("No JSON found in response")
        if start_array == -1:
            start = start_obj
        elif start_obj == -1:
            start = start_array
        else:
            start = min(start_array, start_obj)

        if text[start] == "[":
            end = text.rfind("]") + 1
        else:
            end = text.rfind("}") + 1

        return text[start:end]
