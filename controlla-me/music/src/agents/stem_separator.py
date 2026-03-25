"""
Stem Separator Agent — Audio source separation via Demucs v4.

Separates an audio file into 4 stems: vocals, drums, bass, other.
Uses Meta's Demucs (htdemucs by default) for state-of-the-art separation.

CLI usage:
    python -m src.agents.stem_separator --input file.mp3 [--output-dir /path] [--model htdemucs]
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

import structlog

from .base import BaseAgent
from ..models.audio import AudioMetadata, StemResult

logger = structlog.get_logger()

# Supported input formats
SUPPORTED_FORMATS = {"mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"}

# Default maximum file size: 50 MB
DEFAULT_MAX_FILE_SIZE_MB = 50

# Available Demucs v4 models (htdemucs is the default hybrid transformer model)
DEMUCS_MODELS = {
    "htdemucs",         # Hybrid Transformer Demucs (default, best quality)
    "htdemucs_ft",      # Fine-tuned variant (slower, slightly better)
    "htdemucs_6s",      # 6-stem variant (adds piano + guitar)
    "hdemucs_mmi",      # Hybrid Demucs with MMI training
    "mdx",              # MDX-Net architecture
    "mdx_extra",        # MDX-Net with extra training data
    "mdx_q",            # MDX-Net quantized (faster, less memory)
    "mdx_extra_q",      # MDX-Net extra quantized
}

# The 4 standard Demucs output stems
STEM_NAMES = ("vocals", "drums", "bass", "other")


class StemSeparationError(Exception):
    """Raised when Demucs separation fails."""


class UnsupportedFormatError(ValueError):
    """Raised for unsupported audio formats."""


class FileTooLargeError(ValueError):
    """Raised when audio file exceeds the size limit."""


class StemSeparator(BaseAgent):
    """
    Separates audio into 4 stems using Demucs v4.

    Args:
        model: Demucs model name (default: htdemucs)
        output_dir: Directory for output stems. If None, uses a temp directory.
        max_file_size_mb: Maximum input file size in MB (default: 50)
        device: Torch device — "cuda", "cpu", or "auto" (default: auto)
    """

    def __init__(
        self,
        model: str = "htdemucs",
        output_dir: str | None = None,
        max_file_size_mb: int = DEFAULT_MAX_FILE_SIZE_MB,
        device: str = "auto",
    ) -> None:
        super().__init__("stem_separator")
        self.model = model
        self.output_dir = output_dir
        self.max_file_size_mb = max_file_size_mb
        self.device = device

        if model not in DEMUCS_MODELS:
            self.logger.warning(
                "unknown_model",
                model=model,
                known_models=sorted(DEMUCS_MODELS),
                hint="Proceeding anyway — Demucs may support additional models",
            )

    async def run(self, **kwargs: Any) -> dict:
        """
        Run stem separation on an audio file.

        Keyword Args:
            input_path: Path to the input audio file (required)
            output_dir: Override output directory for this run
            model: Override model for this run

        Returns:
            dict with StemResult data and AudioMetadata
        """
        input_path = kwargs.get("input_path")
        if not input_path:
            raise ValueError("input_path is required")

        output_dir = kwargs.get("output_dir", self.output_dir)
        model = kwargs.get("model", self.model)

        result = await self.separate(
            input_path=str(input_path),
            output_dir=output_dir,
            model=model,
        )

        return {
            "stem_result": result.model_dump(),
            "status": "success",
        }

    async def separate(
        self,
        input_path: str,
        output_dir: str | None = None,
        model: str | None = None,
    ) -> StemResult:
        """
        Separate an audio file into stems.

        Args:
            input_path: Path to the audio file
            output_dir: Output directory (default: temp dir)
            model: Demucs model to use (default: instance model)

        Returns:
            StemResult with paths to all separated stems
        """
        model = model or self.model
        audio_meta = self._validate_input(input_path)

        # Resolve output directory
        if output_dir:
            out_path = Path(output_dir)
            out_path.mkdir(parents=True, exist_ok=True)
        else:
            out_path = Path(tempfile.mkdtemp(prefix="demucs_"))

        self.log_start(
            input_file=audio_meta.file_name,
            format=audio_meta.format,
            file_size_mb=round(audio_meta.file_size_bytes / (1024 * 1024), 2),
            duration_seconds=audio_meta.duration_seconds,
            model=model,
            output_dir=str(out_path),
        )

        t0 = time.monotonic()

        # Run Demucs in a thread to avoid blocking the event loop
        stem_paths = await asyncio.to_thread(
            self._run_demucs, input_path, str(out_path), model
        )

        processing_time = time.monotonic() - t0

        result = StemResult(
            vocals_path=stem_paths["vocals"],
            drums_path=stem_paths["drums"],
            bass_path=stem_paths["bass"],
            other_path=stem_paths["other"],
            duration_seconds=audio_meta.duration_seconds,
            sample_rate=audio_meta.sample_rate,
            model_used=model,
            processing_time_seconds=round(processing_time, 2),
        )

        # Verify all stems were created
        missing = result.verify_stems_exist()
        if missing:
            raise StemSeparationError(
                f"Demucs completed but {len(missing)} stem(s) not found: {missing}"
            )

        self.log_complete(
            processing_time_seconds=result.processing_time_seconds,
            model=model,
            stems_created=4,
            output_dir=str(out_path),
        )

        return result

    def _validate_input(self, input_path: str) -> AudioMetadata:
        """
        Validate the input file: existence, format, size, and extract metadata.

        Returns:
            AudioMetadata for the input file

        Raises:
            FileNotFoundError: if file does not exist
            UnsupportedFormatError: if format is not supported
            FileTooLargeError: if file exceeds size limit
        """
        path = Path(input_path)

        # Check existence
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {input_path}")

        # Check format
        ext = path.suffix.lower().lstrip(".")
        if ext not in SUPPORTED_FORMATS:
            raise UnsupportedFormatError(
                f"Unsupported format '{ext}'. Supported: {sorted(SUPPORTED_FORMATS)}"
            )

        # Check file size
        file_size = path.stat().st_size
        max_bytes = self.max_file_size_mb * 1024 * 1024
        if file_size > max_bytes:
            raise FileTooLargeError(
                f"File size {file_size / (1024 * 1024):.1f} MB exceeds "
                f"limit of {self.max_file_size_mb} MB"
            )

        # Extract audio metadata via ffprobe (available wherever ffmpeg is installed)
        duration, sample_rate, channels = self._probe_audio(input_path)

        return AudioMetadata(
            file_path=str(path.resolve()),
            file_name=path.name,
            format=ext,
            file_size_bytes=file_size,
            duration_seconds=duration,
            sample_rate=sample_rate,
            channels=channels,
        )

    def _probe_audio(self, input_path: str) -> tuple[float, int, int]:
        """
        Extract duration, sample rate, and channel count via ffprobe.

        Falls back to sensible defaults if ffprobe is unavailable.
        """
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-select_streams", "a:0",
                    "-show_entries", "stream=duration,sample_rate,channels",
                    "-show_entries", "format=duration",
                    "-of", "csv=p=0:s=,",
                    input_path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                self.logger.warning(
                    "ffprobe_failed",
                    stderr=result.stderr[:200],
                    hint="Using default metadata values",
                )
                return (0.0, 44100, 2)

            # ffprobe outputs: stream line (sample_rate,channels,duration) then format line (duration)
            lines = [l.strip() for l in result.stdout.strip().split("\n") if l.strip()]

            duration = 0.0
            sample_rate = 44100
            channels = 2

            for line in lines:
                parts = line.split(",")
                for part in parts:
                    part = part.strip()
                    if not part or part == "N/A":
                        continue
                    try:
                        val = float(part)
                    except ValueError:
                        continue
                    # Heuristic: sample rates are > 8000, channels <= 8, duration varies
                    if val > 8000 and sample_rate == 44100:
                        sample_rate = int(val)
                    elif 0 < val <= 8 and channels == 2 and val == int(val):
                        channels = int(val)
                    elif val > 0 and duration == 0.0 and val < 100000:
                        duration = round(val, 3)

            return (duration, sample_rate, channels)

        except FileNotFoundError:
            self.logger.warning(
                "ffprobe_not_installed",
                hint="Install ffmpeg for accurate metadata. Using defaults.",
            )
            return (0.0, 44100, 2)
        except subprocess.TimeoutExpired:
            self.logger.warning("ffprobe_timeout", timeout_seconds=30)
            return (0.0, 44100, 2)

    def _run_demucs(
        self, input_path: str, output_dir: str, model: str
    ) -> dict[str, str]:
        """
        Invoke Demucs CLI to separate the audio file.

        Args:
            input_path: Path to input audio
            output_dir: Base output directory
            model: Demucs model name

        Returns:
            dict mapping stem name -> absolute file path

        Raises:
            StemSeparationError: on Demucs failure
        """
        cmd = [
            sys.executable, "-m", "demucs",
            "--name", model,
            "--out", output_dir,
            "--two-stems" if False else None,  # placeholder, always use 4-stem
            input_path,
        ]
        # Filter out None entries
        cmd = [c for c in cmd if c is not None]

        # Add device flag
        if self.device != "auto":
            cmd.extend(["--device", self.device])

        self.logger.info(
            "demucs_invoke",
            cmd=" ".join(cmd),
            model=model,
        )

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10-minute timeout for large files
            )
        except subprocess.TimeoutExpired:
            raise StemSeparationError(
                "Demucs timed out after 600 seconds. "
                "File may be too long or system too slow."
            )
        except FileNotFoundError:
            raise StemSeparationError(
                "Demucs is not installed. Install with: pip install demucs"
            )

        if proc.returncode != 0:
            stderr_snippet = proc.stderr[:500] if proc.stderr else "(no stderr)"

            # Detect OOM / killed-by-OS signals for a clear error message
            is_oom = (
                proc.returncode == -9      # SIGKILL (OOM killer)
                or proc.returncode == 137   # 128 + 9 (SIGKILL via shell)
                or "Killed" in stderr_snippet
                or "MemoryError" in stderr_snippet
                or "Cannot allocate memory" in stderr_snippet
                or "CUDA out of memory" in stderr_snippet
                or "OutOfMemoryError" in stderr_snippet
            )

            if is_oom:
                self.logger.warning(
                    "demucs_oom",
                    return_code=proc.returncode,
                    stderr=stderr_snippet[:200],
                    hint="Server does not have enough RAM/VRAM for Demucs. Pipeline will continue without stems.",
                )
                raise StemSeparationError(
                    f"Demucs killed by OS (likely OOM, exit code {proc.returncode}). "
                    f"Server needs more RAM or GPU for stem separation."
                )

            raise StemSeparationError(
                f"Demucs exited with code {proc.returncode}. "
                f"stderr: {stderr_snippet}"
            )

        # Log any warnings from Demucs
        if proc.stderr:
            for line in proc.stderr.strip().split("\n"):
                if line.strip():
                    self.logger.debug("demucs_stderr", line=line.strip())

        # Demucs output structure: <output_dir>/<model>/<track_name>/<stem>.wav
        input_stem = Path(input_path).stem
        stems_dir = Path(output_dir) / model / input_stem

        if not stems_dir.is_dir():
            # Some Demucs versions use "htdemucs" subfolder naming differently.
            # Try alternative: <output_dir>/<track_name>/<stem>.wav
            alt_dir = Path(output_dir) / input_stem
            if alt_dir.is_dir():
                stems_dir = alt_dir
            else:
                raise StemSeparationError(
                    f"Demucs output directory not found. "
                    f"Expected: {stems_dir} or {alt_dir}. "
                    f"Contents of {output_dir}: {list(Path(output_dir).rglob('*'))}"
                )

        stem_paths: dict[str, str] = {}
        for stem_name in STEM_NAMES:
            stem_file = stems_dir / f"{stem_name}.wav"
            if not stem_file.is_file():
                # Also check for .mp3 or .flac outputs (configurable in some Demucs versions)
                for alt_ext in (".mp3", ".flac"):
                    alt_file = stems_dir / f"{stem_name}{alt_ext}"
                    if alt_file.is_file():
                        stem_file = alt_file
                        break

            stem_paths[stem_name] = str(stem_file.resolve())

        return stem_paths


async def _cli_main() -> None:
    """CLI entry point for stem separation."""
    import argparse

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.dev.ConsoleRenderer(colors=True),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
    )

    parser = argparse.ArgumentParser(
        description="Separate audio into stems using Demucs v4",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m src.agents.stem_separator --input song.mp3\n"
            "  python -m src.agents.stem_separator --input song.wav --output-dir ./stems --model htdemucs_ft\n"
            "  python -m src.agents.stem_separator --input song.flac --device cpu --max-size 100\n"
        ),
    )
    parser.add_argument(
        "--input", required=True, help="Path to input audio file (MP3, WAV, FLAC, etc.)"
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Output directory for stems (default: auto temp dir)",
    )
    parser.add_argument(
        "--model",
        default="htdemucs",
        help=f"Demucs model (default: htdemucs). Known: {sorted(DEMUCS_MODELS)}",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cpu", "cuda"],
        help="Torch device (default: auto)",
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=DEFAULT_MAX_FILE_SIZE_MB,
        help=f"Max input file size in MB (default: {DEFAULT_MAX_FILE_SIZE_MB})",
    )

    args = parser.parse_args()

    separator = StemSeparator(
        model=args.model,
        output_dir=args.output_dir,
        max_file_size_mb=args.max_size,
        device=args.device,
    )

    try:
        result = await separator.separate(
            input_path=args.input,
            output_dir=args.output_dir,
            model=args.model,
        )

        print("\n=== Stem Separation Complete ===")
        print(f"  Model:      {result.model_used}")
        print(f"  Duration:   {result.duration_seconds:.1f}s")
        print(f"  Sample rate: {result.sample_rate} Hz")
        print(f"  Time:       {result.processing_time_seconds:.1f}s")
        print(f"\n  Vocals: {result.vocals_path}")
        print(f"  Drums:  {result.drums_path}")
        print(f"  Bass:   {result.bass_path}")
        print(f"  Other:  {result.other_path}")

    except FileNotFoundError as e:
        logger.error("file_not_found", error=str(e))
        raise SystemExit(1)
    except UnsupportedFormatError as e:
        logger.error("unsupported_format", error=str(e))
        raise SystemExit(1)
    except FileTooLargeError as e:
        logger.error("file_too_large", error=str(e))
        raise SystemExit(1)
    except StemSeparationError as e:
        logger.error("separation_failed", error=str(e))
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(_cli_main())
