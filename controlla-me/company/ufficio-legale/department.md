# Ufficio Legale

## Missione

7 agenti AI che democratizzano la comprensione legale. Caso d'uso dimostrativo #1 di Poimandres. Punto di vista: **sempre dalla parte debole** (consumatore, conduttore, lavoratore).

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

---

## Visione (6 mesi)

Analisi legale best-in-class Italia con almeno 2 verticali (contratti generici + contratti lavoro). Pipeline < 60s, accuracy > 95%, zero sentenze inventate. Testbook accuracy > 90%.

## Priorità operative (ordinate)

1. **[P0] Prompt HR operativi** — adattare e rendere operativi i prompt per contratti di lavoro (analista, investigatore, consigliere)
2. **[P1] Pipeline stabile per demo creator** — preparare un caso d'uso end-to-end stabile che dimostri il valore per creator/developer
3. **[P2] Verticale tax** — preparare i prompt e la pipeline per il verticale fiscale/commercialista

## Autonomia

- **L1 (auto)**: tuning prompt, configurazione modelli/catene, fix output JSON, aggiornamento quality criteria
- **L2+ (escalation)**: nuovo agente nella pipeline, cambio architettura pipeline, nuovo verticale (L3 boss)
