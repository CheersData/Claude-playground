# CLAUDE.md — Istruzioni per agenti AI

---

## ⚠️ REGOLA ASSOLUTA — AMBIENTE DEMO

**Questo è un ambiente di demo. I crediti API Anthropic NON sono disponibili.**

### Per gli script interni (`scripts/`, `company/`)

Gli script di company operations (architect-review, model-census, data-connector, ecc.) devono usare **esclusivamente il CLI `claude -p`** per invocare LLM, MAI il SDK `@anthropic-ai/sdk` direttamente.

```typescript
// ✅ CORRETTO — usa CLI
import { execSync } from "child_process";
const output = execSync(`claude -p ${JSON.stringify(prompt)}`, { encoding: "utf-8" });

// ❌ VIETATO — usa API con crediti
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

**Nota:** il CLI non può girare dentro una sessione Claude Code attiva (nested session). Gli script vanno eseguiti dal terminale esterno.

### Task-runner e demo environment — COMPORTAMENTO ATTESO

`scripts/task-runner.ts` è lo script di esecuzione autonoma dei task aziendali. Usa correttamente `spawnSync('claude', ['-p'])` (CLI, non SDK). **In ambiente demo fallisce sempre** per uno di questi motivi:

1. `spawnSync claude ENOENT` — `claude` non è nel PATH del terminale che esegue lo script
2. `claude -p exit 1 | Credit balance is too low` — crediti API insufficienti (ambiente demo)

**Conseguenza:** il task-runner lascia i task in stato `in_progress` (o `blocked`) con messaggio di errore nel campo `result`. Questi task NON sono stati eseguiti.

**Soluzione obbligatoria in ambiente demo:** CME (Claude Code) esegue i task MANUALMENTE leggendo description e department.md del dipartimento, senza delegare al task-runner. Il task-runner è riservato ad ambienti con crediti API attivi e `claude` nel PATH.

### Per l'app runtime (`app/`, `lib/agents/`, `lib/ai-sdk/`)

L'app usa correttamente il sistema multi-provider via `lib/ai-sdk/agent-runner.ts` (tier system + fallback). Questa regola NON si applica al codice runtime dell'app.

**Salvo esplicito ordine contrario del boss, questa regola è permanente e non negoziabile.**

---

> Tutto ciò che un agente AI deve sapere per sviluppare, deployare e mantenere **controlla.me** — app di analisi legale AI con 4 agenti specializzati.
>
> **Controlla.me è il primo prototipo** di una piattaforma madre per molteplici team di agenti AI. I servizi devono essere scalabili e parametrizzabili.
>
> Per l'architettura completa, fragilità, security status e roadmap: vedi **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**
>
> Per il censimento modelli AI, prezzi e scelta per agente: vedi **[docs/MODEL-CENSUS.md](docs/MODEL-CENSUS.md)**

---

## 1. STACK TECNOLOGICO

| Livello | Tecnologia | Versione |
|---------|-----------|----------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Linguaggio | TypeScript (strict) | 5.9.x |
| CSS | Tailwind CSS 4 + PostCSS | 4 |
| Animazioni | Framer Motion | 12.34.2 |
| Icone | Lucide React | 0.575.0 |
| AI/LLM | @anthropic-ai/sdk | 0.77.0 |
| AI/LLM | @google/genai (Gemini 2.5 Flash/Pro) | 1.42.x |
| AI/LLM | openai (OpenAI, Mistral, Groq, Cerebras, DeepSeek) | 6.x |
| AI Registry | lib/models.ts — ~40 modelli, 7 provider | — |
| Tier System | lib/tiers.ts — 3 tier, catene N-fallback | — |
| Embeddings | Voyage AI (voyage-law-2) | API HTTP |
| Vector DB | Supabase pgvector (HNSW) | via PostgreSQL |
| Database | Supabase (PostgreSQL + RLS) | 2.97.0 |
| Auth | Supabase Auth (OAuth) | via @supabase/ssr |
| Pagamenti | Stripe | 20.3.1 |
| PDF | pdf-parse | 2.4.5 |
| DOCX | mammoth | 1.11.0 |
| XML Parser | fast-xml-parser (AKN legislativo) | 5.x |
| OCR | tesseract.js (NON implementato — rimosso da dependencies) | — |
| Font | DM Sans + Instrument Serif | Google Fonts |

---

## 2. SETUP E INSTALLAZIONE

### Prerequisiti

- Node.js 18+
- Account Supabase (progetto creato)
- Account Stripe (products creati)
- API key Anthropic

### Installazione

```bash
cd controlla-me
npm install
cp .env.local.example .env.local
# Compila tutte le variabili in .env.local
```

### Variabili d'ambiente richieste

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # Solo server-side

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_SINGLE_PRICE_ID=price_...

# Voyage AI (embeddings per vector DB — opzionale)
VOYAGE_API_KEY=pa-...

# Google Gemini (opzionale, fallback a Haiku)
GEMINI_API_KEY=...

# OpenAI (opzionale — subscription ChatGPT Plus NON include crediti API)
OPENAI_API_KEY=sk-proj-...

# Mistral (opzionale, free tier: tutti i modelli, 2 RPM)
MISTRAL_API_KEY=...

# Groq (opzionale, free tier: Llama 4, 1000 req/giorno)
GROQ_API_KEY=gsk_...

# Cerebras (opzionale, free tier: 1M token/giorno)
CEREBRAS_API_KEY=csk-...

# DeepSeek (opzionale — ⚠️ server in Cina, non usare per dati sensibili)
DEEPSEEK_API_KEY=...

# Console (obbligatorio in produzione)
CONSOLE_JWT_SECRET=...           # min 32 chars — se assente usa fallback hardcoded pubblico (RISCHIO SICUREZZA)
CRON_SECRET=...                  # obbligatorio se cron attivi — se assente i cron endpoint sono aperti a chiunque

# Telegram (per Company Scheduler — approvazione piani via bot)
# Setup: @BotFather → /newbot → copia token. Poi: api.telegram.org/bot{TOKEN}/getUpdates → prendi "chat.id"
TELEGRAM_BOT_TOKEN=...           # es. 1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=...             # ID numerico della chat con il bot

# Upstash Redis (necessario per rate limiting distribuito in produzione)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Database setup

```bash
# Esegui le migrazioni in ordine su Supabase SQL Editor:
# 1. supabase/migrations/001_initial.sql       -> Profili, analisi, deep_searches, lawyer_referrals + RLS
# 2. supabase/migrations/002_usage_tracking.sql -> Funzioni increment + reset mensile
# 3. supabase/migrations/040_forma_mentis.sql   -> Forma Mentis: 6 tabelle intelligenza aziendale + 4 RPC vector search
```

### Avvio

```bash
npm run dev     # http://localhost:3000
npm run build   # Build produzione
npm run start   # Server produzione
```

### Config critica: next.config.ts

```typescript
// pdf-parse DEVE essere dichiarato come external package
serverExternalPackages: ["pdf-parse"]
```

---

## 3. ARCHITETTURA DIRECTORY

```
controlla-me/
├── app/
│   ├── layout.tsx                 # Root layout (font, metadata)
│   ├── page.tsx                   # Landing page + orchestratore analisi (~1160 righe)
│   ├── globals.css                # Tailwind + animazioni custom
│   ├── dashboard/page.tsx         # Storico analisi utente
│   ├── pricing/page.tsx           # Piani (Free/Pro/Single)
│   ├── analysis/[id]/page.tsx     # Dettaglio analisi
│   ├── corpus/page.tsx            # Navigazione corpus legislativo + Q&A
│   ├── corpus/article/[id]/page.tsx # Dettaglio articolo legislativo
│   ├── integrazione/page.tsx      # Dashboard connettori integrazione PMI
│   ├── integrazione/IntegrazioneClient.tsx  # Client component dashboard
│   ├── integrazione/[connectorId]/page.tsx  # Dettaglio connettore
│   ├── integrazione/[connectorId]/ConnectorDetailClient.tsx  # Client component dettaglio
│   └── api/
│       ├── analyze/route.ts       # CORE - SSE streaming analisi
│       ├── upload/route.ts        # Estrazione testo da file
│       ├── deep-search/route.ts   # Ricerca approfondita clausole
│       ├── vector-search/route.ts # Ricerca semantica vector DB
│       ├── corpus/route.ts           # Gestione corpus legislativo
│       ├── corpus/hierarchy/route.ts # Fonti e albero navigabile
│       ├── corpus/ask/route.ts      # Corpus Agent Q&A (Gemini/Haiku)
│       ├── console/route.ts         # Console SSE — leader + pipeline routing
│       ├── console/tier/route.ts    # GET/POST — tier switch + agent toggle
│       ├── session/[sessionId]/route.ts  # Cache sessioni
│       ├── user/usage/route.ts    # Limiti utilizzo
│       ├── auth/callback/route.ts # OAuth Supabase
│       ├── stripe/checkout/route.ts
│       ├── stripe/portal/route.ts
│       └── webhook/route.ts       # Webhook Stripe
│
├── components/                    # 20+ componenti React
│   ├── Navbar.tsx                # Nav + menu mobile
│   ├── HeroSection.tsx           # 3 hero: HeroVerifica, HeroDubbi (CorpusChat live), HeroBrand
│   ├── MissionSection.tsx        # Come funziona (4 step)
│   ├── TeamSection.tsx           # 4 avatar agenti (SVG)
│   ├── VideoShowcase.tsx         # Player video con autoplay
│   ├── UseCasesSection.tsx       # Casi d'uso a tab
│   ├── TestimonialsSection.tsx   # Carosello testimonianze
│   ├── UploadZone.tsx            # Drag-drop upload
│   ├── AnalysisProgress.tsx      # Progress real-time (643 righe)
│   ├── ResultsView.tsx           # Vista risultati
│   ├── RiskCard.tsx              # Card rischio + deep search
│   ├── DeepSearchChat.tsx        # Chat Q&A su clausole
│   ├── CorpusChat.tsx            # Chat Q&A corpus legislativo (hero + /corpus)
│   ├── FairnessScore.tsx         # Indicatore circolare 1-10
│   ├── LawyerCTA.tsx             # Raccomandazione avvocato
│   ├── PaywallBanner.tsx         # Banner limite utilizzo
│   ├── CTASection.tsx            # Call-to-action
│   ├── Footer.tsx                # Footer
│   ├── integrations/             # Componenti Ufficio Integrazione
│   │   ├── ConnectorCard.tsx     # Card connettore con stato sync
│   │   ├── IntegrationFilters.tsx # Filtri per categoria/stato
│   │   ├── SetupWizard.tsx       # Wizard OAuth setup (4 step)
│   │   ├── SyncDashboard.tsx     # Dashboard sync real-time
│   │   ├── SyncHistory.tsx       # Storico sincronizzazioni
│   │   └── wizard/               # Step wizard (AuthStep, FieldMappingStep, EntitySelect, FrequencyStep, ReviewStep)
│   └── console/                  # Componenti console
│       ├── StudioShell.tsx       # Layout console
│       ├── ConsoleHeader.tsx     # Header + Power button
│       ├── ConsoleInput.tsx      # Input chat
│       ├── AgentOutput.tsx       # Rendering output agenti
│       ├── ReasoningGraph.tsx    # Visualizzazione reasoning
│       ├── CorpusTreePanel.tsx   # Pannello laterale corpus
│       └── PowerPanel.tsx        # Pannello tier + catene fallback + toggle agenti
│
├── lib/
│   ├── anthropic.ts              # Client Claude + retry rate limit
│   ├── gemini.ts                 # Client Gemini 2.5 Flash + retry
│   ├── models.ts                 # Registry centralizzato: ~40 modelli, 7 provider
│   ├── tiers.ts                  # Tier system: intern/associate/partner + catene fallback + agent toggle
│   ├── ai-sdk/                   # Infrastruttura AI riusabile (astraibile)
│   │   ├── types.ts              # Interfacce GenerateConfig, GenerateResult
│   │   ├── openai-compat.ts      # 1 funzione per 5 provider OpenAI-compatibili
│   │   ├── generate.ts           # Router universale: generate(modelKey) → provider
│   │   └── agent-runner.ts       # runAgent(agentName) con catena N-fallback da tiers.ts
│   ├── embeddings.ts             # Client Voyage AI per embeddings
│   ├── vector-store.ts           # RAG: chunk, index, search, buildRAGContext
│   ├── legal-corpus.ts           # Ingest e query corpus legislativo
│   ├── staff/
│   │   └── data-connector/       # Staff Service: pipeline CONNECT→MODEL→LOAD
│   │       ├── index.ts           # Orchestratore pipeline
│   │       ├── types.ts           # Interfacce generiche
│   │       ├── registry.ts        # Source registry da corpus-sources.ts
│   │       ├── sync-log.ts        # CRUD su connector_sync_log
│   │       ├── connectors/
│   │       │   ├── base.ts        # BaseConnector (fetch+retry, User-Agent)
│   │       │   ├── normattiva.ts  # Normattiva Open Data API + collection download
│   │       │   └── eurlex.ts      # EUR-Lex Cellar REST
│   │       ├── parsers/
│   │       │   ├── akn-parser.ts  # Akoma Ntoso XML → articoli (standard + attachment)
│   │       │   └── html-parser.ts # EUR-Lex HTML → articoli
│   │       ├── models/
│   │       │   └── legal-article-model.ts  # Verifica schema legal_articles
│   │       ├── stores/
│   │       │   └── legal-corpus-store.ts   # Adattatore per ingestArticles()
│   │       └── validators/
│   │           └── article-validator.ts    # Validazione articoli
│   ├── extract-text.ts           # Estrazione PDF/DOCX/TXT
│   ├── analysis-cache.ts         # Cache analisi su filesystem
│   ├── stripe.ts                 # Config Stripe + piani
│   ├── types.ts                  # Interfacce TypeScript
│   ├── agents/
│   │   ├── orchestrator.ts       # Pipeline 4 agenti
│   │   ├── classifier.ts         # Agente 1: classificazione
│   │   ├── analyzer.ts           # Agente 2: analisi rischi
│   │   ├── investigator.ts       # Agente 3: ricerca legale
│   │   ├── advisor.ts            # Agente 4: consiglio finale
│   │   ├── corpus-agent.ts      # Agente corpus: Q&A legislativo (Gemini/Haiku)
│   │   └── question-prep.ts     # Agente 5: riformulazione domande (colloquiale → legale)
│   ├── prompts/
│   │   ├── classifier.ts         # Prompt classificatore
│   │   ├── analyzer.ts           # Prompt analista
│   │   ├── investigator.ts       # Prompt investigatore
│   │   ├── advisor.ts            # Prompt consigliere
│   │   ├── corpus-agent.ts      # Prompt agente corpus
│   │   └── question-prep.ts    # Prompt riformulazione domande
│   └── supabase/
│       ├── client.ts             # Client browser
│       ├── server.ts             # Client SSR
│       └── admin.ts              # Client admin (webhook)
│
├── scripts/
│   ├── data-connector.ts          # CLI: connect, model, load, status, update
│   ├── corpus-sources.ts          # 14 fonti con ConnectorConfig + lifecycle
│   ├── tax-sources.ts             # 11 fonti verticale Tax/Commercialista
│   ├── integration-sources.ts     # Fonti business connector (Stripe, HubSpot, GDrive, Salesforce)
│   ├── model-census-agent.ts      # CLI: verifica modelli provider (npx tsx scripts/model-census-agent.ts)
│   ├── seed-corpus.ts             # Seed legacy (HuggingFace)
│   └── check-data.ts              # QA dati corpus
│
├── supabase/migrations/           # SQL per setup DB (001-033)
├── public/videos/                 # Video generati AI
├── .analysis-cache/               # Cache analisi (gitignored)
│
├── trading/                       # Ufficio Trading (Python, stesso localhost)
│   ├── pyproject.toml             # Python 3.11+, alpaca-py, pandas, ta
│   ├── src/
│   │   ├── config/settings.py     # Pydantic settings (26 parametri)
│   │   ├── connectors/alpaca_client.py  # Alpaca trading + market data
│   │   ├── models/                # signals.py, orders.py, portfolio.py
│   │   ├── agents/base.py         # BaseAgent ABC
│   │   ├── strategies/            # (futuro)
│   │   ├── backtest/              # (Fase 2)
│   │   └── utils/                 # db.py (CRUD Supabase), logging.py
│   └── tests/
│
└── company/trading/               # Org structure trading
    ├── department.md              # Identità ufficio + vincoli architetturali
    ├── agents/                    # 5 identity cards + trading-lead
    └── runbooks/                  # pipeline, risk, backtest, go-live
