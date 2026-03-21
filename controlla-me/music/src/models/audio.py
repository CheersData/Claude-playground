"""Audio data models for the music pipeline."""

from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field, field_validator


class AudioMetadata(BaseModel):
    """Metadata extracted from an input audio file."""

    file_path: str = Field(description="Absolute path to the audio file")
    file_name: str = Field(description="File name with extension")
    format: str = Field(description="Audio format: mp3, wav, flac, etc.")
    file_size_bytes: int = Field(ge=0, description="File size in bytes")
    duration_seconds: float = Field(ge=0, description="Duration in seconds")
    sample_rate: int = Field(gt=0, description="Sample rate in Hz")
    channels: int = Field(gt=0, description="Number of audio channels")

    @field_validator("format")
    @classmethod
    def normalize_format(cls, v: str) -> str:
        return v.lower().lstrip(".")


class StemResult(BaseModel):
    """Result of a stem separation operation."""

    vocals_path: str = Field(description="Path to separated vocals stem")
    drums_path: str = Field(description="Path to separated drums stem")
    bass_path: str = Field(description="Path to separated bass stem")
    other_path: str = Field(description="Path to separated other/accompaniment stem")
    duration_seconds: float = Field(ge=0, description="Duration of the source audio in seconds")
    sample_rate: int = Field(gt=0, description="Sample rate of the output stems in Hz")
    model_used: str = Field(description="Demucs model name used for separation")
    processing_time_seconds: float = Field(ge=0, description="Wall-clock time for separation")

    def all_stem_paths(self) -> list[str]:
        """Return all stem paths as a list."""
        return [self.vocals_path, self.drums_path, self.bass_path, self.other_path]

    def verify_stems_exist(self) -> list[str]:
        """Return list of stem paths that do NOT exist on disk."""
        return [p for p in self.all_stem_paths() if not Path(p).is_file()]
