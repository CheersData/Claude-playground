"""
Quality Reviewer Agent — Pure audio analysis against genre-specific mastering standards.

Evaluates a final mix on:
- LUFS (integrated, short-term, momentary)
- Dynamic range (LRA approximation)
- Frequency spectrum balance (sub, low, mid, high-mid, high)
- Stereo width (correlation coefficient, mid/side ratio)
- Crest factor (peak-to-RMS ratio)

Compares all metrics against genre-specific reference standards and produces
a QualityReport with per-metric pass/fail, scores, and actionable recommendations.

NO LLM calls — this is a deterministic analysis agent.

CLI usage:
    python -m src.agents.quality_reviewer --input file.wav
    python -m src.agents.quality_reviewer --input file.wav --genre pop
    python -m src.agents.quality_reviewer --input file.wav --genre hip-hop --output report.json
    python -m src.agents.quality_reviewer --audio-dna dna.json --genre electronic
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import structlog

from .base import BaseAgent
from ..utils.numpy_json import sanitize_for_json

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Genre standards — target LUFS, dynamic range, spectral balance, crest factor
# ---------------------------------------------------------------------------

class Verdict(str, Enum):
    PASS = "pass"
    WARN = "warning"
    FAIL = "fail"


@dataclass
class GenreStandard:
    """Reference mastering standards for a specific genre."""

    name: str
    lufs_target: float          # Integrated LUFS target
    lufs_tolerance: float       # +/- dB tolerance from target
    dynamic_range_min: float    # Minimum acceptable LRA (dB)
    dynamic_range_max: float    # Maximum acceptable LRA (dB)
    crest_factor_min: float     # Minimum crest factor (dB)
    crest_factor_max: float     # Maximum crest factor (dB)
    # Frequency balance: relative energy targets per band (sum ~ 1.0)
    # Bands: sub (<60Hz), low (60-250Hz), mid (250-2kHz), high_mid (2k-8kHz), high (>8kHz)
    freq_balance: dict[str, tuple[float, float]]  # band -> (min_ratio, max_ratio)
    stereo_width_min: float     # Min mid/side ratio (0 = mono, 1 = wide)
    stereo_width_max: float     # Max mid/side ratio


# Genre standards derived from industry mastering references
GENRE_STANDARDS: dict[str, GenreStandard] = {
    "pop": GenreStandard(
        name="Pop",
        lufs_target=-14.0, lufs_tolerance=2.0,
        dynamic_range_min=5.0, dynamic_range_max=12.0,
        crest_factor_min=6.0, crest_factor_max=14.0,
        freq_balance={
            "sub": (0.05, 0.15), "low": (0.15, 0.30),
            "mid": (0.25, 0.40), "high_mid": (0.15, 0.30),
            "high": (0.05, 0.15),
        },
        stereo_width_min=0.3, stereo_width_max=0.8,
    ),
    "hip-hop": GenreStandard(
        name="Hip-Hop / Rap",
        lufs_target=-8.0, lufs_tolerance=2.0,
        dynamic_range_min=4.0, dynamic_range_max=10.0,
        crest_factor_min=4.0, crest_factor_max=12.0,
        freq_balance={
            "sub": (0.10, 0.25), "low": (0.15, 0.30),
            "mid": (0.20, 0.35), "high_mid": (0.10, 0.25),
            "high": (0.03, 0.12),
        },
        stereo_width_min=0.2, stereo_width_max=0.7,
    ),
    "electronic": GenreStandard(
        name="Electronic / EDM",
        lufs_target=-9.0, lufs_tolerance=2.0,
        dynamic_range_min=5.0, dynamic_range_max=12.0,
        crest_factor_min=5.0, crest_factor_max=13.0,
        freq_balance={
            "sub": (0.08, 0.20), "low": (0.15, 0.30),
            "mid": (0.20, 0.35), "high_mid": (0.15, 0.28),
            "high": (0.05, 0.15),
        },
        stereo_width_min=0.4, stereo_width_max=0.9,
    ),
    "rock": GenreStandard(
        name="Rock",
        lufs_target=-12.0, lufs_tolerance=2.5,
        dynamic_range_min=6.0, dynamic_range_max=14.0,
        crest_factor_min=7.0, crest_factor_max=16.0,
        freq_balance={
            "sub": (0.04, 0.12), "low": (0.15, 0.28),
            "mid": (0.25, 0.40), "high_mid": (0.15, 0.30),
            "high": (0.05, 0.15),
        },
        stereo_width_min=0.3, stereo_width_max=0.8,
    ),
    "classical": GenreStandard(
        name="Classical",
        lufs_target=-18.0, lufs_tolerance=4.0,
        dynamic_range_min=12.0, dynamic_range_max=30.0,
        crest_factor_min=12.0, crest_factor_max=25.0,
        freq_balance={
            "sub": (0.02, 0.10), "low": (0.10, 0.25),
            "mid": (0.30, 0.45), "high_mid": (0.15, 0.30),
            "high": (0.05, 0.18),
        },
        stereo_width_min=0.5, stereo_width_max=0.95,
    ),
    "jazz": GenreStandard(
        name="Jazz",
        lufs_target=-16.0, lufs_tolerance=3.0,
        dynamic_range_min=10.0, dynamic_range_max=25.0,
        crest_factor_min=10.0, crest_factor_max=22.0,
        freq_balance={
            "sub": (0.03, 0.10), "low": (0.12, 0.25),
            "mid": (0.28, 0.42), "high_mid": (0.15, 0.28),
            "high": (0.05, 0.15),
        },
        stereo_width_min=0.4, stereo_width_max=0.9,
    ),
    "r&b": GenreStandard(
        name="R&B / Soul",
        lufs_target=-11.0, lufs_tolerance=2.0,
        dynamic_range_min=5.0, dynamic_range_max=12.0,
        crest_factor_min=6.0, crest_factor_max=14.0,
        freq_balance={
            "sub": (0.08, 0.20), "low": (0.15, 0.30),
            "mid": (0.22, 0.38), "high_mid": (0.12, 0.25),
            "high": (0.04, 0.12),
        },
        stereo_width_min=0.3, stereo_width_max=0.8,
    ),
    "metal": GenreStandard(
        name="Metal",
        lufs_target=-10.0, lufs_tolerance=2.0,
        dynamic_range_min=4.0, dynamic_range_max=10.0,
        crest_factor_min=5.0, crest_factor_max=12.0,
        freq_balance={
            "sub": (0.04, 0.12), "low": (0.12, 0.25),
            "mid": (0.25, 0.40), "high_mid": (0.18, 0.32),
            "high": (0.05, 0.15),
        },
        stereo_width_min=0.3, stereo_width_max=0.8,
    ),
    "country": GenreStandard(
        name="Country",
        lufs_target=-13.0, lufs_tolerance=2.5,
        dynamic_range_min=6.0, dynamic_range_max=14.0,
        crest_factor_min=7.0, crest_factor_max=16.0,
        freq_balance={
            "sub": (0.03, 0.10), "low": (0.12, 0.25),
            "mid": (0.28, 0.42), "high_mid": (0.15, 0.28),
            "high": (0.05, 0.15),
        },
        stereo_width_min=0.3, stereo_width_max=0.8,
    ),
    "reggaeton": GenreStandard(
        name="Reggaeton / Latin",
        lufs_target=-8.0, lufs_tolerance=2.0,
        dynamic_range_min=4.0, dynamic_range_max=10.0,
        crest_factor_min=5.0, crest_factor_max=12.0,
        freq_balance={
            "sub": (0.10, 0.25), "low": (0.15, 0.30),
            "mid": (0.20, 0.35), "high_mid": (0.10, 0.25),
            "high": (0.04, 0.12),
        },
        stereo_width_min=0.2, stereo_width_max=0.7,
    ),
}

# Fallback standard when genre is unknown
DEFAULT_STANDARD = GenreStandard(
    name="Generic",
    lufs_target=-14.0, lufs_tolerance=3.0,
    dynamic_range_min=5.0, dynamic_range_max=20.0,
    crest_factor_min=6.0, crest_factor_max=18.0,
    freq_balance={
        "sub": (0.03, 0.20), "low": (0.10, 0.30),
        "mid": (0.20, 0.45), "high_mid": (0.10, 0.30),
        "high": (0.03, 0.18),
    },
    stereo_width_min=0.2, stereo_width_max=0.9,
)

# Frequency band boundaries in Hz
FREQ_BANDS = {
    "sub": (20, 60),
    "low": (60, 250),
    "mid": (250, 2000),
    "high_mid": (2000, 8000),
    "high": (8000, 20000),
}


# ---------------------------------------------------------------------------
# Data classes for the QualityReport
# ---------------------------------------------------------------------------

@dataclass
class MetricResult:
    """Result for a single quality metric."""

    name: str
    value: float
    unit: str
    target: float
    tolerance: float
    verdict: str  # pass / warning / fail
    score: float  # 0-100
    detail: str


@dataclass
class FrequencyBandResult:
    """Energy ratio and verdict for a single frequency band."""

    band: str
    range_hz: tuple[int, int]
    energy_ratio: float
    target_min: float
    target_max: float
    verdict: str
    detail: str


@dataclass
class QualityReport:
    """Complete quality review report."""

    file: str
    genre: str
    genre_standard: str
    duration_seconds: float
    processing_time_seconds: float
    overall_score: float  # 0-100
    overall_verdict: str  # pass / warning / fail
    metrics: list[dict[str, Any]]
    frequency_balance: list[dict[str, Any]]
    recommendations: list[str]
    summary: str


# ---------------------------------------------------------------------------
# K-weighting filter coefficients (ITU-R BS.1770-4)
# Pre-computed for 44100 Hz; for other rates we skip K-weighting
# ---------------------------------------------------------------------------

_K_WEIGHT_RATES = {44100, 48000}


def _k_weight_44100(y: np.ndarray) -> np.ndarray:
    """Apply K-weighting filter for 44100 Hz (simplified 2-stage biquad)."""
    from scipy.signal import sosfilt  # type: ignore[import-untyped]

    # Stage 1: high-shelf (+4 dB at high frequencies)
    sos1 = np.array([[1.53512485958697, -2.69169618940638, 1.19839281085285,
                       1.0, -1.69065929318241, 0.73248077421585]])
    # Stage 2: high-pass (remove < 60 Hz)
    sos2 = np.array([[1.0, -2.0, 1.0,
                       1.0, -1.99004745483398, 0.99007225036621]])
    y_k = sosfilt(sos1, y)
    y_k = sosfilt(sos2, y_k)
    return y_k


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

class QualityReviewer(BaseAgent):
    """
    Pure analysis agent: evaluates audio against genre-specific mastering standards.

    No LLM calls. All analysis is deterministic using librosa + numpy.

    Args:
        sr: Target sample rate for loading audio (default: 44100 for LUFS accuracy).
        hop_length: Hop length for frame-level features (default: 512).
        block_size_s: Block size in seconds for short-term LUFS (default: 3.0).
        momentary_size_s: Block size in seconds for momentary LUFS (default: 0.4).
    """

    def __init__(
        self,
        sr: int = 44100,
        hop_length: int = 512,
        block_size_s: float = 3.0,
        momentary_size_s: float = 0.4,
    ) -> None:
        super().__init__("quality_reviewer")
        self.sr = sr
        self.hop_length = hop_length
        self.block_size_s = block_size_s
        self.momentary_size_s = momentary_size_s

    # ------------------------------------------------------------------
    # BaseAgent interface
    # ------------------------------------------------------------------

    async def run(self, **kwargs: Any) -> dict:
        """
        Run quality review.

        Keyword Args:
            input_path: Path to the audio file (required unless audio_dna is provided).
            genre: Genre string for standard selection (optional, defaults to "generic").
            audio_dna: Pre-computed AudioDNA dict (optional; if provided and no input_path,
                       runs a reduced review based on the DNA data only).

        Returns:
            dict containing the full QualityReport.
        """
        input_path = kwargs.get("input_path")
        genre = kwargs.get("genre", "generic")
        audio_dna = kwargs.get("audio_dna")

        if not input_path and not audio_dna:
            raise ValueError("Either input_path or audio_dna is required")

        if input_path:
            report = await asyncio.to_thread(self.review, str(input_path), genre=genre)
        else:
            report = self._review_from_dna(audio_dna, genre=genre)

        return {"quality_report": sanitize_for_json(asdict(report)), "status": "success"}

    # ------------------------------------------------------------------
    # Public API — full file analysis
    # ------------------------------------------------------------------

    def review(self, input_path: str, *, genre: str = "generic") -> QualityReport:
        """
        Perform a full quality review of an audio file against genre standards.

        Args:
            input_path: Path to the audio file.
            genre: Genre key (e.g. "pop", "hip-hop", "classical"). Falls back to
                   generic standards if unrecognized.

        Returns:
            A QualityReport with per-metric verdicts and recommendations.
        """
        path = Path(input_path)
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {input_path}")

        standard = self._resolve_standard(genre)
        self.log_start(input_file=path.name, genre=genre, standard=standard.name)
        t0 = time.monotonic()

        # Load mono for loudness and spectral analysis
        y_mono, sr = librosa.load(str(path), sr=self.sr, mono=True)
        duration = float(librosa.get_duration(y=y_mono, sr=sr))

        # Load stereo for stereo width analysis
        try:
            y_stereo, _ = librosa.load(str(path), sr=self.sr, mono=False)
            is_stereo = y_stereo.ndim == 2 and y_stereo.shape[0] >= 2
        except Exception:
            y_stereo = None
            is_stereo = False

        # --- Compute all metrics ---
        metrics: list[MetricResult] = []
        recommendations: list[str] = []

        # 1. LUFS (integrated, short-term, momentary)
        lufs_integrated = self._compute_lufs_integrated(y_mono, sr)
        lufs_short_term = self._compute_lufs_short_term(y_mono, sr)
        lufs_momentary = self._compute_lufs_momentary(y_mono, sr)

        metrics.append(self._evaluate_lufs(lufs_integrated, standard))
        metrics.append(MetricResult(
            name="LUFS Short-Term (max)",
            value=round(lufs_short_term, 1),
            unit="LUFS",
            target=standard.lufs_target + 3.0,
            tolerance=2.0,
            verdict=Verdict.PASS if lufs_short_term <= standard.lufs_target + 5.0 else Verdict.WARN,
            score=self._clamp_score(100 - abs(lufs_short_term - (standard.lufs_target + 3.0)) * 8),
            detail=f"Max short-term loudness: {lufs_short_term:.1f} LUFS",
        ))
        metrics.append(MetricResult(
            name="LUFS Momentary (max)",
            value=round(lufs_momentary, 1),
            unit="LUFS",
            target=standard.lufs_target + 6.0,
            tolerance=3.0,
            verdict=Verdict.PASS if lufs_momentary <= standard.lufs_target + 9.0 else Verdict.WARN,
            score=self._clamp_score(100 - abs(lufs_momentary - (standard.lufs_target + 6.0)) * 5),
            detail=f"Max momentary loudness: {lufs_momentary:.1f} LUFS",
        ))

        # 2. Dynamic range (LRA approximation)
        dynamic_range = self._compute_dynamic_range(y_mono, sr)
        metrics.append(self._evaluate_dynamic_range(dynamic_range, standard))

        # 3. Crest factor
        crest_factor = self._compute_crest_factor(y_mono)
        metrics.append(self._evaluate_crest_factor(crest_factor, standard))

        # 4. Stereo width
        if is_stereo and y_stereo is not None:
            correlation, ms_ratio = self._compute_stereo_width(y_stereo)
            metrics.append(self._evaluate_stereo_width(ms_ratio, correlation, standard))
        else:
            metrics.append(MetricResult(
                name="Stereo Width",
                value=0.0,
                unit="ratio",
                target=(standard.stereo_width_min + standard.stereo_width_max) / 2,
                tolerance=0.3,
                verdict=Verdict.WARN,
                score=50.0,
                detail="Mono file — stereo width analysis skipped",
            ))

        # 5. Frequency spectrum balance
        freq_results = self._analyze_frequency_balance(y_mono, sr, standard)

        # 6. True peak check
        true_peak = self._compute_true_peak(y_mono)
        tp_verdict = Verdict.PASS if true_peak <= -1.0 else (Verdict.WARN if true_peak <= 0.0 else Verdict.FAIL)
        metrics.append(MetricResult(
            name="True Peak",
            value=round(true_peak, 1),
            unit="dBTP",
            target=-1.0,
            tolerance=1.0,
            verdict=tp_verdict,
            score=self._clamp_score(100 - max(0, true_peak + 1.0) * 30),
            detail=f"True peak: {true_peak:.1f} dBTP (target: <= -1.0 dBTP)",
        ))

        # --- Generate recommendations ---
        recommendations = self._generate_recommendations(metrics, freq_results, standard)

        # --- Compute overall score ---
        metric_scores = [m.score for m in metrics]
        freq_scores = [self._freq_band_score(fb) for fb in freq_results]
        all_scores = metric_scores + freq_scores
        overall_score = round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0

        # Overall verdict
        verdicts = [m.verdict for m in metrics] + [fb.verdict for fb in freq_results]
        if any(v == Verdict.FAIL for v in verdicts):
            overall_verdict = Verdict.FAIL
        elif any(v == Verdict.WARN for v in verdicts):
            overall_verdict = Verdict.WARN
        else:
            overall_verdict = Verdict.PASS

        elapsed = round(time.monotonic() - t0, 2)

        # Build summary
        pass_count = sum(1 for v in verdicts if v == Verdict.PASS)
        total_checks = len(verdicts)
        summary = (
            f"{pass_count}/{total_checks} checks passed. "
            f"Overall score: {overall_score}/100 ({overall_verdict.upper()}). "
            f"Genre standard: {standard.name}. "
            f"{len(recommendations)} recommendation(s)."
        )

        report = QualityReport(
            file=path.name,
            genre=genre,
            genre_standard=standard.name,
            duration_seconds=round(duration, 2),
            processing_time_seconds=elapsed,
            overall_score=overall_score,
            overall_verdict=overall_verdict,
            metrics=[asdict(m) for m in metrics],
            frequency_balance=[asdict(fb) for fb in freq_results],
            recommendations=recommendations,
            summary=summary,
        )

        self.log_complete(
            overall_score=overall_score,
            overall_verdict=overall_verdict,
            checks_passed=pass_count,
            checks_total=total_checks,
            recommendations=len(recommendations),
            processing_time_s=elapsed,
        )

        return report

    # ------------------------------------------------------------------
    # Reduced review from AudioDNA (no file needed)
    # ------------------------------------------------------------------

    def _review_from_dna(self, dna: dict, *, genre: str = "generic") -> QualityReport:
        """Run a reduced quality review from pre-computed AudioDNA."""
        standard = self._resolve_standard(genre)
        t0 = time.monotonic()

        metrics: list[MetricResult] = []
        energy = dna.get("energy", {})

        # LUFS from DNA
        lufs = energy.get("lufsApprox", -14.0)
        metrics.append(self._evaluate_lufs(lufs, standard))

        # Dynamic range from DNA
        dr = energy.get("dynamicRangeDb", 10.0)
        metrics.append(self._evaluate_dynamic_range(dr, standard))

        # Crest factor estimation from DNA (peak / RMS)
        rms_mean = energy.get("rmsMean", 0.1)
        rms_max = energy.get("rmsMax", 0.5)
        if rms_mean > 0:
            crest_db = round(20.0 * np.log10(rms_max / rms_mean), 1)
        else:
            crest_db = 0.0
        metrics.append(self._evaluate_crest_factor(crest_db, standard))

        freq_results: list[FrequencyBandResult] = []
        recommendations = self._generate_recommendations(metrics, freq_results, standard)

        metric_scores = [m.score for m in metrics]
        overall_score = round(sum(metric_scores) / len(metric_scores), 1) if metric_scores else 0.0
        verdicts = [m.verdict for m in metrics]
        if any(v == Verdict.FAIL for v in verdicts):
            overall_verdict = Verdict.FAIL
        elif any(v == Verdict.WARN for v in verdicts):
            overall_verdict = Verdict.WARN
        else:
            overall_verdict = Verdict.PASS

        elapsed = round(time.monotonic() - t0, 2)
        pass_count = sum(1 for v in verdicts if v == Verdict.PASS)

        return QualityReport(
            file=dna.get("file", "unknown"),
            genre=genre,
            genre_standard=standard.name,
            duration_seconds=dna.get("duration", 0.0),
            processing_time_seconds=elapsed,
            overall_score=overall_score,
            overall_verdict=overall_verdict,
            metrics=[asdict(m) for m in metrics],
            frequency_balance=[asdict(fb) for fb in freq_results],
            recommendations=recommendations,
            summary=(
                f"{pass_count}/{len(verdicts)} checks passed (reduced mode from AudioDNA). "
                f"Overall score: {overall_score}/100 ({overall_verdict.upper()}). "
                f"Genre standard: {standard.name}."
            ),
        )

    # ------------------------------------------------------------------
    # LUFS computation (ITU-R BS.1770-4 approximation)
    # ------------------------------------------------------------------

    def _compute_lufs_integrated(self, y: np.ndarray, sr: int) -> float:
        """Compute integrated LUFS with K-weighting when possible."""
        y_k = self._apply_k_weight(y, sr)
        # Mean square, gated (absolute gate at -70 LUFS)
        block_samples = int(0.4 * sr)  # 400ms blocks
        n_blocks = len(y_k) // block_samples
        if n_blocks == 0:
            rms = float(np.sqrt(np.mean(y_k ** 2)))
            return round(-0.691 + 10.0 * np.log10(max(rms ** 2, 1e-20)), 1)

        block_powers = []
        for i in range(n_blocks):
            block = y_k[i * block_samples:(i + 1) * block_samples]
            power = float(np.mean(block ** 2))
            lufs_block = -0.691 + 10.0 * np.log10(max(power, 1e-20))
            if lufs_block > -70.0:  # absolute gate
                block_powers.append(power)

        if not block_powers:
            return -70.0

        # Relative gate: -10 dB below ungated mean
        ungated_mean = np.mean(block_powers)
        ungated_lufs = -0.691 + 10.0 * np.log10(max(ungated_mean, 1e-20))
        relative_gate = ungated_lufs - 10.0

        gated_powers = [
            p for p in block_powers
            if (-0.691 + 10.0 * np.log10(max(p, 1e-20))) > relative_gate
        ]

        if not gated_powers:
            return round(ungated_lufs, 1)

        gated_mean = np.mean(gated_powers)
        return round(-0.691 + 10.0 * np.log10(max(float(gated_mean), 1e-20)), 1)

    def _compute_lufs_short_term(self, y: np.ndarray, sr: int) -> float:
        """Compute max short-term LUFS (3-second sliding window)."""
        y_k = self._apply_k_weight(y, sr)
        block_samples = int(self.block_size_s * sr)
        hop = block_samples // 4  # 75% overlap

        if len(y_k) < block_samples:
            power = float(np.mean(y_k ** 2))
            return round(-0.691 + 10.0 * np.log10(max(power, 1e-20)), 1)

        max_lufs = -70.0
        for start in range(0, len(y_k) - block_samples + 1, hop):
            block = y_k[start:start + block_samples]
            power = float(np.mean(block ** 2))
            lufs = -0.691 + 10.0 * np.log10(max(power, 1e-20))
            if lufs > max_lufs:
                max_lufs = lufs

        return round(max_lufs, 1)

    def _compute_lufs_momentary(self, y: np.ndarray, sr: int) -> float:
        """Compute max momentary LUFS (400ms sliding window)."""
        y_k = self._apply_k_weight(y, sr)
        block_samples = int(self.momentary_size_s * sr)
        hop = block_samples // 4

        if len(y_k) < block_samples:
            power = float(np.mean(y_k ** 2))
            return round(-0.691 + 10.0 * np.log10(max(power, 1e-20)), 1)

        max_lufs = -70.0
        for start in range(0, len(y_k) - block_samples + 1, hop):
            block = y_k[start:start + block_samples]
            power = float(np.mean(block ** 2))
            lufs = -0.691 + 10.0 * np.log10(max(power, 1e-20))
            if lufs > max_lufs:
                max_lufs = lufs

        return round(max_lufs, 1)

    def _apply_k_weight(self, y: np.ndarray, sr: int) -> np.ndarray:
        """Apply K-weighting if scipy is available and sample rate is supported."""
        if sr == 44100:
            try:
                return _k_weight_44100(y)
            except ImportError:
                pass
        # Fallback: no K-weighting (acceptable approximation for QC purposes)
        return y

    # ------------------------------------------------------------------
    # Dynamic range (LRA approximation)
    # ------------------------------------------------------------------

    def _compute_dynamic_range(self, y: np.ndarray, sr: int) -> float:
        """
        Compute loudness range (LRA) approximation.

        Uses short-term LUFS distribution: LRA = 95th percentile - 10th percentile
        of gated short-term loudness values.
        """
        y_k = self._apply_k_weight(y, sr)
        block_samples = int(self.block_size_s * sr)
        hop = block_samples // 4

        if len(y_k) < block_samples:
            return 0.0

        st_values = []
        for start in range(0, len(y_k) - block_samples + 1, hop):
            block = y_k[start:start + block_samples]
            power = float(np.mean(block ** 2))
            lufs = -0.691 + 10.0 * np.log10(max(power, 1e-20))
            if lufs > -70.0:
                st_values.append(lufs)

        if len(st_values) < 2:
            return 0.0

        # Gate at -20 dB below ungated mean
        mean_st = np.mean(st_values)
        gate = mean_st - 20.0
        gated = [v for v in st_values if v > gate]

        if len(gated) < 2:
            return 0.0

        p10 = float(np.percentile(gated, 10))
        p95 = float(np.percentile(gated, 95))
        return round(p95 - p10, 1)

    # ------------------------------------------------------------------
    # Crest factor
    # ------------------------------------------------------------------

    def _compute_crest_factor(self, y: np.ndarray) -> float:
        """Compute crest factor: peak-to-RMS ratio in dB."""
        peak = float(np.max(np.abs(y)))
        rms = float(np.sqrt(np.mean(y ** 2)))
        if rms <= 0 or peak <= 0:
            return 0.0
        return round(20.0 * np.log10(peak / rms), 1)

    # ------------------------------------------------------------------
    # True peak
    # ------------------------------------------------------------------

    def _compute_true_peak(self, y: np.ndarray) -> float:
        """Compute true peak in dBTP (4x oversampling)."""
        try:
            from scipy.signal import resample_poly  # type: ignore[import-untyped]
            y_4x = resample_poly(y, 4, 1)
        except ImportError:
            # Fallback: simple peak without oversampling
            y_4x = y

        peak = float(np.max(np.abs(y_4x)))
        if peak <= 0:
            return -70.0
        return round(20.0 * np.log10(peak), 1)

    # ------------------------------------------------------------------
    # Stereo width
    # ------------------------------------------------------------------

    def _compute_stereo_width(
        self, y_stereo: np.ndarray
    ) -> tuple[float, float]:
        """
        Compute stereo width metrics.

        Returns:
            (correlation, mid_side_ratio)
            - correlation: -1 (out of phase) to +1 (mono). Values 0.3-0.8 are typical.
            - mid_side_ratio: side_energy / mid_energy. 0 = mono, higher = wider.
        """
        left = y_stereo[0]
        right = y_stereo[1]

        # Correlation coefficient
        if np.std(left) > 0 and np.std(right) > 0:
            correlation = float(np.corrcoef(left, right)[0, 1])
        else:
            correlation = 1.0

        # Mid/Side ratio
        mid = (left + right) / 2.0
        side = (left - right) / 2.0
        mid_energy = float(np.mean(mid ** 2))
        side_energy = float(np.mean(side ** 2))

        if mid_energy > 0:
            ms_ratio = round(float(side_energy / mid_energy), 3)
        else:
            ms_ratio = 0.0

        return round(correlation, 3), ms_ratio

    # ------------------------------------------------------------------
    # Frequency balance
    # ------------------------------------------------------------------

    def _analyze_frequency_balance(
        self, y: np.ndarray, sr: int, standard: GenreStandard
    ) -> list[FrequencyBandResult]:
        """Analyze energy distribution across frequency bands."""
        # Compute magnitude spectrum
        n_fft = 4096
        S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=self.hop_length))
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)

        # Total energy
        total_energy = float(np.sum(S ** 2))
        if total_energy <= 0:
            return []

        results: list[FrequencyBandResult] = []
        for band_name, (lo, hi) in FREQ_BANDS.items():
            mask = (freqs >= lo) & (freqs < hi)
            band_energy = float(np.sum(S[mask, :] ** 2))
            ratio = round(band_energy / total_energy, 4)

            target_min, target_max = standard.freq_balance.get(
                band_name, (0.0, 1.0)
            )

            if target_min <= ratio <= target_max:
                verdict = Verdict.PASS
                detail = f"{band_name}: {ratio:.1%} energy (within {target_min:.0%}-{target_max:.0%})"
            elif ratio < target_min:
                deficit = target_min - ratio
                verdict = Verdict.WARN if deficit < 0.05 else Verdict.FAIL
                detail = f"{band_name}: {ratio:.1%} energy (below target {target_min:.0%}-{target_max:.0%})"
            else:
                excess = ratio - target_max
                verdict = Verdict.WARN if excess < 0.05 else Verdict.FAIL
                detail = f"{band_name}: {ratio:.1%} energy (above target {target_min:.0%}-{target_max:.0%})"

            results.append(FrequencyBandResult(
                band=band_name,
                range_hz=(lo, hi),
                energy_ratio=ratio,
                target_min=target_min,
                target_max=target_max,
                verdict=verdict,
                detail=detail,
            ))

        return results

    # ------------------------------------------------------------------
    # Metric evaluation helpers
    # ------------------------------------------------------------------

    def _evaluate_lufs(self, lufs: float, std: GenreStandard) -> MetricResult:
        """Evaluate integrated LUFS against genre standard."""
        diff = abs(lufs - std.lufs_target)
        if diff <= std.lufs_tolerance:
            verdict = Verdict.PASS
        elif diff <= std.lufs_tolerance * 2:
            verdict = Verdict.WARN
        else:
            verdict = Verdict.FAIL

        score = self._clamp_score(100 - (diff / std.lufs_tolerance) * 25)

        return MetricResult(
            name="LUFS Integrated",
            value=round(lufs, 1),
            unit="LUFS",
            target=std.lufs_target,
            tolerance=std.lufs_tolerance,
            verdict=verdict,
            score=score,
            detail=f"Integrated loudness: {lufs:.1f} LUFS (target: {std.lufs_target:.1f} +/- {std.lufs_tolerance:.1f})",
        )

    def _evaluate_dynamic_range(self, dr: float, std: GenreStandard) -> MetricResult:
        """Evaluate dynamic range against genre standard."""
        if std.dynamic_range_min <= dr <= std.dynamic_range_max:
            verdict = Verdict.PASS
            deviation = 0.0
        elif dr < std.dynamic_range_min:
            deficit = std.dynamic_range_min - dr
            verdict = Verdict.WARN if deficit < 2.0 else Verdict.FAIL
            deviation = deficit
        else:
            excess = dr - std.dynamic_range_max
            verdict = Verdict.WARN if excess < 3.0 else Verdict.FAIL
            deviation = excess

        mid = (std.dynamic_range_min + std.dynamic_range_max) / 2
        score = self._clamp_score(100 - (abs(dr - mid) / mid) * 60)

        return MetricResult(
            name="Dynamic Range (LRA)",
            value=round(dr, 1),
            unit="dB",
            target=mid,
            tolerance=(std.dynamic_range_max - std.dynamic_range_min) / 2,
            verdict=verdict,
            score=score,
            detail=f"Dynamic range: {dr:.1f} dB (target: {std.dynamic_range_min:.0f}-{std.dynamic_range_max:.0f} dB)",
        )

    def _evaluate_crest_factor(self, cf: float, std: GenreStandard) -> MetricResult:
        """Evaluate crest factor against genre standard."""
        if std.crest_factor_min <= cf <= std.crest_factor_max:
            verdict = Verdict.PASS
        elif cf < std.crest_factor_min:
            verdict = Verdict.WARN if (std.crest_factor_min - cf) < 2.0 else Verdict.FAIL
        else:
            verdict = Verdict.WARN if (cf - std.crest_factor_max) < 2.0 else Verdict.FAIL

        mid = (std.crest_factor_min + std.crest_factor_max) / 2
        score = self._clamp_score(100 - (abs(cf - mid) / mid) * 50)

        return MetricResult(
            name="Crest Factor",
            value=round(cf, 1),
            unit="dB",
            target=mid,
            tolerance=(std.crest_factor_max - std.crest_factor_min) / 2,
            verdict=verdict,
            score=score,
            detail=f"Crest factor: {cf:.1f} dB (target: {std.crest_factor_min:.0f}-{std.crest_factor_max:.0f} dB)",
        )

    def _evaluate_stereo_width(
        self, ms_ratio: float, correlation: float, std: GenreStandard
    ) -> MetricResult:
        """Evaluate stereo width against genre standard."""
        if std.stereo_width_min <= ms_ratio <= std.stereo_width_max:
            verdict = Verdict.PASS
        elif ms_ratio < std.stereo_width_min:
            verdict = Verdict.WARN
        else:
            verdict = Verdict.WARN if ms_ratio < 1.2 else Verdict.FAIL

        # Penalize negative correlation (phase issues)
        if correlation < 0.0:
            verdict = Verdict.FAIL

        mid_target = (std.stereo_width_min + std.stereo_width_max) / 2
        score = self._clamp_score(
            100 - abs(ms_ratio - mid_target) * 80 - max(0, -correlation) * 50
        )

        phase_note = ""
        if correlation < 0.0:
            phase_note = f" PHASE ISSUE: correlation={correlation:.2f}"
        elif correlation < 0.3:
            phase_note = f" (wide stereo, correlation={correlation:.2f})"

        return MetricResult(
            name="Stereo Width",
            value=round(ms_ratio, 3),
            unit="ratio",
            target=mid_target,
            tolerance=(std.stereo_width_max - std.stereo_width_min) / 2,
            verdict=verdict,
            score=score,
            detail=(
                f"M/S ratio: {ms_ratio:.3f} "
                f"(target: {std.stereo_width_min:.2f}-{std.stereo_width_max:.2f}){phase_note}"
            ),
        )

    # ------------------------------------------------------------------
    # Recommendation generation
    # ------------------------------------------------------------------

    def _generate_recommendations(
        self,
        metrics: list[MetricResult],
        freq_results: list[FrequencyBandResult],
        standard: GenreStandard,
    ) -> list[str]:
        """Generate actionable recommendations from metric results."""
        recs: list[str] = []

        for m in metrics:
            if m.verdict == Verdict.PASS:
                continue

            if m.name == "LUFS Integrated":
                if m.value > m.target + m.tolerance:
                    recs.append(
                        f"Reduce overall loudness by ~{m.value - m.target:.1f} dB. "
                        f"Target: {m.target:.1f} LUFS for {standard.name}."
                    )
                elif m.value < m.target - m.tolerance:
                    recs.append(
                        f"Increase overall loudness by ~{m.target - m.value:.1f} dB. "
                        f"Target: {m.target:.1f} LUFS for {standard.name}."
                    )

            elif m.name == "Dynamic Range (LRA)":
                if m.value < standard.dynamic_range_min:
                    recs.append(
                        f"Dynamic range too low ({m.value:.1f} dB). Reduce compression or "
                        f"limiting to achieve at least {standard.dynamic_range_min:.0f} dB LRA."
                    )
                elif m.value > standard.dynamic_range_max:
                    recs.append(
                        f"Dynamic range too high ({m.value:.1f} dB) for {standard.name}. "
                        f"Apply gentle bus compression to tighten dynamics below {standard.dynamic_range_max:.0f} dB."
                    )

            elif m.name == "Crest Factor":
                if m.value < standard.crest_factor_min:
                    recs.append(
                        f"Crest factor low ({m.value:.1f} dB) — mix may sound overly compressed. "
                        f"Reduce peak limiting to restore transients."
                    )
                elif m.value > standard.crest_factor_max:
                    recs.append(
                        f"Crest factor high ({m.value:.1f} dB) — transients may be too prominent. "
                        f"Apply light peak limiting or soft-clip."
                    )

            elif m.name == "Stereo Width":
                if "PHASE ISSUE" in m.detail:
                    recs.append(
                        "Stereo phase correlation is negative — check for phase cancellation "
                        "between left and right channels. This will cause issues on mono playback."
                    )
                elif m.value < standard.stereo_width_min:
                    recs.append(
                        f"Mix is too narrow (M/S ratio: {m.value:.3f}). "
                        f"Widen reverbs, delays, or use mid-side processing to increase stereo spread."
                    )
                elif m.value > standard.stereo_width_max:
                    recs.append(
                        f"Mix is excessively wide (M/S ratio: {m.value:.3f}). "
                        f"Tighten center image — check bass and vocals are properly centered."
                    )

            elif m.name == "True Peak":
                if m.value > 0.0:
                    recs.append(
                        f"True peak exceeds 0 dBTP ({m.value:.1f} dBTP) — digital clipping likely. "
                        f"Apply a true-peak limiter set to -1.0 dBTP."
                    )
                elif m.value > -1.0:
                    recs.append(
                        f"True peak is {m.value:.1f} dBTP. For streaming platforms, "
                        f"reduce to -1.0 dBTP or lower using a true-peak limiter."
                    )

        # Frequency balance recommendations
        for fb in freq_results:
            if fb.verdict == Verdict.PASS:
                continue

            band_label = fb.band.replace("_", "-")
            if fb.energy_ratio < fb.target_min:
                deficit_pct = round((fb.target_min - fb.energy_ratio) * 100, 1)
                recs.append(
                    f"Boost {band_label} frequencies ({fb.range_hz[0]}-{fb.range_hz[1]} Hz) — "
                    f"currently {deficit_pct}% below target for {standard.name}."
                )
            elif fb.energy_ratio > fb.target_max:
                excess_pct = round((fb.energy_ratio - fb.target_max) * 100, 1)
                recs.append(
                    f"Cut {band_label} frequencies ({fb.range_hz[0]}-{fb.range_hz[1]} Hz) — "
                    f"currently {excess_pct}% above target for {standard.name}."
                )

        return recs

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def _resolve_standard(self, genre: str) -> GenreStandard:
        """Resolve genre string to a GenreStandard, with fuzzy matching."""
        key = genre.lower().strip()
        if key in GENRE_STANDARDS:
            return GENRE_STANDARDS[key]

        # Fuzzy match: check if the genre contains a known key
        for std_key, std in GENRE_STANDARDS.items():
            if std_key in key or key in std_key:
                return std
            # Check the display name too
            if key in std.name.lower():
                return std

        self.logger.info("genre_not_found_using_default", genre=genre)
        return DEFAULT_STANDARD

    @staticmethod
    def _clamp_score(score: float) -> float:
        """Clamp a score to [0, 100] range."""
        return round(max(0.0, min(100.0, score)), 1)

    @staticmethod
    def _freq_band_score(fb: FrequencyBandResult) -> float:
        """Convert a frequency band result to a 0-100 score."""
        if fb.verdict == Verdict.PASS:
            return 100.0
        mid = (fb.target_min + fb.target_max) / 2
        rng = (fb.target_max - fb.target_min) / 2 if fb.target_max > fb.target_min else 0.1
        deviation = abs(fb.energy_ratio - mid)
        return max(0.0, min(100.0, round(100 - (deviation / rng) * 50, 1)))


# ======================================================================
# CLI Entry Point
# ======================================================================

async def _cli_main() -> None:
    """CLI entry point for quality review."""
    import argparse

    try:
        from ..utils.logging import setup_logging
        setup_logging("INFO")
    except (ImportError, ValueError):
        pass

    parser = argparse.ArgumentParser(
        description="Quality review of audio against genre mastering standards",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m src.agents.quality_reviewer --input song.wav\n"
            "  python -m src.agents.quality_reviewer --input song.wav --genre pop\n"
            "  python -m src.agents.quality_reviewer --input song.wav --genre hip-hop --output report.json\n"
            "  python -m src.agents.quality_reviewer --audio-dna dna.json --genre electronic\n"
            "\nSupported genres: " + ", ".join(sorted(GENRE_STANDARDS.keys())) + "\n"
        ),
    )
    parser.add_argument(
        "--input", default=None, help="Path to input audio file"
    )
    parser.add_argument(
        "--audio-dna", default=None, help="Path to AudioDNA JSON (reduced mode)"
    )
    parser.add_argument(
        "--genre", default="generic",
        help=f"Genre for standard selection (default: generic). Options: {', '.join(sorted(GENRE_STANDARDS.keys()))}",
    )
    parser.add_argument(
        "--output", default=None, help="Output JSON file path (default: print to stdout)"
    )

    args = parser.parse_args()

    if not args.input and not args.audio_dna:
        parser.error("Either --input or --audio-dna is required")

    reviewer = QualityReviewer()

    try:
        if args.input:
            report = await asyncio.to_thread(reviewer.review, args.input, genre=args.genre)
        else:
            dna_path = Path(args.audio_dna)
            if not dna_path.is_file():
                raise FileNotFoundError(f"File not found: {dna_path}")
            dna = json.loads(dna_path.read_text(encoding="utf-8"))
            report = reviewer._review_from_dna(dna, genre=args.genre)

        report_dict = sanitize_for_json(asdict(report))
        output_json = json.dumps(report_dict, indent=2, ensure_ascii=False)

        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output_json, encoding="utf-8")
            logger.info("output_written", path=str(out_path))
            print(f"\nQuality report written to {out_path}")
        else:
            print("\n=== Quality Report ===")
            print(output_json)

        # Summary
        print(f"\n--- Summary ---")
        print(f"  Genre:     {report.genre} ({report.genre_standard})")
        print(f"  Score:     {report.overall_score}/100")
        print(f"  Verdict:   {report.overall_verdict.upper()}")
        print(f"  Duration:  {report.duration_seconds}s")
        print(f"  Time:      {report.processing_time_seconds}s")
        print(f"  Recs:      {len(report.recommendations)}")
        for i, rec in enumerate(report.recommendations, 1):
            print(f"    {i}. {rec}")

    except FileNotFoundError as e:
        logger.error("file_not_found", error=str(e))
        raise SystemExit(1)
    except Exception as e:
        logger.error("review_failed", error=str(e))
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(_cli_main())
