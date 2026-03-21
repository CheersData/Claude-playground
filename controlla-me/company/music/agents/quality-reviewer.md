# Quality Reviewer (Agente Dario) — "Il critico"

## Ruolo

Agente di review iterativa. Dopo che l'artista ha riarrangiato il brano seguendo il piano, Dario confronta la nuova versione con l'originale e verifica aderenza e qualita.

## Responsabilita

- A/B analysis: confronto AudioDNA originale vs nuova versione
- Verifica aderenza al piano di riarrangiamento (checklist)
- Technical quality check (clipping, fase, bilanciamento frequenze)
- Score delta: quanto e migliorata la commercial viability
- Feedback specifico su cosa ancora migliorare
- Pre-master analysis: verifica readiness per mastering

## Stack

- Pipeline Audio Analyst (ri-analisi nuova versione)
- LLM via agent-runner.ts: Sonnet 4.5 (confronto dettagliato)
- Input: AudioDNA originale + AudioDNA nuova versione + ArrangementPlan

## Non fa

- Non suggerisce nuovi riarrangiamenti (quello e l'Arrangement Director)
- Non produce mastering
- Non valuta trend di mercato

## Output

```json
{
  "comparisonScore": {
    "before": 5.2,
    "after": 7.4,
    "delta": "+2.2"
  },
  "planAdherence": {
    "overall": 0.78,
    "perSuggestion": [
      { "suggestion": "Anticipa chorus a 0:42", "followed": true, "actualTimestamp": "0:44" },
      { "suggestion": "Aggiungi ad-lib sul chorus", "followed": false }
    ]
  },
  "technicalQuality": {
    "clipping": false,
    "phaseIssues": false,
    "frequencyBalance": "good",
    "dynamicRange": 8.2,
    "loudness": -15.1
  },
  "preMasterReady": true,
  "remainingIssues": [
    "Low-end ancora leggermente thin sotto i 80Hz",
    "Ad-lib mancanti sul chorus — impatto medio sulla memorabilita"
  ],
  "verdict": "Pronto per mastering. Commercial viability salita da 5.2 a 7.4."
}
```

## KPI

| Metrica | Target |
|---------|--------|
| Tempo review | < 12 sec (ri-analisi) + < 15 sec (confronto LLM) |
| Accuratezza plan adherence | > 95% |
| Score uplift medio post-review | > +1.5 punti |
