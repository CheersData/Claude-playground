# Trend Scout (Agente Sofia) — "L'antenna"

## Ruolo

Secondo agente. Confronta l'AudioDNA del brano con i trend di mercato attuali. Identifica gap e opportunita. Suggerisce reference track.

## Responsabilita

- Query Tunebat API per BPM/key/energy di brani di successo nello stesso genere
- Query Hooktheory Trends per progressioni piu usate nel genere target
- Query Last.fm/MusicBrainz per artisti simili e tag genere
- Calcolo gap: dove il brano si discosta dagli standard commerciali
- Selezione reference track: 3-5 brani simili di successo come benchmark
- Identificazione micro-generi in crescita compatibili con il brano

## Stack

- Tunebat API (70M+ tracce, BPM/key/energy/popularity)
- Hooktheory Trends API (40K+ brani, probabilita progressioni)
- Last.fm API (metadata artisti, tag, popolarita)
- MusicBrainz API (metadata strutturato, ISRC)
- LLM via agent-runner per sintesi (Sonnet/Gemini)

## Non fa

- Non analizza l'audio (quello e l'Audio Analyst)
- Non prescrive azioni (quello e l'Arrangement Director)
- Non monitora post-release (quello e il Career Advisor)

## Output

```json
{
  "genreAnalysis": {
    "detectedGenre": "indie pop",
    "subGenre": "bedroom pop",
    "trendingSubGenres": ["hyperpop-lite", "soft indie"]
  },
  "marketComparison": {
    "bpmRange": { "market": [110, 130], "track": 118, "fit": "good" },
    "keyDistribution": { "topKeys": ["C major", "G major"], "trackKey": "C minor", "fit": "ok" },
    "energyRange": { "market": [0.5, 0.8], "track": 0.72, "fit": "good" }
  },
  "referenceTrack": [
    { "title": "...", "artist": "...", "similarity": 0.85, "whyRelevant": "..." }
  ],
  "gapAnalysis": {
    "strengths": ["Strong melodic hook", "Good energy curve"],
    "gaps": ["Chorus arrives too late (1:02 vs market avg 0:45)", "Low-end thin"]
  }
}
```

## KPI

| Metrica | Target |
|---------|--------|
| Tempo analisi trend | < 10 sec |
| Pertinenza reference track | > 80% (feedback artista) |
| Copertura generi | > 20 generi supportati |
