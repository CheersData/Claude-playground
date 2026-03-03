"""
Portfolio Monitor Agent

Monitors portfolio health with 4 operational modes:
- status: Quick portfolio status snapshot
- daily_report: End-of-day P&L report with snapshot persistence
- check_stops: Enforce stop-loss levels on open positions
- trailing_stops: Update 4-tier trailing stop levels (matching backtest engine)

Generates risk events and alerts when thresholds are breached.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

import pandas as pd

from ..analysis import calculate_atr
from ..config import get_settings
from ..connectors.alpaca_client import AlpacaClient
from ..models.portfolio import PortfolioSnapshot, Position, RiskEvent, RiskEventType
from ..utils.db import TradingDB
from .base import BaseAgent


MonitorMode = Literal["status", "daily_report", "check_stops", "trailing_stops"]


class PortfolioMonitor(BaseAgent):
    """Monitors portfolio health and enforces risk limits."""

    def __init__(self) -> None:
        super().__init__("portfolio_monitor")
        self._alpaca = AlpacaClient()
        self._db = TradingDB()
        self._risk = get_settings().risk

    async def run(self, mode: MonitorMode = "status", **kwargs: Any) -> dict:
        """
        Run portfolio monitoring in the specified mode.

        Args:
            mode: One of "status", "daily_report", "check_stops".
        """
        self.log_start(mode=mode)

        if mode == "status":
            result = await self._quick_status()
        elif mode == "daily_report":
            result = await self._daily_report()
        elif mode == "check_stops":
            result = await self._check_stops()
        elif mode == "trailing_stops":
            result = await self._trailing_stops_mode()
        else:
            self.log_error(f"Unknown mode: {mode}")
            return {"error": f"Unknown mode: {mode}"}

        self.log_complete(mode=mode)
        return result

    # ─── Mode: status ─────────────────────────────────────────

    async def _quick_status(self) -> dict:
        """Quick portfolio status -- positions, P&L, cash."""
        account = self._alpaca.get_account()
        raw_positions = self._alpaca.get_positions()
        orders = self._alpaca.get_orders(status="open")

        positions = self._build_positions(raw_positions)
        total_unrealized = sum(p.unrealized_pnl for p in positions)
        positions_value = sum(p.market_value for p in positions)

        return {
            "mode": "status",
            "portfolio_value": account["portfolio_value"],
            "cash": account["cash"],
            "buying_power": account["buying_power"],
            "equity": account["equity"],
            "positions_count": len(positions),
            "positions_value": round(positions_value, 2),
            "total_unrealized_pnl": round(total_unrealized, 2),
            "open_orders": len(orders),
            "positions": [p.model_dump() for p in positions],
        }

    # ─── Mode: daily_report ───────────────────────────────────

    async def _daily_report(self) -> dict:
        """End-of-day report with P&L snapshot saved to DB."""
        account = self._alpaca.get_account()
        raw_positions = self._alpaca.get_positions()
        snapshots = self._db.get_snapshots(days=30)

        portfolio_value = float(account.get("portfolio_value") or 0)
        cash = float(account.get("cash") or 0)
        positions = self._build_positions(raw_positions)
        positions_value = sum(p.market_value for p in positions)

        # Calculate P&L metrics
        daily_pnl, daily_pnl_pct = self._calc_daily_pnl(snapshots, portfolio_value)
        weekly_pnl_pct = self._calc_weekly_pnl(snapshots, portfolio_value)
        max_drawdown_pct = self._calc_max_drawdown(snapshots, portfolio_value)
        sharpe_30d = self._calc_sharpe(snapshots)
        win_rate = self._calc_win_rate()

        # Build snapshot
        snapshot = PortfolioSnapshot(
            date=datetime.utcnow().strftime("%Y-%m-%d"),
            portfolio_value=round(portfolio_value, 2),
            cash=round(cash, 2),
            positions_value=round(positions_value, 2),
            daily_pnl=round(daily_pnl, 2),
            daily_pnl_pct=round(daily_pnl_pct, 2),
            weekly_pnl_pct=round(weekly_pnl_pct, 2),
            max_drawdown_pct=round(max_drawdown_pct, 2),
            sharpe_30d=sharpe_30d,
            win_rate=win_rate,
            positions_count=len(positions),
            positions=positions,
        )

        # Persist snapshot to DB
        self._db.insert_snapshot(snapshot.model_dump(mode="json"))

        # Sync positions to DB
        self._db.upsert_positions([p.model_dump() for p in positions])

        # Generate alerts if thresholds breached
        alerts = self._generate_alerts(snapshot)

        result = snapshot.model_dump(mode="json")
        result["mode"] = "daily_report"
        result["alerts"] = [a.model_dump(mode="json") for a in alerts]
        return result

    # ─── Mode: check_stops ────────────────────────────────────

    async def _check_stops(self) -> dict:
        """Check and enforce stop-loss levels on open positions."""
        raw_positions = self._alpaca.get_positions()
        account = self._alpaca.get_account()
        portfolio_value = float(account.get("portfolio_value") or 0)
        stop_events: list[dict] = []

        for p in raw_positions:
            symbol = p["symbol"]
            unrealized_pnl_pct = float(p["unrealized_plpc"] or 0) * 100
            current_price = float(p["current_price"] or 0)

            # Check position-level stop loss
            if unrealized_pnl_pct <= self._risk.stop_loss_pct:
                self.logger.warning(
                    "stop_loss_triggered",
                    symbol=symbol,
                    pnl_pct=unrealized_pnl_pct,
                    threshold=self._risk.stop_loss_pct,
                )

                # Close the position
                try:
                    self._alpaca.close_position(symbol)
                    action_taken = f"Position closed at {current_price}"
                except Exception as e:
                    action_taken = f"Close failed: {e}"

                event = RiskEvent(
                    event_type=RiskEventType.STOP_LOSS,
                    severity="WARNING",
                    symbol=symbol,
                    message=f"Stop loss triggered: {symbol} at {unrealized_pnl_pct:.2f}% (limit: {self._risk.stop_loss_pct}%)",
                    portfolio_value=portfolio_value,
                    action_taken=action_taken,
                )
                self._db.insert_risk_event(event.model_dump(mode="json"))
                stop_events.append(event.model_dump(mode="json"))

            # Check take-profit (opposite of stop loss -- lock in gains)
            elif unrealized_pnl_pct >= abs(self._risk.stop_loss_pct) * 3:
                self.logger.info(
                    "take_profit_candidate",
                    symbol=symbol,
                    pnl_pct=unrealized_pnl_pct,
                )

                event = RiskEvent(
                    event_type=RiskEventType.TAKE_PROFIT,
                    severity="INFO",
                    symbol=symbol,
                    message=f"Take profit candidate: {symbol} at +{unrealized_pnl_pct:.2f}%",
                    portfolio_value=portfolio_value,
                    action_taken=None,  # Informational only
                )
                self._db.insert_risk_event(event.model_dump(mode="json"))
                stop_events.append(event.model_dump(mode="json"))

        return {
            "mode": "check_stops",
            "positions_checked": len(raw_positions),
            "events": stop_events,
            "stop_losses_triggered": sum(
                1 for e in stop_events if e.get("event_type") == RiskEventType.STOP_LOSS
            ),
        }

    # ─── Mode: trailing_stops ──────────────────────────────────

    async def _trailing_stops_mode(self) -> dict:
        """Update 4-tier trailing stops for all positions."""
        # Sync positions from Alpaca to DB (keeps portfolio_positions fresh)
        try:
            raw_positions = self._alpaca.get_positions()
            built_positions = self._build_positions(raw_positions)
            self._db.upsert_positions([p.model_dump() for p in built_positions])
            self.logger.info("positions_synced", count=len(built_positions))
        except Exception as e:
            self.logger.warning("positions_sync_failed", error=str(e))

        updates = self._update_trailing_stops()
        cleanup = self._cleanup_trailing_stop_state()
        return {
            "mode": "trailing_stops",
            "updates": updates,
            "stops_raised": len(updates),
            "states_cleaned": cleanup,
        }

    def _update_trailing_stops(self) -> list[dict]:
        """
        4-tier trailing stop system (matches backtest engine _check_exits).

        Tier 0: Breakeven — move SL to entry when profit > breakeven_atr * ATR
        Tier 1: Lock     — move SL to entry + cushion when profit > lock_atr * ATR
        Tier 2: Trail    — follow highest_close - distance when profit > trail_threshold * ATR
        Tier 3: Tight    — tight trail when profit > tight_threshold * ATR

        Uses max() to ensure stop only moves UP (monotonic).
        Auto-bootstraps state for pre-existing positions.
        """
        if not self._risk.trailing_enabled:
            return []

        raw_positions = self._alpaca.get_positions()
        if not raw_positions:
            return []

        states = self._db.get_all_trailing_stop_states()
        state_map = {s["symbol"]: s for s in states}
        updates: list[dict] = []

        for pos in raw_positions:
            symbol = pos["symbol"]
            current_price = pos["current_price"]
            state = state_map.get(symbol)

            # Auto-bootstrap for positions without trailing stop state
            if not state:
                state = self._bootstrap_trailing_stop(pos)
                if not state:
                    continue

            entry_price = float(state["entry_price"])
            atr = float(state["atr_at_entry"])
            highest_close = float(state["highest_close"])
            current_stop = float(state["current_stop_price"])
            stop_order_id = state.get("stop_order_id")

            if atr <= 0:
                continue

            # Sanity check: stop must be BELOW current price for a long position.
            # If not (e.g. GLD anomaly: stop=458.11 vs price=~180, stale DB entry,
            # bad data from Alpaca), force a full rebootstrap from market data.
            # Using 99% threshold to tolerate negligible rounding diffs.
            _current_price_f = float(current_price) if current_price else 0.0
            if _current_price_f > 0 and current_stop >= _current_price_f * 0.99:
                self.logger.critical(
                    "trailing_stop_above_market_price",
                    symbol=symbol,
                    current_stop=round(current_stop, 2),
                    current_price=round(_current_price_f, 2),
                    action="forcing_rebootstrap",
                    reason="stop_price >= 99% current_price — would trigger immediately",
                )
                state = self._bootstrap_trailing_stop(pos)
                if not state:
                    continue
                # Re-read all values from the fresh state
                entry_price = float(state["entry_price"])
                atr = float(state["atr_at_entry"])
                highest_close = float(state["highest_close"])
                current_stop = float(state["current_stop_price"])
                stop_order_id = state.get("stop_order_id")
                if atr <= 0:
                    continue

            # Update highest close
            if current_price > highest_close:
                highest_close = current_price

            # Sanity check: highest_close should not vastly exceed current_price.
            # Prevents persisted anomalous values (e.g. stale Alpaca data, split
            # artifacts) from corrupting stop calculations.
            # 50% tolerance is generous enough for volatile names.
            _MAX_HC_RATIO = 1.5
            if highest_close > current_price * _MAX_HC_RATIO and current_price > 0:
                self.logger.warning(
                    "trailing_stop_highest_close_anomaly",
                    symbol=symbol,
                    highest_close=round(highest_close, 2),
                    current_price=round(current_price, 2),
                    ratio=round(highest_close / current_price, 2),
                    reason="highest_close > 1.5x current_price — clamping to current_price",
                )
                highest_close = current_price

            # Calculate profit from entry using highest_close
            profit_from_entry = highest_close - entry_price
            new_stop = current_stop
            tier = int(state.get("tier_reached", 0))

            # Tier 0: Breakeven — move SL to entry price
            if profit_from_entry > self._risk.trailing_breakeven_atr * atr:
                new_stop = max(new_stop, entry_price)
                tier = max(tier, 1)

            # Tier 1: Lock profit — move SL to entry + cushion
            if profit_from_entry > self._risk.trailing_lock_atr * atr:
                lock_stop = entry_price + (atr * self._risk.trailing_lock_cushion_atr)
                new_stop = max(new_stop, lock_stop)
                tier = max(tier, 2)

            # Tier 2: Trail — follow highest_close at distance
            if profit_from_entry > self._risk.trailing_trail_threshold_atr * atr:
                trailing_stop = highest_close - (atr * self._risk.trailing_trail_distance_atr)
                new_stop = max(new_stop, trailing_stop)
                tier = max(tier, 3)

            # Tier 3: Tight trail — close trailing near take profit
            if profit_from_entry > self._risk.trailing_tight_threshold_atr * atr:
                tight_stop = highest_close - (atr * self._risk.trailing_tight_distance_atr)
                new_stop = max(new_stop, tight_stop)
                tier = max(tier, 4)

            new_stop = round(new_stop, 2)

            # Update state in DB (always — to track highest_close)
            updated_state = {
                "symbol": symbol,
                "entry_price": entry_price,
                "atr_at_entry": atr,
                "highest_close": round(highest_close, 4),
                "current_stop_price": new_stop,
                "original_stop_price": float(state["original_stop_price"]),
                "stop_order_id": stop_order_id,
                "take_profit_price": state.get("take_profit_price"),
                "tier_reached": tier,
            }

            # If stop price moved up, replace the Alpaca stop order
            if new_stop > current_stop and stop_order_id:
                try:
                    result = self._alpaca.replace_order_stop_price(
                        stop_order_id, new_stop
                    )
                    # Alpaca creates a NEW order — update the ID
                    new_order_id = result.get("order_id")
                    if new_order_id and new_order_id != stop_order_id:
                        updated_state["stop_order_id"] = new_order_id

                    self.logger.info(
                        "trailing_stop_raised",
                        symbol=symbol,
                        old_stop=current_stop,
                        new_stop=new_stop,
                        tier=tier,
                        highest_close=round(highest_close, 2),
                    )

                    # Log risk event
                    tier_names = {
                        1: "breakeven",
                        2: "lock_profit",
                        3: "trailing",
                        4: "tight_trail",
                    }
                    event = RiskEvent(
                        event_type=RiskEventType.TRAILING_STOP,
                        severity="INFO",
                        symbol=symbol,
                        message=(
                            f"Trailing stop raised: {symbol} "
                            f"${current_stop:.2f} → ${new_stop:.2f} "
                            f"(tier {tier}: {tier_names.get(tier, 'unknown')})"
                        ),
                        portfolio_value=None,
                        action_taken=(
                            f"Stop order replaced: {stop_order_id} → "
                            f"{updated_state['stop_order_id']}"
                        ),
                    )
                    self._db.insert_risk_event(event.model_dump(mode="json"))

                    updates.append({
                        "symbol": symbol,
                        "old_stop": current_stop,
                        "new_stop": new_stop,
                        "tier": tier,
                        "tier_name": tier_names.get(tier, "unknown"),
                        "highest_close": round(highest_close, 2),
                    })

                except Exception as e:
                    self.logger.error(
                        "trailing_stop_replace_failed",
                        symbol=symbol,
                        order_id=stop_order_id,
                        error=str(e),
                    )
                    # Recovery: stop order may have changed after a partial fill.
                    # Search for a new valid stop order for this symbol and relink.
                    try:
                        orders = self._alpaca.get_orders(status="open")
                        for o in orders:
                            if o.get("symbol") == symbol and o.get("type") == "stop":
                                new_found_id = o.get("order_id")
                                if new_found_id and new_found_id != stop_order_id:
                                    updated_state["stop_order_id"] = new_found_id
                                    self.logger.info(
                                        "trailing_stop_order_relinked",
                                        symbol=symbol,
                                        old_order_id=stop_order_id,
                                        new_order_id=new_found_id,
                                        reason="recovered_after_partial_fill",
                                    )
                                break
                    except Exception:
                        pass

            # Save state (even if order replace failed — we still track highest_close)
            self._db.upsert_trailing_stop_state(updated_state)

        return updates

    def _bootstrap_trailing_stop(self, pos: dict) -> dict | None:
        """Bootstrap trailing stop state for a pre-existing position.

        Computes ATR from current market data and finds the stop order ID
        from Alpaca open orders.
        """
        symbol = pos["symbol"]
        entry_price = pos["avg_entry_price"]

        # Compute ATR from current market data
        try:
            bars = self._alpaca.get_bars([symbol], timeframe="1Day", days_back=30)
            if symbol not in bars or len(bars[symbol]) < 14:
                self.logger.warning(
                    "bootstrap_insufficient_data", symbol=symbol
                )
                return None
            df = bars[symbol]
            atr = calculate_atr(df["high"], df["low"], df["close"], period=14)
        except Exception as e:
            self.logger.warning(
                "bootstrap_atr_failed", symbol=symbol, error=str(e)
            )
            return None

        # Find stop order ID from Alpaca open orders
        stop_order_id = None
        existing_stop_price = None
        try:
            orders = self._alpaca.get_orders(status="open")
            for o in orders:
                if o.get("symbol") == symbol and o.get("type") == "stop":
                    stop_order_id = o.get("order_id")
                    existing_stop_price = o.get("stop_price")
                    break
        except Exception:
            pass

        current_price = float(pos["current_price"] or entry_price)

        # Use existing Alpaca stop price if available, otherwise estimate
        if existing_stop_price:
            original_stop = float(existing_stop_price)
        else:
            original_stop = round(entry_price - 2.5 * atr, 2)

        # Sanity check: for a long position, stop must be BELOW current price.
        # If stop >= current_price the bracket would trigger immediately — data anomaly.
        # Fall back to a standard 5% stop below current price.
        if original_stop >= current_price:
            fallback_stop = round(current_price * 0.95, 2)
            self.logger.critical(
                "trailing_stop_bootstrap_anomaly",
                symbol=symbol,
                entry_price=entry_price,
                atr=round(atr, 4),
                bad_stop=original_stop,
                current_price=current_price,
                fallback_stop=fallback_stop,
                reason="stop_price >= current_price — likely stale entry_price data",
            )
            original_stop = fallback_stop

        state = {
            "symbol": symbol,
            "entry_price": round(entry_price, 4),
            "atr_at_entry": round(atr, 4),
            "highest_close": round(max(current_price, entry_price), 4),
            "current_stop_price": original_stop,
            "original_stop_price": original_stop,
            "stop_order_id": stop_order_id,
            "take_profit_price": None,
            "tier_reached": 0,
        }
        self._db.upsert_trailing_stop_state(state)
        self.logger.info(
            "trailing_stop_bootstrapped",
            symbol=symbol,
            atr=round(atr, 4),
            entry_price=entry_price,
            stop_price=original_stop,
            stop_order_id=stop_order_id,
        )
        return state

    def _cleanup_trailing_stop_state(self) -> int:
        """Remove trailing stop state for symbols no longer in portfolio.

        Guards against premature cleanup when a SELL is partially_filled:
        if there's still an open order for the symbol, the position is not
        fully settled yet, so we preserve the trailing stop state to keep
        the residual position protected.
        """
        raw_positions = self._alpaca.get_positions()
        current_symbols = {p["symbol"] for p in raw_positions}

        # Check for pending orders — a partially_filled SELL may temporarily
        # remove the position from get_positions() while it still partially exists.
        pending_symbols: set[str] = set()
        try:
            open_orders = self._alpaca.get_orders(status="open")
            pending_symbols = {o.get("symbol") for o in open_orders if o.get("symbol")}
        except Exception as e:
            self.logger.warning("cleanup_open_orders_fetch_failed", error=str(e))

        all_states = self._db.get_all_trailing_stop_states()
        cleaned = 0
        for state in all_states:
            symbol = state["symbol"]
            if symbol not in current_symbols and symbol not in pending_symbols:
                # --- Calcola exit price e P&L dalla chiusura ---
                entry_price = state.get("entry_price")
                exit_price: float | None = None
                pnl: float | None = None
                pnl_pct: float | None = None
                try:
                    recent_orders = self._alpaca.get_orders(status="all")
                    sell_order = next(
                        (
                            o for o in recent_orders
                            if o.get("symbol") == symbol
                            and o.get("side") == "sell"
                            and o.get("filled_avg_price")
                        ),
                        None,
                    )
                    if sell_order:
                        exit_price = float(sell_order["filled_avg_price"])
                        qty = float(sell_order.get("qty") or sell_order.get("filled_qty") or 0)
                        if entry_price and qty:
                            pnl = round((exit_price - entry_price) * qty, 2)
                            pnl_pct = round((exit_price - entry_price) / entry_price * 100, 2)
                except Exception as e:
                    self.logger.warning("position_close_pnl_fetch_failed", symbol=symbol, error=str(e))

                self._db.delete_trailing_stop_state(symbol)
                self.logger.info(
                    "trailing_stop_cleaned",
                    symbol=symbol,
                    reason="position_closed",
                    entry_price=entry_price,
                    exit_price=exit_price,
                    pnl=pnl,
                    pnl_pct=pnl_pct,
                    outcome="WIN" if (pnl or 0) > 0 else "LOSS" if (pnl or 0) < 0 else "FLAT",
                )
                cleaned += 1
            elif symbol not in current_symbols and symbol in pending_symbols:
                self.logger.info(
                    "trailing_stop_preserved",
                    symbol=symbol,
                    reason="open_order_still_pending — partial fill in progress",
                )
        return cleaned

    # ─── Helpers ──────────────────────────────────────────────

    @staticmethod
    def _build_positions(raw_positions: list[dict]) -> list[Position]:
        """Convert raw Alpaca position dicts into Position models.

        Note: current_price, unrealized_pl, unrealized_plpc can be None
        from Alpaca during pre-market / when market is closed.
        """
        return [
            Position(
                symbol=p["symbol"],
                qty=int(p["qty"]),
                avg_entry_price=float(p["avg_entry_price"] or 0),
                current_price=float(p["current_price"] or p["avg_entry_price"] or 0),
                market_value=float(p["market_value"] or 0),
                unrealized_pnl=float(p["unrealized_pl"] or 0),
                unrealized_pnl_pct=float(p["unrealized_plpc"] or 0) * 100,
            )
            for p in raw_positions
        ]

    # ─── P&L Calculations ────────────────────────────────────

    @staticmethod
    def _calc_daily_pnl(
        snapshots: list[dict], current_value: float
    ) -> tuple[float, float]:
        """Calculate daily P&L in $ and %."""
        if not snapshots:
            return 0.0, 0.0
        yesterday_value = snapshots[0].get("portfolio_value", current_value)
        if yesterday_value == 0:
            return 0.0, 0.0
        pnl = current_value - yesterday_value
        pnl_pct = (pnl / yesterday_value) * 100
        return round(pnl, 2), round(pnl_pct, 2)

    @staticmethod
    def _calc_weekly_pnl(snapshots: list[dict], current_value: float) -> float:
        """Calculate weekly P&L %."""
        if len(snapshots) < 5:
            return 0.0
        week_ago = snapshots[4].get("portfolio_value", current_value)
        if week_ago == 0:
            return 0.0
        return round(((current_value - week_ago) / week_ago) * 100, 2)

    @staticmethod
    def _calc_max_drawdown(snapshots: list[dict], current_value: float) -> float:
        """Calculate max drawdown from peak (last 30 days)."""
        if not snapshots:
            return 0.0
        values = [s.get("portfolio_value", 0) for s in snapshots] + [current_value]
        peak = max(values)
        if peak == 0:
            return 0.0
        drawdown = ((current_value - peak) / peak) * 100
        return round(min(drawdown, 0), 2)

    @staticmethod
    def _calc_sharpe(snapshots: list[dict]) -> float | None:
        """Calculate rolling 30-day Sharpe ratio."""
        if len(snapshots) < 10:
            return None

        values = [s.get("portfolio_value", 0) for s in reversed(snapshots)]
        if len(values) < 2:
            return None

        returns = []
        for i in range(1, len(values)):
            if values[i - 1] > 0:
                daily_return = (values[i] - values[i - 1]) / values[i - 1]
                returns.append(daily_return)

        if not returns:
            return None

        avg_return = sum(returns) / len(returns)
        if len(returns) > 1:
            variance = sum((r - avg_return) ** 2 for r in returns) / (len(returns) - 1)
            std_return = variance ** 0.5
        else:
            std_return = 0

        if std_return == 0:
            return None

        # Annualize (252 trading days)
        sharpe = (avg_return / std_return) * (252 ** 0.5)
        return round(sharpe, 2)

    def _calc_win_rate(self) -> float | None:
        """Calculate win rate from closed orders."""
        orders = self._alpaca.get_orders(status="closed")
        if not orders:
            return None
        wins = sum(1 for o in orders if float(o.get("filled_avg_price") or 0) > 0)
        total = len(orders)
        if total == 0:
            return None
        return round(wins / total, 2)

    # ─── Alerts ───────────────────────────────────────────────

    def _generate_alerts(self, snapshot: PortfolioSnapshot) -> list[RiskEvent]:
        """Generate warning alerts based on portfolio snapshot."""
        alerts: list[RiskEvent] = []

        # Daily loss warning (at 50% of kill switch threshold)
        warning_daily = self._risk.max_daily_loss_pct * 0.5
        if snapshot.daily_pnl_pct <= warning_daily:
            alerts.append(
                RiskEvent(
                    event_type=RiskEventType.WARNING,
                    severity="WARNING",
                    message=f"Daily P&L warning: {snapshot.daily_pnl_pct:.2f}% (kill switch at {self._risk.max_daily_loss_pct}%)",
                    portfolio_value=snapshot.portfolio_value,
                    daily_pnl_pct=snapshot.daily_pnl_pct,
                )
            )

        # Weekly loss warning
        warning_weekly = self._risk.max_weekly_loss_pct * 0.5
        if snapshot.weekly_pnl_pct <= warning_weekly:
            alerts.append(
                RiskEvent(
                    event_type=RiskEventType.WARNING,
                    severity="WARNING",
                    message=f"Weekly P&L warning: {snapshot.weekly_pnl_pct:.2f}% (kill switch at {self._risk.max_weekly_loss_pct}%)",
                    portfolio_value=snapshot.portfolio_value,
                    weekly_pnl_pct=snapshot.weekly_pnl_pct,
                )
            )

        # Max drawdown warning
        if snapshot.max_drawdown_pct < -10.0:
            alerts.append(
                RiskEvent(
                    event_type=RiskEventType.WARNING,
                    severity="WARNING",
                    message=f"Drawdown warning: {snapshot.max_drawdown_pct:.2f}%",
                    portfolio_value=snapshot.portfolio_value,
                )
            )

        # Log alerts to DB
        for alert in alerts:
            self._db.insert_risk_event(alert.model_dump(mode="json"))

        return alerts
