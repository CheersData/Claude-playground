"""
Data Loader — Download and cache historical OHLCV data.

Sources:
- Daily bars:  Alpaca StockHistoricalDataClient (full history)
- Hourly bars: yfinance (up to 730 days free)
- 5Min bars:   Alpaca StockHistoricalDataClient (free tier: up to ~1 year)
- 15Min bars:  Alpaca StockHistoricalDataClient (free tier: up to ~1 year)

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
            timeframe: "1Day", "1Hour", "15Min", or "5Min".

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
            has_alpaca = bool(self._api_key and self._secret_key)

            if timeframe == "1Hour":
                downloaded = self._download_batch_yfinance(to_download, start, end, timeframe)
            elif timeframe == "15Min":
                if has_alpaca:
                    downloaded = self._download_batch_alpaca_intraday(to_download, start, end, minutes=15)
                else:
                    logger.warning("alpaca_keys_missing", fallback="yfinance", timeframe=timeframe)
                    downloaded = self._download_batch_yfinance(to_download, start, end, timeframe)
            elif timeframe == "5Min":
                if has_alpaca:
                    downloaded = self._download_batch_alpaca_intraday(to_download, start, end, minutes=5)
                else:
                    logger.warning("alpaca_keys_missing", fallback="yfinance", timeframe=timeframe)
                    downloaded = self._download_batch_yfinance(to_download, start, end, timeframe)
            else:
                # Daily bars: try Alpaca first, fall back to yfinance if no keys
                if has_alpaca:
                    downloaded = self._download_batch_alpaca(to_download, start, end)
                else:
                    logger.warning("alpaca_keys_missing", fallback="yfinance", timeframe=timeframe)
                    downloaded = self._download_batch_yfinance(to_download, start, end, timeframe)

            for symbol, df in downloaded.items():
                self._save_to_cache(symbol, start, end, timeframe, df)
                result[symbol] = df

        logger.info("data_loaded", total_symbols=len(result), timeframe=timeframe)
        return result

    def load_multi_timeframe(
        self,
        symbols: list[str],
        start: date,
        end: date,
        primary_timeframe: str = "15Min",
        secondary_timeframe: str = "1Day",
    ) -> tuple[dict[str, pd.DataFrame], dict[str, pd.DataFrame]]:
        """
        Load both primary and secondary timeframe data for dual-timeframe strategies.

        Used by Mean Reversion v3: primary=15Min (trade signals), secondary=1Day (trend filter).

        Returns:
            (primary_data, secondary_data) — both are dict[symbol, DataFrame].
        """
        logger.info(
            "loading_multi_timeframe",
            symbols=len(symbols),
            primary=primary_timeframe,
            secondary=secondary_timeframe,
            start=str(start),
            end=str(end),
        )

        # Load primary (e.g. 15Min bars)
        primary_data = self.load(symbols, start, end, timeframe=primary_timeframe)

        # Load secondary (e.g. Daily bars) — need extra history for SMA warmup
        # Add 60 extra days before start for daily SMA calculation
        secondary_start = date(
            start.year if start.month > 3 else start.year - 1,
            max(start.month - 3, 1) if start.month > 3 else start.month + 9,
            1,
        )
        secondary_data = self.load(symbols, secondary_start, end, timeframe=secondary_timeframe)

        logger.info(
            "multi_timeframe_loaded",
            primary_symbols=len(primary_data),
            secondary_symbols=len(secondary_data),
            primary_tf=primary_timeframe,
            secondary_tf=secondary_timeframe,
        )

        return primary_data, secondary_data

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
                        # Slice to requested range (tz-aware safe)
                        ts_start = pd.Timestamp(start)
                        ts_end = pd.Timestamp(end) + pd.Timedelta(days=1)
                        if df.index.tz is not None:
                            ts_start = ts_start.tz_localize(df.index.tz)
                            ts_end = ts_end.tz_localize(df.index.tz)
                        mask = (df.index >= ts_start) & (df.index <= ts_end)
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
    # Alpaca intraday download (15Min bars via Alpaca API)
    # ------------------------------------------------------------------

    def _download_batch_alpaca_intraday(
        self, symbols: list[str], start: date, end: date, minutes: int = 15
    ) -> dict[str, pd.DataFrame]:
        """Download sub-hourly bars from Alpaca (15Min supported by paper account)."""
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

        client = StockHistoricalDataClient(self._api_key, self._secret_key)
        tf = TimeFrame(minutes, TimeFrameUnit.Minute)
        result: dict[str, pd.DataFrame] = {}

        # Alpaca limits: request in 30-day chunks to stay within API bounds
        max_chunk_days = 30
        batch_size = 10

        for i in range(0, len(symbols), batch_size):
            batch = symbols[i : i + batch_size]
            all_chunks: list[pd.DataFrame] = []
            chunk_start = start

            while chunk_start < end:
                chunk_end = min(chunk_start + timedelta(days=max_chunk_days), end)
                try:
                    request = StockBarsRequest(
                        symbol_or_symbols=batch,
                        timeframe=tf,
                        start=datetime.combine(chunk_start, datetime.min.time()),
                        end=datetime.combine(chunk_end, datetime.min.time()),
                    )
                    bars = client.get_stock_bars(request)

                    for symbol in batch:
                        if symbol in bars.data and bars.data[symbol]:
                            data = [
                                {
                                    "timestamp": bar.timestamp,
                                    "open": float(bar.open),
                                    "high": float(bar.high),
                                    "low": float(bar.low),
                                    "close": float(bar.close),
                                    "volume": int(bar.volume),
                                }
                                for bar in bars.data[symbol]
                            ]
                            if data:
                                df = pd.DataFrame(data).set_index("timestamp")
                                if symbol not in result:
                                    result[symbol] = df
                                else:
                                    result[symbol] = pd.concat([result[symbol], df])
                except Exception as e:
                    logger.error("download_error_intraday", batch=batch, error=str(e))
                chunk_start = chunk_end + timedelta(days=1)

        for symbol in result:
            result[symbol] = result[symbol][~result[symbol].index.duplicated(keep="first")]
            result[symbol].sort_index(inplace=True)
            logger.debug("symbol_downloaded", symbol=symbol, bars=len(result[symbol]), source="alpaca_15min")

        return result

    # ------------------------------------------------------------------
    # yfinance download (all timeframes — fallback when Alpaca keys missing)
    # ------------------------------------------------------------------

    def _download_batch_yfinance(
        self, symbols: list[str], start: date, end: date, timeframe: str = "1Hour"
    ) -> dict[str, pd.DataFrame]:
        """
        Download bars from yfinance for multiple symbols.

        Supports daily, hourly, 15min, and 5min timeframes.
        yfinance supports up to 730 days of hourly data and unlimited daily data.
        We download in chunks if the range exceeds API limits per request.
        Used as primary source for hourly data and as fallback when Alpaca keys
        are not configured.
        """
        try:
            import yfinance as yf
        except ImportError:
            logger.error("yfinance_not_installed", msg="pip install yfinance")
            return {}

        result: dict[str, pd.DataFrame] = {}

        # yfinance interval mapping
        yf_interval_map = {
            "1Hour": "1h",
            "15Min": "15m",
            "5Min": "5m",
            "1Min": "1m",
        }
        interval = yf_interval_map.get(timeframe, "1d")

        # yfinance limits intraday requests to ~59 days per chunk (7 days for <1h)
        if interval in ("1m", "5m", "15m"):
            max_chunk_days = 7 if interval == "1m" else 59
        elif interval == "1h":
            max_chunk_days = 59
        else:
            max_chunk_days = 365 * 5

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
