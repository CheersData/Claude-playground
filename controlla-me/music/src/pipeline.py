"""
Music analysis pipeline orchestrator.

Coordinates agents to produce a complete AudioDNA analysis:
ingest -> stem separation -> audio analysis -> save results.

CLI: python -m src.pipeline --input file.mp3 [--skip-stems] [--analysis-id uuid]
"""

from __future__ import annotations

import subprocess
import time
from pathlib import Path
from typing import Any

import structlog

from .config import get_settings
from .utils.db import MusicDB
from .utils.logging import setup_logging

logger = structlog.get_logger()

# Status progression
STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_STEM_SEPARATION = "stem_separation"
STATUS_ANALYZING = "analyzing"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"


def _probe_audio(audio_path: Path) -> dict[str, Any]:
    """Extract duration, sample_rate, channels, codec via ffprobe. Falls back to defaults."""
    defaults: dict[str, Any] = {
        "duration_seconds": 0.0, "sample_rate": 44100, "channels": 2, "codec": "unknown",
    }
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=duration,sample_rate,channels,codec_name",
             "-show_entries", "format=duration", "-of", "csv=p=0:s=,",
             str(audio_path)],
            capture_output=True, text=True, timeout=30,
        )
        if proc.returncode != 0:
            logger.warning("ffprobe_failed", stderr=proc.stderr[:200])
            return defaults

        for line in proc.stdout.strip().split("\n"):
            for part in (p.strip() for p in line.split(",")):
                if not part or part == "N/A":
                    continue
                try:
                    val = float(part)
                except ValueError:
                    if defaults["codec"] == "unknown":
                        defaults["codec"] = part
                    continue
                if val > 8000 and defaults["sample_rate"] == 44100:
                    defaults["sample_rate"] = int(val)
                elif 0 < val <= 8 and val == int(val) and defaults["channels"] == 2:
                    defaults["channels"] = int(val)
                elif val > 0 and defaults["duration_seconds"] == 0.0 and val < 100000:
                    defaults["duration_seconds"] = round(val, 3)
        return defaults
    except (FileNotFoundError, subprocess.TimeoutExpired):
        logger.warning("ffprobe_unavailable", hint="Install ffmpeg for accurate metadata.")
        return defaults


def ingest_audio(audio_path: Path, settings: Any) -> dict[str, Any]:
    """Stage 1: Validate audio file and extract metadata via ffprobe.

    Raises FileNotFoundError, ValueError on invalid input.
    """
    if not audio_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    file_size_bytes = audio_path.stat().st_size
    file_size_mb = file_size_bytes / (1024 * 1024)

    if file_size_mb > settings.audio.max_file_size_mb:
        raise ValueError(f"File too large: {file_size_mb:.1f}MB (max {settings.audio.max_file_size_mb}MB)")

    suffix = audio_path.suffix.lstrip(".").lower()
    if suffix not in settings.audio.supported_formats:
        raise ValueError(f"Unsupported format: .{suffix} (supported: {settings.audio.supported_formats})")

    probe = _probe_audio(audio_path)
    metadata = {
        "file_path": str(audio_path.resolve()),
        "file_name": audio_path.name,
        "format": suffix,
        "file_size_bytes": file_size_bytes,
        "file_size_mb": round(file_size_mb, 2),
        **probe,
    }
    logger.info("ingest_complete", file=audio_path.name, fmt=suffix,
                size_mb=metadata["file_size_mb"], duration_s=probe["duration_seconds"])
    return metadata


