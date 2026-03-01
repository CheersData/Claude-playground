"""
Data Loader — Download and cache historical OHLCV data from Alpaca.

Caches to Parquet files in .backtest-cache/ for offline backtesting.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import structlog

logger = structlog.get_logger()

DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent.parent / ".backtest-cache"


class DataLoader:
    """Downloads and caches historical OHLCV data from Alpaca."""

    def __init__(
        self,
        api_key: str | None = None,
        secret_key: str | None = None,
        cache_dir: Path = DEFAULT_CACHE_DIR,
    ) -> None:
        self._api_key = api_key or os.environ.get("ALPACA_API_KEY", "")
        self._secret_key = secret_key or os.environ.get("ALPACA_SECRET_KEY", "")
        self._cache_dir = cache_dir
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def load(
        self,
        symbols: list[str],
        start: date,
        end: date,
    ) -> dict[str, pd.DataFrame]:
        """
        Load daily bars for symbols from start to end (inclusive).

        Returns dict[symbol, DataFrame] with columns: open, high, low, close, volume.
        Index is DatetimeIndex named 'timestamp'.
        """
        result: dict[str, pd.DataFrame] = {}
        to_download: list[str] = []

        # Check cache first
        for symbol in symbols:
            cached = self._load_from_cache(symbol, start, end)
            if cached is not None:
                result[symbol] = cached
                logger.debug("cache_hit", symbol=symbol, rows=len(cached))
            else:
                to_download.append(symbol)

        if to_download:
            logger.info(
                "downloading_data",
                symbols=len(to_download),
                cached=len(result),
                start=str(start),
                end=str(end),
            )
            downloaded = self._download_batch(to_download, start, end)
            for symbol, df in downloaded.items():
                self._save_to_cache(symbol, start, end, df)
                result[symbol] = df

        logger.info("data_loaded", total_symbols=len(result))
        return result

    def _cache_path(self, symbol: str, start: date, end: date) -> Path:
        """Return path to Parquet cache file."""
        return self._cache_dir / f"{symbol}_{start.isoformat()}_{end.isoformat()}.parquet"

    def _load_from_cache(self, symbol: str, start: date, end: date) -> pd.DataFrame | None:
        """Try to load from cache. Returns None if not found or incomplete."""
        # Check for exact match first
        exact = self._cache_path(symbol, start, end)
        if exact.exists():
            try:
                df = pd.read_parquet(exact)
                if len(df) > 0:
                    return df
            except Exception:
                pass

        # Check for any cached file that covers our range
        for f in self._cache_dir.glob(f"{symbol}_*.parquet"):
            parts = f.stem.split("_")
            if len(parts) >= 3:
                try:
                    cached_start = date.fromisoformat(parts[1])
                    cached_end = date.fromisoformat(parts[2])
                    if cached_start <= start and cached_end >= end:
                        df = pd.read_parquet(f)
                        # Slice to requested range
                        mask = (df.index >= pd.Timestamp(start)) & (
                            df.index <= pd.Timestamp(end)
                        )
                        sliced = df[mask]
                        if len(sliced) > 0:
                            return sliced
                except (ValueError, IndexError):
                    continue
        return None

    def _download_batch(
        self, symbols: list[str], start: date, end: date
    ) -> dict[str, pd.DataFrame]:
        """Download bars from Alpaca for multiple symbols."""
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame

        client = StockHistoricalDataClient(self._api_key, self._secret_key)
        result: dict[str, pd.DataFrame] = {}

        # Batch in groups of 20 to avoid API limits
        batch_size = 20
        for i in range(0, len(symbols), batch_size):
            batch = symbols[i : i + batch_size]
            logger.info(
                "downloading_batch",
                batch=f"{i // batch_size + 1}/{(len(symbols) - 1) // batch_size + 1}",
                symbols=len(batch),
            )

            try:
                request = StockBarsRequest(
                    symbol_or_symbols=batch,
                    timeframe=TimeFrame.Day,
                    start=datetime.combine(start, datetime.min.time()),
                    end=datetime.combine(end, datetime.min.time()),
                )
                bars = client.get_stock_bars(request)

                for symbol in batch:
                    if symbol in bars.data and bars.data[symbol]:
                        data = []
                        for bar in bars.data[symbol]:
                            data.append(
                                {
                                    "timestamp": bar.timestamp,
                                    "open": float(bar.open),
                                    "high": float(bar.high),
                                    "low": float(bar.low),
                                    "close": float(bar.close),
                                    "volume": int(bar.volume),
                                }
                            )
                        if data:
                            df = pd.DataFrame(data).set_index("timestamp")
                            result[symbol] = df
                            logger.debug(
                                "symbol_downloaded", symbol=symbol, bars=len(df)
                            )
                    else:
                        logger.warning("no_data", symbol=symbol)

            except Exception as e:
                logger.error("download_error", batch=batch, error=str(e))

        return result

    def _save_to_cache(self, symbol: str, start: date, end: date, df: pd.DataFrame) -> None:
        """Save DataFrame to Parquet cache."""
        path = self._cache_path(symbol, start, end)
        df.to_parquet(path)
        logger.debug("cache_saved", symbol=symbol, path=str(path))
