"""
CLI entry point for the trading system.

Usage:
    python -m trading.src scan              # Run market scanner
    python -m trading.src signals           # Generate trading signals
    python -m trading.src risk              # Validate signals against risk rules
    python -m trading.src execute           # Execute approved orders
    python -m trading.src monitor --mode status       # Quick portfolio status
    python -m trading.src monitor --mode daily_report  # Full daily report
    python -m trading.src monitor --mode check_stops   # Enforce stop losses
    python -m trading.src pipeline          # Run full daily pipeline
"""

from __future__ import annotations

import argparse
import asyncio
import sys

import structlog

from .utils.logging import setup_logging


logger = structlog.get_logger()


def build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(
        prog="trading",
        description="Controlla.me Trading System -- Automated swing trading pipeline",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO)",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # scan
    subparsers.add_parser("scan", help="Run market scanner (pre-market screening)")

    # signals
    subparsers.add_parser("signals", help="Generate trading signals from watchlist")

    # risk
    subparsers.add_parser("risk", help="Validate signals against risk rules")

    # execute
    subparsers.add_parser("execute", help="Execute approved orders on Alpaca")

    # monitor
    monitor_parser = subparsers.add_parser("monitor", help="Portfolio monitoring")
    monitor_parser.add_argument(
        "--mode",
        default="status",
        choices=["status", "daily_report", "check_stops"],
        help="Monitor mode (default: status)",
    )

    # pipeline
    subparsers.add_parser("pipeline", help="Run the full daily trading pipeline")

    return parser


async def cmd_scan() -> dict:
    """Run the market scanner."""
    from .agents.market_scanner import MarketScanner

    scanner = MarketScanner()
    return await scanner.run()


async def cmd_signals() -> dict:
    """Generate trading signals."""
    from .agents.signal_generator import SignalGenerator

    generator = SignalGenerator()
    return await generator.run()


async def cmd_risk() -> dict:
    """Validate signals against risk rules."""
    from .agents.risk_manager import RiskManager

    manager = RiskManager()
    return await manager.run()


async def cmd_execute() -> dict:
    """Execute approved orders."""
    from .agents.executor import Executor

    executor = Executor()
    return await executor.run()


async def cmd_monitor(mode: str) -> dict:
    """Run portfolio monitor."""
    from .agents.portfolio_monitor import PortfolioMonitor

    monitor = PortfolioMonitor()
    return await monitor.run(mode=mode)


async def cmd_pipeline() -> dict:
    """
    Run the full daily trading pipeline:
    1. Market scan
    2. Signal generation
    3. Risk validation
    4. Order execution
    5. Portfolio snapshot
    """
    logger.info("pipeline_start")

    # 1. Scan
    from .agents.market_scanner import MarketScanner

    scanner = MarketScanner()
    scan_result = await scanner.run()
    watchlist = scan_result.get("watchlist", [])
    logger.info("pipeline_scan_done", candidates=len(watchlist))

    if not watchlist:
        logger.warning("pipeline_no_candidates")
        return {"status": "no_candidates", "scan": scan_result}

    # 2. Signals
    from .agents.signal_generator import SignalGenerator

    generator = SignalGenerator()
    signal_result = await generator.run(watchlist=watchlist)
    signals = signal_result.get("signals", [])
    logger.info("pipeline_signals_done", signals=len(signals))

    if not signals:
        logger.info("pipeline_no_signals")
        return {"status": "no_signals", "scan": scan_result, "signals": signal_result}

    # 3. Risk validation
    from .agents.risk_manager import RiskManager

    manager = RiskManager()
    risk_result = await manager.run(signals=signals)

    if risk_result.get("kill_switch"):
        logger.critical("pipeline_kill_switch", result=risk_result)
        return {"status": "kill_switch", "risk": risk_result}

    decisions = risk_result.get("decisions", [])
    approved = [d for d in decisions if d.get("status") == "APPROVED"]
    logger.info("pipeline_risk_done", approved=len(approved), total=len(decisions))

    if not approved:
        logger.info("pipeline_no_approved")
        return {
            "status": "no_approved",
            "scan": scan_result,
            "signals": signal_result,
            "risk": risk_result,
        }

    # 4. Execute
    from .agents.executor import Executor

    executor = Executor()
    exec_result = await executor.run(decisions=decisions)
    logger.info("pipeline_execute_done", orders=len(exec_result.get("orders", [])))

    # 5. Portfolio snapshot
    from .agents.portfolio_monitor import PortfolioMonitor

    monitor = PortfolioMonitor()
    snapshot = await monitor.run(mode="daily_report")

    logger.info("pipeline_complete")
    return {
        "status": "complete",
        "scan": scan_result,
        "signals": signal_result,
        "risk": risk_result,
        "execution": exec_result,
        "snapshot": snapshot,
    }


def main() -> None:
    """CLI entry point."""
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    setup_logging(level=args.log_level)

    try:
        if args.command == "scan":
            result = asyncio.run(cmd_scan())
        elif args.command == "signals":
            result = asyncio.run(cmd_signals())
        elif args.command == "risk":
            result = asyncio.run(cmd_risk())
        elif args.command == "execute":
            result = asyncio.run(cmd_execute())
        elif args.command == "monitor":
            result = asyncio.run(cmd_monitor(mode=args.mode))
        elif args.command == "pipeline":
            result = asyncio.run(cmd_pipeline())
        else:
            parser.print_help()
            sys.exit(1)

        # Print summary
        import json

        print(json.dumps(result, indent=2, default=str))

    except KeyboardInterrupt:
        logger.info("interrupted")
        sys.exit(130)
    except Exception as e:
        logger.error("fatal_error", error=str(e), exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
