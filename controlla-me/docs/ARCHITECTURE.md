# Controlla.me — Architettura, Fragilita e Roadmap

> Documento generato il 2026-02-24. Analisi completa del codebase attuale con
> identificazione dei punti di fragilita, proposte di hardening e design del
> nuovo sistema di agenti modulari (incluso il **Connect Agent**).

---

## Indice

1. [Architettura Corrente](#1-architettura-corrente)
2. [Mappa delle Fragilita](#2-mappa-delle-fragilita)
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
│  /api/session/[id]      │
│  /api/stripe/*          │
│  /api/webhook           │
│  /api/user/usage        │
│  /api/auth/callback     │
│  /api/vector-search     │
└─────────┬───────────────┘
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
│   VOYAGE AI     │ │  │ lawyer_referrals             │  │
│   Embeddings    │ │  │ document_chunks (vector)     │  │
│   voyage-law-2  │ │  │ legal_knowledge (vector)     │  │
│   1024 dims     │ │  │ legal_articles (vector)      │  │
└─────────────────┘ │  └──────────────────────────────┘  │
                    │  RLS attivo su tutte le tabelle     │
┌─────────────────┐ └────────────────────────────────────┘
│     STRIPE      │
│  Subscriptions  │
│  One-time pay   │
│  Webhooks       │
└─────────────────┘
```

### 1.2 Flusso di Analisi Completo

```
Utente carica documento (PDF/DOCX/TXT)
        │
        ▼
[POST /api/analyze] ─── SSE Stream ───▶ Frontend (progress bar)
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

---

## 2. Mappa delle Fragilita

### 2.1 SUPABASE — Single Point of Failure

| Problema | Severita | File coinvolti |
|----------|----------|----------------|
| **Supabase gestisce TUTTO**: auth, data, vectors, RLS, functions | CRITICA | Tutti i `lib/supabase/*` |
| **Nessun connection pooling** visibile — un picco di utenti satura le connessioni | ALTA | `admin.ts`, `server.ts` |
| **pgvector su Supabase ha limiti di memoria** — HNSW index in RAM | ALTA | `003_vector_db.sql` |
| **Nessuna strategia di backup** codificata | ALTA | Nessun file |
| **Service role key usata ovunque server-side** senza rate limiting interno | MEDIA | `admin.ts`, `vector-store.ts`, `legal-corpus.ts` |
| **Se Supabase va in down** = auth + DB + vectors + RLS tutti down | CRITICA | Intero sistema |
| **Costi unpredictable** — pgvector + storage + auth + realtime | MEDIA | — |

**Impatto concreto**: Un downtime Supabase di 1 ora = zero funzionalita, zero fallback.

### 2.2 SCALABILITA

| Problema | Severita | File coinvolti |
|----------|----------|----------------|
| **Cache su filesystem locale** (`.analysis-cache/`) | CRITICA | `analysis-cache.ts` |
| Non funziona con multiple istanze serverless | | |
| Non persiste tra i deploy | | |
| **Pipeline sequenziale bloccante** per 60-300 secondi | ALTA | `orchestrator.ts` |
| Una singola funzione serverless occupa 5 min max | | `route.ts:10` (`maxDuration = 300`) |
| **Nessun sistema di code** (queue) | ALTA | `api/analyze/route.ts` |
| Se il client disconnette, l'analisi continua senza destinatario | | |
| **Nessun horizontal scaling** | ALTA | Architettura generale |
| **Auto-indexing fire-and-forget** nello stesso processo | MEDIA | `orchestrator.ts:266-284` |
| Se il processo muore, l'indexing si perde | | |
| **Rate limit Anthropic: 60s fissi** per ogni 429 | MEDIA | `anthropic.ts:49` |
| Nessun backoff esponenziale, nessun circuit breaker | | |
| **Rate limit Voyage AI: singolo retry** | MEDIA | `embeddings.ts:92` |

**Impatto concreto**: Con 10 utenti simultanei, le funzioni serverless raggiungono
il limite di concorrenza. Con 50+, il sistema diventa inutilizzabile.

### 2.3 SICUREZZA

| Problema | Severita | File coinvolti |
|----------|----------|----------------|
| **`/api/corpus` POST senza autenticazione** | CRITICA | `api/corpus/route.ts` |
| Chiunque puo iniettare articoli falsi nel corpus legislativo | | |
| **`/api/deep-search` POST senza auth** | ALTA | `api/deep-search/route.ts` |
| Chiunque puo fare ricerche consumando token Anthropic | | |
| **`/api/session/[id]` GET senza auth** | ALTA | `api/session/[sessionId]/route.ts` |
| Se indovini il sessionId, vedi l'analisi di chiunque | | |
| **`/api/upload` POST senza auth** | MEDIA | `api/upload/route.ts` |
| **`/api/vector-search` POST senza auth** | MEDIA | `api/vector-search/route.ts` |
| **`/api/analyze` graceful degradation** permette analisi anonime | MEDIA | `api/analyze/route.ts:50-52` |
| **Nessun rate limiting su nessun endpoint** | ALTA | Tutti gli endpoint |
| Un attaccante puo esaurire i token Anthropic in minuti | | |
| **`eval("require")` in extract-text.ts** | BASSA | `extract-text.ts:45` |
| Workaround per Turbopack ma e' un code smell | | |
| **Nessuna protezione CSRF** | MEDIA | Tutti i POST |
| **Nessuna sanitizzazione input documentText** | MEDIA | `orchestrator.ts` |
| Il testo del documento viene passato direttamente ai prompt | | Potenziale prompt injection |
| **SessionId derivato da hash + timestamp** | BASSA | `analysis-cache.ts:54` |
| Prevedibile se si conosce il contenuto del documento | | |

### 2.4 PARAMETRIZZAZIONE

| Cosa e' hardcoded | File | Valore attuale |
|---------------------|------|----------------|
| Modello Claude (Sonnet) | `anthropic.ts:83` | `claude-sonnet-4-5-20250929` |
| Modello Claude (Haiku) | `anthropic.ts:84` | `claude-haiku-4-5-20251001` |
| Max tokens per agente | Ogni agente | 4096 / 8192 |
| System prompts | `lib/prompts/*.ts` | Stringhe TypeScript |
| PLANS config | `stripe.ts:14-33` | `{free: 3/mese, pro: 4.99}` |
| Chunk size / overlap | `vector-store.ts:37-38` | 1000 / 200 chars |
| Embedding model | `embeddings.ts:14` | `voyage-law-2` |
| Search thresholds | Vari | 0.55 / 0.6 / 0.65 / 0.7 |
| Max investigator iterations | `investigator.ts:60` | 8 |
| Rate limit wait | `anthropic.ts:49` | 60s fissi |
| Max file size | `upload/route.ts:17` | 20 MB |
| Retry embedding | `embeddings.ts:93` | 5s, 1 solo retry |
| Max risks/actions in advisor | `advisor.ts:44-51` | 3 / 3 |

**Impatto**: Ogni modifica a questi parametri richiede un deploy del codice.
Nessun admin panel, nessun feature flag, nessun A/B testing.

---

## 3. Piano di Hardening Sicurezza

### 3.1 Priorita IMMEDIATE (Settimana 1)

#### A. Middleware di autenticazione centralizzato

```typescript
// Proposta: lib/middleware/auth.ts
export async function requireAuth(req: NextRequest): Promise<{
  user: User;
  profile: Profile;
} | NextResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Autenticazione richiesta" },
      { status: 401 }
    );
  }
  // ... fetch profile, return
}
```

**Endpoint da proteggere subito**:
- `POST /api/corpus` (CRITICO — permette di iniettare norme false)
- `POST /api/deep-search`
- `GET /api/session/[id]` (verificare che l'utente sia owner)
- `POST /api/upload`
- `POST /api/vector-search`

#### B. Rate Limiting

```typescript
// Proposta: lib/middleware/rate-limit.ts
// Basato su IP + user_id con sliding window
// Storage: Supabase (breve termine) o Redis (se disponibile)
const LIMITS = {
  "api/analyze":      { window: 60, max: 3 },   // 3/min
  "api/deep-search":  { window: 60, max: 10 },  // 10/min
  "api/corpus":       { window: 3600, max: 50 }, // 50/ora (admin only)
  "api/upload":       { window: 60, max: 5 },    // 5/min
};
```

#### C. Input Sanitization

```typescript
// Prima di passare il testo ai prompt degli agenti:
function sanitizeDocumentText(text: string): string {
  // Rimuovi potenziali prompt injection markers
  // Limita lunghezza massima
  // Strip caratteri di controllo
  return text.slice(0, MAX_DOCUMENT_LENGTH).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}
```

### 3.2 Priorita ALTA (Settimana 2-3)

#### D. Session ID non prevedibili

```typescript
// Usare UUID v4 invece di hash+timestamp
import { randomUUID } from "crypto";
const sessionId = randomUUID(); // Non piu' derivato dal contenuto
```

#### E. CORS e CSRF Protection

```typescript
// next.config.ts - headers di sicurezza
headers: [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
]
```

#### F. Eliminare eval() da extract-text.ts

```typescript
// Soluzione: dynamic import con next/dynamic o configurazione Turbopack
// per escludere pdf-parse dal bundling client-side
const pdfParse = await import("pdf-parse");
```

---

## 4. Parametrizzazione e Feature Flags

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
    description: "Ricerca e studia modalita di integrazione con sistemi esterni",
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

  // Funzionalita
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

### 5.1 Architettura Proposta

Trasformare la pipeline da hardcoded a registry-based:

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
│  │  - Rollback automatico se qualita scende             │  │
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

| Agente | Ruolo | Priorita |
|--------|-------|----------|
| **Connect** | Ricerca e studia integrazioni con sistemi esterni | P0 |
| **Sentinel** | Monitoraggio continuo: aggiornamenti normativi, scadenze | P1 |
| **Comparator** | Confronto tra versioni di un contratto / benchmark | P1 |
| **Mediator** | Suggerisce formulazioni alternative bilanciate | P2 |
| **Translator** | Traduzione legale certificata (IT↔EN↔DE↔FR) | P2 |
| **Auditor** | Verifica compliance GDPR, AML, ESG | P2 |

---

## 6. Connect Agent — Design Completo

### 6.1 Mission

Il **Connect Agent** e' un agente di ricerca e integrazione il cui compito e' studiare
come connettersi a sistemi esterni non ancora censiti, seguendo una strategia gerarchica
di discovery delle fonti. Non e' solo un connettore: e' un **ricercatore** che costruisce
e mantiene un catalogo di integrazioni.

### 6.2 Architettura

```
┌──────────────────────────────────────────────────────────────────┐
│                        CONNECT AGENT                             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                  Integration Discovery                     │  │
│  │                                                            │  │
│  │  Gerarchia di ricerca (priorita decrescente):              │  │
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
│  │  │    discoveryLog: [...]  // Come e' stato scoperto    │  │  │
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
| **Normattiva.it** | DB legislativo | Scraping HTML strutturato | Testo ufficiale leggi italiane |
| **Brocardi.it** | Enciclopedia legale | Scraping + RSS | Commenti, massime, correlazioni |
| **ItalGiure** | Giurisprudenza | Scraping (accesso limitato) | Sentenze Cassazione |
| **EUR-Lex** | Normativa EU | API REST ufficiale | Regolamenti e direttive EU |
| **Camera.it / Senato.it** | Lavori parlamentari | RSS + Scraping | DDL e iter legislativi |
| **Agenzia Entrate** | Fiscale | Scraping + API parziali | Risoluzioni, circolari |
| **CONSOB** | Finanziario | Scraping | Delibere, regolamenti |
| **Garante Privacy** | GDPR | Scraping | Provvedimenti, linee guida |
| **Registro Imprese** | Camerale | API ufficiale (a pagamento) | Visure societarie |
| **PEC providers** | Comunicazione | API (Aruba, Legalmail) | Invio PEC automatico |

### 6.5 System Prompt del Connect Agent

```typescript
export const CONNECT_AGENT_SYSTEM_PROMPT = `Sei il Connect Agent di controlla.me.
Il tuo compito e' ricercare e progettare integrazioni con sistemi esterni.

PROCEDURA DI DISCOVERY (segui RIGOROSAMENTE quest'ordine):

1. API UFFICIALE — Cerca sempre prima se esiste un'API REST/GraphQL documentata.
   - Controlla: api.{domain}, developer.{domain}, {domain}/api/docs
   - Cerca OpenAPI/Swagger specification
   - Verifica autenticazione richiesta e rate limits

2. SDK/LIBRERIE — Se non c'e' API diretta, cerca package ufficiali.
   - npmjs.com, PyPI, GitHub dell'organizzazione
   - Valuta manutenzione (ultimo commit, issues aperte)

3. DOCUMENTAZIONE UFFICIALE — Se non c'e' SDK, studia la documentazione.
   - Cerca pattern di integrazione documentati
   - Guide per sviluppatori, webhook, export

4. COMMUNITY SOURCES — Se la documentazione e' scarsa:
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
- Preferisci SEMPRE l'approccio piu' ufficiale e stabile.
- Se un sistema richiede pagamento, segnalalo chiaramente.
- Documenta OGNI passo del discovery per riproducibilita.`;
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

-- Catalog: leggibile da tutti (e' conoscenza condivisa)
create policy "Anyone can read catalog" on public.integration_catalog
  for select using (true);

-- Solo service role puo' modificare
create policy "Service role manages catalog" on public.integration_catalog
  for all using (true);

create policy "Service role manages runs" on public.integration_runs
  for all using (true);
```

---

## 7. Roadmap di Implementazione

### Fase 1 — Hardening (1-2 settimane)

```
[ ] Auth middleware centralizzato per tutti gli endpoint
[ ] Rate limiting (IP + user based)
[ ] Input sanitization pre-prompt
[ ] Session ID con UUID v4
[ ] Security headers (CSP, X-Frame-Options, etc.)
[ ] Rimuovere eval() da extract-text.ts
[ ] CORS configuration
```

### Fase 2 — Parametrizzazione (1 settimana)

```
[ ] Creare config/ directory con files di configurazione
[ ] Estrarre tutti i valori hardcoded in env vars
[ ] Feature flags per ogni funzionalita
[ ] Refactor agenti per leggere da config
```

### Fase 3 — Resilienza Supabase (2 settimane)

```
[ ] Connection pooling (Supabase pgBouncer o esterno)
[ ] Cache layer (Redis/Upstash) per sessioni e rate limits
[ ] Migrare analysis-cache da filesystem a DB/Redis
[ ] Circuit breaker per chiamate Supabase
[ ] Retry con backoff esponenziale per tutte le chiamate esterne
[ ] Healthcheck endpoint per monitoraggio
[ ] Backup strategy (pg_dump schedulato o Supabase backup API)
```

### Fase 4 — Agent Registry (2 settimane)

```
[ ] Interfaccia base Agent con run() / validate()
[ ] Agent Registry con registrazione dinamica
[ ] Pipeline Engine con esecuzione configurabile
[ ] Prompt Store versionato
[ ] Metriche per agente (latenza, costo, qualita)
[ ] Refactor dei 4 agenti esistenti sulla nuova interfaccia
```

### Fase 5 — Connect Agent (2-3 settimane)

```
[ ] Implementare Connect Agent base
[ ] Schema DB integration_catalog
[ ] Discovery engine con strategia gerarchica
[ ] Primo adapter: Normattiva.it (scraping strutturato)
[ ] Secondo adapter: EUR-Lex (API REST)
[ ] Terzo adapter: Brocardi.it (scraping + RSS)
[ ] Dashboard admin per gestione catalogo integrazioni
[ ] API per trigger manuale discovery
```

### Fase 6 — Scalabilita (3-4 settimane)

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

## Appendice: Rischi Supabase e Mitigazione

### Scenario: "Supabase e' down per 2 ore"

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
2. **Database**: PostgreSQL self-hosted (Railway, Neon, o VPS) — piu controllo
3. **Vectors**: pgvector su PostgreSQL dedicato, oppure Pinecone/Qdrant
4. **La migrazione e' incrementale**: si puo fare un pezzo alla volta

---

*Documento di architettura — controlla.me v1.0*
*Per domande o aggiornamenti: aggiornare questo file nel branch di sviluppo.*
