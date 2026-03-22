"""
Backtest Report — Generate JSON report, equity curve chart, trade log CSV.

Output directory: trading/backtest-results/<timestamp>/
"""

from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

import structlog

logger = structlog.get_logger()

DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "backtest-results"


def generate_report(
    result,
    metrics,
    output_dir: Path | None = None,
) -> Path:
    """
    Generate complete backtest report.

    Creates:
    - report.json — full metrics + config
    - equity_curve.png — equity + drawdown chart (2 subplots)
    - trades.csv — trade log
    - summary printed to console

    Args:
        result: BacktestResult from engine.
        metrics: PerformanceMetrics from metrics module.
        output_dir: Custom output directory. Defaults to backtest-results/<timestamp>/.

    Returns:
        Path to output directory.
    """
    # Create output directory
    if output_dir is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = DEFAULT_OUTPUT_DIR / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)

    # 1. JSON report
    _write_json_report(result, metrics, output_dir)

    # 2. Equity curve chart
    _write_equity_chart(result, metrics, output_dir)

    # 3. Trade log CSV
    _write_trade_csv(result, output_dir)

    # 4. Console summary
    _print_summary(result, metrics)

    # 5. Persist to local SQLite (backtest.db)
    _persist_to_sqlite(result, metrics)

    logger.info("report_generated", output_dir=str(output_dir))
    return output_dir


def _write_json_report(result, metrics, output_dir: Path) -> None:
    """Write comprehensive JSON report."""
    report = {
        "generated_at": datetime.now().isoformat(),
        "config": {
            "start": str(result.config.start),
            "end": str(result.config.end),
            "initial_capital": result.config.initial_capital,
            "slippage_bps": result.config.slippage_bps,
            "max_positions": result.config.max_positions,
            "max_position_pct": result.config.max_position_pct,
            "max_loss_per_trade_pct": result.config.max_loss_per_trade_pct,
            "daily_loss_limit_pct": result.config.daily_loss_limit_pct,
            "weekly_loss_limit_pct": result.config.weekly_loss_limit_pct,
            "warmup_bars": result.config.warmup_bars,
            "train_test_split": result.config.train_test_split,
        },
        "performance": {
            "total_return_pct": metrics.total_return_pct,
            "cagr_pct": metrics.cagr_pct,
            "annualized_volatility_pct": metrics.annualized_volatility_pct,
            "sharpe_ratio": metrics.sharpe_ratio,
            "sortino_ratio": metrics.sortino_ratio,
            "max_drawdown_pct": metrics.max_drawdown_pct,
            "max_drawdown_duration_days": metrics.max_drawdown_duration_days,
            "avg_drawdown_pct": metrics.avg_drawdown_pct,
        },
        "trades": {
            "total": metrics.total_trades,
            "winning": metrics.winning_trades,
            "losing": metrics.losing_trades,
            "win_rate_pct": metrics.win_rate_pct,
            "profit_factor": metrics.profit_factor,
            "avg_win_pct": metrics.avg_win_pct,
            "avg_loss_pct": metrics.avg_loss_pct,
            "avg_hold_days": metrics.avg_hold_days,
            "best_trade_pct": metrics.best_trade_pct,
            "worst_trade_pct": metrics.worst_trade_pct,
            "max_win_streak": metrics.max_win_streak,
            "max_loss_streak": metrics.max_loss_streak,
        },
        "close_reasons": {
            "stop_loss": metrics.stop_loss_count,
            "take_profit": metrics.take_profit_count,
            "signal_exit": metrics.signal_exit_count,
            "slope_exit": metrics.slope_exit_count,
            "adverse_slope_exit": metrics.adverse_slope_exit_count,
            "nb_exit": metrics.nb_exit_count,
            "vwap_exit": metrics.vwap_exit_count,
            "eod_close": metrics.eod_close_count,
            "end_of_backtest": metrics.end_of_backtest_count,
            "kill_switch": metrics.kill_switch_exit_count,
        },
        "portfolio": {
            "final_equity": metrics.final_equity,
            "total_pnl": metrics.total_pnl,
            "exposure_pct": metrics.exposure_pct,
            "avg_positions": metrics.avg_positions,
        },
        "execution": {
            "total_bars": result.total_bars,
            "signals_generated": result.signals_generated,
            "orders_filled": result.orders_filled,
            "kill_switch_triggered": result.kill_switch_triggered,
            "kill_switch_date": result.kill_switch_date,
        },
        "go_nogo": metrics.go_nogo,
    }

    path = output_dir / "report.json"
    with open(path, "w") as f:
        json.dump(report, f, indent=2, default=str)
    logger.debug("json_report_written", path=str(path))


