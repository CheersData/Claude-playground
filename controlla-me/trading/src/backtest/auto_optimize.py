"""
Auto-Optimizer — Iterative backtest optimization loop.

Primary: Trading Strategist via `claude -p` (uses your Claude subscription).
Fallback: Rule-based strategist (no LLM needed).

Communication:
    - Telegram: notifica dopo ogni iterazione + report finale
    - Task Board: crea task all'avvio, aggiorna progressi, chiude con risultati
    - claude -p: consulta strategist LLM per prossimo esperimento

Usage (from terminal, NOT inside Claude Code):
    cd trading
    python -m src.backtest.auto_optimize --start 2023-01-01 --end 2024-12-31
    python -m src.backtest.auto_optimize --start 2023-01-01 --end 2024-12-31 --max-iter 15
    python -m src.backtest.auto_optimize --resume backtest-results/optimize_20260305_123456
    python -m src.backtest.auto_optimize --start 2023-01-01 --end 2024-12-31 --rules-only

Flow:
    1. Run backtest with current params
    2. Read report.json → check GO/NO-GO
    3. If GO → notify Telegram + close task board → done
    4. If NO-GO → notify Telegram → call strategist (LLM or rule-based) with full history
    5. Strategist proposes new params/strategy
    6. Repeat from step 1 until GO or max iterations
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import structlog

# Telegram integration (silently skips if not configured)
try:
    from src.utils.telegram import send as telegram_send
except ImportError:
    # Running from different working dir or telegram not available
    telegram_send = None  # type: ignore[assignment]

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

# ---------------------------------------------------------------------------
# Go/No-Go criteria (same as backtest report.py)
# ---------------------------------------------------------------------------
GO_CRITERIA = {
    "sharpe_ratio": {"op": ">", "threshold": 1.0},
    "max_drawdown_pct": {"op": "<", "threshold": 15.0},
    "win_rate_pct": {"op": ">", "threshold": 50.0},
    "profit_factor": {"op": ">", "threshold": 1.5},
    "total_trades": {"op": ">", "threshold": 100},
}

# ---------------------------------------------------------------------------
# Available exploration space
# ---------------------------------------------------------------------------
STRATEGY_PRESETS: list[dict[str, Any]] = [
    # 1. Daily composite — best historical (Sharpe 0.975)
    {
        "name": "daily_composite_tight",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": None,  # full default
        "params": {"sl_atr": 1.5, "tp_atr": 6.0, "threshold": 0.3},
    },
    {
        "name": "daily_composite_wide",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": None,
        "params": {"sl_atr": 2.0, "tp_atr": 10.0, "threshold": 0.25},
    },
    {
        "name": "daily_composite_aggressive",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": None,
        "params": {
            "sl_atr": 1.5, "tp_atr": 8.0, "threshold": 0.2,
            "trail_breakeven": 1.0, "trail_lock": 1.5,
            "trail_threshold": 2.5, "trail_distance": 1.5,
        },
    },
    {
        "name": "daily_no_trend_filter",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": None,
        "params": {"sl_atr": 2.0, "tp_atr": 8.0, "threshold": 0.3, "no_trend_filter": True},
    },
    # 2. Mean reversion v3 on 15Min
    {
        "name": "mr_v3_default",
        "strategy": "mean_reversion_v3",
        "timeframe": "15Min",
        "universe": "XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY",
        "params": {"sl_atr": 1.5, "tp_atr": 3.0},
    },
    {
        "name": "mr_v3_no_daily",
        "strategy": "mean_reversion_v3",
        "timeframe": "15Min",
        "universe": "XLF,XLK,XLE,XLV,XLI,XLU,XLY,XLP,XLRE,XLB,XLC,SPY",
        "params": {"sl_atr": 1.5, "tp_atr": 3.0, "no_daily_filter": True},
    },
    # 3. Noise boundary with longer hold
    {
        "name": "nb_hold24_lookback90",
        "strategy": "noise_boundary",
        "timeframe": "5Min",
        "universe": "SPY",
        "params": {"nb_lookback_days": 90, "nb_min_hold_bars": 24},
    },
    {
        "name": "nb_etf_basket",
        "strategy": "noise_boundary",
        "timeframe": "5Min",
        "universe": "SPY,QQQ,IWM",
        "params": {"nb_lookback_days": 90, "nb_vwap_trailing": True, "nb_min_hold_bars": 12},
    },
    # 4. Daily with different universes
    {
        "name": "daily_etf_only",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": "SPY,QQQ,IWM,XLF,XLK,XLE,XLV,XLI",
        "params": {"sl_atr": 2.0, "tp_atr": 8.0, "threshold": 0.3, "max_positions": 5},
    },
    {
        "name": "daily_mega_cap",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": "AAPL,MSFT,AMZN,GOOGL,META,NVDA,TSLA",
        "params": {"sl_atr": 2.0, "tp_atr": 8.0, "threshold": 0.3, "max_positions": 5},
    },
    # 5. Daily tighter trailing for locking profits
    {
        "name": "daily_tight_trail",
        "strategy": "trend_following",
        "timeframe": "1Day",
        "universe": None,
        "params": {
            "sl_atr": 1.5, "tp_atr": 6.0, "threshold": 0.3,
            "trail_breakeven": 0.8, "trail_lock": 1.2,
            "trail_lock_cushion": 0.3, "trail_threshold": 2.0,
            "trail_distance": 1.0, "trail_tight_threshold": 3.0,
            "trail_tight_distance": 0.7,
        },
    },
    # 6. Hourly composite
    {
        "name": "hourly_composite",
        "strategy": "trend_following",
        "timeframe": "1Hour",
        "universe": "SPY,QQQ,AAPL,MSFT,NVDA,AMZN,GOOGL,META",
        "params": {"sl_atr": 2.0, "tp_atr": 6.0, "threshold": 0.3},
    },
]

# Param name → CLI flag mapping
PARAM_TO_CLI = {
    "sl_atr": "--sl-atr",
    "tp_atr": "--tp-atr",
    "threshold": "--threshold",
    "max_positions": "--max-positions",
    "max_position_pct": "--max-position-pct",
    "no_trend_filter": "--no-trend-filter",
    "no_daily_filter": "--no-daily-filter",
    "daily_sma_period": "--daily-sma-period",
    "trail_breakeven": "--trail-breakeven",
    "trail_lock": "--trail-lock",
    "trail_lock_cushion": "--trail-lock-cushion",
    "trail_threshold": "--trail-threshold",
    "trail_distance": "--trail-distance",
    "trail_tight_threshold": "--trail-tight-threshold",
    "trail_tight_distance": "--trail-tight-distance",
    "nb_band_mult": "--nb-band-mult",
    "nb_lookback_days": "--nb-lookback-days",
    "nb_trade_freq": "--nb-trade-freq",
    "nb_safety_sl_atr": "--nb-safety-sl-atr",
    "nb_vol_sizing": "--nb-vol-sizing",
    "nb_vol_target": "--nb-vol-target",
    "nb_vol_max_leverage": "--nb-vol-max-leverage",
    "nb_vix_filter": "--nb-vix-filter",
    "nb_vix_threshold": "--nb-vix-threshold",
    "nb_vwap_exit": "--nb-vwap-exit",
    "nb_vwap_trailing": "--nb-vwap-trailing",
    "nb_min_hold_bars": "--nb-min-hold-bars",
    "slope_lookback": "--slope-lookback",
    "slope_threshold": "--slope-threshold",
    "persistence_bars": "--persistence-bars",
    "contrarian": "--contrarian",
    "anticipatory": "--anticipatory",
}

BOOL_PARAMS = {
    "no_trend_filter", "no_daily_filter", "nb_vol_sizing", "nb_vix_filter",
    "nb_vwap_exit", "nb_vwap_trailing", "contrarian", "anticipatory",
}

# Project root (controlla-me/) — needed for task board CLI
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent  # trading/src/backtest/ → controlla-me/


# ---------------------------------------------------------------------------
# Task Board integration (via company-tasks.ts CLI)
# ---------------------------------------------------------------------------

def _run_task_cli(*args: str) -> str | None:
    """Run company-tasks.ts CLI command, return stdout or None on failure."""
    cmd = ["npx", "tsx", "scripts/company-tasks.ts", *args]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(PROJECT_ROOT),
        )
        if result.returncode != 0:
            logger.warning("task_cli_failed", args=args[:2], stderr=result.stderr[:200])
            return None
        return result.stdout.strip()
    except FileNotFoundError:
        logger.debug("npx_not_found", msg="task board integration disabled")
        return None
    except subprocess.TimeoutExpired:
        logger.warning("task_cli_timeout", args=args[:2])
        return None
    except Exception as e:
        logger.debug("task_cli_error", error=str(e))
        return None


def _extract_task_id(cli_output: str) -> str | None:
    """Extract task ID from company-tasks.ts create output."""
    if not cli_output:
        return None
    # Look for UUID pattern or #N pattern
    uuid_match = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", cli_output)
    if uuid_match:
        return uuid_match.group(1)
    seq_match = re.search(r"#(\d+)", cli_output)
    if seq_match:
        return f"#{seq_match.group(1)}"
    return None


# ---------------------------------------------------------------------------
# Telegram helpers
# ---------------------------------------------------------------------------

def _send_telegram(text: str) -> bool:
    """Send message via Telegram (silently skips if not configured)."""
    if telegram_send is None:
        return False
    try:
        return telegram_send(text)
    except Exception as e:
        logger.debug("telegram_send_failed", error=str(e))
        return False


def _format_iteration_msg(
    iteration: int,
    max_iter: int,
    experiment: dict,
    report: dict | None,
    best_sharpe: float,
    best_iter: int,
) -> str:
    """Format Telegram message for a single iteration result."""
    name = experiment.get("name", "?")
    strategy = experiment.get("strategy", "?")
    tf = experiment.get("timeframe", "?")

    if report is None:
        return (
            f"🔄 <b>Auto-Optimizer [{iteration}/{max_iter}]</b>\n\n"
            f"📋 {name}\n"
            f"❌ Backtest failed — skipping"
        )

    p = report.get("performance", {})
    t = report.get("trades", {})
    g = report.get("go_nogo", {})
    verdict = g.get("verdict", "?")
    is_go = g.get("pass", False)

    emoji = "✅" if is_go else "❌"
    ret = p.get("total_return_pct", 0)
    sharpe = p.get("sharpe_ratio", 0)
    wr = t.get("win_rate_pct", 0)
    pf = t.get("profit_factor", 0)
    trades = t.get("total", 0)
    dd = p.get("max_drawdown_pct", 0)

    msg = (
        f"🔄 <b>Auto-Optimizer [{iteration}/{max_iter}]</b>\n\n"
        f"📋 <b>{name}</b> ({strategy}, {tf})\n"
        f"{emoji} <b>{verdict}</b>\n\n"
        f"📈 Return: {ret:+.2f}%\n"
        f"📊 Sharpe: {sharpe:.3f}\n"
        f"🎯 Win Rate: {wr:.1f}%  |  PF: {pf:.2f}\n"
        f"📉 Max DD: {dd:.2f}%  |  Trades: {trades}\n\n"
        f"🏆 Best so far: Sharpe {best_sharpe:.3f} (iter #{best_iter})"
    )
    return msg


def _format_final_msg(
    outcome: str,
    total_iters: int,
    best_sharpe: float,
    best_iter: int,
    history: list[dict],
    period: str,
) -> str:
    """Format Telegram message for final optimization report."""
    is_go = outcome == "GO"
    emoji = "🎉" if is_go else "⚠️"

    msg = f"{emoji} <b>Auto-Optimizer — {outcome}</b>\n\n"
    msg += f"📅 Periodo: {period}\n"
    msg += f"🔄 Iterazioni: {total_iters}\n"
    msg += f"🏆 Best Sharpe: {best_sharpe:.3f} (iter #{best_iter})\n\n"

    if is_go and best_iter > 0 and best_iter <= len(history):
        best = history[best_iter - 1]
        bc = best.get("config_used", {})
        bp = best.get("performance", {})
        bt = best.get("trades", {})
        msg += (
            f"<b>Configurazione GO:</b>\n"
            f"  Strategy: {bc.get('strategy', '?')}\n"
            f"  TF: {bc.get('timeframe', '?')}\n"
            f"  Return: {bp.get('total_return_pct', 0):+.2f}%\n"
            f"  WR: {bt.get('win_rate_pct', 0):.1f}% | PF: {bt.get('profit_factor', 0):.2f}\n"
            f"  Params: {json.dumps(bc.get('params', {}))}\n\n"
            f"➡️ Pronto per paper trading."
        )
    else:
        msg += "Nessuna configurazione ha raggiunto i criteri GO.\n"
        # Show top 3 by sharpe
        sorted_h = sorted(
            [h for h in history if not h.get("error")],
            key=lambda h: h.get("performance", {}).get("sharpe_ratio", -999),
            reverse=True,
        )[:3]
        if sorted_h:
            msg += "\n<b>Top 3:</b>\n"
            for rank, h in enumerate(sorted_h, 1):
                c = h.get("config_used", {})
                p = h.get("performance", {})
                msg += (
                    f"  {rank}. {c.get('name', '?')} — "
                    f"Sharpe {p.get('sharpe_ratio', 0):.3f}, "
                    f"Ret {p.get('total_return_pct', 0):+.2f}%\n"
                )

    return msg


# ---------------------------------------------------------------------------
# Strategist prompt (for claude -p)
# ---------------------------------------------------------------------------

STRATEGIST_PROMPT = """You are a quantitative trading strategist. Analyze backtest results and propose the SINGLE best next experiment.

