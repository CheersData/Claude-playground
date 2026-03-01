"""
Trading Pipeline — Orchestrates the 5-agent daily workflow.

Pipeline flow:
  1. Market Scanner  → watchlist
  2. Signal Generator → signals
  3. Risk Manager    → approved orders
  4. Executor        → executed trades
  5. Portfolio Monitor → daily report

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
from .utils.logging import setup_logging

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
        scanner = MarketScanner()
        scan_result = await scanner.run()
        results["scan"] = {
            "candidates": scan_result.get("candidates_found", 0),
            "status": "ok",
        }

        watchlist = scan_result.get("watchlist", [])
        if not watchlist:
            logger.info("pipeline_skip", reason="empty watchlist")
            results["status"] = "no_candidates"
            return results

        # Phase 2: Signal Generator
        signal_gen = SignalGenerator()
        signal_result = await signal_gen.run(watchlist=watchlist)
        results["signals"] = {
            "generated": signal_result.get("signals_generated", 0),
            "status": "ok",
        }

        signals = signal_result.get("signals", [])
        if not signals:
            logger.info("pipeline_skip", reason="no signals")
            results["status"] = "no_signals"
            return results

        # Phase 3: Risk Manager
        risk_mgr = RiskManager()
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
            executor = Executor()
            exec_result = await executor.run(decisions=approved)
            results["execution"] = {
                "executed": exec_result.get("total_executed", 0),
                "status": "ok",
            }
        else:
            results["execution"] = {"executed": 0, "status": "no_approved_orders"}

        # Phase 5: Portfolio Monitor (daily report)
        monitor = PortfolioMonitor()
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
