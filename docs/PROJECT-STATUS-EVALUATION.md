# Valutazione Stato del Progetto — Claude-playground

**Data:** 2026-03-01 (v2 — aggiornamento)
**Valutatore:** Claude Opus 4.6
**Repo:** CheersData/Claude-playground
**Commit corrente:** `46c24a7` | **Totale commit:** 124
**Periodo sviluppo:** ~9 giorni (20 Feb – 1 Mar 2026)

---

## 1. Panoramica Generale

**Claude-playground** è una piattaforma multi-prodotto con architettura agentica AI, focalizzata sull'analisi legale automatizzata per il mercato italiano. Il prodotto principale — **controlla-me** — è un'applicazione Next.js 16 con 8 agenti AI specializzati, pipeline RAG su corpus legislativo (5.600 articoli), e sistema multi-provider con fallback chain a 7 provider.

| Metrica | Precedente | Attuale | Delta |
|---------|-----------|---------|-------|
| Commit totali | 123 | 124 | +1 |
| File TypeScript/TSX | 138 | 138 | = |
| Righe di codice (TS/TSX) | ~26.300 | 26.279 | = (stabile) |
| Prodotti | 2 | 2 (1 attivo, 1 bozza) | = |
| Provider AI integrati | 7 | 7 | = |
| Modelli AI registrati | ~40 | ~40 | = |
| Articoli legislativi | ~5.600 | ~5.600 | = |
| Fonti legislative | 13/14 | 13/14 | = |
| Agenti AI | 7 | 8 (4 pipeline + 4 supporto) | +1 (leader) |
| Componenti React | 31 | 31 (19 app + 12 console) | = |
| API Routes | 19 | 19 | = |
| Pagine frontend | 7 | 7 | = |
| Database migrations | 8 | 8 | = |
| File di test | 8 | 8 | = |

---

## 2. Architettura — Analisi Approfondita

### 2.1 Struttura Organizzativa a 3 Livelli

```
STAFF (monitoraggio + strategia)
  ├─ Servizi (no LLM): Cost Tracker, QA Validator, Data Connector, Performance Watch
  └─ Agenti LLM: Cost Optimizer, QA Semantico, Market Scout, Growth Engine

AGENT LEADERS (orchestrazione deterministica)
  └─ Leader Analisi Legale → decision tree in codice, ZERO costo LLM

SHARED SERVICES (infrastruttura)
  ├─ AI SDK (multi-provider router)
  ├─ Vector Store (RAG a 3 layer)
  ├─ Embeddings (Voyage Law-2)
  ├─ Tier System (fallback chains N-modelli)
  └─ Auth / Cache / Sanitize
```

### 2.2 I 5 Componenti Più Sofisticati

#### 1. Fallback Chain System (`lib/tiers.ts` + `lib/ai-sdk/agent-runner.ts`)

Ogni agente ha una catena ordinata di N modelli. Su errore 429 o provider non disponibile, salta al successivo senza latenza visibile all'utente.

```
PARTNER:   Sonnet 4.5 → Gemini Pro → Mistral Large → Groq Llama → Cerebras
ASSOCIATE: Gemini Pro → Mistral Large → Groq Llama → Cerebras
INTERN:    Mistral Large → Groq Llama → Cerebras
```

- Zero latenza su singolo fallback (nessun retry timer)
- Skip automatico provider senza API key
- Costo tracciato per ogni chiamata (provider, modello, token, durata)

#### 2. Pipeline Analisi Legale (`lib/agents/orchestrator.ts` — 360 righe)

Pipeline 4-fasi sequenziale con RAG retrieval inter-fase:

```
[1] CLASSIFIER (Haiku, ~12s) → tipo documento, istituti giuridici, focus
     ↓
[1.5] RETRIEVAL → ricerca norme rilevanti per classificazione
     ↓
[2] ANALYZER (Sonnet, ~25s) + RAG → clausole rischiose, parte debole
     ↓
[2.5] RETRIEVAL → norme per clausole problematiche trovate
     ↓
[3] INVESTIGATOR (Sonnet, ~30s) + web_search + RAG → ricerca legale profonda
     ↓
[4] ADVISOR (Sonnet, ~18s) + RAG → scoring multidimensionale + raccomandazioni
```

