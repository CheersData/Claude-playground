import json
import logging

from pydantic import BaseModel

from app.agents.base import BaseAgent
from app.models.opportunities import TaxOpportunity
from app.models.profile import UserFinancialProfile
from app.prompts.tax_optimizer import TAX_OPTIMIZER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class TaxOptimizerAgent(BaseAgent):
    """Agent 2: Identifica opportunità di risparmio fiscale."""

    def __init__(self):
        super().__init__(name="TaxOptimizer")

    def get_system_prompt(self) -> str:
        return TAX_OPTIMIZER_SYSTEM_PROMPT

    def get_output_model(self) -> type[BaseModel]:
        return TaxOpportunity

    async def analyze(self, profile: UserFinancialProfile) -> list[TaxOpportunity]:
        """Analizza il profilo e ritorna opportunità fiscali."""
        profile_json = profile.model_dump_json(indent=2)
        result = await self.run(
            f"Analizza questo profilo finanziario e identifica tutte le opportunità di risparmio fiscale:\n\n{profile_json}"
        )

        if result["status"] != "success":
            logger.error("TaxOptimizer failed: %s", result.get("error"))
            return []

        opportunities = []
        data = result["data"]
        if not isinstance(data, list):
            data = [data]

        for item in data:
            try:
                opp = TaxOpportunity(**item)
                opportunities.append(opp)
            except Exception as e:
                logger.warning("Failed to parse TaxOpportunity: %s — %s", e, item)

        return opportunities
