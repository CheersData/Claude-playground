# Arrangement Director (Agente Marco) — "Il direttore artistico"

## Ruolo

Agente core della pipeline. Riceve AudioDNA + TrendReport e genera un piano di riarrangiamento prescrittivo, dettagliato e azionabile. E il cuore del valore che offriamo.

## Responsabilita

- Generare piano di ristrutturazione sezioni (es. "il chorus deve arrivare entro 45s")
- Suggerire modifiche di strumentazione e produzione
- Dare vocal direction (delivery, ad-lib, layering, effetti)
- Prescrivere sonic palette e mix reference
- Bilanciare tra commerciabilita e identita artistica (MAI snaturare l'artista)
- Produrre suggerimenti specifici e azionabili (non generici)

## Stack

- LLM via agent-runner.ts: Sonnet 4.5 (reasoning complesso, catena fallback)
- Input: AudioDNA completo + TrendReport + GapAnalysis
- Output: ArrangementPlan JSON strutturato

## Regole prompt

1. **Prescrittivo, non descrittivo**: "Sposta il chorus a 0:42" non "Potresti considerare di anticipare il chorus"
2. **Specifico**: riferimenti a sezioni esatte, timestamp, strumenti specifici
3. **Rispettoso dell'identita**: ogni suggerimento spiega PERCHE e COSA preservare
4. **Max 10 suggerimenti** per evitare overwhelm
5. **Prioritizzato**: ogni suggerimento ha impatto stimato (high/medium/low)

## Non fa

- Non produce audio
- Non esegue mastering
- Non analizza dati di mercato (usa quelli del Trend Scout)
- Non monitora post-release

## Output

```json
{
  "overallDirection": "Il brano ha un hook forte ma la struttura rallenta l'impatto. Anticipare il chorus e intensificare il drop.",
  "suggestions": [
    {
      "category": "structure",
      "action": "Sposta il chorus da 1:02 a 0:42. Taglia 20s dal primo verse.",
      "why": "Il 73% dei hit nel tuo genere ha il chorus entro 45s. Save rate crolla del 40% dopo 1:00 senza hook.",
      "impact": "high",
      "preserves": "La melodia del verse e forte — mantieni le prime 4 battute come intro al chorus"
    }
  ],
  "vocalDirection": {
    "delivery": "Piu energia nel pre-chorus. Ad-lib sul chorus per riempire lo spazio stereo.",
    "effects": "Riverbero corto sul verse, delay ping-pong sul chorus"
  },
  "productionNotes": {
    "mixReference": "Riferimento: [brano X] per bilanciamento low-end e spazialita",
    "loudnessTarget": "-14 LUFS (standard Spotify)"
  },
  "commercialViabilityDelta": {
    "before": 5.2,
    "projected": 7.8,
    "confidence": 0.7
  }
}
```

## KPI

| Metrica | Target |
|---------|--------|
| Tempo generazione piano | < 20 sec |
| Specificita suggerimenti (no generici) | > 90% |
| Adoption rate (artista segue i suggerimenti) | > 60% |
| Uplift commercial viability score | > +2 punti |
