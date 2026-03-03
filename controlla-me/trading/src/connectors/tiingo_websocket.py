"""
Tiingo WebSocket streaming client.

Provides real-time price push notifications for equities (IEX) and crypto.
Designed to run as a standalone background process alongside the minute-bar scheduler.

Why WebSocket over polling?
    Current scheduler: polls every 60s → up to 60s latency per bar
    WebSocket: push on each tick → ~100ms latency for intraday price updates
    Use case: faster entry/exit on slope reversal, crypto 24/7 real-time monitoring

Tiingo WebSocket endpoints:
    IEX:    wss://api.tiingo.com/iex    — US equities real-time (Power plan recommended)
    Crypto: wss://api.tiingo.com/crypto  — Crypto pairs 24/7 (included in all plans)

Protocol:
    1. Connect to WSS endpoint
    2. Send subscribe message: {"eventName": "subscribe", "authorization": TOKEN, "eventData": {"tickers": [...]}}
    3. Server sends: {"messageType": "I", "data": {...}}  — Info (subscription confirmed)
    4. Server sends: {"messageType": "A", "data": {...}}  — Update (price tick)
    5. Server sends: {"messageType": "H"}                 — Heartbeat (every 30s)

IEX tick data fields:
    ticker, lastSalePrice, lastSaleSize, lastSaleTimestamp, bidPrice, askPrice, volume, prevClose

Crypto tick data fields:
    ticker (e.g. "btcusd"), lastPrice, lastSize, bidPrice, askPrice, lastExchange, timestamp

Usage:
    # Option 1: Run as standalone process
    cd trading
    python -m src.connectors.tiingo_websocket --mode iex --symbols SPY QQQ SH PSQ
    python -m src.connectors.tiingo_websocket --mode crypto --symbols btcusd ethusd

    # Option 2: Import and use in async code
    from src.connectors.tiingo_websocket import TiingoWebSocketClient

    async def on_tick(symbol: str, price: float, data: dict) -> None:
        print(f"{symbol}: ${price:.2f}")

    client = TiingoWebSocketClient(mode="iex", symbols=["SPY", "QQQ"])
    await client.stream(callback=on_tick)

    # Option 3: Run in background thread alongside synchronous scheduler
    import threading
    def run_ws():
        import asyncio
        asyncio.run(client.stream(callback=on_tick))

    ws_thread = threading.Thread(target=run_ws, daemon=True)
    ws_thread.start()

Requirements:
    pip install websockets>=12.0
    (or: add websockets>=12.0 to pyproject.toml dependencies)
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal as signal_module
from collections.abc import Callable, Coroutine
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)

# WebSocket endpoints
_WS_IEX = "wss://api.tiingo.com/iex"
_WS_CRYPTO = "wss://api.tiingo.com/crypto"

# Reconnect settings
_RECONNECT_DELAY_SEC = 5.0
_MAX_RECONNECT_ATTEMPTS = 10

# Callback type: (symbol, price, raw_data) → None or coroutine
TickCallback = Callable[[str, float, dict], None | Coroutine[Any, Any, None]]


class TiingoWebSocketClient:
    """
    Async WebSocket client for real-time Tiingo price streaming.

    Handles:
        - Connection and subscription
        - Automatic reconnection on disconnect (up to MAX_RECONNECT_ATTEMPTS)
        - Heartbeat monitoring (30s timeout)
        - Graceful shutdown on SIGINT/SIGTERM
        - IEX (equities) and Crypto modes

    Note: Requires 'websockets' library (pip install websockets>=12.0).
    The websockets import is lazy so the module can be imported without it installed
    — an ImportError is only raised when stream() is called.
    """

    def __init__(
        self,
        mode: str = "iex",
        symbols: list[str] | None = None,
        api_key: str | None = None,
    ) -> None:
        """
        Args:
            mode:    "iex" for US equities, "crypto" for cryptocurrency pairs.
            symbols: List of symbols to subscribe to.
                     IEX:    ["SPY", "QQQ", "SH", "PSQ"]
                     Crypto: ["btcusd", "ethusd"]
            api_key: Tiingo API key. Falls back to TIINGO_API_KEY env var.
        """
        if mode not in ("iex", "crypto"):
            raise ValueError(f"Invalid mode {mode!r}. Must be 'iex' or 'crypto'.")

        self.mode = mode
        self.symbols: list[str] = symbols or []
        self._ws_url = _WS_IEX if mode == "iex" else _WS_CRYPTO

        # Resolve API key
        if api_key:
            self._token = api_key
        else:
            try:
                from ..config import get_settings
                settings = get_settings()
                self._token = settings.tiingo.tiingo_api_key or ""
            except Exception:
                import os
                self._token = os.environ.get("TIINGO_API_KEY", "")

        if not self._token:
            raise ValueError(
                "TIINGO_API_KEY is not configured. "
                "Add to .env.local or pass api_key= argument."
            )

        self._running = False
        self._reconnect_count = 0
        self._last_message_time: datetime | None = None

    def _subscribe_message(self) -> str:
        """Build the JSON subscription message for this mode."""
        return json.dumps({
            "eventName": "subscribe",
            "authorization": self._token,
            "eventData": {
                "tickers": self.symbols,
            },
        })

    def _parse_iex_tick(self, data: dict) -> tuple[str, float] | None:
        """
        Parse IEX tick update.
        Returns (symbol, price) or None if unparseable.
        """
        ticker = data.get("ticker", "").upper()
        price = data.get("lastSalePrice") or data.get("tngoLast")
        if not ticker or price is None:
            return None
        try:
            return ticker, float(price)
        except (TypeError, ValueError):
            return None

    def _parse_crypto_tick(self, data: dict) -> tuple[str, float] | None:
        """
        Parse crypto tick update.
        Returns (symbol, price) or None if unparseable.
        """
        ticker = data.get("ticker", "").lower()
        price = data.get("lastPrice")
        if not ticker or price is None:
            return None
        try:
            return ticker, float(price)
        except (TypeError, ValueError):
            return None

    async def stream(
        self,
        callback: TickCallback | None = None,
        on_connect: Callable[[], None] | None = None,
        on_disconnect: Callable[[], None] | None = None,
    ) -> None:
        """
        Start streaming real-time price updates.

        This coroutine runs indefinitely until:
            - stop() is called
            - SIGINT/SIGTERM received
            - MAX_RECONNECT_ATTEMPTS exceeded

        Args:
            callback:      Called on each price tick: callback(symbol, price, raw_data)
                           Can be a regular function or async coroutine.
            on_connect:    Called when WebSocket connection is established.
            on_disconnect: Called when WebSocket disconnects (before reconnect).
        """
        try:
            import websockets  # type: ignore[import-untyped]
        except ImportError:
            raise ImportError(
                "websockets library is required for WebSocket streaming. "
                "Install with: pip install websockets>=12.0"
            )

        self._running = True
        self._reconnect_count = 0

        # Register signal handlers for graceful shutdown
        loop = asyncio.get_event_loop()
        for sig in (signal_module.SIGINT, signal_module.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.stop)
            except NotImplementedError:
                # Windows doesn't support add_signal_handler
                pass

        logger.info(
            "tiingo_ws_starting",
            extra={"mode": self.mode, "symbols": self.symbols, "url": self._ws_url},
        )

        while self._running and self._reconnect_count <= _MAX_RECONNECT_ATTEMPTS:
            try:
                async with websockets.connect(
                    self._ws_url,
                    ping_interval=20,
                    ping_timeout=30,
                    close_timeout=10,
                ) as ws:
                    self._reconnect_count = 0  # Reset on successful connect
                    self._last_message_time = datetime.now(tz=timezone.utc)

                    logger.info(
                        "tiingo_ws_connected",
                        extra={"mode": self.mode, "url": self._ws_url},
                    )

                    if on_connect:
                        on_connect()

                    # Send subscription
                    await ws.send(self._subscribe_message())

                    # Message loop
                    async for raw_message in ws:
                        if not self._running:
                            break

                        self._last_message_time = datetime.now(tz=timezone.utc)

                        try:
                            msg = json.loads(raw_message)
                        except json.JSONDecodeError:
                            continue

                        msg_type = msg.get("messageType", "")

                        if msg_type == "H":
                            # Heartbeat — server is alive, no action needed
                            logger.debug("tiingo_ws_heartbeat")
                            continue

                        if msg_type == "I":
                            # Info — subscription confirmed
                            logger.info(
                                "tiingo_ws_subscribed",
                                extra={"data": msg.get("data", {})},
                            )
                            continue

                        if msg_type == "A":
                            # Update — price tick
                            data = msg.get("data", {})

                            parsed = (
                                self._parse_iex_tick(data)
                                if self.mode == "iex"
                                else self._parse_crypto_tick(data)
                            )

                            if parsed is None:
                                continue

                            symbol, price = parsed

                            if callback is not None:
                                try:
                                    result = callback(symbol, price, data)
                                    if asyncio.iscoroutine(result):
                                        await result
                                except Exception as cb_exc:
                                    logger.warning(
                                        "tiingo_ws_callback_error",
                                        extra={"error": str(cb_exc), "symbol": symbol},
                                    )

                        elif msg_type == "E":
                            # Error from server
                            logger.error(
                                "tiingo_ws_server_error",
                                extra={"data": msg.get("data", {})},
                            )

            except Exception as exc:
                if not self._running:
                    break

                self._reconnect_count += 1
                if self._reconnect_count > _MAX_RECONNECT_ATTEMPTS:
                    logger.error(
                        "tiingo_ws_max_reconnects_exceeded",
                        extra={
                            "attempts": self._reconnect_count,
                            "max": _MAX_RECONNECT_ATTEMPTS,
                        },
                    )
                    break

                if on_disconnect:
                    on_disconnect()

                delay = _RECONNECT_DELAY_SEC * self._reconnect_count
                logger.warning(
                    "tiingo_ws_disconnected",
                    extra={
                        "error": str(exc),
                        "reconnect_in_s": delay,
                        "attempt": self._reconnect_count,
                    },
                )
                await asyncio.sleep(delay)

        logger.info("tiingo_ws_stopped", extra={"mode": self.mode})

    def stop(self) -> None:
        """Signal the streaming loop to stop gracefully."""
        self._running = False
        logger.info("tiingo_ws_stop_requested", extra={"mode": self.mode})


# ── Standalone entry point ────────────────────────────────────────────────────

def _make_print_callback(mode: str) -> TickCallback:
    """Default callback: print each tick to stdout."""
    def callback(symbol: str, price: float, data: dict) -> None:
        ts = datetime.now(tz=timezone.utc).strftime("%H:%M:%S")
        print(f"[{ts}] {mode.upper()} | {symbol:>8} | ${price:>10.4f}")
    return callback


async def _run(mode: str, symbols: list[str]) -> None:
    client = TiingoWebSocketClient(mode=mode, symbols=symbols)
    await client.stream(callback=_make_print_callback(mode))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Tiingo WebSocket streaming client")
    parser.add_argument(
        "--mode",
        choices=["iex", "crypto"],
        default="iex",
        help="Streaming mode: 'iex' (equities) or 'crypto'",
    )
    parser.add_argument(
        "--symbols",
        nargs="+",
        default=None,
        help="Symbols to subscribe to (e.g. SPY QQQ SH PSQ or btcusd ethusd)",
    )
    args = parser.parse_args()

    default_symbols = {
        "iex": ["SPY", "QQQ", "SH", "PSQ", "GLD", "TLT"],
        "crypto": ["btcusd", "ethusd"],
    }
    symbols = args.symbols or default_symbols[args.mode]

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    print(f"Starting Tiingo WebSocket ({args.mode}) → symbols: {symbols}")
    print("Press Ctrl+C to stop.\n")

    asyncio.run(_run(args.mode, symbols))
