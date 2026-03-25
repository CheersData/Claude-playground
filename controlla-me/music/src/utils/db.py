"""
Supabase client for the music analysis system.
Shares the same Supabase instance as the main app.
Music data lives in music_* tables.
"""

from __future__ import annotations

from datetime import datetime
from functools import lru_cache
from typing import Any

import structlog
from supabase import Client, create_client

from ..config import get_settings

logger = structlog.get_logger()


@lru_cache
def get_supabase() -> Client:
    """Get shared Supabase client (singleton)."""
    settings = get_settings()
    return create_client(settings.supabase.url, settings.supabase.service_role_key)


class MusicDB:
    """CRUD operations for music tables."""

    def __init__(self) -> None:
        self._client = get_supabase()

    # --- Analyses --------------------------------------------------------

    def insert_analysis(self, analysis_data: dict[str, Any]) -> dict:
        """Insert a new music analysis record."""
        record = {
            **analysis_data,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self._client.table("music_analyses").insert(record).execute()
        logger.info(
            "analysis_inserted",
            track_name=analysis_data.get("track_name"),
            analysis_type=analysis_data.get("analysis_type"),
        )
        return result.data[0] if result.data else {}

    def get_analysis(self, analysis_id: str) -> dict | None:
        """Get a single analysis by ID."""
        result = (
            self._client.table("music_analyses")
            .select("*")
            .eq("id", analysis_id)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_analyses_by_track(self, track_name: str, limit: int = 20) -> list[dict]:
        """Get analyses for a specific track."""
        result = (
            self._client.table("music_analyses")
            .select("*")
            .eq("track_name", track_name)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def get_latest_analyses(self, limit: int = 50) -> list[dict]:
        """Get the most recent analyses."""
        result = (
            self._client.table("music_analyses")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def update_analysis(self, analysis_id: str, updates: dict[str, Any]) -> dict:
        """Update an analysis record."""
        updates["updated_at"] = datetime.utcnow().isoformat()
        result = (
            self._client.table("music_analyses")
            .update(updates)
            .eq("id", analysis_id)
            .execute()
        )
        return result.data[0] if result.data else {}

    # --- Artist Profiles -------------------------------------------------

    def upsert_artist_profile(self, profile: dict[str, Any]) -> dict:
        """Upsert an artist profile (by user_id).

        Requires 'user_id' in the profile dict.  The unique constraint is
        on user_id (music_artist_profiles_user_unique), not artist_name.
        """
        if not profile.get("user_id"):
            logger.warning("artist_profile_skip", reason="no user_id provided")
            return {}
        profile["updated_at"] = datetime.utcnow().isoformat()
        result = (
            self._client.table("music_artist_profiles")
            .upsert(profile, on_conflict="user_id")
            .execute()
        )
        logger.info(
            "artist_profile_upserted",
            artist_name=profile.get("artist_name"),
        )
        return result.data[0] if result.data else {}

    def get_artist_profile(self, artist_name: str) -> dict | None:
        """Get an artist profile by name."""
        result = (
            self._client.table("music_artist_profiles")
            .select("*")
            .eq("artist_name", artist_name)
            .execute()
        )
        return result.data[0] if result.data else None

    def get_all_artist_profiles(self, limit: int = 100) -> list[dict]:
        """Get all artist profiles."""
        result = (
            self._client.table("music_artist_profiles")
            .select("*")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    # --- Trend Cache -----------------------------------------------------

    def insert_trend(self, trend_data: dict[str, Any]) -> dict:
        """Insert a trend cache entry.

        Accepts legacy keys (trend_type) and maps them to the DB schema
        columns: source, query_key, genre, data, fetched_at, expires_at.
        """
        # Map legacy field names to actual DB schema (migration 045)
        source = trend_data.get("source") or trend_data.get("trend_type", "unknown")
        genre = trend_data.get("genre", "unknown")
        query_key = trend_data.get("query_key") or f"{source}_{genre}"
        data = trend_data.get("data")

        record = {
            "source": source,
            "genre": genre,
            "query_key": query_key,
            "data": data,
            # fetched_at and expires_at have DB defaults (now() and now()+7d)
        }
        result = (
            self._client.table("music_trend_cache")
            .upsert(record, on_conflict="source,query_key")
            .execute()
        )
        logger.info(
            "trend_inserted",
            source=source,
            genre=genre,
        )
        return result.data[0] if result.data else {}

    def get_trends(
        self,
        trend_type: str | None = None,
        genre: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        """Get trend cache entries, optionally filtered by source and/or genre.

        Args:
            trend_type: Maps to the 'source' column in DB (legacy name kept for API compat).
            genre: Filter by genre.
            limit: Max entries to return.
        """
        query = self._client.table("music_trend_cache").select("*")
        if trend_type:
            query = query.eq("source", trend_type)
        if genre:
            query = query.eq("genre", genre)
        result = query.order("fetched_at", desc=True).limit(limit).execute()
        return result.data or []

    def get_latest_trend(self, trend_type: str, genre: str | None = None) -> dict | None:
        """Get the most recent trend entry for a given source.

        Args:
            trend_type: Maps to the 'source' column in DB (legacy name kept for API compat).
            genre: Optional genre filter.
        """
        query = (
            self._client.table("music_trend_cache")
            .select("*")
            .eq("source", trend_type)
        )
        if genre:
            query = query.eq("genre", genre)
        result = query.order("fetched_at", desc=True).limit(1).execute()
        return result.data[0] if result.data else None

    def delete_old_trends(self, days: int = 90) -> int:
        """Delete trend cache entries older than N days. Returns count deleted."""
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
        result = (
            self._client.table("music_trend_cache")
            .delete()
            .lt("fetched_at", cutoff)
            .execute()
        )
        count = len(result.data) if result.data else 0
        logger.info("old_trends_deleted", count=count, older_than_days=days)
        return count
