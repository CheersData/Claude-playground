# ADR-001 — Tier PMI/Professionisti (€49-99/mese)

**Stato**: Proposta — in attesa di approvazione CME
**Data**: 2026-03-01
**Autore**: Architecture Dept (CME)
**Task**: bf91b1d6
**Contesto**: Marketing ha identificato il segmento PMI come priorità Go-To-Market entro 6-9 mesi.

---

## Problema

Il piano Pro attuale (€4.99/mese, analisi illimitate) è calibrato sul consumatore individuale.
I segmenti PMI (HR manager, agenti immobiliari, piccoli imprenditori) hanno esigenze diverse:

- **Volume**: 20-500 contratti/mese per azienda (vs. 1-3 per consumatore)
- **Tipologia**: contratti omogenei in batch (es. 50 contratti di affitto identici per un agente immobiliare)
- **Multi-utente**: 2-5 persone per azienda condividono l'accesso
- **Storico**: necessario per audit, compliance, risoluzione controversie
- **Output strutturato**: report PDF da allegare a email/pratiche, export CSV/JSON
- **Integrazione**: caricamento da Google Drive/Dropbox invece di upload manuale
- **Branding**: report con logo aziendale per agenzie immobiliari e studi legali
- **API access**: integrazione con sistemi interni, SLA

---

## Opzioni valutate

### Opzione A — Piano "Business" flat €49/mese (SCARTATA)

Pro: semplice
Contro: non scalabile, non copre sub-account, nessun incentivo all'upgrade

### Opzione B — Piano "Business" seat-based €29/sede/mese (SCARTATA)

Pro: modello SaaS classico
Contro: pricing complesso, attrito alla vendita, difficile per monoimprenditore

### Opzione C — Piano "PMI" con crediti analisi + features premium (ADOTTATA)

Bundle chiaro: **€49/mese** base con 100 analisi/mese + features PMI.
Upgrade **€99/mese** con 300 analisi/mese + PDF brandizzato + Google Drive.

---

## Decisione: Opzione C

### Struttura piani

| Piano | Prezzo | Analisi/mese | Sub-account | PDF | Drive | Dashboard | API | SLA |
|-------|--------|-------------|-------------|-----|-------|-----------|-----|-----|
| Free | €0 | 3 | No | No | No | No | No | No |
| Pro | €4.99 | ∞ (1 utente) | No | No | No | No | No | No |
| **PMI Starter** | **€49** | **100** | **3 utenti** | **Base** | No | Storico | Sì (API key) | Best effort |
| **PMI Pro** | **€99** | **300** | **10 utenti** | **Branded** | Sì | Avanzata | Sì (10 req/min) | 99% uptime |

### Tier mapping

```typescript
// PMI Starter → Associate tier (Gemini Pro / Haiku)
// PMI Pro     → Partner tier (Sonnet / GPT-5)
const PLAN_TO_TIER: Record<string, TierLevel> = {
  free: "intern",
  pro: "associate",
  pmi: "associate",
  partner: "partner",
};
```

---

## Architettura tecnica

### 1. Modello dati

Nuova tabella `organizations` (multi-tenant):

```sql
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text default 'pmi_starter' check (plan in ('pmi_starter', 'pmi_pro')),
  analyses_count int default 0,        -- reset mensile
  analyses_limit int default 100,      -- 100 Starter / 300 Pro
  logo_url text,                       -- branding PMI Pro
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now()
);

create table public.organization_members (
  org_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'member' check (role in ('owner', 'admin', 'member')),
  primary key (org_id, user_id)
);
```

Modifica `analyses`: aggiungere `org_id uuid references organizations(id)` nullable (null = analisi personale non-PMI).

### 2. Auth e inviti

- Owner invita membri via email (link magico Supabase)
- RLS: `analyses` visibili a tutti i membri della stessa org
- Limit check: `organization.analyses_count` invece di `profile.analyses_count`

### 3. Usage limits (lib/stripe.ts)

```typescript
export const PLANS = {
  // ...existing...
  pmi: {
    price: 49,
    analysesPerMonth: 100,
    deepSearchLimit: Infinity,
    apiAccess: true,
    teamSize: 3,
  },
  partner: {
    price: 99,
    analysesPerMonth: 300,
    deepSearchLimit: Infinity,
    apiAccess: true,
    apiRateLimit: 10,  // req/min
    teamSize: 10,
    sla: 0.99,
  },
};
```

### 4. Report PDF brandizzato

**Libreria**: `@react-pdf/renderer` o `puppeteer` (server-side)

Flusso:
1. Analisi completata → genera HTML report (già esiste come JSON)
2. `POST /api/report/[analysisId]/pdf` → puppeteer/chromium genera PDF
3. Upload su Supabase Storage (`reports/orgId/analysisId.pdf`)
4. URL firmata valida 1h restituita all'utente

**Branding PMI Pro**: upload logo aziendale → `organizations.logo_url`; iniettato nel template PDF.

