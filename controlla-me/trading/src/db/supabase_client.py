"""
Supabase client for trading tables.

Provides typed CRUD operations for the trading system's Supabase tables.
Uses NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from settings.

Note: The main trading DB layer lives in src/utils/db.py (TradingDB).
This module provides an alternative interface grouped by domain concern
under src/db/ for future refactoring.
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


class SupabaseTrading:
    """Supabase CRUD for trading domain tables."""

    def __init__(self) -> None:
        self._client = get_supabase()

    # ─── Signals ──────────────────────────────────────────────

    def save_signal(self, signal_type: str, data: dict[str, Any]) -> dict:
        """Persist a trading signal (scan, trade, risk_check)."""
        record = {
            "signal_type": signal_type,
            "data": data,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("trading_signals").insert(record).execute()
        logger.info("signal_saved", signal_type=signal_type)
        return result.data[0] if result.data else {}

    # ─── Orders ───────────────────────────────────────────────

    def save_order(self, order_data: dict[str, Any]) -> dict:
        """Persist an executed or attempted order."""
        record = {
            **order_data,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("trading_orders").insert(record).execute()
        logger.info("order_saved", symbol=order_data.get("symbol"))
        return result.data[0] if result.data else {}

    # ─── Portfolio Snapshots ──────────────────────────────────

    def save_snapshot(self, snapshot: dict[str, Any]) -> dict:
        """Persist a daily portfolio snapshot."""
        result = self._client.table("portfolio_snapshots").insert(snapshot).execute()
        logger.info("snapshot_saved", date=snapshot.get("date"))
        return result.data[0] if result.data else {}

    def get_latest_snapshot(self) -> dict | None:
        """Get the most recent portfolio snapshot."""
        result = (
            self._client.table("portfolio_snapshots")
            .select("*")
            .order("date", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
        return None

    # ─── Risk Events ─────────────────────────────────────────

    def save_risk_event(self, event: dict[str, Any]) -> dict:
        """Persist a risk management event."""
        record = {
            **event,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("risk_events").insert(record).execute()
        logger.warning("risk_event_saved", event_type=event.get("event_type"))
        return result.data[0] if result.data else {}

    # ─── Config ───────────────────────────────────────────────

    def get_config(self) -> dict:
        """Get active trading configuration."""
        result = (
            self._client.table("trading_config")
            .select("*")
            .eq("active", True)
            .single()
            .execute()
        )
        return result.data or {}
