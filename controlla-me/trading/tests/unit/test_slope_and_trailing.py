"""
Tests for slope+volume signal generator and trailing stop state machine.
Also covers SHORT/COVER signal actions added in Piano #2.
"""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from src.analysis import analyze_slope_volume
from src.models.signals import RiskDecision, RiskDecisionStatus, SignalAction


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ohlcv(
    closes: list[float],
    volume_multiplier: float = 2.0,
    base_volume: int = 1_000_000,
    freq: str = "5min",
    start: str = "2024-01-15 15:00",  # UTC — within market hours 14:30-20:00
) -> pd.DataFrame:
    """Build a minimal OHLCV DataFrame with a tz-aware UTC DatetimeIndex."""
    n = len(closes)
    idx = pd.date_range(start=start, periods=n, freq=freq, tz="UTC")
    closes_arr = np.array(closes, dtype=float)
    # Simple OHLC: open = prev close, high = close + 0.5, low = close - 0.5
    opens = np.roll(closes_arr, 1)
    opens[0] = closes_arr[0]
    highs = closes_arr + 0.5
    lows = closes_arr - 0.5
    # Last bar has elevated volume to trigger confirmation
    volumes = np.full(n, base_volume, dtype=float)
    volumes[-1] = base_volume * volume_multiplier
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes_arr, "volume": volumes},
        index=idx,
    )


# ---------------------------------------------------------------------------
# analyze_slope_volume — signal generation
# ---------------------------------------------------------------------------

