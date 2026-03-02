# Supabase Migrations Registry

Tabella ordinata di tutte le migration con numero, nome file e scopo.
Aggiornare questo file ogni volta che si aggiunge o rinomina una migration.

> Nota: i commenti interni ai file .sql riportano ancora i vecchi numeri (es. `004_security_fixes.sql`)
> perche il contenuto SQL non e' stato modificato durante la rinumerazione. I numeri nel nome file
> sono autorevoli; i commenti sono solo informativi.

| # | File | Scopo | Commit origine |
|---|------|-------|---------------|
| 001 | `001_initial.sql` | Schema base: `profiles`, `analyses`, `deep_searches`, `lawyer_referrals` + RLS | `d69a594` |
| 002 | `002_usage_tracking.sql` | Funzioni SQL: `increment_analyses_count`, `reset_monthly_analyses` | `0fe8db3` |
| 003 | `003_vector_db.sql` | pgvector, `document_chunks`, `legal_knowledge` + indici HNSW per RAG | `b62be5b` |
| 004 | `004_legal_corpus.sql` | Tabella `legal_articles` con embedding vettoriale e gerarchia navigabile | `88b72d8` |
| 005 | `005_align_legal_articles.sql` | Allinea schema `legal_articles` al codice: rinomina colonne, aggiunge `source_id`, `in_force`, `url`, `hierarchy` | `729a924` |
| 006 | `006_security_fixes.sql` | Fix sicurezza GDPR: RLS su `legal_knowledge`, rimozione `documentTextPreview`, cleanup TTL (SEC-005) | `861cfb3` |
| 007 | `007_audit_log.sql` | Tabella `audit_log` per tracciabilita decisioni AI (EU AI Act compliance, SEC-006) | `861cfb3` |
| 008 | `008_fix_hierarchy_data.sql` | Normalizza valori `hierarchy` in `legal_articles` per eliminare nodi duplicati nella navigazione | `dee5422` |
| 009 | `009_connector_sync_log.sql` | Tabella `connector_sync_log` per tracciare sincronizzazioni Data Connector | `de3603b` |
| 010 | `010_contract_monitoring.sql` | Schema per contract monitoring PMI: `monitored_contracts`, `contract_alerts` | `861cfb3` |
| 011 | `011_analysis_sessions.sql` | Tabella `analysis_sessions`: cache analisi su Supabase (sostituisce `.analysis-cache/*.json` per serverless) | `861cfb3` |
| 012 | `012_populate_institutes.sql` | Popola `related_institutes` per articoli Codice Civile (fix pipeline di load che salvava array vuoto) | `1f3d859` |
| 013 | `013_company_tasks.sql` | Tabella `company_tasks`: task system per la virtual company (CME + dipartimenti) | `1e3bdae` |
| 014 | `014_cost_tracking.sql` | Tabella `agent_cost_log`: tracking costi reali per ogni chiamata agente | `1e3bdae` |
| 015 | `015_department_analyses.sql` | Tabella `department_analyses`: analisi AI per-dipartimento dal daily standup | `1e3bdae` |
| 016 | `016_savephasetiming_rpc.sql` | RPC `update_phase_timing` con `jsonb_set` atomico (ADR-005, TD-1 fix) | — |
| 017 | `017_lawyer_referrals_contact.sql` | Campi contatto per `lawyer_referrals` | — |
| 018 | `018_cost_log_ttl.sql` | TTL 6 mesi per `agent_cost_log` + view `cost_summary_30d` (ADR-011) | — |
| 019 | `019_trading_schema.sql` | Schema Ufficio Trading: `trading_config`, `trading_signals`, `trading_orders`, `portfolio_positions`, `portfolio_snapshots`, `risk_events` + RLS service_role + TTL signals 90gg | — |
| 020 | `020_company_vision.sql` | Company Vision/Mission (singleton), Scheduler Plans (audit trail), Decision Audit Log + RLS service_role | — |
| 021 | `021_trailing_stop.sql` | Trailing stop state per posizioni live: `trailing_stop_state` con 4-tier tracking (breakeven→lock→trail→tight) + RLS service_role | — |
| 022 | `022_routing_enforcement.sql` | Routing audit trail su `company_tasks`: colonne `routing`, `routing_exempt`, `routing_reason` + indici | — |
| 023 | `023_task_enhancements.sql` | Task enhancements: `seq_num` (numerazione sequenziale), `tags` (GIN index), `expected_benefit`, `benefit_status`, `benefit_notes`, `suggested_next` | — |

## Ordine di applicazione

Eseguire le migration in ordine numerico crescente (001 → 023) sul Supabase SQL Editor.
Le migration sono idempotenti dove possibile (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).

## Dipendenze tra migration

```
001 → base (nessuna dipendenza)
002 → dipende da 001 (usa tabella profiles)
003 → dipende da 001 (pgvector extensions)
004 → dipende da 003 (vector extension gia attiva)
005 → dipende da 004 (alter table legal_articles)
006 → dipende da 003 (RLS su legal_knowledge)
007 → indipendente
008 → dipende da 004+005 (update su legal_articles)
009 → indipendente
010 → indipendente
011 → dipende da 001 (FK su profiles)
012 → dipende da 004+005 (update su legal_articles)
013 → indipendente
014 → indipendente
015 → indipendente
016 → dipende da 011 (opera su analysis_sessions)
017 → dipende da 001 (alter table lawyer_referrals)
018 → dipende da 014 (opera su agent_cost_log)
019 → indipendente (schema trading, nessuna FK a tabelle esistenti)
020 → indipendente (company governance, nessuna FK a tabelle esistenti)
021 → dipende da 019 (schema trading, trailing stop per posizioni)
022 → dipende da 013 (alter table company_tasks)
023 → dipende da 013 (alter table company_tasks)
```

## Storico rinumerazione

I file 003–010 sono stati rinumerati il 2026-03-01 (TD-3 architecture review) perche
esistevano doppioni con lo stesso numero prefisso. La sequenza originale era:
`003, 003, 004, 004, 005, 005, 006, 006, 007, 007, 008, 009, 010`.
