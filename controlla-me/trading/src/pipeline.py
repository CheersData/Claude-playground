"""
Trading Pipeline — Orchestrates the 5-agent daily workflow.

Pipeline flow:
  1. Market Scanner  → watchlist
  2. Signal Generator → signals (conventional, daily bars)
  3. Risk Manager    → approved orders
  4. Executor        → executed trades
  4.5. Trailing Stops → update 4-tier dynamic stop levels
  5. Portfolio Monitor → daily report

Intraday pipeline (slope-only — phases 2.5+3+4+4.5):
  run_intraday_pipeline() — every 5 min, 24/7.

  The conventional Signal Generator (RSI/MACD/BB) uses daily bars and runs
  ONLY in the daily pipeline (09:00 ET). In the intraday pipeline it would
  re-read 1H bars every 5 min (92% redundant) with 0 signals.
  Intraday = slope+volume strategy only: faster, lower API calls, no redundancy.

Can be run as a full pipeline or agent-by-agent.
"""

from __future__ import annotations

import asyncio
from datetime import datetime

import structlog

from .agents.market_scanner import MarketScanner
from .agents.signal_generator import SignalGenerator
from .agents.risk_manager import RiskManager
from .agents.executor import Executor
from .agents.portfolio_monitor import PortfolioMonitor
from .config import get_settings
from .utils.db import TradingDB
from .utils.logging import setup_logging
from .utils import telegram as tg

logger = structlog.get_logger()


async def run_daily_pipeline() -> dict:
    """
    Execute the full daily trading pipeline.

    Returns dict with results from each phase.
    """
    settings = get_settings()
    start = datetime.utcnow()

    if not settings.enabled:
        logger.warning("pipeline_disabled", reason="TRADING_ENABLED=false")
        return {"status": "disabled"}

    logger.info("pipeline_start", mode=settings.mode)

    results: dict = {"started_at": start.isoformat(), "mode": settings.mode}

    try:
        # Phase 1: Market Scanner
        scanner = MarketScanner(account_type="conventional")
        scan_result = await scanner.run()
        results["scan"] = {
            "candidates": scan_result.get("candidates_found", 0),
            "status": "ok",
        }

        watchlist = scan_result.get("watchlist", [])

        # Phases 2-4: Only run if we have watchlist candidates
        if watchlist:
            # Phase 2: Signal Generator
            signal_gen = SignalGenerator(account_type="conventional")
            signal_result = await signal_gen.run(watchlist=watchlist)
            results["signals"] = {
                "generated": signal_result.get("signals_generated", 0),
                "status": "ok",
            }

            signals = signal_result.get("signals", [])

            if signals:
                # Phase 3: Risk Manager
                risk_mgr = RiskManager(account_type="conventional")
                risk_result = await risk_mgr.run(signals=signals)

                if risk_result.get("kill_switch"):
                    results["risk"] = {"status": "kill_switch", "message": risk_result["message"]}
                    results["status"] = "kill_switch"
                    return results

                decisions = risk_result.get("decisions", [])
                approved = [d for d in decisions if d.get("status") == "APPROVED"]
                results["risk"] = {
                    "total": len(decisions),
                    "approved": len(approved),
                    "status": "ok",
                }

                # Phase 4: Executor
                if approved:
                    executor = Executor(account_type="conventional")
                    exec_result = await executor.run(decisions=approved)
                    results["execution"] = {
                        "executed": exec_result.get("total_executed", 0),
                        "status": "ok",
                    }
                else:
                    results["execution"] = {"executed": 0, "status": "no_approved_orders"}
            else:
                results["signals"]["status"] = "no_signals"
        else:
            results["scan"]["status"] = "no_candidates"

        # Phase 4.5: Update Trailing Stops (ALWAYS runs — existing positions need management)
        monitor = PortfolioMonitor(account_type="conventional")
        trail_result = await monitor.run(mode="trailing_stops")
        results["trailing_stops"] = {
            "stops_raised": trail_result.get("stops_raised", 0),
            "states_cleaned": trail_result.get("states_cleaned", 0),
            "status": "ok",
        }

        # Phase 5: Portfolio Monitor (daily report)
        report = await monitor.run(mode="daily_report")
        results["report"] = {
            "portfolio_value": report.get("portfolio_value"),
            "daily_pnl_pct": report.get("daily_pnl_pct"),
            "positions": report.get("positions_count"),
            "alerts": len(report.get("alerts", [])),
            "status": "ok",
        }

        results["status"] = "ok"
        duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        logger.info("pipeline_complete", duration_ms=duration_ms, **results.get("report", {}))

    except Exception as e:
        results["status"] = "error"
        results["error"] = str(e)
        logger.error("pipeline_error", error=str(e))

    return results


