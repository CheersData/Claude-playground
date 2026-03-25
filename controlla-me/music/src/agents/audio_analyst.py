"""
Audio Analyst Agent — Comprehensive audio analysis producing an AudioDNA JSON.

Analyzes audio files (or pre-separated stems) to extract:
- BPM with confidence
- Musical key and scale (essentia preferred, librosa fallback)
- Energy profile: RMS, LUFS approximation, dynamic range
- Spectral features: centroid, bandwidth, rolloff, contrast
- Onset detection: strength, rate
- Song structure segmentation (intro/verse/chorus/bridge/outro)
- Chroma features and basic chord estimation
- Per-stem analysis when stems are available

CLI usage:
    python -m src.agents.audio_analyst --input file.wav
    python -m src.agents.audio_analyst --input file.wav --stems-dir path/to/stems
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import structlog

from .base import BaseAgent
from ..utils.numpy_json import sanitize_for_json

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Optional essentia import — graceful degradation to librosa-only
# ---------------------------------------------------------------------------
_HAS_ESSENTIA = False
try:
    import essentia.standard as es  # type: ignore[import-untyped]

    _HAS_ESSENTIA = True
except ImportError:
    pass

# Stem names matching Demucs output
STEM_NAMES = ("vocals", "drums", "bass", "other")

# Note names for chord / key labelling
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Typical section labels for structure segmentation
_SECTION_LABELS = ["intro", "verse", "chorus", "bridge", "outro"]


class AudioAnalysisError(Exception):
    """Raised when a critical analysis step fails."""


class AudioAnalyst(BaseAgent):
    """
    Produces an AudioDNA — a structured JSON radiograph of an audio file.

    Gracefully degrades when essentia is not available, falling back to
    librosa-only analysis for key detection and energy features.

    Args:
        sr: Target sample rate for loading audio (default: 22050).
        hop_length: Hop length for frame-level features (default: 512).
    """

    def __init__(self, sr: int = 22050, hop_length: int = 512) -> None:
        super().__init__("audio_analyst")
        self.sr = sr
        self.hop_length = hop_length
        if not _HAS_ESSENTIA:
            self.logger.warning(
                "essentia_not_available",
                hint="Key detection will use librosa chroma fallback (lower accuracy).",
            )

    # ------------------------------------------------------------------
    # BaseAgent interface
    # ------------------------------------------------------------------

    async def run(self, **kwargs: Any) -> dict:
        """
        Run full AudioDNA analysis.

        Keyword Args:
            input_path: Path to the audio file (required).
            stems_dir: Optional directory containing pre-separated stems.

        Returns:
            dict containing the complete AudioDNA.
        """
        input_path = kwargs.get("input_path")
        if not input_path:
            raise ValueError("input_path is required")

        stems_dir = kwargs.get("stems_dir")
        dna = await asyncio.to_thread(
            self.analyze, str(input_path), stems_dir=stems_dir
        )
        return {"audio_dna": dna, "status": "success"}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def analyze(
        self, input_path: str, *, stems_dir: str | None = None
    ) -> dict[str, Any]:
        """
        Produce the full AudioDNA for *input_path*.

        Args:
            input_path: Path to an audio file (wav, mp3, flac, etc.).
            stems_dir: If provided, directory with vocals.wav / drums.wav /
                       bass.wav / other.wav for per-stem analysis.

        Returns:
            A structured dict representing the AudioDNA.
        """
        path = Path(input_path)
        if not path.is_file():
            raise FileNotFoundError(f"Audio file not found: {input_path}")

        self.log_start(input_file=path.name, has_stems=stems_dir is not None)
        t0 = time.monotonic()

        # Load the full mix
        y, sr = librosa.load(str(path), sr=self.sr, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        self.logger.info("audio_loaded", duration_s=round(duration, 2), sr=sr)

        # Collect all analysis sections — each wrapped in try/except
        dna: dict[str, Any] = {
            "file": path.name,
            "duration": round(duration, 2),
            "sampleRate": sr,
        }

        dna["bpm"] = self._detect_bpm(y, sr)
        dna["key"] = self._detect_key(y, sr)
        dna["energy"] = self._analyze_energy(y, sr)
        dna["spectral"] = self._analyze_spectral(y, sr)
        dna["onsets"] = self._detect_onsets(y, sr)
        dna["sections"] = self._segment_structure(y, sr, duration)
        dna["chroma"] = self._analyze_chroma(y, sr)
        dna["chords"] = self._estimate_chords(y, sr, dna.get("sections"))

        # Per-stem analysis when stems are available
        if stems_dir:
            dna["stems"] = self._analyze_stems(stems_dir, sr)
        else:
            dna["stems"] = list(STEM_NAMES)

        elapsed = round(time.monotonic() - t0, 2)
        dna["processingTime"] = elapsed
        dna["essentia"] = _HAS_ESSENTIA

        self.log_complete(
            duration_s=dna["duration"],
            bpm=dna["bpm"].get("value"),
            key=dna["key"].get("key"),
            sections=len(dna["sections"]),
            processing_time_s=elapsed,
        )
        return dna

    # ------------------------------------------------------------------
    # BPM Detection
    # ------------------------------------------------------------------

    def _detect_bpm(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """Detect tempo (BPM) using librosa beat tracker."""
        try:
            tempo, beat_frames = librosa.beat.beat_track(
                y=y, sr=sr, hop_length=self.hop_length
            )
            # librosa >= 0.10 returns an array for tempo
            bpm_value = float(np.atleast_1d(tempo)[0])

            beat_times = librosa.frames_to_time(
                beat_frames, sr=sr, hop_length=self.hop_length
            ).tolist()

            # Confidence: standard deviation of inter-beat intervals
            if len(beat_times) > 1:
                ibis = np.diff(beat_times)
                expected_ibi = 60.0 / bpm_value if bpm_value > 0 else 1.0
                std_ratio = float(np.std(ibis) / expected_ibi) if expected_ibi > 0 else 1.0
                confidence = round(max(0.0, min(1.0, 1.0 - std_ratio)), 3)
            else:
                confidence = 0.0

            return {
                "value": round(bpm_value, 1),
                "confidence": confidence,
                "beatCount": len(beat_times),
                "timeSignature": "4/4",  # default assumption
            }
        except Exception as exc:
            self.log_error(f"BPM detection failed: {exc}")
            return {"value": 0.0, "confidence": 0.0, "beatCount": 0, "timeSignature": "4/4"}

    # ------------------------------------------------------------------
    # Key Detection
    # ------------------------------------------------------------------

    def _detect_key(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """
        Detect musical key and scale.

        Prefers essentia's KeyExtractor (higher accuracy). Falls back to
        librosa chroma-based estimation.
        """
        if _HAS_ESSENTIA:
            return self._detect_key_essentia(y, sr)
        return self._detect_key_librosa(y, sr)

    def _detect_key_essentia(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """Key detection via essentia KeyExtractor."""
        try:
            # essentia expects float32 at 44100 Hz
            if sr != 44100:
                y_44k = librosa.resample(y, orig_sr=sr, target_sr=44100)
            else:
                y_44k = y

            y_44k = y_44k.astype(np.float32)
            key_extractor = es.KeyExtractor()
            key, scale, strength = key_extractor(y_44k)[:3]

            return {
                "key": str(key),
                "scale": str(scale),
                "confidence": round(float(strength), 3),
                "label": f"{key} {scale}",
                "method": "essentia",
            }
        except Exception as exc:
            self.logger.warning("essentia_key_fallback", error=str(exc))
            return self._detect_key_librosa(y, sr)

    def _detect_key_librosa(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """
        Fallback key detection using chroma energy distribution.

        Correlates the chroma profile against major and minor templates
        (Krumhansl-Kessler profiles).
        """
        try:
            chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=self.hop_length)
            chroma_avg = np.mean(chroma, axis=1)  # shape: (12,)

            # Krumhansl-Kessler key profiles
            major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                                      2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                                      2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

            best_corr = -1.0
            best_key = "C"
            best_scale = "major"

            for shift in range(12):
                shifted = np.roll(chroma_avg, -shift)
                corr_major = float(np.corrcoef(shifted, major_profile)[0, 1])
                corr_minor = float(np.corrcoef(shifted, minor_profile)[0, 1])

                if corr_major > best_corr:
                    best_corr = corr_major
                    best_key = _NOTE_NAMES[shift]
                    best_scale = "major"
                if corr_minor > best_corr:
                    best_corr = corr_minor
                    best_key = _NOTE_NAMES[shift]
                    best_scale = "minor"

            confidence = round(max(0.0, min(1.0, best_corr)), 3)

            return {
                "key": best_key,
                "scale": best_scale,
                "confidence": confidence,
                "label": f"{best_key} {best_scale}",
                "method": "librosa_chroma",
            }
        except Exception as exc:
            self.log_error(f"Key detection failed: {exc}")
            return {
                "key": "unknown",
                "scale": "unknown",
                "confidence": 0.0,
                "label": "unknown",
                "method": "failed",
            }

    # ------------------------------------------------------------------
    # Energy Analysis
    # ------------------------------------------------------------------

    def _analyze_energy(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """Compute RMS energy, LUFS approximation, and dynamic range."""
        try:
            rms = librosa.feature.rms(y=y, hop_length=self.hop_length)[0]
            rms_mean = float(np.mean(rms))
            rms_max = float(np.max(rms))
            rms_min = float(np.min(rms[rms > 0])) if np.any(rms > 0) else 0.0

            # LUFS approximation: 20*log10(rms_mean) adjusted to LUFS-like scale
            # True LUFS requires K-weighting; this is a practical approximation
            if rms_mean > 0:
                lufs_approx = round(20.0 * np.log10(rms_mean) - 0.691, 1)
            else:
                lufs_approx = -70.0

            # Dynamic range: difference between loudest and quietest non-silent frames
            if rms_max > 0 and rms_min > 0:
                dynamic_range_db = round(20.0 * np.log10(rms_max / rms_min), 1)
            else:
                dynamic_range_db = 0.0

            return {
                "rmsMean": round(rms_mean, 5),
                "rmsMax": round(rms_max, 5),
                "lufsApprox": lufs_approx,
                "dynamicRangeDb": dynamic_range_db,
                "overall": round(float(np.clip(rms_mean * 5.0, 0.0, 1.0)), 3),
            }
        except Exception as exc:
            self.log_error(f"Energy analysis failed: {exc}")
            return {
                "rmsMean": 0.0,
                "rmsMax": 0.0,
                "lufsApprox": -70.0,
                "dynamicRangeDb": 0.0,
                "overall": 0.0,
            }

    # ------------------------------------------------------------------
    # Spectral Features
    # ------------------------------------------------------------------

    def _analyze_spectral(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """Extract spectral centroid, bandwidth, rolloff, and contrast."""
        try:
            centroid = librosa.feature.spectral_centroid(
                y=y, sr=sr, hop_length=self.hop_length
            )[0]
            bandwidth = librosa.feature.spectral_bandwidth(
                y=y, sr=sr, hop_length=self.hop_length
            )[0]
            rolloff = librosa.feature.spectral_rolloff(
                y=y, sr=sr, hop_length=self.hop_length
            )[0]
            contrast = librosa.feature.spectral_contrast(
                y=y, sr=sr, hop_length=self.hop_length
            )

            return {
                "centroidMean": round(float(np.mean(centroid)), 1),
                "centroidStd": round(float(np.std(centroid)), 1),
                "bandwidthMean": round(float(np.mean(bandwidth)), 1),
                "rolloffMean": round(float(np.mean(rolloff)), 1),
                "contrastMean": [
                    round(float(v), 2) for v in np.mean(contrast, axis=1)
                ],
            }
        except Exception as exc:
            self.log_error(f"Spectral analysis failed: {exc}")
            return {
                "centroidMean": 0.0,
                "centroidStd": 0.0,
                "bandwidthMean": 0.0,
                "rolloffMean": 0.0,
                "contrastMean": [],
            }

    # ------------------------------------------------------------------
    # Onset Detection
    # ------------------------------------------------------------------

    def _detect_onsets(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """Detect onsets and compute onset rate (onsets per second)."""
        try:
            onset_env = librosa.onset.onset_strength(
                y=y, sr=sr, hop_length=self.hop_length
            )
            onset_frames = librosa.onset.onset_detect(
                onset_envelope=onset_env, sr=sr, hop_length=self.hop_length
            )
            onset_times = librosa.frames_to_time(
                onset_frames, sr=sr, hop_length=self.hop_length
            )

            duration = librosa.get_duration(y=y, sr=sr)
            onset_rate = len(onset_times) / duration if duration > 0 else 0.0

            return {
                "count": len(onset_times),
                "rate": round(onset_rate, 2),
                "strengthMean": round(float(np.mean(onset_env)), 4),
                "strengthMax": round(float(np.max(onset_env)), 4),
            }
        except Exception as exc:
            self.log_error(f"Onset detection failed: {exc}")
            return {"count": 0, "rate": 0.0, "strengthMean": 0.0, "strengthMax": 0.0}

    # ------------------------------------------------------------------
    # Song Structure Segmentation
    # ------------------------------------------------------------------

    def _segment_structure(
        self, y: np.ndarray, sr: int, duration: float
    ) -> list[dict[str, Any]]:
        """
        Detect song sections using librosa's recurrence matrix and novelty curve.

        Segments the track by finding novelty peaks in the self-similarity
        matrix of MFCCs, then assigns labels heuristically based on segment
        position and energy profile.
        """
        try:
            # Compute MFCCs for structural similarity
            mfcc = librosa.feature.mfcc(
                y=y, sr=sr, n_mfcc=13, hop_length=self.hop_length
            )

            # Structural novelty via self-similarity matrix of MFCCs.
            # librosa.segment.novelty was removed in recent librosa versions.
            # Replacement: build a recurrence matrix from MFCCs, then compute
            # a novelty curve by measuring change along the diagonal using a
            # checkerboard kernel (same approach the old function used).
            mfcc_norm = librosa.util.normalize(mfcc, axis=1)
            rec = librosa.segment.recurrence_matrix(
                mfcc_norm, mode="affinity", sym=True
            )

            # Checkerboard kernel novelty: convolve the diagonal of the
            # recurrence matrix with a checkerboard kernel to detect
            # structural transitions (boundaries between self-similar blocks).
            k = 16  # kernel half-width in frames (~0.37s at 22050/512)
            checker = np.ones((2 * k, 2 * k))
            checker[:k, k:] = -1
            checker[k:, :k] = -1

            n_frames = rec.shape[0]
            novelty = np.zeros(n_frames)
            for i in range(k, n_frames - k):
                patch = rec[i - k : i + k, i - k : i + k]
                novelty[i] = np.sum(patch * checker)
            # Clip negative values (we only care about positive transitions)
            novelty = np.maximum(novelty, 0.0)

            # Smooth to reduce spurious peaks (moving average, ~2s window)
            kernel_size = max(1, int(2.0 * sr / self.hop_length))
            kernel = np.ones(kernel_size) / kernel_size
            novelty = np.convolve(novelty, kernel, mode="same")

            # Pick peaks as segment boundaries
            # Adaptive threshold: mean + 1.0 * std (structural boundaries are rarer)
            threshold = float(np.mean(novelty) + 1.0 * np.std(novelty))
            peak_frames = np.where(novelty > threshold)[0]

            if len(peak_frames) == 0:
                # No clear boundaries — return the full track as one section
                return [{"label": "full", "start": 0.0, "end": round(duration, 2)}]

            # Cluster nearby peaks (within 3 seconds of each other)
            min_gap_frames = int(3.0 * sr / self.hop_length)
            boundaries = [0]
            for pf in peak_frames:
                if pf - boundaries[-1] >= min_gap_frames:
                    boundaries.append(int(pf))

            # Convert to times
            boundary_times = librosa.frames_to_time(
                boundaries, sr=sr, hop_length=self.hop_length
            ).tolist()
            boundary_times.append(duration)

            # Compute energy per segment for label assignment
            rms = librosa.feature.rms(y=y, hop_length=self.hop_length)[0]
            segment_energies: list[float] = []
            for i in range(len(boundary_times) - 1):
                start_frame = librosa.time_to_frames(
                    boundary_times[i], sr=sr, hop_length=self.hop_length
                )
                end_frame = librosa.time_to_frames(
                    boundary_times[i + 1], sr=sr, hop_length=self.hop_length
                )
                end_frame = min(end_frame, len(rms))
                if end_frame > start_frame:
                    segment_energies.append(float(np.mean(rms[start_frame:end_frame])))
                else:
                    segment_energies.append(0.0)

            # Assign labels heuristically
            labels = self._assign_section_labels(
                boundary_times, segment_energies, duration
            )

            sections: list[dict[str, Any]] = []
            for i in range(len(boundary_times) - 1):
                sections.append({
                    "label": labels[i],
                    "start": round(boundary_times[i], 2),
                    "end": round(boundary_times[i + 1], 2),
                    "energy": round(segment_energies[i], 5),
                })

            return sections

        except Exception as exc:
            self.log_error(f"Structure segmentation failed: {exc}")
            return [{"label": "full", "start": 0.0, "end": round(duration, 2)}]

    def _assign_section_labels(
        self,
        boundary_times: list[float],
        energies: list[float],
        duration: float,
    ) -> list[str]:
        """
        Assign section labels based on position and relative energy.

        Heuristic rules:
        - First segment (< 15% of duration): intro
        - Last segment (starts > 85% of duration): outro
        - High-energy segments: chorus
        - Remaining: verse or bridge (bridge if between two choruses)
        """
        n = len(energies)
        if n == 0:
            return []

        labels = [""] * n
        energy_arr = np.array(energies)
        median_energy = float(np.median(energy_arr)) if n > 0 else 0.0
        high_threshold = median_energy * 1.15

        # Intro / outro by position
        first_end = boundary_times[1] if n > 1 else duration
        if first_end / duration < 0.15:
            labels[0] = "intro"

        last_start = boundary_times[-2] if n > 1 else 0.0
        if last_start / duration > 0.85:
            labels[n - 1] = "outro"

        # Choruses: above-median energy segments (not already labelled)
        for i in range(n):
            if labels[i]:
                continue
            if energies[i] > high_threshold:
                labels[i] = "chorus"

        # Fill remaining: verse, with bridge between choruses
        prev_chorus = False
        for i in range(n):
            if labels[i] == "chorus":
                prev_chorus = True
                continue
            if labels[i]:
                prev_chorus = False
                continue
            # Check if next labelled segment is a chorus
            next_chorus = False
            for j in range(i + 1, n):
                if labels[j] == "chorus":
                    next_chorus = True
                    break
                if labels[j]:
                    break

            if prev_chorus and next_chorus:
                labels[i] = "bridge"
            else:
                labels[i] = "verse"
            prev_chorus = False

        return labels

    # ------------------------------------------------------------------
    # Chroma Features
    # ------------------------------------------------------------------

    def _analyze_chroma(self, y: np.ndarray, sr: int) -> dict[str, Any]:
        """Compute chroma feature summary."""
        try:
            chroma = librosa.feature.chroma_cqt(
                y=y, sr=sr, hop_length=self.hop_length
            )
            chroma_mean = np.mean(chroma, axis=1)  # (12,)

            # Dominant pitch class
            dominant_idx = int(np.argmax(chroma_mean))
            dominant_note = _NOTE_NAMES[dominant_idx]

            return {
                "dominantPitchClass": dominant_note,
                "profile": [round(float(v), 4) for v in chroma_mean],
                "notes": _NOTE_NAMES,
            }
        except Exception as exc:
            self.log_error(f"Chroma analysis failed: {exc}")
            return {"dominantPitchClass": "unknown", "profile": [], "notes": _NOTE_NAMES}

    # ------------------------------------------------------------------
    # Chord Estimation
    # ------------------------------------------------------------------

    def _estimate_chords(
        self,
        y: np.ndarray,
        sr: int,
        sections: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        """
        Estimate chord progressions per section from chroma features.

        Uses a simple template-matching approach: for each time segment,
        compare the average chroma to major and minor triad templates.
        """
        try:
            chroma = librosa.feature.chroma_cqt(
                y=y, sr=sr, hop_length=self.hop_length
            )

            if not sections:
                chords = self._chords_for_segment(chroma, 0, chroma.shape[1], sr)
                return [{"section": "full", "chords": chords}]

            result: list[dict[str, Any]] = []
            for sec in sections:
                start_frame = librosa.time_to_frames(
                    sec["start"], sr=sr, hop_length=self.hop_length
                )
                end_frame = librosa.time_to_frames(
                    sec["end"], sr=sr, hop_length=self.hop_length
                )
                end_frame = min(end_frame, chroma.shape[1])
                if end_frame <= start_frame:
                    continue

                chords = self._chords_for_segment(chroma, start_frame, end_frame, sr)
                result.append({
                    "section": sec["label"],
                    "start": sec["start"],
                    "chords": chords,
                })

            return result

        except Exception as exc:
            self.log_error(f"Chord estimation failed: {exc}")
            return []

    def _chords_for_segment(
        self,
        chroma: np.ndarray,
        start_frame: int,
        end_frame: int,
        sr: int,
    ) -> list[str]:
        """
        Estimate up to 8 chords within a segment using template matching.

        Splits the segment into sub-windows and matches each against
        major and minor triad templates.
        """
        segment = chroma[:, start_frame:end_frame]
        total_frames = segment.shape[1]
        if total_frames == 0:
            return []

        # Split into roughly 2-second windows
        window_size = max(1, int(2.0 * sr / self.hop_length))
        n_windows = min(8, max(1, total_frames // window_size))
        actual_window = total_frames // n_windows

        # Major and minor triad templates (root, 3rd, 5th)
        major_template = np.zeros(12)
        major_template[[0, 4, 7]] = 1.0
        minor_template = np.zeros(12)
        minor_template[[0, 3, 7]] = 1.0

        chords: list[str] = []
        for i in range(n_windows):
            w_start = i * actual_window
            w_end = min(w_start + actual_window, total_frames)
            window_chroma = np.mean(segment[:, w_start:w_end], axis=1)

            best_score = -1.0
            best_chord = "N"  # no chord

            for root in range(12):
                maj = np.roll(major_template, root)
                mnr = np.roll(minor_template, root)

                score_maj = float(np.dot(window_chroma, maj))
                score_mnr = float(np.dot(window_chroma, mnr))

                if score_maj > best_score:
                    best_score = score_maj
                    best_chord = _NOTE_NAMES[root]
                if score_mnr > best_score:
                    best_score = score_mnr
                    best_chord = f"{_NOTE_NAMES[root]}m"

            # Deduplicate consecutive same chords
            if not chords or chords[-1] != best_chord:
                chords.append(best_chord)

        return chords

    # ------------------------------------------------------------------
    # Per-Stem Analysis
    # ------------------------------------------------------------------

    def _analyze_stems(self, stems_dir: str, sr: int) -> dict[str, Any]:
        """
        Analyze each stem independently for richer AudioDNA.

        Looks for vocals.wav, drums.wav, bass.wav, other.wav in *stems_dir*.
        """
        stems_path = Path(stems_dir)
        if not stems_path.is_dir():
            self.logger.warning("stems_dir_not_found", path=stems_dir)
            return {"available": list(STEM_NAMES), "analysis": {}}

        result: dict[str, Any] = {"available": [], "analysis": {}}

        for stem_name in STEM_NAMES:
            # Try common extensions
            stem_file = None
            for ext in (".wav", ".mp3", ".flac"):
                candidate = stems_path / f"{stem_name}{ext}"
                if candidate.is_file():
                    stem_file = candidate
                    break

            if stem_file is None:
                self.logger.debug("stem_not_found", stem=stem_name, dir=stems_dir)
                continue

            result["available"].append(stem_name)
            try:
                y_stem, _ = librosa.load(str(stem_file), sr=self.sr, mono=True)
                stem_analysis = self._analyze_single_stem(stem_name, y_stem, self.sr)
                result["analysis"][stem_name] = stem_analysis
                self.logger.info(
                    "stem_analyzed",
                    stem=stem_name,
                    rms=stem_analysis.get("energy", {}).get("rmsMean", 0),
                )
            except Exception as exc:
                self.log_error(f"Stem analysis failed for {stem_name}: {exc}")
                result["analysis"][stem_name] = {"error": str(exc)}

        return result

    def _analyze_single_stem(
        self, stem_name: str, y: np.ndarray, sr: int
    ) -> dict[str, Any]:
        """
        Analyze a single stem, adapting features by stem type.

        - vocals: energy, spectral centroid, onsets, pitch range estimate
        - drums: energy, onsets (critical), spectral contrast
        - bass: energy, spectral centroid (low-frequency focus)
        - other: energy, spectral, onsets
        """
        analysis: dict[str, Any] = {
            "energy": self._analyze_energy(y, sr),
            "onsets": self._detect_onsets(y, sr),
        }

        if stem_name == "vocals":
            analysis["spectral"] = {
                "centroidMean": round(
                    float(np.mean(
                        librosa.feature.spectral_centroid(
                            y=y, sr=sr, hop_length=self.hop_length
                        )[0]
                    )),
                    1,
                ),
            }
            # Rough vocal pitch range via harmonic component
            try:
                y_harmonic = librosa.effects.harmonic(y)
                pitches, magnitudes = librosa.piptrack(
                    y=y_harmonic, sr=sr, hop_length=self.hop_length
                )
                # Collect pitches where magnitude is significant
                pitch_values = pitches[magnitudes > np.median(magnitudes[magnitudes > 0])]
                pitch_values = pitch_values[pitch_values > 0]
                if len(pitch_values) > 0:
                    low_hz = float(np.percentile(pitch_values, 5))
                    high_hz = float(np.percentile(pitch_values, 95))
                    analysis["vocalRange"] = {
                        "lowHz": round(low_hz, 1),
                        "highHz": round(high_hz, 1),
                        "lowNote": librosa.hz_to_note(low_hz),
                        "highNote": librosa.hz_to_note(high_hz),
                    }
            except Exception:
                pass

        elif stem_name == "drums":
            analysis["spectral"] = {
                "contrastMean": [
                    round(float(v), 2)
                    for v in np.mean(
                        librosa.feature.spectral_contrast(
                            y=y, sr=sr, hop_length=self.hop_length
                        ),
                        axis=1,
                    )
                ],
            }

        elif stem_name == "bass":
            analysis["spectral"] = {
                "centroidMean": round(
                    float(np.mean(
                        librosa.feature.spectral_centroid(
                            y=y, sr=sr, hop_length=self.hop_length
                        )[0]
                    )),
                    1,
                ),
                "rolloffMean": round(
                    float(np.mean(
                        librosa.feature.spectral_rolloff(
                            y=y, sr=sr, hop_length=self.hop_length
                        )[0]
                    )),
                    1,
                ),
            }

        else:  # other
            analysis["spectral"] = self._analyze_spectral(y, sr)

        return analysis


# ======================================================================
# CLI Entry Point
# ======================================================================

async def _cli_main() -> None:
    """CLI entry point for audio analysis."""
    import argparse

    from ..utils.logging import setup_logging

    setup_logging("INFO")

    parser = argparse.ArgumentParser(
        description="Analyze an audio file and produce AudioDNA JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python -m src.agents.audio_analyst --input song.wav\n"
            "  python -m src.agents.audio_analyst --input song.mp3 --stems-dir ./stems\n"
            "  python -m src.agents.audio_analyst --input song.flac --output dna.json\n"
        ),
    )
    parser.add_argument(
        "--input", required=True, help="Path to input audio file"
    )
    parser.add_argument(
        "--stems-dir",
        default=None,
        help="Directory with pre-separated stems (vocals.wav, drums.wav, bass.wav, other.wav)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output JSON file path (default: print to stdout)",
    )
    parser.add_argument(
        "--sr",
        type=int,
        default=22050,
        help="Target sample rate for analysis (default: 22050)",
    )

    args = parser.parse_args()

    analyst = AudioAnalyst(sr=args.sr)

    try:
        dna = await asyncio.to_thread(
            analyst.analyze, args.input, stems_dir=args.stems_dir
        )

        dna = sanitize_for_json(dna)
        output_json = json.dumps(dna, indent=2, ensure_ascii=False)

        if args.output:
            out_path = Path(args.output)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(output_json, encoding="utf-8")
            logger.info("output_written", path=str(out_path))
            print(f"\nAudioDNA written to {out_path}")
        else:
            print("\n=== AudioDNA ===")
            print(output_json)

        # Summary
        print(f"\n--- Summary ---")
        print(f"  BPM:       {dna['bpm']['value']} (confidence: {dna['bpm']['confidence']})")
        print(f"  Key:       {dna['key']['label']} (confidence: {dna['key']['confidence']})")
        print(f"  Duration:  {dna['duration']}s")
        print(f"  Sections:  {len(dna['sections'])}")
        print(f"  Essentia:  {'yes' if dna['essentia'] else 'no (librosa fallback)'}")
        print(f"  Time:      {dna['processingTime']}s")

    except FileNotFoundError as e:
        logger.error("file_not_found", error=str(e))
        raise SystemExit(1)
    except AudioAnalysisError as e:
        logger.error("analysis_failed", error=str(e))
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(_cli_main())
