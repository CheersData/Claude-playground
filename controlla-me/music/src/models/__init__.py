"""Music pipeline data models."""

from .audio import AudioMetadata, StemResult
from .trends import (
    ArrangementPlan,
    ArrangementSuggestion,
    GapAnalysis,
    GenreAnalysis,
    MarketComparison,
    MarketingHook,
    MetadataStrategy,
    PlatformStrategy,
    PlaylistStrategy,
    ReferenceTrack,
    ReleaseStrategy,
    TimingStrategy,
    TrendReport,
)

__all__ = [
    "ArrangementPlan",
    "ArrangementSuggestion",
    "AudioMetadata",
    "GapAnalysis",
    "GenreAnalysis",
    "MarketComparison",
    "MarketingHook",
    "MetadataStrategy",
    "PlatformStrategy",
    "PlaylistStrategy",
    "ReferenceTrack",
    "ReleaseStrategy",
    "StemResult",
    "TimingStrategy",
    "TrendReport",
]