## Go/No-Go Criteria (ALL must pass)
- Sharpe ratio > 1.0
- Max drawdown < 15%
- Win rate > 50%
- Profit factor > 1.5
- Total trades > 100

## Available Strategies
1. trend_following (1Day, 1Hour) — Composite: RSI+MACD+BB+Trend+Volume. Best historical: Sharpe 0.975, +23.4% over 2y.
2. mean_reversion_v3 (15Min) — Bollinger Bands mean reversion on sector ETFs with daily trend filter.
3. noise_boundary (5Min) — Zarattini-Aziz-Barbon 2024. All intraday variants tested negative so far.
4. slope_volume (5Min) — OLS linear regression slope + volume. All variants tested negative.

## Key Tunable Parameters
- strategy: trend_following | mean_reversion_v3 | noise_boundary | slope_volume
- timeframe: 1Day | 1Hour | 15Min | 5Min
- universe: comma-separated symbols (default: ~40 S&P500 + ETFs)
- sl_atr: stop loss ATR multiplier (range: 0.5-5.0, default: 2.0)
- tp_atr: take profit ATR multiplier (range: 2.0-15.0, default: 10.0)
- threshold: signal score threshold (range: 0.1-0.6, default: 0.3)
- max_positions: max simultaneous positions (range: 3-15, default: 10)
- no_trend_filter: disable SMA trend filter (bool)
- trail_breakeven/lock/threshold/distance: trailing stop tiers (floats)
- NB params: nb_lookback_days, nb_vwap_trailing, nb_min_hold_bars, etc.

