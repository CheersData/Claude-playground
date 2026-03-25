# Dual Strategy Backtest: MACD Daily vs Slope+Volume Intraday

**Date:** 2026-03-22
**Task:** #c115397e
**Author:** Trading Department

---

## Executive Summary

Both strategies fail GO/NO-GO criteria. The slope_volume intraday strategy on 5Min bars is **catastrophically worse** than the daily MACD strategy. The slope strategy has a fundamental structural problem: it generates entries that are immediately stopped out, resulting in a 14% win rate and consistent capital destruction.

**Verdict: NO-GO for both strategies. Slope+volume on 5Min requires a complete redesign before further testing.**

---

## Backtest Configurations

| Parameter | MACD Daily (Run A) | MACD Daily (Run B) | Slope 5Min (Run C) | Slope 5Min (Run D) |
|-----------|-------------------|-------------------|--------------------|--------------------|
| Period | 2023-01-01 to 2024-12-31 | 2023-01-01 to 2024-12-31 | 2024-07-01 to 2024-12-31 | 2024-01-01 to 2024-12-31 |
| Universe | 43 symbols (full) | SPY, QQQ, IWM | SPY, QQQ | SPY, QQQ, IWM |
| Capital | $100,000 | $100,000 | $100,000 | $100,000 |
| Slippage | 4 bps | 4 bps | 8 bps | 8 bps |
| SL | 1.5x ATR | 1.5x ATR | 2.0x ATR | 2.0x ATR |
| TP | 3.0x ATR | 3.0x ATR | 6.0x ATR | 6.0x ATR |
| Trend Filter | ON | ON | ON | ON |
| Strategy | trend_following | trend_following | slope_volume | slope_volume |

---

## Results Comparison

### Primary Comparison: Full Universe Daily vs 1-Year Slope

| Metric | MACD Daily (A) 43sym 2yr | Slope 5Min (D) 3sym 1yr | Target | Winner |
|--------|--------------------------|-------------------------|--------|--------|
| **Sharpe Ratio** | -0.397 | -288.951 | > 1.0 | Daily (less bad) |
| **Total Return** | +2.56% | -9.13% | positive | Daily |
| **CAGR** | +1.28% | -9.16% | > 4% | Daily |
| **Max Drawdown** | -5.23% | -9.13% | < 15% | Daily |
| **Win Rate** | 40.8% | 14.0% | > 50% | Daily |
| **Profit Factor** | 1.07 | 0.13 | > 1.5 | Daily |
| **Total Trades** | 284 | 845 | > 100 | Both pass |
| **Avg Win** | +3.30% | +0.13% | -- | Daily |
| **Avg Loss** | -2.12% | -0.15% | -- | Daily |
| **Avg Hold** | 10.5 days | 0.0 days | -- | Daily |
| **Time Invested** | 70.1% | 5.3% | -- | Daily |
| **Kill Switch** | Yes (1x) | No | -- | -- |

### Matched Comparison: Same Symbols (SPY, QQQ, IWM), 2yr Daily vs 6mo Slope

| Metric | MACD Daily (B) 3sym 2yr | Slope 5Min (C) 2sym 6mo |
|--------|-------------------------|-------------------------|
| **Sharpe Ratio** | -2.811 | -264.872 |
| **Total Return** | -0.57% | -2.71% |
| **Win Rate** | 42.9% | 13.8% |
| **Profit Factor** | 1.36 | 0.13 |
| **Total Trades** | 28 | 269 |
| **Avg Hold** | 13.8 days | 0.0 days |

---

## Close Reason Analysis

### MACD Daily (Run A, 284 trades)

| Reason | Count | % |
|--------|-------|---|
| Stop Loss | 223 | 78.5% |
| Take Profit | 51 | 18.0% |
| Kill Switch | 8 | 2.8% |
| End of BT | 2 | 0.7% |

### Slope 5Min (Run D, 845 trades)

