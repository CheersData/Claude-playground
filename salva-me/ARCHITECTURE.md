# Soldi Persi — System Architecture

## Vision

Un sistema multi-agente che analizza la situazione finanziaria di un utente italiano e identifica denaro "lasciato sul tavolo": detrazioni fiscali non sfruttate, costi eccessivi su utenze/polizze, bonus governativi non richiesti. L'output è un report azionabile con stime di risparmio concrete.

---

## Principi Architetturali

1. **Agent Isolation**: ogni agente è un modulo autonomo con input/output tipizzati (Pydantic). Nessun agente conosce l'implementazione degli altri.
2. **Orchestrator Pattern**: un agente orchestratore coordina il flusso, gestisce retry, e aggrega i risultati.
3. **Fail Gracefully**: se un agente fallisce (es. documento illeggibile), il sistema produce comunque un report parziale con chiara indicazione di cosa manca.
4. **Privacy First**: nessun dato utente viene persistito oltre la sessione, salvo esplicito opt-in. I documenti vengono processati e poi eliminati.
5. **Deterministic Outputs**: ogni agente produce output strutturato JSON validato da Pydantic, mai testo libero.

---

## Flusso Dati (Pipeline)

```
┌─────────────────────────────────────────────────────────────┐
│                        UTENTE                               │
│  Upload: CU, buste paga, bollette, polizze, mutuo, ISEE    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              AGENT 0: DOCUMENT INGESTION                     │
│  • OCR se necessario (Claude Vision / pytesseract)           │
│  • Classificazione tipo documento                            │
│  • Estrazione dati strutturati                               │
│  • Output: UserFinancialProfile (JSON)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              AGENT 1: ORCHESTRATOR                            │
│  • Riceve UserFinancialProfile                               │
│  • Lancia Agent 2, 3, 4 in parallelo (asyncio)              │
│  • Raccoglie risultati                                       │
│  • Genera report finale                                      │
│  • Output: FinalReport (JSON)                                │
└────┬─────────────────┬─────────────────┬────────────────────┘
     │                 │                 │
     ▼                 ▼                 ▼
┌──────────┐   ┌──────────────┐   ┌──────────────┐
│ AGENT 2  │   │   AGENT 3    │   │   AGENT 4    │
│ Tax      │   │   Cost       │   │   Benefit    │
│ Optimizer│   │   Benchmarker│   │   Scout      │
└──────────┘   └──────────────┘   └──────────────┘
```

---

## Data Models (Pydantic Schemas)

### UserFinancialProfile (Output di Agent 0)

```python
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
    tipo: Literal["lavoro_dipendente", "lavoro_autonomo", "affitto", "capitale", "diversi", "pensione"]
    importo_annuo_lordo: float
    ritenute: float = 0

class Expense(BaseModel):
    categoria: Literal[
        "mediche", "veterinarie", "istruzione", "universitarie",
        "sport_figli", "affitto_abitazione", "interessi_mutuo",
        "ristrutturazione", "risparmio_energetico", "bonus_mobili",
        "superbonus", "assicurazione_vita", "assicurazione_infortuni",
        "previdenza_complementare", "erogazioni_liberali",
        "spese_funebri", "assistenza_personale", "abbonamento_trasporto",
        "asilo_nido", "canone_locazione_studenti", "altro"
    ]
    importo_annuo: float
    gia_detratta: bool = False  # Se già presente nella dichiarazione
    descrizione: str | None = None

class Contract(BaseModel):
    tipo: Literal["energia", "gas", "internet", "mobile", "assicurazione_auto",
                  "assicurazione_casa", "assicurazione_vita", "mutuo", "affitto",
                  "pay_tv", "abbonamento", "altro"]
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
    tipo_documento: Literal["cu", "busta_paga", "bolletta_energia", "bolletta_gas",
                            "polizza", "contratto_mutuo", "isee", "730", "modello_redditi",
                            "contratto_affitto", "altro", "non_riconosciuto"]
    dati_estratti: dict  # Schema varia per tipo documento
    confidence: float
    warnings: list[str] = []
```

### TaxOpportunity (Output di Agent 2)

```python
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
```

### CostReduction (Output di Agent 3)

```python
class CostReduction(BaseModel):
    id: str
    titolo: str  # Es: "Bolletta energia sovrapprezzata"
    categoria: Literal["energia", "gas", "internet", "mobile", "assicurazione",
                       "mutuo", "abbonamento", "altro"]
    fornitore_attuale: str
    costo_attuale_annuo: float
    benchmark_mercato: float  # Miglior prezzo trovato
    risparmio_stimato_annuo: float
    alternativa_suggerita: str | None = None
    sforzo_cambio: Literal["minimo", "medio", "significativo"]
    rischio_cambio: str | None = None  # Possibili penali, vincoli
    fonte_benchmark: str  # Da dove viene il dato comparativo
    note: str | None = None
```

### BenefitOpportunity (Output di Agent 4)

