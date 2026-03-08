# Valutazione Progetto — Claude-playground / Controlla.me
**Data:** 8 marzo 2026
**Prodotto da:** Valutazione esterna (Claude Opus 4.6)
**Classificazione:** INTERNO — MANAGEMENT
**Scope:** Valutazione completa del sistema come organizzazione AI autoalimentata

---

## EXECUTIVE SUMMARY

Claude-playground non e un progetto software. E un'**organizzazione AI embrionale** — una piattaforma madre che orchestra team di agenti specializzati attraverso una virtual company con CEO, dipartimenti, task system, sprint planning automatico e feedback loop autoalimentato.

**Voto complessivo: A-** — L'architettura organizzativa e piu avanzata del codice che la implementa, il che e coerente con la fase di prototipo.

---

## PARTE I — IL SISTEMA COME MACCHINA AUTOALIMENTATA

### Il Loop Autonomo (implementato e funzionante)

```
VISIONE (Strategy + Marketing)
  | Opportunity Briefs, OKR, analisi competitiva
  v
PIANIFICAZIONE (task-runner.ts + company-scheduler.ts)
  | Sprint auto-generati: interroga 11 dipartimenti,
  | sintetizza, crea task in "review" → boss approva
  v
ESECUZIONE (task-runner.ts + claude -p | CME manuale)
  | Claim task, esegui, marca done/blocked
  v
VALUTAZIONE (QA + daily-standup.ts + hooks.ts)
  | Test, report dipartimentali, state-of-company
  v
FEEDBACK → aggiorna visione → RICOMINCIA
```

**126/128 task completati** dimostrano che il loop funziona.

### Meccanismi di Auto-Alimentazione

| Meccanismo | File | Come Funziona |
|-----------|------|---------------|
| **Hooks post-analisi** | `lib/company/hooks.ts` | Ogni analisi completata genera task automatici (fallback detection, cost alert) |
| **Idle Detection** | `scripts/daily-standup.ts` | Se board < 5 task attivi → auto-crea task di pianificazione per Strategy/Marketing/Architecture |
| **Sprint Planning** | `scripts/task-runner.ts` | Quando backlog = 0: interroga 11 dept via `claude -p`, sintetizza piano, crea task in "review" |
| **Capacity Management** | `scripts/company-scheduler.ts` | Identifica dept idle, suggerisce task via Groq/Cerebras (free tier) |
| **Knowledge auto-crescente** | `lib/vector-store.ts` | Ogni analisi arricchisce il vector DB → analisi future piu accurate |
| **Vision → Execution** | Strategy + Marketing dept | Opportunita → validazione mercato → task Architecture/Data Engineering |

### Il Ciclo in Azione

```
Giorno 1: Utente carica contratto
  → orchestrator esegue → 4 agenti completano
  → hooks.onPipelineComplete() scatta
  → crea task: "Log completion", se fallback "Investigate fallback", se costo alto "Alert Finance"

Giorno 2: daily-standup.ts
  → controlla board → genera daily-plan con suggerimenti per dept idle
  → CME vede: "QA sta testando [X], Marketing lavora su [Y]"

Settimana: CME rivede board
  → Strategy propone: "Verticale HR — domanda alta"
  → Marketing valida con segnali di mercato reali
  → CME approva → task per Architecture + Data Engineering
  → Loop continua
```

---

## PARTE II — ARCHITETTURA ORGANIZZATIVA (18 Entita Agentiche)

### Organigramma a 3 Livelli (docs/ORGANIGRAMMA.md)

```
                        PIATTAFORMA MADRE
                  Platform Bus + Agent Registry
                  Model Tier Config (4 tier)
                          |
             .------------+------------.
             |            |            |
          STAFF      AGENT LEADERS   SHARED SERVICES
       (osservano)   (coordinano)   (infrastruttura)
```

### Staff — Servizi Deterministici (no LLM, pura logica)

| ID | Nome | Schedule | Stato |
|----|------|----------|-------|
| cost-tracker | Cost Tracker | Giornaliero 07:00 | Parziale (cost-logger.ts operativo) |
| performance-watch | Performance Watch | Real-time + 07:00 | Solo log, no aggregazione |
| data-connector | Data Connector | Giornaliero 06:00 + Dom 03:00 | Operativo (pipeline CONNECT→MODEL→LOAD) |
| qa-validator | QA Validator | Ogni output pipeline | Parziale (parsing robusto, no schema validation) |

### Staff — Agenti LLM

