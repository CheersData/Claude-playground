"""
Tests for trading system Pydantic models.

Covers validation, defaults, computed properties, and edge cases
for models in src/models/ (signals, orders, portfolio).
"""

from __future__ import annotations

from datetime import datetime

import pytest
from pydantic import ValidationError

from src.models.signals import (
    ScanResult,
    Signal,
    SignalAction,
    SignalType,
    RiskDecision,
    RiskDecisionStatus,
)
from src.models.orders import (
    Order,
    OrderSide,
    OrderType,
    OrderStatus,
)
from src.models.portfolio import (
    Position,
    PortfolioSnapshot,
    RiskEvent,
    RiskEventType,
)


# ─── ScanResult ──────────────────────────────────────────────


class TestScanResult:
    """Tests for the ScanResult model."""

    def test_valid_scan_result(self) -> None:
        result = ScanResult(
            symbol="AAPL",
            score=0.85,
            trend="bullish",
            atr_pct=2.5,
            avg_volume=5_000_000,
            current_price=175.50,
        )
        assert result.symbol == "AAPL"
        assert result.score == 0.85
        assert result.trend == "bullish"
        assert result.sector is None  # default

    def test_scan_result_with_sector(self) -> None:
        result = ScanResult(
            symbol="XOM",
            score=0.6,
            trend="neutral",
            atr_pct=1.8,
            avg_volume=2_000_000,
            current_price=105.0,
            sector="Energy",
        )
        assert result.sector == "Energy"

    def test_score_bounds_low(self) -> None:
        with pytest.raises(ValidationError):
            ScanResult(
                symbol="BAD",
                score=-0.1,
                trend="neutral",
                atr_pct=1.0,
                avg_volume=100_000,
                current_price=10.0,
            )

    def test_score_bounds_high(self) -> None:
        with pytest.raises(ValidationError):
            ScanResult(
                symbol="BAD",
                score=1.1,
                trend="neutral",
                atr_pct=1.0,
                avg_volume=100_000,
                current_price=10.0,
            )

    def test_score_boundary_values(self) -> None:
        low = ScanResult(
            symbol="A", score=0.0, trend="neutral", atr_pct=1.0,
            avg_volume=100_000, current_price=10.0,
        )
        high = ScanResult(
            symbol="B", score=1.0, trend="bullish", atr_pct=1.0,
            avg_volume=100_000, current_price=10.0,
        )
        assert low.score == 0.0
        assert high.score == 1.0


# ─── Signal ──────────────────────────────────────────────────


class TestSignal:
    """Tests for the Signal model."""

    def test_valid_buy_signal(self) -> None:
        signal = Signal(
            symbol="NVDA",
            action=SignalAction.BUY,
            confidence=0.8,
            score=0.65,
            entry_price=450.0,
            stop_loss=430.0,
            take_profit=490.0,
            rationale="MACD bullish crossover + strong uptrend",
        )
        assert signal.action == SignalAction.BUY
        assert signal.confidence == 0.8

    def test_valid_sell_signal(self) -> None:
        signal = Signal(
            symbol="META",
            action=SignalAction.SELL,
            confidence=0.7,
            score=-0.6,
            entry_price=500.0,
            stop_loss=520.0,
            take_profit=460.0,
            rationale="RSI overbought",
        )
        assert signal.action == SignalAction.SELL
        assert signal.score == -0.6

    def test_risk_reward_ratio(self) -> None:
        signal = Signal(
            symbol="AAPL",
            action=SignalAction.BUY,
            confidence=0.75,
            score=0.55,
            entry_price=175.0,
            stop_loss=170.0,
            take_profit=185.0,
            rationale="test",
        )
        # Risk = 5, Reward = 10 -> R/R = 2.0
        assert signal.risk_reward_ratio == 2.0

    def test_risk_reward_zero_risk(self) -> None:
        signal = Signal(
            symbol="AAPL",
            action=SignalAction.BUY,
            confidence=0.5,
            score=0.5,
            entry_price=100.0,
            stop_loss=100.0,  # Same as entry
            take_profit=110.0,
            rationale="test",
        )
        assert signal.risk_reward_ratio == 0

    def test_created_at_default(self) -> None:
        signal = Signal(
            symbol="TEST",
            action=SignalAction.BUY,
            confidence=0.6,
            score=0.5,
            entry_price=50.0,
            stop_loss=48.0,
            take_profit=54.0,
            rationale="test",
        )
        assert isinstance(signal.created_at, datetime)

    def test_confidence_validation(self) -> None:
        with pytest.raises(ValidationError):
            Signal(
                symbol="BAD",
                action=SignalAction.BUY,
                confidence=1.5,
                score=0.5,
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                rationale="test",
            )

    def test_score_validation_bounds(self) -> None:
        with pytest.raises(ValidationError):
            Signal(
                symbol="BAD",
                action=SignalAction.BUY,
                confidence=0.5,
                score=1.5,  # exceeds 1.0
                entry_price=100.0,
                stop_loss=95.0,
                take_profit=110.0,
                rationale="test",
            )