```python
class BenefitOpportunity(BaseModel):
    id: str
    titolo: str  # Es: "Assegno Unico non ottimizzato"
    descrizione: str
    ente_erogatore: Literal["inps", "agenzia_entrate", "regione", "comune", "altro"]
    nome_ente: str  # Es: "INPS", "Regione Veneto"
    valore_stimato: float
    valore_minimo: float
    valore_massimo: float
    tipo: Literal["bonus_una_tantum", "contributo_periodico", "agevolazione", "esenzione"]
    eligibilita_confidence: float  # 0-1
    requisiti: list[str]
    requisiti_mancanti: list[str]  # Cosa non possiamo verificare
    scadenza_domanda: date | None = None
    come_richiederlo: str
    link_ufficiale: str | None = None
    note: str | None = None
```

### FinalReport (Output dell'Orchestrator)

```python
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
```

---

## Agenti: Specifiche Dettagliate

### Agent 0 — Document Ingestion

| Campo | Valore |
|-------|--------|
| **Modello** | Claude Haiku 4.5 (costo-efficiente per extraction) |
| **Input** | File raw (PDF, immagine, testo) |
| **Output** | `DocumentExtractionResult` per ogni file, poi merge in `UserFinancialProfile` |
| **Strategia** | Vision API per documenti scansionati, text extraction per PDF nativi |
| **Parallelismo** | Ogni documento processato indipendentemente, poi merge |

**Logica di merge:**
- Se più documenti contengono la stessa info (es. nome da CU e da busta paga), usa quello con confidence più alta
- Accumula spese, redditi, contratti da fonti diverse
- Segnala conflitti (es. indirizzo diverso su due documenti)

### Agent 2 — Tax Optimizer

| Campo | Valore |
|-------|--------|
| **Modello** | Claude Sonnet 4.5 (reasoning complesso) |
| **Input** | `UserFinancialProfile` |
| **Output** | `list[TaxOpportunity]` |
| **Knowledge** | Normativa fiscale italiana (TUIR, leggi di bilancio recenti) |
| **Strategia** | Checklist sistematica di tutte le detrazioni/deduzioni possibili |

**Aree di analisi (checklist):**
1. Detrazioni 19% (art. 15 TUIR): mediche, istruzione, sport figli, affitto, interessi mutuo, assicurazioni, trasporto pubblico, veterinarie, funebri
2. Deduzioni: previdenza complementare (fino €5.164,57), erogazioni liberali, contributi colf/badanti
3. Bonus edilizi: ristrutturazione 50%, ecobonus 65%, sismabonus, bonus mobili, bonus verde
4. Crediti d'imposta: bonus prima casa under 36, credito affitto giovani
5. Regime forfettario: verifica se conviene il passaggio (per P.IVA)
6. Assegno unico: verifica ottimizzazione importi
7. Fringe benefit: verifica soglia esenzione
8. Welfare aziendale: verifica se il CCNL prevede benefit non sfruttati

### Agent 3 — Cost Benchmarker

| Campo | Valore |
|-------|--------|
| **Modello** | Claude Sonnet 4.5 |
| **Input** | `UserFinancialProfile.contratti` |
| **Output** | `list[CostReduction]` |
| **Knowledge** | Database benchmark (aggiornato periodicamente) + web search |
| **Strategia** | Confronto costi attuali vs medie di mercato e migliori offerte |

**Fonti benchmark:**
- Energia/Gas: ARERA tariffe tutela, comparatori (Selectra, Segugio)
- Internet/Mobile: comparatori, tariffe ufficiali operatori
- Assicurazioni: medie IVASS, comparatori
- Mutui: tassi medi Banca d'Italia, Mutuionline
- Note: In v1 il benchmark può essere basato su ranges noti hard-coded + reasoning del modello. In v2 integrazione con API/scraping.

### Agent 4 — Benefit Scout

| Campo | Valore |
|-------|--------|
| **Modello** | Claude Sonnet 4.5 |
| **Input** | `UserFinancialProfile` (focus: famiglia, ISEE, residenza, occupazione) |
| **Output** | `list[BenefitOpportunity]` |
| **Knowledge** | Database bonus/agevolazioni aggiornato |
| **Strategia** | Match profilo utente vs requisiti di ogni bonus disponibile |

**Catalogo bonus da verificare:**
1. **Nazionali INPS**: Assegno Unico (ottimizzazione), NASpI, bonus mamme, bonus asilo nido, congedo parentale retribuito, carta acquisti, bonus psicologo
2. **Agenzia Entrate**: bonus prima casa, bonus mobili, bonus verde, credito d'imposta affitto giovani
3. **Regionali** (basato su regione residenza): borse di studio, contributi affitto, bonus bebè regionali, agevolazioni trasporto
4. **Comunali**: riduzioni TARI, agevolazioni mensa scolastica, contributi sport, bonus matrimonio
5. **Settoriali**: bonus per CCNL specifici, fondi sanitari integrativi, fondi pensione di categoria

---

## Tech Stack

