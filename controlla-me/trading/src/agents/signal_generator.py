"""
Signal Generator Agent

Performs technical analysis on watchlist candidates to generate BUY/SELL signals.
Uses the shared composite-score analysis from src.analysis (single source of truth).
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from ..analysis import analyze_composite, analyze_slope_volume
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

    async def run(
        self,
        watchlist: list[dict] | None = None,
        timeframe: str = "1Day",
        **kwargs: Any,
    ) -> dict:
        """
        Generate signals for watchlist candidates.

        Args:
            watchlist: List of ScanResult dicts. If None, reads latest scan from DB.
            timeframe: Bar timeframe — "1Day" (default) or "1Hour" (intraday).
                       Hourly bars give real-time signals during market hours.
        """
        if watchlist is None:
            scans = self._db.get_latest_signals("scan", limit=1)
            if not scans:
                self.log_error("No scan data found")
                return {"signals": [], "error": "No scan data"}
            watchlist = scans[0].get("data", {}).get("watchlist", [])

        symbols = [c["symbol"] for c in watchlist]
        # 1Day: 1 year of history for robust indicators.
        # 1Hour: 30 days (~390 bars) — enough for RSI/MACD/BB, avoids hitting rate limits.
        days_back = 365 if timeframe == "1Day" else 30
        self.log_start(watchlist_size=len(symbols), timeframe=timeframe)

        bars = self._alpaca.get_bars(symbols, timeframe=timeframe, days_back=days_back)

        signals: list[dict] = []
        for symbol, df in bars.items():
            if len(df) < 50:
                continue

            signal = self._analyze_stock(symbol, df, timeframe=timeframe)
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

    def _analyze_stock(self, symbol: str, df: pd.DataFrame, **kwargs: Any) -> Signal | None:
        """Run technical analysis using the shared composite-score module."""
        s = self._settings
        timeframe = kwargs.get("timeframe", "1Day")

        result = analyze_composite(
            symbol,
            df,
            rsi_period=s.rsi_period,
            rsi_oversold=s.rsi_oversold,
            rsi_overbought=s.rsi_overbought,
            macd_fast=s.macd_fast,
            macd_slow=s.macd_slow,
            macd_signal=s.macd_signal,
            bb_period=s.bb_period,
            bb_std=s.bb_std,
            weight_rsi=s.weight_rsi,
            weight_macd=s.weight_macd,
            weight_bollinger=s.weight_bollinger,
            weight_trend=s.weight_trend,
            weight_volume=s.weight_volume,
            score_buy_threshold=s.score_buy_threshold,
            score_sell_threshold=s.score_sell_threshold,
            stop_loss_atr=2.5,
            take_profit_atr=6.0,
            timeframe=timeframe,
        )

        if result is None:
            return None

        return Signal(
            symbol=result["symbol"],
            action=SignalAction.BUY if result["action"] == "BUY" else SignalAction.SELL,
            confidence=result["confidence"],
            score=result["score"],
            entry_price=result["entry_price"],
            stop_loss=result["stop_loss"],
            take_profit=result["take_profit"],
            rationale=result["rationale"],
        )

    def run_slope_volume(self) -> dict:
        """
        Run the slope+volume intraday strategy on the configured symbol (default: SPY).

        Fetches the most recent 5-min bars from Alpaca in real-time and evaluates
        the slope+volume entry signal. If the strategy is disabled via settings
        (TRADING_SLOPE_ENABLED=false), returns immediately with a skip marker.

        Returns:
            dict with keys:
                strategy (str), symbol (str), timeframe (str),
                signals (list[dict]), signals_generated (int).
            On error: adds "error" key with message string.
            When disabled: adds "skipped" key.
        """
        slope_cfg = get_settings().slope_volume

        if not slope_cfg.enabled:
            return {"signals": [], "skipped": "slope_volume_disabled"}

        symbol = slope_cfg.symbol
        # Compute how many bars to fetch: need enough history for both the
        # current and previous slope windows, the volume MA, and the ATR.
        n_bars = max(
            slope_cfg.lookback_bars * 2
            + slope_cfg.volume_ma_period
            + slope_cfg.atr_period
            + 10,
            60,
        )

        self.log_start(strategy="slope_volume", symbol=symbol, timeframe=slope_cfg.timeframe)

        df = self._alpaca.get_latest_bars(
            symbol,
            timeframe=slope_cfg.timeframe,
            n_bars=n_bars,
        )
        if df.empty:
            self.log_error("no_data", symbol=symbol)
            return {"signals": [], "error": "No data from Alpaca"}

        result = analyze_slope_volume(
            symbol,
            df,
            lookback_bars=slope_cfg.lookback_bars,
            slope_threshold_pct=slope_cfg.slope_threshold_pct,
            volume_multiplier=slope_cfg.volume_multiplier,
            volume_ma_period=slope_cfg.volume_ma_period,
            stop_loss_atr=slope_cfg.stop_loss_atr,
            take_profit_atr=slope_cfg.take_profit_atr,
            atr_period=slope_cfg.atr_period,
            market_open_utc=slope_cfg.market_open_utc,
            market_close_utc=slope_cfg.market_close_utc,
            min_bars=slope_cfg.min_bars,
            timeframe=slope_cfg.timeframe,
        )

        signals: list[dict] = []
        if result is not None:
            signals.append(
                Signal(
                    symbol=result["symbol"],
                    action=SignalAction.BUY if result["action"] == "BUY" else SignalAction.SELL,
                    confidence=result["confidence"],
                    score=result["score"],
                    entry_price=result["entry_price"],
                    stop_loss=result["stop_loss"],
                    take_profit=result["take_profit"],
                    rationale=result["rationale"],
                ).model_dump(mode="json")
            )

        signal_data = {
            "strategy": "slope_volume",
            "symbol": symbol,
            "timeframe": slope_cfg.timeframe,
            "signals": signals,
            "signals_generated": len(signals),
        }
        self._db.insert_signal("trade", signal_data)
        self.log_complete(strategy="slope_volume", signals=len(signals))
        return signal_data
