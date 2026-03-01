"""
Backtest CLI — Run backtests from the command line.

Usage:
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28 --capital 50000
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28 --mode train_test
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28 --universe AAPL,MSFT,GOOGL

No Supabase dependency — fully offline.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import structlog

# Setup logging before any imports that use it
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

# Default universe (same as MarketScanner)
DEFAULT_UNIVERSE = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA",
    "UNH", "JNJ", "V", "XOM", "JPM", "PG", "MA", "HD", "CVX", "ABBV",
    "MRK", "LLY", "PEP", "KO", "COST", "AVGO", "TMO", "MCD", "WMT",
    "CSCO", "ACN", "ABT", "DHR", "NEE", "LIN", "TXN", "PM", "AMGN",
    "SPY", "QQQ", "IWM", "XLF", "XLK", "XLE", "XLV", "XLI",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m src.backtest",
        description="Trading Backtest Framework — Phase 2",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Run command
    run_parser = subparsers.add_parser("run", help="Run a backtest")
    run_parser.add_argument(
        "--start", type=str, required=True,
        help="Start date (YYYY-MM-DD)",
    )
    run_parser.add_argument(
        "--end", type=str, required=True,
        help="End date (YYYY-MM-DD)",
    )
    run_parser.add_argument(
        "--capital", type=float, default=100_000,
        help="Initial capital (default: 100000)",
    )
    run_parser.add_argument(
        "--universe", type=str, default=None,
        help="Comma-separated symbols (default: S&P 500 subset + ETFs)",
    )
    run_parser.add_argument(
        "--mode", type=str, choices=["full", "train_test"], default="full",
        help="Backtest mode: full or train_test (70/30 split)",
    )
    run_parser.add_argument(
        "--slippage", type=float, default=4.0,
        help="Slippage in basis points (default: 4)",
    )
    run_parser.add_argument(
        "--max-positions", type=int, default=10,
        help="Max simultaneous positions (default: 10)",
    )
    run_parser.add_argument(
        "--threshold", type=float, default=0.3,
        help="Signal score threshold for BUY/SELL (default: 0.3)",
    )
    run_parser.add_argument(
        "--sl-atr", type=float, default=1.5,
        help="Stop loss ATR multiplier (default: 1.5)",
    )
    run_parser.add_argument(
        "--tp-atr", type=float, default=3.0,
        help="Take profit ATR multiplier (default: 3.0)",
    )
    run_parser.add_argument(
        "--no-trend-filter", action="store_true",
        help="Disable SMA200 trend filter",
    )
    run_parser.add_argument(
        "--output", type=str, default=None,
        help="Custom output directory for results",
    )

    return parser.parse_args()


def cmd_run(args: argparse.Namespace) -> None:
    """Execute a backtest run."""
    from .data_loader import DataLoader
    from .engine import BacktestConfig, BacktestEngine
    from .metrics import calculate_metrics
    from .report import generate_report

    # Parse dates
    try:
        start = date.fromisoformat(args.start)
        end = date.fromisoformat(args.end)
    except ValueError as e:
        print(f"Error: Invalid date format: {e}")
        sys.exit(1)

    if start >= end:
        print("Error: Start date must be before end date")
        sys.exit(1)

    # Parse universe
    if args.universe:
        symbols = [s.strip().upper() for s in args.universe.split(",")]
    else:
        symbols = DEFAULT_UNIVERSE

    # Build config
    config = BacktestConfig(
        start=start,
        end=end,
        initial_capital=args.capital,
        slippage_bps=args.slippage,
        max_positions=args.max_positions,
        signal_threshold=args.threshold,
        stop_loss_atr=args.sl_atr,
        take_profit_atr=args.tp_atr,
        trend_filter=not args.no_trend_filter,
        train_test_split=0.7 if args.mode == "train_test" else None,
    )

    print(f"\n{'='*70}")
    print(f"  BACKTEST — {start} → {end}")
    print(f"  Capital: ${config.initial_capital:,.0f} | Symbols: {len(symbols)} | Mode: {args.mode}")
    print(f"  Slippage: {config.slippage_bps} bps | Max Positions: {config.max_positions}")
    print(f"  Signal Threshold: {config.signal_threshold}")
    print(f"{'='*70}\n")

    # Step 1: Load data
    logger.info("loading_data", symbols=len(symbols), start=str(start), end=str(end))
    loader = DataLoader()
    data = loader.load(symbols, start, end)

    if not data:
        print("Error: No data loaded. Check Alpaca API keys and date range.")
        sys.exit(1)

    logger.info("data_loaded", symbols=len(data), total_bars=sum(len(df) for df in data.values()))

    # Step 2: Run backtest
    logger.info("running_backtest")
    engine = BacktestEngine(config)
    result = engine.run(data)

    # Step 3: Calculate metrics
    logger.info("calculating_metrics")
    metrics = calculate_metrics(result)

    # Step 4: Generate report
    output_dir = Path(args.output) if args.output else None
    report_dir = generate_report(result, metrics, output_dir)

    print(f"\n  📁 Report saved to: {report_dir}")
    print(f"     - report.json")
    print(f"     - equity_curve.png")
    print(f"     - trades.csv")
    print()


def main() -> None:
    args = parse_args()

    if args.command is None:
        print("Usage: python -m src.backtest run --start YYYY-MM-DD --end YYYY-MM-DD")
        print("       python -m src.backtest run --help")
        sys.exit(0)

    if args.command == "run":
        cmd_run(args)


if __name__ == "__main__":
    main()
