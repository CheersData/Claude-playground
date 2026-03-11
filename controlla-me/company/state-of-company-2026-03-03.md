# State of the Company — Controlla.me
**Data:** martedì 3 marzo 2026
**Prodotto da:** Poimanetres (CME) — auto-generato
**Classificazione:** INTERNO — MANAGEMENT

---

## 1. Task Board

| Metrica | Valore |
|---------|--------|
| Totale | 309 |
| Open | 0 |
| In Progress | 0 |
| Review | 12 |
| Done | 297 |
| Blocked | 0 |

### Task aperti (top 10)

- ⚪ `45ea7b34` [data-engineering] DE planning — nuove fonti da ingestire [IDLE-2026-03-03]
- ⚪ `e037cbf1` [data-engineering] DE planning — nuove fonti da ingestire [IDLE-2026-03-03]
- 🟡 `72bf48d1` [security] Security planning — audit completo [IDLE-2026-03-03]
- 🟡 `bfdaf26a` [security] Security planning — audit completo [IDLE-2026-03-03]
- 🟡 `a2d6e83e` [quality-assurance] QA planning — copertura test [IDLE-2026-03-03]
- 🟡 `8ca7c08d` [quality-assurance] QA planning — copertura test [IDLE-2026-03-03]
- 🟡 `bfadad14` [architecture] Architecture review — tech debt e miglioramenti [IDLE-2026-03-03]
- 🟡 `50fa7077` [architecture] Architecture review — tech debt e miglioramenti [IDLE-2026-03-03]
- 🟡 `b0d049b0` [marketing] Marketing planning — nuovi contenuti [IDLE-2026-03-03]
- 🟡 `1b98177a` [marketing] Marketing planning — nuovi contenuti [IDLE-2026-03-03]

### Per dipartimento

| Dipartimento | Open | In Progress | Done |
|-------------|------|-------------|------|
| data-engineering | 0 | 0 | 42 |
| security | 0 | 0 | 29 |
| quality-assurance | 0 | 0 | 50 |
| architecture | 0 | 0 | 88 |
| marketing | 0 | 0 | 11 |
| strategy | 0 | 0 | 11 |
| ux-ui | 0 | 0 | 6 |
| ufficio-legale | 0 | 0 | 10 |
| trading | 0 | 0 | 17 |
| operations | 0 | 0 | 19 |
| protocols | 0 | 0 | 1 |
| finance | 0 | 0 | 8 |
| cme | 0 | 0 | 3 |
| acceleration | 0 | 0 | 2 |

## 2. Corpus Legislativo

| Metrica | Valore |
|---------|--------|
| Fonti totali | 29 |
| Fonti caricate | 28 |
| Fonti pianificate | 0 |
| Verticali | legal, hr, tax, commercial |

## 3. Ufficio Trading

| Metrica | Valore |
|---------|--------|
| Modalità | paper |
| Abilitato | ✅ Sì |
| Kill Switch | 🟢 Off |
| Fase | Backtest tuning in corso (Sharpe 0.975 — gap 0.025 da soglia 1.0) |

### Sessione 2026-03-03 — Lavoro completato

**Slope+Volume Strategy — Fix e miglioramenti:**

| Area | Dettaglio |
|------|-----------|
| **Inverse ETF** | SH, PSQ, DOG, SPXS, SQQQ — logica `require_reversal=False`, mai SHORT, force COVER su short errati |
| **Telegram** | `telegram.py` Python puro — notify_trades, notify_kill_switch, notify_daily_report (16:30 ET) |
| **P&L logging** | Log su chiusura posizione con entry_price, exit_price, pnl, outcome (WIN/LOSS) |
| **Slope diagnostics** | `slope_no_signal` log per inverse ETF — mostra slope_pct, dir, reason ad ogni ciclo |
| **Diversificazione** | 20 simboli: SPY/QQQ/IWM + 9 sector ETF + TLT/GLD/USO/DBA + SH/PSQ + NVDA |
| **Data feed** | Tiingo IEX real-time (zero delay vs Alpaca 15min) |
| **Pending retry** | Fix loop infinito SHORT su inverse ETF + migration 024 DB constraint |
| **Execution** | Cancel ALL open orders prima di SELL (fix bracket OCO che trattiene azioni) |

**Performance live oggi (paper):**

| Trade | Entry | Exit | P&L | Outcome |
|-------|-------|------|-----|---------|
| SH BUY 272 | $36.42 | $36.38 | -$10.85 (-0.11%) | ❌ LOSS |
| PSQ BUY 319 | $31.01 | $31.05 | +$12.76 (+0.13%) | ✅ WIN |
| **Netto** | | | **+$1.91** | 🟡 Flat — mercato laterale |

**Stato attuale:** sistema in attesa — slopes SH/PSQ sotto soglia 0.01%/bar. Rientra automaticamente al prossimo trend.

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

_Generato automaticamente da `scripts/lib/state-of-company.ts` il 2026-03-03T08:44:23.314Z_
_Aggiorna con: `npx tsx scripts/daily-standup.ts`_