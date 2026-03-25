"""Signal and scan data models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class SignalType(StrEnum):
    SCAN = "scan"
    TRADE = "trade"
    RISK_CHECK = "risk_check"


# Strategy identifiers — every signal MUST declare which strategy generated it.
TradingStrategy = Literal["conventional", "slope_volume", "crypto_slope"]


class SignalAction(StrEnum):
    BUY = "BUY"
    SELL = "SELL"   # Close long position
    SHORT = "SHORT"  # Open short position (sell without owning)
    COVER = "COVER"  # Close short position (buy to cover)
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
    strategy: TradingStrategy
    """Which strategy generated this signal: conventional (MACD daily), slope_volume (intraday), crypto_slope."""
    confidence: float = Field(ge=0, le=1)
    score: float = Field(ge=-1, le=1)
    entry_price: float
    stop_loss: float
    take_profit: float
    rationale: str
    news_risk: bool = False
    """True when breaking news was detected at signal generation time (Tiingo News API)."""
    news_headline: str = ""
    """Most recent breaking headline if news_risk=True. Empty string otherwise."""
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
    strategy: TradingStrategy | None = None
    """Propagated from the originating Signal for end-to-end traceability."""
    status: RiskDecisionStatus
    position_size: int | None = None  # shares
    position_value: float | None = None
    portfolio_pct: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    atr: float | None = None  # ATR at signal time (for trailing stop)
    entry_price: float | None = None  # Signal entry price (for trailing stop)
    reason: str | None = None  # only for rejections
    created_at: datetime = Field(default_factory=datetime.utcnow)
