# CLAUDE CODE — Bootstrap Prompt per "Soldi Persi"

## CONTESTO
Devi costruire "Soldi Persi", un sistema multi-agente Python che analizza documenti fiscali/finanziari di utenti italiani e identifica opportunità di risparmio non sfruttate: detrazioni fiscali mancanti, costi eccessivi su utenze/polizze, bonus governativi non richiesti.

## ARCHITETTURA
Leggi attentamente il file `docs/ARCHITECTURE.md` per l'architettura completa, i data models Pydantic, la struttura del progetto, e il flusso dati.

Leggi `prompts/agent_prompts.py` per i system prompt di tutti gli agenti.

## TASK — Build MVP (v0.1)

### Step 1: Setup Progetto
```
soldi-persi/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── config.py             # Settings (Pydantic BaseSettings)
│   ├── models/
│   │   ├── __init__.py
│   │   ├── profile.py        # TUTTI i modelli da ARCHITECTURE.md sezione "Data Models"
│   │   ├── opportunities.py  # TaxOpportunity, CostReduction, BenefitOpportunity
│   │   └── report.py         # FinalReport, ReportSection
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── base.py            # BaseAgent (vedi sotto)
│   │   ├── document_ingestion.py
│   │   ├── tax_optimizer.py
│   │   ├── cost_benchmarker.py
│   │   ├── benefit_scout.py
│   │   └── orchestrator.py
│   ├── prompts/               # Copia i prompt da prompts/agent_prompts.py
│   │   ├── __init__.py
│   │   ├── document_ingestion.py
│   │   ├── tax_optimizer.py
│   │   ├── cost_benchmarker.py
│   │   ├── benefit_scout.py
│   │   └── orchestrator.py
│   └── utils/
│       ├── __init__.py
│       ├── pdf_extractor.py
│       └── merge_profiles.py
├── tests/
│   └── test_pipeline.py      # Test end-to-end con dati mock
├── cli.py                     # CLI per testing rapido
├── .env.example
├── requirements.txt
└── README.md
```

### Step 2: Implementa BaseAgent

