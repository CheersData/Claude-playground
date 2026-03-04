# Report Security — 3 marzo 2026

**Leader:** security-auditor
**Stato complessivo:** 🟢 VERDE

---

## STATO SICUREZZA

| Area | Stato | Note |
|------|-------|------|
| Headers HTTP | 🟢 OK | CSP, HSTS, X-Frame-Options, Permissions-Policy |
| Middleware centralizzato | 🟢 OK | auth, rate-limit, CSRF, sanitization, audit-log, console-token |
| Token HMAC-SHA256 console | 🟢 OK | `lib/middleware/console-token.ts` |
| RLS Supabase | 🟢 OK | Tutte le tabelle |
| TTL GDPR | 🟢 OK | Dati sensibili con scadenza |
| Audit log EU AI Act | 🟢 OK | Strutturato |

---

## FINDING MEDI — TUTTI RISOLTI ✅

| ID | Problema | Risoluzione |
|----|---------|-------------|
| M1-M9, H1-H2 | Auth, rate-limit, CRON_SECRET, corpus, lawyer-referrals, company routes | Tutti risolti con `requireConsoleAuth` + `checkRateLimit` (commit 2c7648f) |

---

## FINDING BASSI RESIDUI (non bloccanti)

| ID | Problema | Urgenza |
|----|---------|---------|
| L-01 | Whitelist console `AUTHORIZED_USERS` hardcoded nel sorgente | Bassa |
| L-02 | CSP include `'unsafe-eval'` (necessario Next.js) | Bassa — rimovibile in prod con nonce-based CSP |
| L-03 | `/api/company/*` board/tasks/status/files senza rate-limit | Bassa — protetti da console auth |

---

## BLOCCHI CRITICI (richiedono azione boss)

| Blocco | Urgenza | Impatto |
|--------|---------|---------|
| DPA Anthropic + Google + Mistral | 🔴 Alta | Blocca lancio B2B / PMI (GDPR art.28) |
| Consulente EU AI Act | 🔴 Alta — scadenza agosto 2026 | Multa fino €15M o 3% fatturato globale |

---

## NOTE

- RLS trading (`trading_*` tables): solo `service_role` — OK
- Test middleware: auth + csrf + sanitize + rate-limit coperti da QA
- `lib/middleware/console-token.ts`: 0% coverage — P3 in QA backlog