- Session cache con SHA256 del documento — analisi riprendibili da fase fallita
- Token calibrati per fase: 4096, 8192, 6144, 4096
- JSON parsing con 3 livelli di fallback

#### 3. Leader Deterministico (`lib/agents/leader.ts` — 133 righe)

Routing senza LLM per casi ovvi (zero costo, zero latenza):

| Input | Route | LLM? |
|-------|-------|------|
| Solo file, nessun messaggio | `document-analysis` | No |
| Testo breve < 500 char | `corpus-qa` | No |
| Testo medio 500-2000 char | `corpus-qa` + deep search | No |
| Testo lungo > 2000 char | `document-analysis` | No |
| Input vago ("ciao", "aiuto") | `clarification` | No |
| File + messaggio (ambiguo) | LLM decide | Sì |

Risparmio stimato: ~$0.05/query per routing che altrimenti richiederebbe un LLM.

#### 4. Data Connector Pipeline (`lib/staff/data-connector/` — 2.936 righe)

ETL enterprise-grade per corpus legislativo:

```
CONNECT → MODEL → LOAD
  ↓        ↓       ↓
[API]   [Schema] [pgvector]
  ↓        ↓       ↓
HTTP +  Validaz. Supabase +
retry   batch    embeddings
```

- 13 fonti (Normattiva + EUR-Lex)
- Parser AKN (Akoma Ntoso XML) per legislazione italiana
- Sync idempotente — nessun duplicato su re-run
- Audit trail completo (`connector_sync_log`)

#### 5. Vector Store a 3 Layer (`lib/vector-store.ts` — 498 righe)

```
Layer 1: legal_articles → 5.600 articoli + Voyage Law-2 embeddings (1024-dim)
Layer 2: document_chunks → documenti analizzati per similarity search
Layer 3: legal_knowledge → pattern emergenti da analisi precedenti
```

- Chunking intelligente con natural break detection (1000 char, overlap 200)
- Ricerca ibrida: diretta per nome legge + semantica per similarità
- Graceful degradation — funziona anche senza Vector DB

---

## 3. Stato dei Prodotti

### 3.1 controlla-me — Analisi Legale AI

**Stato: MVP Funzionante** | **Maturità: 60-65%**

#### Funzionalità COMPLETATE

| Area | Dettaglio | File chiave |
|------|-----------|-------------|
| Pipeline AI | 4 fasi: Classify → Analyze → Investigate → Advise | `lib/agents/orchestrator.ts` |
| Multi-provider | 7 provider, ~40 modelli, fallback chain N | `lib/models.ts`, `lib/tiers.ts` |
| RAG | 3-layer vector store + Voyage Law-2 | `lib/vector-store.ts` |
| Corpus | 5.600 articoli da 13 fonti legislative | `lib/legal-corpus.ts` |
| Corpus UI | Miller Columns + ricerca ibrida + Q&A | `app/corpus/page.tsx` |
| Console | Studio Legale con Leader routing + Power Tab | `app/console/page.tsx` |
| Upload | PDF, DOCX, TXT con estrazione testo | `lib/extract-text.ts` |
| Streaming | SSE real-time con progress bar + ETA | `app/api/analyze/route.ts` |
| Caching | Session-based con SHA256 + resume | `lib/analysis-cache.ts` |
| Auth | Supabase OAuth + JWT + RLS completo | `middleware.ts` |
| Pagamenti | Stripe 3 piani (Free/Pro/Single) | `app/api/stripe/` |
| Data Connector | Pipeline ETL Normattiva + EUR-Lex | `lib/staff/data-connector/` |
| Landing page | Hero + Mission + Team + Video + CTA | `app/page.tsx` |
| Multi-domain | `lexmea.studio` → Console, dominio principale → Landing | `middleware.ts` |

#### Funzionalità INCOMPLETE

| Area | Stato | Impatto |
|------|-------|---------|
| Dashboard utente | Solo mock data | UX incompleta |
| `/analysis/[id]` | Solo mock | Dettaglio analisi non funzionale |
| Deep search limits | Non enforced | Limiti uso non controllati |
| Lawyer referral UI | Schema DB presente, UI assente | Feature annunciata ma non visibile |
| OCR scansionati | `tesseract.js` importato, non usato | Solo PDF digitali supportati |
| Statuto Lavoratori | Mancante nel corpus | Problema API Normattiva |

### 3.2 salva-me — Analisi Finanziaria

