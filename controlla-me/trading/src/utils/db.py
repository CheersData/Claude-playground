"""
Supabase client for the trading system.
Shares the same Supabase instance as the main app.
Trading data lives in trading_* tables.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Any

import structlog
from supabase import Client, create_client

from ..config import get_settings

logger = structlog.get_logger()


@lru_cache
def get_supabase() -> Client:
    """Get shared Supabase client (singleton)."""
    settings = get_settings()
    return create_client(settings.supabase.url, settings.supabase.service_role_key)


class TradingDB:
    """CRUD operations for trading tables."""

    def __init__(self) -> None:
        self._client = get_supabase()

    # ─── Signals ───────────────────────────────────────────────

    def insert_signal(self, signal_type: str, data: dict[str, Any]) -> dict:
        """Insert a trading signal (scan, trade, risk_check)."""
        record = {
            "signal_type": signal_type,
            "data": data,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("trading_signals").insert(record).execute()
        # data["symbol"] exists only for single-symbol records (e.g. scan rows).
        # For trade/risk_check batches the symbols live inside data["signals"] as a list.
        symbol_log = data.get("symbol") or [s.get("symbol") for s in data.get("signals", [])]
        logger.info("signal_inserted", signal_type=signal_type, symbol=symbol_log)
        return result.data[0] if result.data else {}

    def get_latest_signals(self, signal_type: str, limit: int = 50) -> list[dict]:
        """Get latest signals by type."""
        result = (
            self._client.table("trading_signals")
            .select("*")
            .eq("signal_type", signal_type)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    # ─── Orders ────────────────────────────────────────────────

    def insert_order(self, order_data: dict[str, Any]) -> dict:
        """Insert an executed order."""
        record = {
            **order_data,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("trading_orders").insert(record).execute()
        logger.info("order_inserted", symbol=order_data.get("symbol"), side=order_data.get("side"))
        return result.data[0] if result.data else {}

    def update_order(self, order_id: str, updates: dict[str, Any]) -> dict:
        """Update order status/fill info."""
        result = (
            self._client.table("trading_orders")
            .update(updates)
            .eq("alpaca_order_id", order_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    # ─── Portfolio ─────────────────────────────────────────────

    def insert_snapshot(self, snapshot: dict[str, Any]) -> dict:
        """Insert daily portfolio snapshot."""
        result = self._client.table("portfolio_snapshots").insert(snapshot).execute()
        logger.info("snapshot_inserted", date=snapshot.get("date"), value=snapshot.get("portfolio_value"))
        return result.data[0] if result.data else {}

    def get_snapshots(self, days: int = 30) -> list[dict]:
        """Get recent portfolio snapshots."""
        result = (
            self._client.table("portfolio_snapshots")
            .select("*")
            .order("date", desc=True)
            .limit(days)
            .execute()
        )
        return result.data or []

    # ─── Positions ─────────────────────────────────────────────

    def upsert_positions(self, positions: list[dict[str, Any]]) -> None:
        """Upsert current positions (replace all)."""
        # Delete all current positions
        self._client.table("portfolio_positions").delete().neq("symbol", "").execute()
        # Insert new ones
        if positions:
            self._client.table("portfolio_positions").insert(positions).execute()
        logger.info("positions_upserted", count=len(positions))

    def get_positions(self) -> list[dict]:
        """Get current positions from DB."""
        result = self._client.table("portfolio_positions").select("*").execute()
        return result.data or []

    # ─── Risk Events ──────────────────────────────────────────

    def insert_risk_event(self, event: dict[str, Any]) -> dict:
        """Insert a risk event (kill switch, stop loss, warning)."""
        record = {
            **event,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("risk_events").insert(record).execute()
        logger.warning("risk_event", event_type=event.get("event_type"), severity=event.get("severity"))
        return result.data[0] if result.data else {}

    def get_risk_events(self, days: int = 7) -> list[dict]:
        """Get recent risk events."""
        result = (
            self._client.table("risk_events")
            .select("*")
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        return result.data or []

    # ─── Trailing Stop State ─────────────────────────────────

    def get_trailing_stop_state(self, symbol: str) -> dict | None:
        """Get trailing stop state for a symbol."""
        result = (
            self._client.table("trailing_stop_state")
            .select("*")
            .eq("symbol", symbol)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_all_trailing_stop_states(self) -> list[dict]:
        """Get all trailing stop states."""
        result = self._client.table("trailing_stop_state").select("*").execute()
        return result.data or []

    def upsert_trailing_stop_state(self, state: dict[str, Any]) -> dict:
        """Upsert trailing stop state for a symbol."""
        state["updated_at"] = datetime.utcnow().isoformat()
        result = (
            self._client.table("trailing_stop_state")
            .upsert(state, on_conflict="symbol")
            .execute()
        )
        logger.info(
            "trailing_stop_upserted",
            symbol=state.get("symbol"),
            stop_price=state.get("current_stop_price"),
            tier=state.get("tier_reached"),
        )
        return result.data[0] if result.data else {}

    def delete_trailing_stop_state(self, symbol: str) -> None:
        """Delete trailing stop state when position is closed."""
        self._client.table("trailing_stop_state").delete().eq("symbol", symbol).execute()
        logger.info("trailing_stop_deleted", symbol=symbol)

    # ─── Pending Retries ──────────────────────────────────────

    def get_pending_retries(self, max_age_minutes: int = 10) -> list[dict]:
        """Get pending retry signals — failed executions to re-attempt next cycle.

        Returns records younger than max_age_minutes (default 10 min = 10 cycles at 1-min freq).
        After the TTL the retry is abandoned — signal generator will re-detect independently.
        """
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(minutes=max_age_minutes)).isoformat()
        result = (
            self._client.table("trading_signals")
            .select("*")
            .eq("signal_type", "pending_retry")
            .gte("created_at", cutoff)
            .order("created_at", desc=False)
            .execute()
        )
        return result.data or []

    def delete_pending_retries(self, ids: list[str]) -> None:
        """Remove resolved pending retries by ID (after execution attempt — success or failure).

        Executor re-inserts a fresh pending_retry if execution still fails,
        so the TTL window resets correctly.
        """
        if not ids:
            return
        for rid in ids:
            self._client.table("trading_signals").delete().eq("id", rid).execute()
        logger.info("pending_retries_cleared", count=len(ids))

    # ─── Config ────────────────────────────────────────────────

    def get_config(self) -> dict:
        """Get trading configuration."""
        result = (
            self._client.table("trading_config")
            .select("*")
            .eq("active", True)
            .single()
            .execute()
        )
        return result.data or {}

    def update_config(self, updates: dict[str, Any]) -> dict:
        """Update trading configuration."""
        result = (
            self._client.table("trading_config")
            .update(updates)
            .eq("active", True)
            .execute()
        )
        logger.info("config_updated", updates=list(updates.keys()))
        return result.data[0] if result.data else {}
