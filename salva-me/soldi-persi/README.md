# Soldi Persi

Sistema multi-agente di analisi finanziaria per contribuenti italiani. Identifica detrazioni fiscali non sfruttate, costi eccessivi su utenze/polizze e bonus governativi non richiesti.

## Quick Start

```bash
# 1. Setup
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

pip install -r requirements.txt

# 2. Configura
cp .env.example .env
# Inserisci la tua ANTHROPIC_API_KEY nel file .env

# 3. Demo
python cli.py demo

# 4. Analisi documenti reali
python cli.py analyze ./documenti/cu_2024.pdf ./documenti/bolletta.pdf

# 5. API Server
uvicorn app.main:app --reload
```

## Architettura

Il sistema usa 4 agenti AI specializzati:

| Agente | Ruolo | Modello |
|--------|-------|---------|
| Document Ingestion | Estrae dati da PDF/immagini | Claude Haiku 4.5 |
| Tax Optimizer | Identifica opportunità fiscali | Claude Sonnet 4.5 |
| Cost Benchmarker | Confronta costi con mercato | Claude Sonnet 4.5 |
| Benefit Scout | Trova bonus/agevolazioni | Claude Sonnet 4.5 |

Un **Orchestrator** coordina gli agenti in parallelo e genera il report finale.

## API Endpoints

- `POST /api/analyze` — Upload documenti e ottieni report completo
- `POST /api/extract` — Solo estrazione dati da documenti
- `GET /api/report/{id}` — Recupera un report generato
- `GET /api/health` — Health check

## Test

```bash
pip install pytest pytest-asyncio
pytest tests/ -v
```

## Struttura

```
soldi-persi/
├── app/
│   ├── main.py              # FastAPI server
│   ├── config.py            # Configurazione
│   ├── models/              # Pydantic schemas
│   ├── agents/              # Agenti AI
│   ├── prompts/             # System prompts
│   ├── knowledge/           # Dati benchmark e catalogo bonus
│   └── utils/               # Utilities (PDF, merge)
├── tests/                   # Test suite
├── cli.py                   # CLI per testing
├── requirements.txt
└── .env.example
```