# ─── SignalAction / SignalType enums ─────────────────────────


class TestSignalEnums:
    """Tests for signal-related enums."""

    def test_signal_actions(self) -> None:
        assert SignalAction.BUY == "BUY"
        assert SignalAction.SELL == "SELL"
        assert SignalAction.HOLD == "HOLD"

    def test_signal_types(self) -> None:
        assert SignalType.SCAN == "scan"
        assert SignalType.TRADE == "trade"
        assert SignalType.RISK_CHECK == "risk_check"


# ─── RiskDecision ────────────────────────────────────────────


class TestRiskDecision:
    """Tests for the RiskDecision model."""

    def test_approved_decision(self) -> None:
        decision = RiskDecision(
            symbol="AAPL",
            action=SignalAction.BUY,
            status=RiskDecisionStatus.APPROVED,
            position_size=50,
            position_value=8750.0,
            portfolio_pct=8.75,
            stop_loss=170.0,
            take_profit=185.0,
        )
        assert decision.status == RiskDecisionStatus.APPROVED
        assert decision.position_size == 50

    def test_rejected_decision(self) -> None:
        decision = RiskDecision(
            symbol="TSLA",
            action=SignalAction.BUY,
            status=RiskDecisionStatus.REJECTED,
            reason="Max positions reached (10)",
        )
        assert decision.status == RiskDecisionStatus.REJECTED
        assert decision.reason is not None
        assert decision.position_size is None

    def test_decision_defaults(self) -> None:
        decision = RiskDecision(
            symbol="MSFT",
            action=SignalAction.SELL,
            status=RiskDecisionStatus.APPROVED,
        )
        assert decision.position_size is None
        assert decision.position_value is None
        assert decision.portfolio_pct is None
        assert decision.reason is None
        assert isinstance(decision.created_at, datetime)


# ─── Order ───────────────────────────────────────────────────


class TestOrder:
    """Tests for the Order model."""

    def test_valid_order(self) -> None:
        order = Order(
            alpaca_order_id="abc-123",
            symbol="GOOGL",
            side=OrderSide.BUY,
            qty=10,
            order_type=OrderType.MARKET,
            status=OrderStatus.FILLED,
            filled_avg_price=140.50,
            filled_qty=10,
            stop_loss=135.0,
            take_profit=150.0,
        )
        assert order.symbol == "GOOGL"
        assert order.side == OrderSide.BUY
        assert order.status == OrderStatus.FILLED

    def test_order_defaults(self) -> None:
        order = Order(
            symbol="SPY",
            side=OrderSide.BUY,
            qty=100,
            order_type=OrderType.MARKET,
        )
        assert order.alpaca_order_id is None
        assert order.status == OrderStatus.PENDING
        assert order.limit_price is None
        assert order.stop_price is None
        assert order.filled_avg_price is None
        assert order.filled_qty is None
        assert order.filled_at is None
        assert order.stop_loss is None
        assert order.take_profit is None
        assert order.commission == 0.0
        assert order.error_message is None
        assert isinstance(order.created_at, datetime)

    def test_order_enums(self) -> None:
        assert OrderSide.BUY == "buy"
        assert OrderSide.SELL == "sell"
        assert OrderType.MARKET == "market"
        assert OrderType.BRACKET == "bracket"
        assert OrderStatus.FILLED == "filled"
        assert OrderStatus.REJECTED == "rejected"

    def test_bracket_order(self) -> None:
        order = Order(
            symbol="NVDA",
            side=OrderSide.BUY,
            qty=20,
            order_type=OrderType.BRACKET,
            stop_loss=430.0,
            take_profit=490.0,
        )
        assert order.order_type == OrderType.BRACKET
        assert order.stop_loss == 430.0
        assert order.take_profit == 490.0

    def test_failed_order(self) -> None:
        order = Order(
            symbol="BAD",
            side=OrderSide.BUY,
            qty=1,
            order_type=OrderType.MARKET,
            status=OrderStatus.REJECTED,
            error_message="Insufficient buying power",
        )
        assert order.status == OrderStatus.REJECTED
        assert order.error_message == "Insufficient buying power"


