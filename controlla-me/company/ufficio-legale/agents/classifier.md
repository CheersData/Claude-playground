# Classifier — Classificazione Documento

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Classificazione tipo, sotto-tipo, istituti giuridici |
| Runtime | Sì |
| Code | `lib/agents/classifier.ts` |
| Prompt | `lib/prompts/classifier.ts` |

## System Prompt

> Source of truth: `lib/prompts/classifier.ts`

Identifica: documentType, documentSubType, parties, jurisdiction, applicableLaws, relevantInstitutes, legalFocusAreas, keyDates, summary, confidence.

## Configuration

- Model: Claude Haiku 4.5
- Max Tokens: 4096
- Temperature: 0

## Quality Criteria

- documentType corretto > 90%
- relevantInstitutes completi (es. "vendita_a_corpo", "caparra_confirmatoria")
- applicableLaws con articoli specifici
- confidence calibrato (non sempre 0.9)
- JSON valido sempre

## Known Issues

- Nessuno noto

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione iniziale |
| 2025-02 | Aggiunta relevantInstitutes e legalFocusAreas |
