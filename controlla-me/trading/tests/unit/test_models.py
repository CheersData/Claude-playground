"""Tests for trading data models."""

import pytest
from src.models.signals import Signal, SignalAction, ScanResult, RiskDecision, RiskDecisionStatus
from src.models.orders import Order, OrderSide, OrderType, OrderStatus
from src.models.portfolio import Position, PortfolioSnapshot, RiskEvent, RiskEventType


class TestScanResult:
    def test_create_scan_result(self):
        result = ScanResult(
            symbol="AAPL",
            score=0.85,
            trend="bullish",
            atr_pct=2.1,
            avg_volume=65_000_000,
            current_price=185.50,
        )
        assert result.symbol == "AAPL"
        assert result.score == 0.85
        assert result.trend == "bullish"

    def test_score_bounds(self):
        with pytest.raises(Exception):
            ScanResult(
                symbol="AAPL", score=1.5, trend="bullish",
                atr_pct=2.0, avg_volume=1000, current_price=100.0,
            )


class TestSignal:
    def test_risk_reward_ratio(self):
        signal = Signal(
            symbol="AAPL",
            action=SignalAction.BUY,
            confidence=0.78,
            score=0.72,
            entry_price=185.50,
            stop_loss=176.23,
            take_profit=203.05,
            rationale="Test signal",
        )
        rr = signal.risk_reward_ratio
        assert rr > 1.5  # reward > risk

    def test_zero_risk_ratio(self):
        signal = Signal(
            symbol="AAPL",
            action=SignalAction.BUY,
            confidence=0.5,
            score=0.5,
            entry_price=100.0,
            stop_loss=100.0,  # Same as entry = 0 risk
            take_profit=110.0,
            rationale="Test",
        )
        assert signal.risk_reward_ratio == 0


class TestRiskDecision:
    def test_approved(self):
        decision = RiskDecision(
            symbol="AAPL",
            action=SignalAction.BUY,
            status=RiskDecisionStatus.APPROVED,
            position_size=50,
            position_value=9275.0,
            portfolio_pct=8.5,
        )
        assert decision.status == RiskDecisionStatus.APPROVED
        assert decision.reason is None

    def test_rejected(self):
        decision = RiskDecision(
            symbol="TSLA",
            action=SignalAction.BUY,
            status=RiskDecisionStatus.REJECTED,
            reason="Max positions reached",
        )
        assert decision.status == RiskDecisionStatus.REJECTED
        assert "Max positions" in decision.reason


class TestPosition:
    def test_cost_basis(self):
        pos = Position(
            symbol="AAPL",
            qty=50,
            avg_entry_price=185.42,
            current_price=188.10,
            market_value=9405.0,
            unrealized_pnl=134.0,
            unrealized_pnl_pct=1.44,
        )
        assert pos.cost_basis == 50 * 185.42


class TestRiskEvent:
    def test_kill_switch_event(self):
        event = RiskEvent(
            event_type=RiskEventType.KILL_SWITCH_DAILY,
            severity="CRITICAL",
            message="Daily loss -2.5% exceeds -2% limit",
            portfolio_value=97500.0,
            daily_pnl_pct=-2.5,
            action_taken="All positions closed",
        )
        assert event.severity == "CRITICAL"
        assert event.event_type == RiskEventType.KILL_SWITCH_DAILY
