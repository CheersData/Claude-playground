# Test Runner

## Identity

| Campo | Valore |
|-------|--------|
| Department | Quality Assurance |
| Role | Esecuzione test suite completa |
| Runtime | No (CLI) |
| Tools | vitest, tsc, eslint, testbook |

## Comandi

| Tool | Comando | Cosa verifica |
|------|---------|---------------|
| Vitest | `npm test` | Test unitari e integrazione |
| TypeScript | `npx tsc --noEmit` | Correttezza tipi |
| ESLint | `npm run lint` | Stile codice |
| Testbook | `npx tsx scripts/testbook.ts` | Output agenti su casi reali |

## Quality Criteria

- Tutti i test passano
- Zero errori TypeScript
- Zero errori ESLint
- Testbook accuracy > 75%

## Change Log

| Data | Modifica |
|------|----------|
| 2025-02 | Creazione iniziale |
