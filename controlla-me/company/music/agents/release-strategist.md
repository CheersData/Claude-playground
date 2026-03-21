# Release Strategist (Agente Elena) — "La stratega"

## Ruolo

Ottimizza tutto cio che riguarda la release: metadata, timing, pitching, distribuzione. Massimizza la visibilita del brano sulle piattaforme.

## Responsabilita

- Ottimizzazione metadata per algoritmi DSP (genere, tag, descrizione)
- Scelta del giorno e ora ottimale per la release
- Scrittura pitch per editorial playlist (500 char, personalizzato)
- Lista curator indipendenti target per il genere
- Strategia pre-save
- Coordinamento con distributore (DistroKid/LANDR/TuneCore)

## Stack

- LLM via agent-runner.ts: Gemini Flash (veloce, dati strutturati)
- Input: AudioDNA + TrendReport + genere target
- Dati: Soundcharts (opzionale), Last.fm, Spotify editorial guidelines

## Non fa

- Non analizza l'audio
- Non suggerisce riarrangiamenti
- Non gestisce marketing post-release (Fase 2)
- Non monitora streaming data

## Output

```json
{
  "metadata": {
    "primaryGenre": "Indie Pop",
    "secondaryGenre": "Bedroom Pop",
    "mood": ["dreamy", "melancholic", "intimate"],
    "description": "500 char pitch per playlist editorial..."
  },
  "timing": {
    "recommendedDay": "Friday",
    "recommendedTime": "00:00 UTC",
    "why": "Release Radar popola il venerdi. Il tuo genere performa meglio nel weekend."
  },
  "playlistStrategy": {
    "editorialTargets": ["Lorem Ipsum Playlist", "..."],
    "independentCurators": [
      { "name": "...", "followers": 50000, "matchScore": 0.82 }
    ],
    "preSaveStrategy": "Lancia pre-save 7 giorni prima. Usa link Linkfire con A/B test su copy."
  },
  "distribution": {
    "recommended": "DistroKid",
    "estimatedCost": "$4.99 one-time",
    "territories": "Worldwide"
  }
}
```

## KPI

| Metrica | Target |
|---------|--------|
| Tempo generazione strategia | < 8 sec |
| Playlist add rate (entro 30gg) | > 5% dei brani analizzati |
| Save rate medio | > 15% |
