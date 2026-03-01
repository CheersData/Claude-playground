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

## Ordine di applicazione

Eseguire le migration in ordine numerico crescente (001 → 015) sul Supabase SQL Editor.
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
```

## Storico rinumerazione

I file 003–010 sono stati rinumerati il 2026-03-01 (TD-3 architecture review) perche
esistevano doppioni con lo stesso numero prefisso. La sequenza originale era:
`003, 003, 004, 004, 005, 005, 006, 006, 007, 007, 008, 009, 010`.