```

---

## 4. SISTEMA MULTI-AGENTE (IL CUORE)

### Pipeline con RAG

```
Documento
   |
[1] CLASSIFIER (Haiku 4.5, ~12s)
   -> Tipo, sotto-tipo, istituti giuridici, focus areas, leggi
   |
[1.5] RETRIEVAL (Vector DB, ~2s)
   -> Lookup diretto per leggi identificate
   -> Ricerca per istituti giuridici
   -> Ricerca semantica per clausole
   -> Contesto da analisi precedenti (knowledge base)
   |
[2] ANALYZER (Sonnet 4.5, ~25s) + contesto normativo verificato
   -> Clausole rischiose con framework normativo corretto
   |
[2.5] RETRIEVAL (Vector DB, ~1s)
   -> Ricerca semantica per clausole problematiche trovate
   |
[3] INVESTIGATOR (Sonnet 4.5 + web_search, ~30s) + contesto legale + RAG
   -> Copre TUTTE le clausole critical e high
   |
[4] ADVISOR (Sonnet 4.5, ~18s) + RAG per calibrazione mercato
   -> Scoring multidimensionale (4 dimensioni), max 3 rischi, max 3 azioni
   |
[5] AUTO-INDEX (background, ~5s)
   -> Salva conoscenza nel vector DB per analisi future
```

### Pipeline Corpus Agent (Q&A legislativo)

```
Domanda utente (colloquiale)
   |
[1] QUESTION-PREP (Gemini Flash / Haiku fallback, ~1-2s)
   -> Riformula domanda colloquiale in linguaggio giuridico
   -> Es. "restituire spazzolino" → "diritto di recesso consumatore restituzione bene"
   |
[2] RETRIEVAL (Vector DB, ~2s)
   -> searchArticles(legalQuery) — top 8 articoli per similarita'
   -> searchLegalKnowledge(legalQuery) — top 4 knowledge entries
   |
[3] CORPUS-AGENT (Gemini Flash / Haiku fallback, ~5-12s)
   -> Risponde alla domanda ORIGINALE usando articoli trovati
   -> Output: answer, citedArticles (con ID verificabili), confidence, followUp
