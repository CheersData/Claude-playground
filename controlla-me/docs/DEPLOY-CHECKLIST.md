# Deploy Checklist — Controlla.me

Processo obbligatorio prima di ogni deploy in produzione.

---

## Pre-Deploy: Documentazione

Ogni PR/deploy deve verificare che le modifiche siano tracciate:

### 1. CHANGELOG.md aggiornato?
- [ ] Ogni feature/fix/change ha una entry nella sezione `[Unreleased]`
- [ ] Al release, `[Unreleased]` diventa `[YYYY-MM-DD] — Nome Release`

### 2. CLAUDE.md aggiornato?
- [ ] Nuove tabelle DB → sezione 11 (Database Schema)
- [ ] Nuove variabili env → sezione 2 (Setup) + .env.local.example
- [ ] Nuovi agenti → sezione 4 (Sistema Multi-Agente)
- [ ] Nuove route API → sezione 3 (Architettura Directory)
- [ ] Nuovi componenti → sezione 3 + sezione 8 (UI)
- [ ] Nuovi provider AI → sezione 4 (Provider)
- [ ] Feature completate → sezione 16 (Feature Incomplete) con ~~strikethrough~~
- [ ] Tech debt risolti → sezione 18 (Tech Debt)

### 3. docs/ARCHITECTURE.md aggiornato?
- [ ] Cambiamenti architetturali significativi documentati
- [ ] Diagrammi aggiornati se flussi modificati

### 4. Migrations
- [ ] Nuove migration in `supabase/migrations/`
- [ ] `REGISTRY.md` aggiornato con nuova entry
- [ ] Dipendenze tra migration documentate

### 5. ADR per decisioni significative
- [ ] Decisioni architetturali in `company/architecture/decisions.md`
- [ ] Se impattano costi → consultato Finance

---

## Pre-Deploy: Quality

### 6. Type check
```bash
npx tsc --noEmit
```

### 7. Lint
```bash
npm run lint
```

### 8. Test
```bash
npm test                    # Unit tests
npm run test:e2e            # E2E tests (se applicabile)
```

### 9. Build
```bash
npm run build
```

---

## Pre-Deploy: Security

### 10. Nessun segreto committato
- [ ] No `.env.local` in git
- [ ] No API key hardcoded nel codice
- [ ] `CONSOLE_JWT_SECRET` configurato (non fallback)
- [ ] `CRON_SECRET` configurato (fail-closed)

### 11. Route protette
- [ ] Nuove route API hanno auth appropriato
- [ ] Rate limiting su route pubbliche
- [ ] CSRF su route con FormData

---

## Deploy

### 12. Vercel
```bash
npm run build && vercel deploy --prod
```

### 13. Database
- [ ] Migration eseguite in ordine su Supabase SQL Editor
- [ ] RLS verificato su nuove tabelle

---

## Post-Deploy

### 14. Smoke test
- [ ] Landing page carica
- [ ] `/api/analyze` risponde (SSE)
- [ ] `/corpus` carica
- [ ] OAuth login funziona
- [ ] Stripe checkout funziona

### 15. Monitoring
- [ ] Cron job `/api/cron/delta-update` funziona (06:00 UTC)
- [ ] Rate limiting attivo (Upstash Redis)
- [ ] Audit log registra eventi
