# Controlla.me — Architettura, Fragilità e Roadmap

> **Ultimo aggiornamento**: 2026-03-08 — Sync con CLAUDE.md: Statuto Lavoratori completato (41 art.), security findings M1-M9/H1-H2 dettagliati, CSP unsafe-eval gated NODE_ENV, WCAG 2.1 AA, Telegram alerting, CME daemon, Legal Office workspace.
>
> Controlla.me è il **primo prototipo** di una piattaforma madre per molteplici team
> di agenti AI. Ogni servizio è progettato per essere **scalabile e parametrizzabile**,
> riutilizzabile in futuri progetti con pipeline di agenti diverse.

---

## Indice

1. [Architettura Corrente](#1-architettura-corrente)
2. [Mappa delle Fragilità](#2-mappa-delle-fragilità)
3. [Piano di Hardening Sicurezza](#3-piano-di-hardening-sicurezza)
4. [Parametrizzazione e Feature Flags](#4-parametrizzazione-e-feature-flags)
5. [Agent Registry — Sistema Modulare](#5-agent-registry--sistema-modulare)
6. [Connect Agent — Design Completo](#6-connect-agent--design-completo)
7. [Roadmap di Implementazione](#7-roadmap-di-implementazione)

---

## 1. Architettura Corrente

### 1.1 Stack Tecnologico

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND                            │
│   Next.js 16 + React 19 + Tailwind CSS 4               │
│   Framer Motion (animazioni)                            │
│   SSE (Server-Sent Events per progress real-time)       │
└─────────────┬───────────────────────────┬───────────────┘
              │ API Routes                │ Auth
              ▼                           ▼
┌─────────────────────────┐  ┌────────────────────────────┐
│     NEXT.JS BACKEND     │  │      SUPABASE AUTH          │
│  /api/analyze (SSE)     │  │  Email + OAuth              │
│  /api/deep-search       │  │  JWT tokens                 │
│  /api/upload            │  │  Cookie-based sessions      │
│  /api/corpus            │  └────────────────────────────┘
│  /api/corpus/hierarchy  │
│  /api/corpus/article    │
│  /api/corpus/ask        │
│  /api/session/[id]      │
│  /api/stripe/*          │
│  /api/webhook           │
│  /api/user/usage        │
│  /api/auth/callback     │
│  /api/vector-search     │
└─────────┬───────────────┘
          │
          ▼
┌───────────────────────────────────────────────────────────┐
│              MIDDLEWARE LAYER (lib/middleware/)             │
│                                                           │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐ │
│  │ auth.ts      │ │ rate-limit.ts│ │ sanitize.ts       │ │
│  │ requireAuth()│ │ checkRate()  │ │ sanitizeDocument() │ │
│  │ requireAdmin│ │ IP + userId  │ │ sanitizeQuestion() │ │
│  │ isAuthError()│ │ sliding win  │ │ sanitizeSessionId()│ │
│  └──────────────┘ └──────────────┘ └───────────────────┘ │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   AGENT PIPELINE                        │
│                                                         │
│  ┌───────────┐   ┌──────────┐   ┌──────────────────┐   │
│  │ Classifier│──▶│   RAG    │──▶│     Analyzer     │   │
│  │  (Haiku)  │   │ Retrieval│   │    (Sonnet)      │   │
│  └───────────┘   └──────────┘   └────────┬─────────┘   │
│                                          │              │
│  ┌──────────────────┐   ┌────────────────▼──────────┐   │
│  │     Advisor      │◀──│    Investigator           │   │
│  │    (Sonnet)      │   │  (Sonnet + Web Search)    │   │
│  └──────────────────┘   └───────────────────────────┘   │
│                                                         │
│  Orchestrator: pipeline sequenziale con cache su FS     │
└─────────┬──────────────┬────────────────────────────────┘
          │              │
          ▼              ▼
┌─────────────────┐ ┌────────────────────────────────────┐
│   ANTHROPIC     │ │          SUPABASE DB               │
│   Claude API    │ │                                    │
│   - Sonnet 4.5  │ │  PostgreSQL + pgvector             │
│   - Haiku 4.5   │ │  ┌──────────────────────────────┐  │
└─────────────────┘ │  │ profiles                     │  │
                    │  │ analyses (JSONB)             │  │
┌─────────────────┐ │  │ deep_searches                │  │
│   GOOGLE AI     │ │  │ lawyer_referrals             │  │
│   Gemini API    │ │  │ document_chunks (vector)     │  │
│   - Flash 2.5   │ │  │ legal_knowledge (vector)     │  │
│   - Pro 2.5     │ │  │ legal_articles (vector)      │  │
└─────────────────┘ │  └──────────────────────────────┘  │
                    │  RLS attivo su tutte le tabelle     │
┌─────────────────┐ └────────────────────────────────────┘
│ lib/ai-sdk/     │
│ (infra riusab.) │ ┌─────────────────┐
│                 │ │     STRIPE      │
│ openai-compat:  │ │  Subscriptions  │
│  • OpenAI       │ │  One-time pay   │
│  • Mistral      │ │  Webhooks       │
│  • Groq (LPU)   │ └─────────────────┘
│  • Cerebras     │
│  • DeepSeek ⚠️  │
│                 │
│ generate.ts     │
│ agent-runner.ts │
│ models.ts →     │
│  AGENT_MODELS   │
└─────────────────┘

┌─────────────────┐
│   VOYAGE AI     │
│   Embeddings    │
│   voyage-law-2  │
│   1024 dims     │
└─────────────────┘
```

### 1.2 Flusso di Analisi Completo

```
Utente carica documento (PDF/DOCX/TXT)
        │
        ▼
[POST /api/analyze] ─── SSE Stream ───▶ Frontend (progress bar)
        │
        ├── 0. Auth check + Rate limit + Sanitize input
        │
        ├── 1. Extract text (pdf-parse / mammoth)
        │
        ├── 2. CLASSIFIER (Haiku, ~12s)
        │       Identifica: tipo, sotto-tipo, parti, leggi, istituti
        │
        ├── 3. RAG RETRIEVAL (Supabase pgvector + Voyage AI)
        │       ├── Lookup diretto per fonte legislativa
        │       ├── Ricerca per istituto giuridico
        │       └── Ricerca semantica per clausole
        │
        ├── 4. ANALYZER (Sonnet, ~25s)
        │       Analizza clausole, rischi, elementi mancanti
        │       Riceve contesto normativo dal RAG
        │
        ├── 5. INVESTIGATOR (Sonnet + Web Search, ~22s)
        │       Loop agentico fino a 8 iterazioni
        │       Cerca norme e sentenze per clausole critical/high
        │
        ├── 6. ADVISOR (Sonnet, ~18s)
        │       Report finale: scoring, rischi, azioni, deadline
        │
        ├── 7. AUTO-INDEX (background, fire-and-forget)
        │       Indicizza analisi nella knowledge base collettiva
        │
        └── 8. Increment usage counter
```

### 1.3 Schema Database

```
┌──────────────────┐      ┌──────────────────────┐
│    auth.users     │      │     profiles          │
│  (Supabase Auth)  │◀────▶│  id (FK auth.users)   │
│                   │      │  email                │
│                   │      │  plan: free|pro       │
│                   │      │  analyses_count       │
│                   │      │  stripe_customer_id   │
└──────────────────┘      └──────────┬───────────┘
                                     │ 1:N
                                     ▼
                          ┌──────────────────────┐
                          │     analyses          │
                          │  id (PK)              │
                          │  user_id (FK)         │
                          │  file_name            │
                          │  status               │
                          │  classification (JSON) │
                          │  analysis (JSON)      │
                          │  investigation (JSON) │
                          │  advice (JSON)        │
                          │  fairness_score       │
                          └──────┬───────┬────────┘
                                 │       │
                    ┌────────────┘       └────────────┐
                    ▼                                  ▼
          ┌──────────────────┐              ┌──────────────────┐
          │  deep_searches   │              │ lawyer_referrals  │
          │  analysis_id(FK) │              │  analysis_id(FK)  │
          │  user_question   │              │  user_id (FK)     │
          │  agent_response  │              │  specialization   │
          └──────────────────┘              └──────────────────┘

┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐
│   document_chunks    │  │   legal_knowledge    │  │  legal_articles   │
│  analysis_id (FK)    │  │  category            │  │  law_source       │
│  chunk_index         │  │  title               │  │  article_reference│
│  content             │  │  content             │  │  article_text     │
│  metadata (JSON)     │  │  metadata (JSON)     │  │  keywords[]       │
│  embedding (1024d)   │  │  embedding (1024d)   │  │  related_inst[]   │
│  ────────────────    │  │  times_seen          │  │  embedding (1024d)│
│  HNSW index          │  │  ────────────────    │  │  ────────────────│
│  RLS: solo owner     │  │  HNSW index          │  │  HNSW index      │
└──────────────────────┘  │  RLS: lettura pubbl. │  │  RLS: lettura pub│
                          └──────────────────────┘  └──────────────────┘
```

### 1.4 Corpus Legislativo — Stato Operativo

Il corpus legislativo è **caricato e operativo** su Supabase pgvector, alimentato dal **Data Connector** (pipeline CONNECT→MODEL→LOAD):

| Statistica | Valore |
|-----------|--------|
| Articoli totali | ~5.600 |
| Fonti legislative | 13 caricate (14 definite) |
| Articoli con embeddings | ~5.600 (100%) |
| Modello embedding | Voyage AI voyage-law-2 (1024 dims) |
| Sorgente dati IT | Normattiva Open Data API (AKN XML) |
| Sorgente dati EU | EUR-Lex Cellar REST (HTML) |

**Fonti IT caricate** (Normattiva — 8/8):

| Fonte | Articoli | Formato |
|-------|:--------:|---------|
| Codice Civile (R.D. 262/1942) | ~3.150 | HuggingFace (legacy) |
| Codice di Procedura Civile (R.D. 1443/1940) | 887 | AKN attachment |
| Codice Penale (R.D. 1398/1930) | 767 | AKN attachment |
| Codice del Consumo (D.Lgs. 206/2005) | 240 | AKN standard |
| TU Edilizia (DPR 380/2001) | 151 | AKN standard |
| D.Lgs. 231/2001 (Resp. amm. enti) | 109 | AKN standard |
| D.Lgs. 122/2005 (Tutela acquirenti) | 19 | AKN standard |
| Statuto Lavoratori (L. 300/1970) | 41 | ✅ Completato (seed-statuto-lavoratori.ts) |

**Fonti EU caricate** (EUR-Lex — 6/6):
GDPR (99), DSA (93), Dir. 2011/83 (35), Roma I (29), Dir. 2019/771 (28), Dir. 93/13 (11)

**Data Connector** (`lib/staff/data-connector/`):
- Pipeline a 3 fasi: CONNECT (censimento API) → MODEL (verifica schema DB) → LOAD (trasforma + embed + upsert)
- CLI: `npx tsx scripts/data-connector.ts [connect|model|load|status|update] <source_id>`
- Connettori: NormattivaConnector (collection download + AKN parsing), EurLexConnector (Cellar REST + HTML parsing)
- Formati AKN: standard (D.Lgs.) e attachment (Regi Decreti — Codice Penale, Civile, CPC)

**API disponibili**:
- `POST /api/corpus` — Ingest articoli (richiede auth + admin)
- `GET /api/corpus` — Statistiche corpus
- `GET /api/corpus/hierarchy` — Lista fonti o albero gerarchico per fonte specifica
- `GET /api/corpus/article?id=...` — Dettaglio articolo per ID
- `GET /api/corpus/article?q=...&source=...` — Ricerca articoli per testo
- `POST /api/corpus/ask` — Corpus Agent Q&A (Gemini 2.5 Flash / Haiku fallback)
- `POST /api/vector-search` — Ricerca semantica
- `GET /api/vector-search` — Statistiche vector DB

**Funzioni `lib/legal-corpus.ts`** (13 export):
- `getArticlesBySource()` — Lookup diretto per fonte (con paginazione >1000 righe)
- `getArticlesByInstitute()` — Ricerca per istituto giuridico
- `searchArticles()` — Ricerca semantica con embeddings
- `retrieveLegalContext()` — Query combinata per pipeline agenti
- `formatLegalContextForPrompt()` — Formatta contesto per prompt LLM
- `ingestArticles()` — Caricamento batch con embeddings
- `getCorpusStats()` — Statistiche runtime
- `getArticleById()` — Dettaglio singolo articolo con metadati
- `getCorpusSources()` — Lista fonti con conteggio articoli (paginato)
- `getSourceHierarchy()` — Albero gerarchico HierarchyNode[] per una fonte

### 1.5 Corpus Agent — Q&A sulla Legislazione

Agente standalone che risponde a domande sulla legislazione italiana usando il corpus pgvector.
Primo agente multi-provider: introduce **Google Gemini** come LLM alternativo a Claude.
Include **Question-Prep Agent** che riformula domande colloquiali in linguaggio giuridico.

```
Domanda utente (colloquiale, es. "posso restituire lo spazzolino?")
      │
      ▼
[QUESTION-PREP] (Gemini Flash / Haiku, ~1-2s)
  Riformula → "diritto di recesso consumatore restituzione bene acquistato"
      │
      ▼
[Voyage AI] → embedding della domanda riformulata
      │
      ▼
[pgvector] → top 8 articoli + knowledge base (parallelo)
      │
      ▼
[Gemini 2.5 Flash] ──fallback──▶ [Haiku 4.5]
  Risponde alla domanda ORIGINALE usando gli articoli trovati
      │
      ▼
Risposta JSON: { answer, citedArticles, confidence, followUpQuestions }
```

Punto chiave: **cerchiamo con il linguaggio legale, ma rispondiamo alla domanda originale**.

**Endpoint**: `POST /api/corpus/ask`
- Auth: opzionale (funziona per utenti anonimi, rate limit solo per autenticati)
- Rate limit: 10 RPM per utenti autenticati
- Validazione: domanda 5-2000 caratteri
- Body: `{ "question": "...", "config?": { "provider": "auto"|"gemini"|"haiku" } }`

**File chiave**:
- `lib/agents/question-prep.ts` — Agente riformulazione domande (colloquiale → legale)
- `lib/prompts/question-prep.ts` — System prompt riformulatore
- `lib/agents/corpus-agent.ts` — Logica agente, usa `runAgent("corpus-agent")` con auto-fallback
- `lib/prompts/corpus-agent.ts` — System prompt (vincolo: solo articoli dal contesto)
- `lib/ai-sdk/agent-runner.ts` — Gestisce primary→fallback automaticamente da `AGENT_MODELS`

**Fallback chain** (provider = "auto", gestito da `runAgent`):
1. Legge primary/fallback da `AGENT_MODELS["corpus-agent"]` in `lib/models.ts`
2. Se primary provider disponibile → lo usa (default: Gemini Flash)
3. Se primary fallisce → automaticamente prova fallback (default: Haiku 4.5)
4. Se question-prep fallisce → usa domanda originale (non blocca mai il flusso)

### 1.6 Pagine Frontend

| Pagina | File | Descrizione |
|--------|------|-------------|
| Landing | `app/page.tsx` | Hero 3 sezioni (Verifica, Dubbi con CorpusChat live, Brand) + orchestratore analisi |
| Dashboard | `app/dashboard/page.tsx` | Storico analisi utente |
| Pricing | `app/pricing/page.tsx` | Piani Free/Pro/Single |
| Analisi | `app/analysis/[id]/page.tsx` | Dettaglio singola analisi |
| **Corpus** | `app/corpus/page.tsx` | **Browser legislativo + Q&A AI in fondo** |
| **Articolo** | `app/corpus/article/[id]/page.tsx` | **Dettaglio articolo legislativo (linkato da CorpusChat)** |
| **Legal Office** | `app/legaloffice/page.tsx` | **Workspace unificato ufficio legale** |

**Corpus Browser** (`app/corpus/page.tsx`):
- 3 viste: lista fonti → albero gerarchico → dettaglio articolo
- Ricerca full-text articoli
- Navigazione gerarchica (Libro → Titolo → Capo → Sezione → Articolo)
- Keywords come tag, testo completo articoli
- Sezione Q&A in fondo con `CorpusChat` (variant purple)

### 1.7 Componenti

| Componente | File | Note |
|------------|------|------|
| Navbar | `components/Navbar.tsx` | Nav + menu mobile |
| **HeroSection** | `components/HeroSection.tsx` | **3 hero: HeroVerifica (upload), HeroDubbi (CorpusChat live), HeroBrand** |
| **MissionSection** | `components/MissionSection.tsx` | **Griglia 2x2 agenti con mini-illustrazioni SVG** |
| TeamSection | `components/TeamSection.tsx` | 4 avatar agenti (SVG) |
| VideoShowcase | `components/VideoShowcase.tsx` | Player video con autoplay |
| UseCasesSection | `components/UseCasesSection.tsx` | Casi d'uso a tab |
| TestimonialsSection | `components/TestimonialsSection.tsx` | Carosello testimonianze |
| UploadZone | `components/UploadZone.tsx` | Drag-drop upload |
| AnalysisProgress | `components/AnalysisProgress.tsx` | Progress real-time (643 righe) |
| ResultsView | `components/ResultsView.tsx` | Vista risultati |
| RiskCard | `components/RiskCard.tsx` | Card rischio + deep search |
| DeepSearchChat | `components/DeepSearchChat.tsx` | Chat Q&A su clausole |
| **CorpusChat** | `components/CorpusChat.tsx` | **Chat Q&A corpus legislativo (varianti hero/purple)** |
| FairnessScore | `components/FairnessScore.tsx` | Indicatore circolare 1-10 |
| LawyerCTA | `components/LawyerCTA.tsx` | Raccomandazione avvocato |
| PaywallBanner | `components/PaywallBanner.tsx` | Banner limite utilizzo |
| CTASection | `components/CTASection.tsx` | Call-to-action |
| Footer | `components/Footer.tsx` | Footer |
| **LegalBreadcrumb** | `components/LegalBreadcrumb.tsx` | **Breadcrumb navigazione gerarchica corpus** |

### 1.8 Scripts e Tooling

| Script | File | Descrizione |
|--------|------|-------------|
| **data-connector** | `scripts/data-connector.ts` | **CLI pipeline CONNECT→MODEL→LOAD per fonti Normattiva e EUR-Lex** |
| **seed-corpus** | `scripts/seed-corpus.ts` | Download corpus legacy da HuggingFace (solo Codice Civile) |
| **check-data** | `scripts/check-data.ts` | Validazione qualità dati corpus (conteggi, embeddings, campionamento) |
| **corpus-sources** | `scripts/corpus-sources.ts` | Definizioni 14 fonti legislative con ConnectorConfig + lifecycle |
| **setup-new-pc** | `scripts/setup-new-pc.ps1` | Setup completo Windows: fnm, Node 22, Python, VS Code, repo |
| **setup-dev** | `scripts/setup-dev.ps1` | Setup ambiente dev: git, npm install, .env.local, corpus loading |
| **SETUP_PC_NUOVO.bat** | root | Launcher batch per setup-new-pc.ps1 |
| **AVVIA_SITO.bat** | root | One-command: git pull + npm install + npm run dev |
| **cme-autorun** | `scripts/cme-autorun.ts` | **Orchestratore sessioni automatiche CME (daemon)** |
| **ops-alerting** | `scripts/ops-alerting.ts` | **CLI alerting con integrazione Telegram e dedup 12h** |
| **stress-test** | `scripts/stress-test.ts` | **Stress test infrastruttura** |

### 1.9 Operations & Alerting

**Telegram Alerting** (`lib/telegram.ts` + `scripts/ops-alerting.ts`):
- Alert functions: cost spike, test failure, sync failure, blocked tasks, daily reports
- CLI alerting con integrazione Telegram e deduplicazione 12h
- Stato alert persistito in `company/ops-alert-state.json`

**CME Daemon** (`scripts/cme-autorun.ts`):
- Orchestratore sessioni automatiche CME — esegue task board in autonomia
- Stato daemon persistito in `company/cme-daemon-state.json`
- API: `/api/company/daemon/route.ts` — stato daemon (GET/POST)
- Dashboard: `DaemonControlPanel.tsx` in `/ops`
- Log sessioni in `company/autorun-logs/`

### 1.10 Migrazioni Database

| Migrazione | File | Descrizione |
|-----------|------|-------------|
| 001 | `supabase/migrations/001_initial.sql` | Profili, analisi, deep_searches, lawyer_referrals + RLS |
| 002 | `supabase/migrations/002_usage_tracking.sql` | Funzioni increment + reset mensile |
| 003 | `supabase/migrations/003_legal_corpus.sql` | Tabella legal_articles con pgvector, HNSW index |
| **004** | `supabase/migrations/004_align_legal_articles.sql` | **Allineamento schema: source_id, source_type, article_number, url, hierarchy** |
| **005** | `supabase/migrations/005_fix_hierarchy_data.sql` | **Normalizzazione JSONB hierarchy (deduplica nodi Libri Codice Civile)** |
| **006** | `supabase/migrations/006_connector_sync_log.sql` | **Tabella sync log per Data Connector pipeline** |

### 1.11 Struttura Monorepo

Il repository `Claude-playground` contiene più progetti:

```
Claude-playground/
├── controlla-me/          ← Questo progetto (prototipo principale)
├── okmom-design/          ← Design system condiviso (Tailwind preset)
├── okmom-qa/              ← Template QA per validazione progetti
│   └── templates/
│       ├── qa.config.controlla-me.json
│       ├── qa.config.soldi-persi.json
│       └── qa.config.template.json
├── salva-me/              ← Progetto agenti Python (architettura separata)
└── commands/              ← Utility condivise tra progetti
```

---

## 2. Mappa delle Fragilità

### 2.1 SUPABASE — Single Point of Failure

| Problema | Severità | Stato |
|----------|----------|-------|
| **Supabase gestisce TUTTO**: auth, data, vectors, RLS, functions | CRITICA | ⚠️ Aperto |
| **Nessun connection pooling** visibile | ALTA | ⚠️ Aperto |
| **pgvector su Supabase ha limiti di memoria** — HNSW index in RAM | ALTA | ⚠️ Aperto |
| **Nessuna strategia di backup** codificata | ALTA | ⚠️ Aperto |
| **Se Supabase va in down** = tutto down, zero fallback | CRITICA | ⚠️ Aperto |
| **Costi unpredictable** — pgvector + storage + auth | MEDIA | ⚠️ Aperto |

**Impatto concreto**: Un downtime Supabase di 1 ora = zero funzionalità, zero fallback.

### 2.2 SCALABILITÀ

| Problema | Severità | Stato |
|----------|----------|-------|
| **Cache su filesystem locale** (`.analysis-cache/`) | CRITICA | ⚠️ Aperto |
| Non funziona con multiple istanze serverless | | |
| **Pipeline sequenziale bloccante** per 60-300 secondi | ALTA | ⚠️ Aperto |
| **Nessun sistema di code** (queue) | ALTA | ⚠️ Aperto |
| **Nessun horizontal scaling** | ALTA | ⚠️ Aperto |
| **Auto-indexing fire-and-forget** nello stesso processo | MEDIA | ⚠️ Aperto |
| **Rate limit Anthropic: 60s fissi** per ogni 429 | MEDIA | ⚠️ Aperto |
| Nessun backoff esponenziale, nessun circuit breaker | | |
| **Rate limit Voyage AI: singolo retry** | MEDIA | ⚠️ Aperto |

### 2.3 SICUREZZA

| Problema | Severità | Stato |
|----------|----------|-------|
| ~~`/api/corpus` POST senza autenticazione~~ | ~~CRITICA~~ | ✅ **RISOLTO** — `requireAuth()` + header admin |
| ~~`/api/deep-search` POST senza auth~~ | ~~ALTA~~ | ✅ **RISOLTO** — `requireAuth()` + `checkRateLimit` + `sanitizeUserQuestion` |
| ~~`/api/session/[id]` GET senza auth~~ | ~~ALTA~~ | ✅ **RISOLTO** — `requireAuth()` + `sanitizeSessionId` |
| ~~`/api/upload` POST senza auth~~ | ~~MEDIA~~ | ✅ **RISOLTO** — `requireAuth()` + `checkRateLimit` |
| ~~`/api/vector-search` POST senza auth~~ | ~~MEDIA~~ | ✅ **RISOLTO** — `requireAuth()` + `checkRateLimit` |
| ~~`/api/analyze` graceful degradation (auth inline)~~ | ~~MEDIA~~ | ✅ **RISOLTO** — `requireAuth()` + `checkCsrf()` (SEC-002/004) |
| ~~Nessun rate limiting~~ | ~~ALTA~~ | ✅ **RISOLTO** — `lib/middleware/rate-limit.ts` (in-memory, sliding window) |
| ~~`eval("require")` in extract-text.ts~~ | ~~BASSA~~ | ✅ **RISOLTO** — Usa `createRequire(import.meta.url)` |
| ~~Nessuna protezione CSRF~~ | ~~MEDIA~~ | ✅ **RISOLTO** — `lib/middleware/csrf.ts` (Origin check) su FormData endpoints (SEC-004) |
| ~~Nessuna sanitizzazione input~~ | ~~MEDIA~~ | ✅ **RISOLTO** — `lib/middleware/sanitize.ts` (document, question, sessionId) |
| ~~SessionId prevedibile (hash + timestamp)~~ | ~~BASSA~~ | ✅ **RISOLTO** — Hash + `crypto.randomUUID()` (28 char entropia) |
| ~~Security headers incompleti~~ | ~~BASSA~~ | ✅ **RISOLTO** — 7/7 header: aggiunti CSP + HSTS (SEC-003) |
| ~~`/api/stripe/*` auth inline~~ | ~~MEDIA~~ | ✅ **RISOLTO** — `requireAuth()` + `checkRateLimit()` (SEC-002) |
| ~~`/api/user/usage` senza rate limit~~ | ~~BASSA~~ | ✅ **RISOLTO** — `checkRateLimit()` 60 req/min (SEC-003) |

**Copertura auth sulle API routes** (aggiornato 2026-02-28):

| Route | Auth | Rate Limit | Sanitization | CSRF |
|-------|------|-----------|--------------|------|
| `/api/analyze` | ✅ `requireAuth` | ✅ | ✅ `sanitizeDocumentText` | ✅ |
| `/api/upload` | ✅ `requireAuth` | ✅ | — | ✅ |
| `/api/deep-search` | ✅ `requireAuth` | ✅ | ✅ `sanitizeUserQuestion` | — |
| `/api/vector-search` | ✅ `requireAuth` | ✅ | — | — |
| `/api/corpus` | ✅ `requireAuth` + admin | ✅ | — | — |
| `/api/session/[id]` | ✅ `requireAuth` | ✅ | ✅ `sanitizeSessionId` | — |
| `/api/user/usage` | — (pubblico, by design) | ✅ | — | — |
| `/api/stripe/checkout` | ✅ `requireAuth` | ✅ | — | — |
| `/api/stripe/portal` | ✅ `requireAuth` | ✅ | — | — |
| `/api/webhook` | — (Stripe signature) | — | — | — |
| `/api/auth/callback` | — (OAuth) | — | — | — |

### 2.4 PARAMETRIZZAZIONE

| Cosa è hardcoded | File | Valore attuale |
|---------------------|------|----------------|
| Modello Claude (Sonnet) | `anthropic.ts` | `claude-sonnet-4-5-20250929` |
| Modello Claude (Haiku) | `anthropic.ts` | `claude-haiku-4-5-20251001` |
| Max tokens per agente | Ogni agente | 4096 / 8192 |
| System prompts | `lib/prompts/*.ts` | Stringhe TypeScript |
| PLANS config | `stripe.ts` | `{free: 3/mese, pro: 4.99}` |
| Chunk size / overlap | `vector-store.ts` | 1000 / 200 chars |
| Embedding model | `embeddings.ts` | `voyage-law-2` |
| Search thresholds | Vari | 0.55 / 0.6 / 0.65 / 0.7 |
| Max investigator iterations | `investigator.ts` | 8 |
| Rate limit wait | `anthropic.ts` | 60s fissi |
| Max file size | `upload/route.ts` | 20 MB |
| Max risks/actions in advisor | `advisor.ts` | 3 / 3 |
| Rate limits per endpoint | `rate-limit.ts` | Hardcoded in `RATE_LIMITS` |

**Impatto**: Ogni modifica richiede un deploy del codice.
Nessun admin panel, nessun feature flag, nessun A/B testing.

> **Nota piattaforma**: Essendo controlla.me il primo prototipo, la parametrizzazione
> è la priorità più alta per rendere i servizi riutilizzabili nei futuri team di agenti.

---

## 3. Piano di Hardening Sicurezza

### 3.1 Priorità IMMEDIATE — ✅ IMPLEMENTATO

#### A. Middleware di autenticazione centralizzato — ✅ FATTO

**File**: `lib/middleware/auth.ts`

```typescript
// Implementazione reale (non più proposta)
export async function requireAuth(req: NextRequest): Promise<AuthResult | NextResponse>
export async function requireAdmin(req: NextRequest): Promise<AuthResult | NextResponse>
export function isAuthError(result: AuthResult | NextResponse): boolean
```

**Endpoint protetti**:
- ✅ `POST /api/corpus` — `requireAuth()` + header `ADMIN_API_SECRET`
- ✅ `POST /api/deep-search` — `requireAuth()`
- ✅ `GET /api/session/[id]` — `requireAuth()` + `sanitizeSessionId()`
- ✅ `POST /api/upload` — `requireAuth()`
- ✅ `POST /api/vector-search` — `requireAuth()`
- ⚠️ `POST /api/analyze` — Auth inline (non usa `requireAuth()`)

#### B. Rate Limiting — ✅ FATTO

**File**: `lib/middleware/rate-limit.ts`

```typescript
// Implementazione reale
const RATE_LIMITS = {
  "api/analyze":      { window: 60, max: 3 },
  "api/deep-search":  { window: 60, max: 10 },
  "api/corpus":       { window: 3600, max: 20 },
  "api/upload":       { window: 60, max: 10 },
  "api/vector-search":{ window: 60, max: 20 },
  "api/session":      { window: 60, max: 30 },
};
```

⚠️ **Limitazione**: In-memory sliding window — non condiviso tra istanze serverless.
Per produzione multi-istanza serve Redis/Upstash.

#### C. Input Sanitization — ✅ FATTO

**File**: `lib/middleware/sanitize.ts`

```typescript
// Implementazione reale
sanitizeDocumentText(text: string): string   // Max 500.000 char, strip control chars
sanitizeUserQuestion(question: string): string // Max 2.000 char
sanitizeSessionId(sessionId: string): string  // Alfanumerico + hyphens, path traversal protection
```

### 3.2 Priorità ALTA — ✅ Quasi Completata

#### D. Session ID non prevedibili — ✅ FATTO

**File**: `analysis-cache.ts`

```typescript
// Implementazione reale: hash + UUID ibrido
const docHash = hashDocument(documentText);  // SHA256, primi 16 char
const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
const sessionId = `${docHash}-${randomPart}`;
// 28 char di entropia, combina ripetibilità con imprevedibilità
```

#### E. Security Headers — ⚠️ QUASI COMPLETO

**File**: `next.config.ts`

Headers implementati:
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-Frame-Options: DENY`
- ✅ `X-XSS-Protection: 1; mode=block`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- ✅ `Content-Security-Policy` — implementata, `unsafe-eval` gated dietro `NODE_ENV` (solo development, rimosso in production)
- ❌ `Strict-Transport-Security` — da aggiungere

#### F. Eliminare eval() da extract-text.ts — ✅ FATTO

```typescript
// Usa createRequire come alternativa sicura (riga 43)
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
```

#### G. CSRF Protection — ✅ FATTO

**File**: `lib/middleware/csrf.ts`

Origin check su FormData endpoints (SEC-004). Implementato su `/api/analyze` e altri endpoint sensibili.

---

## 4. Parametrizzazione e Feature Flags

> **Stato**: ❌ NON IMPLEMENTATO — Proposta di design.
>
> Questa sezione è critica per la visione piattaforma: i servizi devono essere
> parametrizzabili per essere riutilizzati in altri team di agenti.

### 4.1 Sistema di Configurazione Proposto

```
controlla-me/
  config/
    agents.config.ts      ← Configurazione agenti (modelli, tokens, prompts)
    features.config.ts    ← Feature flags
    limits.config.ts      ← Rate limits, plan limits
    integrations.config.ts ← Configurazione integrazioni esterne
    vector.config.ts      ← Parametri vector DB (chunk, thresholds)
```

#### agents.config.ts

```typescript
export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  model: string;              // Modello Claude da usare
  modelFallback?: string;     // Fallback se il primario fallisce
  maxTokens: number;
  temperature?: number;
  systemPrompt: string;       // Riferimento al prompt
  enabled: boolean;
  retryPolicy: {
    maxRetries: number;
    baseDelayMs: number;
    strategy: "fixed" | "exponential";
  };
  timeout: number;            // ms
}

export const AGENTS: Record<string, AgentConfig> = {
  classifier: {
    id: "classifier",
    name: "Classificatore",
    description: "Identifica tipo documento, parti, leggi applicabili",
    model: process.env.CLASSIFIER_MODEL || "claude-haiku-4-5-20251001",
    maxTokens: parseInt(process.env.CLASSIFIER_MAX_TOKENS || "4096"),
    systemPrompt: "classifier",
    enabled: true,
    retryPolicy: { maxRetries: 3, baseDelayMs: 2000, strategy: "exponential" },
    timeout: 30_000,
  },
  analyzer: {
    id: "analyzer",
    name: "Analizzatore",
    description: "Analizza clausole, rischi, elementi mancanti",
    model: process.env.ANALYZER_MODEL || "claude-sonnet-4-5-20250929",
    maxTokens: parseInt(process.env.ANALYZER_MAX_TOKENS || "8192"),
    systemPrompt: "analyzer",
    enabled: true,
    retryPolicy: { maxRetries: 3, baseDelayMs: 2000, strategy: "exponential" },
    timeout: 60_000,
  },
  investigator: {
    id: "investigator",
    name: "Investigatore",
    description: "Ricerca norme e sentenze con web search",
    model: process.env.INVESTIGATOR_MODEL || "claude-sonnet-4-5-20250929",
    maxTokens: parseInt(process.env.INVESTIGATOR_MAX_TOKENS || "8192"),
    systemPrompt: "investigator",
    enabled: true,
    retryPolicy: { maxRetries: 3, baseDelayMs: 2000, strategy: "exponential" },
    timeout: 120_000,
  },
  advisor: {
    id: "advisor",
    name: "Consulente",
    description: "Genera report finale con scoring e raccomandazioni",
    model: process.env.ADVISOR_MODEL || "claude-sonnet-4-5-20250929",
    maxTokens: parseInt(process.env.ADVISOR_MAX_TOKENS || "4096"),
    systemPrompt: "advisor",
    enabled: true,
    retryPolicy: { maxRetries: 3, baseDelayMs: 2000, strategy: "exponential" },
    timeout: 60_000,
  },
  // --- NUOVI AGENTI (vedi sezione 5 e 6) ---
  connect: {
    id: "connect",
    name: "Connect Agent",
    description: "Ricerca e studia modalità di integrazione con sistemi esterni",
    model: process.env.CONNECT_MODEL || "claude-sonnet-4-5-20250929",
    maxTokens: parseInt(process.env.CONNECT_MAX_TOKENS || "8192"),
    systemPrompt: "connect",
    enabled: false, // Da abilitare dopo sviluppo
    retryPolicy: { maxRetries: 3, baseDelayMs: 2000, strategy: "exponential" },
    timeout: 180_000,
  },
};
```

#### features.config.ts

```typescript
export const FEATURES = {
  // Agenti
  vectorDB:            envBool("FEATURE_VECTOR_DB", true),
  ragRetrieval:        envBool("FEATURE_RAG_RETRIEVAL", true),
  autoIndexing:        envBool("FEATURE_AUTO_INDEXING", true),
  deepSearch:          envBool("FEATURE_DEEP_SEARCH", true),
  connectAgent:        envBool("FEATURE_CONNECT_AGENT", false),

  // Funzionalità
  anonymousAnalysis:   envBool("FEATURE_ANONYMOUS_ANALYSIS", false),
  stripePayments:      envBool("FEATURE_STRIPE_PAYMENTS", true),
  lawyerReferral:      envBool("FEATURE_LAWYER_REFERRAL", false),
  ocrSupport:          envBool("FEATURE_OCR", false),

  // Sicurezza
  rateLimiting:        envBool("FEATURE_RATE_LIMITING", true),
  requireAuth:         envBool("FEATURE_REQUIRE_AUTH", true),
  csrfProtection:      envBool("FEATURE_CSRF", true),

  // Debug
  verboseLogging:      envBool("FEATURE_VERBOSE_LOG", false),
  promptDebug:         envBool("FEATURE_PROMPT_DEBUG", false),
};

function envBool(key: string, defaultVal: boolean): boolean {
  const val = process.env[key];
  if (val === undefined) return defaultVal;
  return val === "true" || val === "1";
}
```

#### vector.config.ts

```typescript
export const VECTOR_CONFIG = {
  embeddingModel:    process.env.EMBEDDING_MODEL || "voyage-law-2",
  embeddingDims:     parseInt(process.env.EMBEDDING_DIMS || "1024"),
  chunkSize:         parseInt(process.env.CHUNK_SIZE || "1000"),
  chunkOverlap:      parseInt(process.env.CHUNK_OVERLAP || "200"),
  searchThresholds: {
    documents:       parseFloat(process.env.THRESHOLD_DOCS || "0.7"),
    knowledge:       parseFloat(process.env.THRESHOLD_KNOWLEDGE || "0.65"),
    articles:        parseFloat(process.env.THRESHOLD_ARTICLES || "0.6"),
    semantic:        parseFloat(process.env.THRESHOLD_SEMANTIC || "0.55"),
  },
  maxBatchSize:      parseInt(process.env.EMBEDDING_BATCH_SIZE || "128"),
  maxContextChars:   parseInt(process.env.MAX_RAG_CONTEXT || "6000"),
};
```

---

## 5. Agent Registry — Sistema Modulare

> **Stato**: ❌ NON IMPLEMENTATO — Proposta di design.
>
> Il registry è fondamentale per la visione piattaforma: ogni nuovo progetto
> (dopo controlla.me) avrà il proprio set di agenti registrabili dinamicamente.

### 5.1 Architettura Proposta

```
┌────────────────────────────────────────────────────────────┐
│                    AGENT REGISTRY                          │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Registro Agenti (agents.config.ts)                  │  │
│  │  ┌─────────┬──────────┬─────────────┬──────────┐    │  │
│  │  │Classifier│ Analyzer │Investigator │ Advisor  │    │  │
│  │  └─────────┴──────────┴─────────────┴──────────┘    │  │
│  │  ┌─────────┬──────────┬─────────────┬──────────┐    │  │
│  │  │ Connect │ Sentinel │  Comparator │ Mediator │    │  │
│  │  │ (nuovo) │ (futuro) │  (futuro)   │ (futuro) │    │  │
│  │  └─────────┴──────────┴─────────────┴──────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Pipeline Engine                                     │  │
│  │  - Esecuzione sequenziale o parallela                │  │
│  │  - Retry con backoff esponenziale                    │  │
│  │  - Circuit breaker per agente                        │  │
│  │  - Fallback model (Sonnet → Haiku → errore)          │  │
│  │  - Metriche per agente (latenza, successo, costo)    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Prompt Store                                        │  │
│  │  - Prompts versionati (v1, v2, ...)                  │  │
│  │  - A/B testing tra versioni                          │  │
│  │  - Rollback automatico se qualità scende             │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Interfaccia Base Agente

```typescript
// lib/agents/base.ts
export interface AgentInput {
  documentText?: string;
  previousResults: Record<string, unknown>;
  legalContext?: string;
  ragContext?: string;
  config: AgentConfig;
}

export interface AgentOutput {
  result: unknown;
  metadata: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    retries: number;
  };
}

export interface Agent {
  id: string;
  config: AgentConfig;
  run(input: AgentInput): Promise<AgentOutput>;
  validate(output: unknown): boolean;  // Validazione struttura output
}
```

### 5.3 Agenti Futuri Proposti

| Agente | Ruolo | Priorità |
|--------|-------|----------|
| **Connect** | Ricerca e studia integrazioni con sistemi esterni | P0 |
| **Sentinel** | Monitoraggio continuo: aggiornamenti normativi, scadenze | P1 |
| **Comparator** | Confronto tra versioni di un contratto / benchmark | P1 |
| **Mediator** | Suggerisce formulazioni alternative bilanciate | P2 |
| **Translator** | Traduzione legale certificata (IT↔EN↔DE↔FR) | P2 |
| **Auditor** | Verifica compliance GDPR, AML, ESG | P2 |

---

## 6. Connect Agent / Data Connector

> **Stato**: ⚠️ PARZIALMENTE IMPLEMENTATO
>
> Il **Data Connector** (`lib/staff/data-connector/`) è la prima implementazione concreta
> del Connect Agent. Gestisce la pipeline CONNECT→MODEL→LOAD per fonti legislative.
> 13 fonti caricate (~5600 articoli). L'evoluzione verso un agente AI autonomo di discovery
> resta nella roadmap.
>
> **Implementato**: Pipeline 3 fasi, connettori Normattiva + EUR-Lex, parsers AKN/HTML,
> CLI completa, cron API, sync log DB, validazione articoli.
>
> **Non implementato**: Discovery autonomo AI, Integration Catalog DB, Pattern Generator.

### 6.1 Mission

Il **Connect Agent** è un agente di ricerca e integrazione il cui compito è studiare
come connettersi a sistemi esterni non ancora censiti, seguendo una strategia gerarchica
di discovery delle fonti. Non è solo un connettore: è un **ricercatore** che costruisce
e mantiene un catalogo di integrazioni.

### 6.2 Architettura

```
┌──────────────────────────────────────────────────────────────────┐
│                        CONNECT AGENT                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  Integration Discovery                     │  │
│  │                                                            │  │
│  │  Gerarchia di ricerca (priorità decrescente):              │  │
│  │                                                            │  │
│  │  1. API Ufficiali (docs.*, developer.*, api.*)             │  │
│  │     └─ OpenAPI/Swagger specs, GraphQL schemas              │  │
│  │                                                            │  │
│  │  2. SDK e Librerie (npm, PyPI, crates.io)                  │  │
│  │     └─ Package ufficiali con typing e docs                 │  │
│  │                                                            │  │
│  │  3. Documentazione Ufficiale                               │  │
│  │     └─ Getting started, tutorials, reference               │  │
│  │                                                            │  │
│  │  4. Community Sources                                      │  │
│  │     ├─ GitHub (repos, issues, discussions)                 │  │
│  │     ├─ Stack Overflow (tag specifici)                      │  │
│  │     └─ Reddit (subreddit di settore)                       │  │
│  │                                                            │  │
│  │  5. Reverse Engineering (ultima risorsa)                   │  │
│  │     ├─ Scraping HTML strutturato                           │  │
│  │     ├─ Analisi network traffic (HAR files)                 │  │
│  │     └─ Pattern recognition su API non documentate          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │               Integration Catalog                          │  │
│  │                                                            │  │
│  │  Per ogni sistema scoperto, genera:                        │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  IntegrationSpec {                                   │  │  │
│  │  │    systemId: "normattiva_it"                         │  │  │
│  │  │    systemName: "Normattiva"                          │  │  │
│  │  │    category: "legal_database"                        │  │  │
│  │  │    status: "researched" | "prototype" | "stable"     │  │  │
│  │  │    connectionMethod: "api" | "scraping" | "sdk"      │  │  │
│  │  │    authMethod: "none" | "api_key" | "oauth2"         │  │  │
│  │  │    rateLimits: { rpm: 60, daily: 1000 }              │  │  │
│  │  │    dataFormat: "html" | "json" | "xml" | "pdf"       │  │  │
│  │  │    reliability: 0.85                                 │  │  │
│  │  │    lastVerified: "2026-02-24"                        │  │  │
│  │  │    integrationCode: "..."                            │  │  │
│  │  │    fallbackStrategies: [...]                         │  │  │
│  │  │    discoveryLog: [...]  // Come è stato scoperto     │  │  │
│  │  │  }                                                   │  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Pattern Generator                             │  │
│  │                                                            │  │
│  │  Genera adapter riutilizzabili per ogni integrazione:      │  │
│  │                                                            │  │
│  │  interface IntegrationAdapter {                            │  │
│  │    id: string;                                             │  │
│  │    connect(): Promise<void>;                               │  │
│  │    search(query: string): Promise<SearchResult[]>;         │  │
│  │    fetch(id: string): Promise<Document>;                   │  │
│  │    healthCheck(): Promise<boolean>;                        │  │
│  │    disconnect(): Promise<void>;                            │  │
│  │  }                                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Strategia Gerarchica di Discovery

```
                    ┌─────────────────────┐
                    │  Sistema Target     │
                    │  (es: "normattiva") │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ 1. OFFICIAL API     │
                    │                     │
                    │ Cerca:              │
                    │ - api.{domain}      │
                    │ - developer.{domain}│
                    │ - {domain}/api      │
                    │ - OpenAPI spec      │
                    │ - GraphQL endpoint  │
                    └──────────┬──────────┘
                          Trovata? ──────Yes──▶ Genera adapter API
                               │ No
                    ┌──────────▼──────────┐
                    │ 2. OFFICIAL SDK     │
                    │                     │
                    │ Cerca su:           │
                    │ - npmjs.com         │
                    │ - GitHub org        │
                    │ - pypi.org          │
                    └──────────┬──────────┘
                          Trovato? ──────Yes──▶ Genera adapter SDK
                               │ No
                    ┌──────────▼──────────┐
                    │ 3. DOCUMENTATION    │
                    │                     │
                    │ Cerca:              │
                    │ - docs.{domain}     │
                    │ - {domain}/docs     │
                    │ - developer guides  │
                    │ - integration guide │
                    └──────────┬──────────┘
                          Trovata? ──────Yes──▶ Genera adapter da docs
                               │ No
                    ┌──────────▼──────────┐
                    │ 4. COMMUNITY        │
                    │                     │
                    │ Cerca:              │
                    │ - GitHub issues     │
                    │ - Stack Overflow    │
                    │ - Reddit threads    │
                    │ - Dev.to / Medium   │
                    │ - Forum specifici   │
                    └──────────┬──────────┘
                      Trovato? ──────Yes──▶ Genera adapter community
                               │ No
                    ┌──────────▼──────────┐
                    │ 5. REVERSE ENG.     │
                    │                     │
                    │ - Analisi HTML      │
                    │ - Pattern scraping  │
                    │ - Network analysis  │
                    │ - Similar systems   │
                    └──────────┬──────────┘
                               │
                     Genera adapter scraping
                     con fallback strategy
```

### 6.4 Integrazioni Prioritarie per Controlla.me

| Sistema | Tipo | Metodo probabile | Valore |
|---------|------|-------------------|--------|
| **Normattiva.it** | DB legislativo | ✅ **API Open Data** (AKN XML) | Testo ufficiale leggi italiane — **8/8 fonti caricate** |
| **Brocardi.it** | Enciclopedia legale | Scraping + RSS | Commenti, massime, correlazioni |
| **ItalGiure** | Giurisprudenza | Scraping (accesso limitato) | Sentenze Cassazione |
| **EUR-Lex** | Normativa EU | ✅ **API Cellar REST** (HTML) | Regolamenti e direttive EU — **6/6 fonti caricate** |
| **Camera.it / Senato.it** | Lavori parlamentari | RSS + Scraping | DDL e iter legislativi |
| **Agenzia Entrate** | Fiscale | Scraping + API parziali | Risoluzioni, circolari |
| **CONSOB** | Finanziario | Scraping | Delibere, regolamenti |
| **Garante Privacy** | GDPR | Scraping | Provvedimenti, linee guida |
| **Registro Imprese** | Camerale | API ufficiale (a pagamento) | Visure societarie |
| **PEC providers** | Comunicazione | API (Aruba, Legalmail) | Invio PEC automatico |

### 6.5 System Prompt del Connect Agent

```typescript
export const CONNECT_AGENT_SYSTEM_PROMPT = `Sei il Connect Agent di controlla.me.
Il tuo compito è ricercare e progettare integrazioni con sistemi esterni.

PROCEDURA DI DISCOVERY (segui RIGOROSAMENTE quest'ordine):

1. API UFFICIALE — Cerca sempre prima se esiste un'API REST/GraphQL documentata.
   - Controlla: api.{domain}, developer.{domain}, {domain}/api/docs
   - Cerca OpenAPI/Swagger specification
   - Verifica autenticazione richiesta e rate limits

2. SDK/LIBRERIE — Se non c'è API diretta, cerca package ufficiali.
   - npmjs.com, PyPI, GitHub dell'organizzazione
   - Valuta manutenzione (ultimo commit, issues aperte)

3. DOCUMENTAZIONE UFFICIALE — Se non c'è SDK, studia la documentazione.
   - Cerca pattern di integrazione documentati
   - Guide per sviluppatori, webhook, export

4. COMMUNITY SOURCES — Se la documentazione è scarsa:
   - GitHub: repos che integrano il sistema, issues rilevanti
   - Stack Overflow: soluzioni validate dalla community
   - Reddit: esperienze reali, problemi noti
   - Dev.to / Medium: tutorial e guide pratiche

5. REVERSE ENGINEERING — Solo come ultima risorsa:
   - Analizza struttura HTML per scraping affidabile
   - Identifica pattern URL prevedibili
   - Cerca API non documentate (network tab, mobile apps)

OUTPUT RICHIESTO (JSON):
{
  "systemId": "identificativo_univoco",
  "systemName": "Nome Leggibile",
  "category": "legal_database | government | financial | communication | registry",
  "discoveryResults": [{
    "level": 1-5,
    "source": "url o descrizione",
    "finding": "cosa ho trovato",
    "reliability": 0.0-1.0
  }],
  "recommendedMethod": "api | sdk | scraping | hybrid",
  "integrationSpec": {
    "connectionMethod": "...",
    "authMethod": "none | api_key | oauth2 | session",
    "baseUrl": "...",
    "endpoints": [...],
    "rateLimits": { "rpm": N, "daily": N },
    "dataFormat": "json | html | xml | pdf",
    "errorHandling": "..."
  },
  "adapterCode": "// Codice TypeScript dell'adapter",
  "fallbackStrategies": ["..."],
  "risks": ["..."],
  "maintenanceNotes": "..."
}

REGOLE:
- MAI suggerire metodi illegali o che violino ToS.
- Per lo scraping: rispetta robots.txt, usa rate limiting gentile, identifica l'user-agent.
- Preferisci SEMPRE l'approccio più ufficiale e stabile.
- Se un sistema richiede pagamento, segnalalo chiaramente.
- Documenta OGNI passo del discovery per riproducibilità.`;
```

### 6.6 Schema DB per il Catalogo Integrazioni

```sql
-- Nuova migration: 004_integrations_catalog.sql

create table public.integration_catalog (
  id uuid primary key default gen_random_uuid(),
  system_id text unique not null,
  system_name text not null,
  category text not null,
  status text default 'researched',
  connection_method text not null,
  auth_method text default 'none',
  base_url text,
  spec jsonb default '{}',
  adapter_code text,
  fallback_strategies jsonb default '[]',
  risks jsonb default '[]',
  reliability numeric(3,2) default 0.0,
  last_verified_at timestamptz default now(),
  discovery_log jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.integration_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references public.integration_catalog(id),
  triggered_by text,
  status text default 'running',
  result jsonb,
  error text,
  duration_ms int,
  created_at timestamptz default now()
);

-- RLS
alter table public.integration_catalog enable row level security;
alter table public.integration_runs enable row level security;

create policy "Anyone can read catalog" on public.integration_catalog
  for select using (true);

create policy "Service role manages catalog" on public.integration_catalog
  for all using (true);

create policy "Service role manages runs" on public.integration_runs
  for all using (true);
```

---

## 7. Roadmap di Implementazione

### Fase 1 — Hardening (1-2 settimane) — ✅ ~98% COMPLETATA

```
[x] Auth middleware centralizzato per tutti gli endpoint
[x] Rate limiting (IP + user based, in-memory sliding window)
[x] Input sanitization pre-prompt (document, question, sessionId)
[x] Session ID con hash + crypto.randomUUID()
[x] Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy)
[x] Rimuovere eval() da extract-text.ts (usa createRequire)
[x] CSRF protection — `lib/middleware/csrf.ts` (Origin check) su FormData endpoints (SEC-004)
[x] Content-Security-Policy header — `unsafe-eval` gated dietro NODE_ENV (development only)
[ ] Strict-Transport-Security header
[ ] Uniformare auth pattern in api/analyze e api/stripe/* (usano auth inline)
```

### Fase 2 — Parametrizzazione (1 settimana) — ❌ NON INIZIATA

> **Priorità piattaforma**: Questa fase è critica per rendere i servizi
> riutilizzabili nei futuri team di agenti oltre controlla.me.

```
[ ] Creare config/ directory con files di configurazione
[ ] Estrarre tutti i valori hardcoded in env vars
[ ] Feature flags per ogni funzionalità
[ ] Refactor agenti per leggere da config
[ ] Rate limits da config (non hardcoded in rate-limit.ts)
```

### Fase 3 — Resilienza Supabase (2 settimane) — ❌ NON INIZIATA

```
[ ] Connection pooling (Supabase pgBouncer o esterno)
[ ] Cache layer (Redis/Upstash) per sessioni e rate limits
[ ] Migrare analysis-cache da filesystem a DB/Redis
[ ] Circuit breaker per chiamate Supabase
[ ] Retry con backoff esponenziale per tutte le chiamate esterne
[ ] Healthcheck endpoint per monitoraggio
[ ] Backup strategy (pg_dump schedulato o Supabase backup API)
```

### Fase 4 — Agent Registry (2 settimane) — ❌ NON INIZIATA

```
[ ] Interfaccia base Agent con run() / validate()
[ ] Agent Registry con registrazione dinamica
[ ] Pipeline Engine con esecuzione configurabile
[ ] Prompt Store versionato
[ ] Metriche per agente (latenza, costo, qualità)
[ ] Refactor dei 4 agenti esistenti sulla nuova interfaccia
```

### Fase 5 — Data Connector (2-3 settimane) — ⚠️ ~80% COMPLETATA

```
[x] Pipeline CONNECT→MODEL→LOAD con orchestratore e CLI
[x] Schema DB connector_sync_log (migration 006)
[x] Connettore Normattiva Open Data API (collection download + search)
[x] Connettore EUR-Lex Cellar REST
[x] Parser AKN (Akoma Ntoso XML — formato standard + attachment Regi Decreti)
[x] Parser HTML (EUR-Lex italiano)
[x] Model verifica schema legal_articles
[x] Store con adattatore per ingestArticles() + Voyage AI embeddings
[x] Validatore articoli
[x] Caricamento 14/14 fonti (~5600+ articoli con embeddings)
[x] Cron API per delta updates
[x] Statuto Lavoratori (L. 300/1970) — ✅ 41 articoli caricati via seed-statuto-lavoratori.ts
[ ] Delta updates testati end-to-end
[ ] Discovery engine AI autonomo (Connect Agent propriamente detto)
[ ] Dashboard admin per gestione catalogo integrazioni
```

### Fase 6 — Scalabilità (3-4 settimane) — ❌ NON INIZIATA

```
[ ] Sistema di code (BullMQ / Inngest / Trigger.dev)
[ ] Separare analisi da HTTP request (job asincrono)
[ ] Webhook/polling per risultati
[ ] Horizontal scaling delle funzioni di analisi
[ ] CDN per assets statici
[ ] Database read replicas per query pesanti
[ ] Monitoring (Sentry, Grafana, custom dashboards)
```

---

## Appendice A: Rischi Supabase e Mitigazione

### Scenario: "Supabase è down per 2 ore"

| Componente | Impatto | Mitigazione proposta |
|-----------|---------|----------------------|
| Auth | Login impossibile | Cache JWT locale, grace period |
| Database | Nessuna analisi salvata | Queue + retry, cache Redis |
| pgvector | Nessun RAG, nessun contesto | Fallback: analisi senza contesto |
| RLS | N/A (tutto down) | — |
| Storage | File non caricabili | Upload buffer locale |

### Scenario: "Supabase raggiunge limiti del piano"

| Risorsa | Limite Free | Limite Pro | Azione |
|---------|------------|------------|--------|
| Database | 500 MB | 8 GB | Archivio analisi vecchie |
| Bandwidth | 2 GB | 250 GB | CDN per assets |
| Auth users | Unlimited | Unlimited | OK |
| Edge Functions | 500K/mese | 2M/mese | Non usate (Next.js API) |
| Realtime | 200 concurrent | 500 | Non usato |

### Alternativa a lungo termine

Se i costi Supabase diventano insostenibili o i limiti troppo stringenti:

1. **Auth**: Migrare a Auth.js (NextAuth) — zero costi, stessa UX
2. **Database**: PostgreSQL self-hosted (Railway, Neon, o VPS) — più controllo
3. **Vectors**: pgvector su PostgreSQL dedicato, oppure Pinecone/Qdrant
4. **La migrazione è incrementale**: si può fare un pezzo alla volta

---

## Appendice B: Visione Piattaforma

Controlla.me è il **primo prototipo** di un ecosistema più ampio. I componenti
riutilizzabili per i futuri team di agenti:

| Componente | Riutilizzabilità | Note |
|-----------|-----------------|------|
| `lib/middleware/auth.ts` | ✅ Alta | Pattern auth generico, adattabile |
| `lib/middleware/rate-limit.ts` | ✅ Alta | Serve solo Redis per produzione |
| `lib/middleware/sanitize.ts` | ⚠️ Media | Funzioni specifiche per legal, da generalizzare |
| `lib/anthropic.ts` | ✅ Alta | Client Claude con retry, riutilizzabile ovunque |
| `lib/embeddings.ts` | ✅ Alta | Client Voyage generico |
| `lib/vector-store.ts` | ✅ Alta | RAG pipeline generica |
| `lib/agents/orchestrator.ts` | ⚠️ Media | Pipeline hardcoded, va reso configurabile (Fase 4) |
| Agent pipeline pattern | ✅ Alta | Classifier → Retrieval → Analyzer → Investigator → Advisor |
| `lib/staff/data-connector/` | ✅ Alta | Pipeline CONNECT→MODEL→LOAD generica, connettori pluggabili |
| SSE streaming pattern | ✅ Alta | Progress real-time riutilizzabile |
| Supabase setup (auth + RLS) | ✅ Alta | Pattern replicabile |

**Prossimi team di agenti possibili**:
- Analisi contratti di lavoro
- Due diligence societaria
- Compliance GDPR/AML
- Revisione bandi di gara
- Analisi brevetti

---

## Appendice C: Security Status & Tech Debt (2026-03-08)

### Security — Stato 🟢 VERDE

**Stato complessivo: 🟢 VERDE** — Tutti i finding medi e alti risolti. Finding bassi residui non bloccanti.

Vedi CLAUDE.md § 18 per dettaglio completo.

**Finding medi e alti — tutti risolti ✅:**

| ID | Problema | Stato |
|----|---------|-------|
| M1 | `/api/company/*` senza auth | ✅ `requireConsoleAuth` aggiunto (commit 2c7648f) |
| M2 | `/api/console/company` + `/message` + `/stop` senza auth | ✅ `requireConsoleAuth` aggiunto (commit 2c7648f) |
| M3 | `CRON_SECRET` opzionale | ✅ Fail-closed: 500 se non configurato (commit 2c7648f) |
| M4 | Route corpus READ senza rate-limit | ✅ `checkRateLimit` per IP su hierarchy/institutes/article (commit 2c7648f) |
| M5 | `/api/lawyer-referrals` senza rate-limit | ✅ `checkRateLimit` 5/h aggiunto |
| M6 | `/api/console/company/*` senza rate-limit (spawna `claude -p`) | ✅ `checkRateLimit` 5-10/min aggiunto su company, message, stop |
| M7 | `/api/company/costs` usa `requireAuth` anziché `requireConsoleAuth` | ✅ Cambiato a `requireConsoleAuth` + rate-limit |
| M8 | `/api/corpus` GET e `/api/vector-search` GET senza rate-limit | ✅ `checkRateLimit` per IP aggiunto |
| M9 | `/api/company/cron` POST senza rate-limit | ✅ `checkRateLimit` aggiunto |
| H1 | `/api/platform/cron/data-connector` GET senza auth (espone infrastruttura) | ✅ `CRON_SECRET` check aggiunto a GET |
| H2 | `/api/corpus/ask` rate-limit bypassato per utenti anonimi | ✅ `checkRateLimit` applicato SEMPRE (per userId o IP) |

**Finding bassi residui:**
- Whitelist console (`AUTHORIZED_USERS`) hardcoded nel sorgente — bassa priorità
- CSP include `'unsafe-eval'` — gated dietro `NODE_ENV` (solo development, rimosso in production)
- `/api/company/*` routes (board, tasks, status, files, departments, reports) senza rate-limit — protetti da console auth, basso rischio

**Accessibility WCAG 2.1 AA:**
| Area | Severità | Stato |
|------|---------|-------|
| Accessibility WCAG 2.1 AA | MEDIA | ✅ focus-visible, skip-nav, prefers-reduced-motion, aria-labels |

### Tech Debt Critici

| ID | Problema | Impatto | Effort |
|----|---------|---------|--------|
| **TD-1** | ~~`savePhaseTiming`: 2 roundtrip Supabase/fase~~ **RISOLTO 2026-03-01**: RPC `update_phase_timing` atomico (migration 016) | — | — |
| **TD-2** | `let currentTier` global mutable in `lib/tiers.ts` — rischio teorico, non attuale. `getAgentChain()` ora usa `getCurrentTier()` (AsyncLocalStorage-aware) | Race condition sotto carico | Basso — request-scoped |
| **TD-3** | ~~Migration 003-007 duplicate~~ **RISOLTO 2026-03-01**: rinumerati 001-015, REGISTRY.md aggiunto | — | — |

### Gap Test Coverage — RISOLTO

~~File critici senza test~~ — Tutti coperti (577+ test totali):
1. ~~`lib/ai-sdk/agent-runner.ts` — fallback chain (P1)~~ ✅
2. ~~`lib/tiers.ts` — logica tier (P2)~~ ✅
3. ~~`lib/middleware/console-token.ts` — HMAC security (P3)~~ ✅
4. ~~`lib/analysis-cache.ts` — migrata Supabase (P4)~~ ✅
5. ~~`lib/ai-sdk/generate.ts` — router provider (P5)~~ ✅

### Verticali Strategici (OKR Q2 2026)

| Verticale | TAM IT | Difficoltà | Corpus necessario |
|-----------|--------|-----------|------------------|
| **HRTech** (priorità 1) | €180M | Bassa-media | D.Lgs. 81/2008 + Statuto Lavoratori |
| **PropTech pro** (priorità 2) | €45-60M | Bassa | Decreto Salva-casa 2024 |
| **PMI Compliance B2B** (priorità 3) | €280M | Media | D.Lgs. 36/2023 Codice Contratti |

---

*Documento di architettura — controlla.me v1.3*
*Sincronizzato con CLAUDE.md il 2026-03-08*
*Per domande o aggiornamenti: aggiornare questo file nel branch di sviluppo.*
