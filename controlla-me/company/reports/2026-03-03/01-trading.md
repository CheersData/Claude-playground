# Report Ufficio Trading — 3 marzo 2026

**Leader:** trading-lead
**Stack:** Python / Alpaca Markets (paper)
**Fase:** 1 — Paper Trading attivo (avvio 2026-03-02, review deadline 2026-04-02)

---

## STATO CORRENTE

| Metrica | Valore | Target |
|---------|--------|--------|
| Mode | Paper | Live (dopo review) |
| Posizioni aperte | 6 (GLD, USO, RTX, WMT, ARKK, XOM) | max 10 |
| Kill switch | OFF | — |
| Sharpe (backtest unificato) | -0.112 | > 1.0 |
| Win Rate (backtest) | 60.9% | > 60% ✅ |
| Profit factor | 1.52 | > 1.5 ✅ |
| Return backtest | +28.63% | positivo ✅ |

---

## COSA È STATO FATTO

- ✅ Pipeline 5+1 agenti completa (Scanner → Signal → Risk → Executor → Trailing → Monitor)
- ✅ Trailing stop 4-tier implementato (breakeven / lock / trail / tight) — parità backtest/live
- ✅ Slope+volume strategy attiva su SPY (scheduler hourly 16-21 CET)
- ✅ Fix SELL orders (position_size NULL risolto)
- ✅ Composite scoring unificato (`analyze_composite()` in `src/analysis.py`)
- ✅ Schema DB migration 021 (trailing_stop_state)
- ✅ Paper trading avviato 2026-03-02

---

## PROBLEMA CRITICO — Sharpe Negativo

**Causa identificata:** `require_macd_crossover=True` (hard-gate) troppo restrittivo:
1. AND-logic elimina troppi candidati
2. RSI gate 25-65 troppo stretto
3. SMA50 gate blocca pullback validi
4. MACD crossover lookback=3 troppo corto

**Soluzione:** Grid search 96 combo su `TP/SL + trail tiers + soft-scoring`.
Preset `--grid-preset tpsl` già implementato e pronto.

**Dato mancante:** Dati SPY 5-min per backtest slope+volume strategy.
Il backtest corrente usa solo daily OHLCV — non valida correttamente la logica intraday.

---

## TASK APERTI OGGI

| # | Task | Priorità | Effort |
|---|------|----------|--------|
| 1 | Grid search 96 combo TP/SL composito scoring | CRITICAL | ~4h |
| 2 | Fetch SPY 5-min storici 6 mesi (prerequisito) | HIGH | ~1h |
| 3 | Slope+volume backtest 5-min vs daily MACD | HIGH | ~3h |

---

## RISCHI

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Sharpe < 1.0 a review | Alta | No go-live | Grid search oggi |
| Kill switch -2% daily | Bassa | Stop paper | Monitor attivo |
| Alpaca paper API down | Bassa | Nessun trade | Retry 3x nel codice |

---

## PROSSIMI MILESTONE

| Data | Milestone |
|------|-----------|
| 2026-03-03 | Grid search completato — nuovi parametri validati |
| 2026-03-15 | Backtest 5-min slope+volume con dati reali |
| 2026-04-02 | Review 30gg paper trading — go/no-go live |
