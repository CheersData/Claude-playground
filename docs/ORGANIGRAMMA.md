# ORGANIGRAMMA.md — Architettura Agentica della Piattaforma

> Questo documento descrive l'organizzazione completa della piattaforma **controlla.me** come sistema multi-agente strutturato.
> La piattaforma madre ospita team di agenti AI specializzati, coordinati da Leader deterministici e monitorati da uno Staff trasversale.
>
> Per l'architettura tecnica: vedi **[ARCHITECTURE.md](ARCHITECTURE.md)**
> Per il censimento modelli: vedi **[MODEL-CENSUS.md](MODEL-CENSUS.md)**

---

## SEZ. 1 — Organigramma a 3 livelli

```
                              PIATTAFORMA MADRE
                        Platform Bus + Agent Registry
                        Model Tier Config (4 tier)
                                    |
               .--------------------+--------------------.
               |                    |                    |
          STAFF                AGENT LEADERS        SHARED SERVICES
       (osservano e            (coordinano            (infrastruttura)
        ingaggiano             i propri team
        i Leader)              autonomamente)
               |                    |                    |
      .--------+--------.          |           .---------+---------.
      |                  |         |           |    |    |    |    |
  SERVIZI           AGENTI LLM    |        AI SDK  Vec  Emb  Cache Auth
  (no LLM,          (ragionano)   |        Router  Sto  edd  Lay  /RLS
   pura logica)                   |               re   ings  er
      |                  |        |
  Cost Tracker     Cost Optim.    +---> Leader Analisi Legale (CODICE)
  Perf. Watch      QA Semantico   |         |
  Data Connector   Market Scout   |    .----+----+-----+-----+------.
  QA Validator     Growth Engine  |    |    |    |     |     |      |
                                  |   Cat. Ana. Inv. Cons. Trad.  Arch.
                                  |
                                  +---> [Leader Team 2...]
                                  +---> [Leader Team 3...]
```

### 3 principi fondamentali

1. **Lo Staff osserva e ingaggia i Leader, NON il contrario.** Il Leader non chiede aiuto allo Staff. Lo Staff monitora, rileva anomalie e invia raccomandazioni o ordini al Leader.

2. **Il Leader e CODICE (PipelineDecisionEngine), non LLM.** La decisione "quale pipeline eseguire" e deterministica: un decision tree basato su regole, non su inferenza. Zero costi LLM, zero latenza, zero allucinazioni.

3. **Staff diviso in SERVIZI (no LLM, pura logica) e AGENTI (LLM, serve ragionamento).** I servizi calcolano, aggregano, validano. Gli agenti LLM ragionano, analizzano pattern, generano contenuti. Costi LLM solo dove serve davvero.

---

## SEZ. 2 — Sistema modelli a 4 tier

### I 4 tier

| Tier | Per chi | Strategia |
|------|---------|-----------|
| **TOP** | Utenti Pro, task critici | Modelli migliori: Sonnet 4.5, Gemini Pro |
| **BUONO** | Default produzione | Bilanciamento costo/qualita: Gemini Flash, Haiku 4.5 |
| **BEST_FOR_FREE** | Utenti Free | Solo provider con free tier reale (Groq, Cerebras, Mistral free, Gemini free) |
| **INTERNAL_TEST** | Sviluppo locale | Proxy via `claude -p` (CLI). Usa la subscription Max, $0 costi API aggiuntivi |

### INTERNAL_TEST: come funziona

L'app Next.js, invece di chiamare l'API Anthropic direttamente, esegue `claude -p` come sottoprocesso sulla macchina locale. Il CLI usa la subscription Max gia pagata dall'utente.

- **Costo aggiuntivo**: $0
- **Limitazioni**: solo locale, non scalabile, non per produzione
- **Caso d'uso**: sviluppo, debug prompt, test pipeline completa senza bruciare crediti API

### Configurazione a 3 livelli (priorita: Agente > Dipartimento > Globale)

```
platform.tier = "buono"                          → default globale
teams.legal.tier = "top"                         → override team
agents.catalogatore.tier = "best_for_free"       → override agente
```

