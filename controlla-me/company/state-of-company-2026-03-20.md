# State of the Company — Controlla.me
**Data:** venerdì 20 marzo 2026
**Prodotto da:** Poimanetres (CME) — auto-generato
**Classificazione:** INTERNO — MANAGEMENT

---

## 1. Task Board

| Metrica | Valore |
|---------|--------|
| Totale | 1000 |
| Open | 37 |
| In Progress | 0 |
| Review | 6 |
| Done | 933 |
| Blocked | 0 |

### Task aperti (top 10)

- 🟡 `ea992bd0` [architecture] QA: test su scenario con molti processi zombie
- 🟡 `6fdac3b4` [ux-ui] Verificare visivamente su /ops → Terminali che la sezione appaia correttamente
- 🟡 `2e091fbe` [quality-assurance] Fix 5 test failures in vector-store-search.test.ts: aggiornare threshold da 0.7/0.55 a 0.4
- 🟡 `99891543` [security] Applicare npm audit fix per fast-xml-parser. Schedulare upgrade next@16.2.0 con QA validation.
- 🟡 `cea1ef2d` [operations] Testare il ciclo completo in produzione: daemon genera direttiva, /ops la rileva, CME la esegue. Verificare edge case: t
- 🟡 `da890bb5` [operations] Due follow-up: (1) Registrare skill executors per operazioni reali di ogni dept (run-tests, type-check, lint-check, sync
- 🟡 `4eb353a0` [architecture] Implementare Critic Agent in orchestrator.ts (Ufficio Legale + Architecture). Fase 1: agent + prompt + wire nel pipeline
- 🟡 `b1467a80` [architecture] Fase 1: UI rating widget + migration analysis_feedback (UX/UI + Architecture). Fase 2: LLM-as-judge post-Advisor (Uffici
- 🟡 `fc64b0c0` [trading] Backtest A/B: old entry logic (2-factor) vs new (3-factor) con stessi SL/TP params per isolare la regressione
- 🟡 `286f3518` [architecture] Aggiornare test mock OAuth2 per nuovo flusso PKCE

### Per dipartimento

| Dipartimento | Open | In Progress | Done |
|-------------|------|-------------|------|
| architecture | 10 | 0 | 249 |
| operations | 8 | 0 | 118 |
| quality-assurance | 7 | 0 | 104 |
| ux-ui | 4 | 0 | 110 |
| security | 3 | 0 | 56 |
| data-engineering | 2 | 0 | 100 |
| finance | 2 | 0 | 22 |
| trading | 1 | 0 | 58 |
| marketing | 0 | 0 | 35 |
| strategy | 0 | 0 | 24 |
| ufficio-legale | 0 | 0 | 34 |
| protocols | 0 | 0 | 9 |
| integration | 0 | 0 | 4 |
| acceleration | 0 | 0 | 8 |
| cme | 0 | 0 | 2 |

## 2. Corpus Legislativo

| Metrica | Valore |
|---------|--------|
| Fonti totali | 43 |
| Fonti caricate | 33 |
| Fonti pianificate | 9 |
| Verticali | legal, hr, tax, commercial |

## 3. Ufficio Trading

| Metrica | Valore |
|---------|--------|
| Modalità | paper |
| Abilitato | ✅ Sì |
| Kill Switch | 🟢 Off |

## 4. Costi API (ultimi 7 giorni)

_Costi non disponibili (SUPABASE_SERVICE_ROLE_KEY mancante)_

## 5. Stato Agenti Runtime

**Tier corrente:** partner

| Agente | Stato |
|--------|-------|
| classifier | ✅ Attivo |
| analyzer | ✅ Attivo |
| investigator | ✅ Attivo |
| advisor | ✅ Attivo |
| corpus-agent | ✅ Attivo |
| question-prep | ✅ Attivo |

---

_Generato automaticamente da `scripts/lib/state-of-company.ts` il 2026-03-20T07:46:49.640Z_
_Aggiorna con: `npx tsx scripts/daily-standup.ts`_