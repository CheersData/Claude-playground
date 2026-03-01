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

### ADR-012: Processo Documentazione e Change Tracking

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: Non esiste un processo che garantisca che ogni modifica sia documentata prima del deploy. CLAUDE.md, ARCHITECTURE.md e le decisioni in decisions.md vengono aggiornati ad hoc. Nessun CHANGELOG. Nessun pre-commit hook. La CI verifica solo lint/test/build.
**Decisione**:
1. **CHANGELOG.md** — formato Keep a Changelog. Sezione `[Unreleased]` per work in progress. Al release: rinominare con data.
2. **docs/DEPLOY-CHECKLIST.md** — checklist obbligatoria pre-deploy (documentazione, quality, security, deploy, post-deploy).
3. **CI step `docs-check`** — su PR verifica che CHANGELOG.md sia stato modificato. Warning (non blocking) per non bloccare hotfix urgenti.
4. **CME responsabile** — alla chiusura di ogni task che modifica codice, CME aggiorna CHANGELOG.md. Alla chiusura di uno sprint, verifica DEPLOY-CHECKLIST.md.
**Conseguenze**: (+) Tracciabilità completa, onboarding facilitato, audit trail per compliance. (-) Overhead marginale (~2 min per task). Warning CI non blocking — se bloccante, i hotfix vengono rallentati.

### ADR-014: Company Scheduler — Piano su Board Vuoto + Approvazione Telegram

**Data**: 2026-03-04
**Stato**: accepted
**Contesto**: CME non aveva un meccanismo automatico per rilevare quando il board si svuotava e pianificare il prossimo sprint. La pianificazione era 100% manuale ad ogni sessione. Il boss vuole: (1) piani generati automaticamente quando open=0 e in_progress=0, (2) approvazione esplicita prima dell'esecuzione, (3) canale di comunicazione asincrono (Telegram) per non richiedere la presenza nella sessione Claude Code, (4) i piani devono includere ragionamento sull'ufficio trading.

**Decisione**:
- Script `scripts/company-scheduler.ts` — processo continuo (come il trading scheduler). Loop principale: Telegram polling ogni 5 secondi + board check ogni 30 minuti.
- Trigger: board vuoto (open=0, in_progress=0) E nessun piano in stato `pending` → genera piano
- Generazione piano: `claude -p` con contesto aziendale + contesto trading. Fallback template se CLI non disponibile.
- Ogni piano include: summary, azioni per dipartimenti (3-5), sezione trading con status + improvements specifiche.
- Invio via Telegram Bot API (fetch nativo, nessun npm package) con bottoni inline ✅ Approva / ❌ Rifiuta.
- Approvazione → task creati automaticamente via `company-tasks.ts create`. Rifiuto → piano scartato, nuovo al prossimo check.
- Piani salvati su filesystem: `company/plans/{id}.json` con status: pending | approved | rejected.
- Senza Telegram (variabili non configurate): piano stampato a console, approvazione manuale.
- Helper Telegram: `scripts/lib/telegram.ts` (sendMessage, editMessage, answerCallback, getUpdates, removeKeyboard).
- Avvio: `AVVIA_COMPANY_SCHEDULER.bat` — disabilita standby Windows, ripristina alla chiusura.
- Variabili necessarie: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

**Conseguenze**: (+) Pianificazione automatica, boss approva da telefono, include sempre ragionamento trading, più piani al giorno possibili. (-) Richiede processo Windows separato sempre attivo; senza Telegram torna a workflow manuale; `claude -p` funziona solo fuori dalla sessione Claude Code (fallback template in-session).

### ADR-013: Dipartimento UX/UI Autonomo

**Data**: 2026-03-01
**Stato**: accepted
**Contesto**: L'agente UI/UX Designer era sotto Architecture (ADR-006) ma non aveva autonomia operativa. Le modifiche UI venivano gestite come sotto-task di Architecture, senza un processo dedicato per design system, accessibilita e brand identity. Con la crescita dell'app (landing, console, dashboard, corpus, pricing) serve un dipartimento focalizzato.
**Decisione**:
1. Creare `company/ux-ui/` come dipartimento autonomo (10° dipartimento)
2. Migrare l'agente `ui-ux-designer` da Architecture a UX/UI
3. Aggiungere `"ux-ui"` al type `Department` in `lib/company/types.ts`
4. Runbook dedicati: `implement-ui-change.md` e `accessibility-audit.md`
5. Il dipartimento e responsabile del Beauty Report (`docs/BEAUTY-REPORT.md`)
6. Flusso: richiesta UI → UX/UI propone mockup → CME approva → UX/UI implementa → QA valida accessibilita
**Conseguenze**: (+) Responsabilita chiara, design system manutenuto, accessibilita come processo. (-) 1 dipartimento in piu da coordinare. L'agente ora implementa codice direttamente (non solo propone), riducendo i passaggi.
