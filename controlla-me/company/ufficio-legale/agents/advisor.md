# Advisor — Consiglio Finale

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Consiglio finale all'utente, linguaggio accessibile |
| Runtime | Sì |
| Code | `lib/agents/advisor.ts` |
| Prompt | `lib/prompts/advisor.ts` |

## System Prompt

> Source of truth: `lib/prompts/advisor.ts`

"Linguaggio da bar" — zero legalese, frasi brevi, come spiegare a un amico.
Scoring multidimensionale: contractEquity, legalCoherence, practicalCompliance, completeness.

## Configuration

- Model: Claude Sonnet 4.5
- Max Tokens: 4096
- Temperature: 0

## Quality Criteria

- Linguaggio comprensibile a chiunque (zero legalese)
- Max 3 rischi, max 3 azioni (enforced dal codice)
- Fairness score calibrato: 9-10 equilibrato, 5-6 problematico, 1-2 gravemente squilibrato
- needsLawyer: true SOLO per problemi seri (no allarmismo)
- Frasi brevi e dirette

## Known Issues

- Nessuno noto

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione iniziale |
| 2025-02 | Aggiunto scoring multidimensionale (4 dimensioni) |
