"""
Arrangement Director Agent — Prescriptive arrangement planning from AudioDNA + trends.

Receives audio analysis results (BPM, key, energy, structure) and optional trend
scout data to generate a concrete ArrangementPlan with section-level suggestions
for instrumentation, dynamics, transitions, and production.

Uses `claude -p` CLI for LLM reasoning (never the SDK directly).
Falls back to heuristic defaults when CLI is unavailable.

CLI usage:
    python -m src.agents.arrangement_director --audio-dna path/to/dna.json
    python -m src.agents.arrangement_director --audio-dna path/to/dna.json --trend-report path/to/trend.json
    python -m src.agents.arrangement_director --audio-dna path/to/dna.json --output plan.json
"""

from __future__ import annotations

import asyncio
import json
import re
import subprocess
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import structlog

from .base import BaseAgent
from ..models.trends import ArrangementPlan, ArrangementSuggestion
from ..utils.numpy_json import numpy_default, sanitize_for_json

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Fallback result when LLM is unavailable (demo environment)
# ---------------------------------------------------------------------------

_FALLBACK_SUGGESTIONS: list[dict[str, Any]] = [
    {
        "area": "structure",
        "priority": 8,
        "suggestion": "Accorcia l'intro a max 8 battute — il chorus deve arrivare entro i primi 30 secondi",
        "rationale": "Le piattaforme di streaming penalizzano intro lunghe: il 35% degli skip avviene nei primi 10 secondi",
        "reference": None,
    },
    {
        "area": "instrumentation",
        "priority": 7,
        "suggestion": "Aggiungi un layer di synth pad nel ritornello per riempire lo spettro mid-frequency",
        "rationale": "I brani con spettro pieno nel chorus hanno +20% di completamento su Spotify",
        "reference": None,
    },
    {
        "area": "rhythm",
        "priority": 6,
        "suggestion": "Introduci una variazione ritmica nel secondo verso per mantenere l'attenzione",
        "rationale": "La ripetizione senza variazione causa calo di engagement dopo il primo chorus",
        "reference": None,
    },
    {
        "area": "production",
        "priority": 6,
        "suggestion": "Applica sidechain compression alla bass con la kick per pulizia nel low-end",
        "rationale": "Migliora la definizione ritmica e la resa su speaker piccoli (telefoni, laptop)",
        "reference": None,
    },
    {
        "area": "mix",
        "priority": 5,
        "suggestion": "Panoramica le chitarre/synth armonici a L30-R30 per lasciare spazio centrale alla voce",
        "rationale": "Migliora la leggibilita vocale senza perdere pienezza stereo",
        "reference": None,
    },
]