**Stato: Solo Design** | **Maturità: 5%**

- `ARCHITECTURE.md` con design 4 agenti (document-parser, savings-analyzer, market-comparator, action-generator)
- Stack previsto: Python 3.12+ / FastAPI
- Modelli Pydantic definiti in `agent_prompts.py`
- Nessun codice implementativo

---

## 4. Qualità del Codice

### 4.1 Architettura — VOTO: A

**Miglioramento da A- ad A.** Motivazioni:

1. **`page.tsx` ridotto da 1.160 a 421 righe** — decomposizione avvenuta, componenti estratti
2. **`orchestrator.ts` ridotto da 781 a 360 righe** — refactoring efficace
3. **`vector-store.ts` ridotto da ~600 a 498 righe** — più snello
4. **Leader deterministico** — design pattern brillante, zero costi per routing
5. **Agent Runner** — pattern pulito in 120 righe, gestisce N provider con chain
6. **Zero TODO/FIXME/HACK** nel codice — codebase pulita

**Hotspot rimanenti (file > 500 righe):**

| File | Righe | Note |
|------|-------|------|
| `lib/legal-corpus.ts` | 920 | Più grande del progetto — candidato per split search/hierarchy |
| `components/console/CorpusTreePanel.tsx` | 872 | Componente complesso, accettabile per Miller Columns |
| `scripts/seed-corpus.ts` | 754 | Script CLI, accettabile |
| `scripts/testbook.ts` | 749 | Script QA, accettabile |
| `components/AnalysisProgress.tsx` | 695 | Componente ricco di stato, borderline |
| `components/MissionSection.tsx` | 650 | Animazioni Framer Motion espandono il file |
| `lib/staff/data-connector/connectors/normattiva.ts` | 582 | Logica connector, accettabile |

### 4.2 TypeScript & Type Safety — VOTO: B+

- Strict mode abilitato
- Interfacce per tutte le strutture dati principali
- `AgentName`, `ModelKey`, `TierName` come union types
- Path alias `@/*` per import puliti
- ESLint 9 con flat config + Next.js preset

### 4.3 Testing — VOTO: D

**Peggiorato da D+ a D.** I test esistenti sono in gran parte **stale** (non aggiornati al codice corrente).

**Risultati esecuzione `vitest run`:**

| Metrica | Valore |
|---------|--------|
| Test totali | 81 |
| Passati | 64 (79%) |
| **Falliti** | **17 (21%)** |
| File test passati | 2/8 |
| **File test falliti** | **6/8** |

**Dettaglio fallimenti per file:**

| File test | Stato | Causa |
|-----------|-------|-------|
| `advisor.test.ts` | PASS | OK |
| `orchestrator.test.ts` | PASS | OK (warning stderr da corpus lookup) |
| `anthropic.test.ts` | FAIL (1/15) | Regex extraction JSON array — logica cambiata |
| `analyzer.test.ts` | FAIL (1/?) | Aspettativa classificazione cambiata |
| `classifier.test.ts` | FAIL (1/?) | Test truncation warning non allineato |
| `extract-text.test.ts` | FAIL (3/?) | API `pdf-parse` v2 diversa dai mock |
| `investigator.test.ts` | FAIL (2/13) | Aspetta Haiku ma il codice usa Sonnet; MAX_ITERATIONS 5→6 |
| `analyze-route.test.ts` | FAIL (9/12) | 75% fallimento — route handler evoluta, mock stale |

**Problema sistemico:** i test non sono stati aggiornati dopo i cambi di modello (Haiku→Sonnet), le iterazioni (5→6), e l'API di `pdf-parse` v2. Questo significa che i test non proteggono da regressioni — il loro scopo è vanificato.

**Gap di copertura (moduli senza test):**

| Modulo non testato | Righe | Rischio |
|-------------------|-------|---------|
| `legal-corpus.ts` | 920 | ALTO — modulo più complesso |
| `vector-store.ts` | 498 | ALTO — RAG core |
| `agent-runner.ts` | 120 | MEDIO — fallback chain |
| `tiers.ts` | ~200 | MEDIO — logica tier |
| `leader.ts` | 133 | MEDIO — routing decisionale |
| `data-connector/*` | 2.936 | MEDIO — pipeline ETL |
| Componenti React | 31 file | ALTO — nessun test UI |
| E2E tests | 0 | ALTO — nessun test full flow |