La risoluzione e a cascata: se l'agente ha un tier esplicito, vince. Altrimenti eredita dal team. Altrimenti dal default piattaforma.

### Assegnazione modelli — Team Legale

| Agente | TOP | BUONO | BEST_FOR_FREE | INTERNAL_TEST |
|--------|-----|-------|---------------|---------------|
| Catalogatore | Haiku 4.5 | Gemini Flash | Groq Llama 4 Scout (free) | Qualsiasi |
| Analista | Sonnet 4.5 | Gemini Pro | Mistral Small 3 (free 2RPM) | Qualsiasi |
| Investigatore | Sonnet 4.5 | Sonnet 4.5* | Sonnet 4.5* o SKIP | Qualsiasi |
| Consigliere | Sonnet 4.5 | Gemini Pro | Gemini Flash (free 250/g) | Qualsiasi |
| Traduttore Query | Gemini Flash | Groq Llama Scout | Cerebras 8B (free) | Qualsiasi |
| Archivista | Gemini Flash | Groq Llama Scout | Cerebras 8B (free) | Qualsiasi |

> \* **Investigatore vincolato a Claude** per `web_search` (tool nativo Anthropic). Per BEST_FOR_FREE: skippare lo step o usare web search API gratuita alternativa.

### Assegnazione modelli — Staff LLM

| Staff Agente | TOP | BUONO | BEST_FOR_FREE | INTERNAL_TEST |
|-------------|-----|-------|---------------|---------------|
| Cost Optimizer | Gemini Flash | Groq Scout | Cerebras 8B | Qualsiasi |
| QA Semantico | Haiku 4.5 | Gemini Flash | Groq 70B (free) | Qualsiasi |
| Market Scout | Sonnet 4.5* | Sonnet 4.5* | Sonnet 4.5* | Qualsiasi |
| Growth Engine | Sonnet 4.5 | Gemini Pro | Gemini Flash | Qualsiasi |

> \* **Market Scout vincolato a Claude** per `web_search`.

### Stime costo per pipeline

| Tier | Costo pipeline | Note |
|------|---------------|------|
| TOP | ~$0.25-0.75 | Tutti i modelli premium |
| BUONO | ~$0.12-0.45 | Mix economico/premium |
| BEST_FOR_FREE | ~$0.00-0.15 | $0 se Investigatore skippato |
| INTERNAL_TEST | $0 (subscription Max) | Proxy locale via `claude -p` |

---

## SEZ. 3 — Censimento completo (18 entita)

### Agent Leader (1, CODICE non LLM)

| ID | Nome | Tipo | Note |
|----|------|------|------|
| leader-legal | **Leader Analisi Legale** | PipelineDecisionEngine (codice) | Oggi: `orchestrator.ts`. Domani: classe strutturata con decision tree esplicito |

### Agenti Specializzati — Team Legale (6)

| ID | Nome | Ruolo | File |
|----|------|-------|------|
| catalogatore | **Catalogatore** | Classifica documenti: tipo, sotto-tipo, istituti giuridici, leggi rilevanti | `lib/agents/classifier.ts` |
| analista | **Analista Clausole** | Analisi rischi dal punto di vista della parte debole | `lib/agents/analyzer.ts` |
| investigatore | **Investigatore Legale** | Ricerca norme e sentenze tramite `web_search` Anthropic | `lib/agents/investigator.ts` |
| consigliere | **Consigliere** | Report finale in linguaggio semplice, scoring multidimensionale | `lib/agents/advisor.ts` |
| traduttore-query | **Traduttore Query** | Riformula domande colloquiali in linguaggio giuridico | `lib/agents/question-prep.ts` |
| archivista | **Archivista Corpus** | Risponde a domande sul corpus legislativo con citazioni verificabili | `lib/agents/corpus-agent.ts` |

### Staff — Servizi (4, no LLM, pura logica)