## Iteration History
{history}

## Current Results (Iteration {iteration})
{current_report}

## Rules
1. Focus on the SINGLE biggest failure point
2. Propose ONE focused change — don't change everything
3. NEVER repeat an experiment already in history
4. The daily composite strategy (trend_following, 1Day) is closest to GO — prioritize variants of it
5. If all ideas are exhausted, set stop_reason to "exhausted"

IMPORTANT: Respond ONLY with JSON. No markdown, no backticks, no text outside JSON.
Start with {{ and end with }}.

{{
  "analysis": "What is the key problem and why",
  "proposal": "What specific change to make",
  "strategy": "strategy_name",
  "timeframe": "1Day",
  "universe": "SYM1,SYM2,..." or null for default,
  "params": {{
    "sl_atr": 2.0,
    "tp_atr": 6.0
  }},
  "confidence": "low|medium|high",
  "stop_reason": null
}}"""


def build_history_text(history: list[dict]) -> str:
    """Build a text summary of all past iterations for the strategist."""
    if not history:
        return "(no previous iterations)"

    lines = [
        f"{'#':>3} | {'Strategy':<20} | {'TF':<5} | {'Return':>8} | {'Sharpe':>8} | "
        f"{'WR%':>6} | {'PF':>5} | {'Trades':>6} | {'MaxDD':>7} | Name"
    ]
    lines.append("-" * 120)

    for i, h in enumerate(history, 1):
        p = h.get("performance", {})
        t = h.get("trades", {})
        c = h.get("config_used", {})
        lines.append(
            f"{i:3d} | {c.get('strategy', '?'):<20} | {c.get('timeframe', '?'):<5} | "
            f"{p.get('total_return_pct', 0):7.2f}% | {p.get('sharpe_ratio', 0):8.3f} | "
            f"{t.get('win_rate_pct', 0):5.1f}% | {t.get('profit_factor', 0):5.2f} | "
            f"{t.get('total', 0):6d} | {p.get('max_drawdown_pct', 0):6.2f}% | "
            f"{c.get('name', '?')}"
        )
    return "\n".join(lines)


def build_current_report_text(report: dict) -> str:
    """Build concise text of current iteration report."""
    p = report.get("performance", {})
    t = report.get("trades", {})
    cr = report.get("close_reasons", {})
    g = report.get("go_nogo", {})

    lines = [
        f"Return: {p.get('total_return_pct', 0):.2f}%",
        f"Sharpe: {p.get('sharpe_ratio', 0):.3f}",
        f"Win Rate: {t.get('win_rate_pct', 0):.1f}%",
        f"Profit Factor: {t.get('profit_factor', 0):.2f}",
        f"Total Trades: {t.get('total', 0)}",
        f"Max Drawdown: {p.get('max_drawdown_pct', 0):.2f}%",
        f"CAGR: {p.get('cagr_pct', 0):.2f}%",
        f"Avg Win: {t.get('avg_win_pct', 0):.2f}%, Avg Loss: {t.get('avg_loss_pct', 0):.2f}%",
        f"Best: {t.get('best_trade_pct', 0):.2f}%, Worst: {t.get('worst_trade_pct', 0):.2f}%",
        f"Close Reasons: {json.dumps(cr)}",
        f"Verdict: {g.get('verdict', '?')}",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Core: AutoOptimizer
# ---------------------------------------------------------------------------

class AutoOptimizer:
    """Iterative backtest optimizer with LLM + rule-based strategist.

    Communications:
        - Telegram: sends iteration updates + final report to boss
        - Task Board: creates/updates company task for CME visibility
        - claude -p: LLM strategist for next experiment proposals
    """

    def __init__(
        self,
        start: str,
        end: str,
        capital: float = 100_000,
        max_iterations: int = 10,
        output_dir: Path | None = None,
        rules_only: bool = False,
        resume_dir: Path | None = None,
    ) -> None:
        self.start = start
        self.end = end
        self.capital = capital
        self.max_iterations = max_iterations
        self.rules_only = rules_only

        # Session directory
        if resume_dir and resume_dir.exists():
            self.session_dir = resume_dir
            self.history = self._load_history()
            self.preset_index = len(self.history)
        else:
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            base = output_dir or Path("backtest-results")
            self.session_dir = base / f"optimize_{ts}"
            self.session_dir.mkdir(parents=True, exist_ok=True)
            self.history: list[dict] = []
            self.preset_index = 0

        self.log_path = self.session_dir / "optimization_log.json"
        self.best_sharpe = -999.0
        self.best_iteration = 0
        self.task_id: str | None = None  # Company task board ID

    def run(self) -> None:
        """Main optimization loop."""
        print(f"\n{'='*70}")
        print(f"  AUTO-OPTIMIZER — Iterative Backtest Optimization")
        print(f"  Period: {self.start} → {self.end} | Capital: ${self.capital:,.0f}")
        print(f"  Max iterations: {self.max_iterations}")
        print(f"  Mode: {'Rules-only' if self.rules_only else 'LLM (claude -p) + rules fallback'}")
        print(f"  Session: {self.session_dir}")
        print(f"{'='*70}\n")

        # --- Create task on company board ---
        self._create_board_task()

        # --- Notify Telegram: session start ---
        _send_telegram(
            f"🚀 <b>Auto-Optimizer avviato</b>\n\n"
            f"📅 {self.start} → {self.end}\n"
            f"💰 Capital: ${self.capital:,.0f}\n"
            f"🔄 Max iter: {self.max_iterations}\n"
            f"⚙️ Mode: {'Rules-only' if self.rules_only else 'LLM + rules'}\n"
            f"📂 {self.session_dir.name}"
        )

        for i in range(len(self.history), self.max_iterations):
            iteration = i + 1
            print(f"\n{'─'*60}")
            print(f"  ITERATION {iteration}/{self.max_iterations}")
            print(f"{'─'*60}")

            # Get experiment config
            if iteration == 1 and not self.history:
                # First iteration: use first preset
                experiment = self._get_next_preset()
            else:
                experiment = self._get_next_experiment(iteration)

            if experiment is None:
                print("\n⛔ Strategist exhausted all options. Stopping.")
                _send_telegram(
                    f"⛔ <b>Auto-Optimizer — EXHAUSTED</b>\n\n"
                    f"Lo strategist ha esaurito tutte le opzioni dopo {iteration - 1} iterazioni.\n"
                    f"🏆 Best Sharpe: {self.best_sharpe:.3f} (iter #{self.best_iteration})"
                )
                break

            print(f"  Experiment: {experiment.get('name', '?')}")
            print(f"  Strategy: {experiment['strategy']} | TF: {experiment['timeframe']}")
            print(f"  Params: {experiment.get('params', {})}")

            # Run backtest
            iter_dir = self.session_dir / f"iteration_{iteration:02d}"
            report = self._run_backtest(experiment, iter_dir)

            if report is None:
                print("  ❌ Backtest failed — skipping iteration")
                self.history.append({
                    "config_used": experiment,
                    "performance": {},
                    "trades": {},
                    "close_reasons": {},
                    "go_nogo": {"verdict": "FAILED"},
                    "error": True,
                })
                self._save_log()
                # Notify Telegram: failed iteration
                _send_telegram(_format_iteration_msg(
                    iteration, self.max_iterations, experiment, None,
                    self.best_sharpe, self.best_iteration,
                ))
                continue

            # Track best
            sharpe = report.get("performance", {}).get("sharpe_ratio", -999)
            if sharpe > self.best_sharpe:
                self.best_sharpe = sharpe
                self.best_iteration = iteration

            # Record history
            record = {
                "config_used": experiment,
                "performance": report.get("performance", {}),
                "trades": report.get("trades", {}),
                "close_reasons": report.get("close_reasons", {}),
                "go_nogo": report.get("go_nogo", {}),
            }
            self.history.append(record)
            self._save_log()

            # Print summary
            p = report.get("performance", {})
            t = report.get("trades", {})
            g = report.get("go_nogo", {})
            print(f"\n  Results:")
            print(f"    Return: {p.get('total_return_pct', 0):.2f}%  |  Sharpe: {p.get('sharpe_ratio', 0):.3f}")
            print(f"    Win Rate: {t.get('win_rate_pct', 0):.1f}%  |  PF: {t.get('profit_factor', 0):.2f}")
            print(f"    Trades: {t.get('total', 0)}  |  Max DD: {p.get('max_drawdown_pct', 0):.2f}%")
            print(f"    Verdict: {g.get('verdict', '?')}")

            # --- Notify Telegram: iteration result ---
            _send_telegram(_format_iteration_msg(
                iteration, self.max_iterations, experiment, report,
                self.best_sharpe, self.best_iteration,
            ))

            # Check GO
            if g.get("pass", False):
                print(f"\n🎉 GO! Strategy passes all criteria at iteration {iteration}!")
                self._save_final_report("GO", iteration)
                return

        # Max iterations reached
        self._save_final_report("MAX_ITERATIONS", self.max_iterations)
        print(f"\n⚠️  Max iterations ({self.max_iterations}) reached without GO.")
        print(f"    Best Sharpe: {self.best_sharpe:.3f} at iteration {self.best_iteration}")

    # ------------------------------------------------------------------
    # Company integration: Task Board + Telegram
    # ------------------------------------------------------------------

    def _create_board_task(self) -> None:
        """Create a task on the company board for CME visibility."""
        title = f"Auto-Optimize {self.start}→{self.end} (max {self.max_iterations} iter)"
        desc = (
            f"Ciclo di ottimizzazione automatica backtest. "
            f"Periodo: {self.start} → {self.end}. "
            f"Capital: ${self.capital:,.0f}. "
            f"Mode: {'rules-only' if self.rules_only else 'LLM + rules'}. "
            f"Session: {self.session_dir.name}. "
            f"Lo script testa varianti di strategia in loop fino a GO (Sharpe>1.0, WR>50%, PF>1.5) "
            f"o max {self.max_iterations} iterazioni."
        )
        output = _run_task_cli(
            "create",
            "--title", title,
            "--dept", "trading",
            "--by", "auto-optimizer",
            "--desc", desc,
            "--routing-exempt",
            "--routing-reason", "automated backtest optimization loop",
            "--priority", "high",
            "--assign", "trading-lead",
            "--tags", "backtest,auto-optimize",
            "--benefit", f"Find GO strategy: Sharpe>1.0, WR>50%, PF>1.5",
        )
        if output:
            self.task_id = _extract_task_id(output)
            if self.task_id:
                logger.info("board_task_created", task_id=self.task_id)
            else:
                logger.debug("board_task_id_not_found", output=output[:200])
        else:
            logger.debug("board_task_not_created", msg="task board unavailable (npx/node not in PATH)")

    def _close_board_task(self, outcome: str) -> None:
        """Close the company task with final results."""
        if not self.task_id:
            return

        best_config = {}
        if self.best_iteration > 0 and self.best_iteration <= len(self.history):
            best = self.history[self.best_iteration - 1]
            best_config = best.get("config_used", {})

        result_data = json.dumps({
            "outcome": outcome,
            "iterations": len(self.history),
            "best_sharpe": round(self.best_sharpe, 3),
            "best_iteration": self.best_iteration,
            "best_strategy": best_config.get("strategy", "?"),
            "best_timeframe": best_config.get("timeframe", "?"),
            "best_params": best_config.get("params", {}),
            "session_dir": str(self.session_dir),
        })

        summary = (
            f"{outcome} dopo {len(self.history)} iter. "
            f"Best Sharpe: {self.best_sharpe:.3f} (iter #{self.best_iteration}) "
            f"— {best_config.get('name', '?')}"
        )

        benefit_status = "achieved" if outcome == "GO" else "missed"

        _run_task_cli(
            "done", self.task_id,
            "--summary", summary,
            "--data", result_data,
            "--benefit-status", benefit_status,
            "--benefit-notes", f"Best Sharpe: {self.best_sharpe:.3f}",
            "--next", "Avvia paper trading 30gg" if outcome == "GO" else "Revisione manuale strategia",
        )
        logger.info("board_task_closed", task_id=self.task_id, outcome=outcome)

    # ------------------------------------------------------------------
    # Backtest execution
    # ------------------------------------------------------------------

    def _run_backtest(self, experiment: dict, output_dir: Path) -> dict | None:
        """Run a single backtest and return the report dict."""
        cmd = [
            sys.executable, "-m", "src.backtest", "run",
            "--start", self.start,
            "--end", self.end,
            "--capital", str(self.capital),
            "--strategy", experiment["strategy"],
            "--timeframe", experiment["timeframe"],
            "--output", str(output_dir),
        ]

        # Universe
        universe = experiment.get("universe")
        if universe:
            cmd.extend(["--universe", universe])

        # Params
        params = experiment.get("params", {})
        for key, value in params.items():
            cli_flag = PARAM_TO_CLI.get(key)
            if cli_flag is None:
                logger.warning("unknown_param", key=key)
                continue

            if key in BOOL_PARAMS:
                if value:
                    cmd.append(cli_flag)
            else:
                cmd.extend([cli_flag, str(value)])

        logger.info("running_backtest", cmd=" ".join(cmd[-10:]))  # Log last 10 args

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=600,
                cwd=str(Path(__file__).resolve().parent.parent.parent),  # trading/
            )
            if result.returncode != 0:
                logger.error("backtest_failed", stderr=result.stderr[-500:] if result.stderr else "")
                return None
        except subprocess.TimeoutExpired:
            logger.error("backtest_timeout")
            return None
        except Exception as e:
            logger.error("backtest_error", error=str(e))
            return None

        # Read report
        report_path = output_dir / "report.json"
        if not report_path.exists():
            logger.error("report_not_found", path=str(report_path))
            return None

        try:
            with open(report_path) as f:
                return json.load(f)
        except Exception as e:
            logger.error("report_parse_error", error=str(e))
            return None

    # ------------------------------------------------------------------
    # Next experiment selection
    # ------------------------------------------------------------------

    def _get_next_experiment(self, iteration: int) -> dict | None:
        """Get next experiment from LLM strategist or rule-based fallback."""
        if not self.rules_only:
            try:
                result = self._consult_llm_strategist(iteration)
                if result is not None:
                    return result
                logger.info("llm_returned_none_using_rules")
            except Exception as e:
                logger.warning("llm_strategist_failed", error=str(e), msg="falling back to rules")

        return self._get_next_preset()

    def _get_next_preset(self) -> dict | None:
        """Rule-based: cycle through preset experiments."""
        # Skip presets already tried (match by name)
        tried_names = {h.get("config_used", {}).get("name") for h in self.history}

        while self.preset_index < len(STRATEGY_PRESETS):
            preset = STRATEGY_PRESETS[self.preset_index]
            self.preset_index += 1
            if preset["name"] not in tried_names:
                return preset

        # All presets exhausted — generate adaptive variants from best result
        return self._generate_adaptive_variant()

    def _generate_adaptive_variant(self) -> dict | None:
        """Generate a new variant based on the best-performing iteration so far."""
        if not self.history:
            return None

        # Find best iteration by Sharpe
        best = max(
            (h for h in self.history if not h.get("error")),
            key=lambda h: h.get("performance", {}).get("sharpe_ratio", -999),
            default=None,
        )
        if best is None:
            return None

        best_config = best.get("config_used", {})
        best_perf = best.get("performance", {})
        best_trades = best.get("trades", {})
        best_params = dict(best_config.get("params", {}))

        # Determine what to tweak based on failure analysis
        sharpe = best_perf.get("sharpe_ratio", -999)
        wr = best_trades.get("win_rate_pct", 0)
        pf = best_trades.get("profit_factor", 0)
        cr = best.get("close_reasons", {})

        tried_names = {h.get("config_used", {}).get("name") for h in self.history}
        variant_num = len(self.history) + 1

        # Strategy: improve the weakest metric
        if wr < 40:
            # Low win rate → raise threshold (pickier entries)
            new_threshold = best_params.get("threshold", 0.3) + 0.05
            if new_threshold <= 0.6:
                name = f"adaptive_higher_threshold_{variant_num}"
                if name not in tried_names:
                    params = {**best_params, "threshold": round(new_threshold, 2)}
                    return {
                        "name": name,
                        "strategy": best_config.get("strategy", "trend_following"),
                        "timeframe": best_config.get("timeframe", "1Day"),
                        "universe": best_config.get("universe"),
                        "params": params,
                    }

        if pf < 1.5:
            # Low profit factor → widen TP or tighten SL
            current_tp = best_params.get("tp_atr", 6.0)
            current_sl = best_params.get("sl_atr", 2.0)

            # Try tighter SL first
            if current_sl > 1.0:
                new_sl = round(current_sl - 0.5, 1)
                name = f"adaptive_tighter_sl_{variant_num}"
                if name not in tried_names:
                    params = {**best_params, "sl_atr": new_sl}
                    return {
                        "name": name,
                        "strategy": best_config.get("strategy", "trend_following"),
                        "timeframe": best_config.get("timeframe", "1Day"),
                        "universe": best_config.get("universe"),
                        "params": params,
                    }

            # Try wider TP
            if current_tp < 15.0:
                new_tp = round(current_tp + 2.0, 1)
                name = f"adaptive_wider_tp_{variant_num}"
                if name not in tried_names:
                    params = {**best_params, "tp_atr": new_tp}
                    return {
                        "name": name,
                        "strategy": best_config.get("strategy", "trend_following"),
                        "timeframe": best_config.get("timeframe", "1Day"),
                        "universe": best_config.get("universe"),
                        "params": params,
                    }

        # Too many stop losses → widen SL
        sl_count = cr.get("stop_loss", 0)
        total = best_trades.get("total", 1)
        if total > 0 and (sl_count / total) > 0.5:
            new_sl = best_params.get("sl_atr", 2.0) + 0.5
            name = f"adaptive_wider_sl_{variant_num}"
            if name not in tried_names:
                params = {**best_params, "sl_atr": round(new_sl, 1)}
                return {
                    "name": name,
                    "strategy": best_config.get("strategy", "trend_following"),
                    "timeframe": best_config.get("timeframe", "1Day"),
                    "universe": best_config.get("universe"),
                    "params": params,
                }

        # Try fewer positions for concentration
        current_max = best_params.get("max_positions", 10)
        if current_max > 3:
            name = f"adaptive_fewer_positions_{variant_num}"
            if name not in tried_names:
                params = {**best_params, "max_positions": max(3, current_max - 2)}
                return {
                    "name": name,
                    "strategy": best_config.get("strategy", "trend_following"),
                    "timeframe": best_config.get("timeframe", "1Day"),
                    "universe": best_config.get("universe"),
                    "params": params,
                }

        return None  # Exhausted

    # ------------------------------------------------------------------
    # LLM strategist (claude -p)
    # ------------------------------------------------------------------

    def _consult_llm_strategist(self, iteration: int) -> dict | None:
        """Call claude -p with full history and get next experiment proposal."""
        # Build prompt
        history_text = build_history_text(self.history)
        current_report = self.history[-1] if self.history else {}
        current_text = build_current_report_text(current_report) if current_report else "(first run)"

        prompt = STRATEGIST_PROMPT.format(
            history=history_text,
            iteration=iteration,
            current_report=current_text,
        )

        logger.info("calling_claude_p", prompt_len=len(prompt))
        t0 = time.time()

        try:
            result = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True, text=True, timeout=120,
            )
        except FileNotFoundError:
            raise RuntimeError("claude CLI not found in PATH")
        except subprocess.TimeoutExpired:
            raise RuntimeError("claude -p timed out after 120s")

        elapsed = time.time() - t0
        logger.info("claude_p_response", elapsed_s=round(elapsed, 1), returncode=result.returncode)

        if result.returncode != 0:
            raise RuntimeError(f"claude -p exited {result.returncode}: {result.stderr[:200]}")

        # Parse JSON response
        response_text = result.stdout.strip()
        proposal = self._parse_strategist_json(response_text)

        if proposal is None:
            logger.warning("could_not_parse_strategist_response", response=response_text[:300])
            return None

        # Check if strategist wants to stop
        if proposal.get("stop_reason"):
            logger.info("strategist_stopped", reason=proposal["stop_reason"])
            return None

        # Build experiment from proposal
        experiment = {
            "name": f"llm_iter{iteration}_{proposal.get('strategy', 'unknown')}",
            "strategy": proposal.get("strategy", "trend_following"),
            "timeframe": proposal.get("timeframe", "1Day"),
            "universe": proposal.get("universe"),
            "params": proposal.get("params", {}),
            "llm_analysis": proposal.get("analysis", ""),
            "llm_proposal": proposal.get("proposal", ""),
            "llm_confidence": proposal.get("confidence", "unknown"),
        }

        return experiment

    @staticmethod
    def _parse_strategist_json(text: str) -> dict | None:
        """Parse JSON from LLM response (with fallbacks for imperfect formatting)."""
        # Try direct parse
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try extracting { ... } block
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(text[start:end + 1])
            except json.JSONDecodeError:
                pass

        return None

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def _save_log(self) -> None:
        """Save optimization log to disk."""
        log = {
            "session_dir": str(self.session_dir),
            "start": self.start,
            "end": self.end,
            "capital": self.capital,
            "max_iterations": self.max_iterations,
            "rules_only": self.rules_only,
            "iterations_completed": len(self.history),
            "best_sharpe": self.best_sharpe,
            "best_iteration": self.best_iteration,
            "history": self.history,
        }
        with open(self.log_path, "w") as f:
            json.dump(log, f, indent=2, default=str)

    def _load_history(self) -> list[dict]:
        """Load history from existing session."""
        if self.log_path.exists():
            try:
                with open(self.log_path) as f:
                    data = json.load(f)
                return data.get("history", [])
            except Exception:
                pass
        return []

    def _save_final_report(self, outcome: str, last_iteration: int) -> None:
        """Save human-readable final report + notify Telegram + close task board."""
        report_path = self.session_dir / "OPTIMIZATION_REPORT.md"

        lines = [
            "# Auto-Optimizer — Final Report",
            f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M')}",
            f"**Outcome:** {outcome}",
            f"**Period:** {self.start} → {self.end}",
            f"**Iterations:** {last_iteration}",
            f"**Best Sharpe:** {self.best_sharpe:.3f} (iteration {self.best_iteration})",
            "",
            "---",
            "",
            "## Results by Iteration",
            "",
            "| # | Name | Strategy | TF | Return | Sharpe | WR% | PF | Trades | MaxDD |",
            "|---|------|----------|----|--------|--------|-----|------|--------|-------|",
        ]

        for i, h in enumerate(self.history, 1):
            c = h.get("config_used", {})
            p = h.get("performance", {})
            t = h.get("trades", {})
            marker = " ⭐" if i == self.best_iteration else ""
            lines.append(
                f"| {i} | {c.get('name', '?')} | {c.get('strategy', '?')} | "
                f"{c.get('timeframe', '?')} | {p.get('total_return_pct', 0):.2f}% | "
                f"{p.get('sharpe_ratio', 0):.3f} | {t.get('win_rate_pct', 0):.1f}% | "
                f"{t.get('profit_factor', 0):.2f} | {t.get('total', 0)} | "
                f"{p.get('max_drawdown_pct', 0):.2f}%{marker} |"
            )

        if self.best_iteration > 0 and self.best_iteration <= len(self.history):
            best = self.history[self.best_iteration - 1]
            bc = best.get("config_used", {})
            lines.extend([
                "",
                "---",
                "",
                "## Best Configuration",
                "",
                f"**Strategy:** {bc.get('strategy', '?')}",
                f"**Timeframe:** {bc.get('timeframe', '?')}",
                f"**Universe:** {bc.get('universe', 'default')}",
                f"**Params:** `{json.dumps(bc.get('params', {}))}`",
            ])

        lines.extend(["", "---", f"", "Generated by Auto-Optimizer"])

        with open(report_path, "w") as f:
            f.write("\n".join(lines))

        print(f"\n  📄 Report saved: {report_path}")
        self._save_log()

        # --- Notify Telegram: final report ---
        _send_telegram(_format_final_msg(
            outcome=outcome,
            total_iters=len(self.history),
            best_sharpe=self.best_sharpe,
            best_iter=self.best_iteration,
            history=self.history,
            period=f"{self.start} → {self.end}",
        ))

        # --- Close task on company board ---
        self._close_board_task(outcome)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python -m src.backtest.auto_optimize",
        description="Auto-Optimizer — Iterative backtest optimization loop",
    )
    parser.add_argument("--start", type=str, required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--capital", type=float, default=100_000, help="Initial capital (default: 100000)")
    parser.add_argument("--max-iter", type=int, default=10, help="Max optimization iterations (default: 10)")
    parser.add_argument("--output", type=str, default=None, help="Base output directory")
    parser.add_argument("--rules-only", action="store_true", help="Skip LLM strategist, use rule-based only")
    parser.add_argument("--resume", type=str, default=None, help="Resume from existing session directory")
    args = parser.parse_args()

    output_dir = Path(args.output) if args.output else None
    resume_dir = Path(args.resume) if args.resume else None

    optimizer = AutoOptimizer(
        start=args.start,
        end=args.end,
        capital=args.capital,
        max_iterations=args.max_iter,
        output_dir=output_dir,
        rules_only=args.rules_only,
        resume_dir=resume_dir,
    )
    optimizer.run()


if __name__ == "__main__":
    main()