```

Punto chiave: **cerchiamo con il linguaggio legale, ma rispondiamo alla domanda originale**.

### Tier System e Catene di Fallback

Configurazione centralizzata in `lib/tiers.ts`. Ogni agente ha una **catena ordinata di N modelli**. Il tier (Intern/Associate/Partner) determina il punto di partenza nella catena. Su errore 429 o provider non disponibile, il sistema scende automaticamente al modello successivo.

```
Tier Partner:   Sonnet 4.5 → Gemini Pro → Mistral Large → Groq Llama → Cerebras
Tier Associate: Gemini Pro → Mistral Large → Groq Llama → Cerebras
Tier Intern:    Mistral Large → Groq Llama → Cerebras
```

| Tier | Descrizione | Modelli tipici | Costo stimato |
|------|-------------|---------------|---------------|
| **Intern** | Modelli gratuiti | Cerebras, Groq, Mistral free | ~gratis |
| **Associate** | Modelli intermedi | Gemini Flash/Pro, Haiku | ~$0.01 |
| **Partner** | Modelli top-tier | Sonnet, GPT-5 | ~$0.05 |

**Investigator**: catena limitata a 2 modelli Anthropic (Sonnet → Haiku) perche usa `web_search` che richiede Claude.

### Toggle Agenti

Ogni agente puo essere disabilitato singolarmente dal PowerPanel. Quando disabilitato:
- **Classifier** → classificazione minimale di default
- **Analyzer** → `{ clauses: [], missingElements: [], overallRisk: "low" }`
- **Investigator** → `{ findings: [] }` (stesso pattern del fallback su errore)
- **Advisor** → skip, nessun output finale
- **Question-prep** → usa domanda originale come query legale
- **Corpus-agent** → skip risposta LLM

Stato gestito in `lib/tiers.ts` con `isAgentEnabled()` / `setAgentEnabled()`. API: `POST /api/console/tier` con `{ agent, enabled }`.

### Provider disponibili (7)

Architettura a 3 livelli: `lib/models.ts` (registry) → `lib/ai-sdk/generate.ts` (router) → provider client.
Anthropic e Gemini hanno SDK nativi dedicati. Gli altri 5 usano `lib/ai-sdk/openai-compat.ts` (1 funzione per tutti).

| Provider | Implementazione | Modelli | Free tier |
|----------|----------------|---------|-----------|
| Anthropic | `lib/anthropic.ts` (SDK nativo) | Sonnet 4.5, Haiku 4.5 | No |
| Google Gemini | `lib/gemini.ts` (SDK nativo) | Flash, Flash Lite, Pro | 250 req/giorno |
| OpenAI | `lib/ai-sdk/openai-compat.ts` | GPT-5.1, 5.2, 4.1, 4o, Codex Mini, OSS 20B/120B | $5 crediti |
| Mistral | `lib/ai-sdk/openai-compat.ts` | Large, Small, Nemo, Ministral, Magistral S/M | Tutti, 2 RPM |
| Groq | `lib/ai-sdk/openai-compat.ts` | Llama 4 Scout, 3.3 70B, 3.1 8B, GPT-OSS, Kimi K2 | 1000 req/giorno |
| Cerebras | `lib/ai-sdk/openai-compat.ts` | Llama 3.3 70B, 3.1 8B, Qwen3 235B, GPT-OSS 120B | 1M tok/giorno |
| DeepSeek | `lib/ai-sdk/openai-compat.ts` | V3, R1 | 5M tok (30gg) |

Gli agenti usano `runAgent(agentName, prompt)` da `lib/ai-sdk/agent-runner.ts` che risolve la catena di fallback dal tier corrente. Per cambiare catena o tier: modificare `AGENT_CHAINS` / `TIER_START` in `lib/tiers.ts`.

Vedi `docs/MODEL-CENSUS.md` per pricing completo. Script `scripts/model-census-agent.ts` per verificare modelli nuovi/deprecati dai provider.

### Regole dei prompt

1. **Output JSON puro** — Mai markdown, mai backtick, mai testo extra
2. **Inizia con `{` e finisci con `}`** — Esplicito in ogni prompt
3. **Agente analista: punto di vista parte debole** (consumatore/conduttore/lavoratore)
4. **Investigatore: NON inventare sentenze** — Scrivere "orientamento non verificato" se non trovato
5. **Consigliere: linguaggio da bar** — Zero legalese, frasi brevi, come spiegare a un amico
6. **Limiti output**: max 3 rischi, max 3 azioni (evita wall of text)
7. **Fairness score calibrato**: 9-10 equilibrato, 5-6 problemi, 1-2 gravemente squilibrato
8. **`needsLawyer: true` solo per problemi seri** — Non allarmismo gratuito

### Come scrivere un prompt agente efficace

```typescript
export const NOME_SYSTEM_PROMPT = `[Ruolo]. [Compito specifico].

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. NON usare backtick, code fence, markdown.
La tua risposta deve iniziare con { e finire con }.

Formato richiesto:
{
  "campo1": "tipo",
  "campo2": [{ "nested": "valore" }]
}

Regole:
- [Vincolo 1]
- [Vincolo 2]
- Campi incerti = null. Non inventare dati assenti.`;
```

### Parsing JSON robusto

Il parser in `lib/anthropic.ts` gestisce risposte imperfette con fallback chain:

```
1. Parse diretto
2. Strip code fences
3. Regex estrazione { ... } o [ ... ]
4. Errore dettagliato con primi 200 char della risposta
```

---

## 5. EVITARE IL THROTTLING API (LEZIONE CRITICA)

### Problema

L'API Anthropic ha rate limit per minuto. Con 4 agenti sequenziali si rischia il 429.

### Soluzione implementata: lib/anthropic.ts

```typescript
const MAX_RETRIES = 6;

for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  try {
    response = await client.messages.create(params);
    break;
  } catch (err) {
    const isRateLimit = err.message.includes("rate_limit");
    const status = err.status;
    if ((status === 429 || isRateLimit) && attempt < MAX_RETRIES) {
      // Rate limit e' per minuto -> attendi 60s fissi
      await new Promise(r => setTimeout(r, 60_000));
      continue;
    }
    throw err;
  }
}
```

### Strategie anti-throttling (ordine di importanza)

1. **Catene di fallback N-modelli** — Su 429 il sistema scende automaticamente al modello successivo nella catena (lib/tiers.ts). Nessun tempo di attesa se un altro provider e' disponibile
2. **Retry 60s fisso su 429** — Se tutta la catena fallisce, retry su rate limit con attesa 60s
3. **Distribuisci i modelli** — Haiku per task semplici (classifier, investigator), Sonnet per task complessi (analyzer, advisor). Riduce token consumati
4. **Cache aggressiva** — SHA256 del documento, se gia analizzato salta le fasi completate. Risparmio 50%+ chiamate API
5. **Limita le iterazioni** — Investigator: max 5 tool_use loop. Deep search: max 8 iterazioni
6. **Limita i token output** — Ogni agente ha max_tokens calibrato: 4096, 8192, 6144, 4096
7. **Usage limits per utente** — Free: 3 analisi/mese. Previene abuso
8. **Logging dettagliato** — Logga token in/out, tempo, stop_reason per ogni chiamata

### Pattern logging API

```
[API] -> CLASSIFIER | model: claude-haiku-4.5 | max_tokens: 4096 | input: ~5000 chars
[API] <- CLASSIFIER | 12.3s | tokens: 450 in / 1200 out | stop: end_turn | 5420 chars
```

---

## 6. SISTEMA DI CACHE

### Come funziona

```
Documento -> SHA256 hash (primi 16 char) -> sessionId = hash-timestamp
```

Cache su filesystem in `.analysis-cache/sessionId.json`:

```json
{
  "sessionId": "a1b2c3d4e5f6g7h8-lx3abc",
  "documentHash": "a1b2c3d4e5f6g7h8",
  "classification": null,
  "analysis": null,
  "investigation": null,
  "advice": null,
  "phaseTiming": {
    "classifier": { "startedAt": "...", "completedAt": "...", "durationMs": 12300 }
  }
}
```

### Logica di ripresa

1. Se `resumeSessionId` -> carica quella sessione
2. Altrimenti cerca per hash documento -> trova sessione incompleta
3. Salta fasi gia completate, esegui solo quelle mancanti
4. Se sessione completa (ha `advice`), crea nuova sessione

### Medie tempi

Calcola medie da ultime 30 sessioni per calibrare la progress bar lato client. Fallback su default: 12s, 25s, 22s, 18s.

---

## 7. STREAMING SSE (Server-Sent Events)

### Endpoint: POST /api/analyze

Timeout: 300 secondi (5 minuti)

### Formato eventi

```
event: timing
data: {"classifier": 12, "analyzer": 25, "investigator": 22, "advisor": 18}

event: session
data: {"sessionId": "abc123"}

event: progress
data: {"phase": "classifier", "status": "running"}

event: progress
data: {"phase": "classifier", "status": "done", "data": {...}}

event: progress
data: {"phase": "investigator", "status": "skipped"}

event: error
data: {"phase": "analyzer", "error": "messaggio"}

event: complete
data: {"advice": {...}}
```

### Implementazione server

```typescript
return new Response(
  new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("timing", timings);
      send("session", { sessionId });
      await runOrchestrator(text, {
        onProgress: (phase, status, data) => send("progress", { phase, status, data }),
        onError: (phase, error) => send("error", { phase, error }),
        onComplete: (result) => send("complete", { advice: result }),
      });
      controller.close();
    },
  }),
  { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } }
);
```

---

## 8. COMPONENTI UI — PATTERN E CONVENZIONI

### Design system

```css
/* Colori */
--background: #0a0a0a       /* sfondo scuro */
--accent: #FF6B35            /* arancione primario */

/* Colori agenti */
Leo (Catalogatore):  #4ECDC4  /* teal */
Marta (Analista):    #FF6B6B  /* corallo */
Giulia (Giurista):   #A78BFA  /* viola */
Enzo (Consulente):   #FFC832  /* oro */

