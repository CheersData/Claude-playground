"""
Market Scanner Agent — Pre-market daily screening.

Filters the investment universe (S&P 500 + NASDAQ 100 + ETFs) using:
- Volume filters (min 500k avg daily)
- Price range ($5-$500)
- ATR volatility scoring
- Trend identification (SMA 20/50/200)
- Sector diversification

Output: Ranked watchlist of 20-30 candidates.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
from ta.volatility import AverageTrueRange
from ta.trend import SMAIndicator

from .base import BaseAgent
from ..config import get_settings
from ..connectors.alpaca_client import AlpacaClient
from ..connectors.tiingo_client import TiingoClient
from ..models.signals import ScanResult


# S&P 500 + NASDAQ 100 core symbols + sector rotation coverage
DEFAULT_UNIVERSE = [
    # Mega-cap tech / growth
    "AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "TSLA",
    # Healthcare
    "UNH", "JNJ", "ABBV", "MRK", "LLY", "ABT", "TMO", "DHR", "AMGN",
    # Financials
    "JPM", "V", "MA", "BRK.B",
    # Consumer
    "PG", "HD", "PEP", "KO", "COST", "MCD", "WMT", "PM",
    # Tech / Semis
    "AVGO", "CSCO", "ACN", "TXN",
    # Energy
    "XOM", "CVX",
    # Industrials
    "LIN", "NEE",
    # Defense — sector rotation target
    "LMT", "NOC", "RTX", "GD",
    # Utilities — defensive rotation
    "XLU", "SO",
    # Consumer Staples ETF — defensive, non-cyclical
    "XLP",
    # Real Estate — defensive yield play
    "XLRE",
    # Commodities / Hard assets — rotation in corso
    "GLD", "GDX", "USO", "DBA",
    # Bonds — safe haven / rates hedge
    "TLT",   # 20Y Treasury — long-duration, flight-to-quality
    "SHY",   # 1-3Y Treasury — short-duration, low-volatility safe haven
    # Broad ETFs
    "SPY", "QQQ", "IWM",
    # Sector ETFs
    "XLF", "XLK", "XLE", "XLV", "XLI", "ARKK",
    # Inverse ETFs (1x, non-leveraged) — bearish market hedges
    # Activated by scanner scoring when trend = bearish; low score in bull markets
    "SH",   # ProShares Short S&P500
    "PSQ",  # ProShares Short QQQ
    "DOG",  # ProShares Short Dow30
]


class MarketScanner(BaseAgent):
    """Screens the universe for trading candidates."""

    def __init__(self) -> None:
        super().__init__("market_scanner")
        self._alpaca = AlpacaClient()
        cfg = get_settings()
        # Use Tiingo IEX (real-time) for market data when configured.
        # Alpaca free tier has 15-min delay; Tiingo IEX has no delay.
        if cfg.tiingo.tiingo_api_key and cfg.tiingo.use_tiingo_for_market_data:
            self._market_data = TiingoClient(cfg.tiingo.tiingo_api_key)
            self.logger.info("market_data_provider", provider="tiingo_iex_rt")
        else:
            self._market_data = self._alpaca  # type: ignore[assignment]
            self.logger.warning(
                "market_data_provider",
                provider="alpaca_delayed",
                delay_min=15,
                hint="Set TIINGO_API_KEY to get real-time IEX data",
            )
        self._settings = cfg.scanner

    async def run(self, universe: list[str] | None = None, **kwargs: Any) -> dict:
        """
        Run the daily market scan.

        Args:
            universe: Optional list of symbols to scan. Defaults to DEFAULT_UNIVERSE.

        Returns:
            dict with watchlist and metadata
        """
        symbols = universe or DEFAULT_UNIVERSE
        self.log_start(universe_size=len(symbols))

        # Fetch historical bars (60 days for SMA calculations)
        bars = self._market_data.get_bars(symbols, timeframe="1Day", days_back=60)

        candidates: list[ScanResult] = []

        for symbol, df in bars.items():
            if len(df) < 20:  # Need at least 20 days of data
                continue

            result = self._score_symbol(symbol, df)
            if result is not None:
                candidates.append(result)

        # Sort by composite score, take top N
        candidates.sort(key=lambda x: x.score, reverse=True)

        # --- Diversity override (post-processing) ---
        # Reserve min_hedge_slots slots for decorrelated/defensive instruments so
        # the watchlist stays balanced even in a strong bull market where inverse
        # and defensive ETFs naturally score low (trend_score = 0.2).
        min_hedge = self._settings.min_hedge_slots
        normal_slots = max(self._settings.watchlist_size - min_hedge, 0)

        # Top-N normal candidates (may already include some hedge symbols — that's fine)
        top_normal = candidates[:normal_slots]
        top_normal_symbols = {c.symbol for c in top_normal}

        # Build a lookup of all scored candidates for quick retrieval
        scored_by_symbol = {c.symbol: c for c in candidates}

        # Pick hedge candidates: scored instruments in hedge_symbols pool
        # that didn't make it into the top-N normal slice.
        hedge_added: list[ScanResult] = []
        for sym in self._settings.hedge_symbols:
            if len(hedge_added) >= min_hedge:
                break
            if sym in top_normal_symbols:
                # Already in watchlist — counts toward hedge coverage
                continue
            if sym in scored_by_symbol:
                hedge_added.append(scored_by_symbol[sym])

        watchlist = top_normal + hedge_added

        if hedge_added:
            self.logger.info(
                "hedge_slots_filled",
                count=len(hedge_added),
                symbols=[c.symbol for c in hedge_added],
            )

        self.log_complete(
            universe_scanned=len(symbols),
            candidates_found=len(watchlist),
        )

        return {
            "watchlist": [c.model_dump() for c in watchlist],
            "universe_scanned": len(symbols),
            "candidates_found": len(watchlist),
        }

    def _score_symbol(self, symbol: str, df: pd.DataFrame) -> ScanResult | None:
        """Score a single symbol based on technical criteria."""
        latest = df.iloc[-1]

        # Price filter
        price = latest["close"]
        if price < self._settings.min_price or price > self._settings.max_price:
            return None

        # Volume filter (20-day average)
        avg_volume = int(df["volume"].tail(20).mean())
        if avg_volume < self._settings.min_volume:
            return None

        # ATR (volatility)
        atr = AverageTrueRange(
            high=df["high"], low=df["low"], close=df["close"], window=14
        )
        atr_value = atr.average_true_range().iloc[-1]
        atr_pct = (atr_value / price) * 100

        # Trend (SMA crossovers)
        sma_short = SMAIndicator(close=df["close"], window=self._settings.trend_period_short)
        sma_long = SMAIndicator(close=df["close"], window=self._settings.trend_period_medium)

        sma_s = sma_short.sma_indicator().iloc[-1]
        sma_l = sma_long.sma_indicator().iloc[-1]

        if pd.isna(sma_s) or pd.isna(sma_l):
            trend = "neutral"
        elif sma_s > sma_l:
            trend = "bullish"
        elif sma_s < sma_l:
            trend = "bearish"
        else:
            trend = "neutral"

        # Composite score
        volume_score = min(avg_volume / 5_000_000, 1.0)  # Normalize to 5M
        trend_score = {"bullish": 0.8, "neutral": 0.5, "bearish": 0.2}[trend]
        volatility_score = min(atr_pct / 3.0, 1.0)  # Normalize to 3% ATR

        score = (volume_score * 0.3) + (trend_score * 0.4) + (volatility_score * 0.3)

        return ScanResult(
            symbol=symbol,
            score=round(score, 3),
            trend=trend,
            atr_pct=round(atr_pct, 2),
            avg_volume=avg_volume,
            current_price=round(price, 2),
        )
