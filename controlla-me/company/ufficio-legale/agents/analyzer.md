# Analyzer — Analisi Rischi

## Identity

| Campo | Valore |
|-------|--------|
| Department | Ufficio Legale |
| Role | Analisi clausole rischiose, punto di vista parte debole |
| Runtime | Sì |
| Code | `lib/agents/analyzer.ts` |
| Prompt | `lib/prompts/analyzer.ts` |

## System Prompt

> Source of truth: `lib/prompts/analyzer.ts`

Analizza clausole dal punto di vista della parte debole (consumatore/conduttore/lavoratore).
5 livelli di rischio: critical > high > medium > low > info.
Riceve contesto RAG con norme verificate dal vector DB.

## Configuration

- Model: Claude Sonnet 4.5
- Max Tokens: 8192
- Temperature: 0

## Quality Criteria

- Punto di vista SEMPRE dalla parte debole
- Citazioni articoli specifici (non generici "art. X")
- Framework normativo corretto per istituto identificato
- Coerenza interna tra clausole analizzate
- Nessun falso positivo su clausole standard di mercato

## Known Issues

- Nessuno noto

## Change Log

| Data | Modifica |
|------|----------|
| 2025-01 | Creazione iniziale |
| 2025-02 | Aggiunta integrazione RAG per contesto normativo verificato |