| ID | Nome | Ruolo | Schedule |
|----|------|-------|----------|
| cost-tracker | **Cost Tracker** | Aggregazione costi per provider/agente, proiezioni mensili, alert soglia | Giornaliero 07:00 |
| performance-watch | **Performance Watch** | Metriche latenza/errori, health check provider, calcolo baseline | Real-time + giornaliero 07:00 |
| data-connector | **Data Connector** | Health check connessioni (DB, API), data loading corpus, validazione dati | Giornaliero 06:00 + settimanale dom 03:00 |
| qa-validator | **QA Validator** | Validazione strutturale JSON, controllo schema, limiti, regole deterministiche | Ogni output pipeline |

### Staff — Agenti LLM (4)

| ID | Nome | Ruolo | Schedule |
|----|------|-------|----------|
| cost-optimizer | **Cost Optimizer** | Ragionamento su model-swap, benchmark costo/qualita, raccomandazioni | Su trigger da Cost Tracker |
| qa-semantico | **QA Semantico** | Coerenza tono, plausibilita citazioni, cross-validazione tra fasi pipeline | Report giornaliero 23:00 |
| market-scout | **Market Scout** | Scan mercato AI, competitor, nuovi modelli, benchmark A/B | Settimanale lun 09:00 |
| growth-engine | **Growth Engine** | Analisi cohort utenti, campagne, email nurturing, generazione copy | Giornaliero 08:00 + settimanale lun 10:00 |

---

## SEZ. 4 — Relazione Staff <-> Leader

### Principio chiave

Il Leader lavora **AUTONOMAMENTE**. Riceve un documento, decide la pipeline, la esegue. Lo Staff **osserva e interviene dall'esterno** — non e parte della pipeline, ma la monitora e puo influenzarla.

Il flusso e sempre: **Staff rileva → Staff analizza → Staff comunica al Leader → Leader applica**.

### Matrice situazioni

| Situazione | Chi rileva | Chi ingaggia | Azione |
|-----------|-----------|-------------|--------|
| Costi agente sopra soglia | Cost Tracker (servizio) | → Cost Optimizer (LLM) → Leader | "Passa Catalogatore da TOP a BUONO" |
| Output JSON invalido | QA Validator (servizio) | → Leader | "Riprova con temperatura +0.1" |
| Citazione legale inventata | QA Semantico (LLM) | → Leader | "Investigatore ha citato Art. inesistente, invalidare" |
| Provider degradato | Performance Watch (servizio) | → Leader + Cost Tracker | "Gemini Flash 3x piu lento, valutare switch" |
| Connessione DB down | Data Connector (servizio) | → Leader + Performance Watch | "Vector DB offline, pipeline senza RAG" |
| Nuovo modello economico | Market Scout (LLM) | → Cost Optimizer → Leader | "Groq Llama 4: -80% costi su Catalogatore" |
| Utente Free a 2/3 analisi | Growth Engine (LLM) | → (azione diretta) | Prepara email nurturing per upsell Pro |

### Nota: azione diretta

Il Growth Engine e l'unico agente Staff che puo agire direttamente sull'utente (email, notifiche) senza passare dal Leader, perche opera sul marketing, non sulla pipeline di analisi.

---

## SEZ. 5 — Tool per ogni agente

### Leader Analisi Legale

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `plan_pipeline` | Decide quali step eseguire in base al tipo documento e rischio | Parziale | Logica in `lib/agents/orchestrator.ts` |
| `invoke_agent` | Invoca un agente specifico con input e config | Parziale | Chiamate dirette in `orchestrator.ts` |
| `skip_step` | Salta uno step della pipeline (es. investigator per rischio basso) | No | Da implementare |
| `set_agent_tier` | Cambia tier/modello di un agente a runtime | No | Da implementare |
| `read_session_cache` | Legge cache sessione per riprendere pipeline interrotte | Si | `lib/analysis-cache.ts` |

### Catalogatore

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Genera classificazione tramite LLM | Si | `lib/ai-sdk/generate.ts` + `lib/ai-sdk/agent-runner.ts` |
| `search_similar_documents` | Cerca documenti simili nel vector DB | Si | `lib/vector-store.ts` → `searchDocumentChunks()` |
| `lookup_legal_articles` | Lookup diretto articoli per riferimento normativo | Si | `lib/legal-corpus.ts` → `lookupArticles()` |