async def run_intraday_pipeline() -> dict:
    """
    Intraday signal refresh — slope+volume only, every 5 min, 24/7.

    Only slope+volume signals (Phase 2.5) — the conventional Signal Generator
    (RSI/MACD/BB on daily bars) runs exclusively in the daily pipeline at 09:00 ET.
    No daily report — that runs post-market at 16:30 ET.
    """
    settings = get_settings()
    start = datetime.utcnow()

    if not settings.enabled:
        logger.warning("intraday_pipeline_disabled", reason="TRADING_ENABLED=false")
        return {"status": "disabled"}

    logger.info("intraday_pipeline_start", mode=settings.mode)
    results: dict = {
        "started_at": start.isoformat(),
        "mode": settings.mode,
        "type": "intraday",
    }

    try:
        signals: list[dict] = []

        # Phase 2.0: Retry failed executions from previous cycles (pending intent)
        # Decisions here are already risk-approved — skip signal gen and risk manager.
        # TTL: 10 minutes. After that, signal generator will re-detect independently.
        db = TradingDB()
        pending = db.get_pending_retries(max_age_minutes=10)
        if pending:
            pending_decisions = [r["data"]["decision"] for r in pending]
            pending_ids = [r["id"] for r in pending]

            # Filter out SHORT signals on inverse ETFs — these were created before the
            # inverse-ETF-only-BUY fix and must not be retried (would short a non-shortable asset).
            inverse_etf_symbols = set(get_settings().slope_volume.inverse_etf_symbols)
            valid_decisions = [
                d for d in pending_decisions
                if not (d.get("action") == "SHORT" and d.get("symbol") in inverse_etf_symbols)
            ]
            skipped = len(pending_decisions) - len(valid_decisions)
            if skipped:
                skipped_syms = [d.get("symbol") for d in pending_decisions if d.get("action") == "SHORT" and d.get("symbol") in inverse_etf_symbols]
                logger.info("pending_retry_skipped_inverse_short", skipped=skipped, symbols=skipped_syms)

            logger.info("pending_retries_found", count=len(pending), symbols=[d.get("symbol") for d in valid_decisions])
            if valid_decisions:
                executor = Executor(account_type="slope")
                retry_result = await executor.run(decisions=valid_decisions)
            else:
                retry_result = {"total_executed": 0}
            # Delete consumed retries regardless of outcome.
            # Executor re-inserts a fresh pending_retry if execution still fails.
            db.delete_pending_retries(pending_ids)
            results["pending_retries"] = {
                "retried": len(valid_decisions),
                "skipped_invalid": skipped,
                "executed": retry_result.get("total_executed", 0),
            }

        # Phase 2.5: Slope+Volume Strategy (multi-ticker, 24/7)
        # Runs on configured symbols (default: SPY, AAPL, NVDA, TSLA) — see TRADING_SLOPE_SYMBOLS
        # Conventional Signal Generator (RSI/MACD/BB) runs only in daily pipeline (daily bars).
        if get_settings().slope_volume.enabled:
            signal_gen = SignalGenerator(account_type="slope")
            slope_result = await asyncio.to_thread(signal_gen.run_slope_volume)
            slope_signals = slope_result.get("signals", [])
            results["slope_volume"] = {
                "generated": slope_result.get("signals_generated", 0),
                "symbols_scanned": slope_result.get("symbols_scanned", 1),
                "symbols_with_signals": slope_result.get("symbols_with_signals", 0),
                "status": (
                    "error" if "error" in slope_result
                    else "skipped" if "skipped" in slope_result
                    else "ok"
                ),
            }
            signals = slope_signals
        else:
            results["slope_volume"] = {"status": "disabled"}

        # Phases 3-4: Risk Manager + Executor
        if signals:
            # Phase 3: Risk Manager
            risk_mgr = RiskManager(account_type="slope")
            risk_result = await risk_mgr.run(signals=signals)

            if risk_result.get("kill_switch"):
                ks_msg = risk_result.get("message", "Limite P&L raggiunto")
                tg.notify_kill_switch(ks_msg, mode=settings.mode)
                results["risk"] = {
                    "status": "kill_switch",
                    "message": ks_msg,
                }
                results["status"] = "kill_switch"
                return results

            decisions = risk_result.get("decisions", [])
            approved = [d for d in decisions if d.get("status") == "APPROVED"]
            results["risk"] = {
                "total": len(decisions),
                "approved": len(approved),
                "status": "ok",
            }

            # Phase 4: Executor
            if approved:
                executor = Executor(account_type="slope")
                exec_result = await executor.run(decisions=approved)
                executed_orders = exec_result.get("orders", [])
                if executed_orders and settings.telegram.notify_trades:
                    tg.notify_trades(executed_orders, mode=settings.mode)
                results["execution"] = {
                    "executed": exec_result.get("total_executed", 0),
                    "status": "ok",
                }
            else:
                results["execution"] = {"executed": 0, "status": "no_approved_orders"}
        else:
            results.setdefault("slope_volume", {})["status"] = "no_signals"

        # Phase 4.5: Update Trailing Stops (ALWAYS runs — existing positions need management)
        monitor = PortfolioMonitor(account_type="slope")
        trail_result = await monitor.run(mode="trailing_stops")
        results["trailing_stops"] = {
            "stops_raised": trail_result.get("stops_raised", 0),
            "status": "ok",
        }

        results["status"] = "ok"
        duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        logger.info(
            "intraday_pipeline_complete",
            duration_ms=duration_ms,
            slope_signals=results.get("slope_volume", {}).get("generated", 0),
            trailing_stops=results["trailing_stops"]["stops_raised"],
        )

    except Exception as e:
        results["status"] = "error"
        results["error"] = str(e)
        logger.error("intraday_pipeline_error", error=str(e))

    return results


