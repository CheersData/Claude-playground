"""
Backtest CLI — Run backtests from the command line.

Usage:
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28
    python -m src.backtest run --start 2024-03-01 --end 2026-02-28 --timeframe 1Hour
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28 --capital 50000
    python -m src.backtest run --start 2023-03-01 --end 2026-02-28 --mode train_test
    python -m src.backtest grid --start 2024-03-01 --end 2026-02-28

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

# Sector ETF universe for 15-min mean reversion strategy
MEAN_REVERSION_UNIVERSE = [
    "XLF", "XLK", "XLE", "XLV", "XLI",
    "XLU", "XLY", "XLP", "XLRE", "XLB", "XLC",
    "SPY",  # benchmark + macro ETF
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m src.backtest",
        description="Trading Backtest Framework — Phase 2",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # --- Run command ---
    run_parser = subparsers.add_parser("run", help="Run a backtest")
    _add_common_args(run_parser)

    # --- Grid search command ---
    grid_parser = subparsers.add_parser("grid", help="Run grid search over parameters")
    grid_parser.add_argument(
        "--start", type=str, required=True,
        help="Start date (YYYY-MM-DD)",
    )
    grid_parser.add_argument(
        "--end", type=str, required=True,
        help="End date (YYYY-MM-DD)",
    )
    grid_parser.add_argument(
        "--capital", type=float, default=100_000,
        help="Initial capital (default: 100000)",
    )
    grid_parser.add_argument(
        "--universe", type=str, default=None,
        help="Comma-separated symbols (default: S&P 500 subset + ETFs)",
    )
    grid_parser.add_argument(
        "--timeframe", type=str, choices=["1Day", "1Hour", "15Min", "5Min"], default="1Day",
        help="Timeframe: 1Day, 1Hour, 15Min, or 5Min (default: 1Day)",
    )
    grid_parser.add_argument(
        "--output", type=str, default=None,
        help="Custom output directory for results",
    )
    grid_parser.add_argument(
        "--grid-preset", type=str, choices=["default", "tpsl", "cycle4"],
        default="default",
        help="Grid preset: 'default' (original 64-combo), 'tpsl' (96-combo TP/SL + trailing), or 'cycle4' (48-combo targeted SL/TP + signal exit, for 2-year window)",
    )

    return parser.parse_args()


def _add_common_args(parser: argparse.ArgumentParser) -> None:
    """Add common arguments to a subparser."""
    parser.add_argument(
        "--start", type=str, required=True,
        help="Start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end", type=str, required=True,
        help="End date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--capital", type=float, default=100_000,
        help="Initial capital (default: 100000)",
    )
    parser.add_argument(
        "--universe", type=str, default=None,
        help="Comma-separated symbols (default: S&P 500 subset + ETFs)",
    )
    parser.add_argument(
        "--mode", type=str, choices=["full", "train_test"], default="full",
        help="Backtest mode: full or train_test (70/30 split)",
    )
    parser.add_argument(
        "--slippage", type=float, default=4.0,
        help="Slippage in basis points (default: 4)",
    )
    parser.add_argument(
        "--max-positions", type=int, default=10,
        help="Max simultaneous positions (default: 10)",
    )
    parser.add_argument(
        "--max-position-pct", type=float, default=10.0,
        help="Max position size as %% of portfolio (default: 10.0)",
    )
    parser.add_argument(
        "--threshold", type=float, default=0.3,
        help="Signal score threshold for BUY/SELL (default: 0.3)",
    )
    parser.add_argument(
        "--sl-atr", type=float, default=2.0,
        help="Stop loss ATR multiplier (default: 2.0 — Cycle 4 tests 1.5-2.5)",
    )
    parser.add_argument(
        "--tp-atr", type=float, default=6.0,
        help="Take profit ATR multiplier (default: 6.0 — Cycle 4 tests 3.0-6.0)",
    )
    parser.add_argument(
        "--no-trend-filter", action="store_true",
        help="Disable SMA trend filter",
    )
    parser.add_argument(
        "--timeframe", type=str, choices=["1Day", "1Hour", "15Min", "5Min"], default="1Day",
        help="Timeframe: 1Day, 1Hour, 15Min, or 5Min (default: 1Day)",
    )
    parser.add_argument(
        "--strategy", type=str,
        choices=["trend_following", "mean_reversion", "mean_reversion_v3", "slope_volume", "noise_boundary"],
        default=None,
        help="Strategy override. Default: auto-detect from timeframe (15Min=mean_reversion, 5Min=slope_volume, else=trend_following)",
    )
    # Daily filter for mean reversion v3
    parser.add_argument(
        "--daily-filter-enabled", action="store_true", default=True,
        help="Enable daily SMA filter for mean_reversion_v3 (default: True)",
    )
    parser.add_argument(
        "--no-daily-filter", action="store_true",
        help="Disable daily SMA filter for mean_reversion_v3 (run v3 without daily trend check — ablation test)",
    )
    parser.add_argument(
        "--daily-sma-period", type=int, default=20,
        help="Daily SMA period for v3 trend filter (default: 20)",
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Custom output directory for results",
    )
    # Trailing stop parameters (4-tier system)
    parser.add_argument(
        "--trail-breakeven", type=float, default=1.0,
        help="Tier 0: Move SL to entry after this ATR profit (default: 1.0)",
    )
    parser.add_argument(
        "--trail-lock", type=float, default=1.5,
        help="Tier 1: Lock profit after this ATR profit (default: 1.5)",
    )
    parser.add_argument(
        "--trail-lock-cushion", type=float, default=0.5,
        help="Tier 1: Cushion above entry in ATR (default: 0.5)",
    )
    parser.add_argument(
        "--trail-threshold", type=float, default=2.5,
        help="Tier 2: Start trailing after this ATR profit (default: 2.5)",
    )
    parser.add_argument(
        "--trail-distance", type=float, default=1.5,
        help="Tier 2: Trail distance from highest close in ATR (default: 1.5)",
    )
    parser.add_argument(
        "--trail-tight-threshold", type=float, default=4.0,
        help="Tier 3: Tight trail after this ATR profit (default: 4.0)",
    )
    parser.add_argument(
        "--trail-tight-distance", type=float, default=1.0,
        help="Tier 3: Tight trail distance from highest close in ATR (default: 1.0)",
    )
    # Wave detection: 3-factor entry gate
    parser.add_argument(
        "--slope-lookback", type=int, default=10,
        help="Slope OLS regression lookback bars (default: 10)",
    )
    parser.add_argument(
        "--slope-threshold", type=float, default=0.01,
        help="Min slope %% per bar for entry (default: 0.01)",
    )
    parser.add_argument(
        "--accel-bars", type=int, default=5,
        help="Bars back to measure slope acceleration (default: 5)",
    )
    parser.add_argument(
        "--min-accel-pct", type=float, default=0.01,
        help="Min slope growth %% for entry (default: 0.01)",
    )
    parser.add_argument(
        "--vol-trend-bars", type=int, default=5,
        help="Bars for volume trend regression (default: 5)",
    )
    parser.add_argument(
        "--persistence-bars", type=int, default=8,
        help="Consecutive bars with same slope direction required (default: 8)",
    )
    parser.add_argument(
        "--contrarian", action="store_true", default=False,
        help="Contrarian mode: fade the wave (invert BUY↔SHORT after 3-factor confirmation)",
    )
    parser.add_argument(
        "--anticipatory", action="store_true", default=False,
        help="Anticipatory mode: enter when wave decelerates (early mean-reversion entry)",
    )
    # Noise Boundary Momentum parameters (Zarattini-Aziz-Barbon 2024)
    parser.add_argument(
        "--nb-band-mult", type=float, default=1.0,
        help="Noise boundary width multiplier (default: 1.0 — paper default)",
    )
    parser.add_argument(
        "--nb-lookback-days", type=int, default=14,
        help="Rolling lookback in trading days for sigma_open (default: 14)",
    )
    parser.add_argument(
        "--nb-trade-freq", type=int, default=6,
        help="Signal evaluation frequency in bars (default: 6 = 30min on 5Min bars)",
    )
    parser.add_argument(
        "--nb-safety-sl-atr", type=float, default=3.0,
        help="Wide crash-protection SL in ATR units (default: 3.0 — primary exit is signal change)",
    )
    parser.add_argument(
        "--nb-last-entry-utc", type=int, default=19,
        help="Last UTC hour for new NB entries (default: 19 — no entries after 19:00 UTC / 3PM ET)",
    )
    # NB Enhancement 1: Volatility-targeted sizing
    parser.add_argument(
        "--nb-vol-sizing", action="store_true", default=False,
        help="Enable volatility-targeted position sizing (paper: target 15%% annualized vol)",
    )
    parser.add_argument(
        "--nb-vol-target", type=float, default=15.0,
        help="Target annualized volatility %% for vol-sizing (default: 15.0)",
    )
    parser.add_argument(
        "--nb-vol-max-leverage", type=float, default=4.0,
        help="Max leverage cap for vol-targeted sizing (default: 4.0)",
    )
    # NB Enhancement 2: VIX regime filter
    parser.add_argument(
        "--nb-vix-filter", action="store_true", default=False,
        help="Enable VIX regime filter (skip NB entries when VIX < threshold)",
    )
    parser.add_argument(
        "--nb-vix-threshold", type=float, default=20.0,
        help="VIX threshold for regime filter (default: 20.0 — trade momentum above, skip below)",
    )
    # NB Enhancement 3: VWAP exit (Maroy 2025)
    parser.add_argument(
        "--nb-vwap-exit", action="store_true", default=False,
        help="Enable VWAP-based profit-taking exit for NB positions (Maroy 2025)",
    )
    # NB Enhancement 4: VWAP trailing stop (Maroy 2025 — replaces nb_exit)
    parser.add_argument(
        "--nb-vwap-trailing", action="store_true", default=False,
        help="Enable VWAP trailing stop: long stop=max(VWAP,UB), short stop=min(VWAP,LB). Replaces signal-change exit.",
    )
    # NB Enhancement 5: Minimum hold time
    parser.add_argument(
        "--nb-min-hold-bars", type=int, default=0,
        help="Min bars to hold before any NB exit (0=disabled, 12=60min on 5Min). Prevents premature exits.",
    )


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

    # Parse universe — auto-select based on timeframe
    if args.universe:
        symbols = [s.strip().upper() for s in args.universe.split(",")]
    elif args.timeframe in ("15Min", "5Min"):
        # Slope+volume and mean reversion work best on liquid single names + ETFs
        symbols = MEAN_REVERSION_UNIVERSE
    else:
        symbols = DEFAULT_UNIVERSE

    # Derive strategy from timeframe if not explicitly set
    if args.strategy:
        strategy = args.strategy
    elif args.timeframe == "5Min":
        strategy = "slope_volume"
    elif args.timeframe == "15Min":
        strategy = "mean_reversion"
    else:
        strategy = "trend_following"

    # Daily filter settings (v3 only)
    daily_filter_enabled = not getattr(args, "no_daily_filter", False)
    daily_sma_period = getattr(args, "daily_sma_period", 20)

    # Build config
    config = BacktestConfig(
        start=start,
        end=end,
        initial_capital=args.capital,
        slippage_bps=args.slippage,
        max_positions=args.max_positions,
        max_position_pct=args.max_position_pct,
        signal_threshold=args.threshold,
        stop_loss_atr=args.sl_atr,
        take_profit_atr=args.tp_atr,
        trend_filter=not args.no_trend_filter,
        train_test_split=0.7 if args.mode == "train_test" else None,
        timeframe=args.timeframe,
        strategy=strategy,
        # v3 daily filter
        daily_filter_enabled=daily_filter_enabled,
        daily_sma_period=daily_sma_period,
        # 4-tier trailing stop
        trailing_breakeven_atr=args.trail_breakeven,
        trailing_lock_atr=args.trail_lock,
        trailing_lock_cushion_atr=args.trail_lock_cushion,
        trailing_trail_threshold_atr=args.trail_threshold,
        trailing_trail_distance_atr=args.trail_distance,
        trailing_tight_threshold_atr=args.trail_tight_threshold,
        trailing_tight_distance_atr=args.trail_tight_distance,
        # Wave detection: 3-factor entry gate
        slope_lookback_bars=args.slope_lookback,
        slope_threshold_pct=args.slope_threshold,
        slope_acceleration_bars=args.accel_bars,
        slope_min_acceleration_pct=args.min_accel_pct,
        slope_volume_trend_bars=args.vol_trend_bars,
        slope_persistence_bars=args.persistence_bars,
        slope_contrarian=args.contrarian,
        slope_anticipatory=args.anticipatory,
        # Noise Boundary Momentum
        nb_band_mult=args.nb_band_mult,
        nb_lookback_days=args.nb_lookback_days,
        nb_trade_freq_bars=args.nb_trade_freq,
        nb_safety_sl_atr=args.nb_safety_sl_atr,
        nb_last_entry_utc=args.nb_last_entry_utc,
        # NB Enhancements (paper-complete implementation)
        nb_vol_sizing=args.nb_vol_sizing,
        nb_vol_target_pct=args.nb_vol_target,
        nb_vol_max_leverage=args.nb_vol_max_leverage,
        nb_vix_filter=args.nb_vix_filter,
        nb_vix_threshold=args.nb_vix_threshold,
        nb_vwap_exit=args.nb_vwap_exit,
        nb_vwap_trailing=args.nb_vwap_trailing,
        nb_min_hold_bars=args.nb_min_hold_bars,
    )

    if strategy == "noise_boundary":
        tf_label = f"NOISE BOUNDARY MOMENTUM ({args.timeframe})"
    else:
        tf_label = {
            "1Day": "DAILY",
            "1Hour": "HOURLY",
            "15Min": f"15-MIN MEAN REVERSION {'v3' if strategy == 'mean_reversion_v3' else 'v2'}",
            "5Min":  "5-MIN SLOPE+VOLUME",
        }.get(args.timeframe, args.timeframe)
    print(f"\n{'='*70}")
    print(f"  BACKTEST [{tf_label}] -- {start} -> {end}")
    print(f"  Strategy: {strategy}")
    print(f"  Capital: ${config.initial_capital:,.0f} | Symbols: {len(symbols)} | Mode: {args.mode}")
    print(f"  Slippage: {config.slippage_bps} bps | Max Positions: {config.max_positions}")
    print(f"  SL: {config.stop_loss_atr}x ATR | TP: {config.take_profit_atr}x ATR")
    print(f"  Trend Filter: {'ON' if config.trend_filter else 'OFF'}")
    if strategy == "mean_reversion_v3":
        print(f"  Daily Filter: {'ON' if daily_filter_enabled else 'OFF'} | SMA({daily_sma_period})")
    print(f"  Trailing: BE={config.trailing_breakeven_atr} Lock={config.trailing_lock_atr}"
          f" Trail={config.trailing_trail_threshold_atr}/{config.trailing_trail_distance_atr}"
          f" Tight={config.trailing_tight_threshold_atr}/{config.trailing_tight_distance_atr}")
    if strategy == "slope_volume":
        print(f"  3-Factor: lookback={config.slope_lookback_bars} threshold={config.slope_threshold_pct}"
              f" accel_bars={config.slope_acceleration_bars} min_accel={config.slope_min_acceleration_pct}"
              f" vol_trend={config.slope_volume_trend_bars} persist={config.slope_persistence_bars}")
    if strategy == "noise_boundary":
        print(f"  NB: band_mult={config.nb_band_mult} lookback_days={config.nb_lookback_days}"
              f" trade_freq={config.nb_trade_freq_bars} safety_sl={config.nb_safety_sl_atr}x ATR")
        enhancements = []
        if config.nb_vol_sizing:
            enhancements.append(f"VolSizing(target={config.nb_vol_target_pct}%, max_lev={config.nb_vol_max_leverage}x)")
        if config.nb_vix_filter:
            enhancements.append(f"VIX(>{config.nb_vix_threshold})")
        if config.nb_vwap_exit:
            enhancements.append("VWAP-Exit")
        if config.nb_vwap_trailing:
            enhancements.append("VWAP-Trailing")
        if config.nb_min_hold_bars > 0:
            enhancements.append(f"MinHold({config.nb_min_hold_bars}bars)")
        if enhancements:
            print(f"  NB Enhancements: {' + '.join(enhancements)}")
    print(f"{'='*70}\n")

    # Step 1: Load data
    loader = DataLoader()
    daily_data = None

    if strategy == "mean_reversion_v3":
        # Dual-timeframe: load both 15-min and daily bars
        logger.info(
            "loading_multi_timeframe",
            symbols=len(symbols),
            start=str(start),
            end=str(end),
        )
        data, daily_data = loader.load_multi_timeframe(
            symbols, start, end,
            primary_timeframe=args.timeframe,
            secondary_timeframe="1Day",
        )
    else:
        logger.info(
            "loading_data",
            symbols=len(symbols),
            start=str(start),
            end=str(end),
            timeframe=args.timeframe,
        )
        data = loader.load(symbols, start, end, timeframe=args.timeframe)

    if not data:
        print("Error: No data loaded. Check API keys and date range.")
        sys.exit(1)

    logger.info(
        "data_loaded",
        symbols=len(data),
        total_bars=sum(len(df) for df in data.values()),
        daily_symbols=len(daily_data) if daily_data else 0,
    )

    # Step 2: Run backtest
    logger.info("running_backtest", strategy=strategy)
    engine = BacktestEngine(config)
    result = engine.run(data, daily_data=daily_data)

    # Step 3: Calculate metrics
    logger.info("calculating_metrics")
    metrics = calculate_metrics(result)

    # Step 4: Generate report
    output_dir = Path(args.output) if args.output else None
    report_dir = generate_report(result, metrics, output_dir)

    print(f"\n  Report saved to: {report_dir}")
    print("     - report.json")
    print("     - equity_curve.png")
    print("     - trades.csv")
    print()


def cmd_grid(args: argparse.Namespace) -> None:
    """Execute grid search over parameters."""
    from .grid_search import run_grid_search

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

    output_dir = Path(args.output) if args.output else None

    # Select grid preset
    selected_grid = None
    if args.grid_preset == "tpsl":
        from .grid_search import TPSL_OPTIMIZATION_GRID
        selected_grid = TPSL_OPTIMIZATION_GRID
    elif args.grid_preset == "cycle4":
        from .grid_search import CYCLE4_GRID
        selected_grid = CYCLE4_GRID

    run_grid_search(
        symbols=symbols,
        start=start,
        end=end,
        initial_capital=args.capital,
        timeframe=args.timeframe,
        output_dir=output_dir,
        param_grid=selected_grid,
    )


def main() -> None:
    args = parse_args()

    if args.command is None:
        print("Usage: python -m src.backtest run --start YYYY-MM-DD --end YYYY-MM-DD")
        print("       python -m src.backtest grid --start YYYY-MM-DD --end YYYY-MM-DD")
        print("       python -m src.backtest run --help")
        sys.exit(0)

    if args.command == "run":
        cmd_run(args)
    elif args.command == "grid":
        cmd_grid(args)


if __name__ == "__main__":
    main()