```python
# app/agents/base.py
import json
import anthropic
from abc import ABC, abstractmethod
from pydantic import BaseModel
from app.config import settings

class BaseAgent(ABC):
    """Classe base per tutti gli agenti."""

    def __init__(self, name: str, model: str = None):
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
        try:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=self.get_system_prompt(),
                messages=[{"role": "user", "content": user_message}],
                **kwargs
            )

            # Estrai testo dalla risposta
            raw_text = response.content[0].text

            # Pulisci e parsa JSON
            json_str = self._extract_json(raw_text)
            parsed = json.loads(json_str)

            return {
                "status": "success",
                "data": parsed,
                "model": self.model,
                "usage": {
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens
                }
            }

        except json.JSONDecodeError as e:
            return {
                "status": "error",
                "error": f"JSON parsing failed: {str(e)}",
                "raw_response": raw_text if 'raw_text' in locals() else None
            }
        except Exception as e:
            return {
                "status": "error",
                "error": f"{self.name} failed: {str(e)}"
            }

    def _extract_json(self, text: str) -> str:
        """Estrae JSON dal testo, gestendo markdown code blocks."""
        text = text.strip()
        if text.startswith("```"):
            # Rimuovi code block markers
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
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
```

### Step 3: Implementa ogni Agent

Ogni agent eredita da `BaseAgent` e implementa:
- `get_system_prompt()`: ritorna il prompt dal file prompts/
- `get_output_model()`: ritorna il Pydantic model appropriato
- Opzionalmente override di `run()` per logica custom

**Document Ingestion Agent** ha logica speciale:
- Gestisce file multipli
- Per PDF: usa `pdfplumber` per estrarre testo, poi passa a Claude
- Per immagini: usa Claude Vision API (content type "image")
- Dopo l'estrazione di ogni documento, merge i risultati in un UserFinancialProfile unico

**Orchestrator** ha logica speciale:
- Lancia Agent 2, 3, 4 in parallelo con `asyncio.gather()`
- Raccoglie risultati e gestisce errori parziali
- Chiama Claude per generare il report finale (con il suo system prompt)
- Gestisce il caso in cui uno o più agenti falliscono

### Step 4: Implementa la CLI

```python
# cli.py
"""
CLI per testare la pipeline Soldi Persi.

Usage:
    python cli.py analyze <file1> [file2] [file3] ... [--info '{"comune": "Padova"}']
    python cli.py demo  # Esegue con dati di esempio

Esempi:
    python cli.py analyze ./documenti/cu_2024.pdf ./documenti/bolletta_enel.pdf
    python cli.py demo
"""
```

La CLI `demo` deve creare un UserFinancialProfile di esempio realistico:
- Mario Rossi, 35 anni, Padova (Veneto)
- Dipendente, RAL €35.000, CCNL Metalmeccanico
- Moglie a carico, 2 figli (3 e 7 anni)
- Mutuo prima casa €150.000, tasso fisso 3.8%, rata €700
- Bolletta Enel €85/mese, Gas €120/mese (media)
- RC Auto €450/anno
- ISEE €25.000
- Non ha fondo pensione complementare
- Non detrae sport figli né abbonamento trasporto

E poi eseguire la pipeline completa mostrando il report.

### Step 5: Implementa FastAPI

```python
# app/main.py
# Endpoints come da ARCHITECTURE.md sezione "API Endpoints"
# POST /api/analyze — upload files + info aggiuntive → FinalReport
# POST /api/extract — solo estrazione documenti
# GET /api/health — health check
```

### Step 6: Tests

```python
# tests/test_pipeline.py
# 1. Test che i modelli Pydantic validano correttamente
# 2. Test della pipeline demo end-to-end (con mock del Claude API per i test CI)
# 3. Test error handling (documento illeggibile, agente che fallisce)
```

## REGOLE CRITICHE

1. **TUTTI i modelli Pydantic** devono essere esattamente come definiti in ARCHITECTURE.md. Non semplificare.
2. **I prompt degli agenti** devono essere esattamente come in `prompts/agent_prompts.py`. Non modificare.
3. **Error handling** robusto: la pipeline non deve MAI crashare. Fallimento parziale → report parziale.
4. **Type hints** ovunque. Python 3.12+ syntax (`str | None` non `Optional[str]`).
5. **Async** per le chiamate Claude in parallelo.
6. **Logging** strutturato (usa `structlog` o `logging` con JSON formatter).
7. **Config** via environment variables (`.env`), MAI hardcodare API keys.

## REQUIREMENTS.TXT
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
anthropic>=0.49.0
pydantic>=2.6.0
pydantic-settings>=2.1.0
python-multipart>=0.0.6
pdfplumber>=0.10.0
Pillow>=10.2.0
python-dotenv>=1.0.0
structlog>=24.1.0
httpx>=0.26.0
```

## .ENV.EXAMPLE
```
ANTHROPIC_API_KEY=sk-ant-...
DEFAULT_MODEL=claude-sonnet-4-5-20250929
EXTRACTION_MODEL=claude-haiku-4-5-20251001
LOG_LEVEL=INFO
MAX_FILE_SIZE_MB=20
MAX_FILES_PER_REQUEST=10
```

## ORDINE DI IMPLEMENTAZIONE
1. `requirements.txt` e `.env.example`
2. `app/config.py`
3. `app/models/` (tutti i Pydantic models)
4. `app/prompts/` (tutti i system prompts)
5. `app/agents/base.py`
6. `app/agents/document_ingestion.py`
7. `app/agents/tax_optimizer.py`
8. `app/agents/cost_benchmarker.py`
9. `app/agents/benefit_scout.py`
10. `app/agents/orchestrator.py`
11. `app/utils/pdf_extractor.py`
12. `app/utils/merge_profiles.py`
13. `cli.py`
14. `app/main.py` (FastAPI)
15. `tests/test_pipeline.py`
16. `README.md`

## DOPO LA BUILD
Esegui `python cli.py demo` per verificare che la pipeline funzioni end-to-end.
Mostra il report finale formattato.