| Reason | Count | % |
|--------|-------|---|
| Stop Loss | 538 | 63.7% |
| Slope Exit | 280 | 33.1% |
| Adverse Slope | 27 | 3.2% |

---

## Root Cause Analysis: Why Slope Strategy Fails

### Problem 1: Whipsaw on 5Min bars
The 3-factor entry gate (slope + acceleration + volume) generates signals that are immediately reversed. The slope lookback of 10 bars (50 minutes) is too short to capture meaningful trends, resulting in entries right at local extremes.

### Problem 2: ATR-based stops are too tight on 5Min
The 2.0x ATR stop on 5-minute bars translates to tiny absolute moves (often < 0.2%). Normal market noise triggers stops almost immediately after entry. 538 of 845 trades (63.7%) exit via stop loss.

### Problem 3: Near-zero hold time
Average hold time rounds to 0.0 days, meaning most positions are opened and closed within the same 5-minute bar or the next few bars. The strategy is effectively paying slippage for noise.

### Problem 4: Win/loss ratio cannot compensate
Average win (+0.13%) vs average loss (-0.15%) gives a risk/reward of 0.87:1. Combined with 14% win rate, expected value per trade is deeply negative: `0.14 * 0.13% - 0.86 * 0.15% = -0.111%` per trade.

### Problem 5: Very low exposure
Time invested is only 5.3% (slope) vs 70.1% (daily). The slope strategy is mostly flat, generating 845 trades over 1 year but holding positions for minutes each time. This is high-frequency scalping behavior, not swing trading.

---

## GO/NO-GO Summary

| Check | MACD Daily (A) | Slope 5Min (D) |
|-------|----------------|-----------------|
| Sharpe > 1.0 | FAIL (-0.397) | FAIL (-288.951) |
| Max DD < 15% | PASS (5.23%) | PASS (9.13%) |
| Win Rate > 50% | FAIL (40.8%) | FAIL (14.0%) |
| Profit Factor > 1.5 | FAIL (1.07) | FAIL (0.13) |
| Total Trades > 100 | PASS (284) | PASS (845) |
| **VERDICT** | **NO-GO** | **NO-GO** |

---

## Recommendations

### For Slope+Volume Strategy (critical path)

1. **Do NOT proceed to paper trading.** The strategy is fundamentally broken on 5Min bars.

2. **Consider longer timeframes:** Test slope_volume on 15Min or 1Hour bars. The 5-minute granularity produces too much noise for OLS regression-based signals.

3. **Widen stop losses dramatically:** On 5Min bars, SL needs to be 5-10x ATR minimum, or use time-based stops instead of price-based.

4. **Add minimum hold period:** Force positions to stay open for at least 6-12 bars (30-60 minutes on 5Min) before any exit logic triggers.

5. **Re-evaluate the persistence requirement:** Current `persistence_bars=8` means 40 minutes of consistent slope direction. This may be filtering out all good entries and only letting through late entries at trend exhaustion.

### For MACD Daily Strategy

1. **SL exit rate remains too high (78.5%).** Cycle 4 reduced SL from 2.5 to 1.5x ATR, which made it worse (tighter SL = more stops). Consider reverting to SL=2.5x.

2. **Proceed with Cycle 4 grid search** as planned in the runbook, testing SL range [1.5, 2.0, 2.5] and TP range [2.0, 3.0, 4.0, 5.0, 6.0].

3. **The kill switch triggered on 2024-09-03**, cutting off potential recovery. Investigate whether the kill switch threshold (-2% daily) is too aggressive.

---

## Backtest Artifacts

| Run | Directory | Strategy |
|-----|-----------|----------|
| A | `trading/backtest-results/20260322_233012/` | MACD Daily, 43 symbols, 2yr |
| B | `trading/backtest-results/20260322_235000/` | MACD Daily, 3 ETFs, 2yr |
| C | `trading/backtest-results/20260322_234920/` | Slope 5Min, 2 ETFs, 6mo |
| D | `trading/backtest-results/20260322_235347/` | Slope 5Min, 3 ETFs, 1yr |