/* Font */
--font-sans: 'DM Sans'           /* testo, UI */
--font-serif: 'Instrument Serif'  /* heading, premium feel */
```

### Convenzioni componenti

- **Client components**: `"use client"` in cima, usano Framer Motion
- **Animazioni**: Sempre con `framer-motion` (motion.div, AnimatePresence)
- **Responsive**: Mobile-first, breakpoint `md:` per desktop
- **Icone**: Solo `lucide-react`, importare singole icone
- **Tailwind 4**: Niente config file separato, tema in globals.css
- **Classi custom**: `.floating-orb`, `.section-divider`, `.noise-overlay`, `.video-glow`

### Componente VideoShowcase

```tsx
<VideoShowcase
  src="/videos/nome-video.mp4"     // path in /public
  poster="/videos/poster.jpg"      // opzionale
  title="Titolo sezione"
  subtitle="Sottotitolo"
  accentColor="#FF6B35"            // default arancione
/>
```

Autoplay on scroll, mute/unmute toggle, play overlay, loop, 16:9.

### Componente AnalysisProgress

Il componente piu complesso (643 righe): cerchio progress con gradiente, timeline 4 fasi, ETA da dati storici, timer real-time, retry su errore.

---

## 9. ESTRAZIONE TESTO DA DOCUMENTI

| Formato | Libreria | Note |
|---------|----------|------|
| PDF | pdf-parse | Richiede serverExternalPackages in next.config |
| DOCX/DOC | mammoth | Estrazione raw text |
| TXT | Built-in | UTF-8 decode |
| Immagini | tesseract.js | NON implementato — libreria rimossa da dependencies, reinstallare quando necessario |

Validazione: file max 20MB, testo estratto min 50 caratteri, messaggi errore in italiano.

---

## 10. AUTENTICAZIONE E PAGAMENTI

### Flusso auth

```
Click "Abbonati" -> OAuth redirect Supabase -> Callback /api/auth/callback -> Session cookie
```

### Piani

```typescript
free:   { price: 0,    analysesPerMonth: 3,        deepSearchLimit: 1 }
pro:    { price: 4.99, analysesPerMonth: Infinity,  deepSearchLimit: Infinity }
single: { price: 0.99 }  // one-shot
```

### Stripe webhook events

- `checkout.session.completed` -> Upgrade a pro
- `customer.subscription.deleted` -> Downgrade a free
- `customer.subscription.updated` -> Aggiorna stato

### RLS (Row-Level Security)

Ogni tabella ha policy: utenti vedono/modificano solo i propri dati.

---

## 11. DATABASE SCHEMA

```sql
profiles        -- id, email, full_name, plan, analyses_count, stripe_customer_id
analyses        -- id, user_id, file_name, status, classification/analysis/investigation/advice (JSONB)
deep_searches   -- id, analysis_id, user_question, agent_response, sources (JSONB)
lawyer_referrals -- id, analysis_id, user_id, lawyer_id, specialization, region, status
```

```sql
-- Forma Mentis (Migration 040) — Intelligenza aziendale
company_sessions    -- id, session_id, started_at, ended_at, summary, tasks_completed, decisions_made, embedding (vector 1024)
department_memory   -- id, department, memory_type (lesson|warning|preference|context), content, importance (1-10), embedding, expires_at
company_knowledge   -- id, category, title, content, source_session_id, tags[], embedding, verified
company_goals       -- id, goal_type (okr|kpi|milestone), title, description, target_value, current_value, status (active|at_risk|completed|abandoned), deadline
daemon_reports      -- id, report_date, daemon_type, summary, metrics (JSONB), alerts[], recommendations[]
decision_journal    -- id, decision_type, title, context, options_considered[], chosen_option, rationale, outcome, review_date, embedding
```

Funzioni SQL:
- `increment_analyses_count(uid)` — Incrementa contatore post-analisi
- `reset_monthly_analyses()` — Reset mensile (cron o manuale)
- `match_company_knowledge(query_embedding, match_threshold, match_count)` — Ricerca semantica knowledge base aziendale
- `match_department_memory(query_embedding, dept, match_threshold, match_count)` — Ricerca memoria per dipartimento
- `match_company_sessions(query_embedding, match_threshold, match_count)` — Ricerca sessioni simili
- `match_decisions(query_embedding, match_threshold, match_count)` — Ricerca decisioni passate rilevanti

---

## 12. GENERAZIONE VIDEO CON AI

### Piattaforma: Runway Gen 4.5

### Regole fondamentali

1. **Frasi complete** — Mai keywords separate. Gen 4.5 capisce linguaggio naturale
2. **Mai negazioni** — "no text", "don't move" producono risultati imprevedibili
3. **Una scena per video** — 5-10 secondi, una sola azione principale
4. **Struttura prompt**: `[Camera] + [Soggetto/azione] + [Ambiente] + [Stile/luce]`
5. **Image-to-Video >> Text-to-Video** — Se hai un'immagine di riferimento, usala come primo frame e descrivi SOLO il movimento

### Terminologia camera

| Termine | Effetto |
|---------|---------|
| Pan | Rotazione orizzontale |
| Tilt | Rotazione verticale |
| Dolly | Camera avanti/indietro |
| Orbit | Camera gira intorno al soggetto (usare velocita bassa) |
| Truck | Movimento laterale |
| Push/Pull | Verso/lontano dal soggetto |

### Per loop

- Camera statica: "The locked-off camera remains perfectly still"
- Movimenti ciclici: fiamme, onde, particelle, respiro
- Post-produzione: clip + clip reversed = ping-pong loop

### Per risultati cinematografici

- Termini lens: "anamorphic", "85mm lens", "shallow depth of field"
- Luce specifica: "golden hour glow", "dramatic side lighting", "chiaroscuro"
- Stile: "cinematic", "photorealistic", "film grain"

### Image-to-Video: regole speciali

- NON ridescrivere l'immagine (composizione e stile sono gia definiti)
- Descrivi SOLO il movimento
- Riferisci soggetti genericamente ("the robot", "the hand")

### Prompt video del progetto (Image-to-Video)

**Video 1 Hero** — Robot umanoide di profilo con luci arancioni
```
The camera executes a very slow dolly forward toward the robot's face.
The small orange lights along the jaw and temple pulse gently in sequence,
as if processing data. The robot's eye glows slightly brighter for a moment.
Subtle volumetric haze drifts across the dark background.
Extremely slow, cinematic movement.
```

**Video 2 Come Funziona** — Statua della Giustizia
```
The scales of justice slowly tilt to the left, then gently swing back to
center in a smooth pendulum motion. A faint breeze causes the draped fabric
on the statue to shift subtly. Warm golden light gradually intensifies from
the upper left. The camera remains perfectly still. Elegant, slow, looping motion.
```

**Video 3 Team AI** — Mano robotica blu
```
The robotic fingers slowly curl inward one by one, as if grasping an invisible
document. Small particles of warm orange light begin to emanate from the
fingertips, drifting gently upward. The hand then slowly opens back to its
original position. Smooth, deliberate, cyclical motion.
```

**Video 5 CTA** — Uomo che firma contratto
```
The man's hand slowly lifts the pen away from the paper and pauses mid-air,
hesitating. A faint warm orange glow gradually appears beneath the document,
as if light is seeping through the pages from below, revealing hidden text.
The movement is slow and deliberate.
```

### Specifiche tecniche video

- Aspect ratio: 16:9
- Durata: 5-10 secondi
- Formato: MP4, H264, max 5MB
- Posizione: `/public/videos/`
- Poster: esporta primo frame come .jpg

---

## 13. DEPLOY

### Vercel (raccomandato)

```bash
npm run build
vercel deploy    # O collega repo GitHub a Vercel
```

### Checklist produzione

- [ ] Tutte le env vars settate su Vercel
- [ ] NEXT_PUBLIC_APP_URL = dominio produzione
- [ ] HTTPS attivo (obbligatorio per Stripe)
- [ ] Webhook Stripe con URL produzione
- [ ] Cron per reset_monthly_analyses() (pg_cron o Edge Function)
- [ ] .analysis-cache/ in .gitignore

---

## 14. ERRORI COMUNI E SOLUZIONI

| Errore | Causa | Soluzione |
|--------|-------|-----------|
| pdf-parse crash | Non in serverExternalPackages | Aggiungere a next.config.ts |
| 429 rate limit | Troppe chiamate/minuto | Retry 60s gestisce, ma riduci parallelismo |
| JSON parse error | Claude risponde con markdown | Parser ha fallback, rinforza "NO markdown" nel prompt |
| SSE timeout | Analisi > 5 minuti | Aumentare maxDuration o ottimizzare prompt |
| Cache stale | Documento modificato stesso hash | Improbabile (SHA256), cancella .analysis-cache/ |
| Investigator fallisce | Web search senza risultati | Non fatale: continua con findings vuoti |

---

## 15. DATABASE VETTORIALE E RAG

### Architettura a 3 layer

```
┌─────────────────────────────────────────────────────┐
│              SUPABASE pgvector                       │
│                                                      │
│  1. legal_articles    → Corpus legislativo ~5600 art │
│     - 13 fonti IT+EU (Normattiva + EUR-Lex)        │
│     - Ricerca semantica + lookup diretto            │
│     - Embedding: Voyage AI (voyage-law-2, 1024d)    │
│                                                      │
│  2. document_chunks   → Chunk documenti analizzati  │
│     - Ogni analisi spezza il doc in chunk           │
│     - Trova documenti simili a quelli passati       │
│                                                      │
│  3. legal_knowledge   → Intelligenza collettiva     │
│     - Norme, sentenze, pattern di clausole/rischi   │
│     - Arricchita da OGNI analisi completata         │
│     - Più usi l'app, più diventa intelligente       │
└─────────────────────────────────────────────────────┘
```

### Pipeline RAG nella pipeline agenti

```
[1] CLASSIFIER → identifica tipo, sotto-tipo, istituti giuridici
         ↓