def _write_equity_chart(result, metrics, output_dir: Path) -> None:
    """Generate equity curve + drawdown chart."""
    try:
        import matplotlib
        matplotlib.use("Agg")  # Non-interactive backend
        import matplotlib.pyplot as plt
        import matplotlib.dates as mdates
    except ImportError:
        logger.warning("matplotlib_not_installed", msg="Skipping chart generation")
        return

    if not result.equity_curve:
        return

    dates = []
    equities = []
    drawdowns = []

    for point in result.equity_curve:
        try:
            dates.append(datetime.strptime(point["date"], "%Y-%m-%d"))
        except (ValueError, TypeError):
            continue
        equities.append(point["equity"])
        drawdowns.append(point["drawdown_pct"])

    if not dates:
        return

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), height_ratios=[3, 1], sharex=True)
    fig.suptitle("Backtest Results", fontsize=14, fontweight="bold")

    # --- Equity curve ---
    ax1.plot(dates, equities, color="#2196F3", linewidth=1.2, label="Portfolio Equity")
    ax1.axhline(
        y=result.config.initial_capital,
        color="#888888",
        linestyle="--",
        linewidth=0.8,
        label=f"Initial ${result.config.initial_capital:,.0f}",
    )

    # Mark trades
    for trade in result.trades:
        try:
            entry_dt = datetime.strptime(trade.entry_date, "%Y-%m-%d")
            exit_dt = datetime.strptime(trade.exit_date, "%Y-%m-%d")
            color = "#4CAF50" if trade.pnl > 0 else "#F44336"
            ax1.axvline(x=entry_dt, color=color, alpha=0.15, linewidth=0.5)
        except (ValueError, TypeError):
            pass

    ax1.set_ylabel("Equity ($)")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.grid(True, alpha=0.3)
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f"${x:,.0f}"))

    # Stats annotation
    stats_text = (
        f"Return: {metrics.total_return_pct:+.1f}%  |  "
        f"Sharpe: {metrics.sharpe_ratio:.2f}  |  "
        f"Max DD: {metrics.max_drawdown_pct:.1f}%  |  "
        f"Win Rate: {metrics.win_rate_pct:.0f}%  |  "
        f"Trades: {metrics.total_trades}"
    )
    ax1.text(
        0.5, 1.02, stats_text,
        transform=ax1.transAxes, fontsize=9,
        ha="center", va="bottom", color="#666666",
    )

    # --- Drawdown ---
    ax2.fill_between(dates, drawdowns, 0, color="#F44336", alpha=0.3)
    ax2.plot(dates, drawdowns, color="#F44336", linewidth=0.8)
    ax2.set_ylabel("Drawdown (%)")
    ax2.set_xlabel("Date")
    ax2.grid(True, alpha=0.3)
    ax2.axhline(y=-15, color="#FF9800", linestyle="--", linewidth=0.8, label="Limit -15%")
    ax2.legend(loc="lower left", fontsize=8)

    # Format x-axis
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    plt.xticks(rotation=45)

    plt.tight_layout()
    path = output_dir / "equity_curve.png"
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)
    logger.debug("equity_chart_saved", path=str(path))


def _write_trade_csv(result, output_dir: Path) -> None:
    """Write trade log as CSV."""
    if not result.trades:
        return

    path = output_dir / "trades.csv"
    fieldnames = [
        "symbol", "action", "entry_date", "entry_price", "exit_date",
        "exit_price", "shares", "pnl", "pnl_pct", "hold_days",
        "close_reason", "stop_loss", "take_profit",
        "signal_score", "signal_confidence",
    ]

    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for trade in result.trades:
            writer.writerow(trade.model_dump())

    logger.debug("trade_csv_saved", path=str(path), trades=len(result.trades))


