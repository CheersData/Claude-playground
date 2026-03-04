"""
grid_search_tpsl.py — Grid search over 96 TP/SL combinations on 5-min slope strategy.

Runs the slope+volume strategy on SPY 5-min bars across:
  - 8 TP values × 6 SL values = 48 combinations
  - Extended to 96 by also varying slope_threshold (2 values)

All combinations are evaluated on a 2-year backtest window.
Results are sorted by Sharpe ratio and saved to trading/data/grid_search_results.csv.

Usage (from trading/ directory):
    python scripts/grid_search_tpsl.py
    python scripts/grid_search_tpsl.py --symbol SPY --capital 100000
    python scripts/grid_search_tpsl.py --csv data/spy_5min_6m.csv --output data/grid_results.csv

Grid:
    tp_atr   : [2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0]   (8 values)
    sl_atr   : [1.0, 1.5, 2.0, 2.5, 3.0, 3.5]                (6 values)
    → 48 combinations per threshold
    slope_threshold: [0.01, 0.02]                              (2 values)
    → 96 total combinations

Output:
    - Top 10 combos printed to stdout
    - Full grid saved to trading/data/grid_search_results.csv
"""

from __future__ import annotations

import argparse
import functools
import os
import sys
import time
from datetime import date, timedelta
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

# ── Grid definition ───────────────────────────────────────────────────────────
TP_VALUES: list[float] = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0]    # 8 values
SL_VALUES: list[float] = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5]                  # 6 values
SLOPE_THRESHOLDS: list[float] = [0.01, 0.02]                               # 2 values
# Total: 8 × 6 × 2 = 96 combinations

SLOPE_LOOKBACK = 5
VOLUME_MULT = 1.3

DEFAULT_CSV = _TRADING_DIR / "data" / "spy_5min_6m.csv"
DEFAULT_OUTPUT = _TRADING_DIR / "data" / "grid_search_results.csv"
DEFAULT_SYMBOL = "SPY"
DEFAULT_CAPITAL = 100_000.0

# Minimum bars before backtest is considered valid (avoid very sparse data)
MIN_BARS_THRESHOLD = 100


# ── CLI ───────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="grid_search_tpsl",
        description="Grid search 96 TP/SL combinations on slope+volume 5-min strategy",
    )
    p.add_argument("--symbol", default=DEFAULT_SYMBOL, help="Symbol (default: SPY)")
    p.add_argument(
        "--csv",
        type=Path,
        default=DEFAULT_CSV,
        help=f"Path to 5-min CSV (default: {DEFAULT_CSV}). Fetched from Tiingo if missing.",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Output CSV path for grid results (default: {DEFAULT_OUTPUT})",
    )
    p.add_argument(
        "--capital",
        type=float,
        default=DEFAULT_CAPITAL,
        help=f"Starting capital (default: ${DEFAULT_CAPITAL:,.0f})",
    )
    p.add_argument(
        "--top-n",
        type=int,
        default=10,
        dest="top_n",
        help="Number of top combinations to print (default: 10)",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress per-combination progress output",
    )
    return p.parse_args()


# ── Data loading (shared with backtest_5min_slope.py) ─────────────────────────


def load_5min_csv(csv_path: Path, symbol: str) -> pd.DataFrame | None:
    if not csv_path.exists():
        return None
    log.info("loading_csv", path=str(csv_path))
    df = pd.read_csv(csv_path, index_col=0, parse_dates=True)
    if df.index.tz is None:
        df.index = df.index.tz_localize("UTC")
    else:
        df.index = df.index.tz_convert("UTC")
    df.index.name = "timestamp"
    log.info("csv_loaded", rows=len(df), symbol=symbol)
    return df


