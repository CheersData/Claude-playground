from datetime import datetime

from pydantic import BaseModel

from app.models.opportunities import BenefitOpportunity, CostReduction, TaxOpportunity


class ReportSection(BaseModel):
    titolo: str
    items: list[TaxOpportunity | CostReduction | BenefitOpportunity]
    totale_risparmio: float


class FinalReport(BaseModel):
    """Report finale generato dall'Orchestrator."""

    user_id: str
    data_generazione: datetime
    anno_riferimento: int
    profilo_completezza: float  # 0-1

    # Sezioni del report
    opportunita_fiscali: ReportSection
    riduzioni_costo: ReportSection
    benefit_disponibili: ReportSection

    # Aggregati
    risparmio_totale_stimato: float
    risparmio_minimo: float
    risparmio_massimo: float

    # Top 3 azioni prioritarie (per impatto economico)
    azioni_prioritarie: list[dict]  # {titolo, risparmio, azione, urgenza}

    # Metadata
    documenti_analizzati: list[str]
    limitazioni: list[str]  # Cosa non è stato possibile analizzare
    disclaimer: str

    # Per il frontend
    score_salute_finanziaria: int  # 0-100
    confronto_media_nazionale: str | None = None