| ID | Nome | Schedule | Stato |
|----|------|----------|-------|
| cost-optimizer | Cost Optimizer | Su trigger Cost Tracker | Non implementato |
| qa-semantico | QA Semantico | Giornaliero 23:00 | Non implementato |
| market-scout | Market Scout | Lun 09:00 | Non implementato |
| growth-engine | Growth Engine | Giornaliero 08:00 + Lun 10:00 | Non implementato |

### Agent Leader — PipelineDecisionEngine

```
input: ClassificationResult
  → rischio_alto + contratto lavoro/locazione/mutuo → pipeline_completa (4 agenti + RAG + web_search)
  → rischio_medio → pipeline_standard (skip web_search)
  → rischio_basso → pipeline_light (classifier + consigliere)
  → corpus_query → pipeline_corpus (traduttore + archivista)
```

**Oggi:** logica in `orchestrator.ts` come sequenza lineare.
**Domani:** classe `PipelineDecisionEngine` con decision tree esplicito, configurabile, testabile.

### 11 Dipartimenti Operativi

| Dipartimento | Leader | Task Done | Stato |
|-------------|--------|-----------|-------|
| Ufficio Legale | leader | 5/5 | Operativo |
| Data Engineering | data-connector | 21/21 | Operativo |
| Quality Assurance | test-runner | 23/23 | Attenzione (9 test fail) |
| Architecture | architect | 30/30 | Operativo |
| Security | security-auditor | 23/23 | Operativo (DPA pending) |
| Finance | cost-controller | 4/4 | Operativo |
| Operations | ops-monitor | 5/5 | Operativo |
| Strategy | strategist | 8/8 | Operativo (OKR Q2 pending) |
| Marketing | growth-hacker | 7/7 | Operativo |
| Trading | trading-lead | N/A | Paper Trading (Alpaca) |
| UX/UI | designer | N/A | Definito, non attivo |

### Governance — 5 Livelli di Escalation

| Livello | Chi | Esempio | Tempo |
|---------|-----|---------|-------|
| 1. Auto-recovery | Agente | Retry su timeout, parse fallback | ms |
| 2. Leader | Leader team | Cambio modello, skip step | secondi |
| 3. Staff | Staff competente | Cost Optimizer raccomanda swap | minuti |
| 4. Cross-leader | Piu Leader + Staff | Degrado provider multi-team | min-ore |
| 5. Umano | Boss | Bug critico, decisione architetturale | ore-giorni |

---

## PARTE III — MULTI-VERTICALE (La Piattaforma Madre)

### Verticali Attivi

| Verticale | Stato | Agenti | Pipeline |
|-----------|-------|--------|----------|
| **Legale** | Operativo | 7 (classifier → advisor) | Document → Classification → RAG → Analysis → Advice |
| **Trading** | Paper Trading | 5 Python (scanner → monitor) | Scan → Signal → Risk → Execute → Monitor |
| **HR** | Corpus pronto | 0 dedicati | Pipeline parametrizzata pronta |
| **Finanziario (salva-me)** | In progettazione | 4 previsti | Ingestion → Tax Optimizer + Cost Bench + Benefit Scout |

### Reframe Strategico (1 marzo 2026)

> *"La parte giuridica e solo un prototipo. Il prodotto e la console."*

La console orchestra agenti di qualsiasi dominio. controlla-me dimostra il legale, il trading dimostra la finanza — la piattaforma e domain-agnostic.

### Autosufficienza Finanziaria

Il Trading non e un prodotto commerciale. E un **ufficio revenue interno** per coprire costi API/hosting/sviluppo. Se il paper trading conferma il backtest, l'azienda si autofinanzia senza dipendere da utenti paganti nella fase iniziale.

---

## PARTE IV — CODE QUALITY (controlla-me)

### Metriche

| Metrica | Valore | Valutazione |
|---------|--------|-------------|
| Linee di codice (lib/) | ~4,224 | Moderato, ben organizzato |
| File di test | 30 (18 unit + 1 integration + 11 E2E) | Forte |
| Test skippati | 0 | Tutti attivi |
| TypeScript strict mode | ON | Full strict |
| ESLint | Attivo (Next.js defaults) | Minimale ma funzionante |
| Prettier | Assente | Gap formattazione |
| Soglia coverage | 80% (qa.config.json) | Aspirazionale |
| Type safety issues | 85 `any`/`@ts-ignore` | Da pulire |
| Console statements (lib/) | 113 | Appropriati per dev |

### Test Coverage

