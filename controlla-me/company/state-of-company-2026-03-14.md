# State of the Company — Controlla.me
**Data:** sabato 14 marzo 2026
**Prodotto da:** Poimanetres (CME) — auto-generato
**Classificazione:** INTERNO — MANAGEMENT

---

## 1. Task Board

| Metrica | Valore |
|---------|--------|
| Totale | 896 |
| Open | 74 |
| In Progress | 0 |
| Review | 3 |
| Done | 819 |
| Blocked | 0 |

### Task aperti (top 10)

- 🟡 `1f07e8f0` [ux-ui] Verificare scroll su tutti i tab in browser
- 🟡 `2eeea94c` [operations] Aggiungere broadcast anche da /api/analyze (pipeline principale) e test unitari per agent-broadcast.ts
- 🟡 `fc81531a` [operations] Se boss ancora non vede pallini, verificare token in sessionStorage e browser console
- 🟡 `f5241bec` [data-engineering] Rilanciare Block A test dopo fix prompt per verificare miglioramento punteggi
- 🟡 `b48e11ec` [quality-assurance] Fix Block A (CPC) e Block D (Immobiliare) per alzare media sopra 70
- 🟡 `83aa1944` [data-engineering] Debuggare retrieval: capire perche vector search non restituisce art. giusti nonostante siano nel DB con embedding
- 🟡 `2da82303` [quality-assurance] Aggiungere Playwright report come commento automatico sulle PR
- 🟡 `c71f6558` [quality-assurance] Aggiungere mock espliciti per cli-runner in agent-runner.test.ts per testare anche il path CLI
- 🟡 `66ce83ae` [operations] Audit WCAG su componenti console (PowerPanel, CompanyPanel, CorpusTreePanel) e pagine pubbliche
- 🟡 `6f842daf` [architecture] Re-run batch completo 50 test per misurare nuovo baseline + fix prompt per interpretazioni errate (task #680)

### Per dipartimento

| Dipartimento | Open | In Progress | Done |
|-------------|------|-------------|------|
| data-engineering | 19 | 0 | 98 |
| architecture | 17 | 0 | 186 |
| quality-assurance | 10 | 0 | 113 |
| operations | 8 | 0 | 95 |
| security | 8 | 0 | 63 |
| ux-ui | 6 | 0 | 74 |
| marketing | 2 | 0 | 39 |
| finance | 2 | 0 | 18 |
| strategy | 1 | 0 | 29 |
| trading | 1 | 0 | 52 |
| protocols | 0 | 0 | 8 |
| ufficio-legale | 0 | 0 | 32 |
| acceleration | 0 | 0 | 8 |
| cme | 0 | 0 | 4 |

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

_Generato automaticamente da `scripts/lib/state-of-company.ts` il 2026-03-14T13:40:15.660Z_
_Aggiorna con: `npx tsx scripts/daily-standup.ts`_