### 4.4 Build — VOTO: F

**IL BUILD È ROTTO.** `npm run build` fallisce con 6 errori di import mancanti.

**Componenti mancanti in `app/corpus/page.tsx` e `app/corpus/article/[id]/page.tsx`:**

```
❌ @/components/corpus/SourcesGrid      — non esiste
❌ @/components/corpus/SourceDetail      — non esiste
❌ @/components/corpus/ArticleReader     — non esiste
❌ @/components/corpus/InstituteGrid     — non esiste
❌ @/components/corpus/HierarchyTree     — non esiste
❌ @/components/corpus/AnimatedCount     — non esiste
```

Queste pagine importano componenti che non sono mai stati creati. Il progetto **non può essere deployato** finché non vengono creati o gli import rimossi.

### 4.5 Linting — VOTO: C

**ESLint: 27 problemi (7 errori, 20 warning)**

**Errori (7):**

| File | Errore | Tipo |
|------|--------|------|
| `Navbar.tsx:75` | `setState` dentro `useEffect` sincrono | react-hooks/set-state-in-effect |
| `VideoShowcase.tsx:44,46,48` | Accesso ref durante render (4 errori) | React rules violation |
| `corpus/page.tsx:99` | `setState` sincrono in effect | react-hooks/set-state-in-effect |
| `PowerPanel.tsx:99` | `setState` sincrono in effect | react-hooks/set-state-in-effect |

**Warning (20):** Prevalentemente `@typescript-eslint/no-unused-vars` — variabili e import non utilizzati.

### 4.6 Vulnerabilità npm — VOTO: C+

```
3 vulnerabilità: 1 low, 1 moderate (fast-xml-parser), 1 high (minimatch ReDoS)
Tutte risolvibili con: npm audit fix
```

### 4.4 Naming Conventions — VOTO: A

- Codice: inglese
- UI/prompts: italiano
- File: kebab-case per moduli, PascalCase per componenti
- Consistente in tutto il progetto

---

## 5. Sicurezza — Analisi Dettagliata

### 5.1 Matrice Sicurezza

| Categoria | Voto | Dettaglio |
|-----------|------|-----------|
| **Autenticazione** | 9/10 | Supabase JWT + `auth.getUser()` su tutte le route protette |
| **Gestione secrets** | 10/10 | Zero credenziali nel repo, `.env*` in gitignore, env var per tutto |
| **Rate limiting** | 7/10 | Sliding window per IP/utente, limiti per endpoint (analyze: 3/min, upload: 10/min). In-memory — non sopravvive al restart |
| **Input validation** | 8/10 | Sanitize control chars, 500KB doc limit, 2KB query limit, sessionId whitelist |
| **Accesso dati** | 10/10 | RLS su tutte le tabelle. Users vedono solo i propri dati |
| **Security headers** | 7/10 | 5 header (nosniff, DENY, XSS, Referrer, Permissions). Manca CSP e HSTS |
| **Stripe webhook** | 9/10 | HMAC-SHA256 verificato, raw body. Manca idempotency su event.id |
| **Monitoring** | 4/10 | Solo console.log. No Sentry, no audit log strutturato |
| **MEDIA** | **8.0/10** | |

### 5.2 Security Headers (`next.config.ts`)

```
✅ X-Content-Type-Options: nosniff
✅ X-Frame-Options: DENY
✅ X-XSS-Protection: 1; mode=block
✅ Referrer-Policy: strict-origin-when-cross-origin
✅ Permissions-Policy: camera=(), microphone=(), geolocation=()
❌ Content-Security-Policy — MANCANTE
❌ Strict-Transport-Security — MANCANTE (Vercel lo gestisce di default)
```

### 5.3 RLS Supabase

| Tabella | SELECT | INSERT | UPDATE | DELETE |
|---------|--------|--------|--------|--------|
| `profiles` | `auth.uid() = id` | auto (trigger) | `auth.uid() = id` | No |
| `analyses` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | No |
| `deep_searches` | subquery su analyses | subquery su analyses | — | No |
| `lawyer_referrals` | `auth.uid() = user_id` | `auth.uid() = user_id` | — | No |

### 5.4 Rate Limiting per Endpoint

