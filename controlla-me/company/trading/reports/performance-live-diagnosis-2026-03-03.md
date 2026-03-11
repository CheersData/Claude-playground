# Diagnosi Performance Live — 2026-03-03

**Redatto da:** trading-lead
**Task:** #329 — performance live
**Priorità:** HIGH

---

## Executive Summary

Il primo giorno live ha prodotto perdite per **4 cause identificate**, 2 delle quali **già fixate** in questa sessione. La causa principale (data latency) richiede upgrade Alpaca ($30/mese).

---

## Causa #1 — Data Latency 15-20 minuti (CRITICA)

**Root cause:** Alpaca free tier ha 15-20 minuti di delay sui dati di mercato.

Slope è una strategia di **momentum su inversioni di pendenza a 5 minuti**. Con 15-20 minuti di ritardo:
- Il segnale arriva quando il movimento è **già finito**
- Il sistema entra controtendenza rispetto al mercato attuale
- Il prezzo rimbalza immediatamente contro la posizione

**Questo da solo spiega la maggior parte delle perdite.**

**Fix:** Upgrade Alpaca Premium ($30/mese) → elimina il delay.

---

## Causa #2 — Trading H24 (BUG — FIXATO ora)

**Root cause:** `market_open_utc = "00:00"` e `market_close_utc = "23:59"` in `settings.py`.

Lo slope generava segnali 24 ore su 24, inclusi:
- **Pre-market** (09:00-09:30 ET): volumi bassissimi, spread ampi, gap improvvisi
- **After-hours** (16:00-20:00 ET): stessa problematica
- **Overnight**: nessuna liquidità

Su questi orari gli stop loss venivano toccati immediatamente per spread bid/ask.

**Fix applicato:** `market_open_utc = "14:30"`, `market_close_utc = "21:00"` (NYSE regular hours in UTC/EST).
⚠️ Nota: aggiornare a 13:30/20:00 quando EDT è attivo (marzo-novembre).

---

## Causa #3 — Trailing Stop Tier 0 fantasma (BUG — FIXATO ora)

**Root cause:** `trailing_breakeven_atr = 1.5` uguale a `trailing_lock_atr = 1.5`.

Il Tier 0 (breakeven: sposta SL a entry) aveva la stessa soglia del Tier 1 (lock profit). Conseguenza: Tier 0 veniva sovrascritto immediatamente da Tier 1 ad ogni update. Il sistema non aveva mai uno stadio di "breakeven puro" — saltava direttamente al lock.

**Fix applicato:** `trailing_breakeven_atr = 0.5` (soglia Tier 0 a 0.5×ATR di profitto).

Tier system corretto post-fix:
| Tier | Soglia | Azione |
|------|--------|--------|
| 0 | +0.5 ATR | Breakeven: SL → entry |
| 1 | +1.5 ATR | Lock: SL → entry + 0.5 ATR |
| 2 | +3.5 ATR | Trail: SL segue a 2.0 ATR dal massimo |
| 3 | +4.0 ATR | Tight: SL segue a 1.0 ATR dal massimo |

---

## Causa #4 — Nessun segnale SELL dal slope (BUG — già fixato sessione precedente)

**Root cause:** Il codice aveva un commento esplicito: *"SELL is reserved for closing longs (handled by trailing stop, not slope)"*. Slope generava solo BUY e SHORT ma **non chiudeva mai posizioni in perdita** quando la curva invertiva.

**Fix applicato sessione precedente:** `run_slope_volume()` ora genera SELL (chiudi long) quando la pendenza inverte a bearish, e COVER (chiudi short) quando inverte a bullish.

---

## Causa #5 — Parametri TP/SL non ottimizzati per slope 5-min

**Context:** I parametri attuali (`stop_loss_atr=1.5`, `take_profit_atr=3.0`) derivano da default, non da backtest slope.

Il runbook `backtest-5min-slope.md` documenta che il motore di backtest **non usa `analyze_slope_volume`** ma fallback su MACD composite. Quindi nessun backtest reale della strategia slope è mai stato eseguito.

**Conseguenza:** Non sappiamo se R/R 1:2 su 5-min funziona per slope. Il grid search in `grid-search-tpsl.md` testa 96 combinazioni — non è mai stato eseguito su slope.

**Fix raccomandato:** Eseguire backtest slope puro + grid search (vedi Roadmap).

---

## Stato post-fix immediati

| Problema | Status |
|----------|--------|
| No segnali SELL | ✅ Fixato |
| Trading H24 (pre/after market) | ✅ Fixato |
| Trailing stop Tier 0 fantasma | ✅ Fixato |
| Data latency 15-20 min | ⏳ Richiede upgrade Alpaca $30/mese |
| Parametri TP/SL non ottimizzati | ⏳ Richiede backtest slope puro |

---

## Roadmap — Prossimi passi

### Urgente (questa settimana)
1. **Upgrade Alpaca Premium** ($30/mese) — elimina causa principale perdite
2. **Riavviare scheduler** dopo i fix per beneficiare dei fix applicati

### Breve termine (1-2 settimane)
3. **Implementare slope_volume nel backtest engine** — il motore attuale usa MACD, non slope
4. **Eseguire backtest slope** su 6 mesi SPY/NVDA/AAPL con slippage 8bps
5. **Grid search parametri** (96 combinazioni TP/SL/trailing) — runbook già pronto

### Medio termine (dopo 30gg paper)
6. **Time stop**: chiudi automaticamente se posizione non va in profitto entro 30 minuti
7. **DST handling**: aggiornare `market_close_utc` automaticamente in estate (13:30/20:00 UTC)
8. **News signal integration**: Benzinga/NewsAPI per evitare entry su earning releases

---

## File modificati

```
trading/src/config/settings.py
  - trailing_breakeven_atr: 1.5 → 0.5  (fix Tier 0 fantasma)
  - market_open_utc: "00:00" → "14:30"  (fix trading H24)
  - market_close_utc: "23:59" → "21:00"  (fix trading H24)
```
