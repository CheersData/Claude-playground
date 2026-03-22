# Analisi Costi: PostgreSQL Self-Hosted vs Supabase Pro

**Task:** ce28cedd | **Priorita:** MEDIUM
**Redatto da:** Strategy Department
**Data:** 2026-03-21

---

## 1. Stato Attuale

**Piano corrente: Supabase Free Tier ($0/mese)**

Confermato dal [cost report di marzo 2026](/company/finance/cost-report-2026-03.md):
> "Supabase | $0 (free tier)"

### Utilizzo database rilevato nel codebase

| Metrica | Valore |
|---------|--------|
| Tabelle totali (CREATE TABLE) | **56** |
| File con query Supabase (lib/) | **52 file**, ~256 operazioni |
| Migrazioni SQL | **45 file**, 7863 righe totali |
| Articoli corpus legislativo | ~5600 (con embedding vector 1024d) |
| Embedding tables (pgvector) | 7+ (legal_articles, document_chunks, legal_knowledge, company_sessions, department_memory, company_knowledge, decision_journal) |
| RLS policies | Attive su tutte le tabelle utente |
| Auth OAuth2 | Supabase Auth (Google OAuth via `@supabase/ssr`) |
| Realtime | **NON utilizzato** (zero .channel() o .subscribe() nel codice app) |
| Storage (file) | **NON utilizzato** (nessun uso di Supabase Storage) |
| Edge Functions | **NON utilizzate** |
| RPC functions | 9+ match_* per vector search + utility |

### Stima dimensione database

- ~5600 articoli legali con embedding 1024d (float32) = ~5600 x 4KB embedding + testo = **~50-80 MB** solo per legal_articles
- 7 tabelle con colonna vector(1024) = **stima totale 150-300 MB** con indici HNSW
- Tabelle transazionali (analyses, trading_*, company_tasks, ecc.) = **~20-50 MB**
- **Stima totale attuale: 200-400 MB** (ben sotto il limite free di 500 MB)
- **Proiezione 6 mesi:** con crescita corpus + utenti, potrebbe raggiungere **1-2 GB**

---

## 2. Confronto Opzioni

### A. Supabase Free ($0/mese) — ATTUALE

| Pro | Contro |
|-----|--------|
| Costo zero | Limite 500 MB database |
| Auth integrato (OAuth2, email) | Pausa automatica dopo 7gg inattivita |
| pgvector nativo | Max 2 progetti |
| RLS integrato | Nessun backup point-in-time |
| Dashboard SQL | Nessun SLA |
| Zero ops overhead | Community support only |

**Rischio principale:** pausa automatica dopo 7 giorni senza attivita. In produzione con utenti reali, questo e un problema serio.

### B. Supabase Pro ($25/mese)

| Pro | Contro |
|-----|--------|
| 8 GB database inclusi | $25/mese fissi anche con poco uso |
| 100K MAU inclusi | Overage DB: $0.125/GB/mese |
| Nessuna pausa automatica | Vendor lock-in su Auth + RLS + SDK |
| Backup giornalieri | Nessun accesso SSH al server |
| 100 GB file storage | Compute condiviso |
| Email support 24h | |

**Costo reale stimato per Controlla.me:**
- Base: $25/mese
- Con DB fino a 2 GB: $25/mese (nessun overage)
- Con DB fino a 10 GB: $25 + $0.25 = ~$25/mese
- Con DB fino a 50 GB: $25 + $5.25 = ~$30/mese
- MAU: sotto 100K, nessun costo aggiuntivo

**Costo annuale: ~$300**

### C. Supabase Team ($599/mese)

**Scartato.** Pensato per team con SOC2, SSO, priority support. Overkill per lo stato attuale del progetto.

### D. Neon.tech (Serverless PostgreSQL)

| Piano | Costo | Incluso |
|-------|-------|---------|
| Free | $0 | 0.5 GB, 100 CU-hours, scale-to-zero |
| Launch | ~$5-19/mese | 50 GB a $0.30/GB, compute $0.14/CU-hr |
| Scale | ~$20-69/mese | 100 GB a $0.30/GB, compute $0.222/CU-hr |

