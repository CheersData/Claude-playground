# Ufficio Legale

## Missione

Gestione e ottimizzazione dei 7 agenti runtime che analizzano documenti legali per i cittadini.
Punto di vista: **sempre dalla parte debole** (consumatore, conduttore, lavoratore).

## Agenti

| Agente | Ruolo | Runtime | Modello | File codice | File prompt |
|--------|-------|---------|---------|-------------|-------------|
| leader | Router console | Sì | Haiku 4.5 | `lib/agents/leader.ts` | `lib/prompts/leader.ts` |
| classifier | Classificazione documento | Sì | Haiku 4.5 | `lib/agents/classifier.ts` | `lib/prompts/classifier.ts` |
| analyzer | Analisi rischi | Sì | Sonnet 4.5 | `lib/agents/analyzer.ts` | `lib/prompts/analyzer.ts` |
| investigator | Ricerca legale (web_search) | Sì | Sonnet 4.5 | `lib/agents/investigator.ts` | `lib/prompts/investigator.ts` |
| advisor | Consiglio finale | Sì | Sonnet 4.5 | `lib/agents/advisor.ts` | `lib/prompts/advisor.ts` |
| corpus-agent | Q&A corpus legislativo | Sì | Haiku 4.5 | `lib/agents/corpus-agent.ts` | `lib/prompts/corpus-agent.ts` |
| question-prep | Riformulazione domande | Sì | Haiku 4.5 | `lib/agents/question-prep.ts` | `lib/prompts/question-prep.ts` |

## Pipeline

```
Documento → Classifier → RAG Retrieval → Analyzer → RAG Retrieval → Investigator → Advisor
```

```
Domanda utente → Question-Prep → RAG Retrieval → Corpus-Agent
```

## KPI

- Tempo pipeline completa: < 90s
- Accuracy classificazione: > 90%
- Nessuna sentenza inventata (investigator)
- Fairness score calibrato (advisor)
- JSON output valido: 100%

## Responsabilità

- Manutenzione prompt in `lib/prompts/`
- Configurazione modelli in `lib/models.ts` (sezione AGENT_MODELS)
- Configurazione catene fallback in `lib/tiers.ts`
- Quality criteria per ogni agente (vedi `agents/*.md`)

## Cosa NON fare

- NON modificare `lib/ai-sdk/` (infrastruttura condivisa)
- NON modificare `lib/company/` (competenza Process Designer)
- NON aggiungere dipendenze npm senza Architecture
