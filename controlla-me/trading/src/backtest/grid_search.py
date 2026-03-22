"""
Grid Search — Automated parameter optimization for backtest strategy.

Tests combinations of parameters and reports which pass go/no-go criteria.
Results saved to CSV sorted by Sharpe ratio.

Usage:
    python -m src.backtest grid --start 2024-03-01 --end 2026-02-28
    python -m src.backtest grid --start 2024-03-01 --end 2026-02-28 --timeframe 1Hour
"""

from __future__ import annotations

import csv
import itertools
import time
from datetime import date, datetime
from pathlib import Path

import structlog

from .data_loader import DataLoader
from .engine import BacktestConfig, BacktestEngine
from .metrics import calculate_metrics

logger = structlog.get_logger()

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "backtest-results"

# Parameter grid — each list will be combined with all others
PARAM_GRID = {
    "stop_loss_atr": [1.0, 1.5, 2.0, 2.5],
    "take_profit_atr": [3.0, 4.0, 5.0, 6.0],
    "trend_filter": [True, False],
    "max_positions": [5, 10],
}

# Focused grid for TP/SL optimization (task 2249c3f4)
# Problem: 92.6% exits on SL with TP=6x (too far). Solution: tighter TP (3-6x).
# Previous grid tested TP=6-10x → all NO-GO. This grid tests TP=3-6x.
# 96 combinations: SL[1.5,2.0,2.5] x TP[3,4,5,6] x trailing[2x2x2] x sigExit=ON
TPSL_OPTIMIZATION_GRID = {
    "stop_loss_atr": [1.5, 2.0, 2.5],
    "take_profit_atr": [3.0, 4.0, 5.0, 6.0],
    # 4-tier trailing stop — test aggressive vs conservative
    "trailing_breakeven_atr": [0.5, 1.5],             # Tier 0: early vs late breakeven
    "trailing_lock_atr": [1.5],                        # Tier 1: fixed (default)
    "trailing_lock_cushion_atr": [0.5],                # Tier 1: fixed (default)
    "trailing_trail_threshold_atr": [2.0, 3.5],       # Tier 2: early vs late trail start
    "trailing_trail_distance_atr": [1.5, 2.0],        # Tier 2: tight vs wide trail
    "trailing_tight_threshold_atr": [4.0],             # Tier 3: fixed (default)
    "trailing_tight_distance_atr": [1.0],              # Tier 3: fixed (default)
    # Signal exit always on (previous grid showed benefit)
    "signal_exit_enabled": [True],
    "trend_filter": [True],
    "max_positions": [10],
}

# Cycle 4 grid — targeted optimization based on Cycle 3 findings (task #991)
#
# CONTEXT:
#   Cycle 3 results: Sharpe 0.975 (target 1.0), 136 trades, 126/136 exits on SL (92.6%).
#   Window: 2023-2024 (2 years), Universe: 43 tickers (S&P500 sector leaders + ETF).
#   Root cause: SL=2.5x hits too often, TP=6.0x almost never reached.
#
# STRATEGY:
#   Hypothesis: Tighter SL (1.5-2.0x) reduces avg loss magnitude. Tighter TP (3-5x)
#   captures more profits before they slip away. Trailing stop kicks in earlier (breakeven
#   at 0.5x instead of 1.5x), locking wins faster. Signal exit ON/OFF comparison finds
#   reversals Cycle 3 missed.
#
# PARAMETER TUNING:
#   - SL: [1.5, 2.0, 2.5] — focus on aggressive (1.5) and grid-optimal (2.0-2.5)
#   - TP: [2.0, 3.0, 4.0, 5.0, 6.0] — full range test (was 3-6, add 2.0)
#   - tBE: [0.5, 1.5] — early (0.5) vs late (1.5) breakeven trigger
#   - tTH/tTR/tTD: [3.5, 2.0] fixed (grid-optimal from prior search)
#   - sigExit: [False, True] — Cycle 3 used OFF; test both
#   - Trailing: enabled (4-tier system)
#
# WINDOW: 2023-01-01 to 2024-12-31 (2 years, NOT 3 — matches Cycle 3)
# UNIVERSE: 43 tickers (S&P500 sector + ETF, same as Cycle 3)
# CAPITAL: 100,000
#
# COMBINATIONS: 3 (SL) x 5 (TP) x 2 (tBE) x 2 (sigExit) x 1 (fixed) = 60
# Wait, recalculating: 3 x 5 x 2 x 2 = 60 combinations (updated from 48 in status.json)
#
# EXPECTED OUTCOMES:
#   - SL-exit rate drops below 80% (from 92.6%)
#   - TP-hit rate increases (from <1%)
#   - Sharpe rises above 1.0 (from 0.975)
#   - Robustness check: no isolated peak in results
CYCLE4_GRID = {
    "stop_loss_atr": [1.5, 2.0, 2.5],                  # 3: aggressive → grid-optimal range
    "take_profit_atr": [2.0, 3.0, 4.0, 5.0, 6.0],      # 5: test full tight range (Cycle 3: 6.0 only)
    # Trailing stop: use grid-optimal from prior searches
    "trailing_breakeven_atr": [0.5, 1.5],              # 2: early breakeven (0.5x) vs late (1.5x)
    "trailing_lock_atr": [1.5],                        # 1: fixed at grid-optimal
    "trailing_lock_cushion_atr": [0.5],                # 1: fixed
    "trailing_trail_threshold_atr": [3.5],             # 1: fixed at grid-optimal (catch 80-90% wins)
    "trailing_trail_distance_atr": [2.0],              # 1: fixed at grid-optimal
    "trailing_tight_threshold_atr": [4.0],             # 1: fixed
    "trailing_tight_distance_atr": [1.0],              # 1: fixed
    # Signal exit: test both (Cycle 3 had OFF → 0.975; test ON)
    "signal_exit_enabled": [False, True],              # 2: Cycle 3 comparison
    "trend_filter": [True],                            # 1: fixed ON
    "max_positions": [10],                             # 1: fixed
}