| Endpoint | Window | Max |
|----------|--------|-----|
| `/api/analyze` | 60s | 3 |
| `/api/deep-search` | 60s | 10 |
| `/api/corpus/ask` | 60s | 10 |
| `/api/corpus` | 3600s | 20 |
| `/api/upload` | 60s | 10 |
| `/api/vector-search` | 60s | 20 |
| `/api/session` | 60s | 30 |
| default | 60s | 30 |

---

## 6. Infrastruttura e DevOps

| Area | Voto | Note |
|------|------|------|
| **CI/CD** | **F** | Zero GitHub Actions. Nessuna automazione. **Invariato.** |
| **Database** | **B+** | 8 migration ordinate, RLS, pgvector, audit trail, monthly reset |
| **Deployment** | **B** | Vercel implicito (no `vercel.json`), env documentati. Manca staging |
| **Docker** | **F** | Nessun Dockerfile. Solo Vercel come target |
| **Monitoring** | **D** | Solo `console.log`. Nessun Sentry/AlertManager |

### Stack Tecnologico Completo

| Livello | Tecnologia | Versione |
|---------|-----------|----------|
| Framework | Next.js (App Router) | 16.1.6 |
| UI | React | 19.2.3 |
| Linguaggio | TypeScript (strict) | 5.9.3 |
| CSS | Tailwind CSS 4 + PostCSS | 4 |
| Animazioni | Framer Motion | 12.34.2 |
| AI/LLM | @anthropic-ai/sdk | 0.77.0 |
| AI/LLM | @google/genai (Gemini) | 1.42.0 |
| AI/LLM | openai (5 provider) | 6.24.0 |
| Embeddings | Voyage AI (voyage-law-2) | API HTTP |
| Vector DB | Supabase pgvector (HNSW) | via PostgreSQL |
| Database | Supabase PostgreSQL + RLS | 2.97.0 |
| Auth | Supabase OAuth (Google, GitHub) | @supabase/ssr 0.8.0 |
| Pagamenti | Stripe | 20.3.1 |
| PDF | pdf-parse | 2.4.5 |
| DOCX | mammoth | 1.11.0 |
| XML | fast-xml-parser (AKN) | 5.3.7 |
| OCR | tesseract.js (non attivo) | 7.0.0 |
| Test | Vitest + v8 coverage | 4.0.18 |
| Lint | ESLint 9 flat config | 9 |

---

## 7. Documentazione — VOTO: A

| Documento | Contenuto |
|-----------|-----------|
| `controlla-me/CLAUDE.md` | 840 righe — istruzioni complete per agenti AI |
| `controlla-me/docs/ARCHITECTURE.md` | ~60 KB — architettura tecnica esaustiva |
| `controlla-me/docs/MODEL-CENSUS.md` | Censimento modelli con prezzi per 1M token |
| `controlla-me/docs/BEAUTY-REPORT.md` | Design system e visual identity |
| `controlla-me/docs/TESTBOOK.md` | 20 test case documentati |
| `docs/ORGANIGRAMMA.md` | ~27 KB — architettura agentica a 3 livelli |
| `controlla-me/TODO_DOMANI.md` | Backlog con istruzioni setup |
| `controlla-me/SORA-PROMPTS.md` | Prompt per video AI generati |
| `salva-me/ARCHITECTURE.md` | Design sistema finanziario |
| `shared/design/README.md` | Design system Lightlife |

Totale: **10 documenti**, copertura eccellente di architettura, operations e onboarding.

---

## 8. Velocità di Sviluppo

### Timeline Commit

```
20 Feb — Inizio progetto (giorno 1)
22 Feb — ~20 commit: data loading, Supabase migrations, corpus seed
24 Feb — ~30 commit (PICCO): AI SDK, UI redesign, corpus, security
26 Feb — ~15 commit: Console, leader agent, data connector
27 Feb —  2 commit: QA testbook 20/20, corpus UI
28 Feb —  5 commit: Miller columns, search fixes, Power Tab
01 Mar —  1 commit: valutazione progetto
```

| Metrica | Valore |
|---------|--------|
| Commit totali | 124 |
| Durata | 9 giorni |
| Media | ~14 commit/giorno |
| Righe aggiunte (ultimi 50 commit) | +36.078 |
| File toccati (ultimi 50 commit) | 220 |

### Contributi