def _print_summary(result, metrics) -> None:
    """Print human-readable summary to console."""
    go = metrics.go_nogo

    print("\n" + "=" * 70)
    print("  BACKTEST REPORT")
    print("=" * 70)
    print(f"  Period:     {result.config.start} → {result.config.end}")
    print(f"  Capital:    ${result.config.initial_capital:,.0f}")
    print(f"  Slippage:   {result.config.slippage_bps} bps")
    print(f"  Symbols:    {result.total_bars} bars processed")
    print()

    print("  PERFORMANCE")
    print("  " + "-" * 40)
    print(f"  Total Return:   {metrics.total_return_pct:+.2f}%")
    print(f"  CAGR:           {metrics.cagr_pct:+.2f}%")
    print(f"  Final Equity:   ${metrics.final_equity:,.2f}")
    print(f"  Total P&L:      ${metrics.total_pnl:+,.2f}")
    print()

    print("  RISK-ADJUSTED")
    print("  " + "-" * 40)
    print(f"  Sharpe Ratio:   {metrics.sharpe_ratio:.3f}")
    print(f"  Sortino Ratio:  {metrics.sortino_ratio:.3f}")
    print(f"  Max Drawdown:   {metrics.max_drawdown_pct:.2f}%")
    print(f"  Volatility:     {metrics.annualized_volatility_pct:.2f}%")
    print()

    print("  TRADES")
    print("  " + "-" * 40)
    print(f"  Total:          {metrics.total_trades}")
    print(f"  Win / Loss:     {metrics.winning_trades} / {metrics.losing_trades}")
    print(f"  Win Rate:       {metrics.win_rate_pct:.1f}%")
    print(f"  Profit Factor:  {metrics.profit_factor:.2f}")
    print(f"  Avg Win:        {metrics.avg_win_pct:+.2f}%")
    print(f"  Avg Loss:       {metrics.avg_loss_pct:+.2f}%")
    print(f"  Avg Hold:       {metrics.avg_hold_days:.1f} days")
    print(f"  Best Trade:     {metrics.best_trade_pct:+.2f}%")
    print(f"  Worst Trade:    {metrics.worst_trade_pct:+.2f}%")
    print(f"  Win Streak:     {metrics.max_win_streak}")
    print(f"  Loss Streak:    {metrics.max_loss_streak}")
    print()

    print("  CLOSE REASONS")
    print("  " + "-" * 40)
    print(f"  Stop Loss:      {metrics.stop_loss_count}")
    print(f"  Take Profit:    {metrics.take_profit_count}")
    print(f"  Signal Exit:    {metrics.signal_exit_count}")
    print(f"  Slope Exit:     {metrics.slope_exit_count}")
    print(f"  Adverse Slope:  {metrics.adverse_slope_exit_count}")
    print(f"  NB Exit:        {metrics.nb_exit_count}")
    print(f"  VWAP Exit:      {metrics.vwap_exit_count}")
    print(f"  EOD Close:      {metrics.eod_close_count}")
    print(f"  End of BT:      {metrics.end_of_backtest_count}")
    print(f"  Kill Switch:    {metrics.kill_switch_exit_count}")
    print()

    print("  EXPOSURE")
    print("  " + "-" * 40)
    print(f"  Time Invested:  {metrics.exposure_pct:.1f}%")
    print(f"  Avg Positions:  {metrics.avg_positions:.1f}")
    print()

    if result.kill_switch_triggered:
        print(f"  ⚠️  KILL SWITCH triggered on {result.kill_switch_date}")
        print()

    print("  GO / NO-GO CHECK")
    print("  " + "-" * 40)
    for name, check in go["checks"].items():
        status = "✅" if check["pass"] else "❌"
        print(f"  {status} {name}: {check['actual']} (required: {check['required']})")
    print()
    print(f"  VERDICT: {go['verdict']}")
    print("=" * 70 + "\n")


def _persist_to_sqlite(result, metrics) -> None:
    """Persist backtest run and trades to local SQLite database.

    This runs silently — errors are logged but never interrupt the report flow.
    """
    try:
        from ..utils.db_local import LocalDB

        local_db = LocalDB()

        # Build config dict from BacktestConfig
        config_dict = {
            "start": str(result.config.start),
            "end": str(result.config.end),
            "initial_capital": result.config.initial_capital,
            "slippage_bps": result.config.slippage_bps,
            "max_positions": result.config.max_positions,
            "max_position_pct": result.config.max_position_pct,
            "strategy": getattr(result.config, "strategy", "trend_following"),
            "timeframe": getattr(result.config, "timeframe", "1Day"),
            "stop_loss_atr": getattr(result.config, "stop_loss_atr", 2.0),
            "take_profit_atr": getattr(result.config, "take_profit_atr", 6.0),
            "signal_threshold": getattr(result.config, "signal_threshold", 0.3),
            "trend_filter": getattr(result.config, "trend_filter", True),
        }

        # Build metrics dict
        metrics_dict = {
            "total_return_pct": metrics.total_return_pct,
            "cagr_pct": metrics.cagr_pct,
            "sharpe_ratio": metrics.sharpe_ratio,
            "sortino_ratio": metrics.sortino_ratio,
            "max_drawdown_pct": metrics.max_drawdown_pct,
            "annualized_volatility_pct": metrics.annualized_volatility_pct,
            "total_trades": metrics.total_trades,
            "win_rate_pct": metrics.win_rate_pct,
            "profit_factor": metrics.profit_factor,
            "avg_win_pct": metrics.avg_win_pct,
            "avg_loss_pct": metrics.avg_loss_pct,
            "avg_hold_days": metrics.avg_hold_days,
        }

        go_nogo = metrics.go_nogo

        # Insert run
        run_id = local_db.insert_backtest_run(config_dict, metrics_dict, go_nogo)

        # Insert trades
        trades_dicts = [t.model_dump() for t in result.trades]
        local_db.insert_backtest_trades(run_id, trades_dicts)

        logger.info("backtest_persisted_to_sqlite", run_id=run_id, trades=len(trades_dicts))
    except Exception as e:
        logger.warning("sqlite_persist_failed", error=str(e))
