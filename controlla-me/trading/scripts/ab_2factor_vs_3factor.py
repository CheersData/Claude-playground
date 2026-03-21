#!/usr/bin/env python3
"""
A/B Backtest: 2-factor vs 3-factor entry logic in slope+volume strategy.

2-factor (slope + volume only):
  - slope_min_acceleration_pct = 0.0  (acceleration gate always passes)
  - slope_persistence_bars = 1        (persistence gate trivially passes)

3-factor (slope + volume + acceleration + persistence):
  - slope_min_acceleration_pct = 0.01 (current default)
  - slope_persistence_bars = 8        (current default)

Both use:
  - Same symbols (full watchlist)
  - Same date range: 2023-01-01 to 2024-12-31
  - Same SL/TP: sl_atr=2.5, tp_atr=3.0
  - Same capital: $100,000
  - Strategy: slope_volume on 1Day timeframe

Usage:
    cd trading
    python scripts/ab_2factor_vs_3factor.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

# Ensure trading/ is on sys.path
_SCRIPT_DIR = Path(__file__).resolve().parent
_TRADING_DIR = _SCRIPT_DIR.parent
if str(_TRADING_DIR) not in sys.path:
    sys.path.insert(0, str(_TRADING_DIR))

import structlog

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(colors=True),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger()

# Symbols — same as TRADING_SLOPE_SYMBOLS default
SYMBOLS = [
    "SPY", "QQQ", "IWM", "XLK", "XLF", "XLE", "XLV", "XLI",
    "XLU", "XLP", "XLRE", "XLB", "GLD", "TLT", "SHY", "USO",
    "DBA", "SH", "PSQ", "NVDA",
]

START = date(2023, 1, 1)
END = date(2024, 12, 31)
CAPITAL = 100_000.0
SL_ATR = 2.5
TP_ATR = 3.0


def run_variant(
    label: str,
    data: dict,
    persistence_bars: int,
    min_acceleration_pct: float,
    acceleration_bars: int,
) -> dict:
    """Run a single backtest variant and return metrics dict."""
    from src.backtest.engine import BacktestConfig, BacktestEngine
    from src.backtest.metrics import calculate_metrics

    logger.info(
        f"running_{label}",
        persistence_bars=persistence_bars,
        min_acceleration_pct=min_acceleration_pct,
        acceleration_bars=acceleration_bars,
    )

    config = BacktestConfig(
        start=START,
        end=END,
        initial_capital=CAPITAL,
        strategy="slope_volume",
        timeframe="1Day",
        stop_loss_atr=SL_ATR,
        take_profit_atr=TP_ATR,
        max_positions=10,
        trend_filter=True,
        # Slope entry params
        slope_lookback_bars=10,
        slope_threshold_pct=0.01,
        slope_volume_multiplier=1.5,
        slope_volume_ma_period=20,
        # Wave detection gates (A/B variable)
        slope_acceleration_bars=acceleration_bars,
        slope_min_acceleration_pct=min_acceleration_pct,
        slope_volume_trend_bars=5,
        slope_persistence_bars=persistence_bars,
        slope_contrarian=False,
        slope_anticipatory=False,
        # Slope exit
        slope_exit_enabled=True,
        slope_exit_lookback_bars=5,
        slope_exit_threshold_pct=0.01,
    )

    engine = BacktestEngine(config)
    result = engine.run(data)
    metrics = calculate_metrics(result)

    # Count close reasons
    reason_counts = {}
    for t in result.trades:
        r = t.close_reason.value
        reason_counts[r] = reason_counts.get(r, 0) + 1

    return {
        "label": label,
        "total_trades": metrics.total_trades,
        "win_rate_pct": metrics.win_rate_pct,
        "sharpe": metrics.sharpe_ratio,
        "sortino": metrics.sortino_ratio,
        "cagr_pct": metrics.cagr_pct,
        "total_return_pct": metrics.total_return_pct,
        "max_drawdown_pct": metrics.max_drawdown_pct,
        "profit_factor": metrics.profit_factor,
        "avg_win_pct": metrics.avg_win_pct,
        "avg_loss_pct": metrics.avg_loss_pct,
        "avg_hold_days": metrics.avg_hold_days,
        "final_equity": metrics.final_equity,
        "signals_generated": result.signals_generated,
        "orders_filled": result.orders_filled,
        "stop_loss_count": metrics.stop_loss_count,
        "take_profit_count": metrics.take_profit_count,
        "slope_exit_count": metrics.slope_exit_count,
        "adverse_slope_exit_count": metrics.adverse_slope_exit_count,
        "kill_switch_count": metrics.kill_switch_exit_count,
        "reason_counts": reason_counts,
        "go_nogo": metrics.go_nogo,
        "persistence_bars": persistence_bars,
        "min_acceleration_pct": min_acceleration_pct,
    }


def print_comparison(results: list[dict]) -> None:
    """Print formatted A/B comparison."""
    print("\n" + "=" * 80)
    print("  A/B BACKTEST: 2-factor vs 3-factor slope+volume entry logic")
    print(f"  Period: {START} to {END} | {len(SYMBOLS)} symbols | ${CAPITAL:,.0f}")
    print(f"  SL={SL_ATR} ATR, TP={TP_ATR} ATR")
    print("=" * 80)

    # Header
    print(f"\n  {'Metric':<28}", end="")
    for r in results:
        print(f"  {r['label']:>20}", end="")
    print()
    print("  " + "-" * (28 + 22 * len(results)))

    # Rows
    rows = [
        ("Signals Generated", "signals_generated", "d"),
        ("Orders Filled", "orders_filled", "d"),
        ("Total Trades", "total_trades", "d"),
        ("Win Rate (%)", "win_rate_pct", ".1f"),
        ("Sharpe Ratio", "sharpe", ".3f"),
        ("Sortino Ratio", "sortino", ".3f"),
        ("CAGR (%)", "cagr_pct", "+.2f"),
        ("Total Return (%)", "total_return_pct", "+.2f"),
        ("Max Drawdown (%)", "max_drawdown_pct", ".2f"),
        ("Profit Factor", "profit_factor", ".2f"),
        ("Avg Win (%)", "avg_win_pct", "+.2f"),
        ("Avg Loss (%)", "avg_loss_pct", "+.2f"),
        ("Avg Hold Days", "avg_hold_days", ".1f"),
        ("Final Equity ($)", "final_equity", ",.2f"),
        ("Stop Loss Exits", "stop_loss_count", "d"),
        ("Take Profit Exits", "take_profit_count", "d"),
        ("Slope Exits", "slope_exit_count", "d"),
        ("Adverse Slope Exits", "adverse_slope_exit_count", "d"),
        ("Kill Switch Exits", "kill_switch_count", "d"),
    ]

    for label, key, fmt in rows:
        print(f"  {label:<28}", end="")
        for r in results:
            val = r.get(key, 0)
            formatted = f"{val:{fmt}}"
            print(f"  {formatted:>20}", end="")
        print()

    # Config diff
    print()
    print("  " + "-" * (28 + 22 * len(results)))
    print(f"  {'persistence_bars':<28}", end="")
    for r in results:
        print(f"  {r['persistence_bars']:>20}", end="")
    print()
    print(f"  {'min_acceleration_pct':<28}", end="")
    for r in results:
        print(f"  {r['min_acceleration_pct']:>20}", end="")
    print()

    # Go/No-Go
    print()
    print("  " + "-" * (28 + 22 * len(results)))
    print(f"  {'GO/NO-GO':<28}", end="")
    for r in results:
        go = r["go_nogo"]
        status = "GO" if go.get("pass", go.get("go", False)) else "NO-GO"
        print(f"  {status:>20}", end="")
    print()

    # Verdict
    for r in results:
        go = r["go_nogo"]
        verdict = go.get("verdict", "")
        print(f"\n  [{r['label']}] {verdict}")
        if "checks" in go:
            for check_name, check_val in go["checks"].items():
                marker = "PASS" if check_val else "FAIL"
                print(f"    [{marker}] {check_name}")

    print("\n" + "=" * 80)

    # Analysis
    r2 = results[0]  # 2-factor
    r3 = results[1]  # 3-factor
    print("\n  ANALYSIS:")
    trade_diff = r2["total_trades"] - r3["total_trades"]
    print(f"  - 2-factor generates {trade_diff:+d} more trades ({r2['total_trades']} vs {r3['total_trades']})")
    sharpe_diff = r2["sharpe"] - r3["sharpe"]
    print(f"  - Sharpe difference: {sharpe_diff:+.3f} ({r2['sharpe']:.3f} vs {r3['sharpe']:.3f})")
    wr_diff = r2["win_rate_pct"] - r3["win_rate_pct"]
    print(f"  - Win rate difference: {wr_diff:+.1f}% ({r2['win_rate_pct']:.1f}% vs {r3['win_rate_pct']:.1f}%)")

    if r2["sharpe"] > r3["sharpe"] and r2["total_trades"] > r3["total_trades"]:
        print("\n  CONCLUSION: 3-factor filters TOO aggressively — 2-factor is better.")
    elif r3["sharpe"] > r2["sharpe"]:
        print("\n  CONCLUSION: 3-factor filtering improves quality — keep the extra gates.")
    else:
        print("\n  CONCLUSION: Mixed results — further analysis needed.")

    print()


def main() -> int:
    from src.backtest import DataLoader

    # Load data once, reuse for both variants
    loader = DataLoader()
    logger.info("loading_data", symbols=len(SYMBOLS), timeframe="1Day")
    data = loader.load(symbols=SYMBOLS, start=START, end=END, timeframe="1Day")

    if not data:
        logger.error("no_data_loaded")
        return 1

    logger.info(
        "data_ready",
        symbols_loaded=len(data),
        total_bars=sum(len(df) for df in data.values()),
    )

    results = []

    # Variant A: 2-factor (slope + volume only)
    # acceleration gate disabled: min_acceleration_pct=-999.0 makes acceleration_ok always True
    #   (acceleration >= -999 for BUY, acceleration <= 999 for SHORT)
    # persistence gate disabled: persistence_bars=1 means current bar always matches itself
    try:
        r2 = run_variant(
            label="2-factor (S+V)",
            data=data,
            persistence_bars=1,
            min_acceleration_pct=-999.0,
            acceleration_bars=5,
        )
        results.append(r2)
    except Exception as e:
        logger.error("2factor_failed", error=str(e), exc_info=True)
        return 1

    # Variant B: 3-factor (slope + volume + acceleration + persistence)
    try:
        r3 = run_variant(
            label="3-factor (S+V+A+P)",
            data=data,
            persistence_bars=8,
            min_acceleration_pct=0.01,
            acceleration_bars=5,
        )
        results.append(r3)
    except Exception as e:
        logger.error("3factor_failed", error=str(e), exc_info=True)
        return 1

    print_comparison(results)
    return 0


if __name__ == "__main__":
    sys.exit(main())
