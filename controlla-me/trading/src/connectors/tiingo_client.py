"""
Tiingo Market Data Client — REST API wrapper.

Tiingo market data client — IEX real-time data.

Free tier: 50 req/hour — INSUFFICIENTE per uso intraday (9 sym × 12 cicli/h = 108 req/h).
Piano Power/Enterprise ($10-30/mese): limiti molto più alti (5000+ req/h).
Configurare TIINGO_API_KEY con chiave del piano paid.

Use as a drop-in alternative to Alpaca's market data for `get_bars()` and
`get_latest_bars()`. AlpacaClient remains the trading/order client — Tiingo
only provides market data.

Docs: https://api.tiingo.com/documentation
IEX:  https://api.tiingo.com/documentation/iex
"""

from __future__ import annotations

import math
import time
from datetime import datetime, timedelta
from typing import Any

import pandas as pd
import requests

from ..config import get_settings

# Max attempts on HTTP 429 before raising
_MAX_RETRIES_429 = 3
# Initial backoff on 429 (seconds) — doubled on each attempt
_BACKOFF_429_BASE = 10

# Tiingo API base URL
_TIINGO_BASE = "https://api.tiingo.com"
# Max symbols per IEX batch request
_IEX_BATCH_SIZE = 50

# Tiingo Crypto API base path
_CRYPTO_BASE = f"{_TIINGO_BASE}/tiingo/crypto"

# Map our timeframe strings to Tiingo resampleFreq parameter values.
# IEX intraday endpoint supports: 1min, 5min, 15min, 30min, 1hour
_TIMEFRAME_TO_RESAMPLE: dict[str, str] = {
    "1Min": "1min",
    "1min": "1min",
    "5Min": "5min",
    "5min": "5min",
    "15Min": "15min",
    "15min": "15min",
    "30Min": "30min",
    "30min": "30min",
    "1Hour": "1hour",
    "1hour": "1hour",
}


