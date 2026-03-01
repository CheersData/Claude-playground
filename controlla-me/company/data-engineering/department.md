# Data Engineering

## Missione

Gestione pipeline dati legislativi: connessione a fonti, parsing, validazione e caricamento nel corpus.
Obiettivo: corpus completo e aggiornato delle leggi italiane ed europee.

## Agenti / Componenti

| Componente | Ruolo | File |
|-----------|-------|------|
| data-connector | Orchestratore pipeline | `lib/staff/data-connector/index.ts` |
| normattiva-connector | Fetch da Normattiva Open Data | `lib/staff/data-connector/connectors/normattiva.ts` |
| eurlex-connector | Fetch da EUR-Lex Cellar | `lib/staff/data-connector/connectors/eurlex.ts` |
| akn-parser | Parser Akoma Ntoso XML | `lib/staff/data-connector/parsers/akn-parser.ts` |
| html-parser | Parser EUR-Lex HTML | `lib/staff/data-connector/parsers/html-parser.ts` |
| article-validator | Validazione articoli | `lib/staff/data-connector/validators/article-validator.ts` |
| legal-corpus-store | Ingest su Supabase | `lib/staff/data-connector/stores/legal-corpus-store.ts` |

## Pipeline

```
CONNECT → MODEL → LOAD
  │         │        │
  │         │        └─ Upsert in legal_articles + embeddings
  │         └─ Parse XML/HTML → articoli strutturati
  └─ Fetch da Normattiva/EUR-Lex API
```

## Fonti (14)

Configurate in `scripts/corpus-sources.ts`. Include Codice Civile, Codice Penale, Codice del Consumo, GDPR, TUF, e altre.

## KPI

- Articoli nel corpus: > 5000
- Fonti attive: 13/14
- Zero sync fallite negli ultimi 7 giorni
- Delta update: entro 7 giorni dall'ultima sync

## CLI

```bash
npx tsx scripts/data-connector.ts status         # stato sync
npx tsx scripts/data-connector.ts connect <src>   # fetch
npx tsx scripts/data-connector.ts model <src>     # parse
npx tsx scripts/data-connector.ts load <src>      # ingest
npx tsx scripts/data-connector.ts update <src>    # full pipeline
```

## Runbooks

- `runbooks/add-new-source.md` — Aggiungere una nuova fonte legislativa
- `runbooks/delta-update.md` — Eseguire un aggiornamento incrementale
