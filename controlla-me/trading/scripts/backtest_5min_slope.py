"""
backtest_5min_slope.py — Slope+volume backtest on 5-min SPY bars vs daily MACD baseline.

Loads SPY 5-min data from trading/data/spy_5min_6m.csv (or fetches via Tiingo if not
present), runs the slope+volume strategy using the existing BacktestEngine, and compares
it against the daily MACD composite-score strategy on the same period.

Usage (from trading/ directory):
    python scripts/backtest_5min_slope.py
    python scripts/backtest_5min_slope.py --symbol SPY --sl-atr 2.0 --tp-atr 6.0
    python scripts/backtest_5min_slope.py --csv data/spy_5min_6m.csv

Strategy parameters (slope+volume):
    slope_lookback  = 5 bars        (OLS regression window)
    slope_threshold = 0.01 %/bar    (min slope for signal)
    volume_mult     = 1.3×          (volume confirmation)
    sl_atr          = 2.0           (stop loss ATR multiplier)
    tp_atr          = 6.0           (take profit ATR multiplier)

Baseline (daily MACD composite score):
    Uses BacktestEngine with timeframe="1Day", strategy="trend_following"
    on daily SPY bars fetched from Tiingo.

Output: comparison table printed to stdout.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

# ── Ensure trading/ is on sys.path ────────────────────────────────────────────
_SCRIPT_DIR = Path(__file__).resolve().parent
_TRADING_DIR = _SCRIPT_DIR.parent
if str(_TRADING_DIR) not in sys.path:
    sys.path.insert(0, str(_TRADING_DIR))

# ── Load .env.local ───────────────────────────────────────────────────────────
from dotenv import load_dotenv  # noqa: E402

_ENV_FILE = _TRADING_DIR.parent / ".env.local"
if _ENV_FILE.exists():
    load_dotenv(_ENV_FILE, override=False)

import pandas as pd  # noqa: E402
import structlog  # noqa: E402

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

DEFAULT_CSV = _TRADING_DIR / "data" / "spy_5min_6m.csv"
DEFAULT_SYMBOL = "SPY"
DEFAULT_SL_ATR = 2.0
DEFAULT_TP_ATR = 6.0
DEFAULT_SLOPE_LOOKBACK = 5
DEFAULT_SLOPE_THRESHOLD = 0.01
DEFAULT_VOLUME_MULT = 1.3
DEFAULT_CAPITAL = 100_000.0


# ── CLI ───────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="backtest_5min_slope",
        description="Slope+volume 5-min backtest vs daily MACD baseline",
    )
    p.add_argument("--symbol", default=DEFAULT_SYMBOL, help="Symbol (default: SPY)")
    p.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Path to 5-min CSV (default: {DEFAULT_CSV}). Fetched from Tiingo if missing.",
    )
    p.add_argument(
        "--sl-atr",
        type=float,
        default=DEFAULT_SL_ATR,
        dest="sl_atr",
        help=f"Stop loss ATR multiplier (default: {DEFAULT_SL_ATR})",
    )
    p.add_argument(
        "--tp-atr",
        type=float,
        default=DEFAULT_TP_ATR,
        dest="tp_atr",
        help=f"Take profit ATR multiplier (default: {DEFAULT_TP_ATR})",
    )
    p.add_argument(
        "--slope-lookback",
        type=int,
        default=DEFAULT_SLOPE_LOOKBACK,
        dest="slope_lookback",
        help=f"OLS regression lookback bars (default: {DEFAULT_SLOPE_LOOKBACK})",
    )
    p.add_argument(
        "--slope-threshold",
        type=float,
        default=DEFAULT_SLOPE_THRESHOLD,
        dest="slope_threshold",
        help=f"Min slope %/bar to trigger signal (default: {DEFAULT_SLOPE_THRESHOLD})",
    )
    p.add_argument(
        "--volume-mult",
        type=float,
        default=DEFAULT_VOLUME_MULT,
        dest="volume_mult",
        help=f"Volume confirmation multiplier (default: {DEFAULT_VOLUME_MULT})",
    )
    p.add_argument(
        "--capital",
        type=float,
        default=DEFAULT_CAPITAL,
        help=f"Starting capital (default: ${DEFAULT_CAPITAL:,.0f})",
    )
    p.add_argument(
        "--no-baseline",
        action="store_true",
        dest="no_baseline",
        help="Skip the daily MACD baseline backtest",
    )
    return p.parse_args()


# ── Data loading ──────────────────────────────────────────────────────────────


def load_5min_csv(csv_path: Path, symbol: str) -> pd.DataFrame | None:
    """Load 5-min bars from CSV. Returns None if file not found."""
    if not csv_path.exists():
        return None
    log.info("loading_csv", path=str(csv_path))
    df = pd.read_csv(csv_path, index_col=0, parse_dates=True)
    # Ensure tz-aware UTC index
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    df.index.name = "timestamp"
    log.info("csv_loaded", rows=len(df), symbol=symbol)
    return df


def fetch_5min_tiingo(symbol: str, months: int = 6) -> pd.DataFrame | None:
    """Fetch 5-min bars from Tiingo IEX. Returns None on failure."""
    api_key = os.environ.get("TIINGO_API_KEY", "").strip()
    if not api_key:
        log.warning(
            "tiingo_key_missing",
            hint="Set TIINGO_API_KEY in .env.local to auto-fetch data",
        )
        return None
    try:
        from src.connectors.tiingo_client import TiingoClient

        client = TiingoClient(api_key=api_key)
        days_back = months * 30 + 5
        log.info("fetching_tiingo", symbol=symbol, days_back=days_back)
        bars = client.get_bars(symbols=[symbol], timeframe="5Min", days_back=days_back)
        return bars.get(symbol)
    except Exception as exc:
        log.error("tiingo_fetch_failed", symbol=symbol, error=str(exc))
        return None


def fetch_daily_tiingo(symbol: str, start: date, end: date) -> pd.DataFrame | None:
    """Fetch daily bars from Tiingo for baseline comparison."""
    api_key = os.environ.get("TIINGO_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from src.connectors.tiingo_client import TiingoClient

        client = TiingoClient(api_key=api_key)
        # Add 200-day warmup before start
        warmup_start = start - timedelta(days=210)
        days_back = (end - warmup_start).days + 5
        bars = client.get_bars(symbols=[symbol], timeframe="1Day", days_back=days_back)
        df = bars.get(symbol)
        if df is None:
            return None
        # Slice to requested range (with warmup)
        ts_start = pd.Timestamp(warmup_start, tz="UTC")
        ts_end = pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)
        return df[(df.index >= ts_start) & (df.index <= ts_end)]
    except Exception as exc:
        log.error("tiingo_daily_failed", symbol=symbol, error=str(exc))
        return None


# ── Backtest runners ──────────────────────────────────────────────────────────


def run_slope_backtest(
    df_5min: pd.DataFrame,
    symbol: str,
    sl_atr: float,
    tp_atr: float,
    slope_lookback: int,
    slope_threshold: float,
    volume_mult: float,
    capital: float,
) -> dict[str, Any]:
    """Run slope+volume strategy on 5-min bars. Returns metrics dict."""
    from datetime import date as date_type

    from src.backtest.engine import BacktestConfig, BacktestEngine
    from src.backtest.metrics import calculate_metrics

    # Derive date range from the DataFrame index
    start_ts = df_5min.index[0]
    end_ts = df_5min.index[-1]
    start_d = start_ts.date() if hasattr(start_ts, "date") else date_type.fromisoformat(str(start_ts)[:10])
    end_d = end_ts.date() if hasattr(end_ts, "date") else date_type.fromisoformat(str(end_ts)[:10])

    log.info(
        "slope_backtest_start",
        symbol=symbol,
        bars=len(df_5min),
        start=str(start_d),
        end=str(end_d),
        sl_atr=sl_atr,
        tp_atr=tp_atr,
        slope_lookback=slope_lookback,
        slope_threshold=slope_threshold,
        volume_mult=volume_mult,
    )

    config = BacktestConfig(
        start=start_d,
        end=end_d,
        initial_capital=capital,
        timeframe="5Min",
        strategy="slope_volume",
        stop_loss_atr=sl_atr,
        take_profit_atr=tp_atr,
        max_positions=5,  # single-symbol: allow up to 5 concurrent signals
        trend_filter=False,  # no macro SPY filter when running single-symbol
    )

    # Override analyze_stock_slope_volume params via monkey-patch approach:
    # The engine calls analyze_stock_slope_volume() with config.stop_loss_atr
    # and config.take_profit_atr. For slope/volume hyperparams we patch the
    # analyze_slope_volume wrapper in the engine module.
    import src.backtest.engine as _engine_mod

    _original_fn = _engine_mod.analyze_stock_slope_volume

    def _patched_slope(sym: str, df: pd.DataFrame, **_kwargs: Any) -> Any:
        return _engine_mod.analyze_stock_slope_volume(
            sym,
            df,
            lookback_bars=slope_lookback,
            slope_threshold_pct=slope_threshold,
            volume_multiplier=volume_mult,
            stop_loss_atr=sl_atr,
            take_profit_atr=tp_atr,
        )

    # Temporarily inject custom params into the engine's internal call
    # by overriding the function reference used in _generate_signals
    _original_ref = _engine_mod.analyze_stock_slope_volume

    def _patched(sym: str, df: pd.DataFrame, **kw: Any) -> Any:  # noqa: ANN401
        from src.backtest.engine import analyze_stock_slope_volume as _wrapped
        return _wrapped(
            sym,
            df,
            lookback_bars=slope_lookback,
            slope_threshold_pct=slope_threshold,
            volume_multiplier=volume_mult,
            stop_loss_atr=sl_atr,
            take_profit_atr=tp_atr,
        )

    # The engine's _generate_signals calls analyze_stock_slope_volume directly
    # from its local import. We patch the function on the engine's class instance
    # by wrapping _generate_signals to pass our params.
    # Simpler approach: just use BacktestEngine.run() which routes to
    # analyze_stock_slope_volume with config.stop_loss_atr / config.take_profit_atr.
    # The lookback/threshold/volume_mult use module-level defaults in analysis.py
    # (lookback=5, threshold=0.05, volume_mult=1.5). We need to inject these.
    # We do this by temporarily overriding the function pointer in the engine module.
    import functools

    from src.analysis import analyze_slope_volume as _orig_analysis

    # Patch at the source: wrap analyze_slope_volume in src.analysis to inject defaults
    import src.analysis as _analysis_mod

    _saved = _analysis_mod.analyze_slope_volume

    @functools.wraps(_saved)
    def _patched_analysis(sym: str, df: pd.DataFrame, **kw: Any) -> Any:  # noqa: ANN401
        # Inject our desired defaults; caller can still override via explicit kwargs
        kw.setdefault("lookback_bars", slope_lookback)
        kw.setdefault("slope_threshold_pct", slope_threshold)
        kw.setdefault("volume_multiplier", volume_mult)
        kw.setdefault("stop_loss_atr", sl_atr)
        kw.setdefault("take_profit_atr", tp_atr)
        return _saved(sym, df, **kw)

    _analysis_mod.analyze_slope_volume = _patched_analysis

    try:
        engine = BacktestEngine(config)
        result = engine.run({symbol: df_5min})
    finally:
        # Restore original function
        _analysis_mod.analyze_slope_volume = _saved

    metrics = calculate_metrics(result)
    return {
        "strategy": "slope_volume_5min",
        "timeframe": "5Min",
        "bars": len(df_5min),
        "start": str(start_d),
        "end": str(end_d),
        "sharpe": metrics.sharpe_ratio,
        "sortino": metrics.sortino_ratio,
        "win_rate_pct": metrics.win_rate_pct,
        "profit_factor": metrics.profit_factor,
        "max_drawdown_pct": metrics.max_drawdown_pct,
        "cagr_pct": metrics.cagr_pct,
        "total_return_pct": metrics.total_return_pct,
        "total_trades": metrics.total_trades,
        "stop_loss_count": metrics.stop_loss_count,
        "take_profit_count": metrics.take_profit_count,
        "final_equity": metrics.final_equity,
        "go_nogo": metrics.go_nogo["pass"],
        "verdict": metrics.go_nogo["verdict"],
        "params": {
            "sl_atr": sl_atr,
            "tp_atr": tp_atr,
            "slope_lookback": slope_lookback,
            "slope_threshold": slope_threshold,
            "volume_mult": volume_mult,
        },
    }


def run_daily_macd_backtest(
    df_daily: pd.DataFrame,
    symbol: str,
    start: date,
    end: date,
    capital: float,
) -> dict[str, Any]:
    """Run daily MACD composite-score baseline on daily bars. Returns metrics dict."""
    from src.backtest.engine import BacktestConfig, BacktestEngine
    from src.backtest.metrics import calculate_metrics

    log.info(
        "macd_baseline_start",
        symbol=symbol,
        bars=len(df_daily),
        start=str(start),
        end=str(end),
    )

    config = BacktestConfig(
        start=start,
        end=end,
        initial_capital=capital,
        timeframe="1Day",
        strategy="trend_following",
        stop_loss_atr=2.5,
        take_profit_atr=6.0,
        max_positions=5,
        trend_filter=True,
    )

    # Slice daily data to the same period (engine handles warmup internally)
    ts_start = pd.Timestamp(start, tz="UTC") - pd.Timedelta(days=210)
    ts_end = pd.Timestamp(end, tz="UTC") + pd.Timedelta(days=1)
    if df_daily.index.tz is None:
        df_daily = df_daily.copy()
        df_daily.index = df_daily.index.tz_localize("UTC")
    df_slice = df_daily[(df_daily.index >= ts_start) & (df_daily.index <= ts_end)]

    if df_slice.empty:
        log.warning("no_daily_data_for_baseline")
        return {"strategy": "daily_macd_baseline", "error": "no data"}

    engine = BacktestEngine(config)
    result = engine.run({symbol: df_slice})
    metrics = calculate_metrics(result)

    return {
        "strategy": "daily_macd_baseline",
        "timeframe": "1Day",
        "bars": len(df_slice),
        "start": str(start),
        "end": str(end),
        "sharpe": metrics.sharpe_ratio,
        "sortino": metrics.sortino_ratio,
        "win_rate_pct": metrics.win_rate_pct,
        "profit_factor": metrics.profit_factor,
        "max_drawdown_pct": metrics.max_drawdown_pct,
        "cagr_pct": metrics.cagr_pct,
        "total_return_pct": metrics.total_return_pct,
        "total_trades": metrics.total_trades,
        "stop_loss_count": metrics.stop_loss_count,
        "take_profit_count": metrics.take_profit_count,
        "final_equity": metrics.final_equity,
        "go_nogo": metrics.go_nogo["pass"],
        "verdict": metrics.go_nogo["verdict"],
        "params": {"sl_atr": 2.5, "tp_atr": 6.0},
    }


# ── Output formatting ─────────────────────────────────────────────────────────


def print_comparison(results: list[dict[str, Any]]) -> None:
    """Print a formatted comparison table of backtest results."""
    go_ok = "\u2705 GO"
    go_no = "\u274c NO-GO"

    print(f"\n{'='*78}")
    print(f"  BACKTEST COMPARISON: Slope+Volume 5-Min vs Daily MACD Baseline")
    print(f"{'='*78}")
    print(
        f"  {'Strategy':<28} {'Sharpe':>7} {'WinRate':>8} {'PF':>6} "
        f"{'MaxDD':>7} {'CAGR':>7} {'Trades':>7}  {'Go?'}"
    )
    print(f"  {'-'*72}")

    for r in results:
        if "error" in r:
            print(f"  {r['strategy']:<28}  [ERROR: {r['error']}]")
            continue
        verdict_short = go_ok if r.get("go_nogo") else go_no
        print(
            f"  {r['strategy']:<28} "
            f"{r['sharpe']:>+7.3f} "
            f"{r['win_rate_pct']:>7.1f}% "
            f"{r['profit_factor']:>6.2f} "
            f"{r['max_drawdown_pct']:>7.2f}% "
            f"{r['cagr_pct']:>6.2f}% "
            f"{r['total_trades']:>7}  "
            f"{verdict_short}"
        )

    print(f"  {'-'*72}")
    print()

    # Detail block for each strategy
    for r in results:
        if "error" in r:
            continue
        print(f"  [{r['strategy']}]")
        print(f"    Period     : {r['start']} → {r['end']}")
        print(f"    Timeframe  : {r['timeframe']}  ({r['bars']:,} bars)")
        print(f"    Capital    : $100,000 → ${r['final_equity']:,.2f}")
        print(f"    Return     : {r['total_return_pct']:+.2f}%  CAGR {r['cagr_pct']:+.2f}%")
        print(f"    Sharpe     : {r['sharpe']:+.3f}  Sortino {r.get('sortino', 0):+.3f}")
        print(f"    Max DD     : {r['max_drawdown_pct']:.2f}%")
        print(
            f"    Trades     : {r['total_trades']}  "
            f"(SL {r['stop_loss_count']} / TP {r['take_profit_count']})"
        )
        p = r.get("params", {})
        param_str = "  ".join(f"{k}={v}" for k, v in p.items())
        print(f"    Params     : {param_str}")
        print(f"    Verdict    : {r['verdict']}")
        print()

    print(f"{'='*78}")
    print()


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> int:
    args = parse_args()
    symbol = args.symbol.upper()

    # ── Load 5-min data ───────────────────────────────────────────────────────
    df_5min: pd.DataFrame | None = load_5min_csv(args.csv, symbol)

    if df_5min is None:
        log.warning("csv_not_found", path=str(args.csv), action="fetching_from_tiingo")
        df_5min = fetch_5min_tiingo(symbol, months=6)
        if df_5min is None:
            print(
                f"\n[ERROR] Could not load 5-min data.\n"
                f"  Option 1: Run fetch_spy_5min.py first:\n"
                f"              python scripts/fetch_spy_5min.py\n"
                f"  Option 2: Set TIINGO_API_KEY in .env.local for auto-fetch.\n"
            )
            return 1
        # Save for future runs
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        df_5min.to_csv(args.csv)
        log.info("auto_saved_csv", path=str(args.csv))

    if df_5min.empty:
        log.error("empty_dataframe", symbol=symbol)
        return 1

    # ── Determine period from 5-min data ──────────────────────────────────────
    from datetime import date as date_type

    start_d = df_5min.index[0].date()
    end_d = df_5min.index[-1].date()

    results: list[dict[str, Any]] = []

    # ── Run slope+volume backtest ─────────────────────────────────────────────
    try:
        slope_result = run_slope_backtest(
            df_5min=df_5min,
            symbol=symbol,
            sl_atr=args.sl_atr,
            tp_atr=args.tp_atr,
            slope_lookback=args.slope_lookback,
            slope_threshold=args.slope_threshold,
            volume_mult=args.volume_mult,
            capital=args.capital,
        )
        results.append(slope_result)
    except Exception as exc:
        log.error("slope_backtest_failed", error=str(exc), exc_info=True)
        results.append({"strategy": "slope_volume_5min", "error": str(exc)})

    # ── Run daily MACD baseline ───────────────────────────────────────────────
    if not args.no_baseline:
        df_daily = fetch_daily_tiingo(symbol, start_d, end_d)
        if df_daily is not None and not df_daily.empty:
            try:
                macd_result = run_daily_macd_backtest(
                    df_daily=df_daily,
                    symbol=symbol,
                    start=start_d,
                    end=end_d,
                    capital=args.capital,
                )
                results.append(macd_result)
            except Exception as exc:
                log.error("macd_baseline_failed", error=str(exc), exc_info=True)
                results.append({"strategy": "daily_macd_baseline", "error": str(exc)})
        else:
            log.warning("skipping_baseline", reason="no daily data available")

    # ── Print comparison ──────────────────────────────────────────────────────
    print_comparison(results)

    return 0


if __name__ == "__main__":
    sys.exit(main())
