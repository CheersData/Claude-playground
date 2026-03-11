"""
Tiingo News API client.

Fetches financial news for ticker symbols. Used by the signal generator
to detect breaking news before entering a position.

Endpoint: GET /tiingo/news
Docs: https://api.tiingo.com/documentation/news

Power plan ($30/month): Full news access with ticker filtering + onlyWithTickers.
Free tier: Limited access — returns empty list gracefully.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from ..config import get_settings

_TIINGO_BASE = "https://api.tiingo.com"
_MAX_RETRIES_429 = 2
_BACKOFF_BASE_SEC = 5

# Keywords that indicate high-impact, market-moving news
_HIGH_IMPACT_KEYWORDS = frozenset([
    "fed", "federal reserve", "rate hike", "rate cut", "inflation",
    "recession", "crash", "circuit breaker", "halt", "suspended",
    "tariff", "sanction", "war", "conflict", "attack",
    "default", "bankruptcy", "collapse", "bailout",
    "sec", "investigation", "fraud", "subpoena",
    "merger", "acquisition", "takeover", "buyout",
    "earnings beat", "earnings miss", "guidance cut", "guidance raise",
    "downgrade", "upgrade", "buy rating", "sell rating",
    "ipo", "delist", "delisting",
    "trump", "powell", "yellen", "jerome",  # key market-moving speakers
])


class NewsItem:
    """Single news article from Tiingo News API."""

    def __init__(self, data: dict) -> None:
        self.id: str = str(data.get("id", ""))
        self.title: str = data.get("title", "") or ""
        self.description: str = data.get("description", "") or ""
        self.url: str = data.get("url", "") or ""
        self.source: str = data.get("source", "") or ""
        self.tickers: list[str] = [t.upper() for t in (data.get("tickers") or [])]
        self.tags: list[str] = [t.lower() for t in (data.get("tags") or [])]
        published_str = data.get("publishedDate", "")
        try:
            self.published_at: datetime = datetime.fromisoformat(
                published_str.replace("Z", "+00:00")
            )
        except (ValueError, AttributeError):
            self.published_at = datetime.now(tz=timezone.utc)

    def age_minutes(self) -> float:
        """How old is this news item in minutes."""
        now = datetime.now(tz=timezone.utc)
        delta = now - self.published_at
        return delta.total_seconds() / 60.0

    def is_high_impact(self) -> bool:
        """
        Heuristic: does this headline contain high-impact market-moving keywords?

        Checks both title and tags. Returns True if any keyword matches.
        Conservative — better to flag a false positive than to miss a market crash.
        """
        text = (self.title + " " + " ".join(self.tags)).lower()
        return any(kw in text for kw in _HIGH_IMPACT_KEYWORDS)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "source": self.source,
            "tickers": self.tickers,
            "published_at": self.published_at.isoformat(),
            "age_minutes": round(self.age_minutes(), 1),
            "is_high_impact": self.is_high_impact(),
            "url": self.url,
        }

    def __repr__(self) -> str:
        return f"NewsItem(title={self.title!r}, age={self.age_minutes():.0f}min)"


class TiingoNewsClient:
    """
    Tiingo News API client.

    Fetches financial news filtered by ticker symbols.
    Used by the slope+volume signal generator to detect breaking news
    before entering a position (market-moving events can invalidate slope signals).

    Graceful degradation:
        - If TIINGO_API_KEY is missing → ValueError (should not initialize)
        - If 401/403 (plan restriction) → returns [] with warning log
        - If network error → returns [] with warning log
        - If 429 → retries 2× with exponential backoff, then returns []

    Usage:
        client = TiingoNewsClient()

        # Check for breaking news in last 30 minutes
        has_news, headline = client.has_breaking_news(["SPY", "QQQ"], minutes_back=30)
        if has_news:
            logger.warning("breaking_news_detected", headline=headline)

        # Get full news list
        items = client.get_news(["SPY"], hours_back=2)
        for item in items:
            print(item.title, item.age_minutes(), "min ago")

        # Aggregate sentiment
        sentiment = client.get_market_sentiment(["SPY", "QQQ", "IWM"])
        print(sentiment["sentiment"])  # "bullish" | "bearish" | "neutral"
    """

    def __init__(self) -> None:
        settings = get_settings()
        key = settings.tiingo.tiingo_api_key
        if not key:
            raise ValueError(
                "TIINGO_API_KEY is not configured. "
                "Add to .env.local: TIINGO_API_KEY=your_key"
            )
        self._token = key
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Authorization": f"Token {self._token}",
                "Content-Type": "application/json",
            }
        )

    def get_news(
        self,
        tickers: list[str] | None = None,
        hours_back: float = 2.0,
        limit: int = 10,
    ) -> list[NewsItem]:
        """
        Fetch recent financial news from Tiingo.

        Args:
            tickers:    Ticker symbols to filter by (e.g., ["SPY", "QQQ"]).
                        None = broad market news (noisy, not recommended).
            hours_back: Lookback window in hours (default 2h).
            limit:      Max articles to return (default 10, max 100).

        Returns:
            List of NewsItem sorted by published date descending.
            Empty list on any error (graceful degradation — never blocks trading pipeline).
        """
        import structlog

        log = structlog.get_logger()

        start_dt = datetime.now(tz=timezone.utc) - timedelta(hours=hours_back)
        params: dict[str, Any] = {
            "token": self._token,
            "startDate": start_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "limit": min(limit, 100),
        }
        if tickers:
            params["tickers"] = ",".join(t.upper() for t in tickers)
            params["onlyWithTickers"] = "true"

        url = f"{_TIINGO_BASE}/tiingo/news"

        for attempt in range(_MAX_RETRIES_429 + 1):
            try:
                resp = self._session.get(url, params=params, timeout=10)

                if resp.status_code == 429:
                    if attempt >= _MAX_RETRIES_429:
                        log.warning(
                            "tiingo_news_rate_limit_exhausted",
                            tickers=tickers,
                            hint="Consider reducing news check frequency",
                        )
                        return []
                    backoff = _BACKOFF_BASE_SEC * (2 ** attempt)
                    log.warning(
                        "tiingo_news_rate_limit_429",
                        attempt=attempt + 1,
                        backoff_s=backoff,
                    )
                    time.sleep(backoff)
                    continue

                if resp.status_code == 401:
                    log.warning(
                        "tiingo_news_unauthorized",
                        hint="Check TIINGO_API_KEY validity",
                    )
                    return []

                if resp.status_code == 403:
                    log.warning(
                        "tiingo_news_forbidden",
                        hint="News API with ticker filter requires Tiingo Power plan ($30/month). "
                             "Upgrade at tiingo.com or set TIINGO_NEWS_ENABLED=false to disable.",
                    )
                    return []

                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, list):
                    return []

                items = [NewsItem(item) for item in data]
                # Sort descending (most recent first)
                items.sort(key=lambda x: x.published_at, reverse=True)

                log.debug(
                    "tiingo_news_fetched",
                    tickers=tickers,
                    count=len(items),
                    hours_back=hours_back,
                )
                return items

            except requests.exceptions.RequestException as e:
                log.warning(
                    "tiingo_news_request_failed",
                    error=str(e),
                    tickers=tickers,
                )
                return []

        return []

    def has_breaking_news(
        self,
        tickers: list[str],
        minutes_back: float = 30.0,
        high_impact_only: bool = True,
    ) -> tuple[bool, str]:
        """
        Check if breaking news was published in the last N minutes.

        Called by signal_generator before emitting a slope+volume signal.
        Breaking news can cause rapid price dislocations that invalidate slope signals.

        Args:
            tickers:          Symbols to check (e.g., ["SPY", "SH", "QQQ"]).
            minutes_back:     Lookback window in minutes (default 30min).
            high_impact_only: Only flag high-impact news (Fed, tariffs, crashes, etc.)
                              Set False to flag any news (more false positives).

        Returns:
            (has_news: bool, headline: str)
            headline is the most recent matching title, or "" if no news found.
        """
        items = self.get_news(
            tickers=tickers,
            hours_back=max(minutes_back / 60.0, 0.1),
            limit=5,
        )

        for item in items:
            if item.age_minutes() > minutes_back:
                continue
            if high_impact_only and not item.is_high_impact():
                continue
            return True, item.title

        return False, ""

    def get_market_sentiment(
        self,
        tickers: list[str],
        hours_back: float = 4.0,
    ) -> dict:
        """
        Compute simple sentiment score from recent news headlines.

        Uses keyword matching — fast and deterministic, no LLM needed.
        Useful for adjusting signal confidence or position sizing.

        Args:
            tickers:    Symbols to analyze.
            hours_back: Lookback window in hours.

        Returns:
            {
                "bullish": int,        # count of bullish headlines
                "bearish": int,        # count of bearish headlines
                "neutral": int,        # count of neutral/unclassified
                "total": int,          # total articles analyzed
                "sentiment": str,      # dominant: "bullish" | "bearish" | "neutral"
                "score": float,        # -1.0 (very bearish) to +1.0 (very bullish)
                "headlines": list[str] # top 5 titles for logging
            }
        """
        BULLISH = frozenset(["rally", "gain", "surge", "soar", "jump", "beat", "record",
                             "upgrade", "buy", "growth", "recovery", "rebound", "top"])
        BEARISH = frozenset(["crash", "fall", "plunge", "drop", "miss", "downgrade", "sell",
                             "recession", "loss", "tariff", "sanction", "collapse", "sink",
                             "default", "war", "attack", "investigation", "fraud"])

        items = self.get_news(tickers, hours_back=hours_back, limit=20)
        bullish = bearish = neutral = 0

        for item in items:
            words = set(item.title.lower().split())
            if words & BULLISH:
                bullish += 1
            elif words & BEARISH:
                bearish += 1
            else:
                neutral += 1

        total = len(items)
        score = 0.0
        if total > 0:
            score = (bullish - bearish) / total  # range: -1.0 to +1.0

        if bullish > bearish:
            sentiment = "bullish"
        elif bearish > bullish:
            sentiment = "bearish"
        else:
            sentiment = "neutral"

        return {
            "bullish": bullish,
            "bearish": bearish,
            "neutral": neutral,
            "total": total,
            "sentiment": sentiment,
            "score": round(score, 3),
            "headlines": [item.title for item in items[:5]],
        }