### Analista Clausole

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Genera analisi rischi tramite LLM | Si | `lib/ai-sdk/generate.ts` + `lib/ai-sdk/agent-runner.ts` |
| `search_corpus` | Ricerca semantica nel corpus legislativo | Si | `lib/legal-corpus.ts` → `searchArticles()` |
| `search_knowledge` | Ricerca nella knowledge base collettiva | Si | `lib/vector-store.ts` → `searchLegalKnowledge()` |
| `retrieve_legal_context` | Recupera contesto normativo completo per clausole | Si | `lib/vector-store.ts` → `buildRAGContext()` |

### Investigatore Legale

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Genera indagine legale tramite LLM | Si | `lib/ai-sdk/generate.ts` + `lib/ai-sdk/agent-runner.ts` |
| `web_search` | Ricerca web norme e sentenze (tool nativo Anthropic) | Si | Tool `web_search` via Anthropic SDK |
| `search_corpus` | Ricerca articoli nel corpus legislativo | Si | `lib/legal-corpus.ts` → `searchArticles()` |
| `search_knowledge` | Ricerca nella knowledge base | Si | `lib/vector-store.ts` → `searchLegalKnowledge()` |
| `build_rag_context` | Costruisce contesto RAG completo per l'indagine | Si | `lib/vector-store.ts` → `buildRAGContext()` |

### Consigliere

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Genera consiglio finale tramite LLM | Si | `lib/ai-sdk/generate.ts` + `lib/ai-sdk/agent-runner.ts` |
| `build_rag_context` | Costruisce contesto RAG per calibrare scoring | Si | `lib/vector-store.ts` → `buildRAGContext()` |
| `enforce_limits` | Tronca output a max 3 rischi e max 3 azioni | Si | Logica in `lib/agents/advisor.ts` |

### Traduttore Query

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Riformula query colloquiale in linguaggio giuridico | Si | `lib/ai-sdk/generate.ts` + `lib/ai-sdk/agent-runner.ts` |
| `legal_synonyms_lookup` | Dizionario sinonimi giuridici per arricchire la query | No | Da implementare |

### Archivista Corpus

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Genera risposta Q&A tramite LLM | Si | `lib/ai-sdk/generate.ts` + `lib/ai-sdk/agent-runner.ts` |
| `search_articles` | Ricerca semantica articoli nel corpus | Si | `lib/legal-corpus.ts` → `searchArticles()` |
| `search_knowledge` | Ricerca nella knowledge base | Si | `lib/vector-store.ts` → `searchLegalKnowledge()` |
| `get_article_by_id` | Recupera articolo specifico per ID | Si | `lib/legal-corpus.ts` → `getArticleById()` |
| `get_source_hierarchy` | Albero navigabile delle fonti legislative | Si | API route `/api/corpus/hierarchy` |

### Cost Tracker (Servizio, no LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `read_model_costs` | Legge costi per modello da `lib/models.ts` | Parziale | Dati in `lib/models.ts`, nessun aggregatore |
| `aggregate_usage` | Aggrega token consumati per periodo/agente/provider | No | Da implementare |
| `read_plans_config` | Legge configurazione piani (Free/Pro/Single) | Si | `lib/stripe.ts` |
| `project_costs` | Proietta costi futuri basati su trend | No | Da implementare |
| `emit_alert` | Emette alert quando costi superano soglia | No | Da implementare |

### Cost Optimizer (Agente LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Ragiona su ottimizzazioni costo/qualita | No | Da implementare |
| `read_cost_report` | Legge report del Cost Tracker | No | Da implementare |
| `run_benchmark` | Esegue benchmark A/B tra modelli | No | Da implementare |
| `engage_leader` | Invia raccomandazione al Leader | No | Da implementare |

