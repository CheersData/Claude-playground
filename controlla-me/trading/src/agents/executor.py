"""
Executor Agent

Translates Risk Manager approvals into actual orders on Alpaca.
Supports market and bracket orders (stop loss + take profit).
Polls for fill status with timeout.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pandas as pd

from ..connectors.alpaca_client import AlpacaClient
from ..models.signals import RiskDecision, RiskDecisionStatus, SignalAction
from ..models.orders import Order, OrderSide, OrderType, OrderStatus
from ..utils.db import TradingDB
from .base import BaseAgent

MAX_RETRIES = 3
FILL_POLL_INTERVAL_SEC = 2.0
FILL_TIMEOUT_SEC = 60.0


class Executor(BaseAgent):
    """Executes approved orders on Alpaca."""

    def __init__(self) -> None:
        super().__init__("executor")
        self._alpaca = AlpacaClient()
        self._db = TradingDB()

    async def run(self, decisions: list[dict] | None = None, **kwargs: Any) -> dict:
        """
        Execute approved orders.

        Args:
            decisions: List of RiskDecision dicts. If None, reads latest from DB.
        """
        if decisions is None:
            risk_checks = self._db.get_latest_signals("risk_check", limit=1)
            if not risk_checks:
                self.log_error("No risk check data found")
                return {"orders": [], "error": "No risk checks"}
            decisions = risk_checks[0].get("data", {}).get("decisions", [])

        # Filter only approved BUY/SELL decisions
        approved = [d for d in decisions if d.get("status") == "APPROVED"]
        self.log_start(approved_orders=len(approved))

        orders: list[dict] = []
        for decision in approved:
            order = await self._execute_order(decision)
            if order:
                orders.append(order)

        result = {
            "date": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "orders": orders,
            "total_approved": len(approved),
            "total_executed": len(orders),
        }

        self.log_complete(executed=len(orders), failed=len(approved) - len(orders))
        return result

    async def _execute_order(self, decision: dict) -> dict | None:
        """Execute a single order on Alpaca with retries and fill polling."""
        symbol = decision["symbol"]
        action = decision["action"]
        qty = decision.get("position_size")
        # Alpaca requires prices rounded to 2 decimal places (no sub-penny)
        raw_sl = decision.get("stop_loss")
        raw_tp = decision.get("take_profit")
        stop_loss = round(raw_sl, 2) if raw_sl is not None else None
        take_profit = round(raw_tp, 2) if raw_tp is not None else None

        if not qty or qty <= 0:
            self.logger.warning("skip_order", symbol=symbol, reason="no quantity")
            return None

        # BUY=long entry, SHORT=short entry, SELL=close long, COVER=close short
        if action in ("BUY",):
            side = "buy"
        elif action in ("SHORT",):
            side = "sell"   # Alpaca: short entry = sell without owning
        elif action in ("SELL",):
            side = "sell"
        else:  # COVER
            side = "buy"

        # --- Pre-sell: cancel trailing stop order if active ---
        # When shares are held by an open stop order on Alpaca, a market SELL
        # will fail with "insufficient qty available for order" because the
        # broker reserves the shares for the pending stop order.
        # We must cancel the stop order first so Alpaca releases the qty.
        if side == "sell":
            self._cancel_trailing_stop_before_sell(symbol)

        for attempt in range(MAX_RETRIES):
            try:
                # Use bracket order when we have both stop loss and take profit
                if stop_loss and take_profit and side == "buy":
                    result = self._alpaca.submit_market_order(
                        symbol=symbol,
                        qty=qty,
                        side=side,
                        stop_loss=stop_loss,
                        take_profit=take_profit,
                    )
                else:
                    result = self._alpaca.submit_market_order(
                        symbol=symbol,
                        qty=qty,
                        side=side,
                    )

                order_id = result.get("order_id")

                # Poll for fill — partial fills are not terminal: keep polling
                fill_info = await self._poll_for_fill(order_id, allow_partial=False)

                # Build order record
                order_data = {
                    "alpaca_order_id": order_id,
                    "symbol": symbol,
                    "side": side,
                    "qty": qty,
                    "order_type": "bracket" if (stop_loss and take_profit) else "market",
                    "status": fill_info.get("status", result.get("status", "submitted")),
                    "stop_loss": stop_loss,
                    "take_profit": take_profit,
                    "filled_avg_price": fill_info.get("filled_avg_price", result.get("filled_avg_price")),
                    "filled_qty": fill_info.get("filled_qty"),
                    "filled_at": fill_info.get("filled_at", result.get("filled_at")),
                }
                self._db.insert_order(order_data)

                # Initialize trailing stop state for bracket BUY orders.
                # Skip if partial fill with 0 qty (order not actually filled yet).
                filled_qty = order_data.get("filled_qty")
                order_status = order_data.get("status", "")
                is_partial_with_no_fill = (
                    order_status == "partially_filled" and not filled_qty
                )
                if is_partial_with_no_fill:
                    self.logger.warning(
                        "trailing_stop_skipped_partial_no_fill",
                        symbol=symbol,
                        order_id=order_id,
                        reason="partially_filled with 0 qty — trailing stop not initialized",
                    )
                elif stop_loss and take_profit and side == "buy":
                    atr_at_entry = decision.get("atr")
                    fill_price = order_data.get("filled_avg_price") or decision.get("entry_price")
                    if atr_at_entry and fill_price:
                        if order_status == "partially_filled":
                            self.logger.warning(
                                "trailing_stop_partial_fill",
                                symbol=symbol,
                                requested_qty=qty,
                                filled_qty=filled_qty,
                                fill_price=fill_price,
                                reason="Initializing trailing stop on partial fill — position size < planned",
                            )
                        self._init_trailing_stop(
                            symbol=symbol,
                            entry_price=fill_price,
                            stop_loss=stop_loss,
                            take_profit=take_profit,
                            atr_at_entry=atr_at_entry,
                        )

                self.logger.info(
                    "order_executed",
                    symbol=symbol,
                    side=side,
                    qty=qty,
                    order_id=order_id,
                    status=order_data["status"],
                )
                return order_data

            except Exception as e:
                error_msg = str(e)
                self.logger.warning(
                    "order_attempt_failed",
                    symbol=symbol,
                    attempt=attempt + 1,
                    error=error_msg,
                )
                if attempt == MAX_RETRIES - 1:
                    # Log failed order
                    failed_order = {
                        "symbol": symbol,
                        "side": side,
                        "qty": qty,
                        "order_type": "market",
                        "status": "rejected",
                        "error_message": error_msg,
                    }
                    self._db.insert_order(failed_order)
                    self.log_error(f"Order failed after {MAX_RETRIES} retries: {error_msg}")
                    # Schedule retry for next pipeline cycle (pending intent pattern)
                    # The pipeline will re-execute this decision directly, bypassing
                    # the signal generator and risk manager (already approved).
                    # TTL: 10 minutes — after that the retry is abandoned.
                    self._db.insert_signal("pending_retry", {
                        "decision": decision,
                        "symbol": symbol,
                        "original_error": error_msg,
                    })
                    self.logger.info(
                        "pending_retry_scheduled",
                        symbol=symbol,
                        action=action,
                        reason="will retry at next pipeline cycle",
                    )
                    return None

        return None

    async def _poll_for_fill(self, order_id: str | None, allow_partial: bool = False) -> dict:
        """Poll Alpaca for order fill status with timeout.

        Args:
            order_id: Alpaca order ID.
            allow_partial: If True, treat partially_filled as terminal (old behaviour).
                           Default False — keeps polling until fully filled or cancelled.
        """
        if not order_id:
            return {}

        TERMINAL_STATUSES = {"filled", "cancelled", "expired", "rejected"}
        if allow_partial:
            TERMINAL_STATUSES.add("partially_filled")

        elapsed = 0.0
        last_partial: dict = {}

        while elapsed < FILL_TIMEOUT_SEC:
            try:
                orders = self._alpaca.get_orders(status="all")
                for order in orders:
                    if order.get("order_id") == order_id:
                        status = order.get("status", "")
                        info = {
                            "status": status,
                            "filled_avg_price": order.get("filled_avg_price"),
                            "filled_qty": order.get("filled_qty"),
                            "filled_at": order.get("filled_at"),
                        }
                        if status in TERMINAL_STATUSES:
                            return info
                        if status == "partially_filled":
                            # Save last partial fill info — return it if we timeout
                            last_partial = info
                            self.logger.debug(
                                "poll_partial_fill",
                                order_id=order_id,
                                filled_qty=order.get("filled_qty"),
                                elapsed=elapsed,
                            )
            except Exception as e:
                self.logger.debug("poll_error", order_id=order_id, error=str(e))

            await asyncio.sleep(FILL_POLL_INTERVAL_SEC)
            elapsed += FILL_POLL_INTERVAL_SEC

        # Timeout — return last partial fill info if available, else submitted
        if last_partial:
            self.logger.warning(
                "fill_timeout_with_partial",
                order_id=order_id,
                timeout=FILL_TIMEOUT_SEC,
                filled_qty=last_partial.get("filled_qty"),
            )
            return last_partial

        self.logger.warning("fill_timeout", order_id=order_id, timeout=FILL_TIMEOUT_SEC)
        return {"status": "submitted"}

    async def cancel_order(self, order_id: str) -> None:
        """Cancel a specific order."""
        self._alpaca.cancel_order(order_id)
        self._db.update_order(order_id, {"status": "cancelled"})
        self.logger.info("order_cancelled", order_id=order_id)

    def _cancel_trailing_stop_before_sell(self, symbol: str) -> None:
        """Cancel any open trailing stop order before sending a market SELL.

        Alpaca reserves shares for open stop orders, which causes market SELL
        orders to fail with "insufficient qty available for order".  By cancelling
        the stop order first we release the held qty so the SELL can proceed.

        Two-path strategy:
        1. DB state path: if trailing_stop_state has a stop_order_id, cancel it directly.
        2. Alpaca fallback: if stop_order_id is missing from DB (e.g. state created before
           the fix), query Alpaca directly for open stop/stop_limit orders on this symbol
           and cancel them all.  Also back-fills the stop_order_id into DB state.
        """
        ts_state = self._db.get_trailing_stop_state(symbol)
        stop_order_id = ts_state.get("stop_order_id") if ts_state else None

        if stop_order_id:
            # Fast path — cancel the known stop order
            try:
                self._alpaca.cancel_order(stop_order_id)
                self.logger.info(
                    "trailing_stop_cancelled",
                    symbol=symbol,
                    stop_order_id=stop_order_id,
                )
                return
            except Exception as e:
                # May already be filled/cancelled — fall through to Alpaca lookup
                self.logger.warning(
                    "trailing_stop_cancel_failed",
                    symbol=symbol,
                    stop_order_id=stop_order_id,
                    error=str(e),
                )

        # Fallback: cancel ALL open orders for this symbol before selling.
        # Bracket orders have multiple legs (stop_loss + take_profit OCO).
        # Alpaca reserves shares for ANY open order, not just stop types.
        # Cancelling only stop orders leaves take_profit (limit) legs active,
        # which still hold the shares and cause "insufficient qty" errors.
        try:
            open_orders = self._alpaca.get_orders(status="open")
            blocking_orders = [
                o for o in open_orders
                if o.get("symbol") == symbol
            ]
            if not blocking_orders:
                self.logger.info("no_open_orders_found", symbol=symbol)
                return
            for order in blocking_orders:
                oid = order.get("order_id")
                order_type = order.get("type", "unknown")
                try:
                    self._alpaca.cancel_order(oid)
                    self.logger.info(
                        "open_order_cancelled_before_sell",
                        symbol=symbol,
                        order_id=oid,
                        order_type=order_type,
                    )
                    # Back-fill stop_order_id into DB state if it was a stop order
                    if order_type in ("stop", "stop_limit", "trailing_stop") and ts_state:
                        ts_state["stop_order_id"] = oid
                        self._db.upsert_trailing_stop_state(ts_state)
                except Exception as e2:
                    self.logger.warning(
                        "order_cancel_failed_before_sell",
                        symbol=symbol,
                        order_id=oid,
                        order_type=order_type,
                        error=str(e2),
                    )
        except Exception as e:
            self.logger.warning(
                "alpaca_open_orders_fetch_failed",
                symbol=symbol,
                error=str(e),
            )

    def _init_trailing_stop(
        self,
        symbol: str,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        atr_at_entry: float,
    ) -> None:
        """Initialize trailing stop state after bracket order fill."""
        # Find the stop order ID from Alpaca open orders
        stop_order_id = None
        try:
            orders = self._alpaca.get_orders(status="open")
            for o in orders:
                if o.get("symbol") == symbol and o.get("type") == "stop":
                    stop_order_id = o.get("order_id")
                    break
        except Exception as e:
            self.logger.warning(
                "trailing_stop_find_order_failed", symbol=symbol, error=str(e)
            )

        state = {
            "symbol": symbol,
            "entry_price": round(entry_price, 4),
            "atr_at_entry": round(atr_at_entry, 4),
            "highest_close": round(entry_price, 4),  # Start with entry price
            "current_stop_price": round(stop_loss, 4),
            "original_stop_price": round(stop_loss, 4),
            "stop_order_id": stop_order_id,
            "take_profit_price": round(take_profit, 4),
            "tier_reached": 0,
        }
        self._db.upsert_trailing_stop_state(state)
        self.logger.info(
            "trailing_stop_initialized",
            symbol=symbol,
            atr=atr_at_entry,
            entry_price=entry_price,
            stop_loss=stop_loss,
            stop_order_id=stop_order_id,
        )

    async def liquidate_all(self, reason: str) -> dict:
        """Emergency: close all positions and cancel all orders."""
        self.logger.critical("LIQUIDATE_ALL", reason=reason)
        results = self._alpaca.close_all_positions()
        return {
            "action": "liquidate_all",
            "reason": reason,
            "positions_closed": len(results),
        }
