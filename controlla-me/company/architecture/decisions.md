# Architecture Decision Records (ADR)

## Formato

```
### ADR-NNN: Titolo

**Data**: YYYY-MM-DD
**Stato**: proposed | accepted | deprecated | superseded
**Contesto**: Perché serve questa decisione
**Decisione**: Cosa abbiamo deciso
**Conseguenze**: Impatto positivo e negativo
```

## Decisioni

### ADR-001: Struttura Virtual Company

**Data**: 2025-02-28
**Stato**: accepted
**Contesto**: Lo sviluppo era improvvisato, senza persistenza tra sessioni, senza test automatici.
**Decisione**: Creare un'alberatura `company/` con prompt, runbook, e task system su Supabase.
**Conseguenze**: (+) Persistenza, coordinamento, self-testing. (-) ~50 file nuovi, complessità iniziale.

### ADR-002: Task System su Supabase

**Data**: 2025-02-28
**Stato**: accepted
**Contesto**: I dipartimenti devono comunicare e tracciare il lavoro.
**Decisione**: Tabella `company_tasks` su Supabase con CLI per Claude Code.
**Conseguenze**: (+) Persistenza, query, dashboard. (-) Dipendenza da Supabase.

### ADR-003: Cost Tracking per Chiamata

**Data**: 2025-02-28
**Stato**: accepted
**Contesto**: Non sappiamo quanto spendiamo per ogni agente.
**Decisione**: Log ogni chiamata in `agent_cost_log` con costo calcolato da `lib/models.ts`.
**Conseguenze**: (+) Visibilità totale sui costi. (-) 1 INSERT per chiamata agente (trascurabile).

### ADR-004: Dipartimento Security

**Data**: 2026-02-28
**Stato**: accepted
**Contesto**: App legale con documenti sensibili. Vulnerabilità aperte: CSRF, security headers, auth inline, rate limit mancante su payment routes.
**Decisione**: Nuovo dipartimento Security (`company/security/`). Hardening immediato: `requireAuth()` su tutte le route mutanti, CSP+HSTS in `next.config.ts`, `lib/middleware/csrf.ts` per FormData endpoints, rate limit su Stripe e user/usage.
**Conseguenze**: (+) Copertura auth 100% route mutanti, CSRF protection, 7/7 security headers. (-) Nuovo dipartimento da mantenere; CSP `unsafe-inline` necessario per Next.js SSR (mitigazione futura: nonce-based CSP).

### ADR-005: Fix savePhaseTiming — jsonb_set atomico (TD-1)

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: `savePhaseTiming()` in `lib/analysis-cache.ts` esegue 2 roundtrip Supabase per fase (SELECT phase_timing → UPDATE con merge). Con 4 fasi per analisi = 8 roundtrip totali. Latenza extra stimata 50-100ms × 8 = 400-800ms per analisi. Race condition teorica se 2 worker scrivono la stessa sessione contemporaneamente.
**Decisione**: Creare SQL function `update_phase_timing(p_session_id TEXT, p_phase TEXT, p_timing JSONB)` che usa `jsonb_set` atomico — 1 solo UPDATE per fase, nessun SELECT preliminare. Chiamare via `supabase.rpc()`. Migration: `016_savephasetiming_rpc.sql`.
**Conseguenze**: (+) Latenza analisi -400-800ms, race condition eliminata, 8 roundtrip → 4. (-) Richiede migration Supabase SQL Editor. API pubblica di `lib/analysis-cache.ts` invariata — nessuna modifica ai caller.

### ADR-006: Espansione Org Chart — Nuovi Agenti Specializzati

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: L'azienda cresce. Mancano agenti specializzati per: analisi dati/DB, infrastruttura/dipendenze, e UX/design. I dipartimenti esistenti assorbono queste attività in modo disorganizzato.
**Decisione**: Aggiungere 3 nuovi agenti:
- **Data Analyst** (dept: `data-engineering`) — modellazione dato, ottimizzazione schema DB, query analysis, statistiche corpus
- **Sistemista** (dept: `operations`) — dependency audit, performance profiling, infra components, monitoring
- **UI/UX Designer** (dept: `architecture`) — design system, accessibility, component review, user flows
Per ogni agente: creare identity card `company/<dept>/agents/<nome>.md`. Aggiornare `department.md` ospitante.
**Conseguenze**: (+) Responsabilità chiare, task routing migliorato. (-) 3 nuovi file da mantenere, onboarding effort iniziale.

### ADR-007: Report di Dipartimento — Struttura e Storage

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: Il boss vuole visualizzare report strutturati per dipartimento. Serve decidere: filesystem vs DB, formato, trigger di generazione.
**Decisione**:
- Storage: Markdown in `company/<dept>/reports/YYYY-MM-DD.md` (nel repo, versionato con git)
- Formato: header con data + metriche, sezioni highlight/issues/next-steps standardizzate
- Trigger: manuale post-task-done (MVP). Auto-generazione schedulata in roadmap
- UI web: fuori scope MVP — i report sono leggibili dal repo o via `/ops` esistente
**Conseguenze**: (+) Zero dipendenze aggiuntive, leggibile ovunque, versionato. (-) No UI dedicata nell'MVP, generazione manuale richiede disciplina.