### Performance Watch (Servizio, no LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `listen_events` | Ascolta eventi pipeline in tempo reale | Parziale | Log in `lib/anthropic.ts`, non strutturati |
| `compute_percentiles` | Calcola percentili latenza (p50, p95, p99) | No | Da implementare |
| `check_health` | Verifica salute provider API | No | Da implementare |
| `persist_metrics` | Salva metriche su database | No | Da implementare |
| `emit_alert` | Emette alert su degrado performance | No | Da implementare |

### Data Connector (Servizio, no LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `check_connections` | Verifica connessioni a Supabase, API provider, Stripe | No | Da implementare |
| `run_loader` | Esegue caricamento dati (corpus, knowledge) | Si | `lib/legal-corpus.ts` → `ingestArticles()` |
| `validate_data` | Valida integrita dati caricati | No | Da implementare |
| `corpus_stats` | Statistiche corpus (articoli, fonti, copertura) | Si | API route `/api/corpus` GET |
| `extract_text` | Estrae testo da PDF/DOCX/TXT | Si | `lib/extract-text.ts` |
| `generate_embeddings` | Genera embeddings tramite Voyage AI | Si | `lib/embeddings.ts` |
| `index_document` | Indicizza documento nel vector DB | Si | `lib/vector-store.ts` → `indexDocument()` |

### QA Validator (Servizio, no LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `validate_schema` | Valida output JSON contro schema atteso | Parziale | Parsing robusto in `lib/anthropic.ts` |
| `check_limits` | Verifica max 3 rischi, max 3 azioni | Si | Logica in `lib/agents/advisor.ts` |
| `check_score_range` | Verifica fairnessScore in range 1-10 | Parziale | Validazione implicita |
| `verify_citations` | Verifica che articoli citati esistano nel corpus | No | Da implementare |

### QA Semantico (Agente LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `llm_generate` | Ragiona su coerenza e qualita output | No | Da implementare |
| `check_coherence` | Verifica coerenza tra fasi pipeline | No | Da implementare |
| `check_tone` | Verifica tono "linguaggio da bar" nel Consigliere | No | Da implementare |
| `cross_validate` | Cross-valida rischi Analista vs indagine Investigatore | No | Da implementare |
| `engage_leader` | Segnala problemi di qualita al Leader | No | Da implementare |
| `quality_history` | Storico qualita per trend analysis | No | Da implementare |

### Market Scout (Agente LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `web_search` | Ricerca web nuovi modelli, competitor, pricing | No | Da implementare (web_search Anthropic) |
| `read_model_catalog` | Legge catalogo modelli corrente | Si | `lib/models.ts` |
| `run_benchmark` | Benchmark A/B tra modelli su task campione | No | Da implementare |
| `engage_cost_optimizer` | Segnala opportunita al Cost Optimizer | No | Da implementare |

### Growth Engine (Agente LLM)

| Tool | Descrizione | Esiste | Riferimento |
|------|-------------|--------|-------------|
| `query_cohorts` | Analisi cohort utenti (Free, Pro, churn) | No | Da implementare |
| `generate_copy` | Genera copy marketing | No | Da implementare |
| `generate_email` | Genera email nurturing personalizzate | No | Da implementare |
| `send_email` | Invia email tramite provider (Resend, SendGrid) | No | Da implementare |

---

## SEZ. 6 — Agenti autonomi e schedule

### Giornalieri

| Entita | Tipo | Ora | Attivita |
|--------|------|-----|----------|
| Data Connector | Servizio | 06:00 | Health check connessioni, corpus integrity, validazione embedding |
| Cost Tracker | Servizio | 07:00 | Report costi giorno precedente, confronto con budget |
| Performance Watch | Servizio | 07:00 | Aggregazione metriche latenza/errori, ricalcolo baseline |
| Growth Engine | LLM | 08:00 | Cohort analysis, draft email nurturing per utenti a rischio churn |
| QA Semantico | LLM | 23:00 | Review qualita giornaliera, identificazione pattern errori ricorrenti |

### Settimanali

