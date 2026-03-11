"""
fetch_spy_5min.py — Download SPY 5-minute OHLCV bars via Tiingo (6 months).

Fetches 6 months of SPY 5-min data from Tiingo IEX REST API and saves to
trading/data/spy_5min_6m.csv. Used as the data source for backtest_5min_slope.py
and grid_search_tpsl.py.

Usage (from trading/ directory):
    python scripts/fetch_spy_5min.py
    python scripts/fetch_spy_5min.py --symbol QQQ --months 3
    python scripts/fetch_spy_5min.py --output data/spy_custom.csv

Requirements:
    TIINGO_API_KEY in .env.local (controlla-me root) or as env var.
    Tiingo Power/Enterprise plan recommended (5000+ req/h).
    Free tier (50 req/h) will work but is slow (~72s between requests).
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ── Ensure trading/src is on sys.path when running from trading/ ──────────────
_SCRIPT_DIR = Path(__file__).resolve().parent
_TRADING_DIR = _SCRIPT_DIR.parent
if str(_TRADING_DIR) not in sys.path:
    sys.path.insert(0, str(_TRADING_DIR))

# ── Load .env.local (controlla-me root) before importing settings ─────────────
from dotenv import load_dotenv  # noqa: E402

_ENV_FILE = _TRADING_DIR.parent / ".env.local"
if _ENV_FILE.exists():
    load_dotenv(_ENV_FILE, override=False)

import pandas as pd  # noqa: E402
import structlog  # noqa: E402

# ── Logging setup ─────────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(colors=True),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
log = structlog.get_logger()

# ── Defaults ──────────────────────────────────────────────────────────────────
DEFAULT_SYMBOL = "SPY"
DEFAULT_MONTHS = 6
DEFAULT_TIMEFRAME = "5Min"
DEFAULT_OUTPUT = _TRADING_DIR / "data" / "spy_5min_6m.csv"


# ── CLI ───────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="fetch_spy_5min",
        description="Fetch SPY (or other symbol) 5-min OHLCV bars from Tiingo",
    )
    p.add_argument(
        "--symbol",
        default=DEFAULT_SYMBOL,
        help=f"Ticker symbol to download (default: {DEFAULT_SYMBOL})",
    )
    p.add_argument(
        "--months",
        type=int,
        default=DEFAULT_MONTHS,
        help=f"Months of history to fetch (default: {DEFAULT_MONTHS})",
    )
    p.add_argument(
        "--timeframe",
        default=DEFAULT_TIMEFRAME,
        choices=["1Min", "5Min", "15Min", "30Min", "1Hour"],
        help=f"Bar timeframe (default: {DEFAULT_TIMEFRAME})",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output CSV path (default: {DEFAULT_OUTPUT})",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if the output CSV already exists",
    )
    return p.parse_args()


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> int:
    args = parse_args()
    symbol: str = args.symbol.upper()
    months: int = args.months
    timeframe: str = args.timeframe
    output_path: Path = args.output

    # ── Verify TIINGO_API_KEY ─────────────────────────────────────────────────
    api_key = os.environ.get("TIINGO_API_KEY", "").strip()
    if not api_key:
        print(
            "\n[ERROR] TIINGO_API_KEY is not set.\n"
            "\nTo fix:\n"
            "  1. Sign up at https://www.tiingo.com  (free tier available)\n"
            "  2. Copy your API key from the dashboard\n"
            "  3. Add to controlla-me/.env.local:\n"
            "       TIINGO_API_KEY=your_key_here\n"
            "  4. Re-run this script\n"
            "\nNote: Tiingo free tier = 50 req/h (very slow for 6 months of 5-min data).\n"
            "      Power/Enterprise plan ($10–30/mo) is strongly recommended.\n"
        )
        return 1

    # ── Skip if already downloaded ────────────────────────────────────────────
    if output_path.exists() and not args.force:
        log.info(
            "output_exists",
            path=str(output_path),
            hint="Use --force to re-download",
        )
        # Still print summary
        df_existing = pd.read_csv(output_path, index_col=0, parse_dates=True)
        _print_summary(df_existing, symbol, output_path)
        return 0

    # ── Date range ────────────────────────────────────────────────────────────
    end_dt = datetime.utcnow()
    # Go back N months (approximate: 30 days/month)
    start_dt = end_dt - timedelta(days=months * 30)

    log.info(
        "fetch_start",
        symbol=symbol,
        timeframe=timeframe,
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
        months=months,
        output=str(output_path),
    )

    # ── Import TiingoClient (settings loads env vars) ─────────────────────────
    try:
        from src.connectors.tiingo_client import TiingoClient
    except ImportError as exc:
        log.error(
            "import_error",
            error=str(exc),
            hint="Run from the trading/ directory: python scripts/fetch_spy_5min.py",
        )
        return 1

    try:
        client = TiingoClient(api_key=api_key)
    except ValueError as exc:
        log.error("tiingo_init_failed", error=str(exc))
        return 1

    # ── Fetch data ────────────────────────────────────────────────────────────
    # TiingoClient.get_bars() with intraday timeframe calls _get_iex_bars()
    # which supports startDate + resampleFreq. We calculate days_back from months.
    days_back = months * 30 + 5  # small margin for weekends/holidays

    log.info("fetching_bars", symbol=symbol, timeframe=timeframe, days_back=days_back)

    try:
        bars_dict = client.get_bars(
            symbols=[symbol],
            timeframe=timeframe,
            days_back=days_back,
        )
    except Exception as exc:
        log.error("fetch_failed", symbol=symbol, error=str(exc))
        return 1

    if symbol not in bars_dict or bars_dict[symbol].empty:
        log.error(
            "no_data_returned",
            symbol=symbol,
            hint=(
                "Tiingo IEX may not have data for this symbol, "
                "or the date range is too long for the free tier."
            ),
        )
        return 1

    df: pd.DataFrame = bars_dict[symbol]

    # ── Ensure output directory exists ────────────────────────────────────────
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # ── Save to CSV ───────────────────────────────────────────────────────────
    df.to_csv(output_path)
    log.info("saved", path=str(output_path), rows=len(df))

    # ── Print summary ─────────────────────────────────────────────────────────
    _print_summary(df, symbol, output_path)
    return 0


def _print_summary(df: pd.DataFrame, symbol: str, output_path: Path) -> None:
    """Print a human-readable summary of the downloaded data."""
    n_bars = len(df)
    if n_bars == 0:
        print("\n[WARNING] DataFrame is empty — no bars to display.\n")
        return

    # Index may be DatetimeIndex or string column after CSV round-trip
    idx = df.index
    try:
        first_ts = pd.Timestamp(idx[0])
        last_ts = pd.Timestamp(idx[-1])
        date_range = f"{first_ts.strftime('%Y-%m-%d %H:%M UTC')} → {last_ts.strftime('%Y-%m-%d %H:%M UTC')}"
        n_days = (last_ts.normalize() - first_ts.normalize()).days + 1
    except Exception:
        date_range = f"{idx[0]} → {idx[-1]}"
        n_days = "?"

    print(f"\n{'='*65}")
    print(f"  SPY 5-MIN DATA — {symbol}")
    print(f"{'='*65}")
    print(f"  Date range : {date_range}")
    print(f"  Calendar days: {n_days}")
    print(f"  Total bars : {n_bars:,}")
    print(f"  Output file: {output_path}")
    print(f"{'─'*65}")
    print(f"  First row:")
    print(f"    {df.iloc[0].to_dict()}")
    print(f"  Last row:")
    print(f"    {df.iloc[-1].to_dict()}")
    print(f"{'='*65}")
    print(f"\n  Next step: run the slope+volume backtest:")
    print(f"  python scripts/backtest_5min_slope.py")
    print()


if __name__ == "__main__":
    sys.exit(main())