| Autore | Commit | % |
|--------|--------|---|
| Cristofori Marco | 83 | 67% |
| Claude (AI-assisted) | 27 | 22% |
| Marco Cristofori | 11 | 9% |
| CheersData | 3 | 2% |

---

## 9. Analisi dei Rischi

### Rischi ALTI

| # | Rischio | Impatto | Mitigazione suggerita |
|---|---------|---------|----------------------|
| 1 | **Assenza CI/CD** | Bug in prod non rilevati, deploy manuali | GitHub Action: `npm ci → lint → test → build`, blocco merge su fail |
| 2 | **Test insufficienti (8 file)** | Regressioni non rilevate su pipeline critica | Priorità: `legal-corpus.test.ts`, `vector-store.test.ts`, 1 test E2E |
| 3 | **Monitoring assente** | Errori prod invisibili, nessun alerting | Sentry + audit log strutturato |
| 4 | **Rate limiting in-memory** | Reset su restart, non scala multi-instance | Migrare a Redis/Upstash per Vercel serverless |

### Rischi MEDI

| # | Rischio | Mitigazione |
|---|---------|-------------|
| 5 | `legal-corpus.ts` (920 righe) — modulo più complesso senza test | Split in search.ts + hierarchy.ts + test |
| 6 | Costi API imprevedibili a scale | Dashboard costi nel Staff layer + limiti budget |
| 7 | Manca CSP header | Aggiungere Content-Security-Policy in `next.config.ts` |
| 8 | Webhook Stripe senza idempotency | Tracciare `event.id` in DB per prevenire duplicati |
| 9 | Dati mock su Dashboard e `/analysis/[id]` | Completare integrazione Supabase |
| 10 | Nessun staging environment | Creare branch-based preview su Vercel |

### Rischi BASSI

| # | Rischio | Note |
|---|---------|------|
| 11 | GDPR — nessun endpoint di cancellazione dati | Schema DB supporta delete, serve API |
| 12 | Nessun Dockerfile | Solo se serve self-hosting |
| 13 | Statuto Lavoratori mancante | Problema upstream (API Normattiva) |

---

## 10. Cosa è Migliorato e Cosa è Peggiorato

### Miglioramenti

| Area | Prima (28 Feb) | Ora (1 Mar) | Variazione |
|------|---------------|-------------|------------|
| `page.tsx` | 1.160 righe | 421 righe | **-63.7%** — decomposizione eccellente |
| `orchestrator.ts` | 781 righe | 360 righe | **-53.9%** — refactoring pulito |
| `vector-store.ts` | ~600 righe | 498 righe | **-17%** — più snello |
| TODO/FIXME nel codice | Non verificato | **Zero** | Codebase pulita |
| Agenti AI | 7 | 8 (+leader formale) | +1 agente |
| Leader pattern | Presente | Documentato e verificato | Design pattern validato |

### Problemi Critici Nuovi/Confermati

| Area | Stato | Gravità |
|------|-------|---------|
| **Build rotto** | 6 componenti corpus mancanti → `npm run build` FAIL | **BLOCCANTE** |
| **Test stale** | 17/81 test falliti (21%) — aspettative non aggiornate | **ALTO** |
| **ESLint errori** | 7 errori (React hooks violations) | MEDIO |
| **npm vuln** | 3 vulnerabilità (1 high: minimatch ReDoS) | MEDIO |
| **CI/CD assente** | Nessuna GitHub Action | ALTO |
| **Monitoring assente** | Solo console.log | ALTO |

---

## 11. Scorecard Finale

| Area | Peso | Voto v1 | Voto v2 | Score v2 | Note |
|------|------|---------|---------|----------|------|
| Architettura | 20% | A- (90) | **A** (93) | 18.6 | Decomposizione page.tsx, refactoring orchestrator |
| Funzionalità core | 25% | B+ (87) | **B** (83) | 20.8 | Build rotto su corpus pages → non deployabile |
| Qualità codice | 15% | B (83) | **B-** (80) | 12.0 | 7 ESLint errors, 3 npm vuln, React hooks violations |
| Testing | 15% | D+ (67) | **D** (63) | 9.5 | 21% test failure rate, test stale, 6/8 file falliti |
| Sicurezza | 10% | B+ (87) | **B+** (87) | 8.7 | Confermato: buona, manca CSP e rate limit persistente |
| Documentazione | 5% | A (95) | **A** (95) | 4.8 | Invariata, eccellente |
| DevOps/CI/CD | 5% | F (40) | **F** (35) | 1.8 | Invariato: zero automazione |
| UX/Design | 5% | B (83) | **B** (83) | 4.2 | Invariato |
| **TOTALE** | **100%** | **82.1** | | **80.4 / 100** | |

