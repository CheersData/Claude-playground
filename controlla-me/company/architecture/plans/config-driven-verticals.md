# Piano: Sistema Config-Driven per Verticali

> Data: 2026-03-24 | Task: e07372b9 | Effort stimato: ~15 giorni

## Problema

Pipeline multi-verticale non scala. Ogni nuovo verticale richiede: page.tsx, API routes, prompts, agent configs, tipi. 3 verticali esistenti (legal, medical, music) hanno architetture completamente diverse.

## Design

### VerticalConfig esteso

Estendere `lib/verticals/config.ts` con:
- `pipeline`: PipelineConfig (runtime: "typescript-agents" | "subprocess", stages[])
- `input`: InputConfig (acceptedTypes, maxFileSize, resultsTable)
- `outputSchema`: OutputSchemaConfig (scoringDimensions, maxRisks, maxActions)
- `features`: FeatureFlags (corpusChat, documentAnalysis, deepSearch, billing)
- `agentOverrides`: per-vertical model/token overrides

### 9 Step di Implementazione

| Step | Cosa | Effort | Dipendenze |
|------|------|--------|------------|
| 1 | Estendere VerticalConfig interface | 1g | - |
| 2 | Prompt registry parametrizzato | 2g | - |
| 3 | AgentName estensibile (da union a string + costanti) | 0.5g | - |
| 4 | Generic pipeline runner | 3g | 1,2,3 |
| 5 | Dynamic API route /api/v/[verticalId]/analyze | 1.5g | 4 |
| 6 | Dynamic UI page /v/[verticalId] | 3g | 1 |
| 7 | Migrare verticale legal | 1g | 4,5 |
| 8 | Migrare verticale music | 1g | 4,5 |
| 9 | DB storage per custom verticals (Phase 2) | 2g | tutti |

### Rischi

1. Orchestrator legal ha HR detection intertwined → hook per-vertical
2. TypeScript types domain-specific → types per-vertical, runner usa unknown
3. Music Python subprocess ≠ TS agents → dual runtime nel runner
4. Test assumono agent names hardcoded → backward-compatible exports

### File chiave

- `lib/verticals/config.ts` — fondazione
- `lib/pipeline/runner.ts` — nuovo, generic pipeline
- `lib/prompts/registry.ts` — nuovo, prompt parametrizzati
- `lib/models.ts` — AgentName estensibile
- `app/api/v/[verticalId]/analyze/route.ts` — nuovo, dynamic route
- `app/v/[verticalId]/page.tsx` — nuovo, dynamic UI