async def run_crypto_pipeline() -> dict:
    """
    Crypto slope pipeline — BTC/ETH, 24/7 including weekends.

    Dedicated crypto account (ALPACA_CRYPTO_API_KEY).
    No market hours restriction — crypto trades on weekends too.
    Uses slope+volume strategy on crypto pairs only.
    Kill switch is independent from equity slope account.

    Symbols: btcusd, ethusd (Tiingo format) → submitted as BTC/USD, ETH/USD to Alpaca crypto endpoint.
    """
    settings = get_settings()
    start = datetime.utcnow()

    if not settings.enabled:
        logger.warning("crypto_pipeline_disabled", reason="TRADING_ENABLED=false")
        return {"status": "disabled"}

    if not settings.alpaca_crypto.is_configured:
        logger.warning(
            "crypto_pipeline_skipped",
            reason="ALPACA_CRYPTO_API_KEY not configured — create crypto paper account and set env vars",
        )
        return {"status": "not_configured", "hint": "Set ALPACA_CRYPTO_API_KEY + ALPACA_CRYPTO_SECRET_KEY in .env.local"}

    if not settings.slope_volume.crypto_enabled:
        logger.info("crypto_pipeline_disabled", reason="TRADING_SLOPE_CRYPTO_ENABLED=false")
        return {"status": "disabled"}

    logger.info("crypto_pipeline_start", mode=settings.mode, symbols=settings.slope_volume.crypto_symbols)
    results: dict = {
        "started_at": start.isoformat(),
        "mode": settings.mode,
        "type": "crypto",
    }

    try:
        # Phase 2.5: Slope+Volume on crypto symbols only (no market hours check)
        signal_gen = SignalGenerator(account_type="crypto")
        slope_result = await asyncio.to_thread(signal_gen.run_slope_volume, crypto_only=True)
        slope_signals = slope_result.get("signals", [])
        results["slope_volume"] = {
            "generated": slope_result.get("signals_generated", 0),
            "symbols_scanned": slope_result.get("symbols_scanned", 0),
            "status": "error" if "error" in slope_result else "ok",
        }

        if slope_signals:
            # Phase 3: Risk Manager (crypto account)
            risk_mgr = RiskManager(account_type="crypto")
            risk_result = await risk_mgr.run(signals=slope_signals)

            if risk_result.get("kill_switch"):
                ks_msg = risk_result.get("message", "Crypto kill switch triggered")
                tg.notify_kill_switch(f"[CRYPTO] {ks_msg}", mode=settings.mode)
                results["risk"] = {"status": "kill_switch", "message": ks_msg}
                results["status"] = "kill_switch"
                return results

            decisions = risk_result.get("decisions", [])
            approved = [d for d in decisions if d.get("status") == "APPROVED"]
            results["risk"] = {"total": len(decisions), "approved": len(approved), "status": "ok"}

            # Phase 4: Executor (crypto account)
            if approved:
                executor = Executor(account_type="crypto")
                exec_result = await executor.run(decisions=approved)
                executed_orders = exec_result.get("orders", [])
                if executed_orders and settings.telegram.notify_trades:
                    tg.notify_trades(executed_orders, mode=settings.mode)
                results["execution"] = {
                    "executed": exec_result.get("total_executed", 0),
                    "status": "ok",
                }
            else:
                results["execution"] = {"executed": 0, "status": "no_approved_orders"}

        # Phase 4.5: Trailing stops on crypto positions
        monitor = PortfolioMonitor(account_type="crypto")
        trail_result = await monitor.run(mode="trailing_stops")
        results["trailing_stops"] = {
            "stops_raised": trail_result.get("stops_raised", 0),
            "status": "ok",
        }

        results["status"] = "ok"
        duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        logger.info("crypto_pipeline_complete", duration_ms=duration_ms, **results.get("slope_volume", {}))

    except Exception as e:
        results["status"] = "error"
        results["error"] = str(e)
        logger.error("crypto_pipeline_error", error=str(e))

    return results


def main() -> None:
    """CLI entry point for the trading pipeline."""
    setup_logging()
    result = asyncio.run(run_daily_pipeline())
    print(f"\nPipeline result: {result.get('status', 'unknown')}")
    if result.get("report"):
        print(f"Portfolio: ${result['report'].get('portfolio_value', 'N/A')}")
        print(f"Daily P&L: {result['report'].get('daily_pnl_pct', 'N/A')}%")


if __name__ == "__main__":
    main()
