"""
Risk Manager Agent

Validates trading signals against portfolio risk rules.
Gatekeeper: no order passes without approval.
Implements kill switch, position sizing, and correlation checks.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..config import get_settings, SECTOR_MAP
from ..connectors.alpaca_client import AlpacaClient
from ..models.signals import RiskDecision, RiskDecisionStatus, SignalAction
from ..models.portfolio import RiskEvent, RiskEventType
from ..utils.db import TradingDB
from .base import BaseAgent


class RiskManager(BaseAgent):
    """Validates signals and manages portfolio risk."""

    def __init__(self, account_type: str = "slope") -> None:
        super().__init__("risk_manager")
        self._alpaca = AlpacaClient(account_type=account_type)  # type: ignore[arg-type]
        self._db = TradingDB()
        self._risk = get_settings().risk

    async def run(self, signals: list[dict] | None = None, **kwargs: Any) -> dict:
        """
        Validate signals against risk rules.

        Args:
            signals: List of Signal dicts. If None, reads latest from DB.
        """
        if signals is None:
            trade_signals = self._db.get_latest_signals("trade", limit=1)
            if not trade_signals:
                self.log_error("No trade signals found")
                return {"decisions": [], "error": "No signals"}
            signals = trade_signals[0].get("data", {}).get("signals", [])

        self.log_start(signals_count=len(signals))

        # Get current portfolio state
        account = self._alpaca.get_account()
        positions = self._alpaca.get_positions()
        snapshots = self._db.get_snapshots(days=7)

        portfolio_value = account["portfolio_value"]
        cash = account["cash"]

        # Check kill switch conditions first
        kill_switch = self._check_kill_switch(snapshots, portfolio_value)
        if kill_switch:
            return kill_switch

        # Validate each signal
        decisions: list[dict] = []
        for signal_data in signals:
            decision = self._validate_signal(
                signal_data, portfolio_value, cash, positions
            )
            decisions.append(decision.model_dump(mode="json"))

            # Update cash for next validation (if approved BUY)
            if decision.status == RiskDecisionStatus.APPROVED and decision.position_value:
                cash -= decision.position_value

        # Save to DB
        result = {
            "date": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "decisions": decisions,
            "portfolio_status": {
                "portfolio_value": portfolio_value,
                "cash": cash,
                "positions_count": len(positions),
                "daily_pnl_pct": self._calc_daily_pnl(snapshots, portfolio_value),
                "weekly_pnl_pct": self._calc_weekly_pnl(snapshots, portfolio_value),
            },
        }
        self._db.insert_signal("risk_check", result)

        approved = sum(1 for d in decisions if d["status"] == "APPROVED")
        self.log_complete(total=len(decisions), approved=approved)
        return result

    def _check_kill_switch(
        self, snapshots: list[dict], current_value: float
    ) -> dict | None:
        """Check if kill switch should be triggered."""
        if not snapshots:
            return None

        # Daily P&L
        yesterday = snapshots[0] if snapshots else None
        if yesterday:
            yesterday_value = yesterday.get("portfolio_value", current_value)
            daily_pnl_pct = ((current_value - yesterday_value) / yesterday_value) * 100

            if daily_pnl_pct <= self._risk.max_daily_loss_pct:
                return self._trigger_kill_switch(
                    RiskEventType.KILL_SWITCH_DAILY,
                    f"Daily loss {daily_pnl_pct:.2f}% exceeds limit {self._risk.max_daily_loss_pct}%",
                    current_value,
                    daily_pnl_pct,
                )

        # Weekly P&L
        if len(snapshots) >= 5:
            week_ago_value = snapshots[4].get("portfolio_value", current_value)
            weekly_pnl_pct = ((current_value - week_ago_value) / week_ago_value) * 100

            if weekly_pnl_pct <= self._risk.max_weekly_loss_pct:
                return self._trigger_kill_switch(
                    RiskEventType.KILL_SWITCH_WEEKLY,
                    f"Weekly loss {weekly_pnl_pct:.2f}% exceeds limit {self._risk.max_weekly_loss_pct}%",
                    current_value,
                    weekly_pnl_pct=weekly_pnl_pct,
                )

        return None

    def _trigger_kill_switch(
        self,
        event_type: RiskEventType,
        message: str,
        portfolio_value: float,
        daily_pnl_pct: float | None = None,
        weekly_pnl_pct: float | None = None,
    ) -> dict:
        """Execute kill switch: close all positions, cancel orders, alert."""
        self.logger.critical("KILL_SWITCH", event_type=event_type, message=message)

        # Close everything
        self._alpaca.close_all_positions()

        # Log risk event
        event = RiskEvent(
            event_type=event_type,
            severity="CRITICAL",
            message=message,
            portfolio_value=portfolio_value,
            daily_pnl_pct=daily_pnl_pct,
            weekly_pnl_pct=weekly_pnl_pct,
            action_taken="KILL_SWITCH: All positions closed, all orders cancelled",
        )
        self._db.insert_risk_event(event.model_dump(mode="json"))

        return {
            "kill_switch": True,
            "event_type": event_type.value,
            "message": message,
            "decisions": [],
        }

    def _validate_signal(
        self,
        signal: dict,
        portfolio_value: float,
        cash: float,
        positions: list[dict],
    ) -> RiskDecision:
        """Validate a single signal against risk rules."""
        symbol = signal["symbol"]
        action = SignalAction(signal["action"])
        strategy = signal.get("strategy")  # Propagate strategy for traceability
        entry_price = signal["entry_price"]
        stop_loss = signal.get("stop_loss")
        take_profit = signal.get("take_profit")

        # SELL signals: close existing long position
        # Without position_size, executor silently skips the order (line 77)
        if action == SignalAction.SELL:
            open_position = next(
                (p for p in positions if p["symbol"] == symbol), None
            )
            if not open_position or open_position.get("qty", 0) <= 0:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason="No open position to sell",
                )
            return RiskDecision(
                symbol=symbol,
                action=action,
                strategy=strategy,
                status=RiskDecisionStatus.APPROVED,
                position_size=int(open_position["qty"]),
                reason=None,
            )

        # COVER signals: close existing short position (buy to cover)
        if action == SignalAction.COVER:
            open_position = next(
                (p for p in positions if p["symbol"] == symbol), None
            )
            if not open_position or open_position.get("qty", 0) >= 0:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason="No open short position to cover",
                )
            return RiskDecision(
                symbol=symbol,
                action=action,
                strategy=strategy,
                status=RiskDecisionStatus.APPROVED,
                position_size=abs(int(open_position["qty"])),
                reason=None,
            )

        # SHORT signals: open short position (sell without owning)
        if action == SignalAction.SHORT:
            if not self._risk.allow_short_selling:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason="Short selling disabled (set TRADING_RISK_ALLOW_SHORT_SELLING=true to enable)",
                )

            # Check if already holding long position (would be a sell, not short)
            for pos in positions:
                if pos["symbol"] == symbol and pos.get("qty", 0) > 0:
                    return RiskDecision(
                        symbol=symbol,
                        action=action,
                        status=RiskDecisionStatus.REJECTED,
                        reason=f"Already holding long {symbol} — use SELL to close first",
                    )

            # Check total short exposure
            short_value = sum(
                abs(p.get("market_value", 0))
                for p in positions
                if p.get("qty", 0) < 0
            )
            short_pct = (short_value / portfolio_value) * 100 if portfolio_value > 0 else 0
            if short_pct >= self._risk.max_short_exposure_pct:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason=f"Short exposure {short_pct:.1f}% exceeds limit {self._risk.max_short_exposure_pct}%",
                )

            # Position sizing for short (smaller limit — downside is theoretically unlimited)
            max_short_position_value = portfolio_value * (self._risk.max_short_position_pct / 100)
            if stop_loss and entry_price:
                risk_per_share = abs(stop_loss - entry_price)  # stop is ABOVE entry for shorts
                if risk_per_share > 0:
                    max_loss_per_trade = portfolio_value * 0.01
                    qty_by_risk = int(max_loss_per_trade / risk_per_share)
                else:
                    qty_by_risk = int(max_short_position_value / entry_price)
            else:
                qty_by_risk = int(max_short_position_value / entry_price)

            qty_by_max = int(max_short_position_value / entry_price)
            qty = min(qty_by_risk, qty_by_max)

            if qty <= 0:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason="Short position size too small or too risky",
                )

            # Check risk/reward for short (inverted: SL above entry, TP below entry)
            if stop_loss and take_profit and entry_price:
                risk = abs(stop_loss - entry_price)   # loss if price goes up
                reward = abs(entry_price - take_profit)  # gain if price goes down
                rr_ratio = reward / max(risk, 0.01)
                if rr_ratio < self._risk.min_risk_reward:
                    return RiskDecision(
                        symbol=symbol,
                        action=action,
                        status=RiskDecisionStatus.REJECTED,
                        reason=f"Short R/R {rr_ratio:.1f} below minimum {self._risk.min_risk_reward}",
                    )

            position_value = round(qty * entry_price, 2)
            portfolio_pct = round((position_value / portfolio_value) * 100, 1)

            return RiskDecision(
                symbol=symbol,
                action=action,
                strategy=strategy,
                status=RiskDecisionStatus.APPROVED,
                position_size=qty,
                position_value=position_value,
                portfolio_pct=portfolio_pct,
                stop_loss=stop_loss,
                take_profit=take_profit,
                atr=signal.get("atr"),
                entry_price=entry_price,
            )

        # --- Directional exposure check (BUY + SHORT) ---
        # Prevents portfolio from becoming too concentrated in one direction.
        # Uses max_directional_exposure_pct (default 60%): if the portfolio already
        # has 60%+ in long (or short), reject new signals in that same direction.
        long_value = sum(
            abs(p.get("market_value", 0))
            for p in positions
            if p.get("qty", 0) > 0
        )
        short_value = sum(
            abs(p.get("market_value", 0))
            for p in positions
            if p.get("qty", 0) < 0
        )
        total_invested = long_value + short_value
        if total_invested > 0 and portfolio_value > 0:
            long_pct = (long_value / portfolio_value) * 100
            short_pct = (short_value / portfolio_value) * 100
            max_dir_pct = self._risk.max_directional_exposure_pct

            if action == SignalAction.BUY and long_pct >= max_dir_pct:
                self.logger.warning(
                    "directional_exposure_rejected",
                    symbol=symbol,
                    action=action.value,
                    long_pct=round(long_pct, 1),
                    short_pct=round(short_pct, 1),
                    limit=max_dir_pct,
                )
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason=f"Long exposure {long_pct:.1f}% exceeds directional limit {max_dir_pct}% — portfolio too concentrated long",
                )
            if action == SignalAction.SHORT and short_pct >= max_dir_pct:
                self.logger.warning(
                    "directional_exposure_rejected",
                    symbol=symbol,
                    action=action.value,
                    long_pct=round(long_pct, 1),
                    short_pct=round(short_pct, 1),
                    limit=max_dir_pct,
                )
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason=f"Short exposure {short_pct:.1f}% exceeds directional limit {max_dir_pct}% — portfolio too concentrated short",
                )

        # --- BUY validation ---

        # Check max positions
        if len(positions) >= self._risk.max_positions:
            return RiskDecision(
                symbol=symbol,
                action=action,
                status=RiskDecisionStatus.REJECTED,
                reason=f"Max positions reached ({self._risk.max_positions})",
            )

        # Check if already holding this symbol
        for pos in positions:
            if pos["symbol"] == symbol:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason=f"Already holding {symbol}",
                )

        # Check sector concentration
        # Resolve sector from SECTOR_MAP (Alpaca positions don't carry sector metadata).
        # signal.get("sector") is a best-effort field from signal_generator; fall back
        # to SECTOR_MAP so the check always fires for known symbols.
        sector = SECTOR_MAP.get(symbol) or signal.get("sector")
        if sector:
            sector_value = sum(
                p.get("market_value", 0)
                for p in positions
                if SECTOR_MAP.get(p.get("symbol", ""), p.get("sector")) == sector
            )
            sector_pct = (sector_value / portfolio_value) * 100 if portfolio_value > 0 else 0
            sector_result = (
                "rejected"
                if sector_pct >= self._risk.max_sector_exposure_pct
                else "approved"
            )
            self.logger.info(
                "sector_exposure_check",
                symbol=symbol,
                sector=sector,
                current_pct=round(sector_pct, 2),
                limit_pct=self._risk.max_sector_exposure_pct,
                result=sector_result,
            )
            if sector_result == "rejected":
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason=f"Sector {sector} exposure {sector_pct:.1f}% exceeds limit {self._risk.max_sector_exposure_pct}%",
                )

        # Position sizing (half-Kelly, capped at max_position_pct)
        max_position_value = portfolio_value * (self._risk.max_position_pct / 100)
        max_loss_per_trade = portfolio_value * 0.01  # Max 1% of portfolio per trade

        if stop_loss and entry_price:
            risk_per_share = abs(entry_price - stop_loss)
            if risk_per_share > 0:
                qty_by_risk = int(max_loss_per_trade / risk_per_share)
            else:
                qty_by_risk = int(max_position_value / entry_price)
        else:
            qty_by_risk = int(max_position_value / entry_price)

        qty_by_max_position = int(max_position_value / entry_price)
        qty_by_cash = int(cash / entry_price)
        qty = min(qty_by_risk, qty_by_max_position, qty_by_cash)

        if qty <= 0:
            return RiskDecision(
                symbol=symbol,
                action=action,
                status=RiskDecisionStatus.REJECTED,
                reason="Insufficient cash or position too risky",
            )

        position_value = round(qty * entry_price, 2)
        portfolio_pct = round((position_value / portfolio_value) * 100, 1)

        # Check risk/reward ratio
        if stop_loss and take_profit and entry_price:
            risk = abs(entry_price - stop_loss)
            reward = abs(take_profit - entry_price)
            rr_ratio = reward / max(risk, 0.01)
            if rr_ratio < self._risk.min_risk_reward:
                return RiskDecision(
                    symbol=symbol,
                    action=action,
                    status=RiskDecisionStatus.REJECTED,
                    reason=f"Risk/reward {rr_ratio:.1f} below minimum {self._risk.min_risk_reward}",
                )

        # ── News risk adjustment ─────────────────────────────────────────────
        # Halve position size when breaking news is detected (flagged by signal generator).
        # News-driven volatility can invalidate slope signals — smaller size = less damage.
        if signal.get("news_risk", False):
            original_size = qty
            qty = max(1, qty // 2)
            position_value = qty * entry_price
            portfolio_pct = (position_value / portfolio_value) * 100
            self.logger.warning(
                "risk_news_size_reduction",
                symbol=symbol,
                original_shares=original_size,
                reduced_shares=qty,
                headline=str(signal.get("news_headline", ""))[:80],
            )

        return RiskDecision(
            symbol=symbol,
            action=action,
            strategy=strategy,
            status=RiskDecisionStatus.APPROVED,
            position_size=qty,
            position_value=position_value,
            portfolio_pct=portfolio_pct,
            stop_loss=stop_loss,
            take_profit=take_profit,
            atr=signal.get("atr"),  # Pass through for trailing stop
            entry_price=entry_price,  # Pass through for trailing stop
        )

    @staticmethod
    def _calc_daily_pnl(snapshots: list[dict], current_value: float) -> float:
        """Calculate daily P&L %."""
        if not snapshots:
            return 0.0
        yesterday_value = snapshots[0].get("portfolio_value", current_value)
        if yesterday_value == 0:
            return 0.0
        return round(((current_value - yesterday_value) / yesterday_value) * 100, 2)

    @staticmethod
    def _calc_weekly_pnl(snapshots: list[dict], current_value: float) -> float:
        """Calculate weekly P&L %."""
        if len(snapshots) < 5:
            return 0.0
        week_ago = snapshots[4].get("portfolio_value", current_value)
        if week_ago == 0:
            return 0.0
        return round(((current_value - week_ago) / week_ago) * 100, 2)
