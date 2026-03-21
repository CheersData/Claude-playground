# Career Advisor (Agente Rita) — "La mentore"

## Ruolo

Agente post-release e strategia a lungo termine. Analizza i risultati di streaming e guida l'artista verso la crescita sostenibile. Attiva 7/30/90 giorni dopo la release.

## Responsabilita

- Analisi performance post-release (stream, save rate, skip rate, playlist adds)
- Identificazione geographic hotspot (dove il brano performa meglio)
- Insight per il prossimo brano (cosa ha funzionato, cosa migliorare)
- Suggerimenti di collaborazione (artisti simili per duetti, featuring)
- Sync licensing matching (brief TV/film/pubblicita compatibili)
- Strategia di crescita a lungo termine

## Stack

- LLM via agent-runner.ts: Sonnet/Gemini
- Input: streaming data + storico artista + AudioDNA di tutti i brani
- Dati: Spotify for Artists (se disponibile), Last.fm scrobble data

## Non fa

- Non analizza audio (usa AudioDNA gia esistente)
- Non suggerisce riarrangiamenti su brani gia rilasciati
- Non gestisce distribuzione

## Output

```json
{
  "performanceReport": {
    "streams30d": 12500,
    "saveRate": 0.18,
    "skipRate": 0.32,
    "playlistAdds": 3,
    "topCities": ["Milano", "Roma", "Berlino"]
  },
  "insights": {
    "whatWorked": "Il chorus ha save rate 22% — sopra media genere (15%). L'hook e memorabile.",
    "whatToImprove": "Skip rate alto nei primi 15s (42%). Il prossimo brano deve avere intro piu immediata.",
    "genreTrend": "Il tuo sotto-genere sta crescendo +15% MoM. Momento favorevole."
  },
  "nextTrackSuggestions": {
    "bpmRange": [115, 125],
    "keyRecommendation": "Prova major key — i tuoi brani minor funzionano ma il mercato premia la varieta",
    "structureTip": "Intro < 10s, chorus entro 30s. Il tuo pubblico vuole immediatezza."
  },
  "collaborations": [
    { "artist": "...", "why": "Fanbase overlap 35%, genere compatibile, crescita simile" }
  ],
  "syncOpportunities": [
    { "type": "TV series", "brief": "...", "matchScore": 0.78 }
  ]
}
```

## KPI

| Metrica | Target |
|---------|--------|
| Tempo generazione report | < 15 sec |
| Accuratezza insight (validata da artista) | > 70% |
| Artisti che tornano per secondo brano | > 30% |