_FALLBACK_RESULT: dict[str, Any] = {
    "overall_direction": "Analisi non disponibile — LLM non raggiungibile. Suggerimenti basati su euristiche generali.",
    "suggestions": _FALLBACK_SUGGESTIONS,
    "vocal_direction": "Verifica la presenza vocale nel chorus: layering con doppia voce o armonizzazione a terza sopra per impatto.",
    "production_notes": "Punta a loudness integrata tra -14 e -12 LUFS per streaming. Mantieni dynamic range sopra 6 dB.",
    "commercial_viability_delta": 0.0,
    "confidence": 0.3,
}


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def _build_prompt(audio_dna: dict, trend_report: dict | None) -> str:
    """Build the Italian LLM prompt for arrangement direction."""

    # Extract key features for a focused summary
    bpm = audio_dna.get("bpm", {})
    key = audio_dna.get("key", {})
    energy = audio_dna.get("energy", {})
    sections = audio_dna.get("sections", [])
    chords = audio_dna.get("chords", [])

    summary = {
        "bpm": bpm.get("value", "unknown"),
        "bpm_confidence": bpm.get("confidence", 0),
        "key": key.get("label", "unknown"),
        "energy_overall": energy.get("overall", 0),
        "dynamic_range_db": energy.get("dynamicRangeDb", 0),
        "lufs_approx": energy.get("lufsApprox", -70),
        "sections": [
            {"label": s.get("label"), "start": s.get("start"), "end": s.get("end"), "energy": s.get("energy")}
            for s in sections
        ],
        "chords": chords,
        "duration": audio_dna.get("duration", 0),
        "stems": audio_dna.get("stems", []),
    }

    trend_section = ""
    if trend_report:
        trend_section = f"""

Hai anche un report di mercato (TrendReport) — usalo per calibrare le raccomandazioni:
```json
{json.dumps(trend_report, ensure_ascii=False, indent=2, default=numpy_default)[:3000]}
```"""

    spectral_data = {k: audio_dna[k] for k in ("spectral", "onsets", "chroma") if k in audio_dna}
    spectral_json = json.dumps(spectral_data, ensure_ascii=False, indent=2, default=numpy_default)[:2000]

    return f"""Sei un Arrangement Director musicale professionista. Il tuo compito e dare indicazioni PRESCRITTIVE
su come arrangiare/riarrangiare un brano per massimizzare impatto artistico e commerciale.

AudioDNA della traccia analizzata:
```json
{json.dumps(summary, ensure_ascii=False, indent=2, default=numpy_default)}
```

AudioDNA completo (dettagli spettrali e onset):
```json
{spectral_json}
```{trend_section}

Produci un piano di arrangiamento in JSON puro (NO markdown, NO backtick).
La risposta deve iniziare con {{ e finire con }}.

Formato richiesto:
{{
  "overall_direction": "direzione artistica generale in 1-3 frasi",
  "suggestions": [
    {{
      "area": "structure|instrumentation|rhythm|harmony|vocals|mix|production",
      "priority": 1-10,
      "suggestion": "azione prescriptiva concreta — cosa fare, non cosa considerare",
      "rationale": "perche aiuta commercialmente e artisticamente",
      "reference": "brano di riferimento che usa questa tecnica (o null)"
    }}
  ],
  "vocal_direction": "indicazioni specifiche su delivery vocale, effetti, layering (null se strumentale)",
  "production_notes": "suggerimenti mix, master, palette sonora",
  "commercial_viability_delta": -10.0 a +10.0,
  "confidence": 0.0 a 1.0
}}

Regole:
- Max 10 suggestions, ordinate per priority decrescente
- Ogni suggestion deve essere AZIONABILE: "aggiungi X nel punto Y", non "considera di..."
- commercial_viability_delta: stima di quanto le modifiche migliorerebbero (+) o rischierebbero (-) il potenziale commerciale
- Se il brano ha sezioni, dai indicazioni SPECIFICHE per sezione (intro, verse, chorus, bridge, outro)
- Se hai dati di trend, calibra le raccomandazioni sul mercato attuale del genere
- Rispondi in italiano
- Se i dati audio sono insufficienti per un'area, ometti quella suggestion anziché inventare"""


# ---------------------------------------------------------------------------
# JSON parser with fallback
# ---------------------------------------------------------------------------


