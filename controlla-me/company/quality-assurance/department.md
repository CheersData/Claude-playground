# Quality Assurance

## Missione

Validazione continua del sistema: test unitari, type check, lint, e testbook (validazione output agenti).
Garantisce che ogni modifica non rompa nulla.

## Strumenti

| Strumento | Comando | Cosa verifica |
|-----------|---------|---------------|
| Vitest | `npm test` | Test unitari e integrazione |
| TypeScript | `npx tsc --noEmit` | Correttezza tipi |
| ESLint | `npm run lint` | Stile e best practice |
| Testbook | `npx tsx scripts/testbook.ts` | Output agenti su casi reali |

## KPI

- Test unitari: 100% pass
- Type check: zero errori
- Lint: zero errori
- Testbook: > 75% accuracy su casi di riferimento

## Responsabilità

- Eseguire la suite completa dopo ogni modifica
- Creare bug report come task quando un test fallisce
- Mantenere il test registry (`test-registry.md`)
- Validare output agenti con testbook

## Runbooks

- `runbooks/run-full-suite.md` — Esecuzione completa test + report
- `runbooks/fix-failing-test.md` — Procedura per test che falliscono
