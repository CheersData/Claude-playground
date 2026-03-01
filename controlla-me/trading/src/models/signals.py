"""Signal and scan data models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class SignalType(StrEnum):
    SCAN = "scan"
    TRADE = "trade"
    RISK_CHECK = "risk_check"


class SignalAction(StrEnum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class RiskDecisionStatus(StrEnum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ScanResult(BaseModel):
    """Single stock from market scan."""

    symbol: str
    score: float = Field(ge=0, le=1)
    trend: str  # "bullish", "bearish", "neutral"
    atr_pct: float
    avg_volume: int
    sector: str | None = None
    current_price: float


class Signal(BaseModel):
    """Trading signal from Signal Generator."""

    symbol: str
    action: SignalAction
    confidence: float = Field(ge=0, le=1)
    score: float = Field(ge=-1, le=1)
    entry_price: float
    stop_loss: float
    take_profit: float
    rationale: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def risk_reward_ratio(self) -> float:
        risk = abs(self.entry_price - self.stop_loss)
        if risk == 0:
            return 0
        reward = abs(self.take_profit - self.entry_price)
        return reward / risk


class RiskDecision(BaseModel):
    """Risk Manager decision on a signal."""

    symbol: str
    action: SignalAction
    status: RiskDecisionStatus
    position_size: int | None = None  # shares
    position_value: float | None = None
    portfolio_pct: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    reason: str | None = None  # only for rejections
    created_at: datetime = Field(default_factory=datetime.utcnow)