| Entita | Tipo | Quando | Attivita |
|--------|------|--------|----------|
| Market Scout | LLM | Lun 09:00 | Scan mercato AI, nuovi modelli, competitor, benchmark A/B |
| Growth Engine | LLM | Lun 10:00 | Report engagement settimanale, content suggestions, A/B copy |
| Cost Tracker | Servizio | Ven 18:00 | Report costi settimanale, proiezione mensile, alert trend |
| Data Connector | Servizio | Dom 03:00 | Corpus refresh, embedding re-validazione, pulizia dati orfani |

### Real-time

| Entita | Tipo | Trigger | Attivita |
|--------|------|---------|----------|
| Performance Watch | Servizio | Ogni chiamata API | Log latenza, token, errori |
| QA Validator | Servizio | Ogni output pipeline | Validazione strutturale JSON, schema, limiti |

### Note implementative

- **Infrastruttura**: Vercel Cron (max 300s su Piano Pro) oppure Supabase `pg_cron` per job SQL.
- **Route API**: `/api/platform/cron/{agent-id}` — ogni agente/servizio schedulato espone una route dedicata.
- **Autenticazione cron**: header `Authorization: Bearer CRON_SECRET` per evitare invocazioni non autorizzate.
- **Logging**: ogni esecuzione schedulata scrive su tabella `platform_logs` con timestamp, durata, esito, eventuali errori.

---

## SEZ. 7 — Protocollo Leader, Governance e Scalabilita

### Leader come PipelineDecisionEngine

Il Leader e **CODICE**, non LLM. E un decision tree deterministico che decide quale pipeline eseguire in base all'output del Catalogatore.

```
input: ClassificationResult
  |
  +→ rischio_alto AND tipo_contratto IN [lavoro, locazione, mutuo]?
  |    → pipeline_completa (4 agenti + RAG + web_search)
  |
  +→ rischio_medio?
  |    → pipeline_standard (skip web_search investigatore)
  |
  +→ rischio_basso?
  |    → pipeline_light (classificatore + consigliere, skip analista/investigatore)
  |
  +→ tipo = corpus_query?
       → pipeline_corpus (traduttore + archivista)
```

**Oggi**: la logica e incorporata in `lib/agents/orchestrator.ts` come sequenza lineare.
**Domani**: classe `PipelineDecisionEngine` con decision tree esplicito, configurabile, testabile.

### Matrice decisionale

| Decisione | Chi decide | Chi approva |
|-----------|-----------|-------------|
| Quale pipeline eseguire | Leader (codice) | Nessuno (automatico) |
| Cambiare modello a un agente | Cost Optimizer (LLM) | Leader (applica) |
| Skippare uno step | Leader (codice) | Nessuno (regole deterministiche) |
| Retry su errore | Leader (codice) | QA Validator (valida output) |
| Aggiungere agente al team | Sviluppatore umano | — |
| Cambiare tier globale | Sviluppatore umano | — |
| Rimuovere/deprecare un agente | Sviluppatore umano | — |

### 5 livelli di escalation

| Livello | Chi gestisce | Esempio | Tempo risposta |
|---------|-------------|---------|----------------|
| 1. Auto-recovery | Agente stesso | Retry su timeout, parse fallback | Millisecondi |
| 2. Leader | Leader del team | Cambio modello, skip step, retry con parametri diversi | Secondi |
| 3. Staff | Staff competente | Cost Optimizer raccomanda swap modello | Minuti |
| 4. Cross-leader | Piu Leader + Staff | Degrado provider che colpisce piu team contemporaneamente | Minuti-ore |
| 5. Umano | Sviluppatore | Bug critico, decisione architetturale, nuovo provider | Ore-giorni |

### Protocollo bootstrap nuovo team

Per aggiungere un nuovo team di agenti alla piattaforma, seguire queste 4 fasi:

**Fase 1 — Definizione**
- Nome del team e dominio (es. "Team Fiscale", "Team HR")
- ID leader e tipo (`PipelineDecisionEngine`)
- Lista agenti con ruoli, prompt, modelli per tier
- Pipeline(s) con step e decision tree