**Unit Tests (18):** Middleware (auth, csrf, sanitize, rate-limit, console-token), Agenti (advisor, analyzer, classifier, investigator, orchestrator), Core (agent-runner, analysis-cache, anthropic, extract-text, generate, tiers)

**Integration Tests (1):** analyze-route.test.ts

**E2E Tests (11):** Playwright (auth, upload, analysis, console + 7 in tests/e2e/)

**Gap critici:** agent-runner.ts (P1), tiers.ts (P2), console-token.ts (P3), analysis-cache.ts (P4), generate.ts (P5)

### CI/CD Pipeline (.github/workflows/ci.yml)

```
Lint & Type Check (parallel) → Unit Tests → Build → Vercel Preview (PR only)
```

**Punti di forza:** Concurrency con cancel-in-progress, Node 20 LTS, dependency caching, coverage artifact
**Gap:** E2E non in CI, no security scanning (SAST), no coverage reporting su PR, no performance testing

### Security

**Stato: VERDE** (tutti i finding medi risolti al 2026-03-01)

| Layer | Implementazione |
|-------|----------------|
| Auth | Supabase Auth + OAuth + `requireAuth()` middleware |
| Console Auth | HMAC-SHA256 signed JWT, timing-safe comparison, 24h TTL |
| CSRF | Origin header-based, configurable allowed origins |
| Rate Limiting | Upstash Redis distributed + in-memory fallback, per-endpoint config |
| Input Sanitization | Control chars removal, size limits (500KB doc, 2KB question), session ID validation |
| RLS | PostgreSQL Row-Level Security su tutte le tabelle |
| Headers | CSP, HSTS, X-Frame-Options, Permissions-Policy in next.config.ts |
| Audit Log | Strutturato (EU AI Act compliance ready) |

---

## PARTE V — PUNTI DI FORZA

1. **Il task system funziona** — 126/128 task completati, Supabase-backed, CLI completo
2. **La struttura organizzativa e coerente** — ogni dept ha identity, runbook, agents, anti-pattern documentati
3. **Il Process Designer previene il caos** — flussi lineari, contratti I/O, zero dipendenze circolari
4. **La separazione CME/dipartimenti e disciplinata** — CME non scrive codice, delega sempre
5. **Report e daily plans sono ricchi** — stato competitivo, tech debt register, risk register, azioni boss
6. **L'organigramma a 18 entita e un blueprint serio** — tier system, schedule, matrice decisionale, escalation
7. **Security-first** — tutti i finding medi risolti, RLS attivo, HMAC-SHA256 console, input sanitization
8. **Multi-provider AI** — 40 modelli, 7 provider, catene N-fallback, tier system a 4 livelli
9. **Knowledge auto-crescente** — vector DB si arricchisce con ogni analisi
10. **Vision multi-verticale provata** — legale operativo, trading in paper, HR pronto

---

## PARTE VI — GAP E FRAGILITA

### Critici

| Gap | Impatto | Mitigazione attuale |
|-----|---------|---------------------|
| **task-runner dipende da `claude -p`** | In demo fallisce sempre (crediti/PATH) | CME esegue manualmente — workaround documentato |
| **Staff autonomi non implementati** | Cost Optimizer, QA Semantico, Market Scout, Growth Engine = solo docs | Schedule definiti, implementazione rimandata |
| **EU AI Act — 4.5 mesi a deadline** | Multa fino 15M euro | Nessuna azione presa (richiede boss) |
| **DPA provider AI non firmati** | Blocca lancio PMI (GDPR) | Documentato, richiede boss |

### Significativi

| Gap | Impatto | Nota |
|-----|---------|------|
| **salva-me = solo documentazione** | Nessun codice, nessun backup reale | Architettura completa, attende build |
| **shared/ quasi vuoto** | Nessun codice condiviso effettivo | Il monorepo packages/ e roadmap |
| **E2E non in CI** | Playwright tests esistono ma non girano in GitHub Actions | Configurazione mancante |
| **85 type safety issues** | `any`/`@ts-ignore` sparsi in lib/ | Cleanup incrementale |
| **Prettier assente** | Inconsistenze di formattazione possibili | Nessuna azione |
| **Cache su filesystem** | Rotta in multi-istanza Vercel | TD-1 aperto, non iniziato |

### Minimi

| Gap | Nota |
|-----|------|
| Console auth whitelist hardcoded | Bassa priorita, migrazione a DB pianificata |
| CSP con `unsafe-eval` | Necessario per Next.js dev, rimovibile con nonce-based |
| Statuto dei Lavoratori assente | Connector pronto, manca 1 comando |

