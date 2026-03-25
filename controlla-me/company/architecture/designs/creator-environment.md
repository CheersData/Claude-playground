# Design: /creator Environment per Builder Esterni

> **Task:** #a0fbdea4
> **Dipartimento:** Architecture
> **Data:** 2026-03-24
> **Stato:** DRAFT
> **Autore:** Architecture Department

---

## 1. Scopo

L'ambiente `/creator` e' l'interfaccia dedicata ai builder esterni che costruiscono agenti e servizi sulla piattaforma poimandres.work. Non e' /ops (il centro di comando interno dell'azienda), ma un ambiente self-service per chi vuole creare, testare e deployare i propri team di agenti AI.

### Cosa PUO' fare la piattaforma

- Ospitare team di agenti AI personalizzati (stessa infrastruttura di Ufficio Legale, Trading, Musica)
- Pipeline multi-agente con fallback chain su 7 provider (42+ modelli)
- Tier system (Intern/Associate/Partner) per controllo costi
- SSE streaming real-time per feedback pipeline
- Vector DB (pgvector) per RAG e knowledge base
- Daemon sensor + zombie reaper per monitoring autonomo
- Task board per gestione lavoro degli agenti
- Process monitor per visibilita' su processi attivi

### Cosa NON PUO' fare

- Generare codice arbitrario (gli agenti seguono pipeline predefinite)
- Accedere a risorse del sistema host oltre quelle allocate
- Bypassare i limiti di rate/costo del tier assegnato
- Comunicare direttamente con altri progetti/creator sulla piattaforma
- Usare provider AI non approvati (la lista e' fissa in `lib/models.ts`)

### Come iniziare

1. Registrarsi su poimandres.work (Supabase Auth, OAuth Google/GitHub)
2. Accedere a `/creator` — onboarding guidato in 3 step
3. Creare il primo progetto (nome, descrizione, verticale)
4. La piattaforma genera lo scaffold: department.md, agents/, status.json
5. Il creator puo' chattare con il suo team e iterare

---

## 2. Architettura

### 2.1 Confronto con /ops

| Aspetto | /ops (interno) | /creator (builder esterni) |
|---------|---------------|---------------------------|
| Auth | Whitelist + RBAC (console-token) | Supabase Auth + ruolo `creator` in profiles |
| Tab | 11 tab (dashboard, trading, CME, vision, reports, archive, daemon, agents, integrations, QA, terminals) | 5 tab (Chat, Agents, Tasks, Resources, QA) |
| Chat target | 11 dipartimenti interni | Solo gli agenti del proprio progetto |
| Visibilita' | Tutti i dipartimenti, tutti i costi, tutti i processi | Solo il proprio progetto |
| Daemon | `cme-autorun.ts` globale | Istanza daemon per-progetto (stessa logica, scope ridotto) |
| Zombie reaper | Globale su tutti i processi node | Solo processi del progetto del creator |

### 2.2 Layout

```
+---------------------------------------------------------------+
| HEADER: poimandres.work/creator | Progetto: [dropdown] | User |
+---------------------------------------------------------------+
| TAB BAR: Chat | Agents | Tasks | Resources | QA               |
+---------------------------------------------------------------+
| CONTENT AREA (full height, scrollable per tab)                 |
+---------------------------------------------------------------+
```

L'header mostra il progetto attivo (il creator puo' averne piu' di uno) e lo switch rapido.

### 2.3 Le 5 Tab

#### Tab 1: Chat

**Cosa mostra:** Interfaccia di chat con il team di agenti del progetto. Stessa UX di CompanyPanel ma con target limitati agli agenti definiti nel progetto.

**Dati necessari:**
- Lista agenti del progetto (da `creator_projects.agents` JSONB)
- Storico conversazione (in-memory per sessione, come CompanyPanel)
- Output SSE streaming dalla pipeline agenti

**API chiamate:**
- `POST /api/creator/chat` — SSE stream, stessa logica di `/api/console` ma scoped al progetto
- `GET /api/creator/projects/[id]/agents` — lista agenti con stato

**Riuso da /ops:** Riusa il pattern di CompanyPanel (`components/console/CompanyPanel.tsx`) con queste differenze:
- Target selector limitato agli agenti del progetto (non i dipartimenti interni)
- Nessun accesso a CME o dipartimenti interni
- SSE route dedicata (`/api/creator/chat` invece di `/api/console`)

**Componente:** `CreatorChat.tsx` (wrapper attorno a un CompanyPanel semplificato)

#### Tab 2: Agents

**Cosa mostra:** Lista degli agenti del progetto con stato, configurazione, chain di fallback, toggle enable/disable, log ultime esecuzioni.

**Dati necessari:**
- Definizione agenti dal progetto (nome, ruolo, prompt, chain)
- Stato runtime (running/idle/error)
- Ultimi 10 log per agente (da `agent_cost_log` filtrato per progetto)
- Chain di fallback attiva per ogni agente

**API chiamate:**
- `GET /api/creator/projects/[id]/agents` — lista agenti + stato + config
- `PUT /api/creator/projects/[id]/agents/[agentId]` — aggiorna config agente (prompt, chain, toggle)
- `GET /api/creator/projects/[id]/agents/[agentId]/logs` — ultimi log esecuzione

**Riuso da /ops:** Nessun componente diretto da /ops. `AgentHealth` di /ops e' troppo accoppiato ai dipartimenti interni. Serve componente nuovo.

**Componente:** `AgentDebugPanel.tsx` — card per ogni agente con: nome, ruolo, stato, chain di fallback, toggle, log collassabile.

#### Tab 3: Tasks

**Cosa mostra:** Task board per il progetto, identica concettualmente al task board di /ops ma scoped al progetto del creator.

**Dati necessari:**
- Task del progetto (da `creator_tasks` o da `company_tasks` filtrati per `project_id`)
- Conteggi per stato (open, in_progress, done, blocked)

**API chiamate:**
- `GET /api/creator/projects/[id]/tasks` — lista task con filtri
- `POST /api/creator/projects/[id]/tasks` — crea task
- `PATCH /api/creator/projects/[id]/tasks/[taskId]` — aggiorna stato task

**Riuso da /ops:** Riusa `TaskBoard` e `TaskModal` da `components/ops/` con props per filtrare per progetto. Nessuna modifica ai componenti esistenti, solo wrapping con filtro `projectId`.

**Componente:** `CreatorDashboard.tsx` — wrappa TaskBoard + TaskModal + sommario progetto (nome, creato il, agenti attivi, costo totale).

#### Tab 4: Resources

**Cosa mostra:** Consumo risorse del progetto: costi API per provider/agente, processi attivi, quota utilizzata vs quota disponibile, alerting su soglie.

**Dati necessari:**
- Costi aggregati per periodo (da `agent_cost_log` filtrato per progetto)
- Processi attivi del progetto (da process-monitor, filtrato)
- Quota del piano (da `creator_projects.plan` o `profiles.plan`)
- Limiti tier attivo

**API chiamate:**
- `GET /api/creator/projects/[id]/costs?days=7` — costi aggregati
- `GET /api/creator/projects/[id]/processes` — processi attivi
- `GET /api/creator/projects/[id]/quota` — quota usata/disponibile

**Riuso da /ops:** Riusa `CostSummary` da `components/ops/` con filtro per progetto. Il componente accetta gia' i dati come props, basta passare dati filtrati.

**Componente:** `ResourceMonitor.tsx` — CostSummary + barra quota + lista processi + alert soglie.

#### Tab 5: QA

**Cosa mostra:** Risultati dei test automatici sugli agenti del progetto. Il creator definisce test cases (input atteso -> output atteso) e la piattaforma li esegue periodicamente.

**Dati necessari:**
- Test cases definiti dal creator (da `creator_test_cases`)
- Risultati ultimi run (da `creator_test_results`)
- Metriche qualita': latenza media, success rate, drift detection

**API chiamate:**
- `GET /api/creator/projects/[id]/qa` — test cases + risultati
- `POST /api/creator/projects/[id]/qa/run` — esegui test suite manualmente
- `POST /api/creator/projects/[id]/qa/cases` — crea/aggiorna test case

**Riuso da /ops:** Ispirazione da `QAResultsDashboard` e `LegalQATestPanel` ma troppo specifici per il legale. Serve componente nuovo, piu' generico.

**Componente:** `CreatorQAPanel.tsx` (non in scope per MVP, placeholder con "Coming soon").

---

## 3. Struttura Directory Componenti

```
app/creator/
├── page.tsx                    # Server component wrapper (force-dynamic)
├── CreatorPageClient.tsx       # Client component principale con tab navigation
└── layout.tsx                  # Layout con metadata SEO per /creator

components/creator/
├── CreatorChat.tsx             # Tab Chat — wrapper CompanyPanel semplificato
├── AgentDebugPanel.tsx         # Tab Agents — card agenti con debug info
├── CreatorDashboard.tsx        # Tab Tasks — wrappa TaskBoard per progetto
├── ResourceMonitor.tsx         # Tab Resources — costi + quota + processi
├── CreatorQAPanel.tsx          # Tab QA — test suite (placeholder MVP)
├── CreatorOnboarding.tsx       # Wizard primo accesso (3 step)
├── ProjectSelector.tsx         # Dropdown progetto nell'header
└── CreatorHeader.tsx           # Header con progetto attivo + user info
```

---

## 4. API Endpoints

### 4.1 Autenticazione

**Nessuna whitelist hardcoded.** Il creator si autentica via Supabase Auth (OAuth Google/GitHub). L'accesso a `/creator` richiede:

1. Utente autenticato via Supabase (`requireAuth()` da `lib/middleware/auth.ts`)
2. Ruolo `creator` o superiore nel campo `profiles.role`
3. Almeno un progetto associato (o redirect a onboarding)

Il token di sessione usa lo stesso meccanismo HMAC-SHA256 di `lib/middleware/console-token.ts`, ma con un payload esteso che include `projectId`:

```typescript
interface CreatorTokenPayload extends ConsoleTokenPayload {
  projectId: string;       // Progetto attivo
  projectTier: TierName;   // Tier del progetto (non dell'utente)
}
```

**Differenza chiave vs /ops:** /ops usa `requireConsoleAuth()` che verifica contro la whitelist legacy. /creator usa `requireAuth()` standard di Supabase + check ruolo `creator` nella tabella `profiles`. Zero whitelist.

### 4.2 Endpoints necessari

| Metodo | Path | Scopo | Auth | Rate Limit |
|--------|------|-------|------|------------|
| POST | `/api/creator/chat` | SSE streaming chat con agenti progetto | Supabase + creator | 10/min |
| GET | `/api/creator/projects` | Lista progetti del creator | Supabase + creator | 30/min |
| POST | `/api/creator/projects` | Crea nuovo progetto | Supabase + creator | 5/h |
| GET | `/api/creator/projects/[id]` | Dettaglio progetto | Supabase + owner | 30/min |
| GET | `/api/creator/projects/[id]/agents` | Lista agenti + stato | Supabase + owner | 30/min |
| PUT | `/api/creator/projects/[id]/agents/[agentId]` | Aggiorna config agente | Supabase + owner | 10/min |
| GET | `/api/creator/projects/[id]/agents/[agentId]/logs` | Log esecuzione agente | Supabase + owner | 30/min |
| GET | `/api/creator/projects/[id]/tasks` | Task board progetto | Supabase + owner | 30/min |
| POST | `/api/creator/projects/[id]/tasks` | Crea task | Supabase + owner | 20/min |
| PATCH | `/api/creator/projects/[id]/tasks/[taskId]` | Aggiorna task | Supabase + owner | 20/min |
| GET | `/api/creator/projects/[id]/costs` | Costi aggregati | Supabase + owner | 10/min |
| GET | `/api/creator/projects/[id]/processes` | Processi attivi | Supabase + owner | 10/min |
| GET | `/api/creator/projects/[id]/quota` | Quota usata/disponibile | Supabase + owner | 10/min |
| GET | `/api/creator/projects/[id]/qa` | Test cases + risultati | Supabase + owner | 30/min |
| POST | `/api/creator/projects/[id]/qa/run` | Esegui test suite | Supabase + owner | 2/h |
| POST | `/api/creator/projects/[id]/qa/cases` | CRUD test case | Supabase + owner | 10/min |

### 4.3 Pattern SSE per chat creator

Riusa `createSSEStream()` da `lib/sse-stream-factory.ts`. Stessi eventi di `/api/console`:

```
event: agent   → {phase, status, summary}
event: message → {role: "assistant", content: "..."}
event: error   → {message: "..."}
event: done    → {}
```

Differenza chiave: il routing nel handler non usa `runLeaderAgent()` (che conosce tutti i dipartimenti interni) ma un `runCreatorAgent()` che carica solo gli agenti del progetto dal DB e li esegue con `runAgent()` da `lib/ai-sdk/agent-runner.ts`.

---

## 5. Schema Database

### 5.1 Nuove tabelle

```sql
-- Progetti creator
CREATE TABLE creator_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  vertical TEXT,                          -- es. "legal", "finance", "custom"
  tier TEXT NOT NULL DEFAULT 'intern',    -- tier del progetto
  agents JSONB NOT NULL DEFAULT '[]',    -- definizione agenti [{name, role, prompt, chain}]
  config JSONB NOT NULL DEFAULT '{}',    -- config aggiuntiva
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | archived
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: solo owner vede i propri progetti
ALTER TABLE creator_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_read" ON creator_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "owner_write" ON creator_projects FOR ALL USING (auth.uid() = user_id);

-- Task per progetto (riusa struttura company_tasks)
CREATE TABLE creator_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',   -- open | in_progress | done | blocked
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_agent TEXT,                    -- nome agente assegnato
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creator_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_owner" ON creator_tasks FOR ALL
  USING (project_id IN (SELECT id FROM creator_projects WHERE user_id = auth.uid()));

-- Log costi per progetto (estende agent_cost_log con project_id)
-- Opzione: aggiungere colonna project_id a agent_cost_log esistente
-- oppure filtrare via session_id correlato al progetto.

-- Test cases QA
CREATE TABLE creator_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  agent_name TEXT NOT NULL,
  input_prompt TEXT NOT NULL,
  expected_output JSONB,                  -- pattern matching o keywords attese
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creator_test_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_owner" ON creator_test_cases FOR ALL
  USING (project_id IN (SELECT id FROM creator_projects WHERE user_id = auth.uid()));

CREATE TABLE creator_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_case_id UUID NOT NULL REFERENCES creator_test_cases(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES creator_projects(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  actual_output JSONB,
  latency_ms INTEGER,
  error_message TEXT,
  run_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creator_test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_owner" ON creator_test_results FOR ALL
  USING (project_id IN (SELECT id FROM creator_projects WHERE user_id = auth.uid()));
```

### 5.2 Modifica a profiles

```sql
-- Aggiungere 'creator' alla gerarchia ruoli (tra 'user' e 'operator')
-- In lib/middleware/auth.ts: ROLE_HIERARCHY = ["user", "creator", "operator", "admin", "boss"]
```

---

## 6. Motore Condiviso

### 6.1 Daemon per-progetto

Il daemon del creator NON e' un processo separato. Il daemon globale (`cme-autorun.ts`) viene esteso per scansionare anche i progetti creator attivi:

```
FASE 2 (Vision Scan):
  - Scansiona status.json di tutti i dipartimenti interni (come oggi)
  - NUOVO: scansiona creator_projects con status='active'
    - Per ogni progetto: check agenti, task pendenti, costi ultima settimana
    - Genera signal se costo > soglia o task bloccati da >24h
```

Nessun daemon separato. Il daemon globale e' il sensore unico.

### 6.2 Zombie Reaper

Il zombie reaper in `self-preservation.ts` gia' categorizza i processi per command line. I processi spawned per progetti creator avranno nel command line un marker (`--project=<id>`) che permette al reaper di:

1. Identificarli come `category: "creator-agent"`
2. Applicare lo stesso timeout (30 min) dei worker killable
3. NON toccare processi di altri creator (isolamento per project_id)

### 6.3 Process Monitor

`lib/company/process-monitor.ts` viene esteso con un campo `projectId` opzionale in `MonitoredProcess`. L'API `/api/creator/projects/[id]/processes` filtra per `projectId`.

### 6.4 Tier System

I progetti creator usano lo stesso tier system di `lib/tiers.ts`. Il tier del progetto determina:
- Quale catena di modelli viene usata per ogni agente
- Il tier di default e' `intern` (modelli gratuiti) per contenere i costi
- Il creator puo' upgradare a `associate` o `partner` pagando

---

## 7. Onboarding (Zero Configurazione in 10 Minuti)

### 7.1 Flusso

```
[1] Landing /creator (non autenticato)
    → "Crea il tuo team di agenti AI" + CTA "Inizia gratis"
    → OAuth login (Google/GitHub)

[2] Onboarding Step 1: Nome progetto
    → Input: nome progetto, descrizione (opzionale)
    → Default vertical: "custom"

[3] Onboarding Step 2: Template agenti
    → Scegli tra template predefiniti:
      - "Analisi documenti" (3 agenti: classifier, analyzer, advisor)
      - "Customer support" (2 agenti: router, responder)
      - "Research assistant" (2 agenti: searcher, summarizer)
      - "Custom" (1 agente vuoto, configuri tutto tu)
    → Ogni template genera department.md + agents/*.md + chain di fallback

[4] Onboarding Step 3: Test
    → Chat di prova con il primo agente
    → Messaggio di benvenuto: "Il tuo team e' pronto. Prova a inviare un messaggio."
    → Se il messaggio funziona, redirect a /creator con tab Chat attivo
```

### 7.2 Componente

`CreatorOnboarding.tsx` — wizard 3 step con progress bar. Usa Framer Motion per transizioni. Salva progetto su `creator_projects` al completamento.

### 7.3 Template agenti

I template sono definiti in `lib/creator/templates.ts`:

```typescript
interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  agents: Array<{
    name: string;
    role: string;
    systemPrompt: string;
    chain: ModelKey[];  // catena fallback di default
  }>;
}
```

Il template viene espanso in record JSONB nella colonna `creator_projects.agents` alla creazione del progetto.

---

## 8. Presentazione poimandres.work

### 8.1 Contenuto della landing page /creator

**Hero:** "Costruisci il tuo team di agenti AI"

**Sotto-hero:** "poimandres.work ti da' l'infrastruttura. Tu definisci gli agenti, i prompt e la pipeline. Zero configurazione server, zero gestione modelli, zero DevOps."

**3 card:**
1. **Multi-provider** — 42 modelli AI su 7 provider. Fallback automatico se un provider va giu'. Paghi solo quello che usi.
2. **Operativo in 10 minuti** — Scegli un template, personalizza i prompt, e il tuo team e' live. Nessun server da configurare.
3. **Monitoring incluso** — Dashboard costi, task board, process monitor, zombie reaper. Tutto quello che serve per un sistema in produzione.

**Sezione "Come funziona":**
1. Registrati con Google o GitHub
2. Crea un progetto e scegli un template
3. Personalizza i prompt dei tuoi agenti
4. Testa con la chat integrata
5. Integra via API nel tuo prodotto

**Sezione "Cosa NON facciamo":**
- Non generiamo codice (siamo una piattaforma di orchestrazione agenti)
- Non hostiamo il tuo frontend (forniamo API, tu costruisci la UX)
- Non garantiamo SLA sui provider AI terzi (ma il fallback chain mitiga i downtime)
- Non accediamo ai tuoi dati (RLS Supabase, isolamento per progetto)

**CTA finale:** "Inizia gratis con il tier Intern — modelli gratuiti, zero costi."

---

## 9. Principi di Design

1. **5 tab massimo** — Chat, Agents, Tasks, Resources, QA. Se serve di piu', e' una feature di /ops, non di /creator.

2. **Zero configurazione iniziale** — Il creator sceglie un template e chatta. La configurazione avanzata (chain di fallback, prompt tuning, tier upgrade) e' opzionale e progressiva.

3. **Stesso motore** — Daemon, zombie reaper, process monitor, SSE streaming, tier system, agent-runner sono gli stessi di /ops. Nessuna reimplementazione. Solo scoping per `projectId`.

4. **Creator operativo in 10 minuti** — Dal click su "Inizia" alla prima risposta di un agente: max 10 minuti. Misurato dall'onboarding.

5. **Isolamento per progetto** — RLS su tutte le tabelle. Un creator non vede mai dati di un altro. I processi sono taggati con `projectId` per il zombie reaper.

---

## 10. Fasi di Implementazione

| Fase | Scope | Effort stimato |
|------|-------|----------------|
| 0. Schema DB | Migration `creator_projects`, `creator_tasks`, ruolo `creator` | 1 giorno |
| 1. Auth + Onboarding | `/creator` page + onboarding wizard + template engine | 2 giorni |
| 2. Tab Chat | `CreatorChat.tsx` + `/api/creator/chat` SSE route | 2 giorni |
| 3. Tab Agents | `AgentDebugPanel.tsx` + API CRUD agenti | 1 giorno |
| 4. Tab Tasks | `CreatorDashboard.tsx` (wrappa TaskBoard) + API tasks | 1 giorno |
| 5. Tab Resources | `ResourceMonitor.tsx` + API costs/quota | 1 giorno |
| 6. Tab QA | `CreatorQAPanel.tsx` + API test cases (placeholder MVP) | 0.5 giorni |
| 7. Daemon integration | Estendi cme-autorun.ts per scan progetti creator | 0.5 giorni |
| 8. Landing page | Presentazione poimandres.work/creator | 1 giorno |
| **Totale** | | **~10 giorni** |

---

## 11. Rischi e Mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Creator abusa dei modelli gratuiti (tier Intern) | Costi indiretti per rate limit provider | Rate limit per-progetto + quota giornaliera |
| Prompt injection nei system prompt degli agenti | Sicurezza | Sanitizzazione prompt + sandbox esecuzione |
| Zombie processi creator non rilevati dal reaper | Risorse server | Marker `--project=<id>` nel command line |
| Schema DB creator troppo accoppiato a company_tasks | Manutenzione | Tabelle separate `creator_tasks` con stessa struttura |
| Tier Intern non sufficiente per demo impressionante | Conversione bassa | Template ottimizzati per modelli gratuiti (prompt compatti) |

---

## 12. Decisioni Architetturali

| Decisione | Scelta | Alternativa scartata | Motivazione |
|-----------|--------|---------------------|-------------|
| Auth | Supabase Auth + ruolo `creator` | Token console separato | Niente whitelist, standard OAuth, self-service |
| Isolamento | RLS Supabase per-user + `projectId` filter | Namespace separati | Piu' semplice, gia' collaudato nel progetto |
| Daemon | Estensione daemon globale | Daemon per-progetto | Un solo sensore, meno processi, meno complessita' |
| Task board | Tabella separata `creator_tasks` | Colonna `project_id` in `company_tasks` | Evita inquinamento del task board interno |
| Template agenti | JSONB in `creator_projects.agents` | File su filesystem | Piu' semplice, backup automatico con Supabase, RLS nativo |
