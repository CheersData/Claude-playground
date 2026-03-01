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

---

## ⚠️ REGOLA ASSOLUTA — Acquisizione dati: ordine di priorità

**Il web scraping è l'ultima risorsa. Non si esegue senza approvazione esplicita del boss.**

Quando una fonte non è disponibile tramite i connettori esistenti, seguire questo ordine:

### 1. API ufficiali (prima scelta)
- Cercare API REST/SPARQL pubbliche della fonte (es. Normattiva Open Data, EUR-Lex Cellar)
- Verificare documentazione ufficiale del sito/ente
- Cercare endpoint non documentati ma pubblici (es. `/api/`, `/data/`, `/opendata/`)

### 2. Repository e progetti open source (seconda scelta)
- Cercare su GitHub: `"nome-legge" corpus legislativo` oppure `normattiva parser`
- Cercare dataset già strutturati su HuggingFace, Zenodo, data.gov.it, dati.gov.it
- Cercare progetti esistenti che hanno già risolto lo stesso problema (es. parser AKN, downloader leggi)
- Cercare issues/PR nei progetti esistenti che documentano workaround noti

### 3. Fonti alternative ufficiali (terza scelta)
- La stessa legge potrebbe essere disponibile da un'altra fonte ufficiale
  - Es: legge IT bloccata su Normattiva → cercare su EUR-Lex, GU Italiana, OpenData MIMIT, INPS, INAIL
- Verificare se esiste un mirror o dataset ufficiale alternativo

### 4. Scraping (ultima risorsa — richiede approvazione)
- **Solo se le opzioni 1-3 sono esaurite e documentate**
- **Prima di procedere: aprire task CME con findings delle ricerche fatte e chiedere approvazione**
- Lo scraping introduce: dipendenza da struttura HTML fragile, rischio bot-blocking, possibili violazioni ToS
- Il boss valuta caso per caso se il dato vale il rischio tecnico e legale

### Come documentare la ricerca prima di chiedere approvazione scraping

Nel task di approvazione includere:
- Cosa hai cercato e dove (URL, query GitHub, dataset cercati)
- Perché le opzioni 1-3 non sono praticabili
- Proposta tecnica di scraping con stima fragilità e manutenzione
