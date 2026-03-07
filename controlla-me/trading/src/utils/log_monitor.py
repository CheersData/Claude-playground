"""Log Monitor — parses JSON-L trading logs and reports issues.

Usage:
    python -m src.utils.log_monitor              # analyze today's log
    python -m src.utils.log_monitor --date 2026-03-04   # specific date
    python -m src.utils.log_monitor --tail 100    # last 100 lines of current log
    python -m src.utils.log_monitor --telegram    # send summary to Telegram

Reads from trading/logs/trading.jsonl (today) or trading.jsonl.YYYY-MM-DD (past).
Produces a summary of errors, warnings, patterns, and execution stats.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

# Resolve log directory relative to this file
_LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"


def _get_log_file(date_str: str | None = None) -> Path:
    """Get the log file path for a given date (or today)."""
    base = _LOG_DIR / "trading.jsonl"
    if date_str:
        # Rotated files: trading.jsonl.2026-03-04
        rotated = Path(str(base) + f".{date_str}")
        if rotated.exists():
            return rotated
        # Maybe it's today's file
        if base.exists():
            return base
        print(f"No log file found for {date_str}", file=sys.stderr)
        sys.exit(1)
    # Default: current log file
    if base.exists():
        return base
    print(f"No log file at {base}", file=sys.stderr)
    sys.exit(1)


def parse_log_file(path: Path, tail: int | None = None) -> list[dict]:
    """Parse JSON-L log file into list of event dicts."""
    events: list[dict] = []
    lines = path.read_text(encoding="utf-8").strip().split("\n")
    if tail:
        lines = lines[-tail:]
    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


def analyze(events: list[dict]) -> dict:
    """Analyze log events and produce a summary."""
    total = len(events)
    errors = [e for e in events if e.get("level", "").lower() == "error"]
    warnings = [e for e in events if e.get("level", "").lower() == "warning"]

    # Count error types
    error_types: Counter = Counter()
    for e in errors:
        event_name = e.get("event", "unknown")
        error_types[event_name] += 1

    # Count warning types
    warning_types: Counter = Counter()
    for e in warnings:
        event_name = e.get("event", "unknown")
        warning_types[event_name] += 1

    # Symbols with failures
    failed_symbols: Counter = Counter()
    for e in errors + warnings:
        sym = e.get("symbol")
        if sym and "failed" in e.get("event", ""):
            failed_symbols[sym] += 1

    # Pipeline cycles
    pipeline_starts = [e for e in events if e.get("event") == "intraday_pipeline_start"]
    pipeline_completes = [e for e in events if e.get("event") == "intraday_pipeline_complete"]
    pipeline_errors = [e for e in events if e.get("event") == "intraday_pipeline_error"]

    # Execution stats
    orders_executed = [e for e in events if e.get("event") == "order_executed"]
    orders_failed = [e for e in events if e.get("event") == "executor_error"]
    bracket_dropped = [e for e in events if e.get("event") == "bracket_dropped_on_failure"]
    pending_retries = [e for e in events if e.get("event") == "pending_retry_scheduled"]
    kill_switch = [e for e in events if "kill_switch" in e.get("event", "").lower()]

    # Signals
    signals_generated = [e for e in events if e.get("event") == "signal_generator_complete"]
    total_signals = sum(e.get("signals", 0) for e in signals_generated)

    # Fresh quote diagnostics
    fresh_quote_ok = [e for e in events if e.get("event") == "fresh_price_from_quote"]
    fresh_quote_snapshot = [e for e in events if e.get("event") == "fresh_price_from_snapshot"]
    fresh_quote_empty = [e for e in events if e.get("event") == "quote_empty_trying_snapshot"]
    fresh_quote_skipped = [e for e in events if e.get("event") == "fresh_quote_skipped"]
    no_market_data = [e for e in events if e.get("event") == "no_fresh_price_dropping_bracket"]

    return {
        "total_events": total,
        "errors": len(errors),
        "warnings": len(warnings),
        "error_types": dict(error_types.most_common(10)),
        "warning_types": dict(warning_types.most_common(10)),
        "failed_symbols": dict(failed_symbols.most_common(10)),
        "pipeline_cycles": len(pipeline_starts),
        "pipeline_errors": len(pipeline_errors),
        "pipeline_error_msgs": [e.get("error", "?") for e in pipeline_errors],
        "orders_executed": len(orders_executed),
        "orders_failed": len(orders_failed),
        "bracket_dropped": len(bracket_dropped),
        "pending_retries": len(pending_retries),
        "total_signals": total_signals,
        "kill_switch_events": len(kill_switch),
        "fresh_quote": {
            "ok": len(fresh_quote_ok),
            "snapshot_fallback": len(fresh_quote_snapshot),
            "quote_empty": len(fresh_quote_empty),
            "skipped": len(fresh_quote_skipped),
            "no_data_dropped": len(no_market_data),
        },
    }


def format_report(summary: dict, date_str: str) -> str:
    """Format analysis into a human-readable report."""
    lines = [
        f"📋 Trading Log Report — {date_str}",
        f"{'=' * 40}",
        f"Total events: {summary['total_events']}",
        f"Errors: {summary['errors']}  |  Warnings: {summary['warnings']}",
        "",
        f"Pipeline cycles: {summary['pipeline_cycles']}  |  Pipeline errors: {summary['pipeline_errors']}",
        f"Signals generated: {summary['total_signals']}",
        f"Orders executed: {summary['orders_executed']}  |  Failed: {summary['orders_failed']}",
        f"Bracket dropped (→ market): {summary['bracket_dropped']}",
        f"Pending retries: {summary['pending_retries']}",
    ]

    if summary["kill_switch_events"]:
        lines.append(f"🚨 KILL SWITCH EVENTS: {summary['kill_switch_events']}")

    if summary["error_types"]:
        lines.append("")
        lines.append("Top errors:")
        for event, count in summary["error_types"].items():
            lines.append(f"  {count}× {event}")

    if summary["failed_symbols"]:
        lines.append("")
        lines.append("Symbols with failures:")
        for sym, count in summary["failed_symbols"].items():
            lines.append(f"  {sym}: {count} failures")

    fq = summary.get("fresh_quote", {})
    if any(fq.values()):
        lines.append("")
        lines.append("Fresh quote diagnostics:")
        lines.append(f"  Quote OK: {fq['ok']}  |  Snapshot fallback: {fq['snapshot_fallback']}")
        lines.append(f"  Quote empty: {fq['quote_empty']}  |  Skipped: {fq['skipped']}")
        lines.append(f"  No data (bracket dropped): {fq['no_data_dropped']}")

    if summary["pipeline_error_msgs"]:
        lines.append("")
        lines.append("Pipeline errors:")
        for msg in summary["pipeline_error_msgs"][:5]:
            lines.append(f"  • {msg}")

    return "\n".join(lines)


def format_telegram(summary: dict, date_str: str) -> str:
    """Format analysis as HTML for Telegram."""
    status = "🟢" if summary["errors"] == 0 else "🔴" if summary["errors"] > 5 else "🟡"

    lines = [
        f"{status} <b>Log Monitor — {date_str}</b>",
        "",
        f"📊 Events: {summary['total_events']}",
        f"❌ Errors: {summary['errors']}  |  ⚠️ Warnings: {summary['warnings']}",
        f"📡 Pipeline: {summary['pipeline_cycles']} cycles, {summary['pipeline_errors']} errors",
        f"✅ Executed: {summary['orders_executed']}  |  ❌ Failed: {summary['orders_failed']}",
        f"🔄 Bracket→Market: {summary['bracket_dropped']}  |  Retries: {summary['pending_retries']}",
    ]

    if summary["kill_switch_events"]:
        lines.append(f"\n🚨 <b>KILL SWITCH: {summary['kill_switch_events']} events</b>")

    if summary["error_types"]:
        lines.append("")
        lines.append("<b>Top errors:</b>")
        for event, count in list(summary["error_types"].items())[:5]:
            lines.append(f"  {count}× <code>{event}</code>")

    if summary["failed_symbols"]:
        lines.append("")
        lines.append("<b>Problem symbols:</b>")
        for sym, count in list(summary["failed_symbols"].items())[:5]:
            lines.append(f"  {sym}: {count}×")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Trading log monitor")
    parser.add_argument("--date", help="Date to analyze (YYYY-MM-DD)")
    parser.add_argument("--tail", type=int, help="Only last N lines")
    parser.add_argument("--telegram", action="store_true", help="Send summary to Telegram")
    parser.add_argument("--json", action="store_true", help="Output raw JSON summary")
    args = parser.parse_args()

    date_str = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_file = _get_log_file(args.date)
    events = parse_log_file(log_file, tail=args.tail)

    if not events:
        print(f"No events found in {log_file}")
        return

    summary = analyze(events)

    if args.json:
        print(json.dumps(summary, indent=2))
        return

    report = format_report(summary, date_str)
    print(report)

    if args.telegram:
        # Import here to avoid circular deps and .env loading issues
        from . import telegram
        msg = format_telegram(summary, date_str)
        ok = telegram.send(msg)
        print(f"\nTelegram: {'sent' if ok else 'failed'}")


if __name__ == "__main__":
    main()