# Cycle 4B grid — CORRECTED: uses Cycle 3's exact trailing defaults
#
# CONTEXT:
#   Cycle 4 (60 combos) used trailing_trail_threshold=3.5 and trail_distance=2.0
#   (from grid-optimal of prior TP/SL search), but Cycle 3's Sharpe 0.975 was
#   achieved with the CLI defaults: breakeven=1.0, trail_threshold=2.5, trail_distance=1.5.
#   ALL 60 Cycle 4 combos had Sharpe < 0.4 — the trailing params were the difference.
#   Signal exit ON was also confirmed worse (best 0.12 vs 0.35 without).
#
# FIX:
#   - Trailing: FIXED at Cycle 3 CLI defaults (BE=1.0, TH=2.5, TR=1.5)
#   - Signal exit: OFF only (confirmed worse with ON)
#   - SL: [1.5, 2.0, 2.5] — same range as Cycle 4
#   - TP: [3.0, 4.0, 5.0, 6.0] — drop 2.0 (too tight, low expectancy)
#   - Window: 2023-01-01 to 2024-12-31 (2 years, same as Cycle 3)
#
# COMBINATIONS: 3 (SL) × 4 (TP) × 1 = 12 (fast, focused)
CYCLE4B_GRID = {
    "stop_loss_atr": [1.5, 2.0, 2.5],                  # 3: same range
    "take_profit_atr": [3.0, 4.0, 5.0, 6.0],           # 4: practical range (drop 2.0)
    # Trailing stop: FIXED at Cycle 3 CLI defaults (the ones that gave Sharpe 0.975)
    "trailing_breakeven_atr": [1.0],                    # Cycle 3 default
    "trailing_lock_atr": [1.5],                         # Cycle 3 default
    "trailing_lock_cushion_atr": [0.5],                 # Cycle 3 default
    "trailing_trail_threshold_atr": [2.5],              # Cycle 3 default (was 3.5 in Cycle 4!)
    "trailing_trail_distance_atr": [1.5],               # Cycle 3 default (was 2.0 in Cycle 4!)
    "trailing_tight_threshold_atr": [4.0],              # Cycle 3 default
    "trailing_tight_distance_atr": [1.0],               # Cycle 3 default
    # Signal exit: OFF only (confirmed worse with ON in Cycle 4)
    "signal_exit_enabled": [False],
    "trend_filter": [True],                             # fixed ON
    "max_positions": [10],                              # fixed
}


