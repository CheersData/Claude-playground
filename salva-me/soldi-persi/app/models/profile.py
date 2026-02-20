from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class PersonalInfo(BaseModel):
    nome: str
    cognome: str
    codice_fiscale: str | None = None
    data_nascita: date | None = None
    comune_residenza: str | None = None
    provincia: str | None = None
    regione: str | None = None


class FamilyMember(BaseModel):
    relazione: Literal["coniuge", "figlio", "genitore", "altro"]
    nome: str | None = None
    data_nascita: date | None = None
    a_carico: bool = True
    disabilita: bool = False
    percentuale_carico: int = 100  # 50 o 100


class EmploymentInfo(BaseModel):
    tipo: Literal["dipendente", "autonomo", "partita_iva", "pensionato", "disoccupato"]
    datore_lavoro: str | None = None
    ral_annua: float | None = None  # Reddito Annuo Lordo
    reddito_netto: float | None = None
    ccnl: str | None = None  # Contratto collettivo (es. "Metalmeccanico")
    livello: str | None = None


class IncomeSource(BaseModel):
    tipo: Literal[
        "lavoro_dipendente",
        "lavoro_autonomo",
        "affitto",
        "capitale",
        "diversi",
        "pensione",
    ]
    importo_annuo_lordo: float
    ritenute: float = 0


class Expense(BaseModel):
    categoria: Literal[
        "mediche",
        "veterinarie",
        "istruzione",
        "universitarie",
        "sport_figli",
        "affitto_abitazione",
        "interessi_mutuo",
        "ristrutturazione",
        "risparmio_energetico",
        "bonus_mobili",
        "superbonus",
        "assicurazione_vita",
        "assicurazione_infortuni",
        "previdenza_complementare",
        "erogazioni_liberali",
        "spese_funebri",
        "assistenza_personale",
        "abbonamento_trasporto",
        "asilo_nido",
        "canone_locazione_studenti",
        "altro",
    ]
    importo_annuo: float
    gia_detratta: bool = False  # Se già presente nella dichiarazione
    descrizione: str | None = None


class Contract(BaseModel):
    tipo: Literal[
        "energia",
        "gas",
        "internet",
        "mobile",
        "assicurazione_auto",
        "assicurazione_casa",
        "assicurazione_vita",
        "mutuo",
        "affitto",
        "pay_tv",
        "abbonamento",
        "altro",
    ]
    fornitore: str
    costo_mensile: float | None = None
    costo_annuo: float | None = None
    data_scadenza: date | None = None
    dettagli: dict = {}  # kWh, Gbps, massimale, etc.


class PropertyOwned(BaseModel):
    tipo: Literal["abitazione_principale", "seconda_casa", "terreno", "commerciale"]
    comune: str | None = None
    rendita_catastale: float | None = None
    anno_acquisto: int | None = None
    mutuo_residuo: float | None = None


class UserFinancialProfile(BaseModel):
    """Profilo finanziario completo dell'utente, estratto dai documenti."""

    personal_info: PersonalInfo
    famiglia: list[FamilyMember] = []
    employment: EmploymentInfo | None = None
    redditi: list[IncomeSource] = []
    spese: list[Expense] = []
    contratti: list[Contract] = []
    proprieta: list[PropertyOwned] = []
    isee: float | None = None
    anno_riferimento: int = 2024
    documenti_analizzati: list[str] = []  # Lista dei documenti processati
    dati_mancanti: list[str] = []  # Cosa non è stato possibile estrarre
    confidence_score: float = 0.0  # 0-1, quanto il profilo è completo


class DocumentExtractionResult(BaseModel):
    """Output di Agent 0 per singolo documento."""

    filename: str
    tipo_documento: Literal[
        "cu",
        "busta_paga",
        "bolletta_energia",
        "bolletta_gas",
        "polizza",
        "contratto_mutuo",
        "isee",
        "730",
        "modello_redditi",
        "contratto_affitto",
        "altro",
        "non_riconosciuto",
    ]
    dati_estratti: dict  # Schema varia per tipo documento
    confidence: float
    warnings: list[str] = []