class TestAnalyzeSlopeVolume:
    """Tests for the slope+volume intraday signal function."""

    def _bullish_reversal_closes(self, n: int = 40, lookback: int = 5) -> list[float]:
        """
        Generate closes with a bullish reversal in the correct windows.

        analyze_slope_volume looks at:
          - current window: close.tail(lookback_bars)  = bars [-lookback:]
          - prev window:    close.iloc[-(lookback*2):-lookback] = bars [-2*lookback:-lookback]

        We build:
          - neutral bars to reach min_bars
          - prev window: descending (negative slope)
          - current window: ascending (positive slope)
        """
        neutral_count = n - lookback * 2
        neutral = [100.0] * neutral_count
        # prev window: 100, 99.5, 99, 98.5, 98  → slope ≈ -0.5/bar (−0.5% of price)
        prev = [100.0 - i * 0.5 for i in range(lookback)]
        # current window: 98.5, 99, 99.5, 100, 100.5 → slope ≈ +0.5/bar (+0.5% of price)
        curr = [98.0 + (i + 1) * 0.5 for i in range(lookback)]
        return neutral + prev + curr

    def test_returns_none_if_too_few_bars(self):
        df = _make_ohlcv([100.0] * 10)
        result = analyze_slope_volume("SPY", df, min_bars=30)
        assert result is None

    def test_returns_none_outside_market_hours(self):
        closes = self._bullish_reversal_closes(40)
        # Last bar at 22:00 UTC — outside 14:30–20:00 window
        df = _make_ohlcv(closes, start="2024-01-15 21:55")
        result = analyze_slope_volume("SPY", df)
        assert result is None

    def test_returns_none_if_no_slope_crossover(self):
        """Flat or monotonically rising prices — no negative→positive crossover."""
        closes = [100.0 + i * 0.1 for i in range(40)]
        df = _make_ohlcv(closes)
        result = analyze_slope_volume("SPY", df)
        assert result is None

    def test_returns_none_if_volume_not_confirmed(self):
        """Slope crossover present but volume < threshold."""
        closes = self._bullish_reversal_closes(40)
        # volume_multiplier in data = 1.0 (same as base — no spike)
        df = _make_ohlcv(closes, volume_multiplier=1.0)
        result = analyze_slope_volume("SPY", df, volume_multiplier=1.5)
        assert result is None

    def test_returns_none_if_slope_below_threshold(self):
        """Crossover + volume, but slope change is too small (noise)."""
        # Very gentle slope change: 0.001% per bar
        n = 40
        prev = [100.0 - i * 0.00001 for i in range(n // 2)]
        curr = [prev[-1] + i * 0.00001 for i in range(n // 2)]
        closes = prev + curr
        df = _make_ohlcv(closes, volume_multiplier=3.0)
        result = analyze_slope_volume("SPY", df, slope_threshold_pct=0.05)
        assert result is None

    def test_buy_signal_on_valid_bullish_reversal(self):
        """Full valid scenario: slope crossover + threshold + volume confirmed."""
        closes = self._bullish_reversal_closes(40)
        df = _make_ohlcv(closes, volume_multiplier=3.0)
        result = analyze_slope_volume(
            "SPY", df,
            lookback_bars=5,
            slope_threshold_pct=0.01,  # low threshold → definitely triggers
            volume_multiplier=1.5,
        )
        assert result is not None
        assert result["action"] == "BUY"
        assert result["symbol"] == "SPY"
        assert result["entry_price"] > 0
        assert result["stop_loss"] < result["entry_price"]
        assert result["take_profit"] > result["entry_price"]

    def test_signal_contains_required_keys(self):
        """Signal dict must have all expected keys."""
        closes = self._bullish_reversal_closes(40)
        df = _make_ohlcv(closes, volume_multiplier=3.0)
        result = analyze_slope_volume("SPY", df, slope_threshold_pct=0.01, volume_multiplier=1.5)
        assert result is not None
        required = {"symbol", "action", "score", "confidence", "entry_price",
                    "stop_loss", "take_profit", "rationale", "indicators"}
        assert required.issubset(result.keys())

    def test_confidence_in_range(self):
        """Confidence must be in [0.5, 1.0]."""
        closes = self._bullish_reversal_closes(40)
        df = _make_ohlcv(closes, volume_multiplier=3.0)
        result = analyze_slope_volume("SPY", df, slope_threshold_pct=0.01, volume_multiplier=1.5)
        assert result is not None
        assert 0.5 <= result["confidence"] <= 1.0

    def test_stop_loss_take_profit_symmetric_with_atr(self):
        """stop_loss and take_profit distances scale with ATR multipliers."""
        closes = self._bullish_reversal_closes(40)
        df = _make_ohlcv(closes, volume_multiplier=3.0)
        result = analyze_slope_volume(
            "SPY", df,
            slope_threshold_pct=0.01, volume_multiplier=1.5,
            stop_loss_atr=1.5, take_profit_atr=3.0,
        )
        assert result is not None
        sl_dist = result["entry_price"] - result["stop_loss"]
        tp_dist = result["take_profit"] - result["entry_price"]
        # TP distance should be ~2× SL distance (3.0 / 1.5 ratio)
        ratio = tp_dist / max(sl_dist, 0.0001)
        assert abs(ratio - 2.0) < 0.2  # allow small float tolerance

    def test_returns_none_on_empty_dataframe(self):
        df = pd.DataFrame()
        result = analyze_slope_volume("SPY", df)
        assert result is None


# ---------------------------------------------------------------------------
# Trailing stop state machine logic
# ---------------------------------------------------------------------------

class TestTrailingStopLogic:
    """
    Tests for the 4-tier trailing stop state machine.
    We test the pure logic directly without requiring Alpaca/DB connections.
    """

    # Replicate the tier calculation logic from portfolio_monitor._update_trailing_stops
    # in a pure function for isolated testing.
    @staticmethod
    def _compute_new_stop(
        entry_price: float,
        highest_close: float,
        atr: float,
        current_stop: float,
        *,
        breakeven_atr: float = 1.5,
        lock_atr: float = 1.5,
        lock_cushion_atr: float = 0.5,
        trail_threshold_atr: float = 3.5,
        trail_distance_atr: float = 2.0,
        tight_threshold_atr: float = 4.0,
        tight_distance_atr: float = 1.0,
    ) -> tuple[float, int]:
        """Returns (new_stop, tier_reached)."""
        profit = highest_close - entry_price
        new_stop = current_stop
        tier = 0

        if profit > breakeven_atr * atr:
            new_stop = max(new_stop, entry_price)
            tier = max(tier, 1)

        if profit > lock_atr * atr:
            lock_stop = entry_price + atr * lock_cushion_atr
            new_stop = max(new_stop, lock_stop)
            tier = max(tier, 2)

        if profit > trail_threshold_atr * atr:
            trailing = highest_close - atr * trail_distance_atr
            new_stop = max(new_stop, trailing)
            tier = max(tier, 3)

        if profit > tight_threshold_atr * atr:
            tight = highest_close - atr * tight_distance_atr
            new_stop = max(new_stop, tight)
            tier = max(tier, 4)

        return round(new_stop, 4), tier

    def test_no_tier_if_profit_small(self):
        """If profit < breakeven threshold, stop stays at original."""
        entry = 100.0
        atr = 1.0
        highest = 101.0  # profit = 1.0 < 1.5 * atr
        original_stop = 98.5
        new_stop, tier = self._compute_new_stop(entry, highest, atr, original_stop)
        assert new_stop == original_stop
        assert tier == 0

    def test_tier1_breakeven(self):
        """profit > 1.5 * ATR → SL moves to at least entry_price."""
        entry = 100.0
        atr = 1.0
        highest = 101.6  # profit = 1.6 > 1.5 * atr
        original_stop = 98.5
        new_stop, tier = self._compute_new_stop(entry, highest, atr, original_stop)
        assert new_stop >= entry
        assert tier >= 1

    def test_tier2_lock(self):
        """profit > lock_atr → SL moves to entry + cushion."""
        entry = 100.0
        atr = 1.0
        highest = 102.0  # profit = 2.0 > 1.5 * atr (lock_atr = 1.5 by default)
        original_stop = 98.5
        new_stop, tier = self._compute_new_stop(entry, highest, atr, original_stop)
        expected_min = entry + atr * 0.5  # lock_cushion_atr = 0.5
        assert new_stop >= expected_min
        assert tier >= 2

    def test_tier3_trail(self):
        """profit > 3.5 * ATR → trailing stop follows highest_close."""
        entry = 100.0
        atr = 1.0
        highest = 103.6  # profit = 3.6 > 3.5 * atr
        original_stop = 98.5
        new_stop, tier = self._compute_new_stop(entry, highest, atr, original_stop)
        expected_trail = highest - atr * 2.0  # trail_distance_atr = 2.0
        assert abs(new_stop - expected_trail) < 0.01
        assert tier >= 3

    def test_tier4_tight(self):
        """profit > 4.0 * ATR → tight trailing stop."""
        entry = 100.0
        atr = 1.0
        highest = 104.1  # profit = 4.1 > 4.0 * atr
        original_stop = 98.5
        new_stop, tier = self._compute_new_stop(entry, highest, atr, original_stop)
        expected_tight = highest - atr * 1.0  # tight_distance_atr = 1.0
        assert abs(new_stop - expected_tight) < 0.01
        assert tier == 4

    def test_stop_is_monotonic(self):
        """Stop should only move UP, never down."""
        entry = 100.0
        atr = 1.0
        original_stop = 102.0  # already above entry

        # Even at tier 1 (breakeven = entry), stop should not go below original
        new_stop, _ = self._compute_new_stop(entry, 101.6, atr, original_stop)
        assert new_stop >= original_stop

    def test_tier_escalation_with_rising_price(self):
        """
        Simulate price rising through all 4 tiers.

        Note: default breakeven_atr = lock_atr = 1.5, so tier 1 and tier 2
        fire at the same threshold (1.5 × ATR). The state machine jumps from
        tier 0 → tier 2 directly at 1.5 ATR profit.
        """
        entry = 100.0
        atr = 1.0
        original_stop = 98.5
        previous_stop = original_stop

        # profit=1.0: below all thresholds → tier 0
        # profit=1.6: both breakeven(1.5) and lock(1.5) fire → tier 2 (skips tier 1)
        # profit=2.0: still tier 2
        # profit=3.6: trail threshold (3.5) fires → tier 3
        # profit=4.2: tight threshold (4.0) fires → tier 4
        price_levels =    [101.0, 101.6, 102.0, 103.6, 104.2]
        expected_tiers =  [0,     2,     2,     3,     4]

        for price, expected_tier in zip(price_levels, expected_tiers):
            new_stop, tier = self._compute_new_stop(
                entry, price, atr, previous_stop
            )
            assert tier == expected_tier, f"at price {price}: expected tier {expected_tier}, got {tier}"
            assert new_stop >= previous_stop, "Stop must be monotonically non-decreasing"
            previous_stop = new_stop


# ---------------------------------------------------------------------------
# SHORT/COVER signal actions
# ---------------------------------------------------------------------------

class TestSignalActionShortCover:
    """Tests for the new SHORT and COVER signal actions."""

    def test_short_action_exists(self):
        assert SignalAction.SHORT == "SHORT"

    def test_cover_action_exists(self):
        assert SignalAction.COVER == "COVER"

    def test_all_actions_enumerable(self):
        actions = {a.value for a in SignalAction}
        assert {"BUY", "SELL", "SHORT", "COVER", "HOLD"} == actions

    def test_risk_decision_with_short(self):
        decision = RiskDecision(
            symbol="NVDA",
            action=SignalAction.SHORT,
            status=RiskDecisionStatus.REJECTED,
            reason="Short selling disabled",
        )
        assert decision.action == SignalAction.SHORT
        assert decision.status == RiskDecisionStatus.REJECTED

    def test_risk_decision_with_cover(self):
        decision = RiskDecision(
            symbol="NVDA",
            action=SignalAction.COVER,
            status=RiskDecisionStatus.APPROVED,
            position_size=50,
        )
        assert decision.action == SignalAction.COVER
        assert decision.status == RiskDecisionStatus.APPROVED
        assert decision.position_size == 50


# ---------------------------------------------------------------------------
# RiskManager._validate_signal with SHORT disabled (unit, no Alpaca)
# ---------------------------------------------------------------------------

class TestRiskManagerShortRejection:
    """Tests risk manager rejects SHORT when allow_short_selling=False."""

    def _make_risk_manager(self, allow_short: bool = False):
        """Return a partially-mocked RiskManager."""
        from src.agents.risk_manager import RiskManager
        from src.config.settings import RiskSettings

        with patch.object(RiskManager, "__init__", lambda self: None):
            mgr = RiskManager.__new__(RiskManager)
            mgr._risk = RiskSettings.model_construct(
                allow_short_selling=allow_short,
                max_short_exposure_pct=30.0,
                max_short_position_pct=5.0,
                max_positions=10,
                max_sector_exposure_pct=30.0,
                max_position_pct=10.0,
                min_risk_reward=2.0,
                stop_loss_pct=-5.0,
                kelly_fraction=0.5,
            )
            mgr.logger = MagicMock()
            return mgr

    def test_short_rejected_when_disabled(self):
        mgr = self._make_risk_manager(allow_short=False)
        signal = {
            "symbol": "NVDA",
            "action": "SHORT",
            "entry_price": 500.0,
            "stop_loss": 510.0,
            "take_profit": 475.0,
        }
        decision = mgr._validate_signal(signal, 100_000, 50_000, [])
        assert decision.status == RiskDecisionStatus.REJECTED
        assert "Short selling disabled" in decision.reason

    def test_short_approved_when_enabled_and_good_rr(self):
        mgr = self._make_risk_manager(allow_short=True)
        signal = {
            "symbol": "NVDA",
            "action": "SHORT",
            "entry_price": 500.0,
            "stop_loss": 510.0,   # 2% above entry (loss if price rises)
            "take_profit": 470.0,  # 6% below entry (gain if price falls) → R/R = 3.0
        }
        decision = mgr._validate_signal(signal, 100_000, 50_000, [])
        assert decision.status == RiskDecisionStatus.APPROVED
        assert decision.position_size > 0

    def test_short_rejected_bad_rr(self):
        """R/R < min_risk_reward (2.0) should be rejected."""
        mgr = self._make_risk_manager(allow_short=True)
        signal = {
            "symbol": "NVDA",
            "action": "SHORT",
            "entry_price": 500.0,
            "stop_loss": 510.0,   # risk = 10
            "take_profit": 495.0,  # reward = 5 → R/R = 0.5 < 2.0
        }
        decision = mgr._validate_signal(signal, 100_000, 50_000, [])
        assert decision.status == RiskDecisionStatus.REJECTED

    def test_cover_rejected_no_short_position(self):
        """COVER rejected if no short (negative qty) position exists."""
        mgr = self._make_risk_manager(allow_short=True)
        signal = {
            "symbol": "NVDA",
            "action": "COVER",
            "entry_price": 490.0,
        }
        # positions = empty → no short position
        decision = mgr._validate_signal(signal, 100_000, 50_000, [])
        assert decision.status == RiskDecisionStatus.REJECTED
        assert "No open short position" in decision.reason

    def test_cover_approved_with_short_position(self):
        """COVER approved when short position (negative qty) exists."""
        mgr = self._make_risk_manager(allow_short=True)
        signal = {
            "symbol": "NVDA",
            "action": "COVER",
            "entry_price": 490.0,
        }
        positions = [{"symbol": "NVDA", "qty": -50}]  # short position
        decision = mgr._validate_signal(signal, 100_000, 50_000, positions)
        assert decision.status == RiskDecisionStatus.APPROVED
        assert decision.position_size == 50  # abs(qty)

    def test_sell_still_rejected_no_long_position(self):
        """Existing SELL logic unchanged: rejected without long position."""
        mgr = self._make_risk_manager(allow_short=False)
        signal = {
            "symbol": "AAPL",
            "action": "SELL",
            "entry_price": 185.0,
        }
        decision = mgr._validate_signal(signal, 100_000, 50_000, [])
        assert decision.status == RiskDecisionStatus.REJECTED
        assert "No open position to sell" in decision.reason
