# Architecture Decision Records (ADR)

## Formato

```
### ADR-NNN: Titolo

**Data**: YYYY-MM-DD
**Stato**: proposed | accepted | deprecated | superseded
**Contesto**: Perché serve questa decisione
**Decisione**: Cosa abbiamo deciso
**Conseguenze**: Impatto positivo e negativo
```

## Decisioni

### ADR-001: Struttura Virtual Company

**Data**: 2025-02-28
**Stato**: accepted
**Contesto**: Lo sviluppo era improvvisato, senza persistenza tra sessioni, senza test automatici.
**Decisione**: Creare un'alberatura `company/` con prompt, runbook, e task system su Supabase.
**Conseguenze**: (+) Persistenza, coordinamento, self-testing. (-) ~50 file nuovi, complessità iniziale.

### ADR-002: Task System su Supabase

**Data**: 2025-02-28
**Stato**: accepted
**Contesto**: I dipartimenti devono comunicare e tracciare il lavoro.
**Decisione**: Tabella `company_tasks` su Supabase con CLI per Claude Code.
**Conseguenze**: (+) Persistenza, query, dashboard. (-) Dipendenza da Supabase.

### ADR-003: Cost Tracking per Chiamata

**Data**: 2025-02-28
**Stato**: accepted
**Contesto**: Non sappiamo quanto spendiamo per ogni agente.
**Decisione**: Log ogni chiamata in `agent_cost_log` con costo calcolato da `lib/models.ts`.
**Conseguenze**: (+) Visibilità totale sui costi. (-) 1 INSERT per chiamata agente (trascurabile).

### ADR-004: Dipartimento Security

**Data**: 2026-02-28
**Stato**: accepted
**Contesto**: App legale con documenti sensibili. Vulnerabilità aperte: CSRF, security headers, auth inline, rate limit mancante su payment routes.
**Decisione**: Nuovo dipartimento Security (`company/security/`). Hardening immediato: `requireAuth()` su tutte le route mutanti, CSP+HSTS in `next.config.ts`, `lib/middleware/csrf.ts` per FormData endpoints, rate limit su Stripe e user/usage.
**Conseguenze**: (+) Copertura auth 100% route mutanti, CSRF protection, 7/7 security headers. (-) Nuovo dipartimento da mantenere; CSP `unsafe-inline` necessario per Next.js SSR (mitigazione futura: nonce-based CSP).
