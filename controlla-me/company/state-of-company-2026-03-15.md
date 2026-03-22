# State of the Company — Controlla.me
**Data:** domenica 15 marzo 2026
**Prodotto da:** Poimanetres (CME) — auto-generato
**Classificazione:** INTERNO — MANAGEMENT

---

## 1. Task Board

| Metrica | Valore |
|---------|--------|
| Totale | 903 |
| Open | 54 |
| In Progress | 0 |
| Review | 3 |
| Done | 846 |
| Blocked | 0 |

### Task aperti (top 10)

- ⚪ `209c16c0` [data-engineering] Daily DE — corpus sync check [CTRL-2026-03-15]
- ⚪ `492fd390` [finance] Daily FIN — cost tracking [CTRL-2026-03-15]
- 🟡 `d16c8d72` [security] Daily SEC — check variabili e route [CTRL-2026-03-15]
- 🟡 `b26d5c34` [operations] Daily OPS — health check agenti + pipeline [CTRL-2026-03-15]
- 🟠 `0ee73cca` [quality-assurance] Daily QA — test suite + typecheck [CTRL-2026-03-15]
- 🔴 `8afd8407` [operations] Fix daemon executor: claude -p fermo dal 9 marzo
- 🔴 `8565f0eb` [architecture] Fix daemon executor: claude -p fallisce dal 9 marzo
- 🟡 `1f07e8f0` [ux-ui] Verificare scroll su tutti i tab in browser
- 🟡 `2eeea94c` [operations] Aggiungere broadcast anche da /api/analyze (pipeline principale) e test unitari per agent-broadcast.ts
- 🟡 `fc81531a` [operations] Se boss ancora non vede pallini, verificare token in sessionStorage e browser console

### Per dipartimento

| Dipartimento | Open | In Progress | Done |
|-------------|------|-------------|------|
| architecture | 13 | 0 | 191 |
| data-engineering | 9 | 0 | 109 |
| quality-assurance | 9 | 0 | 115 |
| operations | 7 | 0 | 98 |
| ux-ui | 6 | 0 | 74 |
| security | 5 | 0 | 67 |
| finance | 2 | 0 | 19 |
| marketing | 2 | 0 | 39 |
| strategy | 1 | 0 | 29 |
| trading | 0 | 0 | 53 |
| protocols | 0 | 0 | 8 |
| ufficio-legale | 0 | 0 | 32 |
| acceleration | 0 | 0 | 8 |
| cme | 0 | 0 | 4 |

## 2. Corpus Legislativo

| Metrica | Valore |
|---------|--------|
| Fonti totali | 43 |
| Fonti caricate | 33 |
| Fonti pianificate | 8 |
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

_Generato automaticamente da `scripts/lib/state-of-company.ts` il 2026-03-15T09:52:50.207Z_
_Aggiorna con: `npx tsx scripts/daily-standup.ts`_