### ADR-008: Modello per CME — Sonnet o Opus?

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: CME usa claude-sonnet-4-5 come CEO virtuale. Il boss teme che task strategici complessi (trade-off architetturali, decisioni multi-step) possano risentire delle limitazioni di Sonnet rispetto a Opus.
**Decisione**: **Architettura ibrida** — Sonnet rimane il default per task operativi (code, ADR standard, routing). Opus è riservato a decisioni strategiche ad alto impatto su esplicita richiesta del boss ("usa Opus per questo"). Non auto-escalation perché: (1) costo Opus ~5x Sonnet, (2) Sonnet 4.5 con prompt ben strutturati copre il 90% dei casi CME, (3) la differenza principale è nel ragionamento su ambiguità e contesti molto lunghi — rari nelle sessioni CME tipiche.
**Conseguenze**: (+) Costo controllato, escalation esplicita. (-) Richiede disciplina del boss nel richiedere Opus quando serve.

### ADR-009: Routing Task Company su Modelli Free (Anti-Subscription Drain)

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: Il task-runner usa `claude -p` CLI che consuma la subscription del boss e gira lentamente in modo sequenziale. Task semplici (tagging, mapping, report brevi) non richiedono Claude e potrebbero girare su modelli free.
**Decisione**:
1. Aggiungere campo opzionale `model_tier` ai task company: `free` | `standard` | `complex` (default: `standard`)
2. Creare `scripts/task-runner-api.ts` — alternativo al task-runner, usa `lib/ai-sdk/openai-compat.ts` via API diretta per task `free` (Groq/Cerebras/Mistral)
3. Task `complex` e task senza `model_tier` continuano su claude CLI (o CME manuale in demo)
4. I task correnti non vengono retroattivamente taggati — il campo è opt-in per i nuovi task
**Conseguenze**: (+) Task banali gratis e più veloci, subscription risparmiata. (-) Nuova dipendenza da provider free, qualità modello variabile su task complessi.

### ADR-010: Scheduler CME — Capacity Management e Pianificazione

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: CME non ha visibilità automatica sulla banda dei dipartimenti. Il daily standup è statico. Serve uno scheduler che analizzi il board e proponga task sensati quando i dipartimenti sono idle.
**Decisione**:
- Script `scripts/company-scheduler.ts`: legge board via `company-tasks.ts`, identifica dipartimenti idle (0 task open/in-progress), propone 1-2 task per dipartimento idle basandosi su backlog e priorità aziendale corrente
- Output: report testuale per CME (non auto-crea task — CME approva prima)
- Modello: Groq Llama (free tier) via `lib/ai-sdk/openai-compat.ts` per generare i suggerimenti
- Integrazione: aggiunto al daily standup come step opzionale
**Conseguenze**: (+) CME sempre con lavoro sensato proposto, zero idle. (-) Richiede GROQ_API_KEY configurata; suggerimenti potrebbero non essere sempre rilevanti.

### ADR-011: Strategia Storage — Supabase + Tier di Archiviazione

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: Supabase PostgreSQL ospita 17 tabelle. 4 crescono senza limite: `audit_logs` (50+/analisi), `agent_cost_log` (4+/analisi, NESSUN TTL), `legal_knowledge` (6+/analisi), `document_chunks` (20+/analisi). A 1000 utenti attivi/mese si stimano ~1.7M righe/mese. Supabase Free Tier ha 500MB di DB e 1GB di storage. A crescita sostenuta si supera in 6-12 mesi. La domanda: serve un data lake?

**Analisi opzioni**:

| Opzione | Pro | Contro | Costo |
|---------|-----|--------|-------|
| **A) Restare su Supabase + TTL aggressivi** | Zero complessità aggiunta | Perde dati storici, audit_logs limitati a 12 mesi | Free → $25/mese (Pro) |
| **B) Supabase + Supabase Storage (S3)** | Archivio cold su object storage nativo | Richiede export periodico, query non possibile | $0.021/GB/mese |
| **C) Supabase + Cloudflare R2** | Zero egress cost, S3-compatible, 10GB free | Provider esterno, setup aggiuntivo | Free fino a 10GB |
| **D) Supabase + SQLite locale** | Zero costo, backup locale dei log | Non distribuito, no query in prod | Gratis |
| **E) Full data lake (BigQuery/Snowflake)** | Query potenti su terabyte | Over-engineering massivo, costo significativo | $5+/mese minimo |

**Decisione**: **Opzione A + C in roadmap**.

**Fase 1 (ora)**: Aggiungere TTL a `agent_cost_log` (6 mesi — oltre non serve per analytics operativo). Creare RPC `cleanup_old_cost_logs()` con lo stesso pattern di `cleanup_old_audit_logs()`. Questo è l'unico gap attivo — le altre 3 tabelle hanno già TTL funzionanti.

**Fase 2 (quando Supabase Free si riempie)**: Upgrade a Supabase Pro ($25/mese, 8GB DB) — sufficiente per ~2 anni di crescita a 1000 utenti.

**Fase 3 (se servono analytics storici)**: Export mensile su Cloudflare R2 (JSON/Parquet) delle righe scadute prima del cleanup. R2 ha 10GB free e zero costi di egress. Non serve un data lake: le query analitiche le facciamo su Supabase con finestra rolling (ultimi 6-12 mesi).

**Cosa NON fare**: BigQuery, Snowflake, o data lake dedicati. Siamo un prodotto SaaS legale, non un data warehouse. Il volume prevedibile non lo giustifica nemmeno a 10x la scala attuale.

**Conseguenze**: (+) agent_cost_log coperto, roadmap chiara per scaling. (-) Fase 3 richiede script di export (effort: 2h). Nessuna complessità aggiunta ora.