# ─── Position ────────────────────────────────────────────────


class TestPosition:
    """Tests for the Position model."""

    def test_valid_position(self) -> None:
        pos = Position(
            symbol="AAPL",
            qty=100,
            avg_entry_price=170.0,
            current_price=175.0,
            market_value=17500.0,
            unrealized_pnl=500.0,
            unrealized_pnl_pct=2.94,
        )
        assert pos.symbol == "AAPL"
        assert pos.qty == 100

    def test_cost_basis_property(self) -> None:
        pos = Position(
            symbol="MSFT",
            qty=50,
            avg_entry_price=400.0,
            current_price=410.0,
            market_value=20500.0,
            unrealized_pnl=500.0,
            unrealized_pnl_pct=2.5,
        )
        assert pos.cost_basis == 50 * 400.0

    def test_position_defaults(self) -> None:
        pos = Position(
            symbol="TEST",
            qty=1,
            avg_entry_price=10.0,
            current_price=10.0,
            market_value=10.0,
            unrealized_pnl=0.0,
            unrealized_pnl_pct=0.0,
        )
        assert pos.sector is None
        assert pos.days_held == 0


# ─── PortfolioSnapshot ───────────────────────────────────────


class TestPortfolioSnapshot:
    """Tests for the PortfolioSnapshot model."""

    def test_valid_snapshot(self) -> None:
        snapshot = PortfolioSnapshot(
            date="2026-03-01",
            portfolio_value=100000.0,
            cash=25000.0,
            positions_value=75000.0,
            daily_pnl=500.0,
            daily_pnl_pct=0.5,
            weekly_pnl_pct=1.2,
            max_drawdown_pct=-2.5,
            sharpe_30d=1.8,
            win_rate=0.65,
            positions_count=5,
        )
        assert snapshot.portfolio_value == 100000.0
        assert snapshot.positions_count == 5

    def test_snapshot_defaults(self) -> None:
        snapshot = PortfolioSnapshot(
            date="2026-03-01",
            portfolio_value=50000.0,
            cash=50000.0,
            positions_value=0.0,
            daily_pnl=0.0,
            daily_pnl_pct=0.0,
            weekly_pnl_pct=0.0,
            max_drawdown_pct=0.0,
            positions_count=0,
        )
        assert snapshot.sharpe_30d is None
        assert snapshot.win_rate is None
        assert snapshot.positions == []
        assert isinstance(snapshot.created_at, datetime)

    def test_snapshot_with_positions(self) -> None:
        pos = Position(
            symbol="AAPL",
            qty=100,
            avg_entry_price=170.0,
            current_price=175.0,
            market_value=17500.0,
            unrealized_pnl=500.0,
            unrealized_pnl_pct=2.94,
        )
        snapshot = PortfolioSnapshot(
            date="2026-03-01",
            portfolio_value=100000.0,
            cash=82500.0,
            positions_value=17500.0,
            daily_pnl=500.0,
            daily_pnl_pct=0.5,
            weekly_pnl_pct=1.2,
            max_drawdown_pct=-1.0,
            positions_count=1,
            positions=[pos],
        )
        assert len(snapshot.positions) == 1
        assert snapshot.positions[0].symbol == "AAPL"


