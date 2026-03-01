# Report — Security
**Data:** 1 marzo 2026 | **Task:** 23/23 completati | **Stato:** 🟢 Operativo

---

## Funzione del dipartimento

Garantire la sicurezza dell'infrastruttura, proteggere i dati degli utenti, prevenire accessi non autorizzati e assicurare la conformità normativa (GDPR, EU AI Act). Audit periodici, fix vulnerabilità, governance sicurezza.

---

## Cosa è stato fatto

### Infrastruttura security di base (SEC-001..006)
- **Headers HTTP completi**: CSP, HSTS, X-Frame-Options, Permissions-Policy in `next.config.ts`
- **Middleware centralizzato**: `lib/middleware/` — auth, rate-limit, CSRF, sanitization, audit-log, console-token
- **RLS attivo** su tutte le tabelle Supabase
- **TTL GDPR** per dati sensibili
- **Audit log strutturato** (EU AI Act compliance)

### Console auth — token HMAC-SHA256
Sostituito il sistema di auth bypassabile (sessionStorage + whitelist substring) con token HMAC-SHA256 stateless:
- Payload: `{nome, cognome, ruolo, sid, tier, disabledAgents, exp}`
- `requireConsoleAuth()` aggiunto a `/api/console` e `/api/console/tier`
- Auth route emette il token. Frontend salva e invia Bearer token
- 401 = reset auth automatico
- Tier changes emettono token aggiornato

### Fix exact match console-auth
Il partial match permetteva `"Ciao Manuela"` → accesso concesso. Rimosso il blocco partial match (linee 96-111) da `parseAuthInput`. Ora input senza struttura completa (nome cognome + ruolo) ritorna null.

### Rimozione DeepSeek da tutti i sistemi
DeepSeek (server in Cina, non coperto da adeguatezza EU) rimosso da:
- Provider type in `models.ts`
- MODELS catalog
- `isProviderEnabled()` / `getEnabledProviders()`
- `openai-compat.ts` (type + PROVIDER_CONFIGS)
- PowerPanel color map

### npm audit — 0 vulnerabilità
Fix applicato: 3 vulnerabilità risolte (1 high ReDoS minimatch via fast-xml-parser, 1 moderate, 1 low). Stato attuale: 0 vulnerabilità.

### Fix finding medi (commit 2c7648f)
| ID | Fix |
|----|-----|
| M1 | `/api/company/*` → `requireConsoleAuth` aggiunto |
| M2 | `/api/console/company` + `/message` + `/stop` → `requireConsoleAuth` aggiunto |
| M3 | `CRON_SECRET` → fail-closed: 500 se non configurato |
| M4 | Route corpus READ → `checkRateLimit` per IP su hierarchy/institutes/article |

### CSRF, CSP/HSTS, rate limit
- CSRF middleware applicato a: deep-search, vector-search, corpus POST, console POST, console/tier POST
- CSP + HSTS in `next.config.ts`
- RATE_LIMITS aggiornato: stripe (5/min), user/usage (60/min)

### Security Risk Brief
4 rischi documentati: EU AI Act (critico), data breach cache filesystem, data leakage provider AI, governance sicurezza assente. Piano d'azione 4 settimane definito (vedi `state-of-company-2026-03-01.md` §3).

---

## Cosa resta da fare

| Priorità | Task | Owner |
|----------|------|-------|
| 🔴 Critica | Firmare DPA con Anthropic, Google, Mistral | CME/boss |
| 🔴 Critica | Ingaggiare consulente EU AI Act (scadenza agosto 2026) | CME/boss |
| Alta | Migrare cache da filesystem a Supabase (elimina data breach R-02) | Architecture |
| Alta | TTL 24h su file cache + rimozione `documentTextPreview` | Architecture |
| Alta | Correggere RLS su `legal_knowledge` (ora `for select using (true)`) | Architecture |
| Media | Job pulizia `document_chunks` dopo 30 giorni | Data Engineering |
| Media | Provider lock per tier PMI (EU-only: Anthropic SCCs + Mistral EU) | Architecture |
| Bassa | Penetration test esterno prima lancio PMI (budget: €3-8k) | CME |
| Bassa | Incident response plan minimale (1 pagina) | Security |

---

## Allineamento con la funzione

✅ **Pieno.** Security ha eseguito un ciclo completo: audit → fix → hardening → monitoring. La postura è passata da 🔴 ROSSA (pre-console-auth) a 🟢 VERDE. I finding medi sono tutti risolti. Rimangono finding bassi non bloccanti e due azioni che richiedono il boss (DPA + consulente).

---

## Stato competitivo

La sicurezza non è un differenziatore commerciale diretto, ma è un prerequisito per il B2B. Le PMI richiedono conformità GDPR e EU AI Act come condizione contrattuale. Senza DPA firmato e consulente EU AI Act ingaggiato, il lancio PMI è bloccato a prescindere dalla qualità del prodotto.

**Whitelist console hardcoded** nel sorgente — bassa priorità per ora, ma va migrata a Supabase auth + role check prima di allargare l'accesso.
