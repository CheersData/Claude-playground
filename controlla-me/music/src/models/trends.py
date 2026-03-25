"""Trend analysis data models for the music pipeline."""

from __future__ import annotations

from pydantic import BaseModel, Field


class GenreAnalysis(BaseModel):
    """Genre classification and trend direction for the analyzed track."""

    detected_genres: list[str] = Field(
        description="All genres detected from AudioDNA features"
    )
    primary_genre: str = Field(description="Most likely genre")
    genre_confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence in primary genre detection"
    )
    genre_trends: dict[str, str] = Field(
        default_factory=dict,
        description='Genre -> trend direction: "rising", "stable", or "declining"',
    )


class MarketComparison(BaseModel):
    """How the track compares to genre averages on key audio dimensions."""

    bpm_percentile: float = Field(
        ge=0.0,
        le=100.0,
        description="Where this track sits in genre BPM distribution (0-100)",
    )
    energy_percentile: float = Field(
        ge=0.0,
        le=100.0,
        description="Where this track sits in genre energy distribution (0-100)",
    )
    key_popularity: str = Field(
        description='How common the track key is for this genre: "common", "uncommon", or "rare"'
    )
    mood_alignment: str = Field(
        description="How well the track mood aligns with current genre trends"
    )


class ReferenceTrack(BaseModel):
    """A reference track similar to the analyzed one."""

    title: str = Field(description="Track title")
    artist: str = Field(description="Artist name")
    similarity_score: float = Field(
        ge=0.0, le=1.0, description="Similarity score (0-1)"
    )
    matching_features: list[str] = Field(
        description="Which AudioDNA features matched (e.g. bpm, key, energy)"
    )
    source: str = Field(
        description='Data source: "tunebat", "lastfm", "musicbrainz", "heuristic"'
    )


class GapAnalysis(BaseModel):
    """SWOT-style analysis of the track vs market."""

    strengths: list[str] = Field(description="What the track does well vs market")
    weaknesses: list[str] = Field(
        description="Where the track falls short vs market"
    )
    opportunities: list[str] = Field(
        description="Market opportunities the track could exploit"
    )
    market_fit_score: float = Field(
        ge=0.0,
        le=100.0,
        description="Overall market fit score (0-100)",
    )


class TrendReport(BaseModel):
    """Complete trend analysis report for a track."""

    analysis_id: str = Field(description="Unique identifier for this analysis")
    timestamp: str = Field(description="ISO 8601 timestamp of analysis")
    genre_analysis: GenreAnalysis
    market_comparison: MarketComparison
    reference_tracks: list[ReferenceTrack] = Field(default_factory=list)
    gap_analysis: GapAnalysis
    processing_time_seconds: float = Field(
        ge=0.0, description="Wall-clock time for the full trend analysis"
    )


# ---------------------------------------------------------------------------
# Arrangement Director models
# ---------------------------------------------------------------------------


class ArrangementSuggestion(BaseModel):
    """A single prescriptive arrangement suggestion."""

    area: str = Field(
        description=(
            'Suggestion area: "structure", "instrumentation", "rhythm", '
            '"harmony", "vocals", "mix", "production"'
        )
    )
    priority: int = Field(
        ge=1, le=10, description="Priority / impact score (1=low, 10=critical)"
    )
    suggestion: str = Field(
        description="Prescriptive action — what to do, not what to consider"
    )
    rationale: str = Field(description="Why this helps commercially and artistically")
    reference: str | None = Field(
        default=None,
        description="Reference track that executes this technique well",
    )


class ArrangementPlan(BaseModel):
    """Complete prescriptive arrangement plan from the Arrangement Director."""

    analysis_id: str = Field(description="Unique identifier for this plan")
    timestamp: str = Field(description="ISO 8601 timestamp of generation")
    overall_direction: str = Field(
        description="Big-picture artistic direction (1-3 sentences)"
    )
    suggestions: list[ArrangementSuggestion] = Field(
        description="Max 10 prescriptive suggestions, ordered by priority"
    )
    vocal_direction: str | None = Field(
        default=None,
        description="Specific vocal delivery, effects, and layering recommendations",
    )
    production_notes: str = Field(
        description="Mix, master, and sonic palette suggestions"
    )
    commercial_viability_delta: float = Field(
        ge=-10.0,
        le=10.0,
        description="Estimated commercial viability change (-10 to +10)",
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence in the plan quality (0-1)"
    )
    processing_time_seconds: float = Field(
        ge=0.0, description="Wall-clock time for plan generation"
    )


# ---------------------------------------------------------------------------
# Release Strategist models
# ---------------------------------------------------------------------------


class MetadataStrategy(BaseModel):
    """Optimized metadata for streaming platform discoverability."""

    primary_genre: str = Field(description="Primary genre tag (Spotify-valid)")
    secondary_genre: str = Field(description="Secondary genre tag (Spotify-valid)")
    mood: list[str] = Field(
        description="2-4 mood tags (e.g. energetic, melancholic, dreamy)"
    )
    description: str = Field(
        description="Short bio for Spotify/Apple Music (max 300 chars)"
    )


class TimingStrategy(BaseModel):
    """Optimal release timing for algorithmic visibility."""

    recommended_day: str = Field(description="Best day of the week to release")
    recommended_time: str = Field(description="Best time in UTC (e.g. 00:00 UTC)")
    why: str = Field(description="Rationale for the chosen timing")


class PlaylistStrategy(BaseModel):
    """Playlist targeting strategy for editorial and independent curators."""

    editorial_targets: list[str] = Field(
        description="2-5 realistic editorial playlists on Spotify/Apple Music"
    )
    independent_curators: list[str] = Field(
        description="2-3 independent curating platforms or channels"
    )
    pre_save_strategy: str = Field(
        description="Pre-save campaign recommendation"
    )


class PlatformStrategy(BaseModel):
    """Platform-specific distribution recommendations."""

    recommended_distributor: str = Field(
        description="Recommended distributor (e.g. DistroKid, TuneCore)"
    )
    estimated_cost: str = Field(description="Cost estimate for distribution")
    priority_territories: list[str] = Field(
        description="Priority markets based on genre fit"
    )
    platform_notes: list[str] = Field(
        default_factory=list,
        description="Platform-specific tips (Spotify, Apple Music, YouTube, TikTok)",
    )


class MarketingHook(BaseModel):
    """A marketing angle or hook for promoting the release."""

    hook: str = Field(description="The marketing hook or angle")
    channel: str = Field(
        description="Best channel for this hook (e.g. TikTok, Instagram, press)"
    )
    why: str = Field(description="Why this hook works for this track")


class ReleaseStrategy(BaseModel):
    """Complete release strategy output from the Release Strategist agent."""

    metadata: MetadataStrategy
    timing: TimingStrategy
    playlist_strategy: PlaylistStrategy
    distribution: PlatformStrategy
    marketing_hooks: list[MarketingHook] = Field(
        description="2-4 marketing angles for promotion"
    )
    quality_notes: str | None = Field(
        default=None,
        description="Notes on how quality review results affect release readiness",
    )
    processing_time_seconds: float = Field(
        ge=0.0, description="Wall-clock time for strategy generation"
    )