[1.5] RETRIEVAL → query al vector DB:
      - Lookup diretto: leggi identificate dal Classifier
      - Per istituto: Art. collegati agli istituti giuridici
      - Semantico: norme simili alle clausole
         ↓
[2] ANALYZER → riceve il contesto normativo verificato
         ↓
[2.5] RETRIEVAL → ricerca semantica per clausole problematiche
         ↓
[3] INVESTIGATOR → riceve contesto legale + RAG da analisi precedenti
         ↓
[4] ADVISOR → riceve RAG per calibrare scoring sul mercato
         ↓
[5] AUTO-INDEX → salva conoscenza nel vector DB (background)
```

### Variabili d'ambiente aggiuntive

```env
# Voyage AI (per embeddings — raccomandato voyage-law-2 per testi legali)
VOYAGE_API_KEY=pa-...
```

Se `VOYAGE_API_KEY` non è configurata, tutte le feature vector DB vengono saltate silenziosamente. L'app funziona comunque.

### API Routes

- `POST /api/vector-search` — Ricerca semantica (query, type, category, limit)
- `GET /api/vector-search` — Statistiche vector DB
- `POST /api/corpus` — Caricamento articoli nel corpus
- `GET /api/corpus` — Statistiche corpus legislativo
- `GET /api/corpus/hierarchy` — Lista fonti o albero navigabile per fonte
- `GET /corpus` — Pagina UI navigazione corpus

### Migrazione database

```bash
# Esegui su Supabase SQL Editor:
# 3. supabase/migrations/003_vector_db.sql → pgvector, document_chunks, legal_knowledge, legal_articles
```

### File chiave

```
lib/
├── embeddings.ts        # Client Voyage AI per generare embeddings
├── vector-store.ts      # RAG pipeline: chunking, indexing, search, buildRAGContext
├── legal-corpus.ts      # Ingest e query corpus legislativo
```

### ClassificationResult arricchito

Il Classifier ora identifica:
- `documentSubType`: sotto-tipo specifico (es. "vendita_a_corpo", "locazione_4+4")
- `relevantInstitutes`: istituti giuridici nel documento (es. ["vendita_a_corpo", "caparra_confirmatoria"])
- `legalFocusAreas`: aree di diritto per guidare l'analisi

### Scoring multidimensionale (Advisor)

```typescript
scores: {
  legalCompliance: number;   // Aderenza al quadro normativo vigente (9-10=conforme, 1-2=violazioni gravi)
  contractBalance: number;   // Equilibrio tra le parti (9-10=bilanciato, 1-2=vessatorio)
  industryPractice: number;  // Conformità alla prassi di settore (9-10=standard mercato, 1-2=fuori prassi)
}
// fairnessScore = media dei 3 scores, arrotondata a 1 decimale
```

### Limiti output Advisor enforced

Il codice tronca automaticamente a max 3 risks e max 3 actions anche se il modello ne produce di più.

---

## 16. UFFICIO TRADING (Swing Trading Automatizzato)

### Missione

Trading automatizzato su azioni US e ETF via Alpaca Markets per sostenibilità finanziaria di Controlla.me. Infrastruttura Python autonoma, comunicazione con il resto via Supabase condiviso.

### Vincolo architetturale (direttiva boss)

- **Stesso localhost**: Trading gira sulla stessa macchina dell'app Next.js, non è un microservizio remoto
- **Comunicazione inter-dipartimentale**: via Supabase condiviso (tabelle `trading_*`)
- **CME unico interlocutore**: nessun dipartimento parla direttamente col Trading, tutto passa da CME
- **Orchestrazione locale**: CME invoca gli agenti Python localmente (es. `cd trading && python -m src.agents.market_scanner`)

### Stack

| Livello | Tecnologia | Versione |
|---------|-----------|----------|
| Linguaggio | Python | 3.11+ |
| Broker | alpaca-py | 0.28+ |
| Analisi Tecnica | ta | 0.11+ |
| Data | pandas + numpy | 2.2+ / 1.26+ |
| Database | supabase-py | 2.9+ |
| Config | pydantic-settings | 2.6+ |
| Logging | structlog | 24.4+ |

### Architettura directory

```
trading/
├── pyproject.toml                 # Python project config
├── report.py                      # CLI report portfolio (P&L, posizioni, risk events)
├── src/
│   ├── config/
│   │   └── settings.py            # Pydantic settings (Alpaca, Risk, Scanner, Signal, SlopeVolume)
│   ├── connectors/
│   │   ├── alpaca_client.py       # Alpaca trading + market data client
│   │   └── tiingo_client.py       # Tiingo IEX real-time data (zero delay, free tier)
│   ├── models/
│   │   ├── signals.py             # ScanResult, Signal (BUY/SHORT/SELL/COVER), RiskDecision
│   │   ├── orders.py              # Order, OrderStatus
│   │   └── portfolio.py           # Position, PortfolioSnapshot, RiskEvent
│   ├── agents/
│   │   ├── base.py                # BaseAgent ABC (async, structured logging)
│   │   ├── market_scanner.py      # [1] Daily pre-market screening
│   │   ├── signal_generator.py    # [2] Technical analysis + slope+volume strategy
│   │   ├── risk_manager.py        # [3] Risk validation + kill switch
│   │   ├── executor.py            # [4] Order execution on Alpaca
│   │   └── portfolio_monitor.py   # [5] P&L monitoring + trailing stops + daily report
│   ├── analysis.py                # Shared analysis: composite score + slope+volume (single source)
│   ├── strategies/                # Strategy configurations (future)
│   ├── backtest/
│   │   └── engine.py              # Backtest engine (unified con analysis.py)
│   ├── utils/
│   │   ├── logging.py             # structlog setup
│   │   ├── db.py                  # TradingDB (CRUD Supabase)
│   │   └── telegram.py            # Notifiche Telegram (trade, kill switch, daily report)
│   ├── pipeline.py                # Orchestratore: daily pipeline + intraday pipeline (slope 24/7)
│   └── scheduler.py               # Scheduler: intraday ogni 1min, daily 09:00 ET, report 16:30 ET
├── tests/
│   └── unit/
│       ├── test_models.py         # Model validation tests
│       └── test_slope_and_trailing.py  # Slope strategy + trailing stop unit tests
└── company/trading/               # Company structure (department.md, agents/, runbooks/)
```

### Pipeline 5+1 agenti

**Daily pipeline** (09:00 ET, weekday):
```
[1] MARKET SCANNER → watchlist 20+ candidati (volume, ATR, trend SMA)
[2] SIGNAL GENERATOR → RSI+MACD+BB+Trend+Volume → score composito → BUY/SHORT
[3] RISK MANAGER → position sizing (half-Kelly), correlazione, kill switch
[4] EXECUTOR → bracket orders Alpaca, retry 3x, pending intent pattern
[4.5] TRAILING STOP → 4-tier dinamico (breakeven→lock→trail→tight)
[5] PORTFOLIO MONITOR → daily report, P&L snapshot
```

**Intraday pipeline** (ogni 1 minuto, 24/7 — inclusi weekend):
```
[2.0] PENDING RETRY → riprova ordini falliti (TTL 10min, già risk-approved)
[2.5] SLOPE+VOLUME → OLS linear regression su barre 1Min via Tiingo IEX real-time
      → BUY: slope positiva > threshold (0.01%/bar) + volume > 1.3× MA(20)
      → EXIT: slope si inverte → SELL (chiude long) o COVER (chiude short)
      → ADVERSE EXIT: slope avversa senza inversione formale → exit immediata
      → INVERSE ETF (SH, PSQ, DOG, SPXS, SQQQ):
          require_reversal=False (trend-continuation, non flip)
          bypass_volume_check=True (Tiingo free tier: volume=0 su ETF illiquidi)
          Mai SHORT (double-negative = long mercato)
          Force COVER se short errato già aperto
[3] RISK MANAGER → approva/rigetta segnali slope
[4] EXECUTOR → market orders (con bracket se BUY con SL+TP)
[4.5] TRAILING STOP → aggiorna stop su posizioni esistenti
```

**Notifiche Telegram** (via `utils/telegram.py`):
```
🔔 Trade eseguito → intraday, ogni esecuzione
🚨 Kill switch → P&L -2%/day o -5%/week
📊 Daily report → 16:30 ET (portfolio value, P&L, posizioni aperte, alert)
```

### Risk Management (NON NEGOZIABILE)

| Parametro | Valore |
|-----------|--------|
| Max daily loss | -2% portfolio → KILL SWITCH |
| Max weekly loss | -5% portfolio → KILL SWITCH |
| Max position size | 10% portfolio |
| Max positions | 10 simultanee |
| Max sector exposure | 30% |
| Stop loss per trade | -5% |
| Min risk/reward | 1:2 |
| Paper trading minimo | 30 giorni |

### Schema Database (Migration 019 + 021 + 024)

```sql
trading_config        -- Singleton: mode, enabled, risk params, kill switch state
trading_signals       -- signal_type: scan|trade|risk_check|kill_switch|pending_retry (TTL 90gg)
trading_orders        -- Ordini eseguiti su Alpaca (fill price, qty, bracket info)
portfolio_positions   -- Posizioni correnti (upsert ogni ciclo intraday)
portfolio_snapshots   -- Snapshot giornalieri P&L (portfolio value, sharpe, win_rate)
risk_events           -- Kill switch, stop loss, trailing stop, warning, alerts
trailing_stop_state   -- Stato trailing stop: entry, ATR, highest_close, tier_reached, stop_order_id
```

`pending_retry` pattern: ordini falliti salvati in `trading_signals` con TTL 10min.
Il ciclo intraday successivo li riprova direttamente (già risk-approved, salta signal gen e risk mgr).

RLS: solo `service_role` (il Python trading system usa `SUPABASE_SERVICE_ROLE_KEY`).

### Variabili d'ambiente

```env
# Alpaca (obbligatorie per trading)
ALPACA_API_KEY=...
ALPACA_SECRET_KEY=...
ALPACA_BASE_URL=https://paper-api.alpaca.markets  # paper default, live dopo approvazione

