#!/usr/bin/env python3
"""
Trading Report — snapshot rapido per il boss.

Uso:
    python trading/report.py
    python trading/report.py --days 7     # limita trade history agli ultimi N giorni
    python trading/report.py --no-color   # output senza ANSI (per redirect su file)

Legge da Supabase (service_role):
  - trading_orders          → trade history (BUY + SELL filled)
  - portfolio_positions     → posizioni aperte (snapshot DB)
  - portfolio_snapshots     → storico P&L giornaliero
  - risk_events             → kill switch, stop loss, trailing stop events
  - trailing_stop_state     → stato trailing stop per posizione aperta
  - trading_config          → modalità corrente (paper/live)
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# ── Path setup ────────────────────────────────────────────────────────────────
# Aggiunge la root del progetto al PYTHONPATH così gli import relativi funzionano
# sia da `python trading/report.py` che da `cd trading && python report.py`.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_TRADING_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(_PROJECT_ROOT))
sys.path.insert(0, str(_TRADING_ROOT))

from src.config.settings import get_settings  # noqa: E402
from src.utils.db import TradingDB  # noqa: E402


# ── ANSI colors ───────────────────────────────────────────────────────────────

USE_COLOR = True  # overridden by --no-color


def _c(code: str, text: str) -> str:
    if not USE_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def green(t: str) -> str:  return _c("32", t)
def red(t: str) -> str:    return _c("31", t)
def yellow(t: str) -> str: return _c("33", t)
def cyan(t: str) -> str:   return _c("36", t)
def bold(t: str) -> str:   return _c("1",  t)
def dim(t: str) -> str:    return _c("2",  t)


# ── Formatting helpers ────────────────────────────────────────────────────────

def _fmt_pnl(val: float, pct: float | None = None) -> str:
    """Format a P&L value with color and optional percentage."""
    sign = "+" if val >= 0 else ""
    s = f"{sign}${val:,.2f}"
    if pct is not None:
        ps = f"{'+' if pct >= 0 else ''}{pct:.2f}%"
        s = f"{s} ({ps})"
    return green(s) if val >= 0 else red(s)


def _fmt_pct(val: float) -> str:
    sign = "+" if val >= 0 else ""
    s = f"{sign}{val:.2f}%"
    return green(s) if val >= 0 else red(s)


def _col(text: str, width: int, align: str = "<") -> str:
    """Pad / truncate a string to a fixed column width."""
    text = str(text)
    if len(text) > width:
        text = text[: width - 1] + "…"
    fmt = f"{{:{align}{width}}}"
    return fmt.format(text)


def _divider(char: str = "─", width: int = 90) -> str:
    return dim(char * width)


def _section(title: str) -> str:
    return f"\n{bold(title)}\n{_divider()}"


# ── Data helpers ──────────────────────────────────────────────────────────────

def _parse_dt(val: str | None) -> datetime | None:
    if not val:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%f+00:00",
        "%Y-%m-%dT%H:%M:%S+00:00",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(val, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _days_ago(days: int) -> datetime:
    return datetime.now(tz=timezone.utc) - timedelta(days=days)


# ── Trade matching: BUY ↔ SELL ───────────────────────────────────────────────

def _match_trades(orders: list[dict]) -> list[dict]:
    """
    Match filled SELL orders to their preceding BUY for the same symbol.
    Strategy: FIFO — each SELL consumes the oldest BUY of the same symbol.

    Returns a list of closed-trade dicts:
        symbol, qty, entry_price, exit_price, pnl_dollar, pnl_pct, closed_at
    """
    # Separate filled BUYs and SELLs, sorted chronologically
    buys: dict[str, list[dict]] = {}   # symbol → queue of BUY orders
    sells: list[dict] = []

    for o in orders:
        side = (o.get("side") or "").upper()
        status = (o.get("status") or "").lower()
        filled_price = float(o.get("filled_avg_price") or 0)
        qty = float(o.get("filled_qty") or o.get("qty") or 0)
        if filled_price <= 0 or qty <= 0:
            continue
        if side == "BUY" and status == "filled":
            sym = o.get("symbol", "")
            buys.setdefault(sym, []).append(o)
        elif side == "SELL" and status == "filled":
            sells.append(o)

    # Sort buys FIFO
    for sym in buys:
        buys[sym].sort(key=lambda x: x.get("filled_at") or x.get("created_at") or "")

    closed: list[dict] = []
    for sell in sells:
        sym = sell.get("symbol", "")
        sell_price = float(sell.get("filled_avg_price") or 0)
        sell_qty = float(sell.get("filled_qty") or sell.get("qty") or 0)
        sell_dt = _parse_dt(sell.get("filled_at") or sell.get("created_at"))

        buy_queue = buys.get(sym, [])
        if not buy_queue:
            # No matching BUY found — record partial info
            closed.append({
                "symbol": sym,
                "qty": sell_qty,
                "entry_price": None,
                "exit_price": sell_price,
                "pnl_dollar": None,
                "pnl_pct": None,
                "closed_at": sell_dt,
            })
            continue

        # Pop the oldest BUY
        buy = buy_queue.pop(0)
        entry_price = float(buy.get("filled_avg_price") or 0)
        pnl_dollar = (sell_price - entry_price) * sell_qty
        pnl_pct = ((sell_price - entry_price) / entry_price * 100) if entry_price > 0 else 0.0

        closed.append({
            "symbol": sym,
            "qty": sell_qty,
            "entry_price": entry_price,
            "exit_price": sell_price,
            "pnl_dollar": round(pnl_dollar, 2),
            "pnl_pct": round(pnl_pct, 2),
            "closed_at": sell_dt,
        })

    # Sort by date descending (most recent first)
    closed.sort(key=lambda x: x["closed_at"] or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return closed


# ── Fetch from DB (with graceful errors) ────────────────────────────────────

def _safe_fetch(label: str, fn):
    """Run a DB fetch, return empty list/dict on error."""
    try:
        return fn()
    except Exception as e:
        print(yellow(f"  [warn] Could not fetch {label}: {e}"))
        return [] if label != "config" else {}


# ── Report sections ───────────────────────────────────────────────────────────

def _print_header(config: dict, settings) -> None:
    mode = (config.get("mode") or settings.mode or "paper").upper()
    enabled = config.get("enabled", settings.enabled)
    mode_str = bold(green(mode)) if mode == "PAPER" else bold(red(mode + " ⚠️  LIVE"))
    status_str = green("ENABLED") if enabled else red("DISABLED")

    now = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    print()
    print(bold("=" * 90))
    print(bold(f"  TRADING REPORT  —  {now}"))
    print(bold("=" * 90))
    print(f"  Mode: {mode_str}   Status: {status_str}")
    print()


def _print_portfolio_summary(snapshots: list[dict]) -> None:
    print(_section("PORTFOLIO SUMMARY  (ultimi snapshot Supabase)"))

    if not snapshots:
        print(dim("  Nessuno snapshot disponibile. Esegui portfolio_monitor daily_report per popolarlo."))
        return

    latest = snapshots[0]
    pv = float(latest.get("portfolio_value") or 0)
    cash = float(latest.get("cash") or 0)
    pos_val = float(latest.get("positions_value") or 0)
    daily_pnl = float(latest.get("daily_pnl") or 0)
    daily_pct = float(latest.get("daily_pnl_pct") or 0)
    weekly_pct = float(latest.get("weekly_pnl_pct") or 0)
    dd_pct = float(latest.get("max_drawdown_pct") or 0)
    sharpe = latest.get("sharpe_30d")
    win_rate = latest.get("win_rate")
    snap_date = latest.get("date", "?")
    n_pos = latest.get("positions_count", "?")

    print(f"  Snapshot date    : {cyan(str(snap_date))}")
    print(f"  Portfolio value  : {bold(f'${pv:,.2f}')}")
    print(f"  Cash             : ${cash:,.2f}")
    print(f"  Positions value  : ${pos_val:,.2f}   ({n_pos} posizioni)")
    print(f"  Daily P&L        : {_fmt_pnl(daily_pnl, daily_pct)}")
    print(f"  Weekly P&L       : {_fmt_pct(weekly_pct)}")
    print(f"  Max drawdown 30d : {_fmt_pct(dd_pct)}")
    if sharpe is not None:
        sharpe_str = green(f"{sharpe:.2f}") if sharpe >= 1.0 else (yellow(f"{sharpe:.2f}") if sharpe >= 0 else red(f"{sharpe:.2f}"))
        print(f"  Sharpe 30d       : {sharpe_str}")
    if win_rate is not None:
        print(f"  Win rate         : {_fmt_pct(win_rate * 100)}")

    # Mini sparkline: ultimi 7 giorni
    if len(snapshots) >= 2:
        recent = list(reversed(snapshots[:7]))  # oldest → newest
        values = [float(s.get("portfolio_value") or 0) for s in recent]
        dates = [s.get("date", "") for s in recent]
        print()
        print(dim("  Storico 7gg (portfolio value):"))
        for d, v in zip(dates, values):
            bar_len = int((v / max(values)) * 30) if max(values) > 0 else 0
            bar = "█" * bar_len
            print(f"    {dim(str(d))}  {cyan(bar)}  ${v:,.0f}")


def _print_trade_history(closed_trades: list[dict], days: int) -> None:
    print(_section(f"TRADE HISTORY  (ultimi {days} giorni — trade chiusi)"))

    if not closed_trades:
        print(dim("  Nessun trade chiuso nel periodo."))
        return

    # Header
    h = (
        f"  {_col('SYMBOL', 7)}"
        f"  {_col('ENTRY', 9, '>')}"
        f"  {_col('EXIT', 9, '>')}"
        f"  {_col('QTY', 6, '>')}"
        f"  {_col('P&L $', 12, '>')}"
        f"  {_col('P&L %', 8, '>')}"
        f"  {_col('DATA CHIUSURA', 20)}"
    )
    print(bold(h))
    print(dim("  " + "─" * 86))

    total_pnl = 0.0
    wins = 0
    for t in closed_trades:
        sym = t["symbol"]
        entry = f"${t['entry_price']:,.2f}" if t["entry_price"] else "n/a"
        exit_ = f"${t['exit_price']:,.2f}" if t["exit_price"] else "n/a"
        qty = f"{t['qty']:.0f}"
        pnl_d = t["pnl_dollar"]
        pnl_p = t["pnl_pct"]
        dt_str = t["closed_at"].strftime("%Y-%m-%d %H:%M") if t["closed_at"] else "?"

        if pnl_d is not None:
            total_pnl += pnl_d
            if pnl_d >= 0:
                wins += 1
            pnl_d_str = _fmt_pnl(pnl_d)
            pnl_p_str = _fmt_pct(pnl_p) if pnl_p is not None else "n/a"
        else:
            pnl_d_str = dim("n/a")
            pnl_p_str = dim("n/a")

        row = (
            f"  {_col(sym, 7)}"
            f"  {_col(entry, 9, '>')}"
            f"  {_col(exit_, 9, '>')}"
            f"  {_col(qty, 6, '>')}"
            f"  {_col(pnl_d_str, 12, '>')}"
            f"  {_col(pnl_p_str, 8, '>')}"
            f"  {_col(dt_str, 20)}"
        )
        print(row)

    # Summary row
    n = len(closed_trades)
    wr = (wins / n * 100) if n > 0 else 0
    print(dim("  " + "─" * 86))
    print(
        f"  {bold(_col(f'{n} trades', 7))}"
        f"  {_col('', 9)}  {_col('', 9)}"
        f"  {_col('', 6, '>')}"
        f"  {_col(bold(_fmt_pnl(total_pnl)), 12, '>')}"
        f"  {_col(bold(_fmt_pct(wr) + ' WR'), 8, '>')}"
        f"  {_col('', 20)}"
    )


def _print_open_positions(positions: list[dict], trailing_states: list[dict]) -> None:
    print(_section("POSIZIONI APERTE"))

    if not positions:
        print(dim("  Nessuna posizione aperta nel DB. Esegui trailing_stops per sincronizzare."))
        return

    # Build trailing state map
    ts_map = {s["symbol"]: s for s in trailing_states}

    tier_names = {0: "none", 1: "breakeven", 2: "lock", 3: "trailing", 4: "tight"}

    h = (
        f"  {_col('SYMBOL', 7)}"
        f"  {_col('QTY', 6, '>')}"
        f"  {_col('ENTRY', 9, '>')}"
        f"  {_col('CURRENT', 9, '>')}"
        f"  {_col('UNREAL P&L', 14, '>')}"
        f"  {_col('STOP', 9, '>')}"
        f"  {_col('TIER', 10)}"
    )
    print(bold(h))
    print(dim("  " + "─" * 80))

    total_unrealized = 0.0
    for p in positions:
        sym = p.get("symbol", "?")
        qty = int(p.get("qty") or 0)
        entry = float(p.get("avg_entry_price") or 0)
        current = float(p.get("current_price") or entry)
        unreal_pnl = float(p.get("unrealized_pnl") or (current - entry) * qty)
        unreal_pct = float(p.get("unrealized_pnl_pct") or (
            ((current - entry) / entry * 100) if entry > 0 else 0
        ))
        total_unrealized += unreal_pnl

        ts = ts_map.get(sym)
        stop_str = f"${float(ts['current_stop_price']):,.2f}" if ts and ts.get("current_stop_price") else dim("—")
        tier_n = int(ts.get("tier_reached", 0)) if ts else 0
        tier_str = tier_names.get(tier_n, str(tier_n))
        tier_colored = (
            dim(tier_str) if tier_n == 0
            else yellow(tier_str) if tier_n == 1
            else cyan(tier_str) if tier_n == 2
            else green(tier_str)
        )

        row = (
            f"  {_col(sym, 7)}"
            f"  {_col(str(qty), 6, '>')}"
            f"  {_col(f'${entry:,.2f}', 9, '>')}"
            f"  {_col(f'${current:,.2f}', 9, '>')}"
            f"  {_col(_fmt_pnl(unreal_pnl, unreal_pct), 14, '>')}"
            f"  {_col(stop_str, 9, '>')}"
            f"  {tier_colored}"
        )
        print(row)

    print(dim("  " + "─" * 80))
    print(f"  {bold('TOTALE unrealized P&L')}: {bold(_fmt_pnl(total_unrealized))}")


def _print_risk_events(events: list[dict], days: int) -> None:
    print(_section(f"RISK EVENTS  (ultimi {days} giorni)"))

    if not events:
        print(dim("  Nessun risk event recente."))
        return

    cutoff = _days_ago(days)
    recent = [
        e for e in events
        if (_parse_dt(e.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= cutoff
    ]

    if not recent:
        print(dim(f"  Nessun risk event negli ultimi {days} giorni."))
        return

    severity_color = {
        "CRITICAL": lambda s: bold(red(s)),
        "WARNING":  lambda s: yellow(s),
        "INFO":     lambda s: cyan(s),
    }

    for e in recent[:20]:  # cap a 20 eventi
        ev_type = (e.get("event_type") or "?").upper()
        severity = (e.get("severity") or "INFO").upper()
        msg = e.get("message") or "—"
        sym = e.get("symbol") or ""
        dt = _parse_dt(e.get("created_at"))
        dt_str = dt.strftime("%Y-%m-%d %H:%M") if dt else "?"

        color_fn = severity_color.get(severity, lambda s: s)
        sym_part = f" [{bold(sym)}]" if sym else ""
        print(f"  {dim(dt_str)}  {color_fn(f'[{severity}]'):12}  {bold(ev_type)}{sym_part}")
        print(f"  {' ' * 17}{dim(msg)}")
        action = e.get("action_taken")
        if action:
            print(f"  {' ' * 17}{dim('→ ' + action)}")
        print()


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    global USE_COLOR

    parser = argparse.ArgumentParser(
        description="Trading Report — snapshot rapido per il boss."
    )
    parser.add_argument("--days", type=int, default=30, help="Giorni di storia da mostrare (default: 30)")
    parser.add_argument("--no-color", action="store_true", help="Disabilita ANSI colors")
    args = parser.parse_args()

    USE_COLOR = not args.no_color
    days = args.days

    # ── Init ──────────────────────────────────────────────────────────────────
    print(dim("  Connessione a Supabase..."))
    try:
        settings = get_settings()
        db = TradingDB()
    except Exception as e:
        print(red(f"\n  ERRORE: impossibile connettersi a Supabase.\n  {e}\n"))
        print(dim("  Verifica NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY in .env.local"))
        sys.exit(1)

    # ── Fetch tutti i dati in parallelo (sequenziale ma veloce — tutto DB) ──
    config = _safe_fetch("config", db.get_config)
    snapshots = _safe_fetch("snapshots", lambda: db.get_snapshots(days=30))
    positions = _safe_fetch("positions", db.get_positions)
    trailing_states = _safe_fetch("trailing_stop_state", db.get_all_trailing_stop_states)
    risk_events = _safe_fetch("risk_events", lambda: db.get_risk_events(days=days))

    # Orders: fetch tutti i recenti (BUY + SELL), poi filtriamo
    all_orders: list[dict] = _safe_fetch(
        "orders",
        lambda: (
            db._client
            .table("trading_orders")
            .select("*")
            .gte("created_at", _days_ago(days).isoformat())
            .order("created_at", desc=False)
            .limit(500)
            .execute()
            .data or []
        ),
    )

    closed_trades = _match_trades(all_orders)

    # ── Print ──────────────────────────────────────────────────────────────────
    _print_header(config, settings)
    _print_portfolio_summary(snapshots)
    _print_trade_history(closed_trades, days)
    _print_open_positions(positions, trailing_states)
    _print_risk_events(risk_events, days)

    print()
    print(_divider("="))
    print(dim(f"  Fonte: Supabase (DB snapshot) — aggiornato dall'ultimo ciclo del trading agent"))
    print(dim(f"  Per dati real-time: python -m trading.src.pipeline status"))
    print(_divider("="))
    print()


if __name__ == "__main__":
    main()