async def analyze(
    audio_path: str | Path,
    *,
    artist_name: str | None = None,
    track_name: str | None = None,
    analysis_id: str | None = None,
    skip_stems: bool = False,
) -> dict[str, Any]:
    """Run the music analysis pipeline on an audio file.

    Stages:
        [1] INGEST          — validate file, extract metadata via ffprobe
        [2] STEM SEPARATION — Demucs: vocals, drums, bass, other
        [3] AUDIO ANALYSIS  — AudioAnalyst: BPM, key, energy, spectral, harmony
        [4] SAVE RESULTS    — persist AudioDNA to music_analyses via MusicDB
        [5] TREND COMPARE   — (TODO) compare against genre benchmarks
        [6] LLM DIRECTION   — (TODO) production recommendations via LLM

    Args:
        audio_path: Path to the audio file.
        artist_name: Optional artist name for profile enrichment.
        track_name: Optional track name (defaults to filename stem).
        analysis_id: Update existing record; otherwise creates new.
        skip_stems: Skip stem separation (faster, less detailed).

    Returns:
        dict with analysis_id, stages, total_ms.
    """
    settings = get_settings()
    db = MusicDB()
    audio_path = Path(audio_path)

    if track_name is None:
        track_name = audio_path.stem

    logger.info("pipeline_start", audio_path=str(audio_path), artist=artist_name,
                track=track_name, skip_stems=skip_stems, analysis_id=analysis_id)

    # --- Create or fetch analysis record ---
    if analysis_id:
        if not db.get_analysis(analysis_id):
            raise ValueError(f"Analysis record not found: {analysis_id}")
        db.update_analysis(analysis_id, {"status": STATUS_PROCESSING})
    else:
        record = db.insert_analysis({
            "track_name": track_name,
            "artist_name": artist_name,
            "file_path": str(audio_path),
            "analysis_type": "quick" if skip_stems else "full",
            "status": STATUS_PROCESSING,
        })
        analysis_id = record.get("id")

    results: dict[str, Any] = {
        "analysis_id": analysis_id,
        "track_name": track_name,
        "artist_name": artist_name,
        "stages": {},
    }
    t_pipeline = time.monotonic()

    try:
        # ---- [1] INGEST ----
        logger.info("stage_start", stage="ingest", analysis_id=analysis_id)
        t0 = time.monotonic()
        metadata = ingest_audio(audio_path, settings)
        results["stages"]["ingest"] = {
            "status": "done", "metadata": metadata,
            "duration_ms": round((time.monotonic() - t0) * 1000),
        }
        db.update_analysis(analysis_id, {"file_size_mb": metadata["file_size_mb"]})

        # ---- [2] STEM SEPARATION ----
        stems_dir: str | None = None

        if skip_stems:
            logger.info("stage_skip", stage="stem_separation", reason="--skip-stems")
            results["stages"]["stem_separation"] = {"status": "skipped"}
        else:
            logger.info("stage_start", stage="stem_separation", analysis_id=analysis_id)
            db.update_analysis(analysis_id, {"status": STATUS_STEM_SEPARATION})
            t0 = time.monotonic()

            from .agents.stem_separator import StemSeparator

            separator = StemSeparator(
                model=settings.audio.demucs_model,
                output_dir=settings.audio.stem_output_dir,
            )
            stem_result = await separator.separate(input_path=str(audio_path))
            stems_dir = str(Path(stem_result.vocals_path).parent)

            results["stages"]["stem_separation"] = {
                "status": "done", "stems_dir": stems_dir,
                "model_used": stem_result.model_used,
                "processing_time_s": stem_result.processing_time_seconds,
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }
            logger.info("stage_complete", stage="stem_separation",
                        stems_dir=stems_dir, time_s=stem_result.processing_time_seconds)

        # ---- [3] AUDIO ANALYSIS ----
        logger.info("stage_start", stage="audio_analysis", analysis_id=analysis_id)
        db.update_analysis(analysis_id, {"status": STATUS_ANALYZING})
        t0 = time.monotonic()

        from .agents.audio_analyst import AudioAnalyst

        analyst = AudioAnalyst()
        audio_dna: dict[str, Any] = await analyst.analyze(
            audio_path=str(audio_path),
            stems_dir=stems_dir,
        )

        results["stages"]["audio_analysis"] = {
            "status": "done", "audio_dna": audio_dna,
            "duration_ms": round((time.monotonic() - t0) * 1000),
        }
        logger.info("stage_complete", stage="audio_analysis",
                     bpm=audio_dna.get("bpm"), key=audio_dna.get("key"))

        # ---- [4] SAVE RESULTS ----
        db.update_analysis(analysis_id, {
            "status": STATUS_COMPLETED,
            "results": {
                "metadata": metadata,
                "audio_dna": audio_dna,
                "stems_dir": stems_dir,
            },
        })
        results["stages"]["save_results"] = {"status": "done"}

        if artist_name:
            db.upsert_artist_profile({
                "artist_name": artist_name,
                "last_analysis_id": analysis_id,
                "total_analyses": 1,  # TODO: increment via RPC
            })

        # ---- [5] TREND COMPARE (TODO) ----
        # Compare audio_dna features against genre benchmarks (Tunebat + Hooktheory).
        results["stages"]["trend_compare"] = {"status": "not_implemented"}

        # ---- [6] LLM DIRECTION (TODO) ----
        # Feed audio_dna + trends to LLM for arrangement/mix recommendations.
        results["stages"]["llm_direction"] = {"status": "not_implemented"}

    except Exception as e:
        logger.error("pipeline_error", error=str(e), error_type=type(e).__name__,
                      analysis_id=analysis_id)
        if analysis_id:
            db.update_analysis(analysis_id, {
                "status": STATUS_FAILED,
                "error_message": f"[{type(e).__name__}] {e}",
            })
        raise

    total_ms = round((time.monotonic() - t_pipeline) * 1000)
    results["total_ms"] = total_ms
    logger.info("pipeline_complete", analysis_id=analysis_id, track=track_name,
                total_ms=total_ms,
                done=[k for k, v in results["stages"].items() if v.get("status") == "done"])
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    """CLI entry point for the music analysis pipeline."""
    import argparse
    import asyncio

    settings = get_settings()
    setup_logging(settings.log_level)

    parser = argparse.ArgumentParser(description="Music analysis pipeline")
    parser.add_argument("--input", required=True, help="Path to input audio file")
    parser.add_argument("--artist", default=None, help="Artist name")
    parser.add_argument("--track", default=None, help="Track name (default: filename stem)")
    parser.add_argument("--skip-stems", action="store_true", help="Skip stem separation")
    parser.add_argument("--analysis-id", default=None, help="Existing analysis ID to update")

    args = parser.parse_args()

    try:
        result = asyncio.run(analyze(
            audio_path=args.input, artist_name=args.artist,
            track_name=args.track, analysis_id=args.analysis_id,
            skip_stems=args.skip_stems,
        ))

        stages = result.get("stages", {})
        done = [k for k, v in stages.items() if v.get("status") == "done"]
        skipped = [k for k, v in stages.items() if v.get("status") == "skipped"]
        dna = stages.get("audio_analysis", {}).get("audio_dna", {})

        print(f"\n{'='*50}")
        print(f"  Analysis: {result.get('analysis_id')}")
        print(f"  Track:    {result.get('track_name')}")
        print(f"  Time:     {result.get('total_ms')}ms")
        print(f"  Done:     {', '.join(done)}")
        if skipped:
            print(f"  Skipped:  {', '.join(skipped)}")
        if dna:
            print(f"  BPM={dna.get('bpm','?')}  Key={dna.get('key','?')}  Energy={dna.get('energy','?')}")
        print(f"{'='*50}\n")

    except (FileNotFoundError, ValueError) as e:
        logger.error("input_error", error=str(e))
        raise SystemExit(1)
    except Exception as e:
        logger.error("pipeline_failed", error=str(e), error_type=type(e).__name__)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
