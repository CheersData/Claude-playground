import asyncio
import json
import logging
import uuid
from datetime import datetime

from pydantic import BaseModel

from app.agents.base import BaseAgent
from app.agents.tax_optimizer import TaxOptimizerAgent
from app.agents.cost_benchmarker import CostBenchmarkerAgent
from app.agents.benefit_scout import BenefitScoutAgent
from app.models.opportunities import BenefitOpportunity, CostReduction, TaxOpportunity
from app.models.profile import UserFinancialProfile
from app.models.report import FinalReport, ReportSection
from app.prompts.orchestrator import ORCHESTRATOR_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

DISCLAIMER = (
    "Questo report è generato automaticamente e ha valore puramente informativo. "
    "Le stime di risparmio sono indicative e basate su dati di mercato generali. "
    "Si consiglia di verificare le opportunità identificate con un professionista "
    "abilitato (commercialista, consulente finanziario) prima di intraprendere azioni. "
    "Soldi Persi non è un CAF né un intermediario finanziario."
)


class OrchestratorAgent(BaseAgent):
    """Agent 1: Coordina gli agenti specializzati e genera il report finale."""

    def __init__(self):
        super().__init__(name="Orchestrator")
        self.tax_agent = TaxOptimizerAgent()
        self.cost_agent = CostBenchmarkerAgent()
        self.benefit_agent = BenefitScoutAgent()

    def get_system_prompt(self) -> str:
        return ORCHESTRATOR_SYSTEM_PROMPT

    def get_output_model(self) -> type[BaseModel]:
        return FinalReport

    async def analyze(self, profile: UserFinancialProfile) -> FinalReport:
        """Esegue la pipeline completa: lancia agenti in parallelo e genera report."""
        logger.info("Orchestrator starting analysis for %s %s",
                     profile.personal_info.nome, profile.personal_info.cognome)

        # Lancia i 3 agenti in parallelo
        limitations: list[str] = []

        tax_task = asyncio.create_task(self._safe_run(self.tax_agent.analyze, profile, "Tax Optimizer"))
        cost_task = asyncio.create_task(self._safe_run(self.cost_agent.analyze, profile, "Cost Benchmarker"))
        benefit_task = asyncio.create_task(self._safe_run(self.benefit_agent.analyze, profile, "Benefit Scout"))

        tax_result, cost_result, benefit_result = await asyncio.gather(
            tax_task, cost_task, benefit_task
        )

        # Gestisci risultati / errori
        tax_opps: list[TaxOpportunity] = []
        cost_reds: list[CostReduction] = []
        benefits: list[BenefitOpportunity] = []

        if isinstance(tax_result, list):
            tax_opps = tax_result
        else:
            limitations.append(f"Analisi fiscale non disponibile: {tax_result}")

        if isinstance(cost_result, list):
            cost_reds = cost_result
        else:
            limitations.append(f"Analisi costi non disponibile: {cost_result}")

        if isinstance(benefit_result, list):
            benefits = benefit_result
        else:
            limitations.append(f"Analisi benefit non disponibile: {benefit_result}")

        # Costruisci report
        return self._build_report(profile, tax_opps, cost_reds, benefits, limitations)

    async def _safe_run(self, func, profile: UserFinancialProfile, agent_name: str):
        """Esegue un agente in modo sicuro, catturando eccezioni."""
        try:
            return await func(profile)
        except Exception as e:
            logger.error("Agent %s failed: %s", agent_name, e)
            return str(e)

    def _build_report(
        self,
        profile: UserFinancialProfile,
        tax_opps: list[TaxOpportunity],
        cost_reds: list[CostReduction],
        benefits: list[BenefitOpportunity],
        limitations: list[str],
    ) -> FinalReport:
        """Costruisce il FinalReport dai risultati degli agenti."""

        # Calcola totali per sezione
        tax_total = sum(o.risparmio_stimato_annuo for o in tax_opps)
        cost_total = sum(r.risparmio_stimato_annuo for r in cost_reds)
        benefit_total = sum(b.valore_stimato for b in benefits)

        tax_min = sum(o.risparmio_minimo for o in tax_opps)
        cost_min = sum(r.risparmio_stimato_annuo * 0.7 for r in cost_reds)  # Stima conservativa
        benefit_min = sum(b.valore_minimo for b in benefits)

        tax_max = sum(o.risparmio_massimo for o in tax_opps)
        cost_max = sum(r.risparmio_stimato_annuo * 1.3 for r in cost_reds)  # Stima ottimistica
        benefit_max = sum(b.valore_massimo for b in benefits)

        risparmio_totale = tax_total + cost_total + benefit_total
        risparmio_min = tax_min + cost_min + benefit_min
        risparmio_max = tax_max + cost_max + benefit_max

        # Calcola score salute finanziaria
        reddito_netto = None
        if profile.employment and profile.employment.reddito_netto:
            reddito_netto = profile.employment.reddito_netto
        elif profile.employment and profile.employment.ral_annua:
            # Stima reddito netto come ~70% della RAL
            reddito_netto = profile.employment.ral_annua * 0.7

        if reddito_netto and reddito_netto > 0:
            score = max(0, min(100, int(100 - (risparmio_totale / reddito_netto * 100))))
        else:
            score = 50  # Default se non abbiamo dati

        # Crea azioni prioritarie (top 3 per score)
        all_items: list[dict] = []
        for o in tax_opps:
            f = {"facile": 1.0, "media": 0.7, "complessa": 0.4}.get(o.difficolta, 0.7)
            all_items.append({
                "titolo": o.titolo,
                "risparmio": o.risparmio_stimato_annuo,
                "azione": o.azione_richiesta,
                "urgenza": o.urgenza,
                "score": o.risparmio_stimato_annuo * o.confidence * f,
            })
        for r in cost_reds:
            f = {"minimo": 1.0, "medio": 0.7, "significativo": 0.4}.get(r.sforzo_cambio, 0.7)
            all_items.append({
                "titolo": r.titolo,
                "risparmio": r.risparmio_stimato_annuo,
                "azione": r.alternativa_suggerita or "Confronta offerte sul mercato",
                "urgenza": "immediata",
                "score": r.risparmio_stimato_annuo * f,
            })
        for b in benefits:
            all_items.append({
                "titolo": b.titolo,
                "risparmio": b.valore_stimato,
                "azione": b.come_richiederlo,
                "urgenza": "immediata" if b.scadenza_domanda else "pianificazione",
                "score": b.valore_stimato * b.eligibilita_confidence,
            })

        all_items.sort(key=lambda x: x["score"], reverse=True)
        azioni_prioritarie = [
            {k: v for k, v in item.items() if k != "score"}
            for item in all_items[:3]
        ]

        # Aggiungi limitazioni sui dati mancanti
        if profile.dati_mancanti:
            limitations.extend(
                [f"Dato mancante: {d}" for d in profile.dati_mancanti]
            )

        return FinalReport(
            user_id=str(uuid.uuid4()),
            data_generazione=datetime.now(),
            anno_riferimento=profile.anno_riferimento,
            profilo_completezza=profile.confidence_score,
            opportunita_fiscali=ReportSection(
                titolo="Opportunità Fiscali",
                items=tax_opps,
                totale_risparmio=tax_total,
            ),
            riduzioni_costo=ReportSection(
                titolo="Riduzioni di Costo",
                items=cost_reds,
                totale_risparmio=cost_total,
            ),
            benefit_disponibili=ReportSection(
                titolo="Bonus e Agevolazioni Disponibili",
                items=benefits,
                totale_risparmio=benefit_total,
            ),
            risparmio_totale_stimato=risparmio_totale,
            risparmio_minimo=risparmio_min,
            risparmio_massimo=risparmio_max,
            azioni_prioritarie=azioni_prioritarie,
            documenti_analizzati=profile.documenti_analizzati,
            limitazioni=limitations,
            disclaimer=DISCLAIMER,
            score_salute_finanziaria=score,
        )