### Backend
```
Python 3.12+
FastAPI                 # API framework
Pydantic v2             # Data validation & schemas
anthropic               # Claude API client
python-multipart        # File upload handling
pdfplumber              # PDF text extraction
Pillow                  # Image processing
python-dotenv           # Environment config
uvicorn                 # ASGI server
asyncio                 # Parallel agent execution
```

### Struttura Progetto
```
soldi-persi/
├── app/
│   ├── main.py                    # FastAPI app, routes
│   ├── config.py                  # Settings, API keys
│   ├── models/
│   │   ├── __init__.py
│   │   ├── profile.py             # UserFinancialProfile + sub-models
│   │   ├── opportunities.py       # TaxOpportunity, CostReduction, BenefitOpportunity
│   │   └── report.py              # FinalReport
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── base.py                # BaseAgent class (shared logic)
│   │   ├── orchestrator.py        # Agent 1: Orchestrator
│   │   ├── document_ingestion.py  # Agent 0: Document parser
│   │   ├── tax_optimizer.py       # Agent 2: Tax analysis
│   │   ├── cost_benchmarker.py    # Agent 3: Cost comparison
│   │   └── benefit_scout.py       # Agent 4: Benefit finder
│   ├── prompts/
│   │   ├── document_ingestion.py  # System prompts for Agent 0
│   │   ├── tax_optimizer.py       # System prompts for Agent 2
│   │   ├── cost_benchmarker.py    # System prompts for Agent 3
│   │   ├── benefit_scout.py       # System prompts for Agent 4
│   │   └── orchestrator.py        # System prompts for Orchestrator
│   ├── knowledge/
│   │   ├── tax_deductions_2024.json    # Catalogo detrazioni/deduzioni
│   │   ├── bonus_catalog_2024.json     # Catalogo bonus disponibili
│   │   └── benchmark_ranges.json       # Range di costo per utilities
│   └── utils/
│       ├── pdf_extractor.py       # PDF → text
│       ├── document_classifier.py # Classifica tipo documento
│       └── merge_profiles.py      # Merge extraction results
├── tests/
│   ├── test_agents/
│   ├── test_models/
│   └── fixtures/                  # Sample documents for testing
├── .env.example
├── requirements.txt
├── Dockerfile
└── README.md
```

---

## API Endpoints

### POST /api/analyze
Upload documenti e ottieni il report completo.

```json
// Request: multipart/form-data
{
  "files": [File, File, ...],      // Documenti uploadati
  "info_aggiuntive": {              // Opzionale: info non nei documenti
    "comune_residenza": "Padova",
    "regione": "Veneto",
    "n_figli": 2,
    "isee": 25000
  }
}

// Response
{
  "status": "completed",
  "report": { FinalReport },
  "processing_time_seconds": 12.4
}
```

### POST /api/extract
Solo estrazione documenti (senza analisi).

### GET /api/report/{report_id}
Recupera un report già generato.

### GET /api/health
Health check.

---

## Error Handling Strategy

```python
class AgentError(Exception):
    """Base error for agent failures."""
    agent_name: str
    severity: Literal["critical", "degraded", "info"]
    user_message: str  # Messaggio comprensibile per l'utente

class DocumentUnreadableError(AgentError):
    severity = "degraded"
    user_message = "Non siamo riusciti a leggere questo documento. Prova a caricare una versione più nitida."

class InsufficientDataError(AgentError):
    severity = "degraded"
    user_message = "Non abbiamo abbastanza informazioni per questa analisi. Carica anche [X] per risultati più completi."
```

**Principio**: il sistema non crasha mai. Se un agente fallisce:
1. L'orchestrator lo segnala nel report sotto `limitazioni`
2. Gli altri agenti continuano
3. Il report viene generato con i dati disponibili
4. Il `confidence_score` viene abbassato proporzionalmente

---

## Sicurezza & Privacy

1. **No persistence di default**: documenti eliminati dopo processing
2. **Encryption in transit**: HTTPS obbligatorio
3. **No logging di dati personali**: solo metriche aggregate
4. **GDPR compliant**: informativa, consenso, diritto all'oblio
5. **API key isolation**: ogni utente ha sessione isolata
6. **Rate limiting**: max 10 analisi/ora per IP

---

## Roadmap

### v0.1 — MVP (2-3 settimane)
- [ ] Document ingestion (CU + busta paga)
- [ ] Tax Optimizer (detrazioni base art. 15 TUIR)
- [ ] Report semplice in JSON
- [ ] CLI interface per testing

### v0.2 — Beta (4-6 settimane)
- [ ] Tutti e 4 gli agenti funzionanti
- [ ] Frontend React minimale
- [ ] Upload multiplo documenti
- [ ] Report PDF generato

### v1.0 — Launch
- [ ] Benchmark con dati reali (API/scraping)
- [ ] Database bonus aggiornato
- [ ] Autenticazione utente
- [ ] Pagamento (Stripe)
- [ ] Report con grafici

### v2.0 — Scale
- [ ] Monitoring continuo (alert quando cambia normativa)
- [ ] Integrazione diretta con CAF/commercialisti
- [ ] App mobile
- [ ] Espansione EU
