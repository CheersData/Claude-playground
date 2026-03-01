# Runbook: Security Audit

## Quando eseguire

- Dopo ogni sprint con nuove API routes
- Prima di ogni deploy in produzione
- Trimestralmente come audit preventivo

## Procedura

### 1. Mappa tutte le route API

```bash
# Lista tutte le route
find app/api -name "route.ts" | sort
```

Per ogni route, apri il file e verifica:

### 2. Checklist per ogni route

**Auth**:
- [ ] Usa `requireAuth()` da `lib/middleware/auth.ts`?
- [ ] Se route admin: usa `requireAdmin()`?
- [ ] Auth fallisce con 401, non con 500?

**Rate Limit**:
- [ ] Usa `checkRateLimit()` da `lib/middleware/rate-limit.ts`?
- [ ] Rate limit calibrato per la sensibilità della route?

**Sanitization**:
- [ ] Input testo: `sanitizeDocumentText()` o `sanitizeUserQuestion()`?
- [ ] ID da URL: `sanitizeSessionId()`?
- [ ] File upload: validazione tipo + dimensione?

**Output**:
- [ ] Nessun stack trace in produzione?
- [ ] Nessun dato utente in messaggi di errore?

**CSRF**:
- [ ] Route con metodi POST/PUT/DELETE: protetta da CSRF?

### 3. Controlla security headers

```bash
# Vedi next.config.ts sezione headers
```

Verifica presenza di:
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-XSS-Protection: 1; mode=block`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy`
- [ ] `Content-Security-Policy` (CSP)
- [ ] `Strict-Transport-Security` (HSTS)

### 4. Report

Aggiorna la tabella in `docs/ARCHITECTURE.md` sezione 2.3 con lo stato attuale.

Crea task per ogni vulnerabilità trovata con la severità appropriata.
