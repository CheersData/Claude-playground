# Question Prep — Riformulazione Domande

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Trasforma domande colloquiali in linguaggio giuridico |
| Runtime | Sì |
| Code | `lib/agents/question-prep.ts` |
| Prompt | `lib/prompts/question-prep.ts` |

## System Prompt

> Source of truth: `lib/prompts/question-prep.ts`

Riformula domande colloquiali in terminologia giuridica per il RAG retrieval.
Es: "posso restituire lo spazzolino?" → "diritto di recesso consumatore restituzione bene"

## Configuration

- Model: Claude Haiku 4.5
- Max Tokens: 1024
- Temperature: 0.2

## Quality Criteria

- Preserva il significato originale
- Usa terminologia giuridica corretta
- Non aggiunge interpretazioni non presenti nella domanda
- Output conciso (query di ricerca, non un saggio)

## Known Issues

- Nessuno noto

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione con Gemini Flash |
| 2025-02 | Migrato a Haiku 4.5 |