def run_grid_search(
    symbols: list[str],
    start: date,
    end: date,
    initial_capital: float = 100_000.0,
    timeframe: str = "1Day",
    output_dir: Path | None = None,
    param_grid: dict | None = None,
) -> Path:
    """
    Run grid search over parameter combinations.

    Args:
        symbols: List of ticker symbols.
        start: Start date.
        end: End date.
        initial_capital: Initial portfolio capital.
        timeframe: "1Day" or "1Hour".
        output_dir: Custom output directory.
        param_grid: Custom parameter grid (default: PARAM_GRID).

    Returns:
        Path to output directory with results.
    """
    grid = param_grid or PARAM_GRID

    # Generate all combinations
    keys = list(grid.keys())
    values = list(grid.values())
    combinations = list(itertools.product(*values))
    total = len(combinations)

    tf_label = "HOURLY" if timeframe == "1Hour" else "DAILY"
    print(f"\n{'='*70}")
    print(f"  GRID SEARCH [{tf_label}] -- {start} -> {end}")
    print(f"  Capital: ${initial_capital:,.0f} | Symbols: {len(symbols)}")
    print(f"  Parameters: {', '.join(keys)}")
    print(f"  Combinations: {total}")
    print(f"{'='*70}\n")

    # Step 1: Load data once (shared across all runs)
    logger.info("loading_data_for_grid", symbols=len(symbols), timeframe=timeframe)
    loader = DataLoader()
    data = loader.load(symbols, start, end, timeframe=timeframe)

    if not data:
        print("Error: No data loaded. Check API keys and date range.")
        return Path(".")

    total_bars = sum(len(df) for df in data.values())
    logger.info("data_loaded", symbols=len(data), total_bars=total_bars)

    # Step 2: Run all combinations
    results: list[dict] = []
    start_time = time.time()

    for idx, combo in enumerate(combinations, 1):
        params = dict(zip(keys, combo))
        elapsed = time.time() - start_time
        eta = (elapsed / idx * (total - idx)) if idx > 1 else 0

        # Build compact param summary
        param_parts = [
            f"SL={params.get('stop_loss_atr', '-')}x",
            f"TP={params.get('take_profit_atr', '-')}x",
        ]
        if "trailing_breakeven_atr" in params:
            param_parts.append(f"tBE={params['trailing_breakeven_atr']}x")
        if "trailing_trail_threshold_atr" in params:
            param_parts.append(f"tTH={params['trailing_trail_threshold_atr']}x")
        if "trailing_trail_distance_atr" in params:
            param_parts.append(f"tTR={params['trailing_trail_distance_atr']}x")
        if "signal_exit_enabled" in params:
            param_parts.append(f"sigExit={'ON' if params['signal_exit_enabled'] else 'OFF'}")
        param_parts.append(f"trend={'ON' if params.get('trend_filter', True) else 'OFF'}")
        param_parts.append(f"pos={params.get('max_positions', 10)}")

        print(
            f"  [{idx}/{total}] {' '.join(param_parts)} ... ",
            end="",
            flush=True,
        )

        try:
            config = BacktestConfig(
                start=start,
                end=end,
                initial_capital=initial_capital,
                timeframe=timeframe,
                stop_loss_atr=params.get("stop_loss_atr", 2.0),
                take_profit_atr=params.get("take_profit_atr", 4.0),
                trend_filter=params.get("trend_filter", True),
                max_positions=params.get("max_positions", 10),
                signal_threshold=params.get("signal_threshold", 0.3),
                slippage_bps=params.get("slippage_bps", 4.0),
                # 4-tier trailing stop params
                trailing_breakeven_atr=params.get("trailing_breakeven_atr", 1.0),
                trailing_lock_atr=params.get("trailing_lock_atr", 1.5),
                trailing_lock_cushion_atr=params.get("trailing_lock_cushion_atr", 0.5),
                trailing_trail_threshold_atr=params.get("trailing_trail_threshold_atr", 2.5),
                trailing_trail_distance_atr=params.get("trailing_trail_distance_atr", 1.5),
                trailing_tight_threshold_atr=params.get("trailing_tight_threshold_atr", 4.0),
                trailing_tight_distance_atr=params.get("trailing_tight_distance_atr", 1.0),
                # Signal exit
                signal_exit_enabled=params.get("signal_exit_enabled", False),
            )

            engine = BacktestEngine(config)
            result = engine.run(data)
            metrics = calculate_metrics(result)

            row = {
                **params,
                "timeframe": timeframe,
                "total_return_pct": metrics.total_return_pct,
                "cagr_pct": metrics.cagr_pct,
                "sharpe_ratio": metrics.sharpe_ratio,
                "sortino_ratio": metrics.sortino_ratio,
                "max_drawdown_pct": metrics.max_drawdown_pct,
                "win_rate_pct": metrics.win_rate_pct,
                "profit_factor": metrics.profit_factor,
                "total_trades": metrics.total_trades,
                "avg_win_pct": metrics.avg_win_pct,
                "avg_loss_pct": metrics.avg_loss_pct,
                "avg_hold_days": metrics.avg_hold_days,
                "exposure_pct": metrics.exposure_pct,
                "final_equity": metrics.final_equity,
                "stop_loss_count": metrics.stop_loss_count,
                "take_profit_count": metrics.take_profit_count,
                "signal_exit_count": metrics.signal_exit_count,
                "go_nogo": metrics.go_nogo["pass"],
                "kill_switches": 1 if result.kill_switch_triggered else 0,
            }
            results.append(row)

            # Quick summary
            go_str = "GO" if row["go_nogo"] else "NO-GO"
            sl_pct = (metrics.stop_loss_count / metrics.total_trades * 100) if metrics.total_trades > 0 else 0
            print(
                f"Sharpe={metrics.sharpe_ratio:+.2f} "
                f"DD={metrics.max_drawdown_pct:.1f}% "
                f"WR={metrics.win_rate_pct:.0f}% "
                f"PF={metrics.profit_factor:.2f} "
                f"T={metrics.total_trades} "
                f"SL={metrics.stop_loss_count} TP={metrics.take_profit_count} SE={metrics.signal_exit_count} "
                f"[{go_str}]"
                f"  (ETA: {eta:.0f}s)"
            )

        except Exception as e:
            print(f"ERROR: {e}")
            logger.error("grid_run_error", params=params, error=str(e))

    # Step 3: Sort by Sharpe ratio and save
    results.sort(key=lambda r: r.get("sharpe_ratio", -999), reverse=True)

    # Create output directory
    if output_dir is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = DEFAULT_OUTPUT_DIR / f"grid_{timestamp}"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save CSV
    csv_path = output_dir / "grid_results.csv"
    if results:
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)

    total_time = time.time() - start_time

    # Print summary
    print(f"\n{'='*70}")
    print(f"  GRID SEARCH COMPLETE")
    print(f"  Combinations: {total} | Time: {total_time:.0f}s")
    print(f"  Results saved: {csv_path}")
    print(f"{'='*70}")

    # Top 5 by Sharpe
    go_results = [r for r in results if r.get("go_nogo")]
    print(f"\n  GO results: {len(go_results)}/{total}")

    if go_results:
        print(f"\n  TOP GO COMBINATIONS:")
        print(f"  {'SL':>4} {'TP':>4} {'Trend':>5} {'Pos':>3} | {'Sharpe':>7} {'DD%':>6} {'WR%':>5} {'PF':>5} {'Trades':>6} {'Return%':>8}")
        print(f"  {'-'*70}")
        for r in go_results[:10]:
            print(
                f"  {r.get('stop_loss_atr', '-'):>4} "
                f"{r.get('take_profit_atr', '-'):>4} "
                f"{'ON' if r.get('trend_filter', True) else 'OFF':>5} "
                f"{r.get('max_positions', 10):>3} | "
                f"{r['sharpe_ratio']:>+7.2f} "
                f"{r['max_drawdown_pct']:>6.1f} "
                f"{r['win_rate_pct']:>5.0f} "
                f"{r['profit_factor']:>5.2f} "
                f"{r['total_trades']:>6} "
                f"{r['total_return_pct']:>+8.1f}"
            )
    else:
        print(f"\n  TOP 5 BY SHARPE (no GO results):")
        print(f"  {'SL':>4} {'TP':>4} {'Trend':>5} {'Pos':>3} | {'Sharpe':>7} {'DD%':>6} {'WR%':>5} {'PF':>5} {'Trades':>6} {'Return%':>8}")
        print(f"  {'-'*70}")
        for r in results[:5]:
            print(
                f"  {r.get('stop_loss_atr', '-'):>4} "
                f"{r.get('take_profit_atr', '-'):>4} "
                f"{'ON' if r.get('trend_filter', True) else 'OFF':>5} "
                f"{r.get('max_positions', 10):>3} | "
                f"{r['sharpe_ratio']:>+7.2f} "
                f"{r['max_drawdown_pct']:>6.1f} "
                f"{r['win_rate_pct']:>5.0f} "
                f"{r['profit_factor']:>5.2f} "
                f"{r['total_trades']:>6} "
                f"{r['total_return_pct']:>+8.1f}"
            )

    print()
    return output_dir
