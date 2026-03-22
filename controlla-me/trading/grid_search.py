#!/usr/bin/env python3
"""
Grid Search — SL_ATR × TP_ATR × slope_threshold optimization.

Loads data ONCE, then runs all parameter combinations reusing the same data.
Prints a sorted table and saves results to CSV.

Usage:
    cd trading
    python grid_search.py
"""

from __future__ import annotations

import csv
import itertools
import sys
import time
from datetime import date, datetime
from pathlib import Path

import structlog

# Configure structlog before any imports that use it
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()

from src.backtest import DataLoader, BacktestConfig, BacktestEngine, calculate_metrics

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_SYMBOLS = [
    "SPY", "QQQ", "IWM", "XLK", "XLF", "XLE", "XLV", "XLI",
    "XLU", "XLP", "XLRE", "XLB", "GLD", "TLT", "SHY", "USO",
    "DBA", "SH", "PSQ", "NVDA",
]

START_DATE = date(2023, 1, 1)
END_DATE = date(2024, 12, 31)
INITIAL_CAPITAL = 100_000.0
TIMEFRAME = "1Day"
STRATEGY = "slope_volume"

# Parameter grid
SL_ATR_VALUES = [1.0, 1.5, 2.0, 2.5, 3.0]
TP_ATR_VALUES = [3.0, 4.0, 5.0, 6.0, 8.0, 10.0]
SLOPE_THRESHOLD_VALUES = [0.005, 0.01, 0.015]

OUTPUT_DIR = Path(__file__).resolve().parent / "backtest-results"


