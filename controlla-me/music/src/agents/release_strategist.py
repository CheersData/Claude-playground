"""
Release Strategist Agent — Optimize release metadata, timing, and distribution.

Takes AudioDNA (from AudioAnalyst), optional TrendReport (from TrendScout),
and optional quality review (from QualityReviewer) to produce a complete
release strategy covering:
- Metadata: genre tags, mood tags, description
- Timing: best release day/time with rationale
- Playlist strategy: editorial targets, independent curators, pre-save plan
- Distribution: recommended distributor, cost estimate, priority territories
- Marketing hooks: 2-4 angles for promotion with best channels
- Quality notes: how quality review affects release readiness

Uses `claude -p` CLI for LLM reasoning (NOT the SDK directly).
Falls back to heuristic defaults when CLI is unavailable.

CLI usage:
    python -m src.agents.release_strategist --audio-dna path/to/dna.json
    python -m src.agents.release_strategist --audio-dna path/to/dna.json --trend-report path/to/trends.json
    python -m src.agents.release_strategist --audio-dna path/to/dna.json --quality-review path/to/review.json
    python -m src.agents.release_strategist --audio-dna path/to/dna.json --track-name "My Song" --artist-name "Artist"
"""

from __future__ import annotations

import asyncio
import json
import re
import subprocess
import time
from typing import Any

import structlog

from .base import BaseAgent

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Fallback defaults when LLM is unavailable
# ---------------------------------------------------------------------------

_FALLBACK_RESULT: dict[str, Any] = {
    "metadata": {
        "primaryGenre": "Pop",
        "secondaryGenre": "Indie Pop",
        "mood": ["energetic", "uplifting"],
        "description": "A vibrant track with contemporary production and catchy melodies.",
    },
    "timing": {
        "recommendedDay": "Friday",
        "recommendedTime": "00:00 UTC",
        "why": "Friday is the global new-music release day on all major streaming platforms.",
    },
    "playlistStrategy": {
        "editorialTargets": ["New Music Friday", "Fresh Finds"],
        "independentCurators": ["SubmitHub", "PlaylistPush"],
        "preSaveStrategy": "Launch a pre-save campaign 7-10 days before release via DistroKid or similar.",
    },
    "distribution": {
        "recommended": "DistroKid",
        "estimatedCost": "$22.99/year (unlimited releases)",
        "territories": ["Worldwide"],
        "platformNotes": [
            "Submit to Spotify editorial playlists 7 days before release via Spotify for Artists",
            "Upload lyrics to Apple Music via your distributor for better discoverability",
        ],
    },
    "marketingHooks": [
        {
            "hook": "Behind-the-scenes studio clip of the most energetic section",
            "channel": "TikTok / Instagram Reels",
            "why": "Short-form video drives the most pre-save conversions for independent artists.",
        },
        {
            "hook": "Lyric snippet teaser with visualizer",
            "channel": "Instagram Stories",
            "why": "Creates anticipation and is easily shareable.",
        },
    ],
    "qualityNotes": None,
}