**Fase 2 — Registrazione**
- Aggiunta al Agent Registry della piattaforma
- Assegnazione modelli per ciascun tier (TOP, BUONO, BEST_FOR_FREE, INTERNAL_TEST)
- Configurazione fallback chain per ogni agente
- Definizione limiti: max_tokens, max_retries, timeout per agente

**Fase 3 — Integrazione**
- Collegamento ai Shared Services: vector store (nuove collection), auth (RLS policies), cache layer
- Registrazione presso lo Staff: Cost Tracker monitora i costi, Performance Watch le metriche
- Setup QA: schema JSON per QA Validator, criteri per QA Semantico

**Fase 4 — Attivazione**
- Route API: `/api/{team-name}/...`
- Componenti UI (se frontend-facing)
- Monitoring attivo da Staff
- Test end-to-end della pipeline completa

### Cross-stack

**TypeScript only.** Tutta la piattaforma usa un unico linguaggio e runtime (Node.js/Next.js) per massimizzare la condivisione di codice tra team.

Progetti satellite attualmente in altri linguaggi (es. `salva-me` in Python) verranno migrati a Next.js per condividere gli Shared Services: AI SDK, vector store, embeddings, auth, cache.

Nessun servizio cross-linguaggio. Nessun gRPC, nessun microservizio poliglotta. Un solo runtime, un solo deploy, un solo monorepo.

---

## SEZ. 8 — Roadmap: verso il monorepo

### Stato attuale

L'infrastruttura AI riusabile (`ai-sdk/`, `models.ts`, `embeddings.ts`, `vector-store.ts`) vive dentro `controlla-me/lib/`. Funziona, ma non e condivisibile con altri prodotti senza duplicazione.

### Architettura target

```
Claude-playground/                          # Monorepo con workspace
├── packages/
│   ├── ai-sdk/                             # generate(), runAgent(), openai-compat
│   ├── models/                             # Registry 22 modelli, tier config
│   ├── embeddings/                         # Client Voyage AI
│   └── vector-store/                       # Funzioni base: chunk, embed, search
├── apps/
│   ├── controlla-me/                       # Agenti legali + prompt legali
│   └── salva-me/                           # Agenti finanziari + prompt finanziari
├── shared/
│   ├── design/                             # Lightlife design system
│   ├── qa/                                 # QA framework
│   └── commands/                           # Comandi Claude Code
└── turbo.json                              # Turborepo config
```

### Cosa va in packages/ (condiviso)

| Package | Cosa contiene | Perche condivisibile |
|---------|--------------|---------------------|
| `ai-sdk` | `generate()`, `runAgent()`, `openai-compat.ts` | Infrastruttura pura, zero logica di dominio |
| `models` | Registry modelli, tier config, costi | Catalogo modelli uguale per tutti i team |
| `embeddings` | Client Voyage AI | Generico, non legato a un dominio |
| `vector-store` | Funzioni base chunk/search | Le tabelle DB sono per-prodotto, le funzioni no |

### Cosa resta per-prodotto (non condiviso)

| Elemento | Perche |
|----------|--------|
| `agents/*.ts` | Prompt, parsing, tool specifici del dominio |
| `prompts/*.ts` | 100% dominio (legale, finanziario, ecc.) |
| Tabelle Supabase | Schema diverso per prodotto |
| Componenti UI | Design diverso per prodotto |

### Prerequisiti tecnici

1. **pnpm workspaces** o **Turborepo** per gestire dipendenze cross-package
2. **tsconfig paths** condiviso per risolvere import da `@platform/ai-sdk`
3. **Next.js `transpilePackages`** per compilare i moduli locali
4. **Shared `package.json`** con versioni dipendenze allineate

### Quando farlo

Al bootstrap del secondo prodotto (`salva-me` in Next.js). Non prima: il refactor monorepo ha senso solo quando c'e un consumatore reale del codice condiviso. Fino ad allora, `controlla-me/lib/ai-sdk/` resta dov'e — ben isolato e pronto per essere estratto.
