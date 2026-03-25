"""
Trend Scout Agent — Compare AudioDNA with market trends.

Analyzes a track's AudioDNA against current market data from multiple sources
(Tunebat, Hooktheory, Last.fm, MusicBrainz) to produce:
- Genre classification with trend directions
- Market comparison (BPM, energy, key percentiles)
- Reference tracks (3-5 similar successful songs)
- Gap analysis (strengths, weaknesses, opportunities, market fit)

Gracefully degrades when APIs are not configured — falls back to
heuristic analysis based on built-in genre profiles.

CLI usage:
    python -m src.agents.trend_scout --audio-dna path/to/dna.json
    python -m src.agents.trend_scout --audio-dna path/to/dna.json --output report.json
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from .base import BaseAgent
from ..config import get_settings
from ..models.trends import (
    GapAnalysis,
    GenreAnalysis,
    MarketComparison,
    ReferenceTrack,
    TrendReport,
)
from ..utils.numpy_json import numpy_default, sanitize_for_json

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Genre profile database — built-in heuristics when APIs are unavailable
# Covers 25+ genres with typical BPM, energy, and key distributions.
# ---------------------------------------------------------------------------

_GENRE_PROFILES: dict[str, dict[str, Any]] = {
    "pop": {
        "bpm_range": (100, 130), "energy_range": (0.55, 0.85),
        "common_keys": ["C major", "G major", "A minor", "D major"],
        "trend": "stable",
    },
    "indie pop": {
        "bpm_range": (95, 130), "energy_range": (0.40, 0.75),
        "common_keys": ["C major", "G major", "F major", "A minor"],
        "trend": "rising",
    },
    "bedroom pop": {
        "bpm_range": (80, 120), "energy_range": (0.30, 0.60),
        "common_keys": ["C major", "D major", "G major", "E minor"],
        "trend": "rising",
    },
    "hip hop": {
        "bpm_range": (70, 100), "energy_range": (0.50, 0.80),
        "common_keys": ["C minor", "A minor", "G minor", "F minor"],
        "trend": "stable",
    },
    "trap": {
        "bpm_range": (130, 170), "energy_range": (0.60, 0.90),
        "common_keys": ["C minor", "A minor", "D minor", "G minor"],
        "trend": "stable",
    },
    "r&b": {
        "bpm_range": (60, 100), "energy_range": (0.35, 0.65),
        "common_keys": ["D minor", "A minor", "G minor", "C minor"],
        "trend": "rising",
    },
    "rock": {
        "bpm_range": (100, 150), "energy_range": (0.65, 0.95),
        "common_keys": ["E minor", "A minor", "G major", "D major"],
        "trend": "stable",
    },
    "indie rock": {
        "bpm_range": (100, 145), "energy_range": (0.50, 0.85),
        "common_keys": ["E minor", "A minor", "C major", "G major"],
        "trend": "stable",
    },
    "alternative": {
        "bpm_range": (90, 145), "energy_range": (0.45, 0.85),
        "common_keys": ["A minor", "E minor", "C major", "D minor"],
        "trend": "stable",
    },
    "electronic": {
        "bpm_range": (120, 140), "energy_range": (0.60, 0.90),
        "common_keys": ["A minor", "C minor", "F minor", "D minor"],
        "trend": "stable",
    },
    "house": {
        "bpm_range": (118, 132), "energy_range": (0.65, 0.90),
        "common_keys": ["A minor", "C minor", "G minor", "D minor"],
        "trend": "stable",
    },
    "techno": {
        "bpm_range": (125, 150), "energy_range": (0.70, 0.95),
        "common_keys": ["A minor", "D minor", "E minor", "C minor"],
        "trend": "rising",
    },
    "edm": {
        "bpm_range": (125, 150), "energy_range": (0.75, 0.95),
        "common_keys": ["A minor", "C minor", "F minor", "B minor"],
        "trend": "declining",
    },
    "drum and bass": {
        "bpm_range": (160, 180), "energy_range": (0.75, 0.95),
        "common_keys": ["A minor", "D minor", "E minor", "G minor"],
        "trend": "rising",
    },
    "lo-fi": {
        "bpm_range": (70, 95), "energy_range": (0.20, 0.45),
        "common_keys": ["C major", "F major", "D minor", "A minor"],
        "trend": "stable",
    },
    "jazz": {
        "bpm_range": (80, 180), "energy_range": (0.30, 0.70),
        "common_keys": ["Bb major", "F major", "Eb major", "C major"],
        "trend": "stable",
    },
    "classical": {
        "bpm_range": (50, 180), "energy_range": (0.10, 0.80),
        "common_keys": ["C major", "G major", "D major", "A minor"],
        "trend": "stable",
    },
    "country": {
        "bpm_range": (90, 140), "energy_range": (0.45, 0.80),
        "common_keys": ["G major", "C major", "D major", "A major"],
        "trend": "rising",
    },
    "folk": {
        "bpm_range": (80, 140), "energy_range": (0.30, 0.65),
        "common_keys": ["G major", "C major", "D major", "A minor"],
        "trend": "stable",
    },
    "metal": {
        "bpm_range": (100, 200), "energy_range": (0.80, 0.99),
        "common_keys": ["E minor", "D minor", "A minor", "B minor"],
        "trend": "stable",
    },
    "punk": {
        "bpm_range": (140, 200), "energy_range": (0.75, 0.95),
        "common_keys": ["E major", "A major", "D major", "G major"],
        "trend": "stable",
    },
    "soul": {
        "bpm_range": (70, 110), "energy_range": (0.40, 0.70),
        "common_keys": ["Ab major", "Bb major", "Eb major", "F major"],
        "trend": "stable",
    },
    "reggaeton": {
        "bpm_range": (88, 100), "energy_range": (0.65, 0.85),
        "common_keys": ["A minor", "D minor", "G minor", "C minor"],
        "trend": "rising",
    },
    "latin": {
        "bpm_range": (80, 130), "energy_range": (0.55, 0.85),
        "common_keys": ["A minor", "D minor", "G major", "C major"],
        "trend": "rising",
    },
    "k-pop": {
        "bpm_range": (100, 140), "energy_range": (0.60, 0.90),
        "common_keys": ["C minor", "A minor", "G minor", "D minor"],
        "trend": "rising",
    },
    "hyperpop": {
        "bpm_range": (130, 180), "energy_range": (0.70, 0.95),
        "common_keys": ["C major", "A minor", "E minor", "F major"],
        "trend": "rising",
    },
    "ambient": {
        "bpm_range": (50, 100), "energy_range": (0.05, 0.30),
        "common_keys": ["C major", "A minor", "D major", "F major"],
        "trend": "rising",
    },
    "funk": {
        "bpm_range": (95, 125), "energy_range": (0.60, 0.85),
        "common_keys": ["E minor", "A minor", "D minor", "G minor"],
        "trend": "stable",
    },
}

# Reference track database for heuristic matching when APIs are down
_REFERENCE_TRACKS: dict[str, list[dict[str, str]]] = {
    "pop": [
        {"title": "Anti-Hero", "artist": "Taylor Swift"},
        {"title": "Flowers", "artist": "Miley Cyrus"},
        {"title": "As It Was", "artist": "Harry Styles"},
        {"title": "Cruel Summer", "artist": "Taylor Swift"},
        {"title": "Blinding Lights", "artist": "The Weeknd"},
    ],
    "indie pop": [
        {"title": "Heat Waves", "artist": "Glass Animals"},
        {"title": "505", "artist": "Arctic Monkeys"},
        {"title": "Glimpse of Us", "artist": "Joji"},
        {"title": "Sofia", "artist": "Clairo"},
        {"title": "Electric Feel", "artist": "MGMT"},
    ],
    "bedroom pop": [
        {"title": "Bags", "artist": "Clairo"},
        {"title": "Line Without a Hook", "artist": "Ricky Montgomery"},
        {"title": "Notion", "artist": "The Rare Occasions"},
        {"title": "Sweater Weather", "artist": "The Neighbourhood"},
    ],
    "hip hop": [
        {"title": "HUMBLE.", "artist": "Kendrick Lamar"},
        {"title": "God's Plan", "artist": "Drake"},
        {"title": "SICKO MODE", "artist": "Travis Scott"},
        {"title": "Lose Yourself", "artist": "Eminem"},
    ],
    "trap": [
        {"title": "XO Tour Llif3", "artist": "Lil Uzi Vert"},
        {"title": "Mask Off", "artist": "Future"},
        {"title": "Bad and Boujee", "artist": "Migos"},
        {"title": "goosebumps", "artist": "Travis Scott"},
    ],
    "r&b": [
        {"title": "Blinding Lights", "artist": "The Weeknd"},
        {"title": "Snooze", "artist": "SZA"},
        {"title": "Die For You", "artist": "The Weeknd"},
        {"title": "Say My Name", "artist": "Destiny's Child"},
    ],
    "rock": [
        {"title": "Bohemian Rhapsody", "artist": "Queen"},
        {"title": "Smells Like Teen Spirit", "artist": "Nirvana"},
        {"title": "Everlong", "artist": "Foo Fighters"},
        {"title": "Thunder", "artist": "Imagine Dragons"},
    ],
    "electronic": [
        {"title": "Strobe", "artist": "deadmau5"},
        {"title": "Scary Monsters and Nice Sprites", "artist": "Skrillex"},
        {"title": "Levels", "artist": "Avicii"},
        {"title": "Midnight City", "artist": "M83"},
    ],
    "house": [
        {"title": "One More Time", "artist": "Daft Punk"},
        {"title": "Finally", "artist": "CeCe Peniston"},
        {"title": "Cola", "artist": "CamelPhat & Elderbrook"},
        {"title": "Gecko", "artist": "Oliver Heldens"},
    ],
    "lo-fi": [
        {"title": "Snowman", "artist": "WYS"},
        {"title": "Coffee", "artist": "beabadoobee"},
        {"title": "Fallen Down", "artist": "Toby Fox"},
        {"title": "untitled", "artist": "Rex Orange County"},
    ],
    "metal": [
        {"title": "Master of Puppets", "artist": "Metallica"},
        {"title": "Chop Suey!", "artist": "System of a Down"},
        {"title": "Numb", "artist": "Linkin Park"},
        {"title": "The Trooper", "artist": "Iron Maiden"},
    ],
    "country": [
        {"title": "Jolene", "artist": "Dolly Parton"},
        {"title": "Fast Car", "artist": "Luke Combs"},
        {"title": "Something in the Orange", "artist": "Zach Bryan"},
        {"title": "Last Night", "artist": "Morgan Wallen"},
    ],
    "reggaeton": [
        {"title": "Despacito", "artist": "Luis Fonsi"},
        {"title": "Dákiti", "artist": "Bad Bunny"},
        {"title": "Tití Me Preguntó", "artist": "Bad Bunny"},
        {"title": "Con Altura", "artist": "Rosalía"},
    ],
}

# HTTP timeout for external API calls (seconds)
_HTTP_TIMEOUT = 8.0

# Last.fm public API base URL (no key required for basic queries)
_LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/"

# MusicBrainz API base URL (free, rate-limited to 1 req/sec)
_MUSICBRAINZ_BASE = "https://musicbrainz.org/ws/2/"
_MUSICBRAINZ_USER_AGENT = "ControllaMeMusic/1.0 (https://controlla.me)"


class TrendScoutError(Exception):
    """Raised when trend analysis fails critically."""


class TrendScout(BaseAgent):
    """
    Compares an AudioDNA with market trends to produce a TrendReport.

    Queries external APIs (Tunebat, Hooktheory, Last.fm, MusicBrainz) when
    configured, falling back to built-in genre profiles for heuristic analysis.

    Args:
        use_cache: Whether to check MusicDB trend_cache before fetching.
        cache_ttl_hours: How long cached trend data is considered fresh.
    """

    def __init__(
        self, use_cache: bool = True, cache_ttl_hours: int = 24
    ) -> None:
        super().__init__("trend_scout")
        self._settings = get_settings()
        self._use_cache = use_cache
        self._cache_ttl_hours = cache_ttl_hours
        self._db: Any = None  # lazy init to avoid import-time Supabase connection

    def _get_db(self) -> Any:
        """Lazy-init MusicDB to avoid connection at import time."""
        if self._db is None:
            try:
                from ..utils.db import MusicDB
                self._db = MusicDB()
            except Exception as e:
                self.logger.warning("db_unavailable", error=str(e))
                self._db = False  # sentinel: tried and failed
        return self._db if self._db is not False else None

    # ------------------------------------------------------------------
    # BaseAgent interface
    # ------------------------------------------------------------------

    async def run(self, **kwargs: Any) -> dict:
        """
        Run trend analysis on AudioDNA.

        Keyword Args:
            audio_dna: dict — AudioDNA output from AudioAnalyst (required).

        Returns:
            dict with the TrendReport as JSON-serializable dict.
        """
        audio_dna = kwargs.get("audio_dna")
        if not audio_dna:
            raise ValueError("audio_dna is required")
        report = await self.scout(audio_dna)
        return {"trend_report": report.model_dump(), "status": "success"}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def scout(self, audio_dna: dict[str, Any]) -> TrendReport:
        """
        Produce a TrendReport by comparing *audio_dna* against market data.

        Steps:
            1. Extract track features from AudioDNA
            2. Detect genre from features
            3. Fetch market data (APIs or cache or heuristic)
            4. Compare track vs market
            5. Find reference tracks
            6. Run gap analysis
            7. Assemble TrendReport

        Args:
            audio_dna: AudioDNA dict produced by AudioAnalyst.

        Returns:
            TrendReport with genre, market comparison, references, gap analysis.
        """
        analysis_id = str(uuid.uuid4())[:12]
        self.log_start(analysis_id=analysis_id)
        t0 = time.monotonic()

        try:
            # 1. Extract features
            features = self._extract_features(audio_dna)
            self.logger.debug(
                "features_extracted",
                bpm=features.get("bpm"),
                key=features.get("key"),
                energy=features.get("energy"),
            )

            # 2-6. Run analysis stages concurrently where possible
            genre_analysis, tunebat_data, hooktheory_data, lastfm_data = (
                await asyncio.gather(
                    self._analyze_genre(features),
                    self._fetch_tunebat_trends(features),
                    self._fetch_hooktheory_trends(features),
                    self._fetch_lastfm_similar(features),
                    return_exceptions=True,
                )
            )

            # Handle exceptions from gather — degrade gracefully
            if isinstance(genre_analysis, Exception):
                self.logger.warning(
                    "genre_analysis_failed", error=str(genre_analysis)
                )
                genre_analysis = self._fallback_genre_analysis(features)
            if isinstance(tunebat_data, Exception):
                self.logger.warning(
                    "tunebat_fetch_failed", error=str(tunebat_data)
                )
                tunebat_data = {}
            if isinstance(hooktheory_data, Exception):
                self.logger.warning(
                    "hooktheory_fetch_failed", error=str(hooktheory_data)
                )
                hooktheory_data = {}
            if isinstance(lastfm_data, Exception):
                self.logger.warning(
                    "lastfm_fetch_failed", error=str(lastfm_data)
                )
                lastfm_data = {}

            # 4. Market comparison
            market_comparison = self._compare_market(
                features, genre_analysis, tunebat_data
            )

            # 5. Reference tracks
            reference_tracks = await self._find_references(
                features, genre_analysis, lastfm_data
            )

            # 6. Gap analysis
            gap_analysis = await self._gap_analysis(
                features, genre_analysis, market_comparison, reference_tracks
            )

            elapsed = round(time.monotonic() - t0, 3)

            report = TrendReport(
                analysis_id=analysis_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                genre_analysis=genre_analysis,
                market_comparison=market_comparison,
                reference_tracks=reference_tracks,
                gap_analysis=gap_analysis,
                processing_time_seconds=elapsed,
            )

            # Cache the report
            self._cache_report(report, features)

            self.log_complete(
                analysis_id=analysis_id,
                primary_genre=genre_analysis.primary_genre,
                market_fit=gap_analysis.market_fit_score,
                references=len(reference_tracks),
                processing_time_s=elapsed,
            )
            return report

        except Exception as e:
            elapsed = round(time.monotonic() - t0, 3)
            self.log_error(
                str(e), analysis_id=analysis_id, processing_time_s=elapsed
            )
            raise TrendScoutError(f"Trend analysis failed: {e}") from e

    # ------------------------------------------------------------------
    # Feature extraction from AudioDNA
    # ------------------------------------------------------------------

    def _extract_features(self, audio_dna: dict[str, Any]) -> dict[str, Any]:
        """Pull relevant features from AudioDNA into a flat dict."""
        bpm_data = audio_dna.get("bpm", {})
        key_data = audio_dna.get("key", {})
        energy_data = audio_dna.get("energy", {})
        spectral = audio_dna.get("spectral", {})

        bpm = bpm_data.get("value", 0.0) if isinstance(bpm_data, dict) else 0.0
        key_label = key_data.get("key", "unknown") if isinstance(key_data, dict) else "unknown"
        key_confidence = key_data.get("confidence", 0.0) if isinstance(key_data, dict) else 0.0

        # Energy: prefer LUFS, fallback to RMS mean
        if isinstance(energy_data, dict):
            energy = energy_data.get("lufsMean", energy_data.get("rmsMean", 0.0))
            dynamic_range = energy_data.get("dynamicRange", 0.0)
        else:
            energy = 0.0
            dynamic_range = 0.0

        # Normalize energy to 0-1 range (LUFS is negative, RMS is 0-1ish)
        if energy < 0:
            # LUFS: -60 = silent, 0 = max loudness -> normalize
            energy_normalized = max(0.0, min(1.0, (energy + 60) / 60))
        else:
            energy_normalized = max(0.0, min(1.0, energy))

        spectral_centroid = (
            spectral.get("centroidMean", 0.0)
            if isinstance(spectral, dict)
            else 0.0
        )

        duration = audio_dna.get("duration", 0.0)
        sections = audio_dna.get("sections", [])
        chords = audio_dna.get("chords", [])

        return {
            "bpm": bpm,
            "key": key_label,
            "key_confidence": key_confidence,
            "energy": energy_normalized,
            "energy_raw": energy,
            "dynamic_range": dynamic_range,
            "spectral_centroid": spectral_centroid,
            "duration": duration,
            "section_count": len(sections) if isinstance(sections, list) else 0,
            "sections": sections,
            "chords": chords,
            "file": audio_dna.get("file", "unknown"),
        }

    # ------------------------------------------------------------------
    # Genre analysis
    # ------------------------------------------------------------------

    async def _analyze_genre(
        self, features: dict[str, Any]
    ) -> GenreAnalysis:
        """Detect genre from AudioDNA features using heuristic matching."""
        bpm = features["bpm"]
        energy = features["energy"]
        key = features["key"]

        scored_genres: list[tuple[str, float]] = []

        for genre, profile in _GENRE_PROFILES.items():
            score = 0.0
            bpm_lo, bpm_hi = profile["bpm_range"]
            en_lo, en_hi = profile["energy_range"]

            # BPM fit (0-40 points)
            if bpm_lo <= bpm <= bpm_hi:
                # Center of range scores highest
                mid = (bpm_lo + bpm_hi) / 2
                span = (bpm_hi - bpm_lo) / 2
                if span > 0:
                    dist = abs(bpm - mid) / span
                    score += 40 * max(0, 1 - dist * 0.5)
                else:
                    score += 40
            else:
                # Out of range penalty
                if bpm < bpm_lo:
                    dist = (bpm_lo - bpm) / max(bpm_lo, 1)
                else:
                    dist = (bpm - bpm_hi) / max(bpm_hi, 1)
                score += max(0, 20 - dist * 40)

            # Energy fit (0-35 points)
            if en_lo <= energy <= en_hi:
                mid = (en_lo + en_hi) / 2
                span = (en_hi - en_lo) / 2
                if span > 0:
                    dist = abs(energy - mid) / span
                    score += 35 * max(0, 1 - dist * 0.5)
                else:
                    score += 35
            else:
                if energy < en_lo:
                    dist = en_lo - energy
                else:
                    dist = energy - en_hi
                score += max(0, 15 - dist * 35)

            # Key affinity (0-25 points)
            common_keys = profile.get("common_keys", [])
            key_lower = key.lower()
            for i, ck in enumerate(common_keys):
                if key_lower == ck.lower():
                    # First key in list = most common
                    score += 25 - i * 3
                    break
                # Partial match (same root note)
                root_ck = ck.split()[0].lower()
                root_track = key_lower.split()[0] if " " in key_lower else key_lower
                if root_track == root_ck:
                    score += 12 - i * 2
                    break

            scored_genres.append((genre, round(score, 2)))

        # Sort by score descending
        scored_genres.sort(key=lambda x: x[1], reverse=True)
        top = scored_genres[:5]

        primary_genre = top[0][0] if top else "unknown"
        max_score = top[0][1] if top else 0
        # Confidence: top score / theoretical max (100)
        confidence = round(min(1.0, max_score / 80), 2)

        detected = [g for g, s in top if s > max_score * 0.6]
        genre_trends = {
            g: _GENRE_PROFILES.get(g, {}).get("trend", "stable")
            for g in detected
        }

        return GenreAnalysis(
            detected_genres=detected,
            primary_genre=primary_genre,
            genre_confidence=confidence,
            genre_trends=genre_trends,
        )

    def _fallback_genre_analysis(
        self, features: dict[str, Any]
    ) -> GenreAnalysis:
        """Minimal genre analysis when the async version fails."""
        return GenreAnalysis(
            detected_genres=["unknown"],
            primary_genre="unknown",
            genre_confidence=0.0,
            genre_trends={"unknown": "stable"},
        )

    # ------------------------------------------------------------------
    # External API fetchers (graceful degradation)
    # ------------------------------------------------------------------

    async def _fetch_tunebat_trends(
        self, features: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Fetch BPM/key/energy distribution data from Tunebat API.

        Returns empty dict if API key not configured or request fails.
        Checks trend_cache first when caching is enabled.
        """
        if not self._settings.tunebat.is_configured:
            self.logger.debug("tunebat_not_configured", hint="Set TUNEBAT_API_KEY")
            return {}

        # Check cache
        cache_key = f"tunebat_bpm_{int(features['bpm'])}"
        cached = self._get_cached_trend("tunebat", cache_key)
        if cached:
            return cached

        try:
            import aiohttp

            url = f"{self._settings.tunebat.base_url}/tracks/search"
            params = {
                "bpm_min": int(features["bpm"]) - 5,
                "bpm_max": int(features["bpm"]) + 5,
                "limit": 20,
            }
            headers = {"Authorization": f"Bearer {self._settings.tunebat.api_key}"}

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=_HTTP_TIMEOUT)
                ) as resp:
                    if resp.status != 200:
                        self.logger.warning(
                            "tunebat_http_error", status=resp.status
                        )
                        return {}
                    data = await resp.json()

            # Extract distribution stats
            tracks = data.get("tracks", data.get("results", []))
            if not tracks:
                return {}

            bpms = [t.get("bpm", 0) for t in tracks if t.get("bpm")]
            energies = [t.get("energy", 0) for t in tracks if t.get("energy")]
            keys = [t.get("key", "") for t in tracks if t.get("key")]

            result = {
                "bpm_distribution": {
                    "mean": sum(bpms) / len(bpms) if bpms else 0,
                    "min": min(bpms) if bpms else 0,
                    "max": max(bpms) if bpms else 0,
                    "count": len(bpms),
                },
                "energy_distribution": {
                    "mean": sum(energies) / len(energies) if energies else 0,
                    "min": min(energies) if energies else 0,
                    "max": max(energies) if energies else 0,
                },
                "key_distribution": {
                    k: keys.count(k) for k in set(keys)
                },
                "sample_tracks": [
                    {"title": t.get("title", ""), "artist": t.get("artist", "")}
                    for t in tracks[:5]
                ],
            }

            self._save_trend_cache("tunebat", cache_key, result)
            return result

        except ImportError:
            self.logger.warning(
                "aiohttp_not_installed",
                hint="pip install aiohttp for Tunebat API support",
            )
            return {}
        except Exception as e:
            self.logger.warning("tunebat_fetch_error", error=str(e))
            return {}

    async def _fetch_hooktheory_trends(
        self, features: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Fetch chord progression trends from Hooktheory API.

        Returns empty dict if API key not configured or request fails.
        """
        if not self._settings.hooktheory.is_configured:
            self.logger.debug(
                "hooktheory_not_configured", hint="Set HOOKTHEORY_API_KEY"
            )
            return {}

        cache_key = f"hooktheory_{features['key']}"
        cached = self._get_cached_trend("hooktheory", cache_key)
        if cached:
            return cached

        try:
            import aiohttp

            # Hooktheory Trends API: get popular chord progressions
            url = f"{self._settings.hooktheory.base_url}/trends/nodes"
            headers = {
                "Authorization": f"Bearer {self._settings.hooktheory.api_key}",
                "Accept": "application/json",
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url, headers=headers, timeout=aiohttp.ClientTimeout(total=_HTTP_TIMEOUT)
                ) as resp:
                    if resp.status != 200:
                        self.logger.warning(
                            "hooktheory_http_error", status=resp.status
                        )
                        return {}
                    data = await resp.json()

            result = {"chord_trends": data}
            self._save_trend_cache("hooktheory", cache_key, result)
            return result

        except ImportError:
            self.logger.warning(
                "aiohttp_not_installed",
                hint="pip install aiohttp for Hooktheory API support",
            )
            return {}
        except Exception as e:
            self.logger.warning("hooktheory_fetch_error", error=str(e))
            return {}

    async def _fetch_lastfm_similar(
        self, features: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Fetch similar tracks/tags from Last.fm API.

        Uses tag.getTopTracks for genre-based discovery.
        Last.fm basic API methods work without authentication for read-only.
        Returns empty dict on failure.
        """
        # Use the primary genre as tag query (best guess before full genre analysis)
        # We'll use a simple heuristic: pick the closest genre from our profiles
        best_genre = self._quick_genre_guess(features)
        if not best_genre or best_genre == "unknown":
            return {}

        cache_key = f"lastfm_{best_genre}"
        cached = self._get_cached_trend("lastfm", cache_key)
        if cached:
            return cached

        try:
            import aiohttp

            # Last.fm API: get top tracks for a tag (no API key needed for basic)
            # NOTE: Last.fm actually requires an API key for all calls.
            # If not configured, return empty gracefully.
            params = {
                "method": "tag.gettoptracks",
                "tag": best_genre,
                "limit": 10,
                "format": "json",
            }

            # Last.fm requires API key — check env
            import os
            lastfm_key = os.environ.get("LASTFM_API_KEY", "")
            if not lastfm_key:
                self.logger.debug(
                    "lastfm_not_configured", hint="Set LASTFM_API_KEY for richer references"
                )
                return {}

            params["api_key"] = lastfm_key

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    _LASTFM_BASE,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=_HTTP_TIMEOUT),
                ) as resp:
                    if resp.status != 200:
                        self.logger.warning("lastfm_http_error", status=resp.status)
                        return {}
                    data = await resp.json()

            tracks = data.get("tracks", {}).get("track", [])
            result = {
                "genre_tag": best_genre,
                "top_tracks": [
                    {
                        "title": t.get("name", ""),
                        "artist": t.get("artist", {}).get("name", ""),
                        "listeners": int(t.get("listeners", 0)),
                    }
                    for t in tracks[:10]
                ],
            }
            self._save_trend_cache("lastfm", cache_key, result)
            return result

        except ImportError:
            self.logger.warning(
                "aiohttp_not_installed",
                hint="pip install aiohttp for Last.fm API support",
            )
            return {}
        except Exception as e:
            self.logger.warning("lastfm_fetch_error", error=str(e))
            return {}

    # ------------------------------------------------------------------
    # Market comparison
    # ------------------------------------------------------------------

    def _compare_market(
        self,
        features: dict[str, Any],
        genre_analysis: GenreAnalysis,
        tunebat_data: dict[str, Any],
    ) -> MarketComparison:
        """
        Compare track features against genre market averages.

        Uses Tunebat data when available, falls back to built-in profiles.
        """
        genre = genre_analysis.primary_genre
        profile = _GENRE_PROFILES.get(genre, _GENRE_PROFILES.get("pop", {}))
        bpm = features["bpm"]
        energy = features["energy"]
        key = features["key"]

        # BPM percentile
        if tunebat_data and "bpm_distribution" in tunebat_data:
            dist = tunebat_data["bpm_distribution"]
            bpm_min, bpm_max = dist.get("min", 80), dist.get("max", 160)
        else:
            bpm_min, bpm_max = profile.get("bpm_range", (80, 160))

        if bpm_max > bpm_min:
            bpm_pct = ((bpm - bpm_min) / (bpm_max - bpm_min)) * 100
            bpm_pct = round(max(0.0, min(100.0, bpm_pct)), 1)
        else:
            bpm_pct = 50.0

        # Energy percentile
        if tunebat_data and "energy_distribution" in tunebat_data:
            dist = tunebat_data["energy_distribution"]
            en_min, en_max = dist.get("min", 0.0), dist.get("max", 1.0)
        else:
            en_min, en_max = profile.get("energy_range", (0.0, 1.0))

        if en_max > en_min:
            en_pct = ((energy - en_min) / (en_max - en_min)) * 100
            en_pct = round(max(0.0, min(100.0, en_pct)), 1)
        else:
            en_pct = 50.0

        # Key popularity
        common_keys = profile.get("common_keys", [])
        key_lower = key.lower()
        key_pop = "rare"
        for i, ck in enumerate(common_keys):
            if key_lower == ck.lower() or key_lower.split()[0] == ck.split()[0].lower():
                if i < 2:
                    key_pop = "common"
                else:
                    key_pop = "uncommon"
                break

        # Mood alignment — heuristic based on energy + BPM combination
        if energy > 0.7 and bpm > 120:
            mood = "high-energy upbeat — aligns with current dance/pop trends"
        elif energy > 0.5 and 90 <= bpm <= 130:
            mood = "mid-energy groovy — strong mainstream appeal"
        elif energy < 0.4 and bpm < 100:
            mood = "low-energy chill — fits lo-fi/ambient trend"
        elif energy > 0.7 and bpm < 100:
            mood = "intense slow-burn — niche appeal, strong emotional impact"
        else:
            mood = "moderate energy — versatile market positioning"

        return MarketComparison(
            bpm_percentile=bpm_pct,
            energy_percentile=en_pct,
            key_popularity=key_pop,
            mood_alignment=mood,
        )

    # ------------------------------------------------------------------
    # Reference track discovery
    # ------------------------------------------------------------------

    async def _find_references(
        self,
        features: dict[str, Any],
        genre_analysis: GenreAnalysis,
        lastfm_data: dict[str, Any],
    ) -> list[ReferenceTrack]:
        """
        Find 3-5 reference tracks similar to the analyzed one.

        Uses Last.fm data when available, falls back to built-in database.
        """
        references: list[ReferenceTrack] = []
        genre = genre_analysis.primary_genre
        bpm = features["bpm"]
        energy = features["energy"]

        # Source 1: Last.fm top tracks for genre tag
        if lastfm_data and "top_tracks" in lastfm_data:
            for track_data in lastfm_data["top_tracks"][:3]:
                matching = ["genre"]
                # We don't have BPM/energy for Last.fm tracks, so score is lower
                references.append(
                    ReferenceTrack(
                        title=track_data["title"],
                        artist=track_data["artist"],
                        similarity_score=0.65,
                        matching_features=matching,
                        source="lastfm",
                    )
                )

        # Source 2: Built-in reference database
        genre_refs = _REFERENCE_TRACKS.get(genre, [])
        if not genre_refs:
            # Try parent genre (e.g., "bedroom pop" -> "indie pop" -> "pop")
            for parent in [genre.rsplit(" ", 1)[-1], "pop"]:
                if parent in _REFERENCE_TRACKS:
                    genre_refs = _REFERENCE_TRACKS[parent]
                    break

        for ref in genre_refs:
            # Avoid duplicates
            if any(
                r.title == ref["title"] and r.artist == ref["artist"]
                for r in references
            ):
                continue

            # Score based on genre match
            matching = ["genre"]
            score = 0.60

            # Boost score for genre-specific traits
            profile = _GENRE_PROFILES.get(genre, {})
            bpm_lo, bpm_hi = profile.get("bpm_range", (0, 999))
            en_lo, en_hi = profile.get("energy_range", (0, 1))

            if bpm_lo <= bpm <= bpm_hi:
                matching.append("bpm")
                score += 0.12
            if en_lo <= energy <= en_hi:
                matching.append("energy")
                score += 0.10

            references.append(
                ReferenceTrack(
                    title=ref["title"],
                    artist=ref["artist"],
                    similarity_score=round(min(1.0, score), 2),
                    matching_features=matching,
                    source="heuristic",
                )
            )

        # Sort by similarity, take top 5
        references.sort(key=lambda r: r.similarity_score, reverse=True)
        return references[:5]

    # ------------------------------------------------------------------
    # Gap analysis
    # ------------------------------------------------------------------

    async def _gap_analysis(
        self,
        features: dict[str, Any],
        genre_analysis: GenreAnalysis,
        market_comparison: MarketComparison,
        references: list[ReferenceTrack],
    ) -> GapAnalysis:
        """
        Produce SWOT-style gap analysis.

        Attempts LLM synthesis via `claude -p` CLI first. Falls back to
        rule-based heuristics if CLI is unavailable (demo environment).
        """
        # Try LLM-based analysis first
        llm_result = await self._llm_gap_analysis(
            features, genre_analysis, market_comparison, references
        )
        if llm_result:
            return llm_result

        # Fallback: rule-based heuristics
        return self._heuristic_gap_analysis(
            features, genre_analysis, market_comparison
        )

    async def _llm_gap_analysis(
        self,
        features: dict[str, Any],
        genre_analysis: GenreAnalysis,
        market_comparison: MarketComparison,
        references: list[ReferenceTrack],
    ) -> GapAnalysis | None:
        """
        Run gap analysis via LLM (claude -p CLI).

        Returns None if CLI is unavailable or fails (demo environment).
        Per CLAUDE.md: scripts must use `claude -p` CLI, not SDK directly.
        """
        prompt = json.dumps(
            {
                "task": "music_gap_analysis",
                "instruction": (
                    "Analyze this track's position in the market. "
                    "Return JSON with: strengths (list[str]), weaknesses (list[str]), "
                    "opportunities (list[str]), market_fit_score (0-100 float). "
                    "Be specific and actionable. Max 3 items per list. "
                    "Respond with ONLY the JSON object, no markdown."
                ),
                "track_features": {
                    "bpm": features["bpm"],
                    "key": features["key"],
                    "energy": features["energy"],
                    "duration": features["duration"],
                    "sections": features["section_count"],
                },
                "genre": genre_analysis.primary_genre,
                "genre_confidence": genre_analysis.genre_confidence,
                "genre_trend": genre_analysis.genre_trends.get(
                    genre_analysis.primary_genre, "stable"
                ),
                "market_position": {
                    "bpm_percentile": market_comparison.bpm_percentile,
                    "energy_percentile": market_comparison.energy_percentile,
                    "key_popularity": market_comparison.key_popularity,
                },
                "reference_count": len(references),
            },
            ensure_ascii=False,
        )

        try:
            result = await asyncio.to_thread(
                self._call_claude_cli, prompt
            )
            if not result:
                return None

            # Parse LLM JSON response
            data = json.loads(result)
            return GapAnalysis(
                strengths=data.get("strengths", [])[:3],
                weaknesses=data.get("weaknesses", [])[:3],
                opportunities=data.get("opportunities", [])[:3],
                market_fit_score=float(data.get("market_fit_score", 50)),
            )

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            self.logger.warning("llm_parse_error", error=str(e))
            return None
        except Exception as e:
            self.logger.debug("llm_unavailable", error=str(e))
            return None

    def _call_claude_cli(self, prompt: str) -> str | None:
        """
        Call claude -p CLI for LLM inference.

        Returns the raw output string, or None if CLI is unavailable.
        Per CLAUDE.md: use CLI, not SDK. In demo env, this will fail
        gracefully (ENOENT or credit balance too low).
        """
        try:
            proc = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return proc.stdout.strip()
            self.logger.debug(
                "claude_cli_failed",
                returncode=proc.returncode,
                stderr=proc.stderr[:200] if proc.stderr else "",
            )
            return None
        except FileNotFoundError:
            self.logger.debug("claude_cli_not_found", hint="claude not in PATH")
            return None
        except subprocess.TimeoutExpired:
            self.logger.warning("claude_cli_timeout")
            return None

    def _heuristic_gap_analysis(
        self,
        features: dict[str, Any],
        genre_analysis: GenreAnalysis,
        market_comparison: MarketComparison,
    ) -> GapAnalysis:
        """Rule-based gap analysis fallback when LLM is unavailable."""
        strengths: list[str] = []
        weaknesses: list[str] = []
        opportunities: list[str] = []
        fit_score = 50.0

        genre = genre_analysis.primary_genre
        trend = genre_analysis.genre_trends.get(genre, "stable")
        bpm_pct = market_comparison.bpm_percentile
        en_pct = market_comparison.energy_percentile
        key_pop = market_comparison.key_popularity

        # --- Strengths ---
        if 30 <= bpm_pct <= 70:
            strengths.append(
                f"BPM ({features['bpm']:.0f}) sits in the sweet spot for {genre}"
            )
            fit_score += 10
        if 30 <= en_pct <= 70:
            strengths.append(
                f"Energy level aligns well with {genre} market average"
            )
            fit_score += 8
        if key_pop == "common":
            strengths.append(
                f"Key ({features['key']}) is popular in {genre} — radio-friendly"
            )
            fit_score += 5
        if genre_analysis.genre_confidence > 0.7:
            strengths.append(
                f"Strong genre identity ({genre}, {genre_analysis.genre_confidence:.0%} confidence)"
            )
            fit_score += 5
        if trend == "rising":
            strengths.append(f"{genre.title()} is a rising genre — good timing")
            fit_score += 7

        # --- Weaknesses ---
        if bpm_pct < 15 or bpm_pct > 85:
            direction = "slower" if bpm_pct < 15 else "faster"
            weaknesses.append(
                f"BPM ({features['bpm']:.0f}) is {direction} than most {genre} tracks"
            )
            fit_score -= 10
        if en_pct < 15 or en_pct > 85:
            level = "lower" if en_pct < 15 else "higher"
            weaknesses.append(
                f"Energy is {level} than typical {genre} — may feel out of place"
            )
            fit_score -= 8
        if key_pop == "rare":
            weaknesses.append(
                f"Key ({features['key']}) is rare in {genre} — less familiar to listeners"
            )
            fit_score -= 5
        if genre_analysis.genre_confidence < 0.4:
            weaknesses.append(
                "Weak genre identity — track may confuse algorithmic playlisting"
            )
            fit_score -= 8
        if trend == "declining":
            weaknesses.append(
                f"{genre.title()} is declining in popularity"
            )
            fit_score -= 5

        # --- Opportunities ---
        # Cross-genre appeal
        rising = [
            g
            for g, t in genre_analysis.genre_trends.items()
            if t == "rising" and g != genre
        ]
        if rising:
            opportunities.append(
                f"Cross-genre appeal with rising genres: {', '.join(rising[:2])}"
            )

        # Playlist positioning
        if 20 <= bpm_pct <= 80 and 20 <= en_pct <= 80:
            opportunities.append(
                "Well-positioned for algorithmic playlist placement"
            )

        # Key rarity can be a feature
        if key_pop == "rare" and genre_analysis.genre_confidence > 0.5:
            opportunities.append(
                f"Unusual key ({features['key']}) creates a distinctive sound in {genre}"
            )

        # Duration opportunities
        duration = features.get("duration", 0)
        if 150 <= duration <= 210:
            opportunities.append(
                "Track length (2:30-3:30) is optimal for streaming playlists"
            )
        elif duration > 300:
            opportunities.append(
                "Consider a shorter radio edit (< 3:30) for playlist eligibility"
            )

        # Ensure at least 1 item per category
        if not strengths:
            strengths.append(
                f"Unique sonic signature in the {genre} landscape"
            )
        if not weaknesses:
            weaknesses.append(
                "No major weaknesses detected — focus on refinement"
            )
        if not opportunities:
            opportunities.append(
                f"Explore sub-genres adjacent to {genre} for wider reach"
            )

        # Clamp score
        fit_score = round(max(0.0, min(100.0, fit_score)), 1)

        return GapAnalysis(
            strengths=strengths[:3],
            weaknesses=weaknesses[:3],
            opportunities=opportunities[:3],
            market_fit_score=fit_score,
        )

    # ------------------------------------------------------------------
    # Caching helpers
    # ------------------------------------------------------------------

    def _get_cached_trend(
        self, source: str, cache_key: str
    ) -> dict[str, Any] | None:
        """Check MusicDB trend_cache for fresh data."""
        if not self._use_cache:
            return None

        db = self._get_db()
        if not db:
            return None

        try:
            entry = db.get_latest_trend(trend_type=source, genre=cache_key)
            if not entry:
                return None

            # Check TTL (DB column is 'fetched_at', fall back to 'created_at' for compat)
            created = entry.get("fetched_at") or entry.get("created_at", "")
            if created:
                from datetime import timedelta

                created_dt = datetime.fromisoformat(
                    created.replace("Z", "+00:00")
                )
                age = datetime.now(timezone.utc) - created_dt
                if age > timedelta(hours=self._cache_ttl_hours):
                    self.logger.debug(
                        "cache_expired",
                        source=source,
                        key=cache_key,
                        age_hours=age.total_seconds() / 3600,
                    )
                    return None

            data = entry.get("data", entry.get("trend_data"))
            if isinstance(data, str):
                return json.loads(data)
            return data if isinstance(data, dict) else None

        except Exception as e:
            self.logger.debug("cache_read_error", error=str(e))
            return None

    def _save_trend_cache(
        self, source: str, cache_key: str, data: dict[str, Any]
    ) -> None:
        """Save trend data to MusicDB trend_cache."""
        if not self._use_cache:
            return

        db = self._get_db()
        if not db:
            return

        try:
            db.insert_trend(
                {
                    "source": source,
                    "genre": cache_key,
                    "query_key": f"{source}_{cache_key}",
                    "data": json.dumps(data, ensure_ascii=False, default=numpy_default),
                }
            )
        except Exception as e:
            self.logger.debug("cache_write_error", error=str(e))

    def _cache_report(
        self, report: TrendReport, features: dict[str, Any]
    ) -> None:
        """Cache the full report for future lookups."""
        db = self._get_db()
        if not db:
            return

        try:
            # Use a hash of the AudioDNA features as the cache key
            # Sanitize features to avoid numpy types breaking json.dumps
            feature_hash = hashlib.sha256(
                json.dumps(
                    sanitize_for_json({
                        "bpm": features["bpm"],
                        "key": features["key"],
                        "energy": features["energy"],
                    }),
                    sort_keys=True,
                ).encode()
            ).hexdigest()[:16]

            db.insert_trend(
                {
                    "source": "full_report",
                    "genre": feature_hash,
                    "query_key": f"full_report_{feature_hash}",
                    "data": json.dumps(
                        report.model_dump(), ensure_ascii=False, default=numpy_default
                    ),
                }
            )
        except Exception as e:
            self.logger.debug("report_cache_error", error=str(e))

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def _quick_genre_guess(self, features: dict[str, Any]) -> str:
        """Fast genre guess from BPM + energy without full scoring."""
        bpm = features["bpm"]
        energy = features["energy"]

        if energy < 0.3 and bpm < 95:
            return "lo-fi"
        if energy > 0.8 and bpm > 140:
            return "electronic"
        if energy > 0.8 and 100 <= bpm <= 150:
            return "rock"
        if 60 <= bpm <= 100 and energy < 0.65:
            return "r&b"
        if 130 <= bpm <= 170 and 0.5 <= energy <= 0.9:
            return "trap"
        if 100 <= bpm <= 130 and 0.5 <= energy <= 0.85:
            return "pop"
        if 118 <= bpm <= 132 and energy > 0.6:
            return "house"
        return "pop"


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

