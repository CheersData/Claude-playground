# Agent Specializations — Design Map

**Task #293 | Autore: CME | Data: 2026-03-03**

Per ogni dipartimento: specializzazioni necessarie, ruolo, dipendenze.

---

## Principio guida

Ogni dipartimento passa da 1 generalista a N specialisti solo quando:
1. Il volume di lavoro lo giustifica
2. Le specializzazioni sono abbastanza distinte da non duplicarsi
3. Il corpus / dati necessari esistono già

---

## Ufficio Legale

| Specialista | Ruolo | Trigger |
|-------------|-------|---------|
| `legal-classifier` | Classificazione documenti | Già implementato (Haiku) |
| `legal-analyzer` | Analisi rischi clausole | Già implementato (Sonnet) |
| `legal-investigator` | Ricerca legge + web_search | Già implementato (Sonnet+tools) |
| `legal-advisor` | Consiglio finale | Già implementato |
| `corpus-agent` | Q&A corpus legislativo | Già implementato |
| `hr-analyzer` | Analisi contratti lavoro | **Da creare** — quando corpus HR completo |
| `tax-analyzer` | Analisi clausole fiscali | **Da creare** — quando corpus TAX completo |
| `real-estate-analyzer` | Analisi contratti affitto/compravendita | Partially covered (Analyzer generico) |

---

## Data Engineering

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `connector-specialist` | Fetch e retry connettori (Normattiva, EUR-Lex, INPS) | Alta |
| `parser-specialist` | Parsing AKN XML, HTML, PDF, CCNL | Alta |
| `validator-specialist` | QA dati ingestiti, schema check | Media |
| `embeddings-specialist` | Gestione embedding batch, aggiornamenti voyage-law-2 | Bassa |
| `sync-monitor` | Monitoring TTL sync, alert delta | Media |

---

## Quality Assurance

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `unit-test-runner` | Test unitari (Vitest) su agenti e lib | Alta |
| `e2e-runner` | Test E2E Playwright su flussi critici | Alta |
| `adversarial-tester` | Stress test corpus agent (testbook + adversarial) | Media |
| `regression-guard` | CI check: build, typecheck, nessuna regressione | Alta |

---

## Architecture

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `architect-reviewer` | ADR, review PRs, stime costi | Alta |
| `perf-optimizer` | Performance, bundle size, query optimization | Media |
| `scalability-planner` | Pianificazione multi-verticale, infra | Bassa |

---

## Operations

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `ops-monitor` | Health check agenti, alert runtime | Alta |
| `dashboard-builder` | /ops UI, nuove metriche | Media |
| `cron-manager` | Scheduler, job status, TTL cleanup | Media |

---

## Trading

| Specialista | Ruolo | Già esiste |
|-------------|-------|-----------|
| `market-scanner` | Screening S&P500+NASDAQ pre-market | ✅ |
| `signal-generator` | Analisi tecnica + segnali BUY/SELL | ✅ |
| `risk-manager` | Position sizing, kill switch | ✅ |
| `executor` | Bracket orders su Alpaca | ✅ |
| `portfolio-monitor` | P&L, trailing stops, daily report | ✅ |
| `backtest-engine` | Backtest strategie su dati storici | Fase 2 |

---

## Security

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `route-auditor` | Audit route HTTP, auth check | Alta |
| `dependency-scanner` | npm audit, CVE check | Media |
| `gdpr-monitor` | TTL dati, DPA compliance, EU AI Act | Bassa |

---

## Strategy + Marketing

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `market-researcher` | Analisi competitor, segnali mercato | Media |
| `opportunity-analyst` | Nuovi verticali, OKR | Media |
| `growth-hacker` | Acquisizione utenti, SEO | Bassa (post-lancio) |
| `content-writer` | Articoli legali, landing page | Bassa (post-lancio) |

---

## Finance

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `cost-controller` | Monitoring costi API giornalieri | Alta |
| `budget-planner` | Proiezioni, budget provider | Media |
| `p&l-tracker` | P&L trading vs costi operativi | Media |

---

## Protocols

| Specialista | Ruolo | Priorità |
|-------------|-------|---------|
| `protocol-router` | Classifica richieste L1/L2/L3/L4 | Alta |
| `decision-auditor` | Log decisioni, compliance governance | Media |
| `prompt-optimizer` | Ottimizzazione prompt agenti | Media |

---

## Roadmap implementazione

**Fase 1 (adesso):** Definire identity cards per specialisti non ancora documentati.
- Priority: connector-specialist, parser-specialist (Data Eng)
- Priority: unit-test-runner, e2e-runner, adversarial-tester (QA)
- Priority: cost-controller (Finance)

**Fase 2 (con corpus HR/TAX):** hr-analyzer, tax-analyzer (Ufficio Legale)

**Fase 3 (post-lancio):** growth-hacker, content-writer, market-researcher

