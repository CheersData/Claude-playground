"""
Daily Trading Scheduler.

Runs the full pipeline automatically at:
  - 09:00 ET  (pre-market: full pipeline — scan + signal + risk + execute)
  - 10:00–15:00 ET  (hourly intraday: DISABLED — see INTRADAY_ENABLED flag)
  - 16:30 ET  (post-market daily report)

Skips weekends automatically.
Runs continuously — keep alive with: python -m src.scheduler

DST-aware: uses zoneinfo.ZoneInfo('America/New_York') — no manual offset needed.

CET equivalents (UTC+1 winter / UTC+2 summer):
  09:00 ET = 15:00 CET (winter) / 14:00 CEST (summer)
  16:30 ET = 22:30 CET (winter) / 21:30 CEST (summer)
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import schedule
import time
import structlog

from .pipeline import run_daily_pipeline, run_intraday_pipeline
from .utils.logging import setup_logging

logger = structlog.get_logger()

# Intraday flag — disabled until backtest (Phase 2) validates the model.
# The hourly intraday runs fetch daily bars which don't update during market
# hours, producing identical results to the 09:00 pre-market run (6 API calls
# for zero new value). Re-enable once signal_generator supports intraday bars.
INTRADAY_ENABLED = False

_EASTERN = ZoneInfo("America/New_York")


def _get_et_offset() -> int:
    """Return the current UTC offset for Eastern Time as an integer (EST=-5, EDT=-4).

    Uses zoneinfo.ZoneInfo('America/New_York') so the offset automatically
    switches between EST (-5) and EDT (-4) on DST transition days.
    """
    now_et = datetime.now(_EASTERN)
    offset_seconds = now_et.utcoffset().total_seconds()  # type: ignore[union-attr]
    return int(offset_seconds / 3600)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _is_weekday() -> bool:
    """Return True if today is Monday–Friday in ET."""
    now_et = datetime.now(_EASTERN)
    return now_et.weekday() < 5  # 0=Mon … 4=Fri


def _run_pipeline() -> None:
    """Sync wrapper: guard against weekends, then run the async pipeline."""
    if not _is_weekday():
        logger.info("scheduler_skip", reason="weekend")
        return
    logger.info("scheduler_trigger", job="daily_pipeline")
    result = asyncio.run(run_daily_pipeline())
    status = result.get("status", "unknown")
    logger.info("scheduler_done", status=status)


def _run_intraday() -> None:
    """Sync wrapper: hourly intraday signal refresh during market hours."""
    if not _is_weekday():
        return
    logger.info("scheduler_trigger", job="intraday_pipeline")
    result = asyncio.run(run_intraday_pipeline())
    status = result.get("status", "unknown")
    logger.info(
        "scheduler_intraday_done",
        status=status,
        signals=result.get("signals", {}).get("generated", 0),
        approved=result.get("risk", {}).get("approved", 0),
        executed=result.get("execution", {}).get("executed", 0),
    )


def _run_daily_report() -> None:
    """Sync wrapper for the post-market report phase only."""
    if not _is_weekday():
        return

    from .agents.portfolio_monitor import PortfolioMonitor

    async def _report() -> dict:
        monitor = PortfolioMonitor()
        return await monitor.run(mode="daily_report")

    logger.info("scheduler_trigger", job="daily_report")
    result = asyncio.run(_report())
    logger.info(
        "scheduler_report_done",
        portfolio_value=result.get("portfolio_value"),
        daily_pnl_pct=result.get("daily_pnl_pct"),
        alerts=len(result.get("alerts", [])),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Schedule definition
# ─────────────────────────────────────────────────────────────────────────────
#
# Times are in LOCAL machine time.  The scheduler converts 09:00 / 16:30 ET
# to UTC and logs it at startup so you can verify.
#
# DST is handled automatically via zoneinfo — no manual adjustment needed.
# ─────────────────────────────────────────────────────────────────────────────


def _et_to_local(hour: int, minute: int) -> str:
    """Return 'HH:MM' string in the local machine timezone for a given ET time.

    Converts ET (with live DST-aware offset) → UTC → local machine time.
    """
    et_offset = _get_et_offset()  # -5 EST or -4 EDT, computed live
    now_utc = datetime.now(timezone.utc)
    et_time = now_utc.replace(hour=hour, minute=minute, second=0, microsecond=0)
    et_time_utc = et_time - timedelta(hours=et_offset)  # ET → UTC
    # Convert UTC → local by using the machine's local offset
    local_offset = datetime.now().astimezone().utcoffset() or timedelta(0)
    local_time = et_time_utc + local_offset
    return local_time.strftime("%H:%M")


def _setup_schedule() -> None:
    """Register all jobs."""
    et_offset = _get_et_offset()  # log live offset (EST=-5 or EDT=-4)
    pipeline_time = _et_to_local(9, 0)    # 09:00 ET — pre-market full pipeline
    report_time = _et_to_local(16, 30)    # 16:30 ET — post-market daily report

    schedule.every().day.at(pipeline_time).do(_run_pipeline)
    schedule.every().day.at(report_time).do(_run_daily_report)

    # Hourly intraday slots — disabled until signal_generator supports intraday bars.
    # Daily bars don't update until market close: identical results to the 09:00 run.
    # Re-enable by setting INTRADAY_ENABLED = True after Phase 2 backtest.
    intraday_times: list[str] = []
    if INTRADAY_ENABLED:
        intraday_hours = range(10, 16)  # 10, 11, 12, 13, 14, 15
        intraday_times = [_et_to_local(h, 0) for h in intraday_hours]
        for t in intraday_times:
            schedule.every().day.at(t).do(_run_intraday)

    logger.info(
        "scheduler_configured",
        pipeline_local=pipeline_time,
        intraday_enabled=INTRADAY_ENABLED,
        intraday_slots=intraday_times if INTRADAY_ENABLED else "disabled",
        report_local=report_time,
        et_offset_hours=et_offset,
        et_zone="EDT" if et_offset == -4 else "EST",
        note="Times shown in local machine clock",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────────────────


def main() -> None:
    """Start the scheduler loop. Runs until interrupted."""
    setup_logging()
    _setup_schedule()
    logger.info("scheduler_start", jobs=len(schedule.jobs))

    try:
        while True:
            schedule.run_pending()
            time.sleep(30)  # check every 30 seconds
    except KeyboardInterrupt:
        logger.info("scheduler_stop", reason="KeyboardInterrupt")


if __name__ == "__main__":
    main()