def _build_prompt(
    audio_dna: dict[str, Any],
    trend_report: dict[str, Any] | None,
    quality_review: dict[str, Any] | None,
    track_name: str,
    artist_name: str | None,
) -> str:
    """Build the Italian-language prompt for the LLM."""
    dna_summary = json.dumps(audio_dna, indent=2, default=str)[:3000]

    trend_block = ""
    if trend_report:
        trend_block = (
            "\n\nTrend Report (analisi di mercato):\n"
            f"{json.dumps(trend_report, indent=2, default=str)[:2000]}"
        )

    quality_block = ""
    if quality_review:
        quality_block = (
            "\n\nQuality Review (revisione qualita tecnica):\n"
            f"{json.dumps(quality_review, indent=2, default=str)[:1500]}"
        )

    artist_line = f" di {artist_name}" if artist_name else ""

    return (
        f"Sei un esperto di strategia di rilascio musicale e marketing musicale. "
        f'Analizza i dati audio, di mercato e di qualita per il brano "{track_name}"{artist_line} '
        f"e produci una strategia di rilascio ottimale con angoli di marketing concreti.\n\n"
        f"AudioDNA:\n{dna_summary}"
        f"{trend_block}"
        f"{quality_block}\n\n"
        f"IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. "
        f"NON usare backtick, code fence, markdown. "
        f"La tua risposta deve iniziare con {{ e finire con }}.\n\n"
        f"Formato richiesto:\n"
        f"{{\n"
        f'  "metadata": {{ "primaryGenre": str, "secondaryGenre": str, "mood": [str], "description": str }},\n'
        f'  "timing": {{ "recommendedDay": str, "recommendedTime": str, "why": str }},\n'
        f'  "playlistStrategy": {{ "editorialTargets": [str], "independentCurators": [str], "preSaveStrategy": str }},\n'
        f'  "distribution": {{ "recommended": str, "estimatedCost": str, "territories": [str], "platformNotes": [str] }},\n'
        f'  "marketingHooks": [{{ "hook": str, "channel": str, "why": str }}],\n'
        f'  "qualityNotes": str | null\n'
        f"}}\n\n"
        f"Regole:\n"
        f"- primaryGenre e secondaryGenre devono essere tag Spotify validi\n"
        f'- mood: 2-4 tag emotivi (es. "energetic", "melancholic", "dreamy")\n'
        f"- description: max 300 caratteri, adatta per le bio di Spotify/Apple Music\n"
        f"- timing: giorno e ora ottimali per massimizzare la visibilita algoritmica\n"
        f"- editorialTargets: 2-5 playlist editoriali Spotify realistiche per il genere\n"
        f"- independentCurators: 2-3 piattaforme o canali di curating indipendente\n"
        f"- distribution: consiglia il distributore migliore per artista indipendente\n"
        f"- territories: lista di mercati prioritari basata sul genere\n"
        f"- platformNotes: 2-4 consigli specifici per piattaforma (Spotify, Apple Music, YouTube, TikTok)\n"
        f"- marketingHooks: 2-4 angoli di marketing concreti con il canale migliore per ciascuno\n"
        f"- qualityNotes: se hai dati di quality review, spiega se il brano e pronto per il rilascio o serve altro lavoro\n"
        f"- Tutti i consigli devono essere pratici e attuabili, non generici"
    )


def _parse_llm_response(raw: str) -> dict[str, Any] | None:
    """Parse JSON from LLM output with fallback regex extraction."""
    # Direct parse
    try:
        return json.loads(raw.strip())
    except json.JSONDecodeError:
        pass
    # Strip code fences
    cleaned = re.sub(r"```(?:json)?\s*", "", raw)
    cleaned = re.sub(r"```", "", cleaned)
    try:
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        pass
    # Regex extract outermost { ... }
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _enrich_fallback_with_quality(
    result: dict[str, Any], quality_review: dict[str, Any] | None
) -> dict[str, Any]:
    """Add quality notes to fallback result based on quality review data."""
    if not quality_review:
        return result

    ready = quality_review.get("preMasterReady", False)
    issues = quality_review.get("remainingIssues", [])
    verdict = quality_review.get("verdict", "")

    if ready:
        result["qualityNotes"] = (
            "Quality review: PASS. Il brano e pronto per il rilascio. "
            f"{verdict}"
        )
    else:
        issue_list = "; ".join(issues[:3]) if issues else "problemi non specificati"
        result["qualityNotes"] = (
            f"Quality review: NEEDS WORK. {len(issues)} problema/i da risolvere "
            f"prima del rilascio: {issue_list}. "
            "Si consiglia di correggere e ripetere la review prima di pubblicare."
        )

    return result


