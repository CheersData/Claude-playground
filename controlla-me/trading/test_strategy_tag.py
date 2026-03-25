"""Quick validation of strategy tagging changes."""
from src.models.signals import Signal, RiskDecision, TradingStrategy

# Test Signal with strategy
s = Signal(
    symbol="SPY", action="BUY", strategy="conventional",
    confidence=0.8, score=0.5, entry_price=100, stop_loss=95,
    take_profit=110, rationale="test"
)
assert s.strategy == "conventional", f"Expected conventional, got {s.strategy}"

s2 = Signal(
    symbol="NVDA", action="SHORT", strategy="slope_volume",
    confidence=0.7, score=-0.3, entry_price=200, stop_loss=210,
    take_profit=180, rationale="slope test"
)
assert s2.strategy == "slope_volume"

s3 = Signal(
    symbol="BTCUSD", action="BUY", strategy="crypto_slope",
    confidence=0.6, score=0.4, entry_price=50000, stop_loss=48000,
    take_profit=55000, rationale="crypto test"
)
assert s3.strategy == "crypto_slope"

# Test RiskDecision with strategy
rd = RiskDecision(symbol="SPY", action="BUY", strategy="slope_volume", status="APPROVED")
assert rd.strategy == "slope_volume"

# Test backward compat: strategy is optional in RiskDecision
rd2 = RiskDecision(symbol="SPY", action="BUY", status="APPROVED")
assert rd2.strategy is None

# Test model_dump includes strategy
d = s.model_dump(mode="json")
assert d["strategy"] == "conventional"

d2 = rd.model_dump(mode="json")
assert d2["strategy"] == "slope_volume"

print("ALL TESTS PASSED")