### Variazione: 82.1 → 80.4 (-1.7)

**Il punteggio è sceso** nonostante i miglioramenti architetturali, a causa di problemi reali scoperti con l'esecuzione effettiva di build, test e lint:

| Miglioramento | Peggioramento |
|---------------|---------------|
| Architettura A- → A (+3) | Build rotto: 6 componenti mancanti (-4) |
| Zero TODO/FIXME | 17/81 test falliti, test stale (-4) |
| Decomposizione file | 7 ESLint errors in React hooks (-3) |
| Leader deterministico validato | 3 npm vulnerabilities (-1) |

**La valutazione precedente (82.1) era basata su analisi statica del codice.** Questa valutazione (80.4) include **esecuzione reale** di `npm run build`, `vitest run`, `eslint`, e `npm audit`. Il risultato è più accurato.

---

## 12. Verdetto

### B- — Architettura Eccellente, Ma Non Deployabile

L'architettura è **la parte migliore del progetto** — design pattern sofisticati (Leader deterministico, fallback chain N-modelli, RAG a 3 layer, Data Connector ETL) che dimostrano maturità architetturale enterprise.

Tuttavia, l'esecuzione reale di build/test/lint rivela che il progetto **non è deployabile nello stato attuale**:

1. **Build rotto** — 6 componenti corpus importati ma mai creati
2. **Test stale** — 21% dei test fallisce, aspettative non allineate al codice
3. **Errori React** — violazioni react-hooks in 3 componenti
4. **Nessuna CI/CD** — nessuno avrebbe rilevato questi problemi automaticamente

Il divario tra **qualità del design** (A) e **qualità dell'esecuzione operativa** (D) è il tema dominante.

---

## 13. Raccomandazioni Prioritarie

### P0 — BLOCCANTI (il progetto non può andare in produzione senza questi)

| # | Azione | Stato | Impatto su score |
|---|--------|-------|-----------------|
| 1 | **Fix build**: creare i 6 componenti corpus mancanti oppure rimuovere gli import | **URGENTISSIMO** | B → A (+10 punti su Funzionalità) |
| 2 | **Fix test stale**: aggiornare aspettative (Haiku→Sonnet, iterations 5→6, pdf-parse v2) | **URGENTE** | D → C (+5 punti su Testing) |
| 3 | **Fix ESLint errors**: risolvere 7 errori React hooks | **URGENTE** | C → B (+3 punti su Qualità) |
| 4 | **npm audit fix**: risolvere 3 vulnerabilità | **FACILE** | C+ → B (+1 punto) |

### P1 — Necessari per go-live

| # | Azione | Impatto |
|---|--------|---------|
| 5 | **CI/CD**: GitHub Action `npm ci → lint → test → build`, blocco merge su fail | F → B (+6 punti) |
| 6 | **Monitoring**: Sentry + error boundary | D → B (+3 punti) |
| 7 | **Test nuovi**: `legal-corpus.test.ts` + `vector-store.test.ts` + 1 test E2E | D → C+ (+3 punti) |

**Con P0 + P1 completati: 80.4 → ~94 punti (A)**

### P2 — Importanti (entro 2 settimane)

| # | Azione |
|---|--------|
| 8 | Rate limiting su Redis/Upstash (non in-memory) |
| 9 | CSP header in `next.config.ts` |
| 10 | Dashboard collegata a dati reali Supabase |
| 11 | `/analysis/[id]` con dati reali |
| 12 | Webhook Stripe idempotency (`event.id` tracking) |

### P3 — Nice-to-have

| # | Azione |
|---|--------|
| 13 | Split `legal-corpus.ts` (920 righe) in moduli più piccoli |
| 14 | OCR per documenti scansionati |
| 15 | Completare lawyer referral UI |
| 16 | Staging environment Vercel |
| 17 | Endpoint GDPR per cancellazione dati utente |
| 18 | Avvio sviluppo `salva-me` |

---

*Report generato da Claude Opus 4.6 — 1 Mar 2026*