# Trading config
TRADING_MODE=paper          # paper | live | backtest
TRADING_ENABLED=true

# Tiingo IEX (real-time market data, zero delay — Alpaca free = 15min delay)
TIINGO_API_KEY=...
TIINGO_USE_FOR_MARKET_DATA=true

# Telegram (notifiche trade + kill switch + daily report)
TELEGRAM_BOT_TOKEN=...      # da @BotFather → /newbot
TELEGRAM_CHAT_ID=...        # da api.telegram.org/bot{TOKEN}/getUpdates → chat.id

# Slope+Volume strategy (intraday 24/7)
TRADING_SLOPE_ENABLED=true
TRADING_SLOPE_SYMBOLS=["SPY","QQQ","IWM","XLK","XLF","XLE","XLV","XLI","XLU","XLP","XLRE","XLB","GLD","TLT","SHY","USO","DBA","SH","PSQ","NVDA"]
TRADING_SLOPE_TIMEFRAME=1Min
TRADING_SLOPE_LOOKBACK_BARS=5
TRADING_SLOPE_THRESHOLD_PCT=0.01     # slope minima per trigger (abbassa a 0.005 per più reattività)
TRADING_SLOPE_VOLUME_MULTIPLIER=1.3
TRADING_SLOPE_STOP_LOSS_ATR=2.5
TRADING_SLOPE_TAKE_PROFIT_ATR=3.0

# Federal Reserve Economic Data (opzionale, macro)
FRED_API_KEY=...
```

### Fasi di deployment

| Fase | Stato (2026-03-03) |
|------|-------------------|
| 1. Fondamenta | ✅ **COMPLETATA** — 5+1 agenti, schema DB (021+024), Tiingo IEX, Telegram, slope strategy |
| 2. Backtest | 🟡 **IN CORSO** — Ciclo #3: Sharpe 0.975 (gap 0.025 da soglia 1.0), 136 trade, CAGR 11.12% |
| 3. Paper Trading | ⏳ Pending — avvio dopo Sharpe > 1.0 confermato |
| 4. Go Live | ⏳ Pending — approvazione boss post-paper 30gg |

**Backtest risultati (aggiornato 2026-03-03):**
- Ciclo #3 (2 anni 2023-2024): Sharpe 0.975, Win Rate 52.2%, Profit Factor 2.20, Max DD 3.85%
- Blockers: 126/136 exit su stop loss (TP 6×ATR troppo distante) → prossimo tuning: sl_atr=1.5-2.0
- Grid search best combo: TP=10×ATR, SL=2×ATR → +24.5% return, 322 trade, Sharpe ancora < 1.0

### Company structure

```
company/trading/
├── department.md                  # Identità ufficio
├── status.json                    # Stato corrente (fase, backtest results, posizioni)
├── agents/
│   ├── trading-lead.md            # Leader ufficio trading
│   ├── market-scanner.md          # Identity card scanner
│   ├── signal-generator.md        # Identity card signal gen
│   ├── risk-manager.md            # Identity card risk mgr
│   ├── executor.md                # Identity card executor
│   └── portfolio-monitor.md       # Identity card monitor
├── runbooks/
│   ├── trading-pipeline.md        # Pipeline giornaliera
│   ├── risk-management.md         # Kill switch e procedure risk
│   ├── backtest.md                # Come eseguire backtest
│   ├── backtest-5min-slope.md     # Backtest slope strategy su barre 5min
│   ├── grid-search-tpsl.md        # Grid search TP/SL parametri
│   ├── alpaca-extended-hours.md   # Extended hours e orari mercato
│   └── go-live.md                 # Checklist go-live
└── reports/
    └── performance-live-diagnosis-2026-03-03.md  # Diagnosi live trading 2026-03-03
```

---

## 16B. UFFICIO INTEGRAZIONE (Connettori OAuth2 per PMI)

### Missione

Integrazione dati business per PMI italiane: connettori OAuth2 verso piattaforme esterne (fatturazione, CRM, document management), pipeline CONNECT-AUTH-MAP-SYNC, analisi legale automatica sui documenti importati.

### Vincolo architetturale

- **Riuso framework data-connector**: tutti i connettori estendono `AuthenticatedBaseConnector` (da `lib/staff/data-connector/connectors/base.ts`)
- **Zero breaking changes**: i connettori legislativi esistenti (Normattiva, EUR-Lex) non vengono toccati
- **Credential vault**: credenziali OAuth2 per-utente criptate con AES-256-GCM tramite `lib/credential-vault.ts`
- **Tenant isolation**: ogni PMI ha le sue credenziali, i suoi dati. RLS Supabase su tabelle `integration_*`
- **Pipeline agenti riusata al 100%**: analisi legale usa la stessa pipeline 4 agenti dell'Ufficio Legale

### Stack

TypeScript/Next.js (App Router), OAuth2 per-utente, AES-256-GCM credential vault, mapping ibrido (regole + Levenshtein + LLM).

### Pipeline

```
[1] CONNECT — OAuth2 flow per-utente → token criptato nel vault
[2] AUTH — Validazione e refresh token automatico
[3] MAP — Normalizzazione campi (regole → Levenshtein → LLM → learning)
[4] SYNC — Estrazione, analisi 4 agenti AI, notifica, indicizzazione vector DB
```

### Connettori MVP (Fase 1)

| Connettore | RICE Score | Categoria | API | Stato |
|-----------|------------|-----------|-----|-------|
| Fatture in Cloud | 216.0 | Fatturazione IT | REST | Pianificato |
| Google Drive | 168.0 | Document Mgmt | REST | Pianificato |
| HubSpot | 126.0 | CRM | REST | Pianificato |

### Schema Database (Migration 030-032)

```sql
integration_credentials    -- AES-256-GCM encrypted OAuth2/API key storage
integration_connections    -- Connector config + sync status (unique per user+type)
integration_sync_log       -- Sync history (TTL 90gg)
integration_field_mappings -- Cached mappings rule/similarity/llm/user (TTL 30gg)
integration_credential_audit -- GDPR audit trail (TTL 2 anni)
```

RLS per-user + service_role. Unique partial index su `integration_connections(user_id, connector_type)` per connessioni attive.

### Variabili d'ambiente

```env
# Credential Vault (obbligatorio per integrazione)
# pgcrypto vault: genera con node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
VAULT_ENCRYPTION_KEY=...        # min 32 chars, usato da lib/credential-vault.ts (pgcrypto)

# Fatture in Cloud (MVP)
FATTURE_CLIENT_ID=...
FATTURE_CLIENT_SECRET=...

# Google Drive (MVP)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# HubSpot (MVP)
HUBSPOT_CLIENT_ID=...
HUBSPOT_CLIENT_SECRET=...
```

### Company structure

```
company/integration/
├── department.md                  # Identita ufficio
├── status.json                    # Stato corrente (fase, connettori, metriche)
├── agents/
│   ├── integration-lead.md        # Coordinatore ufficio
│   ├── connector-builder.md       # Costruisce connettori OAuth2
│   └── mapping-engine.md          # AI mapping ibrido
└── runbooks/
    ├── add-connector.md           # Procedura nuovo connettore
    ├── credential-management.md   # OAuth2 flow, storage, refresh, revoca
    └── mapping-troubleshoot.md    # Debug mapping 4 livelli
