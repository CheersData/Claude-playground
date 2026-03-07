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

---

## Visione (6 mesi)

Coverage 100% su tutta l'infrastruttura core (ai-sdk, tiers, middleware). Testbook con >90% accuracy. CI/CD che blocca PR con test falliti. Zero regressioni su merge.

## Priorità operative (ordinate)

1. **[P0] Test suite critiche** — agent-runner.ts, tiers.ts, generate.ts (core AI infrastructure)
2. **[P1] Middleware coverage** — console-token.ts, analysis-cache.ts
3. **[P2] Testbook accuracy** — portare da 75% a >85% con nuovi casi di test

## Autonomia

- **L1 (auto)**: eseguire test, creare bug report, aggiungere test per codice esistente, fix test rotti
- **L2+ (escalation)**: modificare codice sorgente per rendere testabile, aggiungere dipendenze test
