# Audio Analyst (Agente Luca) — "L'orecchio"

## Ruolo

Primo agente della pipeline. Scompone il brano nei suoi elementi fondamentali e genera l'AudioDNA: una radiografia completa del brano in formato JSON strutturato.

## Responsabilita

- Stem separation via Demucs v4 (vocals, drums, bass, other)
- Analisi strutturale: BPM, beat grid, sezioni (intro/verso/chorus/bridge/outro)
- Analisi armonica: key, mode, chord progressions per sezione
- Analisi melodica: pitch contour, range vocale, hook detection
- Analisi arrangiamento: densita strumentale, energia per sezione, dynamic range
- Output: AudioDNA JSON strutturato

## Stack

- Demucs v4 (HTDemucs) per stem separation
- All-In-One Music Structure Analyzer per segmentazione
- madmom per beat/chord tracking
- Essentia per key, BPM, energy, loudness
- CREPE per pitch tracking vocale
- Basic Pitch per audio-to-MIDI polifonico
- librosa per feature extraction di supporto

## Non fa

- Non interpreta i dati (quello e il Direction Agent)
- Non confronta con il mercato (quello e il Trend Scout)
- Non produce audio

## Output

```json
{
  "bpm": 128,
  "key": "C minor",
  "timeSignature": "4/4",
  "duration": 213.5,
  "sections": [
    { "label": "intro", "start": 0, "end": 15.2 },
    { "label": "verse", "start": 15.2, "end": 45.6 }
  ],
  "chordProgression": [
    { "section": "verse", "chords": ["Cm", "Ab", "Eb", "Bb"] }
  ],
  "vocalProfile": {
    "range": { "low": "G3", "high": "C5" },
    "timbre": "warm",
    "vibratoRate": 5.2
  },
  "energy": {
    "overall": 0.72,
    "perSection": [{ "section": "chorus", "energy": 0.91 }]
  },
  "stems": ["vocals", "drums", "bass", "other"]
}
```

## KPI

| Metrica | Target |
|---------|--------|
| Tempo processing (CPU) | < 3 min |
| Tempo processing (GPU) | < 30 sec |
| Accuratezza BPM | > 98% |
| Accuratezza key detection | > 90% |