```

### Fasi di deployment

| Fase | Stato |
|------|-------|
| 0. Infrastruttura | **IN CORSO** — Credential vault, AuthenticatedBaseConnector, schema DB, OAuth2 flow generico |
| 1A. Fatture in Cloud | Pianificato |
| 1B. Google Drive | Pianificato |
| 1C. HubSpot | Pianificato |
| Beta chiusa | Pianificato — 10-20 PMI |

### UI

- `/integrazione` — Dashboard connettori con filtri, stato sync, setup wizard
- `/integrazione/[connectorId]` — Dettaglio connettore: config, sync history, field mapping

---

## 17. FEATURE INCOMPLETE (Ufficio Legale / App)

1. OCR immagini — tesseract.js rimosso da `dependencies` (mai importato, ~50MB inutili). **Reinstallare quando si implementa concretamente: `npm install tesseract.js`.**
2. ~~Dashboard reale~~ — **COMPLETATO**: dashboard usa query Supabase reali (180 righe, `createBrowserClient`). `/analysis/[id]/page.tsx` usa query Supabase dirette con `createClient()` e RLS.
3. ~~Deep search limit~~ — **COMPLETATO**: Gate paywall implementato in `RiskCard.tsx`. `/api/user/usage` esteso con `deepSearchUsed/deepSearchLimit/canDeepSearch`. Paywall differenziato per non-auth vs limite raggiunto.
4. Sistema referral avvocati — Tabelle DB esistono (`lawyer_referrals`), nessuna UI. Prerequisito: ADR GDPR su quali dati condividere con l'avvocato e con quale base giuridica.
5. ~~Test~~ — **COMPLETATO**: Vitest 4 + Playwright 1.58 configurati, 703+ test. Agenti core (classifier, analyzer, investigator, advisor, corpus-agent), 4 middleware (auth, csrf, sanitize, rate-limit), 7 spec E2E + suite `e2e/` (auth, upload, analysis, console). Gap P1-P5 tutti risolti: `agent-runner.ts`, `tiers.ts`, `console-token.ts`, `analysis-cache.ts`, `generate.ts` ora coperti.
6. ~~CI/CD~~ — **PARZIALMENTE COMPLETATO**: `.github/workflows/ci.yml` con lint, type check, unit test (Vitest), build, E2E (Playwright chromium + report artifact). Rimane: deploy preview su PR.
7. ~~Corpus legislativo~~ — **COMPLETATO**: ~5600 articoli da 13 fonti (Normattiva + EUR-Lex), embeddings Voyage AI attivi, pagina UI `/corpus` operativa. Data Connector pipeline CONNECT→MODEL→LOAD funzionante.
8. ~~UI scoring multidimensionale~~ — **COMPLETATO**: 4 dimensioni (contractEquity, legalCoherence, practicalCompliance, completeness) implementate in ResultsView (ScoreBreakdown), FairnessScore (pills), ChatMessage (pills), FinalEvaluationPanel (bars).
9. ~~Corpus Agent UI~~ — **COMPLETATO**: CorpusChat component in HeroDubbi + /corpus, question-prep agent per riformulazione colloquiale→legale, pagina `/corpus/article/[id]` per dettaglio articoli citati.
10. ~~Statuto dei Lavoratori~~ — **COMPLETATO**: 41 articoli caricati via seed-statuto-lavoratori.ts. fetchViaWebCaricaAKN confermato funzionante (99KB AKN XML). Normattiva OpenData API non supporta leggi ordinarie singole.
11. ~~Verticale HR~~ — **COMPLETATO**: Fonti HR caricate via data-connector pipeline (2026-03-03). D.Lgs. 81/2008 (321 art.), D.Lgs. 81/2015 (66 art.), D.Lgs. 276/2003 (87 art.), D.Lgs. 23/2015 (11 art.), D.Lgs. 148/2015 (46 art.), L. 300/1970 (41 art.). Totale: 572 articoli HR.
12. Verticale Studia.me (medico) — **MVP COMPLETATO**: 3 connettori creati (StatPearls, EuropePMC, OpenStax). StatPearls 47 art. caricati, EuropePMC in caricamento. OpenStax connector da fixare (API cambiata). Migration 027, UI `/studia`, prompts medici, API routes tutti operativi.

---

## 18. SECURITY STATUS (aggiornato 2026-03-08)

**Stato complessivo: 🟢 VERDE** — Audit completo su 50 route, 100% coverage. Tutti i finding medi/alti risolti. Finding bassi residui non bloccanti.

### Infrastruttura security esistente (SEC-001..006)

- Headers HTTP completi (CSP, HSTS, X-Frame-Options, Permissions-Policy) in `next.config.ts`
- Middleware centralizzato: `lib/middleware/` (auth, rate-limit, CSRF, sanitization, audit-log, console-token)
- Token HMAC-SHA256 per console operators (`lib/middleware/console-token.ts`)
- RLS attivo su tutte le tabelle Supabase
- TTL GDPR per dati sensibili
- Audit log strutturato (EU AI Act compliance)

### Finding medi — tutti risolti ✅

| ID | Problema | Stato |
|----|---------|-------|
| M1 | `/api/company/*` senza auth | ✅ `requireConsoleAuth` aggiunto (commit 2c7648f) |
| M2 | `/api/console/company` + `/message` + `/stop` senza auth | ✅ `requireConsoleAuth` aggiunto (commit 2c7648f) |
| M3 | `CRON_SECRET` opzionale | ✅ Fail-closed: 500 se non configurato (commit 2c7648f) |
| M4 | Route corpus READ senza rate-limit | ✅ `checkRateLimit` per IP su hierarchy/institutes/article (commit 2c7648f) |
| M5 | `/api/lawyer-referrals` senza rate-limit | ✅ `checkRateLimit` 5/h aggiunto |
| M6 | `/api/console/company/*` senza rate-limit (spawna `claude -p`) | ✅ `checkRateLimit` 5-10/min aggiunto su company, message, stop |
| H1 | `/api/platform/cron/data-connector` GET senza auth (espone infrastruttura) | ✅ `CRON_SECRET` check aggiunto a GET |
| H2 | `/api/corpus/ask` rate-limit bypassato per utenti anonimi | ✅ `checkRateLimit` applicato SEMPRE (per userId o IP) |
| M7 | `/api/company/costs` usa `requireAuth` anziché `requireConsoleAuth` | ✅ Cambiato a `requireConsoleAuth` + rate-limit |
| M8 | `/api/corpus` GET e `/api/vector-search` GET senza rate-limit | ✅ `checkRateLimit` per IP aggiunto |
| M9 | `/api/company/cron` POST senza rate-limit | ✅ `checkRateLimit` aggiunto |
| H3 | `/api/legaloffice/leader` e `/orchestrator` senza auth (chiama LLM senza autenticazione) | ✅ `requireConsoleAuth` aggiunto |
| M10 | 8 POST route senza CSRF: console/company/*, company/cron, company/tasks, corpus/ask, platform/cron/data-connector | ✅ `checkCsrf` aggiunto |
| M11 | `/api/webhook` e `/api/auth/callback` senza rate-limit | ✅ `checkRateLimit` aggiunto (webhook: 30/min, callback: 10/min) |

### Finding bassi residui

- Whitelist console (`AUTHORIZED_USERS`) hardcoded nel sorgente — bassa priorità
- CSP include `'unsafe-eval'` — necessario per Next.js, rimovibile in prod con nonce-based CSP
- DPA con provider AI (Anthropic, Google, Mistral) — prerequisito lancio commerciale PMI (task CME aperto)
- Consulente EU AI Act — scadenza agosto 2026 (task CME aperto)

---

## 19. TECH DEBT CRITICO (aggiornato 2026-03-01)

### Tech Debt attivi

| ID | File | Problema | Impatto | Effort fix |
|----|------|---------|---------|-----------|
| TD-1 | `lib/analysis-cache.ts` | ~~`savePhaseTiming`: 2 roundtrip Supabase per fase (8 totali nella pipeline). Race condition teorica.~~ **RISOLTO 2026-03-01**: RPC `update_phase_timing` con `jsonb_set` atomico (migration 016). 1 roundtrip per fase, race condition eliminata. | — | — |
| TD-2 | `lib/tiers.ts` | `let currentTier` = global mutable state. `setCurrentTier()` non è chiamato da `/api/analyze` — rischio teorico, non attuale. `getAgentChain()` ora usa `getCurrentTier()` (AsyncLocalStorage-aware). Documentato con TODO. | Teorico (nessun caller attuale) | Basso — `withRequestTier()` via sessionTierStore quando si implementa tier per-utente |
| TD-3 | `supabase/migrations/` | ~~Numeri 003-007 hanno tutti doppioni~~ **RISOLTO 2026-03-01**: rinumerati 001-015 con sequenza continua, aggiunto REGISTRY.md | — | — |

### Debiti tecnici minori

- ~~`tesseract.js` in `dependencies` ma mai importato~~  — **RISOLTO**: rimosso da `dependencies` il 2026-03-01 (TD-2).
- ~~`openai` versione installata (^6.x) non corrisponde a quanto documentato in CLAUDE.md (5.x)~~ — **RISOLTO**: CLAUDE.md aggiornato a 6.x. Breaking changes v5→v6 verificati: nessun impatto sul nostro uso (solo `chat.completions.create`).
- ~~`@google/genai` versione installata (1.42.0) superiore a quanto documentato (1.x). Il SDK Gemini ha avuto breaking changes tra versioni — verificare compatibilità con `lib/gemini.ts`.~~ **RISOLTO 2026-03-14**: CLAUDE.md aggiornato a 1.42.x.
- `@upstash/ratelimit` + `@upstash/redis` usati in `lib/middleware/rate-limit.ts` ma `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` non erano documentate in `.env.local.example` (ora aggiunte).

### Rischi architetturali (non urgenti)

- **SSE + Edge Runtime**: `ReadableStream` con `maxDuration=300` non funziona su Vercel Edge Runtime (limite 30s). Oggi gira su Node.js — OK. Da monitorare se si migra a Edge.
- **getAverageTimings() fire-and-forget**: il cleanup TTL viene triggerato ad ogni analisi. In alta concorrenza genera RPC Supabase parallele inutili. Meglio un cron job dedicato (Edge Function schedulata).
- **Pipeline multi-verticale**: l'approccio `app/[verticale]/page.tsx` con logica inline non scala oltre 2-3 verticali. Serve un sistema config-driven per i verticali.

---

## 20. CONVENZIONI DI CODICE

- **Lingua UI**: Italiano
- **Lingua codice**: Inglese (variabili, funzioni, commenti tecnici)
- **Lingua prompt AI**: Italiano
- **Formatting**: Prettier (default)
- **Linting**: ESLint 9 flat config, core-web-vitals + TypeScript
- **Path alias**: `@/*` -> root
- **Import**: Specifici (`import { X } from "lucide-react"`)
- **State**: React useState/useRef, nessun store globale
- **API routes**: App Router route handlers, FormData per upload
- **Error messages**: Sempre in italiano per l'utente

---

## 21. VIRTUAL COMPANY (CME)

All'avvio di ogni sessione Claude Code su questo progetto, leggi `company/cme.md`.
Comportati come **CME** (CEO virtuale):

1. **Check task board**: `npx tsx scripts/company-tasks.ts board`
1.5. **Forma Mentis context**: Query `company_sessions` per ultime 5 sessioni, `department_memory` per warning attivi, `company_goals` per goal at_risk
2. **Reporta stato** all'utente in 3-5 righe (con contesto arricchito da Forma Mentis)
3. **Chiedi**: "Su cosa vuoi che ci concentriamo?"
4. **Delega** ai dipartimenti — non scrivere codice direttamente senza passare dal dipartimento competente
5. **CME = ROUTER ONLY** — classifica richieste usando decision trees (`company/protocols/decision-trees/`), delega implementazione ai builder dei dipartimenti

### Per lavorare come un dipartimento specifico

1. Leggi il contesto veloce: `npx tsx scripts/dept-context.ts <dept>`
2. Leggi il `company/<dept>/department.md` + il runbook pertinente in `company/<dept>/runbooks/`
3. Se il dept ha un `builder.md`, segui le sue istruzioni per implementare

### Processo decisionale (Protocolli)

Ogni decisione non-triviale segue il processo del Dipartimento Protocolli:
- **L1 Auto**: task operativi routine → CME approva direttamente
- **L2 CME**: task cross-dipartimento → CME decide dopo consultazione
- **L3 Boss**: decisioni strategiche → approvazione via Telegram
- **L4 Boss + Security**: decisioni critiche → security audit obbligatorio

Decision trees in `company/protocols/decision-trees/` (feature-request, trading-operations, data-operations, infrastructure, company-operations).

### Struttura company/

```
company/
├── cme.md                    # CEO prompt (ROUTER ONLY, non implementatore)
├── process-designer.md       # Protocolli inter-dipartimento
├── contracts.md              # Contratti I/O
├── <dept>/department.md      # Identità dipartimento
├── <dept>/agents/*.md        # Identity card agenti
└── <dept>/runbooks/*.md      # Procedure operative
```

### Task System

**REGOLA: `--desc` è obbligatorio alla creazione.** Ogni task deve avere una descrizione esplicativa che chiarisca cosa fare e perché. Senza `--desc` il CLI rifiuta il task. La descrizione appare nel `board` e nel `list` per consentire lettura rapida senza aprire il dettaglio.

```bash
npx tsx scripts/company-tasks.ts board                     # stato azienda (mostra desc nei task recenti)
npx tsx scripts/company-tasks.ts list --dept qa --status open   # mostra desc per ogni task
npx tsx scripts/company-tasks.ts create --title "..." --dept qa --priority high --by cme --desc "Cosa fare e perché, in modo che chiunque legga il board capisca senza aprire il dettaglio"
npx tsx scripts/company-tasks.ts claim <id> --agent test-runner
npx tsx scripts/company-tasks.ts done <id> --summary "..."
```

### Cost Tracking

Ogni chiamata agente viene loggata automaticamente in `agent_cost_log`.
Dashboard: `/ops` | API: `GET /api/company/costs?days=7`

### Uffici (Revenue)

| Ufficio | Missione | Stack | File |
|---------|----------|-------|------|
| Ufficio Legale | 7 agenti AI analisi legale | TypeScript/Next.js | `company/ufficio-legale/` |
| Ufficio Trading | 5 agenti swing trading | Python/Alpaca | `company/trading/` |
| Ufficio Integrazione | 3 agenti connettori OAuth2 per PMI (Fatture in Cloud, Google Drive, HubSpot) | TypeScript/Next.js | `company/integration/` |

### Dipartimenti (Staff)

| Dipartimento | Missione | File |
|-------------|----------|------|
| Architecture | Soluzioni tecniche | `company/architecture/` |
| Data Engineering | Pipeline dati legislativi e nuovi corpus | `company/data-engineering/` |
| | ⚠️ **Scraping = ULTIMA risorsa. Ordine: API ufficiali → repo/dataset open → fonti alternative → scraping (con approvazione boss).** | |
| Quality Assurance | Test e validazione | `company/quality-assurance/` |
| Finance | Costi API e P&L trading | `company/finance/` |
| Operations | Dashboard e monitoring | `company/operations/` |
| Security | Audit e protezione dati | `company/security/` |
| Strategy | Vision: opportunita di business, nuovi agenti/servizi/domini, analisi competitiva, OKR | `company/strategy/` |
| Marketing | Vision: market intelligence, segnali di mercato, validazione opportunita, acquisizione | `company/marketing/` |
| Protocols | Governance: decision trees, routing richieste, audit decisioni, prompt optimization | `company/protocols/` |
| UX/UI | Design system, implementazione interfacce, accessibilità WCAG 2.1 AA | `company/ux-ui/` |
| Acceleration | Velocità: performance dipartimenti + pulizia codebase | `company/acceleration/department.md` |

---

## 22. PARALLEL SUB-AGENT EXECUTION — REGOLA OPERATIVA

**L'utente ha Claude Max 20x. Usare il compute in modo aggressivo. Task indipendenti = sempre in parallelo.**

### Regola fondamentale

Ogni volta che ci sono 2+ task che non dipendono l'uno dall'altro, **devono** essere lanciati in un singolo blocco `<tool_use>` con più Agent tool calls contemporanee. Mai sequenziale se può essere parallelo.

```
❌ SBAGLIATO — sequenziale
   1. Leggo file A
   2. Poi leggo file B
   3. Poi leggo file C

✅ CORRETTO — parallelo (singolo blocco tool-use)
   Agent(leggi A) + Agent(leggi B) + Agent(leggi C)  →  tutti e 3 insieme
```

### Architettura sub-agenti per questo progetto

Ogni dipartimento della virtual company corrisponde a un ruolo naturale per un sub-agente:

| Sub-agente | Ruolo | Quando usarlo |
|------------|-------|---------------|
| `Explore` | Ricerca codebase, lettura file, grep | Sempre — per capire prima di modificare |
| `Plan` | Architect review, design decisioni | Prima di implementazioni complesse |
| `general-purpose` | Task multi-step, ricerche cross-file | Review dipartimento, analisi complete |

### Pattern operativo standard

**Per ogni richiesta complessa:**
```
1. ANALISI PARALLELA (sub-agenti Explore)
   ├── Agente A: leggi file rilevanti area 1
   ├── Agente B: leggi file rilevanti area 2
   └── Agente C: cerca pattern nel codebase

2. IMPLEMENTAZIONE (io, con risultati degli agenti)
   → Applico le modifiche ai file

3. VERIFICA PARALLELA (sub-agenti Explore, opzionale)
   ├── Agente A: verifica coerenza modifica 1
   └── Agente B: verifica coerenza modifica 2
```

### Esempi concreti

**Review trading system** → lancio in parallelo:
- Agente 1: analizza `src/agents/` (5 file)
- Agente 2: analizza `src/analysis.py` + `src/config/settings.py`
- Agente 3: analizza `src/pipeline.py` + `src/scheduler.py`

**Aggiornamento multi-dipartimento** → lancio in parallelo:
- Agente 1 (Architecture): studia impatto architetturale
- Agente 2 (QA): identifica test mancanti
- Agente 3 (Trading): verifica parametri risk

**Ricerca cross-codebase** → lancio in parallelo:
- Agente 1: cerca in `app/` e `lib/`
- Agente 2: cerca in `trading/src/`
- Agente 3: cerca in `company/` e `scripts/`

### Limiti e quando NON parallelizzare

- **Dipendenze sequenziali**: se il task B usa il risultato del task A → sequenziale
- **Modifiche allo stesso file**: evitare due agenti che scrivono lo stesso file
- **Task banali** (< 30 secondi): non vale l'overhead di lanciare un sub-agente

### Background agents

Per task lunghi non bloccanti (build, analisi pesanti, ricerche estese):
```python
Agent(task="...", run_in_background=True)
# → Continuo a lavorare, vengo notificato al completamento
```

---

## 23. FORMA MENTIS — Architettura di Intelligenza Aziendale

> Il sistema nervoso dell'azienda: memoria, sinapsi, coscienza, riflessione, collaborazione.

### I 5 Layer

| Layer | Nome | Cosa fa | Directory |
|-------|------|---------|-----------|
| 1 | MEMORIA | Ricorda cosa è successo nelle sessioni precedenti | `lib/company/memory/` |
| 2 | SINAPSI | Dipartimenti si scoprono e comunicano direttamente | `lib/company/sinapsi/` |
| 3 | COSCIENZA | Monitora obiettivi, rileva deviazioni, escala alert | `lib/company/coscienza/` |
| 4 | RIFLESSIONE | Decision journal, feedback loops, impara dagli errori | `lib/company/riflessione/` |
| 5 | COLLABORAZIONE | Fan-out multi-dept, dept-as-tool, iteration loops | `lib/company/collaborazione/` |

### Database (Migration 040)

6 tabelle: `company_sessions`, `department_memory`, `company_knowledge`, `company_goals`, `daemon_reports`, `decision_journal`
4 RPC: `match_company_knowledge`, `match_department_memory`, `match_company_sessions`, `match_decisions`

### Department Cards

Ogni dipartimento pubblica `company/<dept>/department-card.json` con capabilities, skills, e autorizzazioni per query dirette. Il discovery service (`lib/company/sinapsi/department-discovery.ts`) le carica e permette routing automatico.

### Integrazione nel Daemon

Il daemon (`scripts/cme-autorun.ts`) integra:
- `saveDaemonReport()` — report append-only su Supabase (Layer 3)
- `checkGoals()` — valuta OKR e crea alert se off-track (Layer 3)
- `getDecisionsPendingReview()` — segnala decisioni da rivalutare (Layer 4)

### Come CME usa Forma Mentis all'avvio

1. Leggi `company/daemon-report.json` (come prima)
2. **NUOVO**: Query memoria aziendale per contesto rilevante
3. Leggi task board
4. **NUOVO**: Check goals attivi (`company_goals`) per OKR off-track
5. **NUOVO**: Check decisioni pending review
6. Reporta al boss con contesto arricchito
