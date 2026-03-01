"""
Portfolio Monitor Agent

Monitors portfolio health with 3 operational modes:
- status: Quick portfolio status snapshot
- daily_report: End-of-day P&L report with snapshot persistence
- check_stops: Enforce stop-loss levels on open positions

Generates risk events and alerts when thresholds are breached.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

import pandas as pd

from ..config import get_settings
from ..connectors.alpaca_client import AlpacaClient
from ..models.portfolio import PortfolioSnapshot, Position, RiskEvent, RiskEventType
from ..utils.db import TradingDB
from .base import BaseAgent


MonitorMode = Literal["status", "daily_report", "check_stops"]


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

        portfolio_value = account["portfolio_value"]
        cash = account["cash"]
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
        portfolio_value = account["portfolio_value"]

        stop_events: list[dict] = []

        for p in raw_positions:
            symbol = p["symbol"]
            unrealized_pnl_pct = p["unrealized_plpc"] * 100
            current_price = p["current_price"]

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

    # ─── Helpers ──────────────────────────────────────────────

    @staticmethod
    def _build_positions(raw_positions: list[dict]) -> list[Position]:
        """Convert raw Alpaca position dicts into Position models."""
        return [
            Position(
                symbol=p["symbol"],
                qty=p["qty"],
                avg_entry_price=p["avg_entry_price"],
                current_price=p["current_price"],
                market_value=p["market_value"],
                unrealized_pnl=p["unrealized_pl"],
                unrealized_pnl_pct=p["unrealized_plpc"] * 100,
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
        wins = sum(1 for o in orders if float(o.get("filled_avg_price", 0)) > 0)
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
