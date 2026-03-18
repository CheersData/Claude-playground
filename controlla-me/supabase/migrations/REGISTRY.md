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
| 024 | `024_signal_type_pending_retry.sql` | Tipo segnale `pending_retry` per ordini falliti con TTL 10min | — |
| 025 | `025_task_approval_metadata.sql` | Metadata approvazione task | — |
| 026 | `026_cdp.sql` | Schema CDP | — |
| 027 | `027_medical_vertical.sql` | Schema verticale medico (studia.me) | — |
| 028 | `028_populate_institutes_all_sources.sql` | Popola `related_institutes` per TUTTE le fonti: CC gap fill (Libri I-VI), CPC, CP, Codice Consumo esteso, fonti specialistiche IT, fonti HR, fonti EU. Fix per ~80% corpus con institutes vuoti. | — |
| 029 | `029_legal_articles_fts.sql` | Full-Text Search su `legal_articles`: colonna `article_text_ts` tsvector (Italian stemming), GIN index, trigger auto-update, RPC `search_legal_articles_fts` con `ts_rank` | — |
| 030 | `030_integration_tables.sql` | Integration framework DB: `credential_vault` (pgcrypto encrypted credentials + RPC vault_store/vault_retrieve/vault_refresh), `connector_field_mappings` (AI mapping cache rule+LLM, TTL 30gg), `crm_records` (raw + mapped business data). RLS per-user su vault e CRM, service_role su mappings. ADR-integration-framework. | — |
| 031 | `031_integration_office_tables.sql` | Integration Office DB: `integration_credentials` (AES-256-GCM encrypted OAuth2/API key storage), `integration_connections` (connector config + sync status), `integration_sync_log` (sync history, TTL 90gg), `integration_field_mappings` (cached mappings rule/similarity/llm/user, TTL 30gg), `integration_credential_audit` (GDPR audit trail, TTL 2 anni). RLS per-user + service_role. 3 RPC cleanup functions. | — |
| 032 | `032_integration_unique_index.sql` | Unique partial index su `integration_connections(user_id, connector_type)` per connessioni attive (WHERE status != 'disconnected'). Previene duplicati su upsert. | — |
| 033 | `033_domain_support.sql` | (FIXED) Usa `vertical` coerentemente con migration 027 (era `domain`). Aggiornate le funzioni `match_legal_articles`, `get_articles_by_source`, `get_articles_by_institute` con filtro `filter_vertical` e NULL embedding guard. | — |
| 034 | `034_fix_vector_search.sql` | HOTFIX: (1) Fix embedding vector(1536)->vector(1024) se colonna sbagliata, (2) consolida domain/vertical su `vertical` sola, (3) NULL embedding guard su tutte le RPC, (4) diagnostica articoli senza embedding. | — |
| 035 | `035_hnsw_ef_search.sql` | HNSW ef_search=200 su tutte le 5 funzioni match_* (default pgvector=40 troppo basso per recall). Function-level SET, nessun side effect globale. | — |
| 036 | `036_consolidate_credential_vault.sql` | Consolida credential vault: drop `integration_credentials` (031, AES-256-GCM client-side) in favore di `credential_vault` (030, pgcrypto RPC server-side). Drop `connector_field_mappings` (030) in favore di `integration_field_mappings` (031). Drop FK `credential_id` da `integration_connections`. Aggiunge colonna `scopes` a `credential_vault`. Aggiorna `cleanup_integration_data()`. | — |
| 037 | `037_schema_discovery.sql` | Schema Discovery: `discovered_schemas` (cache catalogo JSONB, TTL 7gg), `entity_mapping_configs` (mapping source→target con versioning), `nl_transform_executions` (audit NL→code, TTL 90gg). RLS per-user + service_role. Auto-increment version su update. Cleanup RPC per TTL. | — |
| 038 | `038_integration_notifications.sql` | Notifiche integrazione | — |
| 039 | `039_webhook_events_and_sync_retry.sql` | Webhook events e sync retry per integrazioni | — |
| 040 | `040_forma_mentis.sql` | Forma Mentis (ADR): 6 tabelle (`company_sessions`, `department_memory`, `company_knowledge`, `company_goals`, `daemon_reports`, `decision_journal`) + 4 RPC semantic search (`match_company_knowledge`, `match_department_memory`, `match_company_sessions`, `match_decisions`). HNSW vector(1024) su 4 tabelle. RLS service_role. Layer 1 MEMORIA + Layer 3 COSCIENZA + Layer 4 RIFLESSIONE. | — |
| 041 | `041_document_chat.sql` | Document Chat: `document_conversations` + `document_messages` con RLS per-user + service_role. Trigger auto-update `message_count`/`updated_at`. Cleanup TTL 90gg. | — |
| 042 | `042_deep_search_conversations.sql` | Deep Search conversazionale: `deep_search_conversations` (per clausola) + `deep_search_messages` con RLS per-user + service_role. Trigger auto-update `message_count`/`updated_at`. Cleanup TTL 90gg. Stesso pattern di 041 applicato alla deep search su clausole. | — |

## Ordine di applicazione

Eseguire le migration in ordine numerico crescente (001 → 042) sul Supabase SQL Editor.
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
024 → dipende da 019 (alter type signal_type)
025 → dipende da 013 (alter table company_tasks)
026 → indipendente
027 → indipendente
028 → dipende da 012 (usa extract_article_number, update su legal_articles)
029 → dipende da 004+005 (aggiunge colonna e trigger su legal_articles)
030 → indipendente (pgcrypto extension, 3 nuove tabelle, nessuna FK a tabelle app esistenti)
031 → indipendente (5 nuove tabelle Integration Office, FK solo a auth.users)
032 → dipende da 031 (indice su integration_connections)
033 → dipende da 027 (usa vertical, non domain)
034 → dipende da 003+004+005+027+033 (hotfix: consolida schema, fix RPC, NULL guard)
036 → dipende da 030 + 031 (consolida credential_vault, drop integration_credentials + connector_field_mappings)
037 → dipende da 031 (FK su integration_connections)
038 → dipende da 031 (integration notifications)
039 → dipende da 031 (webhook events e sync retry)
040 → dipende da 003 (pgvector extension) + 013 (FK company_tasks)
041 → dipende da 001 (FK su analyses, auth.users)
042 → dipende da 001 (FK su analyses, auth.users). Stesso pattern di 041
```

## Storico rinumerazione

I file 003–010 sono stati rinumerati il 2026-03-01 (TD-3 architecture review) perche
esistevano doppioni con lo stesso numero prefisso. La sequenza originale era:
`003, 003, 004, 004, 005, 005, 006, 006, 007, 007, 008, 009, 010`.

Il 2026-03-14 `004_domain_support.sql` (aggiunto il 2026-03-11) collideva con
`004_legal_corpus.sql` (gia in registro). Rinominato a `033_domain_support.sql`
(task 870b03f4, Architecture dept).