| Pro | Contro |
|-----|--------|
| pgvector nativo | **NO Auth** — serve NextAuth/Better Auth/Lucia |
| Branching (dev/staging gratis) | **NO RLS** management UI |
| Scale-to-zero (risparmio) | Migrazione Auth: effort ~2-3 settimane |
| Serverless (nessun sizing) | Nessun SDK integrato |
| Ottimo per AI/embeddings | Cold start su scale-to-zero (~1-3s) |

**Costo stimato per Controlla.me:**
- DB: ~$5-10/mese (Launch, 1-2 GB)
- Auth sostitutivo (Better Auth/NextAuth): $0 (open-source) ma ~2-3 settimane dev
- **Costo annuale: ~$60-120 + costo migrazione Auth**

### E. Railway.app

| Piano | Costo |
|-------|-------|
| Hobby | $5/mese (incluso nel credito) |
| Pro | $20/mese |

| Pro | Contro |
|-----|--------|
| Deploy one-click PostgreSQL | **NO Auth** |
| Buon DX | **NO pgvector** out-of-the-box (va installato manualmente) |
| Prevedibile per piccoli DB | Nessun RLS management |
| | Migrazione completa necessaria |

**Costo stimato: $5-18/mese + effort migrazione elevato.** Non competitivo.

### F. Hetzner VPS Self-Hosted

| Config | Costo |
|--------|-------|
| CX22 (2 vCPU, 4 GB RAM, 40 GB) | ~EUR 6-8/mese ($7-9) |
| CX32 (4 vCPU, 8 GB RAM, 80 GB) | ~EUR 12-15/mese ($13-17) |
| Dedicato (64 GB RAM, 8 core, 2x512 NVMe) | ~EUR 55/mese ($60) |

| Pro | Contro |
|-----|--------|
| Costo minimo ($7-9/mese) | **Ops overhead elevato** (backup, monitoring, update, sicurezza) |
| Controllo totale | **NO Auth** — serve soluzione esterna |
| pgvector installabile | **NO RLS** UI — gestione manuale |
| Nessun limite storage | Nessun SLA |
| GDPR EU nativo (Falkenstein/Helsinki) | Tempo setup iniziale: ~1-2 settimane |
| | Downtime durante manutenzione |
| | Backup manuali (pg_dump + offsite) |

**Costo stimato:**
- VPS: $7-9/mese
- Backup offsite (Hetzner Storage Box 100 GB): ~$3/mese
- Auth sostitutivo: $0 (open-source) ma ~2-3 settimane dev
- Monitoring (Uptime Kuma, pg_stat): $0 (self-hosted)
- **Costo annuale: ~$120-150 + effort setup/migrazione + ongoing ops**

---

## 3. Matrice Decisionale

| Criterio (peso) | Supabase Free | Supabase Pro | Neon Launch | Hetzner Self-Host |
|------------------|:---:|:---:|:---:|:---:|
| Costo mensile (25%) | 10 ($0) | 6 ($25) | 9 ($5-10) | 8 ($10-12) |
| Effort migrazione (20%) | 10 (zero) | 10 (zero) | 4 (Auth) | 3 (Auth+infra) |
| Auth integrato (15%) | 10 | 10 | 2 | 2 |
| pgvector/RLS (15%) | 10 | 10 | 8 | 7 |
| Affidabilita prod (15%) | 3 (pausa!) | 9 | 8 | 6 |
| Ops overhead (10%) | 10 | 10 | 8 | 3 |
| **SCORE PESATO** | **8.55** | **9.05** | **6.55** | **4.70** |

---

## 4. Analisi dei Rischi per Migrazione

### Cosa perdiamo lasciando Supabase

| Feature Supabase | Alternativa | Effort | Rischio |
|-----------------|-------------|--------|---------|
| **Auth (OAuth2 + email)** | Better Auth / Auth.js / Lucia | 2-3 settimane | ALTO — 23+ file usano auth Supabase |
| **RLS (Row-Level Security)** | Middleware applicativo | 1-2 settimane | MEDIO — 56 tabelle con policy |
| **SDK (@supabase/ssr)** | pg/drizzle + custom client | 1-2 settimane | MEDIO — 52 file con query Supabase |
| **Dashboard SQL** | pgAdmin / Metabase self-hosted | 1 giorno | BASSO |
| **Backup automatici** | pg_dump + cron | 2-3 giorni | BASSO |
| **Realtime** | Non usato | $0 effort | NESSUNO |
| **Storage** | Non usato | $0 effort | NESSUNO |
| **Edge Functions** | Non usate | $0 effort | NESSUNO |

