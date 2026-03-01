"""Order data models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class OrderSide(StrEnum):
    BUY = "buy"
    SELL = "sell"


class OrderType(StrEnum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    BRACKET = "bracket"


class OrderStatus(StrEnum):
    PENDING = "pending"
    SUBMITTED = "submitted"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    EXPIRED = "expired"


class Order(BaseModel):
    """Executed or pending order."""

    alpaca_order_id: str | None = None
    symbol: str
    side: OrderSide
    qty: int
    order_type: OrderType
    status: OrderStatus = OrderStatus.PENDING
    limit_price: float | None = None
    stop_price: float | None = None
    filled_avg_price: float | None = None
    filled_qty: int | None = None
    filled_at: datetime | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    commission: float = 0.0  # Alpaca is commission-free
    created_at: datetime = Field(default_factory=datetime.utcnow)
    error_message: str | None = None
