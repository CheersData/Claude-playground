"""
Backtest Metrics — Calculate performance statistics from backtest results.

Sharpe, Sortino, CAGR, max drawdown, win rate, profit factor, etc.
Includes go/no-go check against runbook criteria.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

import numpy as np
import structlog

logger = structlog.get_logger()

TRADING_DAYS_PER_YEAR = 252
RISK_FREE_RATE = 0.04  # ~4% risk-free (T-bills 2024-2026)


@dataclass
class PerformanceMetrics:
    """Complete performance metrics from a backtest."""

    # Returns
    total_return_pct: float
    cagr_pct: float
    annualized_volatility_pct: float

    # Risk-adjusted
    sharpe_ratio: float
    sortino_ratio: float

    # Drawdown
    max_drawdown_pct: float
    max_drawdown_duration_days: int
    avg_drawdown_pct: float

    # Trade statistics
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate_pct: float
    profit_factor: float
    avg_win_pct: float
    avg_loss_pct: float
    avg_hold_days: float
    best_trade_pct: float
    worst_trade_pct: float

    # Streaks
    max_win_streak: int
    max_loss_streak: int

    # Other
    exposure_pct: float  # % of time invested
    avg_positions: float
    final_equity: float
    total_pnl: float

    # Close reasons
    stop_loss_count: int
    take_profit_count: int
    signal_exit_count: int

    # Go/no-go
    go_nogo: dict


def calculate_metrics(result) -> PerformanceMetrics:
    """
    Calculate comprehensive performance metrics from a BacktestResult.

    Args:
        result: BacktestResult from engine.

    Returns:
        PerformanceMetrics with all statistics.
    """
    trades = result.trades
    equity_curve = result.equity_curve
    daily_returns = result.daily_returns
    initial_capital = result.config.initial_capital

    # --- Basic returns ---
    final_equity = equity_curve[-1]["equity"] if equity_curve else initial_capital
    total_pnl = final_equity - initial_capital
    total_return_pct = ((final_equity / initial_capital) - 1) * 100

    # Trading period in years
    if equity_curve and len(equity_curve) > 1:
        try:
            start_d = date.fromisoformat(equity_curve[0]["date"])
            end_d = date.fromisoformat(equity_curve[-1]["date"])
            years = max((end_d - start_d).days / 365.25, 0.01)
        except (ValueError, TypeError):
            years = len(equity_curve) / TRADING_DAYS_PER_YEAR
    else:
        years = 1.0

    # CAGR
    if final_equity > 0 and initial_capital > 0:
        cagr_pct = ((final_equity / initial_capital) ** (1 / years) - 1) * 100
    else:
        cagr_pct = 0.0

    # --- Volatility & risk-adjusted metrics ---
    returns_arr = np.array(daily_returns) if daily_returns else np.array([0.0])

    annualized_vol = float(np.std(returns_arr, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR) * 100) if len(returns_arr) > 1 else 0.0

    # Sharpe ratio (annualized)
    if annualized_vol > 0:
        excess_return = cagr_pct - (RISK_FREE_RATE * 100)
        sharpe_ratio = excess_return / annualized_vol
    else:
        sharpe_ratio = 0.0

    # Sortino ratio (uses downside deviation only)
    negative_returns = returns_arr[returns_arr < 0]
    if len(negative_returns) > 0:
        downside_dev = float(np.std(negative_returns, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR) * 100)
        if downside_dev > 0:
            sortino_ratio = (cagr_pct - (RISK_FREE_RATE * 100)) / downside_dev
        else:
            sortino_ratio = 0.0
    else:
        sortino_ratio = sharpe_ratio  # No losing days

    # --- Drawdown ---
    max_dd_pct = 0.0
    max_dd_duration = 0
    dd_durations = []
    current_dd_start = None

    if equity_curve:
        peak = equity_curve[0]["equity"]
        for point in equity_curve:
            eq = point["equity"]
            if eq > peak:
                peak = eq
                if current_dd_start is not None:
                    try:
                        dd_start = date.fromisoformat(current_dd_start)
                        dd_end = date.fromisoformat(point["date"])
                        dd_durations.append((dd_end - dd_start).days)
                    except (ValueError, TypeError):
                        pass
                    current_dd_start = None
            dd_pct = ((eq - peak) / peak) * 100 if peak > 0 else 0.0
            if dd_pct < max_dd_pct:
                max_dd_pct = dd_pct
            if dd_pct < 0 and current_dd_start is None:
                current_dd_start = point["date"]

        max_dd_duration = max(dd_durations) if dd_durations else 0

    avg_dd_pct = float(np.mean([e["drawdown_pct"] for e in equity_curve if e["drawdown_pct"] < 0])) if any(e["drawdown_pct"] < 0 for e in equity_curve) else 0.0

    # --- Trade statistics ---
    total_trades = len(trades)
    winning = [t for t in trades if t.pnl > 0]
    losing = [t for t in trades if t.pnl <= 0]
    winning_trades = len(winning)
    losing_trades = len(losing)

    win_rate_pct = (winning_trades / total_trades * 100) if total_trades > 0 else 0.0

    # Profit factor
    gross_profit = sum(t.pnl for t in winning) if winning else 0.0
    gross_loss = abs(sum(t.pnl for t in losing)) if losing else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (float("inf") if gross_profit > 0 else 0.0)

    avg_win_pct = float(np.mean([t.pnl_pct for t in winning])) if winning else 0.0
    avg_loss_pct = float(np.mean([t.pnl_pct for t in losing])) if losing else 0.0
    avg_hold = float(np.mean([t.hold_days for t in trades])) if trades else 0.0
    best_trade_pct = max((t.pnl_pct for t in trades), default=0.0)
    worst_trade_pct = min((t.pnl_pct for t in trades), default=0.0)

    # --- Streaks ---
    max_win_streak, max_loss_streak = _calculate_streaks(trades)

    # --- Exposure ---
    if equity_curve:
        invested_days = sum(1 for e in equity_curve if e["positions_count"] > 0)
        exposure_pct = (invested_days / len(equity_curve)) * 100
        avg_positions = float(np.mean([e["positions_count"] for e in equity_curve]))
    else:
        exposure_pct = 0.0
        avg_positions = 0.0

    # --- Close reasons ---
    stop_loss_count = sum(1 for t in trades if t.close_reason == "stop_loss")
    take_profit_count = sum(1 for t in trades if t.close_reason == "take_profit")
    signal_exit_count = sum(1 for t in trades if t.close_reason == "signal_exit")

    # --- Go/No-Go check ---
    go_nogo = _check_go_nogo(
        sharpe=sharpe_ratio,
        max_dd=abs(max_dd_pct),
        win_rate=win_rate_pct,
        profit_factor=profit_factor,
        total_trades=total_trades,
    )

    metrics = PerformanceMetrics(
        total_return_pct=round(total_return_pct, 2),
        cagr_pct=round(cagr_pct, 2),
        annualized_volatility_pct=round(annualized_vol, 2),
        sharpe_ratio=round(sharpe_ratio, 3),
        sortino_ratio=round(sortino_ratio, 3),
        max_drawdown_pct=round(max_dd_pct, 2),
        max_drawdown_duration_days=max_dd_duration,
        avg_drawdown_pct=round(avg_dd_pct, 2),
        total_trades=total_trades,
        winning_trades=winning_trades,
        losing_trades=losing_trades,
        win_rate_pct=round(win_rate_pct, 1),
        profit_factor=round(profit_factor, 2) if profit_factor != float("inf") else 999.99,
        avg_win_pct=round(avg_win_pct, 2),
        avg_loss_pct=round(avg_loss_pct, 2),
        avg_hold_days=round(avg_hold, 1),
        best_trade_pct=round(best_trade_pct, 2),
        worst_trade_pct=round(worst_trade_pct, 2),
        max_win_streak=max_win_streak,
        max_loss_streak=max_loss_streak,
        exposure_pct=round(exposure_pct, 1),
        avg_positions=round(avg_positions, 1),
        final_equity=round(final_equity, 2),
        total_pnl=round(total_pnl, 2),
        stop_loss_count=stop_loss_count,
        take_profit_count=take_profit_count,
        signal_exit_count=signal_exit_count,
        go_nogo=go_nogo,
    )

    logger.info(
        "metrics_calculated",
        sharpe=metrics.sharpe_ratio,
        max_dd=metrics.max_drawdown_pct,
        win_rate=metrics.win_rate_pct,
        profit_factor=metrics.profit_factor,
        trades=metrics.total_trades,
        go=go_nogo["pass"],
    )

    return metrics


def _calculate_streaks(trades: list) -> tuple[int, int]:
    """Calculate max consecutive win/loss streaks."""
    if not trades:
        return 0, 0

    max_win = 0
    max_loss = 0
    current_win = 0
    current_loss = 0

    for t in trades:
        if t.pnl > 0:
            current_win += 1
            current_loss = 0
            max_win = max(max_win, current_win)
        else:
            current_loss += 1
            current_win = 0
            max_loss = max(max_loss, current_loss)

    return max_win, max_loss


def _check_go_nogo(
    sharpe: float,
    max_dd: float,
    win_rate: float,
    profit_factor: float,
    total_trades: int,
) -> dict:
    """
    Check backtest results against runbook go/no-go criteria.

    Criteria from company/trading/runbooks/backtest.md:
    - Sharpe > 1.0
    - Max drawdown < 15%
    - Win rate > 50%
    - Profit factor > 1.5
    - Total trades > 100
    """
    checks = {
        "sharpe": {"required": "> 1.0", "actual": sharpe, "pass": sharpe > 1.0},
        "max_drawdown": {"required": "< 15%", "actual": max_dd, "pass": max_dd < 15.0},
        "win_rate": {"required": "> 50%", "actual": win_rate, "pass": win_rate > 50.0},
        "profit_factor": {"required": "> 1.5", "actual": profit_factor, "pass": profit_factor > 1.5},
        "total_trades": {"required": "> 100", "actual": total_trades, "pass": total_trades > 100},
    }

    all_pass = all(c["pass"] for c in checks.values())

    return {
        "pass": all_pass,
        "checks": checks,
        "verdict": "GO ✅ — Ready for paper trading" if all_pass else "NO-GO ❌ — Does not meet criteria",
    }
