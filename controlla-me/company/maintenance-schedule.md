# Maintenance Schedule — Controlla.me

> Schedulazione operativa giornaliera/settimanale per il mantenimento della struttura.
> Ogni task ha un responsabile, una frequenza e comandi esatti da eseguire.

---

## ⏰ GIORNALIERO (ogni sessione Claude Code)

### 🏢 CME — Apertura sessione (5 min)

```bash
npx tsx scripts/company-tasks.ts board
```

**Checklist:**
1. Leggere il board → quanti open? quanti in-progress?
2. Controllare se qualche task è bloccato > 48h
3. Reportare stato all'utente in 3-5 righe
4. Chiedere priorità del giorno

---

### 💰 Finance — Cost check (2 min)

```bash
# Via API (se /ops disponibile):
curl http://localhost:3000/api/company/costs?days=1

# Via task system:
npx tsx scripts/company-tasks.ts list --dept finance
```

**Soglie di allerta:**
| Periodo | Soglia warning | Soglia critica |
|---------|---------------|----------------|
| Giorno  | > $1.00        | > $5.00         |
| Settimana | > $5.00      | > $20.00        |
| Mese    | > $15.00       | > $50.00        |

**Azione se critico:** Creare task Finance con priority=high, valutare downgrade tier ad Associate o Intern.

---

### 🔒 Security — Header & route check (3 min, se modifiche API)

```bash
# Verifica che le route abbiano tutti i middleware
grep -r "checkCsrf\|requireAuth\|checkRateLimit" app/api/ --include="*.ts" -l
```

**Invarianti da rispettare:**
- Ogni route POST/PUT/DELETE → `checkCsrf` + `requireAuth` + `checkRateLimit`
- Webhook Stripe → SOLO verifica Stripe signature (no requireAuth)
- `/api/auth/callback` → SOLO OAuth (no requireAuth)
- `/api/corpus/ask` → rate limit + optional auth ✓

---

## 📅 SETTIMANALE (ogni lunedì)

### 🧪 QA — Full suite (10 min)

```bash
# 1. Unit tests
npm test

# 2. Type check
npx tsc --noEmit

# 3. Lint
npm run lint
```

**KPI target:**
- Unit tests: 100% pass
- Type errors: 0
- Lint errors: 0

**Se fallisce:** Creare task QA con priority=high → assegnare a test-runner.

---

### 📊 Data Engineering — Corpus freshness check (5 min)

```bash
# Statistiche corpus
npx tsx scripts/company-tasks.ts list --dept data-engineering

# Verifica stato fonti
npx tsx scripts/data-connector.ts status
```

**Controllare:**
- Articoli nel corpus: target > 5000
- Ultima sync: non > 30 giorni
- Errori connector: se presenti → task DE con priority=medium

---

### 🏗️ Architecture — Dependency audit (5 min)

```bash
npm outdated
npm audit --audit-level=high
```

**Azioni:**
- `npm audit` con vulnerabilità HIGH/CRITICAL → task Security con priority=high
- Dipendenze major in ritardo > 2 versioni → task Architecture con priority=low
- **NON fare** `npm update` senza approvazione CME

---

### 💵 Finance — Cost report settimanale (3 min)

```bash
curl http://localhost:3000/api/company/costs?days=7
```

**Creare task Finance:**
```bash
npx tsx scripts/company-tasks.ts create \
  --title "Cost report settimana $(date +%V)" \
  --dept finance \
  --priority low \
  --by cme
```

---

## 📆 MENSILE (primo giorno del mese)

### 🔄 Database — Reset contatori utilizzo

```sql
-- Eseguire su Supabase SQL Editor:
SELECT reset_monthly_analyses();
```

O tramite pg_cron se configurato.

### 🔒 Security — Audit completo

```bash
# Eseguire runbook audit
# Leggi: company/security/runbooks/security-audit.md
```

**Checklist:**
1. Verificare security headers in next.config.ts
2. Controllare RLS policies su Supabase
3. Verificare che ADMIN_API_SECRET sia ruotato (ogni 90 giorni)
4. Aggiornare docs/ARCHITECTURE.md sezione 2.3

### 🤖 AI — Model census (verifica modelli deprecati)

```bash
npx tsx scripts/model-census-agent.ts
```

Confrontare con `docs/MODEL-CENSUS.md`. Se modelli deprecati → task Architecture.

---

## 🚨 TRIGGER-BASED (on demand)

### Dopo ogni modifica a `lib/prompts/*`

```bash
# QA: validazione agenti
npx tsx scripts/testbook.ts
```

Target: > 75% accuracy. Se < 75% → rollback prompt + task Ufficio Legale.

### Dopo ogni modifica a `app/api/*`

1. Verificare middleware (CSRF, auth, rate limit)
2. `npm test` → deve passare 100%
3. `npx tsc --noEmit` → zero errori

### Dopo ogni deploy in produzione

1. Verificare webhook Stripe attivo su dashboard Stripe
2. Verificare OAuth callback URL su Supabase
3. Smoke test: analizzare 1 documento di test
4. Controllare costi dopo 24h

---

## 📋 TASK TEMPLATE per manutenzione ricorrente

```bash
# Template per task di manutenzione settimanale
npx tsx scripts/company-tasks.ts create \
  --title "Manutenzione settimanale — $(date +%Y-%m-%d)" \
  --dept operations \
  --priority low \
  --by cme

# Template per security audit mensile
npx tsx scripts/company-tasks.ts create \
  --title "Security audit mensile — $(date +%Y-%m)" \
  --dept security \
  --priority medium \
  --by cme
```

---

## 🔗 File correlati

| File | Scopo |
|------|-------|
| `company/security/runbooks/security-audit.md` | Procedura audit completo |
| `company/quality-assurance/runbooks/run-full-suite.md` | Procedura test |
| `company/finance/runbooks/cost-report.md` | Procedura cost report |
| `company/operations/runbooks/status-report.md` | Status report sistema |
| `docs/ARCHITECTURE.md` | Mappa fragilità e security status |
| `docs/MODEL-CENSUS.md` | Censimento modelli AI e prezzi |
