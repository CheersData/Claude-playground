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
        stop_loss = decision.get("stop_loss")
        take_profit = decision.get("take_profit")

        if not qty or qty <= 0:
            self.logger.warning("skip_order", symbol=symbol, reason="no quantity")
            return None

        side = "buy" if action == "BUY" else "sell"

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

                # Poll for fill
                fill_info = await self._poll_for_fill(order_id)

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
                    return None

        return None

    async def _poll_for_fill(self, order_id: str | None) -> dict:
        """Poll Alpaca for order fill status with timeout."""
        if not order_id:
            return {}

        elapsed = 0.0
        while elapsed < FILL_TIMEOUT_SEC:
            try:
                orders = self._alpaca.get_orders(status="all")
                for order in orders:
                    if order.get("order_id") == order_id:
                        status = order.get("status", "")
                        if status in ("filled", "partially_filled", "cancelled", "expired", "rejected"):
                            return {
                                "status": status,
                                "filled_avg_price": order.get("filled_avg_price"),
                                "filled_qty": order.get("filled_qty"),
                                "filled_at": order.get("filled_at"),
                            }
            except Exception as e:
                self.logger.debug("poll_error", order_id=order_id, error=str(e))

            await asyncio.sleep(FILL_POLL_INTERVAL_SEC)
            elapsed += FILL_POLL_INTERVAL_SEC

        self.logger.warning("fill_timeout", order_id=order_id, timeout=FILL_TIMEOUT_SEC)
        return {"status": "submitted"}

    async def cancel_order(self, order_id: str) -> None:
        """Cancel a specific order."""
        self._alpaca.cancel_order(order_id)
        self._db.update_order(order_id, {"status": "cancelled"})
        self.logger.info("order_cancelled", order_id=order_id)

    async def liquidate_all(self, reason: str) -> dict:
        """Emergency: close all positions and cancel all orders."""
        self.logger.critical("LIQUIDATE_ALL", reason=reason)
        results = self._alpaca.close_all_positions()
        return {
            "action": "liquidate_all",
            "reason": reason,
            "positions_closed": len(results),
        }
