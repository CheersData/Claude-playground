# Changelog

Tutte le modifiche significative al progetto sono documentate in questo file.
Formato basato su [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added
- ADR-011: Strategia storage a 3 fasi (TTL, Supabase Pro, Cloudflare R2)
- Migration 018: TTL 6 mesi per `agent_cost_log` + view `cost_summary_30d`
- Agente `task-executor` in models.ts/tiers.ts per esecuzione task company su modelli free
- `task-runner-api.ts` riscritto con agent-runner (fallback chain, cost logging)
- CLI `done` ora accetta `--data` per JSON strutturato
- CLI `get` mostra `startedAt`, `completedAt`, `Duration`
- CHANGELOG.md per tracciare le modifiche
- Processo documentazione obbligatorio (docs/DEPLOY-CHECKLIST.md)
- Nuovo dipartimento UX/UI (`company/ux-ui/`)

### Changed
- REGISTRY.md aggiornato con migrations 016-018

---

## [2026-03-01] — Security Hardening

### Added
- ADR-005: Fix savePhaseTiming con jsonb_set atomico (TD-1)
- ADR-006: Espansione org chart — 3 nuovi agenti specializzati
- ADR-007: Report di dipartimento — struttura e storage
- ADR-008: Modello CME — architettura ibrida Sonnet/Opus
- ADR-009: Routing task company su modelli free
- ADR-010: Scheduler CME — capacity management
- Migration 016: RPC update_phase_timing
- Migration 017: Campi contatto lawyer_referrals
- `requireConsoleAuth` su tutte le route /api/company/* e /api/console/*
- Rate limit per IP su route corpus read-only
- CRON_SECRET fail-closed (500 se non configurato)

### Fixed
- TD-1: savePhaseTiming 2 roundtrip → 1 (race condition eliminata)
- TD-3: Migration numbering duplicates risolti (001-015 sequenziale)
- M1-M4: Finding sicurezza medi tutti risolti

---

## [2026-02-28] — Virtual Company

### Added
- Company structure: 9 dipartimenti, task system, cost tracking
- CI/CD pipeline: lint, test, build, Vercel preview
- Security department con audit completo
- Daily standup e sprint system
- Console SSE per operazioni interattive

---

## [2026-02-24] — Multi-Provider AI

### Added
- Tier system: intern/associate/partner con catene fallback N-modelli
- 6 provider AI: Anthropic, Gemini, OpenAI, Mistral, Groq, Cerebras
- ~38 modelli registrati in lib/models.ts
- agent-runner con fallback automatico e cost logging
- PowerPanel per toggle agenti e switch tier

---

## [2026-02-22] — Corpus Legislativo

### Added
- ~5600 articoli da 13 fonti (Normattiva + EUR-Lex)
- Data Connector pipeline CONNECT → MODEL → LOAD
- Corpus Agent Q&A con question-prep
- Pagina /corpus con navigazione e ricerca
- Vector DB: pgvector + Voyage AI embeddings

---

## [2026-02-15] — MVP

### Added
- Pipeline 4 agenti: Classifier, Analyzer, Investigator, Advisor
- SSE streaming analisi real-time
- Upload PDF/DOCX/TXT con estrazione testo
- Autenticazione Supabase OAuth
- Pagamenti Stripe (Free/Pro/Single)
- Deep search Q&A su clausole
- Cache analisi su filesystem
- Landing page con video AI
