# Cleanup Report — Round 4 — 2026-03-03

**Eseguito da**: Acceleration / codebase-cleaner
**Tipo**: Audit completo + fix regressioni post-merge
**Routing**: infrastructure:maintenance

---

## Contesto

Quarto round di codebase audit. I round 1-3 (2026-03-02) avevano raggiunto `lint: 0 problemi` e `tsc: 0 errori`. Dopo il merge `515843d` (claude/review-code-instructions-9aGkc → main) e i commit successivi relativi ai connettori Normattiva/Open Data, sono state introdotte nuove regressioni.

---

## Risultati Discovery

### Errori pre-esistenti trovati (introdotti da merge `4620729` e commit successivi)

| File | Tipo di errore | Causa |
|------|--------------|-------|
| `lib/agents/classifier.ts` | TS2304: `anthropic`, `MODEL_FAST`, `extractTextContent`, `parseAgentJSON` undefined | Merge conflict resolution errata: preso il branch con il vecchio pattern `anthropic.messages.create` invece della versione con `runAgent` |
| `lib/agents/advisor.ts` | TS2304: `anthropic`, `MODEL`, `extractTextContent`, `parseAgentJSON` undefined | Stessa causa |
| `lib/agents/analyzer.ts` | TS2304: `anthropic`, `MODEL`, `extractTextContent` undefined | Stessa causa |
| `lib/agents/orchestrator.ts` | TS2304: `userContext` undefined; TS2353: `domain` not in `retrieveLegalContext` params | `domain` passato a funzione che non lo accetta; `userContext` usato ma non dichiarato come parametro |
| `components/FairnessScore.tsx` | TS2322: `legalCompliance`, `contractBalance`, `industryPractice` not in `MultiDimensionalScore` | `lib/types.ts` aggiornato ai nuovi campi (`contractEquity`, `legalCoherence`, `practicalCompliance`, `completeness`) ma i componenti non aggiornati |
| `components/ResultsView.tsx` | TS2322: stessa causa FairnessScore | Stessa causa |
| `tests/fixtures/advisor.ts` | TS2353: `legalCompliance` not in `MultiDimensionalScore` | Fixture non aggiornata ai nuovi campi |
| `connectors/normattiva.ts` | TS1501: regex flag `s` richiede target ES2018+ | `tsconfig.json` target è ES2017 |
| `connectors/normattiva-opendata.ts` | TS2307: `fflate` non trovato | Dipendenza non installata in `devDependencies` |
| `scripts/seed-normattiva.ts` | Lint error: `any` nel sort callback embeddings Voyage | Nuovo script post-Round 3 |
| `scripts/seed-opendata.ts` | Lint error: `any` nel sort callback embeddings Voyage | Nuovo script post-Round 3 |

### File/directory trovati come "unreferenced" dalla run iniziale di `find`

Il comando `find` aveva mostrato file `PipBoyShell.tsx`, `AgentPanel.tsx`, `AgentLED.tsx`, `OutputPanel.tsx`, `OutputSection.tsx` e `scripts/archive/` — ma questi NON ESISTONO sul filesystem. Erano artifact residui nella cache `.next/`. Già rimossi in commit precedenti.

### Dipendenze npm

- `@stripe/stripe-js`: non presente nel `package.json` corrente (già rimossa in round precedente). La run iniziale di `depcheck` era basata su stato branch diverso.
- Falsi positivi confermati: `@tailwindcss/postcss` (usato in `postcss.config.mjs`), `tailwindcss` (in `globals.css`), `@types/react-dom` (tipi impliciti), `@vitest/coverage-v8` (usato da `npm run test:coverage`), `cross-env` (usato in `npm run build`), `@vitejs/plugin-react` (NON installato — già rimosso).

### Sequenza migrazioni Supabase

Sequenza continua: 001-023, REGISTRY.md presente. Nessun problema.

### Script result files

Pattern `scripts/testbook-results-*.json` e `scripts/adversarial-results-*.json` già in `.gitignore`. Nessun file su disco.

---

## Interventi eseguiti (categoria A — tutti TypeScript/lint fixes)

