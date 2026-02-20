from datetime import date
from typing import Literal

from pydantic import BaseModel


class TaxOpportunity(BaseModel):
    id: str  # Unique identifier
    titolo: str  # Es: "Detrazione spese mediche non dichiarate"
    descrizione: str  # Spiegazione chiara per l'utente
    riferimento_normativo: str  # Es: "Art. 15 TUIR, comma 1, lett. c"
    tipo: Literal["detrazione", "deduzione", "credito_imposta", "esenzione"]
    risparmio_stimato_annuo: float
    risparmio_minimo: float  # Range conservativo
    risparmio_massimo: float  # Range ottimistico
    azione_richiesta: str  # Cosa deve fare l'utente
    difficolta: Literal["facile", "media", "complessa"]
    urgenza: Literal["immediata", "prossima_dichiarazione", "pianificazione"]
    documenti_necessari: list[str]
    confidence: float  # 0-1, quanto è sicura l'opportunità
    prerequisiti: list[str] = []
    note: str | None = None


class CostReduction(BaseModel):
    id: str
    titolo: str  # Es: "Bolletta energia sovrapprezzata"
    categoria: Literal[
        "energia",
        "gas",
        "internet",
        "mobile",
        "assicurazione",
        "mutuo",
        "abbonamento",
        "altro",
    ]
    fornitore_attuale: str
    costo_attuale_annuo: float
    benchmark_mercato: float  # Miglior prezzo trovato
    risparmio_stimato_annuo: float
    alternativa_suggerita: str | None = None
    sforzo_cambio: Literal["minimo", "medio", "significativo"]
    rischio_cambio: str | None = None  # Possibili penali, vincoli
    fonte_benchmark: str  # Da dove viene il dato comparativo
    note: str | None = None


class BenefitOpportunity(BaseModel):
    id: str
    titolo: str  # Es: "Assegno Unico non ottimizzato"
    descrizione: str
    ente_erogatore: Literal["inps", "agenzia_entrate", "regione", "comune", "altro"]
    nome_ente: str  # Es: "INPS", "Regione Veneto"
    valore_stimato: float
    valore_minimo: float
    valore_massimo: float
    tipo: Literal[
        "bonus_una_tantum", "contributo_periodico", "agevolazione", "esenzione"
    ]
    eligibilita_confidence: float  # 0-1
    requisiti: list[str]
    requisiti_mancanti: list[str]  # Cosa non possiamo verificare
    scadenza_domanda: date | None = None
    come_richiederlo: str
    link_ufficiale: str | None = None
    note: str | None = None
