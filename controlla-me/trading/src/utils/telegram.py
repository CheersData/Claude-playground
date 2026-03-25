"""
Telegram notification helper for the trading system.

Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from environment
(loaded from .env.local by settings.py at startup).

Uses only stdlib (urllib) — no extra dependencies.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import structlog

logger = structlog.get_logger()


def _is_configured() -> bool:
    return bool(os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID"))


def send(text: str) -> bool:
    """Send a plain HTML message to the configured Telegram chat.

    Silently skips if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID are not set.
    Never raises — trading must not crash on a notification failure.

    Returns True on success, False otherwise.
    """
    if not _is_configured():
        return False

    token = os.environ["TELEGRAM_BOT_TOKEN"]
    chat_id = os.environ["TELEGRAM_CHAT_ID"]
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = json.loads(resp.read())
            if result.get("ok"):
                logger.debug("telegram_sent", chars=len(text))
                return True
            logger.warning("telegram_api_error", response=result)
            return False
    except Exception as exc:
        logger.warning("telegram_send_failed", error=str(exc))
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Pre-formatted messages
# ─────────────────────────────────────────────────────────────────────────────

def notify_trades(orders: list[dict], mode: str = "paper") -> None:
    """Send a notification for executed trades.

    Gated by TELEGRAM_NOTIFY_TRADES (default: False).
    The boss does not want a message for every single trade.
    Kill switch and daily report notifications remain always-on.
    """
    if not orders or not _is_configured():
        return

    # Second layer of defense: check config flag even if caller forgot
    try:
        from ..config import get_settings
        if not get_settings().telegram.notify_trades:
            logger.debug("telegram_trades_disabled", orders=len(orders))
            return
    except Exception:
        pass  # If settings unavailable, let the caller's gate decide

    mode_label = "📄 PAPER" if mode == "paper" else "💸 LIVE"
    lines = [f"🔔 <b>Trade Eseguito</b> — {mode_label}\n"]

    # Strategy label mapping
    _STRATEGY_LABELS = {
        "conventional": "📊 MACD",
        "slope_volume": "📈 SLOPE",
        "crypto_slope": "🪙 CRYPTO",
    }

    for o in orders:
        side = o.get("side", "?").upper()
        symbol = o.get("symbol", "?")
        qty = o.get("qty", "?")
        price = o.get("filled_avg_price")
        status = o.get("status", "?")
        strategy = o.get("strategy", "")
        strategy_label = _STRATEGY_LABELS.get(strategy, "")

        icon = "📈" if side in ("BUY", "buy") else "📉"
        price_str = f" @ ${price:.2f}" if price else ""
        strategy_str = f" [{strategy_label}]" if strategy_label else ""
        lines.append(f"{icon} <b>{side} {symbol}</b> — {qty} azioni{price_str}{strategy_str} [{status}]")

    send("\n".join(lines))


def notify_kill_switch(reason: str, mode: str = "paper") -> None:
    """Send a critical kill switch alert."""
    if not _is_configured():
        return
    mode_label = "PAPER" if mode == "paper" else "🔴 LIVE"
    text = (
        f"🚨 <b>KILL SWITCH ATTIVATO</b> [{mode_label}]\n\n"
        f"⚠️ {reason}\n\n"
        f"Tutte le posizioni liquidate. Trading sospeso."
    )
    send(text)


def notify_daily_report(report: dict, mode: str = "paper") -> None:
    """Send the end-of-day portfolio report."""
    if not _is_configured():
        return

    mode_label = "📄 PAPER" if mode == "paper" else "💸 LIVE"
    pv = report.get("portfolio_value")
    daily_pct = report.get("daily_pnl_pct")
    weekly_pct = report.get("weekly_pnl_pct")
    drawdown = report.get("max_drawdown_pct")
    win_rate = report.get("win_rate")
    positions = report.get("positions", [])
    alerts = report.get("alerts", [])
    strategy_breakdown = report.get("strategy_breakdown", {})

    # Portfolio value line
    pv_str = f"${pv:,.0f}" if pv else "N/A"
    daily_str = f"{daily_pct:+.2f}%" if daily_pct is not None else "N/A"
    weekly_str = f"{weekly_pct:+.2f}%" if weekly_pct is not None else "N/A"
    dd_str = f"{drawdown:.1f}%" if drawdown is not None else "N/A"
    wr_str = f"{win_rate:.0%}" if win_rate is not None else "N/A"

    daily_icon = "📈" if (daily_pct or 0) >= 0 else "📉"
    weekly_icon = "📈" if (weekly_pct or 0) >= 0 else "📉"

    lines = [
        f"📊 <b>Daily Report — 16:30 ET</b> — {mode_label}",
        "",
        f"💼 Portfolio: <b>{pv_str}</b>",
        f"{daily_icon} Oggi: <b>{daily_str}</b>",
        f"{weekly_icon} Settimana: <b>{weekly_str}</b>",
        f"📉 Max Drawdown: {dd_str}",
        f"🎯 Win rate: {wr_str}",
    ]

    # Positions
    if positions:
        lines.append("")
        lines.append(f"<b>Posizioni aperte ({len(positions)}):</b>")
        for pos in positions[:8]:  # max 8 per non sforare i 4096 chars
            sym = pos.get("symbol", "?")
            pnl_pct = pos.get("unrealized_pnl_pct")
            pnl_str = f"{pnl_pct:+.1f}%" if pnl_pct is not None else "?"
            icon = "🟢" if (pnl_pct or 0) >= 0 else "🔴"
            lines.append(f"  {icon} {sym}: {pnl_str}")
    else:
        lines.append("")
        lines.append("📭 Nessuna posizione aperta")

    # Strategy breakdown (if available)
    _STRATEGY_ICONS = {
        "conventional": "📊 MACD",
        "slope_volume": "📈 SLOPE",
        "crypto_slope": "🪙 CRYPTO",
    }
    if strategy_breakdown:
        lines.append("")
        lines.append("<b>Per strategia:</b>")
        for strat_key, strat_data in strategy_breakdown.items():
            label = _STRATEGY_ICONS.get(strat_key, strat_key)
            trades = strat_data.get("trades", 0)
            wins = strat_data.get("wins", 0)
            wr = f"{wins/trades:.0%}" if trades > 0 else "N/A"
            lines.append(f"  {label}: {trades} trade, {wr} win rate")

    # Alerts
    lines.append("")
    if alerts:
        lines.append(f"⚠️ <b>Alert ({len(alerts)}):</b>")
        for a in alerts[:3]:
            lines.append(f"  • {a}")
    else:
        lines.append("✅ Nessun alert")

    send("\n".join(lines))