class TiingoClient:
    """Market data client backed by the Tiingo REST API.

    Provides the same `get_bars()` and `get_latest_bars()` interface as
    AlpacaClient so it can be used as a drop-in for market-data-only use
    cases (scanner, signal generator).

    Requires TIINGO_API_KEY in .env.local.

    Rate limiting:
        A minimal inter-request sleep of ``3600 / requests_per_hour`` seconds is
        applied between consecutive API calls to stay within the plan's rate limit.
        Default (5000 req/h → ~0.72 s/req) is tuned for the Power/Enterprise paid
        plan. Free tier (50 req/h → 72 s/req) is impractical for intraday use.

    Raises:
        ValueError: If TIINGO_API_KEY is not set.
    """

    def __init__(self, api_key: str | None = None) -> None:
        settings = get_settings()
        key = api_key or settings.tiingo.tiingo_api_key
        if not key:
            raise ValueError(
                "TIINGO_API_KEY is not configured. "
                "Add it to .env.local: TIINGO_API_KEY=your_key_here"
            )
        self._token = key
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Token {self._token}",
                "Content-Type": "application/json",
            }
        )
        # Inter-request sleep in seconds derived from the configured rate limit.
        # Ensures we never exceed requests_per_hour regardless of call pattern.
        rph = max(settings.tiingo.requests_per_hour, 1)
        self._request_interval: float = 3600.0 / rph
        self._last_request_time: float = 0.0

    # ─── Internal: rate-limited request helper ────────────────────────────────

    def _get(self, url: str, params: dict | None = None, timeout: int = 15) -> requests.Response:
        """Rate-limited GET with automatic retry on HTTP 429.

        Sleeps ``_request_interval`` seconds before each request to honour the
        configured requests_per_hour cap.  On 429 responses performs up to
        ``_MAX_RETRIES_429`` retries with exponential backoff starting at
        ``_BACKOFF_429_BASE`` seconds.

        Args:
            url:     Full request URL.
            params:  Query parameters dict (optional).
            timeout: Socket timeout in seconds.

        Returns:
            Successful ``requests.Response`` object.

        Raises:
            RuntimeError: If all 429 retries are exhausted.
            requests.exceptions.RequestException: On network errors.
        """
        import structlog

        log = structlog.get_logger()

        for attempt in range(_MAX_RETRIES_429 + 1):
            # Enforce inter-request interval (rate limiting)
            elapsed = time.monotonic() - self._last_request_time
            wait = self._request_interval - elapsed
            if wait > 0:
                time.sleep(wait)

            self._last_request_time = time.monotonic()
            resp = self._session.get(url, params=params, timeout=timeout)

            if resp.status_code != 429:
                return resp

            # 429 — Too Many Requests
            if attempt >= _MAX_RETRIES_429:
                raise RuntimeError(
                    f"Tiingo rate limit (429) exceeded after {_MAX_RETRIES_429} retries. "
                    f"Consider upgrading to a paid plan or reducing requests_per_hour."
                )

            backoff = _BACKOFF_429_BASE * (2 ** attempt)
            log.warning(
                "tiingo_rate_limit_429",
                attempt=attempt + 1,
                max_retries=_MAX_RETRIES_429,
                backoff_s=backoff,
                url=url,
            )
            time.sleep(backoff)

        # Unreachable, but satisfies type checker
        raise RuntimeError("Tiingo _get: unexpected exit from retry loop")

    # ─── Public interface (compatible with AlpacaClient) ──────────────────────

    def get_bars(
        self,
        symbols: list[str],
        timeframe: str = "1Day",
        days_back: int = 60,
    ) -> dict[str, pd.DataFrame]:
        """Fetch OHLCV bars for a list of symbols.

        For daily timeframe, uses the Tiingo EOD endpoint (adjusted prices).
        For intraday timeframes (5Min, 1Hour, etc.), uses the IEX endpoint.

        Args:
            symbols:   List of US equity/ETF tickers.
            timeframe: "1Day" (default) for EOD, or "5Min"/"1Hour" etc. for intraday.
            days_back: Number of calendar days of history to retrieve.

        Returns:
            dict mapping symbol → DataFrame with columns:
            [open, high, low, close, volume] indexed by UTC-aware timestamp.
        """
        if timeframe == "1Day":
            end_date = datetime.utcnow().date()
            start_date = end_date - timedelta(days=days_back)
            result: dict[str, pd.DataFrame] = {}
            for symbol in symbols:
                df = self._get_daily_bars(symbol, start_date, end_date)
                if df is not None and not df.empty:
                    result[symbol] = df
            return result
        else:
            # Intraday: use IEX endpoint for each symbol individually
            result = {}
            resample_freq = _TIMEFRAME_TO_RESAMPLE.get(timeframe, "5min")
            for symbol in symbols:
                df = self._get_iex_bars(symbol, resample_freq=resample_freq, days_back=days_back)
                if df is not None and not df.empty:
                    result[symbol] = df
            return result

    def get_latest_bars(
        self,
        symbol: str,
        timeframe: str = "5Min",
        n_bars: int = 30,
    ) -> pd.DataFrame:
        """Fetch recent intraday bars via IEX (real-time, no delay).

        Uses the Tiingo IEX endpoint which provides true real-time data from
        the IEX exchange. No 15-minute delay unlike Alpaca free tier.

        Args:
            symbol:    Ticker symbol (e.g. "SPY").
            timeframe: Bar timeframe string, e.g. "5Min", "1Min", "15Min", "1Hour".
            n_bars:    Number of most-recent bars to return.

        Returns:
            DataFrame with DatetimeIndex (UTC, tz-aware) and columns
            open/high/low/close/volume, sorted ascending. Empty DataFrame
            on error or no data.
        """
        import structlog

        log = structlog.get_logger()
        resample_freq = _TIMEFRAME_TO_RESAMPLE.get(timeframe)
        if resample_freq is None:
            log.warning(
                "tiingo_unsupported_timeframe",
                timeframe=timeframe,
                fallback="5min",
                supported=list(_TIMEFRAME_TO_RESAMPLE.keys()),
            )
            resample_freq = "5min"

        # Calculate how many calendar days to fetch.
        # A regular session is 390 minutes (6.5h × 60).
        # days_needed = ceil(n_bars * timeframe_minutes / 390) + 2 margin days.
        # Examples:
        #   30 bars × 5Min = 150 min / 390 = 0.38 sessions → ceil → 1 day + 2 = 3 days
        #   100 bars × 5Min = 500 min / 390 = 1.28 sessions → ceil → 2 days + 2 = 4 days
        #   50 bars × 1Hour = 3000 min / 390 = 7.7 sessions → ceil → 8 days + 2 = 10 days
        minutes_per_bar = int("".join(filter(str.isdigit, resample_freq)) or "5")
        sessions_needed = math.ceil((n_bars * minutes_per_bar) / 390)
        days_needed = sessions_needed + 2  # +2 calendar-day margin for weekends/holidays

        df = self._get_iex_bars(symbol, resample_freq=resample_freq, days_back=days_needed)
        if df is None or df.empty:
            return pd.DataFrame()

        return df.tail(n_bars)

    def get_latest_quote(self, symbols: list[str]) -> dict[str, dict]:
        """Fetch the latest IEX real-time quote for each symbol.

        Args:
            symbols: List of tickers (up to 50 per request).

        Returns:
            dict mapping symbol → quote dict with keys:
            {last, bid, ask, open, high, low, volume, prevClose, timestamp}
        """
        result: dict[str, dict] = {}
        for i in range(0, len(symbols), _IEX_BATCH_SIZE):
            batch = symbols[i : i + _IEX_BATCH_SIZE]
            quotes = self._fetch_iex_quotes(batch)
            result.update(quotes)
        return result

    def get_crypto_bars(
        self,
        symbols: list[str],
        resample_freq: str = "1min",
        days_back: int = 3,
    ) -> dict[str, pd.DataFrame]:
        """Fetch intraday OHLCV bars for cryptocurrency pairs via Tiingo Crypto API.

        Crypto trades 24/7 — no market hours restriction. Available on all Tiingo plans.

        Args:
            symbols:      Tiingo crypto pair format (e.g., ["btcusd", "ethusd"]).
            resample_freq: Bar size: "1min", "5min", "15min", "30min", "1hour", "1day".
            days_back:    Calendar days of history to fetch (default 3 — covers weekends).

        Returns:
            dict mapping symbol → DataFrame with columns:
            [open, high, low, close, volume] indexed by UTC-aware timestamp.
            Empty dict on error.
        """
        result: dict[str, pd.DataFrame] = {}
        for symbol in symbols:
            df = self._get_crypto_ohlcv(symbol, resample_freq=resample_freq, days_back=days_back)
            if df is not None and not df.empty:
                result[symbol] = df
        return result

    def get_crypto_latest(
        self,
        symbols: list[str],
        n_bars: int = 30,
        resample_freq: str = "1min",
    ) -> dict[str, pd.DataFrame]:
        """Fetch recent crypto bars — equivalent to get_latest_bars() for crypto pairs.

        Args:
            symbols:      Tiingo crypto pair symbols (e.g., ["btcusd", "ethusd"]).
            n_bars:       Number of most recent bars to return.
            resample_freq: Bar size (default "1min").

        Returns:
            dict mapping symbol → DataFrame (last n_bars rows).
        """
        # Crypto is 24/7 — 1440 min/day. Calculate days needed with margin.
        minutes_per_bar = int("".join(filter(str.isdigit, resample_freq)) or "1")
        days_needed = max(int((n_bars * minutes_per_bar) / 1440) + 2, 3)
        result: dict[str, pd.DataFrame] = {}
        for symbol in symbols:
            df = self._get_crypto_ohlcv(symbol, resample_freq=resample_freq, days_back=days_needed)
            if df is not None and not df.empty:
                result[symbol] = df.tail(n_bars)
        return result

    # ─── Private helpers ──────────────────────────────────────────────────────

    def _get_daily_bars(
        self,
        symbol: str,
        start_date: Any,
        end_date: Any,
    ) -> pd.DataFrame | None:
        """Fetch daily OHLCV for a single symbol from Tiingo EOD endpoint."""
        url = f"{_TIINGO_BASE}/tiingo/daily/{symbol}/prices"
        params = {
            "startDate": str(start_date),
            "endDate": str(end_date),
            "resampleFreq": "daily",
            "token": self._token,
        }
        try:
            resp = self._get(url, params=params, timeout=15)
            resp.raise_for_status()
        except requests.exceptions.HTTPError as e:
            if resp.status_code == 404:
                # Symbol not found on Tiingo (delisted, not a US equity, etc.)
                return None
            raise RuntimeError(f"Tiingo EOD request failed for {symbol}: {e}") from e
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Tiingo network error for {symbol}: {e}") from e

        data = resp.json()
        if not data:
            return None

        df = pd.DataFrame(data)

        # Tiingo returns adjClose/adjOpen etc. — use adjusted prices for accuracy
        # but fall back to raw if adjusted columns are absent.
        col_map = {
            "adjOpen": "open",
            "adjHigh": "high",
            "adjLow": "low",
            "adjClose": "close",
            "adjVolume": "volume",
        }
        if "adjClose" in df.columns:
            df = df.rename(columns=col_map)
        else:
            df = df.rename(
                columns={
                    "open": "open",
                    "high": "high",
                    "low": "low",
                    "close": "close",
                    "volume": "volume",
                }
            )

        # Keep only the columns we need
        keep = [c for c in ["open", "high", "low", "close", "volume"] if c in df.columns]
        df = df[keep]

        # Parse date index as UTC-aware (daily bars carry no time, set to midnight UTC)
        raw_df = pd.DataFrame(data)
        if "date" in raw_df.columns:
            df.index = pd.to_datetime(raw_df["date"], utc=True)
            df.index.name = "timestamp"

        # Ensure numeric types
        for col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        return df.dropna(subset=["close"])

    def _get_iex_bars(
        self,
        symbol: str,
        resample_freq: str = "5min",
        days_back: int = 7,
    ) -> pd.DataFrame | None:
        """Fetch intraday OHLCV bars for a single symbol from Tiingo IEX endpoint.

        Uses the ``/iex/{symbol}/prices`` endpoint which returns a time-series
        list of OHLC bars (real-time, IEX exchange).  The plain ``/iex/{symbol}``
        endpoint returns only the latest single snapshot and is NOT suitable for
        historical intraday series.

        Free-tier note: ``volume`` may be absent in the response — it is always
        filled with 0 when missing so downstream code can rely on the column.

        Args:
            symbol:        Ticker symbol.
            resample_freq: Tiingo resample param: "1min","5min","15min","30min","1hour".
            days_back:     Calendar days of intraday history to fetch.
        """
        import structlog

        log = structlog.get_logger()

        # Correct endpoint for intraday bar series: /iex/{symbol}/prices
        # (NOT /iex/{symbol} which returns a single snapshot)
        url = f"{_TIINGO_BASE}/iex/{symbol.upper()}/prices"

        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=days_back)
        params: dict[str, Any] = {
            "startDate": start_dt.strftime("%Y-%m-%d"),
            "resampleFreq": resample_freq,
            "token": self._token,
        }

        try:
            resp = self._get(url, params=params, timeout=15)
            resp.raise_for_status()
        except requests.exceptions.HTTPError as e:
            status = getattr(resp, "status_code", None)
            if status == 404:
                return None
            if status == 400:
                # resampleFreq not supported for this endpoint/symbol — log and bail
                log.warning(
                    "tiingo_iex_bad_request",
                    symbol=symbol,
                    resample_freq=resample_freq,
                    response=resp.text[:200],
                )
                return None
            raise RuntimeError(f"Tiingo IEX request failed for {symbol}: {e}") from e
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Tiingo IEX network error for {symbol}: {e}") from e

        data = resp.json()
        if not data:
            return None

        # /iex/{symbol}/prices returns a list of bar dicts.
        # The date field is "date" (ISO 8601 string, e.g. "2026-03-02T14:30:00.000Z").
        # Volume is absent in the free tier — default to 0 to keep a consistent schema.
        records = []
        for bar in data:
            records.append(
                {
                    "date": bar.get("date"),
                    "open": bar.get("open"),
                    "high": bar.get("high"),
                    "low": bar.get("low"),
                    "close": bar.get("close"),
                    "volume": bar.get("volume", 0),
                }
            )

        df = pd.DataFrame(records)

        if "date" not in df.columns or df["date"].isna().all():
            log.warning("tiingo_iex_no_date_column", symbol=symbol, columns=list(df.columns))
            return None

        if "close" not in df.columns:
            log.warning("tiingo_iex_missing_close", symbol=symbol, columns=list(df.columns))
            return None

        # Parse timestamp index as UTC-aware
        raw_index = pd.to_datetime(df["date"], utc=True)
        df = df[["open", "high", "low", "close", "volume"]].copy()
        df.index = raw_index
        df.index.name = "timestamp"
        df = df.sort_index()

        # Ensure numeric types
        for col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        # volume defaults to 0 (free tier has no volume) — keep rows with missing OHLC
        df["volume"] = df["volume"].fillna(0)

        return df.dropna(subset=["close"])

    def _get_crypto_ohlcv(
        self,
        symbol: str,
        resample_freq: str = "1min",
        days_back: int = 3,
    ) -> pd.DataFrame | None:
        """Fetch intraday OHLCV for a single crypto pair from Tiingo Crypto API.

        Endpoint: GET /tiingo/crypto/prices
        Params: tickers=btcusd, resampleFreq=1min, startDate=..., endDate=...

        Args:
            symbol:        Tiingo crypto pair (e.g. "btcusd", "ethusd"). Lowercase.
            resample_freq: Bar size for the resampleFreq param.
            days_back:     Calendar days of history.
        """
        import structlog

        log = structlog.get_logger()

        url = f"{_CRYPTO_BASE}/prices"
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=days_back)

        params: dict[str, Any] = {
            "tickers": symbol.lower(),
            "startDate": start_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "endDate": end_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "resampleFreq": resample_freq,
            "token": self._token,
        }

        try:
            resp = self._get(url, params=params, timeout=15)
            resp.raise_for_status()
        except requests.exceptions.HTTPError as e:
            status = getattr(resp, "status_code", None)
            if status == 404:
                return None
            if status == 400:
                log.warning(
                    "tiingo_crypto_bad_request",
                    symbol=symbol,
                    resample_freq=resample_freq,
                    response=resp.text[:200],
                )
                return None
            raise RuntimeError(f"Tiingo Crypto request failed for {symbol}: {e}") from e
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Tiingo Crypto network error for {symbol}: {e}") from e

        data = resp.json()
        # Crypto endpoint returns: [{"ticker": "btcusd", "baseCurrency": "btc", ...,
        #   "priceData": [{"date": "...", "open": ..., "high": ..., "low": ...,
        #                   "close": ..., "volume": ..., "volumeNotional": ..., "tradesDone": ...}]}]
        if not data or not isinstance(data, list):
            return None

        # Extract priceData from first item (we requested a single ticker)
        price_data = data[0].get("priceData", []) if data else []
        if not price_data:
            log.warning("tiingo_crypto_no_price_data", symbol=symbol)
            return None

        records = []
        for bar in price_data:
            records.append(
                {
                    "date": bar.get("date"),
                    "open": bar.get("open"),
                    "high": bar.get("high"),
                    "low": bar.get("low"),
                    "close": bar.get("close"),
                    "volume": bar.get("volume", 0),  # volume in base currency (BTC/ETH)
                }
            )

        df = pd.DataFrame(records)
        if df.empty or "date" not in df.columns:
            return None

        raw_index = pd.to_datetime(df["date"], utc=True, errors="coerce")
        df = df[["open", "high", "low", "close", "volume"]].copy()
        df.index = raw_index
        df.index.name = "timestamp"
        df = df.sort_index()

        for col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

        df["volume"] = df["volume"].fillna(0)
        return df.dropna(subset=["close"])

    def _fetch_iex_quotes(self, symbols: list[str]) -> dict[str, dict]:
        """Fetch latest IEX real-time quotes for a batch of symbols (no resample)."""
        url = f"{_TIINGO_BASE}/iex"
        params = {
            "tickers": ",".join(symbols),
            "token": self._token,
        }
        try:
            resp = self._get(url, params=params, timeout=10)
            resp.raise_for_status()
        except requests.exceptions.RequestException as e:
            raise RuntimeError(f"Tiingo IEX quotes request failed: {e}") from e

        quotes = resp.json()
        result: dict[str, dict] = {}
        for q in quotes:
            ticker = q.get("ticker", "").upper()
            if not ticker:
                continue
            result[ticker] = {
                "last": q.get("tngoLast") or q.get("lastSalePrice"),
                "bid": q.get("bidPrice"),
                "ask": q.get("askPrice"),
                "open": q.get("open"),
                "high": q.get("high"),
                "low": q.get("low"),
                "volume": q.get("volume"),
                "prevClose": q.get("prevClose"),
                "timestamp": q.get("timestamp"),
            }
        return result
