# Corpus Agent — Q&A Legislativo

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Risponde a domande sul corpus legislativo |
| Runtime | Sì |
| Code | `lib/agents/corpus-agent.ts` |
| Prompt | `lib/prompts/corpus-agent.ts` |

## System Prompt

> Source of truth: `lib/prompts/corpus-agent.ts`

Riceve articoli dal RAG retrieval e risponde alla domanda ORIGINALE dell'utente.
Output: answer, citedArticles (con ID verificabili), confidence, followUp.

## Configuration

- Model: Claude Haiku 4.5
- Max Tokens: 4096
- Temperature: 0.2

## Quality Criteria

- Risponde alla domanda ORIGINALE (non alla riformulazione)
- Cita articoli con ID verificabili
- Confidence calibrato
- followUp pertinente e utile

## Known Issues

- Nessuno noto

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione con Gemini Flash |
| 2025-02 | Migrato a Haiku 4.5 |