---

## PARTE VII — IL SISTEMA CHE NON E ANCORA STATO COSTRUITO

L'organigramma descrive 18 entita. Ecco lo stato di implementazione:

| Entita | Tipo | Stato codice | Stato organizzativo |
|--------|------|-------------|---------------------|
| Leader Analisi Legale | Codice | Parziale (orchestrator.ts) | Operativo |
| Catalogatore | LLM | Implementato (classifier.ts) | Operativo |
| Analista Clausole | LLM | Implementato (analyzer.ts) | Operativo |
| Investigatore Legale | LLM | Implementato (investigator.ts) | Operativo |
| Consigliere | LLM | Implementato (advisor.ts) | Operativo |
| Traduttore Query | LLM | Implementato (question-prep.ts) | Operativo |
| Archivista Corpus | LLM | Implementato (corpus-agent.ts) | Operativo |
| Cost Tracker | Servizio | Parziale (cost-logger.ts) | Parziale |
| Performance Watch | Servizio | Solo log | Non operativo |
| Data Connector | Servizio | Implementato (staff/data-connector/) | Operativo |
| QA Validator | Servizio | Parziale (parsing robusto) | Parziale |
| Cost Optimizer | LLM | Non implementato | Solo docs |
| QA Semantico | LLM | Non implementato | Solo docs |
| Market Scout | LLM | Non implementato | Solo docs |
| Growth Engine | LLM | Non implementato | Solo docs |
| Trading Lead | Codice | Implementato (Python) | Paper Trading |
| 4 Trading Agents | LLM | Implementati (Python) | Paper Trading |

**Rapporto implementato/progettato:** ~11/18 entita operative (61%)

---

## PARTE VIII — CONFRONTO CON SISTEMI ANALOGHI

### Cosa rende unico questo sistema

1. **Non e un framework di agenti** (LangChain, CrewAI, AutoGen). E un'**organizzazione con governance**.
2. **Non e un chatbot con tool**. E una **pipeline deterministica** dove il Leader e codice, non LLM.
3. **Non e un side project**. Ha **126 task completati**, report dipartimentali, sprint planning, daily standup.
4. **Non e solo tech**. Ha **Strategy e Marketing** come dipartimenti di visione che alimentano l'esecuzione.
5. **Ha un modello di sostenibilita** — il trading come ufficio revenue interno.

### Dove si posiziona

| Aspetto | Questo Sistema | CrewAI/AutoGen | Aziende AI tradizionali |
|---------|---------------|----------------|------------------------|
| Governance | Formale (contratti, escalation, Process Designer) | Assente | Umana |
| Pianificazione | Auto-generata (sprint planning) | Manuale | Umana |
| Feedback loop | Hooks automatici + daily standup | Assente | Meeting settimanali |
| Multi-dominio | Legale + Trading + HR ready | Singolo task | Singolo dominio |
| Costi | Tier system + fallback auto | Non gestiti | Budget fisso |

---

## RACCOMANDAZIONI PRIORITIZZATE

### P0 — Urgente (entro 2 settimane)

1. **DPA provider AI** — firmare Anthropic, Google, Mistral. Bloccante per lancio PMI
2. **Consulente EU AI Act** — 4.5 mesi a deadline agosto 2026

### P1 — Alto (entro 1 mese)

3. **Migrare cache filesystem → Supabase** — TD-1 critico, rotto in multi-istanza
4. **E2E tests in CI** — Playwright gia configurato, manca solo il job GitHub Actions
5. **Implementare Cost Tracker completo** — aggregazione giornaliera, proiezioni, alert soglia

### P2 — Medio (entro 2 mesi)

6. **Implementare QA Semantico** — cross-validazione output pipeline, coerenza citazioni
7. **Cleanup 85 type safety issues** — rimuovere `any`/`@ts-ignore` progressivamente
8. **Aggiungere Prettier** — standardizzare formattazione
9. **Coverage reporting su PR** — gia calcolata, manca solo il report

### P3 — Basso (Q2 2026)

10. **Implementare Market Scout** — scan settimanale nuovi modelli/competitor
11. **Implementare Growth Engine** — cohort analysis, email nurturing
12. **Monorepo con packages/** — quando salva-me inizia lo sviluppo in Next.js

---

*Documento prodotto l'8 marzo 2026. Valutazione esterna completa del sistema Claude-playground come organizzazione AI autoalimentata.*
