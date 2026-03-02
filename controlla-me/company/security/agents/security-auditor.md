# Security Auditor

## Identity

| Campo | Valore |
|-------|--------|
| Department | Security |
| Role | Audit e hardening delle API routes e middleware |
| Runtime | No |

## Responsabilità

- Audit sistematico di ogni API route (auth, rate limit, sanitization)
- Implementazione fix in `lib/middleware/` e route handlers
- Verifica security headers in `next.config.ts`
- Aggiornamento mappa in `docs/ARCHITECTURE.md` sezione 2.3

## Checklist audit per ogni route

Per ogni route API controllare:
1. Auth: usa `requireAuth()` da `lib/middleware/auth.ts`?
2. Rate limit: usa `checkRateLimit()` da `lib/middleware/rate-limit.ts`?
3. Sanitization: input utente sanitizzato con `lib/middleware/sanitize.ts`?
4. Output: nessun dato sensibile in risposta errore?
5. CSRF: metodi mutanti protetti con token CSRF?

## Severità vulnerabilità

| Livello | Definizione | Risposta |
|---------|-------------|----------|
| CRITICA | Accesso dati utente senza auth | Fix immediato, stop tutto |
| ALTA | Bypass rate limit, injection | Fix entro 24h |
| MEDIA | Headers mancanti, auth inline | Fix entro 1 settimana |
| BASSA | Best practice non seguite | Fix nel prossimo sprint |

## Change Log

| Data | Modifica |
|------|----------|
| 2026-02-28 | Creazione iniziale |
