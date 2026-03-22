"""
Central configuration for the music analysis system.
Reads from environment variables with sensible defaults.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings

# Load .env.local from project root (controlla-me/) before any settings class is
# instantiated. Needed because sub-settings classes are created via default_factory
# and don't inherit env_file from the parent Settings.
# override=False: actual env vars take precedence over the file.
_ENV_FILE = Path(__file__).parents[3] / ".env.local"
load_dotenv(_ENV_FILE, override=False)


class SupabaseSettings(BaseSettings):
    """Supabase connection (shared with the main app)."""

    url: str = Field(..., alias="NEXT_PUBLIC_SUPABASE_URL")
    service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")

    model_config = {"env_prefix": "", "extra": "ignore"}


class TunebatSettings(BaseSettings):
    """Tunebat API configuration for music metadata (key, BPM, popularity)."""

    api_key: str = Field(default="", alias="TUNEBAT_API_KEY")
    base_url: str = Field(
        default="https://api.tunebat.com/v1",
        alias="TUNEBAT_BASE_URL",
    )

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    model_config = {"env_prefix": "", "extra": "ignore"}


class HooktheorySettings(BaseSettings):
    """Hooktheory API configuration for chord progression analysis."""

    api_key: str = Field(default="", alias="HOOKTHEORY_API_KEY")
    base_url: str = Field(
        default="https://api.hooktheory.com/v1",
        alias="HOOKTHEORY_BASE_URL",
    )

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    model_config = {"env_prefix": "", "extra": "ignore"}


class AudioSettings(BaseSettings):
    """Audio processing parameters."""

    max_file_size_mb: int = Field(
        default=50,
        alias="MUSIC_MAX_FILE_SIZE_MB",
        description="Maximum audio file size in MB",
    )
    supported_formats: list[str] = Field(
        default=["wav", "mp3", "flac", "ogg", "m4a", "aac", "wma", "aiff"],
        description="Supported audio file formats",
    )
    sample_rate: int = Field(
        default=44100,
        alias="MUSIC_SAMPLE_RATE",
        description="Default sample rate for audio processing",
    )
    stem_output_dir: str = Field(
        default="output/stems",
        alias="MUSIC_STEM_OUTPUT_DIR",
        description="Directory for separated stem outputs",
    )
    demucs_model: str = Field(
        default="htdemucs_ft",
        alias="MUSIC_DEMUCS_MODEL",
        description="Demucs model for source separation (htdemucs_ft = fine-tuned, best quality)",
    )
    analysis_cache_dir: str = Field(
        default="output/cache",
        alias="MUSIC_ANALYSIS_CACHE_DIR",
        description="Directory for caching analysis results",
    )

    model_config = {"env_prefix": "MUSIC_", "extra": "ignore"}


class TelegramSettings(BaseSettings):
    """Telegram notification settings for music analysis alerts."""

    notify_analysis_complete: bool = Field(
        default=False,
        alias="MUSIC_TELEGRAM_NOTIFY",
        description="Send Telegram notification when analysis completes",
    )

    model_config = {"env_prefix": "", "extra": "ignore"}


class Settings(BaseSettings):
    """Root settings — aggregates all sub-configs."""

    mode: Literal["analysis", "production", "batch"] = Field(
        default="analysis",
        alias="MUSIC_MODE",
    )
    enabled: bool = Field(default=True, alias="MUSIC_ENABLED")
    log_level: str = Field(default="INFO", alias="MUSIC_LOG_LEVEL")

    # Sub-configs
    supabase: SupabaseSettings = Field(default_factory=SupabaseSettings)
    tunebat: TunebatSettings = Field(default_factory=TunebatSettings)
    hooktheory: HooktheorySettings = Field(default_factory=HooktheorySettings)
    audio: AudioSettings = Field(default_factory=AudioSettings)
    telegram: TelegramSettings = Field(default_factory=TelegramSettings)

    model_config = {"env_prefix": "", "extra": "ignore", "env_file": "../.env.local"}


@lru_cache
def get_settings() -> Settings:
    """Singleton settings instance, cached after first load."""
    return Settings()  # type: ignore[call-arg]
