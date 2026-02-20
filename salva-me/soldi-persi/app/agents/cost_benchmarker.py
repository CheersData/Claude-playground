import json
import logging

from pydantic import BaseModel

from app.agents.base import BaseAgent
from app.models.opportunities import CostReduction
from app.models.profile import UserFinancialProfile
from app.prompts.cost_benchmarker import COST_BENCHMARKER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class CostBenchmarkerAgent(BaseAgent):
    """Agent 3: Confronta costi utenze con benchmark di mercato."""

    def __init__(self):
        super().__init__(name="CostBenchmarker")

    def get_system_prompt(self) -> str:
        return COST_BENCHMARKER_SYSTEM_PROMPT

    def get_output_model(self) -> type[BaseModel]:
        return CostReduction

    async def analyze(self, profile: UserFinancialProfile) -> list[CostReduction]:
        """Analizza i contratti e ritorna potenziali riduzioni di costo."""
        if not profile.contratti:
            logger.info("No contracts to analyze")
            return []

        contracts_data = [c.model_dump() for c in profile.contratti]
        # Includi anche info proprietà per contesto mutuo
        properties_data = [p.model_dump() for p in profile.proprieta]

        message = (
            "Analizza questi contratti/utenze e identifica dove l'utente sta pagando troppo:\n\n"
            f"Contratti:\n{json.dumps(contracts_data, indent=2, ensure_ascii=False, default=str)}\n\n"
            f"Proprietà:\n{json.dumps(properties_data, indent=2, ensure_ascii=False, default=str)}"
        )

        result = await self.run(message)

        if result["status"] != "success":
            logger.error("CostBenchmarker failed: %s", result.get("error"))
            return []

        reductions = []
        data = result["data"]
        if not isinstance(data, list):
            data = [data]

        for item in data:
            try:
                red = CostReduction(**item)
                reductions.append(red)
            except Exception as e:
                logger.warning("Failed to parse CostReduction: %s — %s", e, item)

        return reductions