**Costo stimato**: puppeteer su Vercel = serverless function con layer Chromium (~50MB). Alternativa: [Browserless.io](https://browserless.io) $50/mese hosted.

### 5. API key endpoint

```
POST /api/pmi/api-key        → genera HMAC key per utente PMI
GET  /api/pmi/usage          → usage stats per API key
POST /api/analyze-batch      → analisi batch (max 10 doc per request)
```

### 6. Integrazione Google Drive / Dropbox

**Pattern**: OAuth2 server-side, store tokens in `org_integrations` table.

```sql
create table public.org_integrations (
  id uuid primary key,
  org_id uuid references organizations(id),
  provider text check (provider in ('google_drive', 'dropbox', 'onedrive')),
  access_token text,     -- encrypted con pgp_sym_encrypt
  refresh_token text,    -- encrypted
  expires_at timestamptz,
  folder_id text,        -- cartella monitorata
  created_at timestamptz
);
```

Sync flow: webhook Zapier/Make → `POST /api/integrations/drive/sync` → scarica file → invia ad analyze.
MVP: solo upload manuale da Drive link; full sync è Phase 2.

### 7. Dashboard storico contratti

**Pagina**: `/dashboard/org` — visualizza tutti gli `analyses` dell'org
**Filtri**: per utente, per tipo documento, per mese
**Metriche**: fairness score medio, tipo più comune, trend
**Export**: CSV download degli ultimi 30 giorni

### 8. Provider lock — Security

**Decisione critica**: i dati PMI sono più sensibili dei dati consumer.

Regola: **nessun dato di contratto PMI esce dal perimetro IT/EU**.

Provider consentiti per PMI:
- Anthropic (USA, model processing, nessun training su dati cliente)
- Google Gemini (USA, con DPA enterprise)
- Mistral (EU, consentito solo con DPA firmato)
- DeepSeek (server in Cina — VIETATO per PMI)
- Groq/Cerebras (infrastruttura US shared, no DPA PMI — VIETATO)

Implementazione: in `lib/tiers.ts`, piano PMI usa catena ridotta:
```typescript
pmi: {
  primary: "claude-sonnet-4-5",
  fallback: ["gemini-2-5-flash", "mistral-large"],
  forbidden: ["deepseek-v3", "groq-llama-4", "cerebras-llama-3-3"],
}
```

### 9. Stripe

Prodotti aggiuntivi:
- `STRIPE_PMI_STARTER_PRICE_ID` — €49/mese recurring
- `STRIPE_PMI_PRO_PRICE_ID` — €99/mese recurring

Webhook: `customer.subscription.created/updated/deleted` → aggiorna `organizations.plan`.

---

## Costi stimati (piano PMI a pieno carico)

- 100 analisi/mese × ~$0.01 = **$1/utente/mese** (Tier Associate)
- Margine: €49 - €1.20 (costi) - €5 (Stripe fee) - €5 (infra) = **€37.80/utente/mese**
- Break-even: 10 utenti PMI → copertura costi infra base

---

## Impatto sulla codebase

| Componente | Effort | Note |
|-----------|--------|------|
| DB migration (org + members) | 2h | 1 migrazione SQL |
| Auth multi-tenant (RLS update) | 3h | Policy update su analyses |
| PDF report (basic) | 4h | @react-pdf o Puppeteer |
| API key + batch endpoint | 3h | HMAC + rate limiting |
| Drive integration (MVP link) | 2h | Solo upload da URL |
| Dashboard org | 6h | Nuova pagina con query |
| Stripe (2 nuovi piani) | 2h | Prodotti + webhook |
| Provider lock PMI | 1h | Flag in tiers.ts |
| **TOTALE** | **~23h** | 3 sprint |

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Chromium su Vercel: layer ~50MB, cold start ~3s | Media | Medio | Usare Browserless.io hosted o react-pdf (no browser) |
| GDPR multi-tenant: contratti PMI contengono dati dipendenti | Alta | Alto | DPA con ogni cliente PMI + terms of service aggiornati |
| Pricing troppo alto: €49 può essere una barriera | Media | Medio | Free trial 14 giorni |
| Drive OAuth revoke: token scade, sync si interrompe | Media | Basso | Cron check + email alert |
| Abuso API key | Media | Alto | Rate limiting Upstash + alerting su anomalie |
| Churn dopo primo mese | Alta | Alto | Onboarding guidato + 14 giorni trial |
| Costo modelli su analisi massive | Media | Medio | Tier Associate = Gemini Pro (free 250 req/day) o Haiku (~$0.001/doc) |

---

## Roadmap

1. Q1 2026: implementazione DB + Stripe (2 sprint)
2. Q2 2026: API access + export + landing page PMI
3. Q3 2026: piano PMI Pro + team collaboration + dashboard org
4. Q4 2026: corpus custom per PMI Pro + Drive full sync

---

## Next Steps

1. Approvazione CME
2. Conferma pricing con Marketing
3. DPA template con consulente legale
4. Apertura task implementazione (milestone "PMI Sprint")
5. Landing page PMI (separata dalla landing consumer)
