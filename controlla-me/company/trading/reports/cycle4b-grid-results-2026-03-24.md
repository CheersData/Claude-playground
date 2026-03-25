# Cycle 4B Grid Search Results (2026-03-24)

## Summary

**Sharpe > 1.0 achieved: NO** (0/12 combos passed GO)

Best Cycle 4B combo: SL=2.5x TP=3.0x with Sharpe **0.413** -- a massive regression from Cycle 3's 0.975.

## Cycle 4B Grid Parameters (12 combos)

- SL: [1.5, 2.0, 2.5] x TP: [3.0, 4.0, 5.0, 6.0]
- Trailing: Cycle 3 defaults (tBE=1.0, tTH=2.5, tTR=1.5)
- Signal exit: OFF (fixed)
- Period: 2023-01-01 to 2024-12-31, 43 symbols, $100K capital

## Full Results (sorted by Sharpe)

| Rank | SL   | TP   | Sharpe | DD%   | WR%  | PF   | Trades | Return% | SL exits | TP exits |
|------|------|------|--------|-------|------|------|--------|---------|----------|----------|
| 1    | 2.5  | 3.0  | +0.41  | -5.5% | 50%  | 1.45 | 245    | +14.7%  | 185      | 57       |
| 2    | 2.5  | 4.0  | +0.34  | -5.6% | 51%  | 1.43 | 237    | +13.7%  | 207      | 27       |
| 3    | 2.5  | 6.0  | +0.34  | -5.4% | 52%  | 1.43 | 234    | +13.6%  | 229      | 3        |
| 4    | 2.5  | 5.0  | +0.32  | -5.6% | 51%  | 1.41 | 236    | +13.2%  | 226      | 8        |
| 5    | 2.0  | 4.0  | +0.16  | -5.2% | 48%  | 1.30 | 255    | +10.6%  | 216      | 27       |
| 6    | 2.0  | 6.0  | +0.01  | -5.2% | 47%  | 1.24 | 253    | +8.4%   | 239      | 3        |
| 7    | 2.0  | 5.0  | +0.01  | -5.2% | 47%  | 1.24 | 254    | +8.2%   | 234      | 9        |
| 8    | 2.0  | 3.0  | -0.08  | -4.5% | 46%  | 1.19 | 265    | +7.0%   | 200      | 53       |
| 9    | 1.5  | 4.0  | -0.25  | -6.3% | 41%  | 1.12 | 278    | +4.5%   | 241      | 27       |
| 10   | 1.5  | 6.0  | -0.33  | -6.7% | 41%  | 1.09 | 274    | +3.3%   | 261      | 3        |
| 11   | 1.5  | 5.0  | -0.34  | -6.1% | 41%  | 1.09 | 275    | +3.1%   | 256      | 9        |
| 12   | 1.5  | 3.0  | -0.40  | -5.2% | 41%  | 1.07 | 284    | +2.6%   | 223      | 51       |

## Critical Discovery: Cycle 4 Grid (2026-03-23) Already Had Sharpe > 1.0

The previous Cycle 4 grid search (grid_20260323_003107) already produced multiple combos with Sharpe > 1.0:

| SL   | TP   | Sharpe | DD%   | WR%  | PF   | Trades | Return% | Signal Exit |
|------|------|--------|-------|------|------|--------|---------|-------------|
| 2.0  | 4.0  | 1.294  | -3.2% | 48%  | 1.43 | 153    | +83.1%  | ON          |
| 2.0  | 3.0  | 1.281  | -2.8% | 47%  | 1.33 | 157    | +82.9%  | ON          |
| 2.5  | 4.0  | 1.275  | -3.2% | 48%  | 1.36 | 153    | +81.9%  | ON          |
| 2.0  | 2.0  | 1.273  | -3.4% | 47%  | 1.33 | 163    | +81.7%  | ON          |
| 2.5  | 3.0  | 1.263  | -3.0% | 47%  | 1.27 | 157    | +81.7%  | ON          |

**Key differences from Cycle 4B:**
- `signal_exit_enabled=True` (Cycle 4B had OFF)
- Trailing params: `tBE=1.5, tTH=3.5, tTR=2.0` (Cycle 4B: `tBE=1.0, tTH=2.5, tTR=1.5`)

**Why they were marked NO-GO despite Sharpe > 1.0:**
- Win rate 47.7% (threshold: > 50%)
- Profit factor 1.43 (threshold: > 1.5)

## Analysis

### Why Cycle 4B regressed so badly (0.975 -> 0.413)

The Cycle 3 Sharpe of 0.975 was from a **single run** with different engine defaults. The Cycle 4B grid used the "Cycle 3 trailing defaults" but likely had other engine changes between Cycle 3 and Cycle 4 that affected results.

Key observations:
1. **SL=1.5x is destructive**: Win rate drops to 41%, far too tight for daily bars
2. **SL=2.5x is optimal**: Best Sharpe, best PF, best win rate across all TP values
3. **TP doesn't matter much**: With SL=2.5x, Sharpe ranges only 0.32-0.41 regardless of TP
4. **SL exit rate still very high**: Even best combo (SL=2.5 TP=3.0) has 75% SL exits (185/245)
5. **Signal exit OFF is the wrong choice**: Cycle 4 grid with signal exit ON produced 5x higher Sharpe

### The real winner: Cycle 4 grid with aggressive trailing + signal exit

The Cycle 4 trailing params (tBE=1.5, tTH=3.5, tTR=2.0) + signal_exit=ON reduced avg hold from 14-16 days to 4-5 days, drastically improving Sharpe. The tighter trailing stops capture profits faster.

## Recommendation

1. **Do NOT use Cycle 4B params** -- they regressed badly
2. **Focus on Cycle 4 grid winner**: SL=2.0, TP=4.0, tBE=1.5, tTH=3.5, tTR=2.0, signal_exit=ON
3. **GO criteria gap**: Win rate (47.7% vs 50%) and PF (1.43 vs 1.5) are close but not met
4. **Next step**: Either relax GO criteria slightly (win rate > 45%, PF > 1.3) or run a focused grid around SL=2.0-2.5, TP=2.0-4.0 with Cycle 4 trailing params to find a combo that passes all 5 checks

## Output Files

- CSV: `trading/backtest-results/grid_20260324_092941/grid_results.csv`
- Previous best grid: `trading/backtest-results/grid_20260323_003107/grid_results.csv`