**Effort totale migrazione stimato: 5-8 settimane developer** (principalmente Auth + RLS + SDK refactor).

---

## 5. Raccomandazione

### Fase attuale (demo/MVP): RESTARE su Supabase Free

Il progetto e in fase demo con $0.41/mese di costi API totali. Non ha senso investire $300/anno o settimane di migrazione adesso.

### Trigger per upgrade a Supabase Pro ($25/mese)

Passare a Pro quando si verifica **almeno uno** di questi:

1. **Utenti reali in produzione** — la pausa dopo 7gg e incompatibile con un servizio attivo
2. **Database > 400 MB** — avvicinarsi al limite di 500 MB del free tier
3. **Lancio beta PMI** (Ufficio Integrazione) — credenziali OAuth2 criptate richiedono uptime garantito
4. **Trading live** — il portfolio monitor non puo permettersi downtime

### Perche NON migrare a self-hosted/Neon ora

1. **ROI negativo**: risparmi ~$15/mese vs Supabase Pro, ma spendi 5-8 settimane di sviluppo
2. **Auth e il collo di bottiglia**: 23+ file dipendono da Supabase Auth. Migrare a NextAuth/Better Auth richiede riscrivere login, middleware, RLS, callback. Per $15/mese di risparmio non ha senso.
3. **pgvector funziona bene**: Supabase ha pgvector nativo con HNSW. Self-hosted richiede configurazione manuale.
4. **Ops overhead**: con un team di 1 persona + agenti AI, gestire backup, update, monitoring PostgreSQL e un costo nascosto significativo.

### Piano a lungo termine (>12 mesi, >10K MAU)

Rivalutare quando:
- Costo Supabase Pro supera $50-75/mese (overage su MAU o storage)
- Servono funzionalita non supportate (es. logical replication, custom extensions)
- Il team cresce e puo assorbire ops overhead

A quel punto considerare **Neon Scale** ($20-70/mese) come alternativa:
- pgvector nativo
- Scale-to-zero
- Branching per dev/staging
- Auth separato (Better Auth, ormai maturo)

---

## 6. Action Items

| # | Azione | Quando | Priorita |
|---|--------|--------|----------|
| 1 | Monitorare dimensione DB attuale (query `pg_database_size`) | Ora | P2 |
| 2 | Upgrade a Supabase Pro quando si verifica un trigger (sez. 5) | Al trigger | P1 |
| 3 | NON migrare da Supabase prima di 10K MAU o $75/mese di costi | Policy | — |
| 4 | Rivalutare Neon.tech a Q4 2026 se i costi Supabase crescono | Q4 2026 | P3 |

---

## Fonti

- [Supabase Pricing](https://supabase.com/pricing)
- [Supabase Billing Docs](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase Pricing Breakdown 2026 (Metacto)](https://www.metacto.com/blogs/the-true-cost-of-supabase-a-comprehensive-guide-to-pricing-integration-and-maintenance)
- [Supabase Pricing 2026 (UI Bakery)](https://uibakery.io/blog/supabase-pricing)
- [Neon Pricing](https://neon.com/pricing)
- [Neon Plans Docs](https://neon.com/docs/introduction/plans)
- [Neon Pricing Breakdown 2026 (Simplyblock)](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/)
- [Railway Pricing](https://railway.com/pricing)
- [Railway Pricing Breakdown (BuildMVPFast)](https://www.buildmvpfast.com/tools/api-pricing-estimator/railway)
- [Hetzner Cloud](https://www.hetzner.com/cloud)
- [Hetzner Cloud Review 2026 (Better Stack)](https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/)
- [Self-host PostgreSQL on Hetzner (Saul O'Driscoll)](https://saulodriscoll.com/blog/cheap-postgres-on-hetzner-vps-with-docker-terraform/)
