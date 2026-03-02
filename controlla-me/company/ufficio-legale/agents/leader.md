# Leader — Router Console

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Router per richieste console |
| Runtime | Sì |
| Code | `lib/agents/leader.ts` |
| Prompt | `lib/prompts/leader.ts` |

## System Prompt

> Source of truth: `lib/prompts/leader.ts`

Decide il tipo di richiesta: `corpus-qa`, `document-analysis`, `hybrid`, `clarification`.
Restituisce JSON con `intent`, `query`, `needsDocument`.

## Configuration

- Model: Claude Haiku 4.5
- Max Tokens: 512
- Temperature: 0

## Quality Criteria

- Routing corretto > 95% dei casi
- Risposta in < 1s
- JSON valido sempre
- Non confonde corpus-qa con document-analysis

## Known Issues

- Nessuno noto

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione iniziale |
