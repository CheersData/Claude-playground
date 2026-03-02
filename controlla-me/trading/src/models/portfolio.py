"""Portfolio and risk event models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class Position(BaseModel):
    """Open portfolio position."""

    symbol: str
    qty: int
    avg_entry_price: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    unrealized_pnl_pct: float
    sector: str | None = None
    days_held: int = 0

    @property
    def cost_basis(self) -> float:
        return self.qty * self.avg_entry_price


class PortfolioSnapshot(BaseModel):
    """Daily portfolio snapshot."""

    date: str  # YYYY-MM-DD
    portfolio_value: float
    cash: float
    positions_value: float
    daily_pnl: float
    daily_pnl_pct: float
    weekly_pnl_pct: float
    max_drawdown_pct: float
    sharpe_30d: float | None = None
    win_rate: float | None = None
    positions_count: int
    positions: list[Position] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RiskEventType(StrEnum):
    KILL_SWITCH_DAILY = "KILL_SWITCH_DAILY"
    KILL_SWITCH_WEEKLY = "KILL_SWITCH_WEEKLY"
    STOP_LOSS = "STOP_LOSS"
    TAKE_PROFIT = "TAKE_PROFIT"
    TRAILING_STOP = "TRAILING_STOP"
    WARNING = "WARNING"
    CONNECTION_LOST = "CONNECTION_LOST"


class RiskEvent(BaseModel):
    """Risk management event (kill switch, stop loss, warnings)."""

    event_type: RiskEventType
    severity: str  # "INFO", "WARNING", "CRITICAL"
    symbol: str | None = None
    message: str
    portfolio_value: float | None = None
    daily_pnl_pct: float | None = None
    weekly_pnl_pct: float | None = None
    action_taken: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
