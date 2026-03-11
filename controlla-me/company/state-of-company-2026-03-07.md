# State of the Company — Controlla.me
**Data:** sabato 7 marzo 2026
**Prodotto da:** Poimanetres (CME) — auto-generato
**Classificazione:** INTERNO — MANAGEMENT

---

## 1. Task Board

| Metrica | Valore |
|---------|--------|
| Totale | 488 |
| Open | 20 |
| In Progress | 5 |
| Review | 2 |
| Done | 458 |
| Blocked | 3 |

### Task aperti (top 10)

- 🟡 `e7bb10c7` [operations] Hook ops-alerting.ts in cme-autorun PHASE 3
- 🟡 `aaf5aad2` [operations] Implement log rotation in cme-autorun.ts — keep 7 giorni
- 🟡 `38b57ca7` [operations] Add error handling e audit trail a ops-alerting.ts
- ⚪ `8bb30db9` [operations] Add .autorun-prompt.tmp e .autorun.lock a .gitignore
- 🟡 `4cb0dce7` [operations] Fix task counter in cme-autorun.ts — lastTasksExecuted sempre 0
- 🟡 `fdcc1b9d` [operations] Verificare lock file autorun: .autorun.lock potenziale stale lock
- ⚪ `f734008e` [operations] Pulizia: rimuovere file .autorun-prompt.tmp dalla root
- 🟡 `f872b615` [quality-assurance] Health check: npm run build verifica pre-deploy
- 🔴 `6f8a9844` [architecture] CRITICAL: Verificare middleware.ts rename — Next.js routing potenzialmente rotto
- ⚪ `e6fcc304` [security] Defense-in-depth: checkRateLimit su data-connector e debug/stream

### Per dipartimento

| Dipartimento | Open | In Progress | Done |
|-------------|------|-------------|------|
| operations | 4 | 5 | 54 |
| security | 6 | 0 | 40 |
| architecture | 4 | 0 | 111 |
| ux-ui | 3 | 0 | 15 |
| quality-assurance | 1 | 0 | 71 |
| ufficio-legale | 1 | 0 | 15 |
| marketing | 1 | 0 | 16 |
| strategy | 0 | 0 | 16 |
| data-engineering | 0 | 0 | 53 |
| finance | 0 | 0 | 12 |
| acceleration | 0 | 0 | 4 |
| trading | 0 | 0 | 47 |
| protocols | 0 | 0 | 1 |
| cme | 0 | 0 | 3 |

## 2. Corpus Legislativo

| Metrica | Valore |
|---------|--------|
| Fonti totali | 33 |
| Fonti caricate | 32 |
| Fonti pianificate | 0 |
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

_Generato automaticamente da `scripts/lib/state-of-company.ts` il 2026-03-07T23:29:03.297Z_
_Aggiorna con: `npx tsx scripts/daily-standup.ts`_