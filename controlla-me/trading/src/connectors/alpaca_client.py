"""
Alpaca Markets client — wraps alpaca-py for trading and market data.

Supports both paper and live trading via base_url configuration.
Paper: https://paper-api.alpaca.markets
Live:  https://api.alpaca.markets
"""

from __future__ import annotations

import structlog
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest, StockLatestBarRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide, OrderType, TimeInForce
from alpaca.trading.requests import (
    GetOrdersRequest,
    LimitOrderRequest,
    MarketOrderRequest,
    ReplaceOrderRequest,
    StopLossRequest,
    TakeProfitRequest,
)
from datetime import datetime, timedelta
import time

import pandas as pd

from ..config import get_settings

logger = structlog.get_logger()

# Rate limit retry decorator
def _retry_on_rate_limit(func, max_retries=3, wait_seconds=30):
    """Retry a function call on rate limit (429) errors."""
    import functools

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        for attempt in range(max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                err_str = str(e).lower()
                if ("rate limit" in err_str or "429" in err_str) and attempt < max_retries:
                    logger.warning(
                        "alpaca_rate_limit",
                        attempt=attempt + 1,
                        max_retries=max_retries,
                        wait_seconds=wait_seconds,
                    )
                    time.sleep(wait_seconds)
                    continue
                raise
    return wrapper


class AlpacaClient:
    """Unified Alpaca client for trading + market data."""

    def __init__(self) -> None:
        settings = get_settings()
        self._api_key = settings.alpaca.api_key
        self._secret_key = settings.alpaca.secret_key
        self._base_url = settings.alpaca.base_url
        self._is_paper = settings.alpaca.is_paper

        # Trading client
        self._trading = TradingClient(
            api_key=self._api_key,
            secret_key=self._secret_key,
            paper=self._is_paper,
        )

        # Market data client (same keys, no paper distinction)
        self._data = StockHistoricalDataClient(
            api_key=self._api_key,
            secret_key=self._secret_key,
        )

        logger.info(
            "alpaca_client_init",
            paper=self._is_paper,
            base_url=self._base_url,
        )

    # ─── Account ───────────────────────────────────────────────

    def get_account(self) -> dict:
        """Get account info (cash, portfolio value, buying power)."""
        account = self._trading.get_account()
        return {
            "cash": float(account.cash),
            "portfolio_value": float(account.portfolio_value),
            "buying_power": float(account.buying_power),
            "equity": float(account.equity),
            "currency": account.currency,
            "status": account.status.value if account.status else "unknown",
        }

    # ─── Positions ─────────────────────────────────────────────

    def get_positions(self) -> list[dict]:
        """Get all open positions."""
        positions = self._trading.get_all_positions()
        return [
            {
                "symbol": p.symbol,
                "qty": int(p.qty),
                "avg_entry_price": float(p.avg_entry_price),
                "current_price": float(p.current_price),
                "market_value": float(p.market_value),
                "unrealized_pl": float(p.unrealized_pl),
                "unrealized_plpc": float(p.unrealized_plpc),
                "side": p.side.value if p.side else "long",
            }
            for p in positions
        ]

    def close_position(self, symbol: str) -> dict:
        """Close a specific position (market sell)."""
        logger.info("closing_position", symbol=symbol)
        order = self._trading.close_position(symbol)
        return {"order_id": str(order.id), "symbol": symbol, "status": "closing"}

    def close_all_positions(self) -> list[dict]:
        """Close ALL positions (kill switch)."""
        logger.warning("closing_all_positions", reason="kill_switch")
        responses = self._trading.close_all_positions(cancel_orders=True)
        return [
            {"symbol": r.symbol, "status": "closing"}
            for r in responses
        ]

    # ─── Orders ────────────────────────────────────────────────

    def submit_market_order(
        self,
        symbol: str,
        qty: int,
        side: str = "buy",
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict:
        """Submit a market order, optionally with bracket (stop loss + take profit)."""
        order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL

        if stop_loss and take_profit:
            # Bracket order
            request = MarketOrderRequest(
                symbol=symbol,
                qty=qty,
                side=order_side,
                time_in_force=TimeInForce.DAY,
                order_class="bracket",
                stop_loss=StopLossRequest(stop_price=stop_loss),
                take_profit=TakeProfitRequest(limit_price=take_profit),
            )
        else:
            request = MarketOrderRequest(
                symbol=symbol,
                qty=qty,
                side=order_side,
                time_in_force=TimeInForce.DAY,
            )

        logger.info("submit_market_order", symbol=symbol, qty=qty, side=side)
        order = self._trading.submit_order(request)
        return self._order_to_dict(order)

    def submit_limit_order(
        self,
        symbol: str,
        qty: int,
        limit_price: float,
        side: str = "buy",
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict:
        """Submit a limit order, optionally with bracket."""
        order_side = OrderSide.BUY if side == "buy" else OrderSide.SELL

        if stop_loss and take_profit:
            request = LimitOrderRequest(
                symbol=symbol,
                qty=qty,
                side=order_side,
                time_in_force=TimeInForce.DAY,
                limit_price=limit_price,
                order_class="bracket",
                stop_loss=StopLossRequest(stop_price=stop_loss),
                take_profit=TakeProfitRequest(limit_price=take_profit),
            )
        else:
            request = LimitOrderRequest(
                symbol=symbol,
                qty=qty,
                side=order_side,
                time_in_force=TimeInForce.DAY,
                limit_price=limit_price,
            )

        logger.info("submit_limit_order", symbol=symbol, qty=qty, side=side, limit=limit_price)
        order = self._trading.submit_order(request)
        return self._order_to_dict(order)

    def cancel_order(self, order_id: str) -> None:
        """Cancel a pending order."""
        logger.info("cancel_order", order_id=order_id)
        self._trading.cancel_order_by_id(order_id)

    def cancel_all_orders(self) -> None:
        """Cancel ALL pending orders."""
        logger.warning("cancel_all_orders")
        self._trading.cancel_orders()

    def get_orders(self, status: str = "open") -> list[dict]:
        """Get orders by status."""
        request = GetOrdersRequest(status=status)
        orders = self._trading.get_orders(request)
        return [self._order_to_dict(o) for o in orders]

    def replace_order_stop_price(self, order_id: str, new_stop_price: float) -> dict:
        """Replace a stop order with a new stop price (for trailing stops).

        Alpaca creates a NEW order and cancels the old one.
        Returns the new order dict (with new order_id).
        """
        request = ReplaceOrderRequest(stop_price=new_stop_price)
        logger.info("replace_stop_price", order_id=order_id, new_stop=new_stop_price)
        order = self._trading.replace_order_by_id(order_id, request)
        return self._order_to_dict(order)

    # ─── Market Data ───────────────────────────────────────────

    def get_bars(
        self,
        symbols: list[str],
        timeframe: str = "1Day",
        days_back: int = 60,
    ) -> dict[str, pd.DataFrame]:
        """
        Get historical bars for multiple symbols.
        Returns dict of symbol -> DataFrame with OHLCV.
        Retries on rate limit (429) with 30s backoff.
        """
        if timeframe == "1Day":
            tf = TimeFrame.Day
        elif timeframe == "1Hour":
            tf = TimeFrame.Hour
        elif timeframe.endswith("Min") or timeframe.endswith("min"):
            minutes = int(timeframe.replace("Min", "").replace("min", ""))
            tf = TimeFrame(minutes, TimeFrameUnit.Minute)
        else:
            tf = TimeFrame.Day
        start = datetime.utcnow() - timedelta(days=days_back)

        request = StockBarsRequest(
            symbol_or_symbols=symbols,
            timeframe=tf,
            start=start,
        )

        # Retry on rate limit
        bars = None
        for attempt in range(4):
            try:
                bars = self._data.get_stock_bars(request)
                break
            except Exception as e:
                err_str = str(e).lower()
                if ("rate limit" in err_str or "429" in err_str) and attempt < 3:
                    logger.warning("alpaca_rate_limit_bars", attempt=attempt + 1, wait=30)
                    time.sleep(30)
                    continue
                raise

        if bars is None:
            return {}
        result: dict[str, pd.DataFrame] = {}

        for symbol in symbols:
            if symbol in bars.data:
                data = []
                for bar in bars.data[symbol]:
                    data.append({
                        "timestamp": bar.timestamp,
                        "open": float(bar.open),
                        "high": float(bar.high),
                        "low": float(bar.low),
                        "close": float(bar.close),
                        "volume": int(bar.volume),
                    })
                if data:
                    result[symbol] = pd.DataFrame(data).set_index("timestamp")

        return result

    def get_latest_snapshot(self, symbols: list[str]) -> dict[str, dict]:
        """Get the latest single bar (snapshot) for multiple symbols."""
        request = StockLatestBarRequest(symbol_or_symbols=symbols)
        bars = self._data.get_stock_latest_bar(request)

        return {
            symbol: {
                "close": float(bar.close),
                "volume": int(bar.volume),
                "timestamp": str(bar.timestamp),
            }
            for symbol, bar in bars.items()
        }

    def get_latest_bars(
        self,
        symbol: str,
        timeframe: str = "5Min",
        n_bars: int = 60,
    ) -> pd.DataFrame:
        """
        Get the most recent N bars for a single symbol.

        Used by the slope+volume intraday strategy for real-time signal
        generation. Fetches a window of historical minute bars large enough
        to cover weekends and public holidays via a buffer factor.

        Args:
            symbol: Ticker symbol (e.g. "SPY").
            timeframe: Bar timeframe string, e.g. "5Min", "1Min", "15Min".
            n_bars: Number of bars to return (tail of the fetched window).

        Returns:
            DataFrame with DatetimeIndex (UTC, tz-aware) and columns
            open/high/low/close/volume, sorted ascending. Empty DataFrame
            on error or no data.
        """
        if timeframe.endswith("Min") or timeframe.endswith("min"):
            minutes = int(timeframe.replace("Min", "").replace("min", ""))
            tf = TimeFrame(minutes, TimeFrameUnit.Minute)
        elif timeframe == "1Hour":
            tf = TimeFrame.Hour
        else:
            tf = TimeFrame.Day

        # Calculate lookback window: n_bars × bar_duration + buffer for
        # weekends / market holidays (factor 2.5 is conservative).
        minutes_per_bar = (
            int(timeframe.replace("Min", "").replace("min", ""))
            if ("Min" in timeframe or "min" in timeframe)
            else 60
        )
        buffer_factor = 2.5
        lookback_minutes = int(n_bars * minutes_per_bar * buffer_factor)
        start = datetime.utcnow() - timedelta(minutes=lookback_minutes)

        try:
            request = StockBarsRequest(
                symbol_or_symbols=symbol,
                timeframe=tf,
                start=start,
            )
            bars = self._data.get_stock_bars(request)
            if symbol not in bars.data:
                return pd.DataFrame()

            data = []
            for bar in bars.data[symbol]:
                data.append({
                    "timestamp": bar.timestamp,
                    "open": float(bar.open),
                    "high": float(bar.high),
                    "low": float(bar.low),
                    "close": float(bar.close),
                    "volume": float(bar.volume),
                })

            if not data:
                return pd.DataFrame()

            df = pd.DataFrame(data)
            df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
            df = df.set_index("timestamp").sort_index()
            return df.tail(n_bars)

        except Exception as e:
            logger.warning("alpaca_get_latest_bars_error", symbol=symbol, error=str(e))
            return pd.DataFrame()

    # ─── Private ───────────────────────────────────────────────

    @staticmethod
    def _order_to_dict(order) -> dict:  # type: ignore[no-untyped-def]
        """Convert Alpaca order object to dict."""
        result = {
            "order_id": str(order.id),
            "symbol": order.symbol,
            "side": order.side.value if order.side else None,
            "qty": int(order.qty) if order.qty else None,
            "type": order.type.value if order.type else None,
            "status": order.status.value if order.status else None,
            "filled_avg_price": float(order.filled_avg_price) if order.filled_avg_price else None,
            "filled_qty": int(order.filled_qty) if order.filled_qty else None,
            "filled_at": str(order.filled_at) if order.filled_at else None,
            "created_at": str(order.created_at) if order.created_at else None,
        }
        # Add stop_price for stop orders (used by trailing stop system)
        if hasattr(order, "stop_price") and order.stop_price is not None:
            result["stop_price"] = float(order.stop_price)
        # Add limit_price for limit/take-profit orders
        if hasattr(order, "limit_price") and order.limit_price is not None:
            result["limit_price"] = float(order.limit_price)
        return result