class ReleaseStrategist(BaseAgent):
    """Generates release strategy using LLM via claude CLI.

    Accepts all upstream analysis results:
    - audio_dna (AudioAnalyst) — required
    - trend_report (TrendScout) — optional, enriches market positioning
    - quality_review (QualityReviewer) — optional, affects release readiness
    """

    def __init__(self) -> None:
        super().__init__("release_strategist")

    async def run(self, **kwargs: Any) -> dict[str, Any]:
        """
        Run release strategy generation.

        Args:
            audio_dna: dict from AudioAnalyst (required)
            trend_report: dict from TrendScout (optional)
            quality_review: dict from QualityReviewer (optional)
            track_name: str, name of the track (default: "Untitled")
            artist_name: str | None, artist name (optional)

        Returns:
            dict with release strategy (metadata, timing, playlists,
            distribution, marketing hooks, quality notes)
        """
        audio_dna: dict[str, Any] = kwargs.get("audio_dna", {})
        trend_report: dict[str, Any] | None = kwargs.get("trend_report")
        quality_review: dict[str, Any] | None = kwargs.get("quality_review")
        track_name: str = kwargs.get("track_name", "Untitled")
        artist_name: str | None = kwargs.get("artist_name")

        self.log_start(
            track=track_name,
            has_trends=trend_report is not None,
            has_quality_review=quality_review is not None,
        )
        t0 = time.monotonic()

        if not audio_dna:
            self.log_error("missing audio_dna input")
            result = dict(_FALLBACK_RESULT)
            result["_fallback"] = True
            result["_error"] = "missing_audio_dna"
            return _enrich_fallback_with_quality(result, quality_review)

        prompt = _build_prompt(
            audio_dna, trend_report, quality_review, track_name, artist_name
        )

        try:
            proc = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode != 0:
                self.log_error(
                    f"claude CLI exit {proc.returncode}: {proc.stderr[:200]}"
                )
                result = dict(_FALLBACK_RESULT)
                result["_fallback"] = True
                result["_error"] = proc.stderr[:200]
                result = _enrich_fallback_with_quality(result, quality_review)
            else:
                parsed = _parse_llm_response(proc.stdout)
                if parsed and "metadata" in parsed:
                    result = parsed
                    # Ensure marketingHooks is present even if LLM omitted it
                    if "marketingHooks" not in result:
                        result["marketingHooks"] = _FALLBACK_RESULT[
                            "marketingHooks"
                        ]
                else:
                    self.log_error(
                        "LLM response not valid JSON with expected keys"
                    )
                    result = dict(_FALLBACK_RESULT)
                    result["_fallback"] = True
                    result["_error"] = "invalid_json"
                    result = _enrich_fallback_with_quality(
                        result, quality_review
                    )
        except FileNotFoundError:
            self.log_error("claude CLI not found in PATH")
            result = dict(_FALLBACK_RESULT)
            result["_fallback"] = True
            result["_error"] = "claude_not_in_path"
            result = _enrich_fallback_with_quality(result, quality_review)
        except subprocess.TimeoutExpired:
            self.log_error("claude CLI timed out (120s)")
            result = dict(_FALLBACK_RESULT)
            result["_fallback"] = True
            result["_error"] = "timeout"
            result = _enrich_fallback_with_quality(result, quality_review)
        except Exception as exc:
            self.log_error(str(exc))
            result = dict(_FALLBACK_RESULT)
            result["_fallback"] = True
            result["_error"] = str(exc)[:200]
            result = _enrich_fallback_with_quality(result, quality_review)

        elapsed = time.monotonic() - t0
        self.log_complete(
            elapsed_s=round(elapsed, 2),
            fallback=result.get("_fallback", False),
        )
        return result


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _cli() -> None:
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Release Strategist Agent")
    parser.add_argument(
        "--audio-dna", required=True, help="Path to AudioDNA JSON file"
    )
    parser.add_argument(
        "--trend-report",
        default=None,
        help="Path to TrendReport JSON file (optional)",
    )
    parser.add_argument(
        "--quality-review",
        default=None,
        help="Path to QualityReview JSON file (optional)",
    )
    parser.add_argument(
        "--track-name", default="Untitled", help="Track name"
    )
    parser.add_argument(
        "--artist-name", default=None, help="Artist name"
    )
    parser.add_argument(
        "--output", "-o", default=None, help="Output JSON path"
    )
    args = parser.parse_args()

    audio_dna = json.loads(Path(args.audio_dna).read_text())
    trend_report = (
        json.loads(Path(args.trend_report).read_text())
        if args.trend_report
        else None
    )
    quality_review = (
        json.loads(Path(args.quality_review).read_text())
        if args.quality_review
        else None
    )

    agent = ReleaseStrategist()
    result = asyncio.run(
        agent.run(
            audio_dna=audio_dna,
            trend_report=trend_report,
            quality_review=quality_review,
            track_name=args.track_name,
            artist_name=args.artist_name,
        )
    )

    output_json = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(output_json)
        print(f"Written to {args.output}")
    else:
        print(output_json)


if __name__ == "__main__":
    _cli()