async def _cli_main() -> None:
    """CLI: analyze AudioDNA JSON and produce a TrendReport."""
    import argparse

    from ..config import get_settings
    from ..utils.logging import setup_logging

    settings = get_settings()
    setup_logging(settings.log_level)

    parser = argparse.ArgumentParser(
        description="Trend Scout — compare AudioDNA with market trends",
        epilog=(
            "Example:\n"
            "  python -m src.agents.trend_scout --audio-dna output/dna.json\n"
            "  python -m src.agents.trend_scout --audio-dna dna.json --output report.json\n"
        ),
    )
    parser.add_argument(
        "--audio-dna",
        required=True,
        help="Path to AudioDNA JSON file (output of AudioAnalyst)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON file path (default: print to stdout)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Disable trend cache lookups",
    )

    args = parser.parse_args()

    # Load AudioDNA
    dna_path = Path(args.audio_dna)
    if not dna_path.is_file():
        logger.error("file_not_found", path=str(dna_path))
        raise SystemExit(1)

    try:
        audio_dna = json.loads(dna_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        logger.error("invalid_json", path=str(dna_path), error=str(e))
        raise SystemExit(1)

    # Run scout
    scout = TrendScout(use_cache=not args.no_cache)

    try:
        report = await scout.scout(audio_dna)
    except TrendScoutError as e:
        logger.error("scout_failed", error=str(e))
        raise SystemExit(1)

    # Output
    output_json = json.dumps(report.model_dump(), indent=2, ensure_ascii=False)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output_json, encoding="utf-8")
        logger.info("output_written", path=str(out_path))
        print(f"\nTrendReport written to {out_path}")
    else:
        print("\n=== TrendReport ===")
        print(output_json)

    # Summary
    ga = report.genre_analysis
    mc = report.market_comparison
    gap = report.gap_analysis
    print(f"\n--- Summary ---")
    print(f"  Genre:       {ga.primary_genre} (confidence: {ga.genre_confidence:.0%})")
    print(f"  Genres:      {', '.join(ga.detected_genres)}")
    print(f"  Trends:      {ga.genre_trends}")
    print(f"  BPM pct:     {mc.bpm_percentile}%")
    print(f"  Energy pct:  {mc.energy_percentile}%")
    print(f"  Key:         {mc.key_popularity}")
    print(f"  References:  {len(report.reference_tracks)}")
    print(f"  Market fit:  {gap.market_fit_score}/100")
    print(f"  Time:        {report.processing_time_seconds}s")


if __name__ == "__main__":
    asyncio.run(_cli_main())