def fetch_5min_tiingo(symbol: str, months: int = 6) -> pd.DataFrame | None:
    api_key = os.environ.get("TIINGO_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from src.connectors.tiingo_client import TiingoClient

        client = TiingoClient(api_key=api_key)
        bars = client.get_bars(symbols=[symbol], timeframe="5Min", days_back=months * 30 + 5)
        return bars.get(symbol)
    except Exception as exc:
        log.error("tiingo_fetch_failed", symbol=symbol, error=str(exc))
        return None


# ── Single backtest run ───────────────────────────────────────────────────────


def run_single(
    df_5min: pd.DataFrame,
    symbol: str,
    sl_atr: float,
    tp_atr: float,
    slope_threshold: float,
    capital: float,
) -> dict[str, Any]:
    """Run one backtest combination. Returns metrics dict."""
    from src.backtest.engine import BacktestConfig, BacktestEngine
    from src.backtest.metrics import calculate_metrics

    start_d = df_5min.index[0].date()
    end_d = df_5min.index[-1].date()

    config = BacktestConfig(
        start=start_d,
        end=end_d,
        initial_capital=capital,
        timeframe="5Min",
        strategy="slope_volume",
        stop_loss_atr=sl_atr,
        take_profit_atr=tp_atr,
        max_positions=5,
        trend_filter=False,
    )

    # Patch analyze_slope_volume to inject our grid params
    import src.analysis as _analysis_mod

    _saved = _analysis_mod.analyze_slope_volume

    @functools.wraps(_saved)
    def _patched(sym: str, df: pd.DataFrame, **kw: Any) -> Any:  # noqa: ANN401
        kw.setdefault("lookback_bars", SLOPE_LOOKBACK)
        kw.setdefault("slope_threshold_pct", slope_threshold)
        kw.setdefault("volume_multiplier", VOLUME_MULT)
        kw.setdefault("stop_loss_atr", sl_atr)
        kw.setdefault("take_profit_atr", tp_atr)
        return _saved(sym, df, **kw)

    _analysis_mod.analyze_slope_volume = _patched

    try:
        engine = BacktestEngine(config)
        result = engine.run({symbol: df_5min})
    except Exception as exc:
        _analysis_mod.analyze_slope_volume = _saved
        return {
            "sl_atr": sl_atr,
            "tp_atr": tp_atr,
            "slope_threshold": slope_threshold,
            "error": str(exc),
            "sharpe_ratio": float("-inf"),
            "win_rate_pct": 0.0,
            "profit_factor": 0.0,
            "max_drawdown_pct": -999.0,
            "cagr_pct": 0.0,
            "total_return_pct": 0.0,
            "total_trades": 0,
            "stop_loss_count": 0,
            "take_profit_count": 0,
            "go_nogo": False,
            "final_equity": capital,
        }
    finally:
        _analysis_mod.analyze_slope_volume = _saved

    m = calculate_metrics(result)

    return {
        "sl_atr": sl_atr,
        "tp_atr": tp_atr,
        "slope_threshold": slope_threshold,
        "slope_lookback": SLOPE_LOOKBACK,
        "volume_mult": VOLUME_MULT,
        "sharpe_ratio": m.sharpe_ratio,
        "sortino_ratio": m.sortino_ratio,
        "win_rate_pct": m.win_rate_pct,
        "profit_factor": m.profit_factor,
        "max_drawdown_pct": m.max_drawdown_pct,
        "cagr_pct": m.cagr_pct,
        "total_return_pct": m.total_return_pct,
        "total_trades": m.total_trades,
        "stop_loss_count": m.stop_loss_count,
        "take_profit_count": m.take_profit_count,
        "go_nogo": m.go_nogo["pass"],
        "verdict": m.go_nogo["verdict"],
        "final_equity": m.final_equity,
        "start": str(start_d),
        "end": str(end_d),
    }


# ── Print helpers ─────────────────────────────────────────────────────────────


def _progress_line(
    i: int,
    total: int,
    sl: float,
    tp: float,
    thresh: float,
    r: dict[str, Any],
    elapsed: float,
    eta: float,
) -> str:
    go_str = "GO" if r.get("go_nogo") else "NO-GO"
    sharpe_str = f"{r['sharpe_ratio']:+.3f}" if isinstance(r.get("sharpe_ratio"), float) else "ERR"
    return (
        f"  [{i:>3}/{total}] SL={sl:.1f}x  TP={tp:>5.1f}x  thr={thresh:.3f}  "
        f"Sharpe={sharpe_str}  WR={r.get('win_rate_pct', 0):.1f}%  "
        f"T={r.get('total_trades', 0):>4}  [{go_str}]  "
        f"ETA: {int(eta)}s"
    )


def print_top_n(df_results: pd.DataFrame, top_n: int, symbol: str) -> None:
    """Print the top N combinations sorted by Sharpe ratio."""
    go_ok = "\u2705"
    go_no = "\u274c"

    df_sorted = df_results.sort_values("sharpe_ratio", ascending=False)
    top = df_sorted.head(top_n)

    print(f"\n{'='*80}")
    print(f"  GRID SEARCH COMPLETE — {symbol} (5-Min Slope+Volume)")
    print(f"  Combinations: {len(df_results)}  |  GO results: {df_results['go_nogo'].sum()}/{len(df_results)}")
    print(f"{'='*80}")
    print(
        f"  {'#':>3}  {'SL':>5} {'TP':>6} {'Thr':>6} | "
        f"{'Sharpe':>7} {'WR%':>6} {'PF':>5} {'MaxDD':>7} "
        f"{'CAGR':>6} {'T':>5}  Go?"
    )
    print(f"  {'-'*78}")

    for rank, (_, row) in enumerate(top.iterrows(), start=1):
        go_icon = go_ok if row.get("go_nogo") else go_no
        sharpe = row.get("sharpe_ratio", float("nan"))
        print(
            f"  {rank:>3}  {row['sl_atr']:>5.1f} {row['tp_atr']:>6.1f} {row['slope_threshold']:>6.3f} | "
            f"  {sharpe:>+6.3f} {row.get('win_rate_pct', 0):>5.1f}% "
            f"{row.get('profit_factor', 0):>5.2f} "
            f"{row.get('max_drawdown_pct', 0):>7.2f}% "
            f"{row.get('cagr_pct', 0):>5.2f}% "
            f"{int(row.get('total_trades', 0)):>5}  {go_icon}"
        )

    print(f"\n  Go/No-Go criteria: Sharpe>1.0 | MaxDD<15% | WinRate>50% | PF>1.5 | Trades>100")
    print(f"{'='*80}\n")


# ── Main ──────────────────────────────────────────────────────────────────────


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
                f"  Run fetch_spy_5min.py first:\n"
                f"    python scripts/fetch_spy_5min.py\n"
                f"  Or set TIINGO_API_KEY in .env.local for auto-fetch.\n"
            )
            return 1
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        df_5min.to_csv(args.csv)
        log.info("auto_saved_csv", path=str(args.csv))

    if df_5min.empty or len(df_5min) < MIN_BARS_THRESHOLD:
        log.error(
            "insufficient_data",
            rows=len(df_5min),
            minimum=MIN_BARS_THRESHOLD,
        )
        return 1

    # ── Build grid ────────────────────────────────────────────────────────────
    combos: list[tuple[float, float, float]] = [
        (sl, tp, thresh)
        for thresh in SLOPE_THRESHOLDS
        for sl in SL_VALUES
        for tp in TP_VALUES
    ]
    total = len(combos)

    print(f"\n{'='*70}")
    print(f"  GRID SEARCH: {symbol} 5-Min Slope+Volume")
    print(f"  Combinations: {total}  ({len(SL_VALUES)} SL × {len(TP_VALUES)} TP × {len(SLOPE_THRESHOLDS)} thresholds)")
    print(f"  Data: {len(df_5min):,} bars  |  {df_5min.index[0].date()} → {df_5min.index[-1].date()}")
    print(f"  Capital: ${args.capital:,.0f}")
    print(f"{'='*70}\n")

    all_results: list[dict[str, Any]] = []
    t_start = time.monotonic()

    for i, (sl, tp, thresh) in enumerate(combos, start=1):
        t0 = time.monotonic()

        r = run_single(
            df_5min=df_5min,
            symbol=symbol,
            sl_atr=sl,
            tp_atr=tp,
            slope_threshold=thresh,
            capital=args.capital,
        )
        all_results.append(r)

        if not args.quiet:
            elapsed_total = time.monotonic() - t_start
            avg_per_run = elapsed_total / i
            eta = avg_per_run * (total - i)
            print(
                _progress_line(
                    i, total, sl, tp, thresh, r,
                    elapsed=time.monotonic() - t0,
                    eta=eta,
                )
            )

    total_elapsed = time.monotonic() - t_start

    # ── Save full results to CSV ──────────────────────────────────────────────
    df_results = pd.DataFrame(all_results)
    # Sort by Sharpe descending before saving
    df_results = df_results.sort_values("sharpe_ratio", ascending=False).reset_index(drop=True)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    df_results.to_csv(args.output, index=False)
    log.info("grid_saved", path=str(args.output), rows=len(df_results))

    # ── Print summary ─────────────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"  GRID SEARCH COMPLETE")
    print(f"  Combinations: {total}  |  Elapsed: {total_elapsed:.1f}s")
    print(f"  Results saved: {args.output}")
    print(f"{'='*70}")

    print_top_n(df_results, top_n=args.top_n, symbol=symbol)

    # ── Bonus: print the absolute best combo ─────────────────────────────────
    best = df_results.iloc[0]
    print(f"  BEST COMBO:")
    print(f"    SL={best['sl_atr']:.1f}x ATR  TP={best['tp_atr']:.1f}x ATR  "
          f"Threshold={best['slope_threshold']:.3f}%/bar")
    print(f"    Sharpe={best['sharpe_ratio']:+.3f}  "
          f"WinRate={best.get('win_rate_pct', 0):.1f}%  "
          f"PF={best.get('profit_factor', 0):.2f}  "
          f"MaxDD={best.get('max_drawdown_pct', 0):.2f}%  "
          f"Trades={int(best.get('total_trades', 0))}")
    if best.get("go_nogo"):
        print(f"    Verdict: \u2705 GO — Ready for paper trading!")
    else:
        print(f"    Verdict: \u274c NO-GO — Does not meet all criteria yet.")
    print()

    # ── Analysis: slope_threshold impact ─────────────────────────────────────
    if "slope_threshold" in df_results.columns:
        print(f"  SLOPE THRESHOLD ANALYSIS:")
        for thresh in SLOPE_THRESHOLDS:
            subset = df_results[df_results["slope_threshold"] == thresh]
            if not subset.empty:
                avg_sharpe = subset["sharpe_ratio"].mean()
                go_count = subset["go_nogo"].sum()
                print(f"    threshold={thresh:.3f}: avg Sharpe={avg_sharpe:+.3f}  GO={go_count}/{len(subset)}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())
