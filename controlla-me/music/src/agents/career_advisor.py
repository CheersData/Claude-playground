"""
Career Advisor Agent — Final synthesizer for the music analysis pipeline.

Receives ALL analysis outputs (AudioDNA, stems, trends, arrangement plan,
quality review, release strategy) and generates comprehensive, actionable
career advice for the artist.

Uses `claude -p` CLI for LLM reasoning (never the SDK directly).
Falls back to heuristic defaults when CLI is unavailable.

CLI usage:
    python -m src.agents.career_advisor --audio-dna path/to/dna.json
    python -m src.agents.career_advisor --audio-dna dna.json --trend-report trends.json --quality-review qr.json --release-strategy rs.json --arrangement-plan plan.json
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

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Output structure
# ---------------------------------------------------------------------------

def _empty_career_advice(reason: str = "") -> dict[str, Any]:
    """Fallback result when LLM is unavailable (demo environment)."""
    return {
        "strengths": [
            "Analisi non disponibile — LLM non raggiungibile"
        ] if reason else [],
        "weaknesses": [],
        "immediateActions": [
            {
                "action": "Eseguire con CLI claude disponibile per risultati completi",
                "priority": "high",
                "timeframe": "now",
            }
        ] if reason else [],
        "mediumTermPlan": {
            "timeframe": "3-6 mesi",
            "goals": [],
            "milestones": [],
        },
        "longTermVision": {
            "timeframe": "1-2 anni",
            "direction": reason or "Non disponibile",
            "keyBets": [],
        },
        "genrePositioning": {
            "currentPosition": "Non analizzato",
            "recommendedPosition": "Non disponibile",
            "transitionSteps": [],
        },
        "collaborationSuggestions": [],
        "commercial_viability": {
            "score": 0.0,
            "dimensions": {
                "production_quality": 0.0,
                "market_fit": 0.0,
                "originality": 0.0,
                "hook_strength": 0.0,
                "release_readiness": 0.0,
            },
        },
        "overallReadiness": 0.0,
        "demo_mode": True,
        "_fallback": True,
        "_reason": reason,
    }


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _truncate_json(obj: Any, max_chars: int = 2000) -> str:
    """Serialize to JSON and truncate to max_chars."""
    raw = json.dumps(obj, ensure_ascii=False, indent=2, default=str)
    if len(raw) > max_chars:
        return raw[:max_chars] + "\n... (troncato)"
    return raw


def _build_prompt(
    audio_dna: dict,
    trend_report: dict | None = None,
    arrangement_plan: dict | None = None,
    quality_review: dict | None = None,
    release_strategy: dict | None = None,
    stems: dict | None = None,
    track_name: str = "Untitled",
    artist_name: str | None = None,
) -> str:
    """Build the comprehensive synthesis prompt for the LLM."""

    sections: list[str] = []

    # --- Header ---
    artist_line = f" di {artist_name}" if artist_name else ""
    sections.append(
        f'Sei un consulente strategico musicale senior per artisti indipendenti.\n'
        f'Devi sintetizzare TUTTE le analisi della pipeline per il brano '
        f'"{track_name}"{artist_line} e produrre un piano di carriera completo.\n'
    )

    # --- AudioDNA (always present) ---
    sections.append(
        f'## 1. AudioDNA (analisi audio)\n'
        f'{_truncate_json(audio_dna, 3000)}\n'
    )

    # --- Optional inputs ---
    if stems:
        sections.append(
            f'## 2. Stem Separation\n'
            f'{_truncate_json(stems, 800)}\n'
        )

    if trend_report:
        sections.append(
            f'## 3. Trend Report (analisi di mercato)\n'
            f'{_truncate_json(trend_report, 2000)}\n'
        )

    if arrangement_plan:
        sections.append(
            f'## 4. Arrangement Plan (piano arrangiamento)\n'
            f'{_truncate_json(arrangement_plan, 1500)}\n'
        )

    if quality_review:
        sections.append(
            f'## 5. Quality Review (controllo qualita)\n'
            f'{_truncate_json(quality_review, 1500)}\n'
        )

    if release_strategy:
        sections.append(
            f'## 6. Release Strategy (strategia di rilascio)\n'
            f'{_truncate_json(release_strategy, 1500)}\n'
        )

    # --- Output format ---
    sections.append(
        'IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. '
        'NON usare backtick, code fence, markdown. '
        'La tua risposta deve iniziare con { e finire con }.\n\n'
        'Formato richiesto:\n'
        '{\n'
        '  "commercial_viability": {\n'
        '    "score": 7.2,\n'
        '    "dimensions": {\n'
        '      "production_quality": 6.5,\n'
        '      "market_fit": 7.8,\n'
        '      "originality": 8.0,\n'
        '      "hook_strength": 6.5,\n'
        '      "release_readiness": 7.0\n'
        '    }\n'
        '  },\n'
        '  "strengths": ["punto di forza 1", "punto di forza 2", ...],\n'
        '  "weaknesses": ["debolezza 1", "debolezza 2", ...],\n'
        '  "immediateActions": [\n'
        '    {"action": "cosa fare", "priority": "high|medium|low", "timeframe": "entro quando"}\n'
        '  ],\n'
        '  "mediumTermPlan": {\n'
        '    "timeframe": "3-6 mesi",\n'
        '    "goals": ["obiettivo 1", ...],\n'
        '    "milestones": [\n'
        '      {"milestone": "descrizione", "deadline": "quando", "metric": "come misurare"}\n'
        '    ]\n'
        '  },\n'
        '  "longTermVision": {\n'
        '    "timeframe": "1-2 anni",\n'
        '    "direction": "visione artistica e commerciale",\n'
        '    "keyBets": ["scommessa strategica 1", ...]\n'
        '  },\n'
        '  "genrePositioning": {\n'
        '    "currentPosition": "dove si colloca ora",\n'
        '    "recommendedPosition": "dove dovrebbe posizionarsi",\n'
        '    "transitionSteps": ["passo 1", "passo 2", ...]\n'
        '  },\n'
        '  "collaborationSuggestions": [\n'
        '    {"type": "producer|vocalist|songwriter|dj|visual", "profile": "profilo ideale", "why": "perche"}\n'
        '  ],\n'
        '  "overallReadiness": 0.0-1.0\n'
        '}\n\n'
        'Regole:\n'
        '- commercial_viability: score e dimensioni da 0.0 a 10.0. '
        'production_quality basata su LUFS, dynamic range, qualita tecnica. '
        'market_fit basato su trend report. originality e hook_strength basati su analisi audio. '
        'release_readiness = quanto il brano e pronto per il rilascio.\n'
        '- strengths e weaknesses: max 5 ciascuno, basati sui dati reali delle analisi\n'
        '- immediateActions: 3-5 azioni concrete per i prossimi 30 giorni, ordinate per priorita\n'
        '- mediumTermPlan: 2-4 obiettivi con milestone misurabili (3-6 mesi)\n'
        '- longTermVision: direzione artistica + 2-3 scommesse strategiche (1-2 anni)\n'
        '- genrePositioning: basato su trend report se disponibile, altrimenti su AudioDNA\n'
        '- collaborationSuggestions: max 3, con profilo specifico (non generico)\n'
        '- overallReadiness: 0.0-1.0, quanto il brano e l\'artista sono pronti per il mercato\n'
        '  (considera qualita tecnica, market fit, strategia release, completezza produzione)\n'
        '- Se un\'analisi non e\' disponibile, basa il consiglio sui dati che hai\n'
        '- Consigli pratici e attuabili, MAI generici. Cita dati specifici dalle analisi.'
    )

    return "\n".join(sections)


# ---------------------------------------------------------------------------
# JSON parser (robust, with fallback)
# ---------------------------------------------------------------------------

def _parse_llm_response(raw: str) -> dict | None:
    """Try to parse LLM JSON with fallback regex extraction."""
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

    # Regex: extract outermost { ... }
    match = re.search(r"\{[\s\S]+\}", raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None


# ---------------------------------------------------------------------------
# Heuristic fallback (no LLM)
# ---------------------------------------------------------------------------

def _heuristic_advice(
    audio_dna: dict,
    trend_report: dict | None,
    quality_review: dict | None,
    release_strategy: dict | None,
    arrangement_plan: dict | None,
) -> dict[str, Any]:
    """Generate basic career advice from data heuristics when LLM is unavailable."""

    strengths: list[str] = []
    weaknesses: list[str] = []
    actions: list[dict[str, str]] = []

    # --- Audio-based heuristics ---
    bpm_info = audio_dna.get("bpm", {})
    bpm_val = bpm_info.get("value", 0)
    bpm_conf = bpm_info.get("confidence", 0)
    key_info = audio_dna.get("key", {})
    energy = audio_dna.get("energy", {})
    lufs = energy.get("lufsApprox", -14.0)
    dr = energy.get("dynamicRangeDb", 10.0)

    if bpm_conf > 0.7:
        strengths.append(f"BPM solido a {bpm_val} con alta confidenza ({bpm_conf:.0%})")
    else:
        weaknesses.append(f"BPM incerto (confidenza {bpm_conf:.0%}) — potrebbe indicare ritmo irregolare")

    if -16.0 <= lufs <= -10.0:
        strengths.append(f"Loudness nella norma streaming ({lufs:.1f} LUFS)")
    elif lufs > -3.0:
        weaknesses.append(f"Loudness troppo alta ({lufs:.1f} LUFS) — rischio clipping e penalizzazione streaming")
    elif lufs < -20.0:
        weaknesses.append(f"Loudness molto bassa ({lufs:.1f} LUFS) — il brano risultera debole in playlist")

    if dr >= 8:
        strengths.append(f"Buon dynamic range ({dr:.1f} dB) — il mix respira")
    elif dr < 5:
        weaknesses.append(f"Dynamic range compresso ({dr:.1f} dB) — affaticamento uditivo")

    # --- Trend-based heuristics ---
    if trend_report:
        gap = trend_report.get("gap_analysis") or trend_report.get("gapAnalysis", {})
        mfs = gap.get("market_fit_score") or gap.get("marketFitScore", 0)
        if mfs and mfs > 70:
            strengths.append(f"Buon market fit ({mfs}/100)")
        elif mfs and mfs < 40:
            weaknesses.append(f"Market fit basso ({mfs}/100) — il brano diverge dalle tendenze attuali")

        t_strengths = gap.get("strengths", [])
        if t_strengths:
            strengths.extend(t_strengths[:2])

        t_weaknesses = gap.get("weaknesses", [])
        if t_weaknesses:
            weaknesses.extend(t_weaknesses[:2])

    # --- Quality-based heuristics ---
    if quality_review:
        if quality_review.get("preMasterReady"):
            strengths.append("Qualita tecnica pronta per il pre-master")
        else:
            issues = quality_review.get("remainingIssues", [])
            if issues:
                weaknesses.append(f"Problemi tecnici da risolvere: {issues[0]}")
                actions.append({
                    "action": f"Risolvere: {issues[0]}",
                    "priority": "high",
                    "timeframe": "prima del rilascio",
                })

    # --- Default actions ---
    actions.append({
        "action": "Finalizzare mix e master con un ingegnere del suono professionista",
        "priority": "high",
        "timeframe": "prossime 2 settimane",
    })
    actions.append({
        "action": "Preparare visual identity coerente (copertina, foto promo, palette colori)",
        "priority": "medium",
        "timeframe": "prossime 3 settimane",
    })
    actions.append({
        "action": "Sottomettere a playlist editoriali almeno 4 settimane prima del rilascio",
        "priority": "medium",
        "timeframe": "30 giorni prima del release",
    })

    # --- Genre positioning ---
    genre_info = trend_report.get("genre_analysis") or trend_report.get("genreAnalysis", {}) if trend_report else {}
    primary_genre = genre_info.get("primary_genre") or genre_info.get("primaryGenre", "Non identificato")
    genre_trends = genre_info.get("genre_trends") or genre_info.get("genreTrends", {})
    trend_dir = genre_trends.get(primary_genre, "stable") if genre_trends else "stable"

    # --- Overall readiness ---
    readiness_score = 0.5
    if quality_review and quality_review.get("preMasterReady"):
        readiness_score += 0.2
    if release_strategy and not release_strategy.get("_fallback"):
        readiness_score += 0.15
    if trend_report:
        mfs_val = (gap.get("market_fit_score") or gap.get("marketFitScore", 50)) if trend_report else 50
        readiness_score += (mfs_val / 100) * 0.15
    readiness_score = min(1.0, readiness_score)

    # --- Commercial viability dimensions (heuristic) ---
    prod_quality = 5.0
    if -16.0 <= lufs <= -10.0:
        prod_quality += 1.5
    if dr >= 8:
        prod_quality += 1.0
    if quality_review and quality_review.get("preMasterReady"):
        prod_quality += 1.5
    prod_quality = min(10.0, prod_quality)

    mfs_norm = ((gap.get("market_fit_score") or gap.get("marketFitScore", 50))
                if trend_report else 50) / 10.0
    market_fit = min(10.0, max(0.0, mfs_norm))

    originality = 6.0  # conservative default without LLM judgment
    hook_strength = 5.5  # conservative default
    release_ready = readiness_score * 10.0

    cv_score = round(
        (prod_quality + market_fit + originality + hook_strength + release_ready) / 5.0,
        1,
    )

    return {
        "strengths": strengths[:5],
        "weaknesses": weaknesses[:5],
        "immediateActions": actions[:5],
        "mediumTermPlan": {
            "timeframe": "3-6 mesi",
            "goals": [
                "Rilasciare il brano con strategia di pre-save",
                "Raggiungere 1000 stream organici nel primo mese",
                "Costruire presenza su 1-2 social (TikTok, Instagram)",
            ],
            "milestones": [
                {"milestone": "Release del brano", "deadline": "entro 6 settimane", "metric": "brano live su tutte le piattaforme"},
                {"milestone": "Prima playlist editoriale", "deadline": "entro 3 mesi", "metric": "inclusione in almeno 1 playlist Spotify editoriale"},
            ],
        },
        "longTermVision": {
            "timeframe": "1-2 anni",
            "direction": f"Consolidare posizione nel {primary_genre} (trend: {trend_dir}), "
                         f"costruire catalogo di 6-8 brani, sviluppare fanbase core.",
            "keyBets": [
                "Consistenza di rilascio (ogni 4-6 settimane)",
                "Investire in visual identity e storytelling",
            ],
        },
        "genrePositioning": {
            "currentPosition": f"{primary_genre} (trend: {trend_dir})",
            "recommendedPosition": f"Mantenere {primary_genre}" if trend_dir != "declining"
                                   else f"Esplorare sotto-generi emergenti di {primary_genre}",
            "transitionSteps": [
                f"Analizzare i top 10 brani {primary_genre} del momento per benchmark",
                "Identificare 2-3 elementi sonori distintivi da mantenere nelle prossime produzioni",
            ],
        },
        "collaborationSuggestions": [
            {"type": "producer", "profile": "Producer con esperienza in mix per streaming", "why": "Ottimizzare il suono per le piattaforme"},
            {"type": "visual", "profile": "Grafico/videomaker per copertine e contenuti social", "why": "Visual identity coerente amplifica la musica"},
        ],
        "commercial_viability": {
            "score": cv_score,
            "dimensions": {
                "production_quality": round(prod_quality, 1),
                "market_fit": round(market_fit, 1),
                "originality": originality,
                "hook_strength": hook_strength,
                "release_readiness": round(release_ready, 1),
            },
        },
        "overallReadiness": round(readiness_score, 2),
        "demo_mode": True,
        "_fallback": True,
    }


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class CareerAdvisor(BaseAgent):
    """
    Final pipeline synthesizer — turns all analysis outputs into
    comprehensive, actionable career advice.
    """

    def __init__(self) -> None:
        super().__init__("career_advisor")

    async def run(self, **kwargs: Any) -> dict:
        """
        Synthesize all pipeline outputs into career advice.

        Args:
            audio_dna: dict from AudioAnalyst (required)
            trend_report: dict from TrendScout (optional)
            arrangement_plan: dict from ArrangementDirector (optional)
            quality_review: dict from QualityReviewer (optional)
            release_strategy: dict from ReleaseStrategist (optional)
            stems: dict from StemSeparator (optional)
            track_name: str (optional, default "Untitled")
            artist_name: str (optional)

        Returns:
            dict with CareerAdvice structured output
        """
        audio_dna: dict = kwargs.get("audio_dna", {})
        trend_report: dict | None = kwargs.get("trend_report")
        arrangement_plan: dict | None = kwargs.get("arrangement_plan")
        quality_review: dict | None = kwargs.get("quality_review")
        release_strategy: dict | None = kwargs.get("release_strategy")
        stems: dict | None = kwargs.get("stems")
        track_name: str = kwargs.get("track_name", "Untitled")
        artist_name: str | None = kwargs.get("artist_name")

        analysis_id = kwargs.get("analysis_id") or str(uuid.uuid4())

        self.log_start(
            analysis_id=analysis_id,
            track=track_name,
            has_audio_dna=bool(audio_dna),
            has_trend_report=trend_report is not None,
            has_arrangement_plan=arrangement_plan is not None,
            has_quality_review=quality_review is not None,
            has_release_strategy=release_strategy is not None,
            has_stems=stems is not None,
        )
        t0 = time.monotonic()

        if not audio_dna:
            self.log_error("missing audio_dna input — cannot produce career advice")
            empty = _empty_career_advice("audio_dna mancante")
            empty["analysis_id"] = analysis_id
            empty["timestamp"] = datetime.now(timezone.utc).isoformat()
            empty["processing_time_seconds"] = 0.0
            return empty

        # Build prompt with all available inputs
        prompt = _build_prompt(
            audio_dna=audio_dna,
            trend_report=trend_report,
            arrangement_plan=arrangement_plan,
            quality_review=quality_review,
            release_strategy=release_strategy,
            stems=stems,
            track_name=track_name,
            artist_name=artist_name,
        )

        # Try LLM via claude -p CLI
        result = await asyncio.to_thread(
            self._call_llm, prompt, audio_dna, trend_report,
            quality_review, release_strategy, arrangement_plan,
        )

        elapsed = time.monotonic() - t0

        # Envelope fields per spec
        result["analysis_id"] = analysis_id
        result["timestamp"] = datetime.now(timezone.utc).isoformat()
        result["processing_time_seconds"] = round(elapsed, 2)

        self.log_complete(
            analysis_id=analysis_id,
            duration_s=round(elapsed, 2),
            fallback=result.get("_fallback", False),
            demo_mode=result.get("demo_mode", False),
            readiness=result.get("overallReadiness", 0.0),
        )
        return result

    def _call_llm(
        self,
        prompt: str,
        audio_dna: dict,
        trend_report: dict | None,
        quality_review: dict | None,
        release_strategy: dict | None,
        arrangement_plan: dict | None,
    ) -> dict[str, Any]:
        """Call claude -p CLI and parse result, with heuristic fallback."""
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
                return _heuristic_advice(
                    audio_dna, trend_report, quality_review,
                    release_strategy, arrangement_plan,
                )

            parsed = _parse_llm_response(proc.stdout)
            if parsed is None:
                self.log_error(
                    "json_parse_failed",
                    raw_preview=proc.stdout[:200],
                )
                return _heuristic_advice(
                    audio_dna, trend_report, quality_review,
                    release_strategy, arrangement_plan,
                )

            # Validate and enforce limits on parsed output
            return self._validate_output(parsed)

        except FileNotFoundError:
            self.log_error("claude CLI not found in PATH")
            return _heuristic_advice(
                audio_dna, trend_report, quality_review,
                release_strategy, arrangement_plan,
            )
        except subprocess.TimeoutExpired:
            self.log_error("claude CLI timeout (120s)")
            return _heuristic_advice(
                audio_dna, trend_report, quality_review,
                release_strategy, arrangement_plan,
            )
        except Exception as exc:
            self.log_error(f"unexpected: {exc}")
            return _heuristic_advice(
                audio_dna, trend_report, quality_review,
                release_strategy, arrangement_plan,
            )

    @staticmethod
    def _validate_output(parsed: dict) -> dict[str, Any]:
        """Enforce output limits and defaults on LLM response."""
        # Truncate lists to max lengths
        if "strengths" in parsed:
            parsed["strengths"] = parsed["strengths"][:5]
        if "weaknesses" in parsed:
            parsed["weaknesses"] = parsed["weaknesses"][:5]
        if "immediateActions" in parsed:
            parsed["immediateActions"] = parsed["immediateActions"][:5]
        if "collaborationSuggestions" in parsed:
            parsed["collaborationSuggestions"] = parsed["collaborationSuggestions"][:3]

        # Ensure overallReadiness is in range
        readiness = parsed.get("overallReadiness", 0.5)
        if isinstance(readiness, (int, float)):
            parsed["overallReadiness"] = max(0.0, min(1.0, float(readiness)))
        else:
            parsed["overallReadiness"] = 0.5

        # Ensure required keys exist with defaults
        parsed.setdefault("strengths", [])
        parsed.setdefault("weaknesses", [])
        parsed.setdefault("immediateActions", [])
        parsed.setdefault("mediumTermPlan", {"timeframe": "3-6 mesi", "goals": [], "milestones": []})
        parsed.setdefault("longTermVision", {"timeframe": "1-2 anni", "direction": "", "keyBets": []})
        parsed.setdefault("genrePositioning", {
            "currentPosition": "",
            "recommendedPosition": "",
            "transitionSteps": [],
        })
        parsed.setdefault("collaborationSuggestions", [])

        # Validate commercial_viability if present, or build from overallReadiness
        cv = parsed.get("commercial_viability")
        if isinstance(cv, dict):
            score = cv.get("score", 0)
            if isinstance(score, (int, float)):
                cv["score"] = max(0.0, min(10.0, float(score)))
            else:
                cv["score"] = parsed["overallReadiness"] * 10.0
            dims = cv.setdefault("dimensions", {})
            for dim_key in ("production_quality", "market_fit", "originality",
                            "hook_strength", "release_readiness"):
                val = dims.get(dim_key, 5.0)
                if isinstance(val, (int, float)):
                    dims[dim_key] = max(0.0, min(10.0, float(val)))
                else:
                    dims[dim_key] = 5.0
        else:
            # Derive from overallReadiness when LLM didn't produce it
            base = parsed["overallReadiness"] * 10.0
            parsed["commercial_viability"] = {
                "score": round(base, 1),
                "dimensions": {
                    "production_quality": round(base, 1),
                    "market_fit": round(base, 1),
                    "originality": round(base, 1),
                    "hook_strength": round(base, 1),
                    "release_readiness": round(base, 1),
                },
            }

        # LLM-generated results are not demo mode
        parsed.setdefault("demo_mode", False)

        return parsed


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def _cli() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Career Advisor Agent — synthesize all pipeline outputs into career advice"
    )
    parser.add_argument("--audio-dna", required=True, help="Path to AudioDNA JSON")
    parser.add_argument("--trend-report", default=None, help="Path to TrendReport JSON")
    parser.add_argument("--arrangement-plan", default=None, help="Path to ArrangementPlan JSON")
    parser.add_argument("--quality-review", default=None, help="Path to QualityReview JSON")
    parser.add_argument("--release-strategy", default=None, help="Path to ReleaseStrategy JSON")
    parser.add_argument("--stems", default=None, help="Path to StemResult JSON")
    parser.add_argument("--track-name", default="Untitled", help="Track name")
    parser.add_argument("--artist-name", default=None, help="Artist name")
    parser.add_argument("--output", "-o", default=None, help="Output file (default: stdout)")
    args = parser.parse_args()

    def _load_json(path_str: str | None) -> dict | None:
        if path_str is None:
            return None
        p = Path(path_str)
        if not p.is_file():
            print(f"Warning: file not found, skipping: {p}")
            return None
        return json.loads(p.read_text(encoding="utf-8"))

    audio_dna = json.loads(Path(args.audio_dna).read_text(encoding="utf-8"))
    trend_report = _load_json(args.trend_report)
    arrangement_plan = _load_json(args.arrangement_plan)
    quality_review = _load_json(args.quality_review)
    release_strategy = _load_json(args.release_strategy)
    stems = _load_json(args.stems)

    agent = CareerAdvisor()
    result = asyncio.run(agent.run(
        audio_dna=audio_dna,
        trend_report=trend_report,
        arrangement_plan=arrangement_plan,
        quality_review=quality_review,
        release_strategy=release_strategy,
        stems=stems,
        track_name=args.track_name,
        artist_name=args.artist_name,
    ))

    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output, encoding="utf-8")
        print(f"Written to {out_path}")
    else:
        print(output)

    # Summary line
    readiness = result.get("overallReadiness", 0)
    cv = result.get("commercial_viability", {})
    cv_score = cv.get("score", 0) if isinstance(cv, dict) else 0
    n_actions = len(result.get("immediateActions", []))
    n_strengths = len(result.get("strengths", []))
    n_weaknesses = len(result.get("weaknesses", []))
    demo = result.get("demo_mode", False)
    elapsed_s = result.get("processing_time_seconds", 0)
    print(f"\n--- Viability: {cv_score}/10 | Readiness: {readiness:.0%} | "
          f"Strengths: {n_strengths} | Weaknesses: {n_weaknesses} | "
          f"Actions: {n_actions} | Demo: {demo} | Time: {elapsed_s}s ---")


if __name__ == "__main__":
    _cli()
