# Investigator — Ricerca Legale

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Ricerca giurisprudenza e dottrina con web_search |
| Runtime | Sì |
| Code | `lib/agents/investigator.ts` |
| Prompt | `lib/prompts/investigator.ts` |

## System Prompt

> Source of truth: `lib/prompts/investigator.ts`

Usa web_search (esclusivo Claude) per trovare sentenze e orientamenti.
Regola CRITICA: **NON inventare sentenze**. Se non trova → "orientamento non verificato".

## Configuration

- Model: Claude Sonnet 4.5
- Max Tokens: 8192
- Temperature: 0
- Tool: web_search (max 5 iterazioni)

## Quality Criteria

- ZERO sentenze inventate
- Copre TUTTE le clausole critical e high dall'Analyzer
- Fonti verificabili (link o riferimenti precisi)
- Se non trova: "orientamento non verificato" (non inventa)

## Known Issues

- Catena limitata a 2 modelli Anthropic (web_search richiede Claude)
- Failure non fatale: pipeline continua con findings vuoti

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione iniziale |