# ─── RiskEvent ───────────────────────────────────────────────


class TestRiskEvent:
    """Tests for the RiskEvent model."""

    def test_kill_switch_event(self) -> None:
        event = RiskEvent(
            event_type=RiskEventType.KILL_SWITCH_DAILY,
            severity="CRITICAL",
            message="Daily loss -3.5% exceeds limit -2.0%",
            portfolio_value=96500.0,
            daily_pnl_pct=-3.5,
            action_taken="KILL_SWITCH: All positions closed",
        )
        assert event.event_type == RiskEventType.KILL_SWITCH_DAILY
        assert event.severity == "CRITICAL"

    def test_stop_loss_event(self) -> None:
        event = RiskEvent(
            event_type=RiskEventType.STOP_LOSS,
            severity="WARNING",
            symbol="TSLA",
            message="Stop loss triggered at -5.2%",
            action_taken="Position closed",
        )
        assert event.symbol == "TSLA"

    def test_warning_event(self) -> None:
        event = RiskEvent(
            event_type=RiskEventType.WARNING,
            severity="INFO",
            message="Strong day: +2.1%",
            daily_pnl_pct=2.1,
        )
        assert event.event_type == RiskEventType.WARNING

    def test_risk_event_defaults(self) -> None:
        event = RiskEvent(
            event_type=RiskEventType.WARNING,
            severity="INFO",
            message="Test event",
        )
        assert event.symbol is None
        assert event.portfolio_value is None
        assert event.daily_pnl_pct is None
        assert event.weekly_pnl_pct is None
        assert event.action_taken is None
        assert isinstance(event.created_at, datetime)

    def test_risk_event_types(self) -> None:
        assert RiskEventType.KILL_SWITCH_DAILY == "KILL_SWITCH_DAILY"
        assert RiskEventType.KILL_SWITCH_WEEKLY == "KILL_SWITCH_WEEKLY"
        assert RiskEventType.STOP_LOSS == "STOP_LOSS"
        assert RiskEventType.TAKE_PROFIT == "TAKE_PROFIT"
        assert RiskEventType.WARNING == "WARNING"
        assert RiskEventType.CONNECTION_LOST == "CONNECTION_LOST"


# ─── Model serialization ────────────────────────────────────


class TestSerialization:
    """Tests for model_dump / JSON serialization."""

    def test_signal_json_roundtrip(self) -> None:
        signal = Signal(
            symbol="AAPL",
            action=SignalAction.BUY,
            confidence=0.8,
            score=0.6,
            entry_price=175.0,
            stop_loss=170.0,
            take_profit=185.0,
            rationale="test signal",
        )
        data = signal.model_dump(mode="json")
        assert isinstance(data, dict)
        assert data["symbol"] == "AAPL"
        assert data["action"] == "BUY"
        assert isinstance(data["created_at"], str)

        # Reconstruct
        rebuilt = Signal(**data)
        assert rebuilt.symbol == signal.symbol
        assert rebuilt.action == signal.action

    def test_order_json_roundtrip(self) -> None:
        order = Order(
            symbol="SPY",
            side=OrderSide.BUY,
            qty=100,
            order_type=OrderType.MARKET,
        )
        data = order.model_dump(mode="json")
        assert data["side"] == "buy"
        assert data["order_type"] == "market"

        rebuilt = Order(**data)
        assert rebuilt.symbol == order.symbol

    def test_risk_decision_json_roundtrip(self) -> None:
        decision = RiskDecision(
            symbol="NVDA",
            action=SignalAction.BUY,
            status=RiskDecisionStatus.APPROVED,
            position_size=30,
            position_value=13500.0,
            portfolio_pct=13.5,
        )
        data = decision.model_dump(mode="json")
        assert data["status"] == "APPROVED"

        rebuilt = RiskDecision(**data)
        assert rebuilt.position_size == 30