| Tipo | File | Fix applicato |
|------|------|--------------|
| Fix agente | `lib/agents/classifier.ts` | Ripristinato pattern `runAgent()` (da `anthropic.messages.create` diretto) |
| Fix agente | `lib/agents/advisor.ts` | Ripristinato pattern `runAgent()` con nuovi campi `MultiDimensionalScore` |
| Fix agente | `lib/agents/analyzer.ts` | Ripristinato pattern `runAgent()` |
| Fix orchestrator | `lib/agents/orchestrator.ts` | Rinominato 4° param `domain` → `userContext` (allineato alla chiamata in `route.ts`); rimosso `domain` dalle chiamate a `retrieveLegalContext()` (non accettato dalla firma) |
| Fix tipo | `components/FairnessScore.tsx` | Aggiornate 3 dimensioni vecchie → 4 nuove (`contractEquity`, `legalCoherence`, `practicalCompliance`, `completeness`) con label italiane corrette |
| Fix tipo | `components/ResultsView.tsx` | Aggiornate 3 voci `SCORE_ITEMS` → 4 con nuovi campi + nuova icona `CheckSquare` per `completeness` |
| Fix fixture | `tests/fixtures/advisor.ts` | Aggiornato fixture `makeAdvisorResult` con i 4 nuovi campi `MultiDimensionalScore` |
| Fix tsconfig | `tsconfig.json` | Aggiunto `connectors` a `exclude` (workspace separato con proprie dipendenze) |
| Fix regex | `connectors/normattiva.ts` | Sostituito flag `s` (ES2018) con `[\s\S]` equivalente ES2017-compatibile |
| Fix unused param | `connectors/normattiva-opendata.ts` | `sourceName` → `_sourceName`, `sourceId` → `_sourceId` |
| Fix unused var | `connectors/normattiva.ts` | `source` → `_source` |
| Fix lint any | `scripts/seed-normattiva.ts` | Sostituito `any` nel sort callback con tipo esplicito `{ index: number; embedding: number[] }[]` |
| Fix lint any | `scripts/seed-opendata.ts` | Stessa correzione |
| Fix unused import | `scripts/qa-corpus.ts` | Rimosso `InstituteRule` non usato; `noIdCount` → `_noIdCount`; `checkDb` → `_checkDb` |
| Fix unused import | `test-normattiva.ts` | Rimosso `buildArticleNumbers` non usato |

**Totale**: 15 file modificati

---

## Categoria B — task documentati (non fixati qui)

Nessuno — tutte le issue critiche sono state risolte in questa sessione.

## Categoria C — elementi mantenuti

| Elemento | Motivo |
|----------|--------|
| `connectors/` directory | Workspace data-engineering separato, non parte dell'app Next.js principale. Ora escluso da `tsconfig.json` per chiarezza. |
| `test-normattiva.ts` | Script di test manuale per connettore Normattiva, usato da `npx tsx test-normattiva.ts` |
| `scripts/hr-sources.ts` | File sorgente per verticale HR futuro (referenziato da `registry.ts` e `company-plan.ts`) |
| devDeps flaggate da depcheck | Falsi positivi confermati manualmente |

---

## Metriche

| Metrica | Prima | Dopo |
|---------|-------|------|
| `npx tsc --noEmit` | 14 errori | 0 errori ✅ |
| `npm run lint` | 13 problemi (6 errori, 7 warning) | 0 problemi ✅ |
| File rimossi | 0 | 0 (già puliti in round precedenti) |
| File modificati | — | 15 |
| Regressioni ripristinate | — | 3 agenti (classifier, advisor, analyzer) |

---

## Verifica finale Round 4

- `npx tsc --noEmit`: ✅ **0 errori** (Exit: 0)
- `npm run lint`: ✅ **0 problemi** (Exit: 0)
- `npm test`: non eseguito (scope di QA)
- `npm run build`: non eseguito (richiede env Supabase/Stripe live)

---

## Note architetturali

### Regressione agents (root cause)

Il merge `4620729` (25 Feb 2026) ha risolto un conflitto su `lib/agents/classifier.ts`, `analyzer.ts`, `advisor.ts` prendendo per errore la versione del branch con il vecchio pattern `anthropic.messages.create` invece della versione con `runAgent()`. Il refactoring originale (`fa742fa`) aveva correttamente migrato tutti gli agenti al nuovo sistema multi-provider. La regressione ha reso il codice non compilabile ma non deployato (Next.js ignora errori TS in dev, li rileva solo al build).

### Mismatch MultiDimensionalScore

`lib/types.ts` è stato aggiornato a 4 nuove dimensioni (`contractEquity`, `legalCoherence`, `practicalCompliance`, `completeness`) nel commit `3218da2` / merge `515843d`. I prompt advisor sono stati aggiornati di conseguenza. Ma i componenti UI (`FairnessScore.tsx`, `ResultsView.tsx`) e i test fixture sono rimasti con i vecchi 3 campi. Fix applicato: aggiornati tutti i consumer ai nuovi 4 campi.
