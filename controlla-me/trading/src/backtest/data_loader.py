"""
Data Loader — Download and cache historical OHLCV data.

Sources:
- Daily bars: Alpaca StockHistoricalDataClient (full history)
- Hourly bars: yfinance (up to 730 days free)

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
    """Downloads and caches historical OHLCV data."""

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
        timeframe: str = "1Day",
    ) -> dict[str, pd.DataFrame]:
        """
        Load OHLCV bars for symbols from start to end (inclusive).

        Args:
            symbols: List of ticker symbols.
            start: Start date.
            end: End date.
            timeframe: "1Day" or "1Hour".

        Returns:
            dict[symbol, DataFrame] with columns: open, high, low, close, volume.
            Index is DatetimeIndex named 'timestamp'.
        """
        result: dict[str, pd.DataFrame] = {}
        to_download: list[str] = []

        # Check cache first
        for symbol in symbols:
            cached = self._load_from_cache(symbol, start, end, timeframe)
            if cached is not None:
                result[symbol] = cached
                logger.debug("cache_hit", symbol=symbol, rows=len(cached), tf=timeframe)
            else:
                to_download.append(symbol)

        if to_download:
            logger.info(
                "downloading_data",
                symbols=len(to_download),
                cached=len(result),
                start=str(start),
                end=str(end),
                timeframe=timeframe,
            )
            if timeframe == "1Hour":
                downloaded = self._download_batch_yfinance(to_download, start, end, timeframe)
            else:
                downloaded = self._download_batch_alpaca(to_download, start, end)

            for symbol, df in downloaded.items():
                self._save_to_cache(symbol, start, end, timeframe, df)
                result[symbol] = df

        logger.info("data_loaded", total_symbols=len(result), timeframe=timeframe)
        return result

    # ------------------------------------------------------------------
    # Cache
    # ------------------------------------------------------------------

    def _cache_path(self, symbol: str, start: date, end: date, timeframe: str = "1Day") -> Path:
        """Return path to Parquet cache file (includes timeframe in name)."""
        return self._cache_dir / f"{symbol}_{timeframe}_{start.isoformat()}_{end.isoformat()}.parquet"

    def _load_from_cache(
        self, symbol: str, start: date, end: date, timeframe: str = "1Day"
    ) -> pd.DataFrame | None:
        """Try to load from cache. Returns None if not found or incomplete."""
        # Check for exact match first
        exact = self._cache_path(symbol, start, end, timeframe)
        if exact.exists():
            try:
                df = pd.read_parquet(exact)
                if len(df) > 0:
                    return df
            except Exception:
                pass

        # Check for any cached file that covers our range (same timeframe)
        for f in self._cache_dir.glob(f"{symbol}_{timeframe}_*.parquet"):
            parts = f.stem.split("_")
            # Format: SYMBOL_TIMEFRAME_START_END
            if len(parts) >= 4:
                try:
                    cached_start = date.fromisoformat(parts[2])
                    cached_end = date.fromisoformat(parts[3])
                    if cached_start <= start and cached_end >= end:
                        df = pd.read_parquet(f)
                        # Slice to requested range
                        mask = (df.index >= pd.Timestamp(start)) & (
                            df.index <= pd.Timestamp(end) + pd.Timedelta(days=1)
                        )
                        sliced = df[mask]
                        if len(sliced) > 0:
                            return sliced
                except (ValueError, IndexError):
                    continue
        return None

    def _save_to_cache(
        self, symbol: str, start: date, end: date, timeframe: str, df: pd.DataFrame
    ) -> None:
        """Save DataFrame to Parquet cache."""
        path = self._cache_path(symbol, start, end, timeframe)
        df.to_parquet(path)
        logger.debug("cache_saved", symbol=symbol, path=str(path), tf=timeframe)

    # ------------------------------------------------------------------
    # Alpaca download (daily bars — full history)
    # ------------------------------------------------------------------

    def _download_batch_alpaca(
        self, symbols: list[str], start: date, end: date
    ) -> dict[str, pd.DataFrame]:
        """Download daily bars from Alpaca for multiple symbols."""
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
                "downloading_batch_alpaca",
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
                                "symbol_downloaded", symbol=symbol, bars=len(df), source="alpaca"
                            )
                    else:
                        logger.warning("no_data", symbol=symbol, source="alpaca")

            except Exception as e:
                logger.error("download_error", batch=batch, error=str(e), source="alpaca")

        return result

    # ------------------------------------------------------------------
    # yfinance download (hourly bars — up to 730 days)
    # ------------------------------------------------------------------

    def _download_batch_yfinance(
        self, symbols: list[str], start: date, end: date, timeframe: str = "1Hour"
    ) -> dict[str, pd.DataFrame]:
        """
        Download hourly bars from yfinance for multiple symbols.

        yfinance supports up to 730 days of hourly data for free.
        We download in chunks if the range exceeds 59 days (yfinance
        limit per single request for intraday data).
        """
        try:
            import yfinance as yf
        except ImportError:
            logger.error("yfinance_not_installed", msg="pip install yfinance")
            return {}

        result: dict[str, pd.DataFrame] = {}

        # yfinance interval mapping
        interval = "1h" if timeframe == "1Hour" else "1d"

        # yfinance limits intraday requests to ~59 days per chunk
        max_chunk_days = 59 if interval == "1h" else 365 * 5

        for symbol in symbols:
            logger.info("downloading_yfinance", symbol=symbol, interval=interval)
            try:
                all_chunks: list[pd.DataFrame] = []
                chunk_start = start

                while chunk_start < end:
                    chunk_end = min(chunk_start + timedelta(days=max_chunk_days), end)

                    ticker = yf.Ticker(symbol)
                    df = ticker.history(
                        start=str(chunk_start),
                        end=str(chunk_end + timedelta(days=1)),  # end is exclusive in yfinance
                        interval=interval,
                        auto_adjust=True,
                    )

                    if df is not None and len(df) > 0:
                        # Normalize column names to lowercase
                        df.columns = [c.lower() for c in df.columns]
                        # Keep only OHLCV columns
                        cols = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
                        df = df[cols]
                        # Rename index
                        df.index.name = "timestamp"
                        all_chunks.append(df)

                    chunk_start = chunk_end + timedelta(days=1)

                if all_chunks:
                    combined = pd.concat(all_chunks)
                    # Remove duplicates (overlap between chunks)
                    combined = combined[~combined.index.duplicated(keep="first")]
                    combined.sort_index(inplace=True)
                    result[symbol] = combined
                    logger.debug(
                        "symbol_downloaded",
                        symbol=symbol,
                        bars=len(combined),
                        source="yfinance",
                    )
                else:
                    logger.warning("no_data", symbol=symbol, source="yfinance")

            except Exception as e:
                logger.error("download_error", symbol=symbol, error=str(e), source="yfinance")

        return result
