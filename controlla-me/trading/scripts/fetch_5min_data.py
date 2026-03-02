"""
fetch_5min_data.py — Download SPY (and optionally other symbols) 5-min bars.

Downloads 6 months of 5-min OHLCV data from Alpaca and caches to Parquet.
Used as input for the slope+volume backtest engine.

Usage:
    cd trading
    python scripts/fetch_5min_data.py
    python scripts/fetch_5min_data.py --symbols SPY QQQ --months 6
    python scripts/fetch_5min_data.py --symbols SPY --months 3 --cache-dir /tmp/data

Requirements:
    ALPACA_API_KEY and ALPACA_SECRET_KEY env vars (or .env file).

Notes:
    - Alpaca free/paper tier: up to ~1 year of 1Min/5Min data available.
    - Alpaca charges per-request in 30-day chunks to stay within API limits.
    - Output: .backtest-cache/<SYMBOL>_5Min_<start>_<end>.parquet
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from pathlib import Path

import structlog

# ─── Logging ──────────────────────────────────────────────────────────────────

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

# ─── Defaults ─────────────────────────────────────────────────────────────────

DEFAULT_SYMBOLS = ["SPY"]
DEFAULT_MONTHS = 6
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / ".backtest-cache"

# ─── CLI ──────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="fetch_5min_data",
        description="Download 5-min bars from Alpaca for slope+volume backtest",
    )
    parser.add_argument(
        "--symbols",
        nargs="+",
        default=DEFAULT_SYMBOLS,
        help=f"Symbols to download (default: {DEFAULT_SYMBOLS})",
    )
    parser.add_argument(
        "--months",
        type=int,
        default=DEFAULT_MONTHS,
        help=f"Months of history to download (default: {DEFAULT_MONTHS})",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_CACHE_DIR,
        help=f"Cache directory (default: {DEFAULT_CACHE_DIR})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if cache exists",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be downloaded without actually downloading",
    )
    return parser.parse_args()


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    args = parse_args()

    # Validate API keys
    api_key = os.environ.get("ALPACA_API_KEY", "")
    secret_key = os.environ.get("ALPACA_SECRET_KEY", "")

    if not api_key or not secret_key:
        logger.error(
            "missing_api_keys",
            msg="Set ALPACA_API_KEY and ALPACA_SECRET_KEY environment variables",
            hint="Copy trading/.env.example to trading/.env and fill in your keys",
        )
        return 1

    # Calculate date range
    end = date.today()
    # Go back N months
    month = end.month - args.months
    year = end.year
    while month <= 0:
        month += 12
        year -= 1
    start = date(year, month, end.day if end.day <= 28 else 28)

    symbols = [s.upper() for s in args.symbols]
    cache_dir: Path = args.cache_dir
    cache_dir.mkdir(parents=True, exist_ok=True)

    logger.info(
        "fetch_5min_start",
        symbols=symbols,
        start=str(start),
        end=str(end),
        months=args.months,
        cache_dir=str(cache_dir),
    )

    if args.dry_run:
        print(f"\n{'='*60}")
        print(f"  DRY RUN — would download:")
        print(f"  Symbols:    {', '.join(symbols)}")
        print(f"  Timeframe:  5Min")
        print(f"  Date range: {start} → {end}  ({args.months} months)")
        print(f"  Cache dir:  {cache_dir}")
        print(f"  Est. bars:  ~{args.months * 22 * 78} per symbol  (22 days/mo, 6.5h/day)")
        print(f"{'='*60}\n")
        return 0

    # Import DataLoader (inside trading package)
    try:
        # Add trading/src to path if running from trading/ dir
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from src.backtest.data_loader import DataLoader
    except ImportError as e:
        logger.error("import_error", error=str(e), hint="Run from the trading/ directory")
        return 1

    loader = DataLoader(
        api_key=api_key,
        secret_key=secret_key,
        cache_dir=cache_dir,
    )

    # If force, clear existing 5Min cache for these symbols
    if args.force:
        for symbol in symbols:
            for f in cache_dir.glob(f"{symbol}_5Min_*.parquet"):
                f.unlink()
                logger.info("cache_cleared", symbol=symbol, file=f.name)

    # Download
    try:
        data = loader.load(symbols=symbols, start=start, end=end, timeframe="5Min")
    except Exception as e:
        logger.error("download_failed", error=str(e))
        return 1

    # Report
    print(f"\n{'='*60}")
    print(f"  5-MIN DATA DOWNLOAD COMPLETE")
    print(f"  Period:  {start} → {end}  ({args.months} months)")
    print(f"  {'Symbol':<10} {'Bars':>8}  {'From':<12}  {'To':<12}  {'Cache'}")
    print(f"  {'-'*55}")

    for symbol in symbols:
        if symbol not in data:
            print(f"  {symbol:<10} {'NOT FOUND':>8}")
            continue

        df = data[symbol]
        bars = len(df)
        ts_from = df.index[0].strftime("%Y-%m-%d") if len(df) else "N/A"
        ts_to   = df.index[-1].strftime("%Y-%m-%d") if len(df) else "N/A"

        # Find cache file
        cache_files = list(cache_dir.glob(f"{symbol}_5Min_*.parquet"))
        cache_file = cache_files[0].name if cache_files else "N/A"

        print(f"  {symbol:<10} {bars:>8}  {ts_from:<12}  {ts_to:<12}  {cache_file}")

    print(f"\n  Cache dir: {cache_dir}")
    print(f"\n  Next step: run backtest with --timeframe 5Min")
    print(f"  python -m src.backtest run --timeframe 5Min --start {start} --end {end}")
    print(f"{'='*60}\n")

    return 0


if __name__ == "__main__":
    sys.exit(main())
