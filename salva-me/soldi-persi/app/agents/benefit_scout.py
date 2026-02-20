import logging

from pydantic import BaseModel

from app.agents.base import BaseAgent
from app.models.opportunities import BenefitOpportunity
from app.models.profile import UserFinancialProfile
from app.prompts.benefit_scout import BENEFIT_SCOUT_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class BenefitScoutAgent(BaseAgent):
    """Agent 4: Identifica bonus e agevolazioni pubbliche disponibili."""

    def __init__(self):
        super().__init__(name="BenefitScout")

    def get_system_prompt(self) -> str:
        return BENEFIT_SCOUT_SYSTEM_PROMPT

    def get_output_model(self) -> type[BaseModel]:
        return BenefitOpportunity

    async def analyze(self, profile: UserFinancialProfile) -> list[BenefitOpportunity]:
        """Analizza il profilo e ritorna bonus/agevolazioni disponibili."""
        profile_json = profile.model_dump_json(indent=2)
        result = await self.run(
            f"Analizza questo profilo e identifica tutti i bonus e agevolazioni a cui l'utente ha diritto:\n\n{profile_json}"
        )

        if result["status"] != "success":
            logger.error("BenefitScout failed: %s", result.get("error"))
            return []

        benefits = []
        data = result["data"]
        if not isinstance(data, list):
            data = [data]

        for item in data:
            try:
                ben = BenefitOpportunity(**item)
                benefits.append(ben)
            except Exception as e:
                logger.warning("Failed to parse BenefitOpportunity: %s — %s", e, item)

        return benefits