def _parse_llm_response(raw: str) -> dict | None:
    """Try to parse LLM JSON with fallback regex extraction."""
    # Direct parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Strip code fences
    cleaned = re.sub(r"```json?\s*", "", raw)
    cleaned = re.sub(r"```", "", cleaned)
    try:
        return json.loads(cleaned.strip())
    except json.JSONDecodeError:
        pass

    # Regex: extract outermost { ... }
    match = re.search(r"\{[\s\S]+\}", raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class ArrangementDirector(BaseAgent):
    """
    Prescriptive arrangement planner — turns AudioDNA + trend data
    into a concrete ArrangementPlan with section-level recommendations.
    """

    def __init__(self) -> None:
        super().__init__("arrangement_director")

    async def run(self, **kwargs: Any) -> dict:
        """
        Generate an arrangement plan.

        Args:
            audio_dna: dict from AudioAnalyst (required)
            trend_report: dict from TrendScout (optional)

        Returns:
            dict with the ArrangementPlan fields
        """
        audio_dna: dict = kwargs.get("audio_dna", {})
        trend_report: dict | None = kwargs.get("trend_report")

        self.log_start(
            has_audio_dna=bool(audio_dna),
            has_trend_report=trend_report is not None,
        )
        t0 = time.monotonic()

        if not audio_dna:
            self.log_error("missing audio_dna input")
            return self._build_fallback_response(t0)

        prompt = _build_prompt(audio_dna, trend_report)

        try:
            proc = subprocess.run(
                ["claude", "-p", prompt],
                capture_output=True,
                text=True,
                timeout=120,
            )
            if proc.returncode != 0:
                self.log_error(
                    "claude CLI failed",
                    returncode=proc.returncode,
                    stderr=proc.stderr[:300] if proc.stderr else "",
                )
                return self._build_fallback_response(t0)

            parsed = _parse_llm_response(proc.stdout)
            if parsed is None:
                self.log_error(
                    "json_parse_failed",
                    raw_preview=proc.stdout[:200],
                )
                return self._build_fallback_response(t0)

            # Validate and cap suggestions at 10
            suggestions = parsed.get("suggestions", [])[:10]
            parsed["suggestions"] = suggestions

            elapsed = round(time.monotonic() - t0, 2)
            self.log_complete(
                duration_s=elapsed,
                suggestion_count=len(suggestions),
                confidence=parsed.get("confidence", 0),
            )

            # Build the validated ArrangementPlan
            plan = self._to_arrangement_plan(parsed, elapsed)
            return plan.model_dump()

        except FileNotFoundError:
            self.log_error("claude CLI not found in PATH")
            return self._build_fallback_response(t0)
        except subprocess.TimeoutExpired:
            self.log_error("claude CLI timeout (120s)")
            return self._build_fallback_response(t0)
        except Exception as exc:
            self.log_error(f"unexpected: {exc}")
            return self._build_fallback_response(t0)

    def _build_fallback_response(self, t0: float) -> dict:
        """Build a fallback ArrangementPlan dict when LLM is unavailable."""
        elapsed = round(time.monotonic() - t0, 2)
        plan = ArrangementPlan(
            analysis_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            overall_direction=_FALLBACK_RESULT["overall_direction"],
            suggestions=[
                ArrangementSuggestion(**s) for s in _FALLBACK_RESULT["suggestions"]
            ],
            vocal_direction=_FALLBACK_RESULT["vocal_direction"],
            production_notes=_FALLBACK_RESULT["production_notes"],
            commercial_viability_delta=_FALLBACK_RESULT["commercial_viability_delta"],
            confidence=_FALLBACK_RESULT["confidence"],
            processing_time_seconds=elapsed,
        )
        return plan.model_dump()

    def _to_arrangement_plan(self, parsed: dict, elapsed: float) -> ArrangementPlan:
        """Convert raw LLM output dict into a validated ArrangementPlan."""
        suggestions: list[ArrangementSuggestion] = []
        for s in parsed.get("suggestions", []):
            try:
                suggestions.append(ArrangementSuggestion(
                    area=s.get("area", "production"),
                    priority=max(1, min(10, int(s.get("priority", 5)))),
                    suggestion=s.get("suggestion", ""),
                    rationale=s.get("rationale", ""),
                    reference=s.get("reference"),
                ))
            except (ValueError, TypeError) as exc:
                self.logger.warning("skipping_invalid_suggestion", error=str(exc))
                continue

        # Sort by priority descending
        suggestions.sort(key=lambda x: x.priority, reverse=True)

        return ArrangementPlan(
            analysis_id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc).isoformat(),
            overall_direction=parsed.get("overall_direction", "Direzione non specificata"),
            suggestions=suggestions,
            vocal_direction=parsed.get("vocal_direction"),
            production_notes=parsed.get("production_notes", "Nessuna nota di produzione"),
            commercial_viability_delta=max(-10.0, min(10.0, float(parsed.get("commercial_viability_delta", 0.0)))),
            confidence=max(0.0, min(1.0, float(parsed.get("confidence", 0.5)))),
            processing_time_seconds=elapsed,
        )


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def _cli() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Arrangement Director Agent — prescriptive arrangement planning",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m src.agents.arrangement_director --audio-dna dna.json\n"
            "  python -m src.agents.arrangement_director --audio-dna dna.json --trend-report trend.json\n"
            "  python -m src.agents.arrangement_director --audio-dna dna.json -o plan.json\n"
        ),
    )
    parser.add_argument(
        "--audio-dna", required=True, help="Path to AudioDNA JSON from AudioAnalyst"
    )
    parser.add_argument(
        "--trend-report",
        default=None,
        help="Path to TrendReport JSON from TrendScout (optional)",
    )
    parser.add_argument(
        "--output", "-o", default=None, help="Output file path (default: stdout)"
    )
    args = parser.parse_args()

    audio_dna = json.loads(Path(args.audio_dna).read_text())
    trend_report = None
    if args.trend_report:
        trend_report = json.loads(Path(args.trend_report).read_text())

    agent = ArrangementDirector()
    result = asyncio.run(agent.run(audio_dna=audio_dna, trend_report=trend_report))

    result = sanitize_for_json(result)
    output_json = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output_json, encoding="utf-8")
        print(f"ArrangementPlan written to {out_path}")
    else:
        print(output_json)

    # Summary
    print(f"\n--- Summary ---")
    print(f"  Suggestions: {len(result.get('suggestions', []))}")
    print(f"  Confidence:  {result.get('confidence', 0)}")
    print(f"  Delta:       {result.get('commercial_viability_delta', 0):+.1f}")
    print(f"  Time:        {result.get('processing_time_seconds', 0):.2f}s")


if __name__ == "__main__":
    _cli()