def main() -> int:
    total_combos = len(SL_ATR_VALUES) * len(TP_ATR_VALUES) * len(SLOPE_THRESHOLD_VALUES)

    print(f"\n{'='*80}")
    print(f"  GRID SEARCH — SL_ATR x TP_ATR x slope_threshold")
    print(f"  Period: {START_DATE} -> {END_DATE} | Strategy: {STRATEGY}")
    print(f"  Symbols: {len(DEFAULT_SYMBOLS)} | Capital: ${INITIAL_CAPITAL:,.0f}")
    print(f"  SL_ATR:           {SL_ATR_VALUES}")
    print(f"  TP_ATR:           {TP_ATR_VALUES}")
    print(f"  slope_threshold:  {SLOPE_THRESHOLD_VALUES}")
    print(f"  Total combinations: {total_combos}")
    print(f"{'='*80}\n")

    # --- Step 1: Load data ONCE ---
    print("Loading data (will be cached for all combos)...")
    loader = DataLoader()
    data = loader.load(
        symbols=DEFAULT_SYMBOLS,
        start=START_DATE,
        end=END_DATE,
        timeframe=TIMEFRAME,
    )

    if not data:
        print("ERROR: No data loaded. Check API keys or install yfinance: pip install yfinance")
        return 1

    total_bars = sum(len(df) for df in data.values())
    print(f"Data loaded: {len(data)} symbols, {total_bars} total bars\n")

    # --- Step 2: Run all combinations ---
    combinations = list(itertools.product(SL_ATR_VALUES, TP_ATR_VALUES, SLOPE_THRESHOLD_VALUES))
    results: list[dict] = []
    start_time = time.time()

    for idx, (sl_atr, tp_atr, slope_thresh) in enumerate(combinations, 1):
        elapsed = time.time() - start_time
        eta = (elapsed / idx * (total_combos - idx)) if idx > 1 else 0

        print(
            f"  [{idx:>3}/{total_combos}] SL={sl_atr:.1f}x TP={tp_atr:.1f}x slope={slope_thresh:.3f} ... ",
            end="",
            flush=True,
        )

        try:
            config = BacktestConfig(
                start=START_DATE,
                end=END_DATE,
                initial_capital=INITIAL_CAPITAL,
                timeframe=TIMEFRAME,
                strategy=STRATEGY,
                # Grid parameters
                stop_loss_atr=sl_atr,
                take_profit_atr=tp_atr,
                slope_threshold_pct=slope_thresh,
                # Fixed defaults for the rest
                trend_filter=True,
                max_positions=10,
                signal_threshold=0.3,
                # Trailing stop: use grid-optimal from previous runs
                trailing_breakeven_atr=1.5,
                trailing_lock_atr=1.5,
                trailing_lock_cushion_atr=0.5,
                trailing_trail_threshold_atr=3.5,
                trailing_trail_distance_atr=2.0,
                trailing_tight_threshold_atr=4.0,
                trailing_tight_distance_atr=1.0,
                # Signal exit off (Cycle 3 baseline)
                signal_exit_enabled=False,
                # Slope exit on (core of slope_volume strategy)
                slope_exit_enabled=True,
            )

            engine = BacktestEngine(config)
            result = engine.run(data)
            metrics = calculate_metrics(result)

            row = {
                "stop_loss_atr": sl_atr,
                "take_profit_atr": tp_atr,
                "slope_threshold_pct": slope_thresh,
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
                "final_equity": metrics.final_equity,
                "stop_loss_count": metrics.stop_loss_count,
                "take_profit_count": metrics.take_profit_count,
                "signal_exit_count": metrics.signal_exit_count,
                "slope_exit_count": metrics.slope_exit_count,
                "adverse_slope_exit_count": metrics.adverse_slope_exit_count,
                "go_nogo": metrics.go_nogo["pass"],
            }
            results.append(row)

            go_str = "GO" if row["go_nogo"] else "NO-GO"
            sl_exits = metrics.stop_loss_count
            tp_exits = metrics.take_profit_count
            slope_exits = metrics.slope_exit_count + metrics.adverse_slope_exit_count
            print(
                f"Sharpe={metrics.sharpe_ratio:+.3f} "
                f"Ret={metrics.total_return_pct:+.1f}% "
                f"DD={metrics.max_drawdown_pct:.1f}% "
                f"WR={metrics.win_rate_pct:.0f}% "
                f"PF={metrics.profit_factor:.2f} "
                f"T={metrics.total_trades} "
                f"(SL={sl_exits} TP={tp_exits} Slope={slope_exits}) "
                f"[{go_str}]  "
                f"(ETA: {eta:.0f}s)"
            )

        except Exception as e:
            print(f"ERROR: {e}")
            logger.error("grid_run_error", sl_atr=sl_atr, tp_atr=tp_atr, slope=slope_thresh, error=str(e))

    total_time = time.time() - start_time

    # --- Step 3: Sort by Sharpe and save ---
    results.sort(key=lambda r: r.get("sharpe_ratio", -999), reverse=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = OUTPUT_DIR / f"grid_sltp_slope_{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "grid_results.csv"
    if results:
        with open(csv_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)

    # --- Step 4: Print sorted table ---
    print(f"\n{'='*80}")
    print(f"  GRID SEARCH COMPLETE")
    print(f"  Combinations: {total_combos} | Time: {total_time:.0f}s")
    print(f"  Results saved: {csv_path}")
    print(f"{'='*80}")

    go_results = [r for r in results if r.get("go_nogo")]
    print(f"\n  GO results: {len(go_results)}/{total_combos}")

    # Print top 20 results
    top_n = min(20, len(results))
    header = (
        f"  {'#':>3} {'SL':>4} {'TP':>5} {'Slope':>6} | "
        f"{'Sharpe':>7} {'Return%':>8} {'DD%':>6} {'WR%':>5} {'PF':>5} "
        f"{'Trades':>6} {'SL#':>4} {'TP#':>4} {'Slope#':>6} {'GO':>4}"
    )
    print(f"\n  TOP {top_n} COMBINATIONS (sorted by Sharpe):")
    print(header)
    print(f"  {'-'*90}")

    for i, r in enumerate(results[:top_n], 1):
        slope_exits = r.get("slope_exit_count", 0) + r.get("adverse_slope_exit_count", 0)
        go_str = "GO" if r["go_nogo"] else ""
        print(
            f"  {i:>3} "
            f"{r['stop_loss_atr']:>4.1f} "
            f"{r['take_profit_atr']:>5.1f} "
            f"{r['slope_threshold_pct']:>6.3f} | "
            f"{r['sharpe_ratio']:>+7.3f} "
            f"{r['total_return_pct']:>+8.1f} "
            f"{r['max_drawdown_pct']:>6.1f} "
            f"{r['win_rate_pct']:>5.1f} "
            f"{r['profit_factor']:>5.2f} "
            f"{r['total_trades']:>6} "
            f"{r['stop_loss_count']:>4} "
            f"{r['take_profit_count']:>4} "
            f"{slope_exits:>6} "
            f"{go_str:>4}"
        )

    # Print worst 5 for comparison
    if len(results) > 5:
        print(f"\n  BOTTOM 5:")
        print(header)
        print(f"  {'-'*90}")
        for i, r in enumerate(results[-5:], len(results) - 4):
            slope_exits = r.get("slope_exit_count", 0) + r.get("adverse_slope_exit_count", 0)
            go_str = "GO" if r["go_nogo"] else ""
            print(
                f"  {i:>3} "
                f"{r['stop_loss_atr']:>4.1f} "
                f"{r['take_profit_atr']:>5.1f} "
                f"{r['slope_threshold_pct']:>6.3f} | "
                f"{r['sharpe_ratio']:>+7.3f} "
                f"{r['total_return_pct']:>+8.1f} "
                f"{r['max_drawdown_pct']:>6.1f} "
                f"{r['win_rate_pct']:>5.1f} "
                f"{r['profit_factor']:>5.2f} "
                f"{r['total_trades']:>6} "
                f"{r['stop_loss_count']:>4} "
                f"{r['take_profit_count']:>4} "
                f"{slope_exits:>6} "
                f"{go_str:>4}"
            )

    print(f"\n{'='*80}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
