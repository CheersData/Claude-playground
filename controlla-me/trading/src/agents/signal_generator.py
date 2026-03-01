"""
Signal Generator Agent

Performs technical analysis on watchlist candidates to generate BUY/SELL signals.
Uses RSI, MACD, Bollinger Bands, trend, and volume indicators.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD
from ta.volatility import BollingerBands

from ..config import get_settings
from ..connectors import AlpacaClient
from ..models.signals import Signal, SignalAction
from ..utils.db import TradingDB
from .base import BaseAgent


class SignalGenerator(BaseAgent):
    """Generates trading signals from technical analysis."""

    def __init__(self) -> None:
        super().__init__(name="signal_generator")
        self._alpaca = AlpacaClient()
        self._db = TradingDB()
        self._settings = get_settings().signal

    async def run(self, watchlist: list[dict] | None = None, **kwargs: Any) -> dict:
        """
        Generate signals for watchlist candidates.

        Args:
            watchlist: List of ScanResult dicts. If None, reads latest scan from DB.
        """
        if watchlist is None:
            scans = self._db.get_latest_signals("scan", limit=1)
            if not scans:
                self.log_error("No scan data found")
                return {"signals": [], "error": "No scan data"}
            watchlist = scans[0].get("data", {}).get("watchlist", [])

        symbols = [c["symbol"] for c in watchlist]
        self.log_start(watchlist_size=len(symbols))

        # Fetch more history for indicator calculations (1 year)
        bars = self._alpaca.get_bars(symbols, timeframe="1Day", days_back=365)

        signals: list[dict] = []
        for symbol, df in bars.items():
            if len(df) < 50:
                continue

            signal = self._analyze_stock(symbol, df)
            if signal is not None and signal.confidence >= self._settings.min_confidence:
                signals.append(signal.model_dump(mode="json"))

        # Save to DB
        signal_data = {
            "date": pd.Timestamp.now().strftime("%Y-%m-%d"),
            "signals": signals,
            "analyzed": len(bars),
            "signals_generated": len(signals),
        }
        self._db.insert_signal("trade", signal_data)

        self.log_complete(analyzed=len(bars), signals=len(signals))
        return signal_data

    def _analyze_stock(self, symbol: str, df: pd.DataFrame) -> Signal | None:
        """Run technical analysis on a single stock."""
        try:
            close = df["close"]
            high = df["high"]
            low = df["low"]
            volume = df["volume"]
            current_price = float(close.iloc[-1])

            # --- RSI ---
            rsi = RSIIndicator(close, window=self._settings.rsi_period)
            rsi_value = float(rsi.rsi().iloc[-1])

            if rsi_value < self._settings.rsi_oversold:
                rsi_score = 0.8  # Oversold = potential buy
            elif rsi_value > self._settings.rsi_overbought:
                rsi_score = -0.8  # Overbought = potential sell
            else:
                rsi_score = (50 - rsi_value) / 50 * 0.5  # Linear scale

            # --- MACD ---
            macd = MACD(
                close,
                window_slow=self._settings.macd_slow,
                window_fast=self._settings.macd_fast,
                window_sign=self._settings.macd_signal,
            )
            macd_line = macd.macd().iloc[-1]
            signal_line = macd.macd_signal().iloc[-1]
            macd_prev = macd.macd().iloc[-2]
            signal_prev = macd.macd_signal().iloc[-2]

            # Crossover detection
            if macd_prev < signal_prev and macd_line > signal_line:
                macd_score = 0.9  # Bullish crossover
            elif macd_prev > signal_prev and macd_line < signal_line:
                macd_score = -0.9  # Bearish crossover
            else:
                macd_score = 0.3 if macd_line > signal_line else -0.3

            # --- Bollinger Bands ---
            bb = BollingerBands(
                close,
                window=self._settings.bb_period,
                window_dev=self._settings.bb_std,
            )
            bb_upper = float(bb.bollinger_hband().iloc[-1])
            bb_lower = float(bb.bollinger_lband().iloc[-1])
            bb_mid = float(bb.bollinger_mavg().iloc[-1])

            if current_price <= bb_lower:
                bb_score = 0.7  # At or below lower band = potential buy
            elif current_price >= bb_upper:
                bb_score = -0.7  # At or above upper band = potential sell
            else:
                # Position within bands
                bb_range = bb_upper - bb_lower
                if bb_range > 0:
                    bb_score = (bb_mid - current_price) / bb_range
                else:
                    bb_score = 0.0

            # --- Trend (SMA) ---
            sma_20 = float(close.tail(20).mean())
            sma_50 = float(close.tail(50).mean())

            if current_price > sma_20 > sma_50:
                trend_score = 0.8  # Strong uptrend
            elif current_price > sma_20:
                trend_score = 0.4  # Moderate uptrend
            elif current_price < sma_20 < sma_50:
                trend_score = -0.8  # Strong downtrend
            else:
                trend_score = -0.3  # Weak

            # --- Volume ---
            avg_vol_20 = float(volume.tail(20).mean())
            recent_vol = float(volume.tail(3).mean())
            vol_ratio = recent_vol / max(avg_vol_20, 1)

            if vol_ratio > 1.5:
                vol_score = 0.6  # Increasing volume confirms move
            elif vol_ratio > 1.0:
                vol_score = 0.3
            else:
                vol_score = -0.2  # Decreasing volume = weak signal

            # --- Composite Score ---
            score = (
                rsi_score * self._settings.weight_rsi
                + macd_score * self._settings.weight_macd
                + bb_score * self._settings.weight_bollinger
                + trend_score * self._settings.weight_trend
                + vol_score * self._settings.weight_volume
            )

            # Determine action
            if score > 0.5:
                action = SignalAction.BUY
            elif score < -0.5:
                action = SignalAction.SELL
            else:
                return None  # HOLD = no signal

            confidence = min(abs(score), 1.0)

            # Calculate entry, stop loss, take profit
            atr = self._calculate_atr(high, low, close, period=14)
            if action == SignalAction.BUY:
                entry_price = current_price
                stop_loss = round(entry_price - (atr * 2), 2)  # 2x ATR below
                take_profit = round(entry_price + (atr * 4), 2)  # 4x ATR above (2:1 R/R)
            else:
                entry_price = current_price
                stop_loss = round(entry_price + (atr * 2), 2)
                take_profit = round(entry_price - (atr * 4), 2)

            rationale = self._build_rationale(
                rsi_value, macd_score, bb_score, trend_score, vol_ratio
            )

            return Signal(
                symbol=symbol,
                action=action,
                confidence=round(confidence, 3),
                score=round(score, 3),
                entry_price=round(entry_price, 2),
                stop_loss=stop_loss,
                take_profit=take_profit,
                rationale=rationale,
            )

        except Exception as e:
            self.logger.debug("analysis_error", symbol=symbol, error=str(e))
            return None

    @staticmethod
    def _calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int) -> float:
        """Calculate Average True Range."""
        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ], axis=1).max(axis=1)
        return float(tr.tail(period).mean())

    @staticmethod
    def _build_rationale(
        rsi: float, macd_score: float, bb_score: float, trend_score: float, vol_ratio: float
    ) -> str:
        """Build human-readable rationale for the signal."""
        parts: list[str] = []

        if rsi < 30:
            parts.append(f"RSI oversold ({rsi:.0f})")
        elif rsi > 70:
            parts.append(f"RSI overbought ({rsi:.0f})")

        if abs(macd_score) > 0.5:
            direction = "bullish" if macd_score > 0 else "bearish"
            parts.append(f"MACD {direction} crossover")

        if abs(bb_score) > 0.3:
            position = "lower band" if bb_score > 0 else "upper band"
            parts.append(f"near Bollinger {position}")

        if abs(trend_score) > 0.5:
            trend = "uptrend" if trend_score > 0 else "downtrend"
            parts.append(f"strong {trend}")

        if vol_ratio > 1.5:
            parts.append(f"volume surge {vol_ratio:.1f}x")

        return " + ".join(parts) if parts else "Composite signal"
