#!/usr/bin/env python3
"""
Backtest Runner — Load data, run backtest engine, print results.

Usage:
    cd trading
    pip install -e ".[backtest]"          # install yfinance + matplotlib + pyarrow
    python run_backtest.py                # default: slope_volume, 1Day, 2023-2024
    python run_backtest.py --strategy trend_following
    python run_backtest.py --timeframe 5Min --strategy slope_volume
    python run_backtest.py --symbols SPY QQQ NVDA
    python run_backtest.py --start 2024-01-01 --end 2024-12-31

Data sources (in order of preference):
    1. Parquet cache in .backtest-cache/ (instant, no API call)
    2. Alpaca API (if ALPACA_API_KEY + ALPACA_SECRET_KEY are set)
    3. yfinance (free, no API key needed — fallback for daily/hourly)
"""

from __future__ import annotations

import argparse
import sys
from datetime import date

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

# Default symbols (from TRADING_SLOPE_SYMBOLS)
DEFAULT_SYMBOLS = [
    "SPY", "QQQ", "IWM", "XLK", "XLF", "XLE", "XLV", "XLI",
    "XLU", "XLP", "XLRE", "XLB", "GLD", "TLT", "SHY", "USO",
    "DBA", "SH", "PSQ", "NVDA",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run backtest on historical data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--symbols",
        nargs="+",
        default=DEFAULT_SYMBOLS,
        help="Symbols to backtest (default: TRADING_SLOPE_SYMBOLS)",
    )
    parser.add_argument(
        "--start",
        type=str,
        default="2023-01-01",
        help="Start date YYYY-MM-DD (default: 2023-01-01)",
    )
    parser.add_argument(
        "--end",
        type=str,
        default="2024-12-31",
        help="End date YYYY-MM-DD (default: 2024-12-31)",
    )
    parser.add_argument(
        "--capital",
        type=float,
        default=100_000.0,
        help="Initial capital (default: 100000)",
    )
    parser.add_argument(
        "--strategy",
        type=str,
        default="slope_volume",
        choices=["trend_following", "mean_reversion", "mean_reversion_v3", "slope_volume", "noise_boundary"],
        help="Strategy to backtest (default: slope_volume)",
    )
    parser.add_argument(
        "--timeframe",
        type=str,
        default="1Day",
        choices=["1Day", "1Hour", "5Min", "15Min"],
        help="Bar timeframe (default: 1Day)",
    )
    parser.add_argument(
        "--stop-loss-atr",
        type=float,
        default=1.5,
        help="Stop loss ATR multiplier (default: 1.5)",
    )
    parser.add_argument(
        "--take-profit-atr",
        type=float,
        default=3.0,
        help="Take profit ATR multiplier (default: 3.0)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.3,
        help="Signal threshold for entry (default: 0.3)",
    )
    parser.add_argument(
        "--no-report",
        action="store_true",
        help="Skip generating report files (just print summary)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    start_date = date.fromisoformat(args.start)
    end_date = date.fromisoformat(args.end)

    logger.info(
        "backtest_runner",
        symbols=len(args.symbols),
        start=str(start_date),
        end=str(end_date),
        strategy=args.strategy,
        timeframe=args.timeframe,
        capital=args.capital,
    )

    # --- Step 1: Load data ---
    from src.backtest import DataLoader, BacktestConfig, BacktestEngine, calculate_metrics, generate_report

    loader = DataLoader()

    logger.info("loading_data", symbols=len(args.symbols), timeframe=args.timeframe)
    data = loader.load(
        symbols=args.symbols,
        start=start_date,
        end=end_date,
        timeframe=args.timeframe,
    )

    if not data:
        logger.error("no_data_loaded", msg="No OHLCV data available for any symbol. Check your API keys or install yfinance: pip install yfinance")
        return 1

    logger.info(
        "data_ready",
        symbols_loaded=len(data),
        symbols_missing=[s for s in args.symbols if s not in data],
        total_bars=sum(len(df) for df in data.values()),
    )

    # --- Step 2: Configure backtest ---
    config = BacktestConfig(
        start=start_date,
        end=end_date,
        initial_capital=args.capital,
        strategy=args.strategy,
        timeframe=args.timeframe,
        signal_threshold=args.threshold,
        stop_loss_atr=args.stop_loss_atr,
        take_profit_atr=args.take_profit_atr,
    )

    # --- Step 3: Run backtest ---
    engine = BacktestEngine(config)

    logger.info("running_backtest")
    result = engine.run(data)

    logger.info(
        "backtest_complete",
        total_bars=result.total_bars,
        signals=result.signals_generated,
        fills=result.orders_filled,
        trades=len(result.trades),
        kill_switch=result.kill_switch_triggered,
    )

    # --- Step 4: Calculate metrics ---
    metrics = calculate_metrics(result)

    # --- Step 5: Print summary ---
    print("\n" + "=" * 70)
    print(f"  BACKTEST RESULTS — {args.strategy} ({args.timeframe})")
    print(f"  {start_date} to {end_date} | {len(data)} symbols | ${args.capital:,.0f}")
    print("=" * 70)
    print(f"  Total Return:      {metrics.total_return_pct:+.2f}%")
    print(f"  CAGR:              {metrics.cagr_pct:+.2f}%")
    print(f"  Sharpe Ratio:      {metrics.sharpe_ratio:.3f}")
    print(f"  Sortino Ratio:     {metrics.sortino_ratio:.3f}")
    print(f"  Max Drawdown:      {metrics.max_drawdown_pct:.2f}%")
    print(f"  Ann. Volatility:   {metrics.annualized_volatility_pct:.2f}%")
    print("-" * 70)
    print(f"  Total Trades:      {metrics.total_trades}")
    print(f"  Win Rate:          {metrics.win_rate_pct:.1f}%")
    print(f"  Profit Factor:     {metrics.profit_factor:.2f}")
    print(f"  Avg Win:           {metrics.avg_win_pct:+.2f}%")
    print(f"  Avg Loss:          {metrics.avg_loss_pct:+.2f}%")
    print(f"  Avg Hold Days:     {metrics.avg_hold_days:.1f}")
    print(f"  Best Trade:        {metrics.best_trade_pct:+.2f}%")
    print(f"  Worst Trade:       {metrics.worst_trade_pct:+.2f}%")
    print("-" * 70)
    print(f"  Final Equity:      ${metrics.final_equity:,.2f}")
    print(f"  Total P&L:         ${metrics.total_pnl:+,.2f}")
    print("-" * 70)

    # Close reasons breakdown
    print("  Close Reasons:")
    reasons = [
        ("Stop Loss", metrics.stop_loss_count),
        ("Take Profit", metrics.take_profit_count),
        ("Signal Exit", metrics.signal_exit_count),
        ("Slope Exit", metrics.slope_exit_count),
        ("Adverse Slope", metrics.adverse_slope_exit_count),
        ("NB Exit", metrics.nb_exit_count),
        ("VWAP Exit", metrics.vwap_exit_count),
        ("EOD Close", metrics.eod_close_count),
        ("End of BT", metrics.end_of_backtest_count),
        ("Kill Switch", metrics.kill_switch_exit_count),
    ]
    for name, count in reasons:
        if count > 0:
            print(f"    {name:<18} {count}")

    # Go/No-Go
    print("-" * 70)
    go_nogo = metrics.go_nogo
    status = "GO" if go_nogo.get("go", False) else "NO-GO"
    print(f"  Go/No-Go:          {status}")
    if "checks" in go_nogo:
        for check_name, check_val in go_nogo["checks"].items():
            marker = "PASS" if check_val else "FAIL"
            print(f"    [{marker}] {check_name}")

    print("=" * 70 + "\n")

    # --- Step 6: Generate report files ---
    if not args.no_report:
        try:
            output_dir = generate_report(result, metrics)
            print(f"Report saved to: {output_dir}\n")
        except Exception as e:
            logger.warning("report_generation_failed", error=str(e))
            print(f"Report generation failed (non-fatal): {e}\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
