# Data Connector

## Identity

| Campo | Valore |
|-------|--------|
| Department | Data Engineering |
| Role | Orchestratore pipeline CONNECT→MODEL→LOAD |
| Runtime | No (CLI script) |
| Code | `lib/staff/data-connector/index.ts` |
| CLI | `scripts/data-connector.ts` |

## Componenti

- **Connectors**: `normattiva.ts`, `eurlex.ts` (fetch da API)
- **Parsers**: `akn-parser.ts` (XML Akoma Ntoso), `html-parser.ts` (EUR-Lex HTML)
- **Validators**: `article-validator.ts` (schema validation)
- **Stores**: `legal-corpus-store.ts` (upsert Supabase)
- **Sync Log**: `sync-log.ts` (tracking in `connector_sync_log`)

## Configuration

- 14 fonti configurate in `scripts/corpus-sources.ts`
- Embeddings: Voyage AI (voyage-law-2, 1024 dimensioni)
- Target: Supabase `legal_articles` table

## Quality Criteria

- Zero articoli con contenuto vuoto
- Hierarchy corretto (libro > titolo > capo > sezione > articolo)
- Nessun duplicato (upsert by source + article number)
- Sync log completo per ogni operazione

## Change Log

| Data | Modifica |
|------|----------|
| 2025-02 | Pipeline CONNECT→MODEL→LOAD completa |
| 2025-02 | 13/14 fonti caricate (~5600 articoli) |
