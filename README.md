# Claude-playground — Piattaforma Madre

Piattaforma multi-prodotto con team di agenti AI specializzati, servizi condivisi e infrastruttura comune.

## Prodotti

| Prodotto | Stack | Stato |
|----------|-------|-------|
| [controlla-me](controlla-me/) | Next.js + 4 agenti AI + RAG | Attivo |
| [salva-me](salva-me/) | Python (bozza) | In progettazione |

## Struttura

```
Claude-playground/
├── docs/
│   └── ORGANIGRAMMA.md        # Architettura agentica completa
├── controlla-me/               # Analisi legale AI (prodotto attivo)
├── salva-me/                   # Secondo prodotto (bozza)
├── shared/
│   ├── design/                 # Lightlife design system (Tailwind preset)
│   ├── qa/                     # QA framework e template config
│   └── commands/               # Comandi Claude Code condivisi
└── sandbox/
    ├── quiz-martina/           # Quiz interattivo
    ├── hello-world/            # Hello world in 10 linguaggi
    └── misc/                   # File vari
```

## Architettura agentica

La piattaforma adotta un'architettura a 3 livelli:

- **Staff** — servizi di monitoraggio (costi, performance, QA) e agenti LLM trasversali
- **Agent Leaders** — coordinatori deterministici (codice, non LLM) per ogni team
- **Shared Services** — AI SDK, vector store, embeddings, cache, auth

Ogni prodotto ha un team di agenti specializzati coordinato da un Leader.
I modelli sono assegnati tramite un sistema a 4 tier (TOP, BUONO, BEST_FOR_FREE, INTERNAL_TEST).

Dettagli completi: **[docs/ORGANIGRAMMA.md](docs/ORGANIGRAMMA.md)**

## Servizi condivisi

| Servizio | Path | Descrizione |
|----------|------|-------------|
| Design System | `shared/design/` | Lightlife — preset Tailwind condiviso |
| QA Framework | `shared/qa/` | Template config per validazione qualita |
| Comandi | `shared/commands/` | Comandi Claude Code riusabili |

## Quick start

```bash
# Avvia controlla-me
cd controlla-me
npm install
cp .env.local.example .env.local  # compila le variabili
npm run dev
```
