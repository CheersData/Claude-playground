"""
Music analysis pipeline orchestrator.

Coordinates agents to produce a complete AudioDNA analysis and market insights:
ingest -> stem separation -> audio analysis -> save results -> trend compare ->
arrangement direction -> quality review -> release strategy -> career advice.

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
from .utils.numpy_json import sanitize_for_json as _sanitize_for_json

logger = structlog.get_logger()

# Status progression
STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_STEM_SEPARATION = "stem_separation"
STATUS_ANALYZING = "analyzing"
STATUS_COMPARING = "comparing"
STATUS_DIRECTING = "directing"
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
        [1] INGEST               — validate file, extract metadata via ffprobe
        [2] STEM SEPARATION      — Demucs: vocals, drums, bass, other
        [3] AUDIO ANALYSIS       — AudioAnalyst: BPM, key, energy, spectral, harmony
        [4] SAVE RESULTS         — persist AudioDNA to music_analyses via MusicDB
        [5] TREND COMPARE        — TrendScout: genre classification, market comparison, gap analysis
        [6a] ARRANGEMENT DIRECTION — ArrangementDirector: prescriptive arrangement plan (LLM)
        [6b] QUALITY REVIEW      — QualityReviewer: LUFS, dynamic range, spectral balance (deterministic)
        [6c] RELEASE STRATEGY    — ReleaseStrategist: metadata, timing, playlists, distribution (LLM)
        [6d] CAREER ADVICE       — CareerAdvisor: final synthesis, career plan (LLM)

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

    def _db_update(data: dict[str, Any]) -> None:
        """Update DB record if analysis_id exists, otherwise no-op (CLI mode)."""
        if analysis_id is not None:
            db.update_analysis(analysis_id, data)

    if track_name is None:
        track_name = audio_path.stem

    logger.info("pipeline_start", audio_path=str(audio_path), artist=artist_name,
                track=track_name, skip_stems=skip_stems, analysis_id=analysis_id)

    # --- Create or fetch analysis record ---
    # When analysis_id is provided (from /api/music/upload route), the DB record
    # already exists with correct user_id + file_name.  We just update status.
    # When running from CLI (no analysis_id), we skip DB tracking entirely —
    # the DB requires user_id (FK to auth.users) which isn't available from CLI.
    user_id: str | None = None
    if analysis_id:
        existing = db.get_analysis(analysis_id)
        if not existing:
            raise ValueError(f"Analysis record not found: {analysis_id}")
        user_id = existing.get("user_id")
        _db_update({"status": STATUS_PROCESSING})
    else:
        logger.info("pipeline_no_db", reason="No analysis_id — running without DB tracking (CLI mode)")
        analysis_id = None

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
        _db_update({"file_size_bytes": metadata["file_size_bytes"]})

        # ---- [2] STEM SEPARATION ----
        stems_dir: str | None = None

        if skip_stems:
            logger.info("stage_skip", stage="stem_separation", reason="--skip-stems")
            results["stages"]["stem_separation"] = {"status": "skipped"}
        else:
            logger.info("stage_start", stage="stem_separation", analysis_id=analysis_id)
            _db_update({"status": STATUS_STEM_SEPARATION})
            t0 = time.monotonic()

            try:
                from .agents.stem_separator import StemSeparator, StemSeparationError

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
            except Exception as stem_err:
                # Demucs OOM or crash — skip stems instead of failing the whole pipeline
                elapsed_ms = round((time.monotonic() - t0) * 1000)
                logger.warning(
                    "stem_separation_failed_retrying_without",
                    error=str(stem_err),
                    error_type=type(stem_err).__name__,
                    elapsed_ms=elapsed_ms,
                )
                # Emit stage_skip so the TypeScript route detects it as skipped (not error)
                logger.info(
                    "stage_skip",
                    stage="stem_separation",
                    reason=f"fallback: {type(stem_err).__name__}: {str(stem_err)[:150]}",
                )
                results["stages"]["stem_separation"] = {
                    "status": "skipped",
                    "reason": f"Stem separation failed ({type(stem_err).__name__}), continuing without stems",
                    "error": str(stem_err)[:200],
                    "duration_ms": elapsed_ms,
                }

        # ---- [3] AUDIO ANALYSIS ----
        logger.info("stage_start", stage="audio_analysis", analysis_id=analysis_id)
        _db_update({"status": STATUS_ANALYZING})
        t0 = time.monotonic()

        from .agents.audio_analyst import AudioAnalyst

        analyst = AudioAnalyst()
        audio_dna: dict[str, Any] = analyst.analyze(
            input_path=str(audio_path),
            stems_dir=stems_dir,
        )

        results["stages"]["audio_analysis"] = {
            "status": "done", "audio_dna": audio_dna,
            "duration_ms": round((time.monotonic() - t0) * 1000),
        }
        logger.info("stage_complete", stage="audio_analysis",
                     bpm=audio_dna.get("bpm"), key=audio_dna.get("key"))

        # ---- [4] SAVE RESULTS (intermediate) ----
        logger.info("stage_start", stage="save_results", analysis_id=analysis_id)

        # Sanitize numpy types to native Python before any DB/JSON operation
        audio_dna = _sanitize_for_json(audio_dna)

        # Extract scalar values for DB columns (audio_dna stores nested dicts)
        bpm_raw = audio_dna.get("bpm")
        bpm_val = bpm_raw.get("value") if isinstance(bpm_raw, dict) else bpm_raw
        key_raw = audio_dna.get("key")
        key_val = key_raw.get("label") or key_raw.get("key") if isinstance(key_raw, dict) else key_raw

        _db_update({
            "status": STATUS_COMPARING,
            "audio_dna": audio_dna,
            **({"bpm": bpm_val} if bpm_val is not None else {}),
            **({"musical_key": key_val} if key_val is not None else {}),
            "duration_seconds": metadata.get("duration_seconds"),
        })
        results["stages"]["save_results"] = {"status": "done"}
        logger.info("stage_complete", stage="save_results")

        if artist_name and analysis_id is not None and user_id:
            db.upsert_artist_profile({
                "user_id": user_id,
                "artist_name": artist_name,
                "last_analysis_id": analysis_id,
                "total_analyses": 1,  # TODO: increment via RPC
            })

        # ---- [5] TREND COMPARE ----
        trend_report: dict[str, Any] | None = None
        logger.info("stage_start", stage="trend_compare", analysis_id=analysis_id)
        t0 = time.monotonic()
        try:
            from .agents.trend_scout import TrendScout

            scout = TrendScout()
            scout_result = await scout.run(audio_dna=audio_dna)
            trend_report = scout_result.get("trend_report")
            results["stages"]["trend_compare"] = {
                "status": "done",
                "trend_report": trend_report,
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }
            logger.info("stage_complete", stage="trend_compare",
                         primary_genre=trend_report.get("genre_analysis", {}).get("primary_genre") if trend_report else None)
        except Exception as e:
            logger.error("stage_error", stage="trend_compare", error=str(e), error_type=type(e).__name__)
            results["stages"]["trend_compare"] = {
                "status": "error", "error": str(e),
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }

        # ---- [6] LLM DIRECTION (4 sub-agents in sequence) ----
        _db_update({"status": STATUS_DIRECTING})

        # Detect genre from trend report for quality reviewer
        detected_genre = "generic"
        if trend_report:
            ga = trend_report.get("genre_analysis", {})
            detected_genre = ga.get("primary_genre", "generic")

        # ---- [6a] ARRANGEMENT DIRECTION ----
        arrangement_plan: dict[str, Any] | None = None
        logger.info("stage_start", stage="arrangement_direction", analysis_id=analysis_id)
        t0 = time.monotonic()
        try:
            from .agents.arrangement_director import ArrangementDirector

            director = ArrangementDirector()
            arrangement_plan = await director.run(
                audio_dna=audio_dna,
                trend_report=trend_report,
            )
            results["stages"]["arrangement_direction"] = {
                "status": "done",
                "arrangement_plan": arrangement_plan,
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }
            logger.info("stage_complete", stage="arrangement_direction",
                         suggestions=len(arrangement_plan.get("suggestions", [])) if arrangement_plan else 0,
                         confidence=arrangement_plan.get("confidence") if arrangement_plan else None)
        except Exception as e:
            logger.error("stage_error", stage="arrangement_direction", error=str(e), error_type=type(e).__name__)
            results["stages"]["arrangement_direction"] = {
                "status": "error", "error": str(e),
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }

        # ---- [6b] QUALITY REVIEW ----
        quality_review: dict[str, Any] | None = None
        logger.info("stage_start", stage="quality_review", analysis_id=analysis_id)
        t0 = time.monotonic()
        try:
            from .agents.quality_reviewer import QualityReviewer

            reviewer = QualityReviewer()
            quality_review = await reviewer.run(
                input_path=str(audio_path),
                genre=detected_genre,
                audio_dna=audio_dna,
            )
            results["stages"]["quality_review"] = {
                "status": "done",
                "quality_review": quality_review,
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }
            logger.info("stage_complete", stage="quality_review",
                         verdict=quality_review.get("verdict") if quality_review else None)
        except Exception as e:
            logger.error("stage_error", stage="quality_review", error=str(e), error_type=type(e).__name__)
            results["stages"]["quality_review"] = {
                "status": "error", "error": str(e),
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }

        # ---- [6c] RELEASE STRATEGY ----
        release_strategy: dict[str, Any] | None = None
        logger.info("stage_start", stage="release_strategy", analysis_id=analysis_id)
        t0 = time.monotonic()
        try:
            from .agents.release_strategist import ReleaseStrategist

            strategist = ReleaseStrategist()
            release_strategy = await strategist.run(
                audio_dna=audio_dna,
                trend_report=trend_report,
                quality_review=quality_review,
                track_name=track_name,
                artist_name=artist_name,
            )
            results["stages"]["release_strategy"] = {
                "status": "done",
                "release_strategy": release_strategy,
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }
            logger.info("stage_complete", stage="release_strategy",
                         fallback=release_strategy.get("_fallback", False) if release_strategy else None)
        except Exception as e:
            logger.error("stage_error", stage="release_strategy", error=str(e), error_type=type(e).__name__)
            results["stages"]["release_strategy"] = {
                "status": "error", "error": str(e),
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }

        # ---- [6d] CAREER ADVICE ----
        career_advice: dict[str, Any] | None = None
        logger.info("stage_start", stage="career_advice", analysis_id=analysis_id)
        t0 = time.monotonic()
        try:
            from .agents.career_advisor import CareerAdvisor

            advisor = CareerAdvisor()
            career_advice = await advisor.run(
                audio_dna=audio_dna,
                trend_report=trend_report,
                arrangement_plan=arrangement_plan,
                quality_review=quality_review,
                release_strategy=release_strategy,
                stems=results["stages"].get("stem_separation", {}).get("stems_dir"),
                track_name=track_name,
                artist_name=artist_name,
                analysis_id=analysis_id,
            )
            results["stages"]["career_advice"] = {
                "status": "done",
                "career_advice": career_advice,
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }
            logger.info("stage_complete", stage="career_advice",
                         readiness=career_advice.get("overallReadiness") if career_advice else None,
                         fallback=career_advice.get("_fallback", False) if career_advice else None)
        except Exception as e:
            logger.error("stage_error", stage="career_advice", error=str(e), error_type=type(e).__name__)
            results["stages"]["career_advice"] = {
                "status": "error", "error": str(e),
                "duration_ms": round((time.monotonic() - t0) * 1000),
            }

        # ---- FINAL SAVE ----
        # Persist all enriched results to individual DB columns (no "results" column exists)

        # Sanitize all outputs to ensure no numpy types leak into JSON/DB
        if trend_report:
            trend_report = _sanitize_for_json(trend_report)
        if arrangement_plan:
            arrangement_plan = _sanitize_for_json(arrangement_plan)
        if quality_review:
            quality_review = _sanitize_for_json(quality_review)
        if release_strategy:
            release_strategy = _sanitize_for_json(release_strategy)
        if career_advice:
            career_advice = _sanitize_for_json(career_advice)

        # Compute commercial viability score from career advice
        cv_score: float | None = None
        if career_advice and isinstance(career_advice.get("commercial_viability"), dict):
            cv_score = career_advice["commercial_viability"].get("score")

        final_update: dict[str, Any] = {
            "status": STATUS_COMPLETED,
            "audio_dna": audio_dna,
        }
        if trend_report:
            final_update["trend_report"] = trend_report
        if arrangement_plan or quality_review or release_strategy or career_advice:
            direction: dict[str, Any] = {}
            if arrangement_plan:
                direction["arrangement_plan"] = arrangement_plan
            if quality_review:
                direction["quality_review"] = quality_review
            if release_strategy:
                direction["release_strategy"] = release_strategy
            if career_advice:
                direction["career_advice"] = career_advice
            final_update["direction_plan"] = direction
        if cv_score is not None:
            final_update["commercial_viability_score"] = cv_score
        if detected_genre != "generic":
            final_update["genre"] = detected_genre

        _db_update(final_update)

    except Exception as e:
        logger.error("pipeline_error", error=str(e), error_type=type(e).__name__,
                      analysis_id=analysis_id)
        _db_update({
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
        errored = [k for k, v in stages.items() if v.get("status") == "error"]
        dna = stages.get("audio_analysis", {}).get("audio_dna", {})

        print(f"\n{'='*60}")
        print(f"  Analysis: {result.get('analysis_id')}")
        print(f"  Track:    {result.get('track_name')}")
        print(f"  Time:     {result.get('total_ms')}ms")
        print(f"  Done:     {', '.join(done)}")
        if skipped:
            print(f"  Skipped:  {', '.join(skipped)}")
        if errored:
            print(f"  Errors:   {', '.join(errored)}")
        if dna:
            print(f"  BPM={dna.get('bpm','?')}  Key={dna.get('key','?')}  Energy={dna.get('energy','?')}")

        # Show trend summary if available
        trend = stages.get("trend_compare", {}).get("trend_report", {})
        if trend:
            ga = trend.get("genre_analysis", {})
            gap = trend.get("gap_analysis", {})
            print(f"  Genre:    {ga.get('primary_genre', '?')} (confidence: {ga.get('genre_confidence', '?')})")
            print(f"  Market:   fit={gap.get('market_fit_score', '?')}/100")

        # Show career advice summary if available
        career = stages.get("career_advice", {}).get("career_advice", {})
        if career:
            cv = career.get("commercial_viability", {})
            print(f"  Viability: {cv.get('score', '?')}/10 | Readiness: {career.get('overallReadiness', '?')}")
            print(f"  Fallback:  {career.get('_fallback', False)}")

        print(f"{'='*60}\n")

    except (FileNotFoundError, ValueError) as e:
        logger.error("input_error", error=str(e))
        raise SystemExit(1)
    except Exception as e:
        logger.error("pipeline_failed", error=str(e), error_type=type(e).__name__)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
