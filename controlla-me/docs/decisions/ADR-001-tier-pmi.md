# ADR-001 — Tier PMI / Professionisti: €49-99/mese

**Data**: 2026-03-01
**Stato**: PROPOSTA — in attesa di approvazione CME
**Autore**: Architecture Dept (claude-code)
**Task**: bf91b1d6

---

## Contesto

Marketing ha identificato un gap di mercato: HR manager, agenti immobiliari e piccoli imprenditori (PMI) necessitano di analisi documentali frequenti e massive, incompatibili con il piano Pro (€4.99 — max 3 analisi/mese free + Infinity Pro) sia per volume che per natura del lavoro professionale.

Il segmento PMI si distingue dal consumatore finale per:
- Volume: 50-500 documenti/mese
- Tipologia: contratti omogenei in batch (es. 50 contratti di affitto identici per un agente immobiliare)
- Esigenze: API access, export CSV/JSON, team collaboration, SLA
- Budget: €49-99/mese sostenibili su budget aziendale

---

## Decisione

### Piano PMI — €49/mese

| Parametro | Valore |
|-----------|--------|
| Analisi/mese | 100 |
| Deep search | Illimitate |
| Modello analisi | Tier Associate (Gemini Pro / Haiku) |
| API access | Sì — via API key dedicata |
| Export | JSON + PDF report |
| SLA | Best effort (no SLA garantito) |
| Verticali | Solo legale (consumer contracts) |
| Team | 1 utente |

### Piano Partner — €99/mese

| Parametro | Valore |
|-----------|--------|
| Analisi/mese | 500 |
| Deep search | Illimitate |
| Modello analisi | Tier Partner (Sonnet / GPT-5) |
| API access | Sì — rate limit 10 req/min |
| Export | JSON + PDF + DOCX |
| SLA | 99% uptime mensile |
| Verticali | Legale + HR (quando disponibile) |
| Team | 3 utenti |
| Corpus custom | Upload normativa settoriale (fase 2) |

---

## Implementazione tecnica

### 1. Database

```sql
-- Aggiungere a profiles:
ALTER TABLE profiles
  ADD COLUMN plan_tier TEXT DEFAULT 'consumer'
    CHECK (plan_tier IN ('consumer', 'pmi', 'partner')),
  ADD COLUMN api_key TEXT UNIQUE,
  ADD COLUMN api_key_created_at TIMESTAMPTZ,
  ADD COLUMN team_id UUID REFERENCES teams(id);

-- Nuova tabella teams
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('pmi', 'partner')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Tier mapping (lib/tiers.ts)

```typescript
// PMI → Associate tier (Gemini Pro / Haiku)
// Partner → Partner tier (Sonnet / GPT-5)
const PLAN_TO_TIER: Record<string, TierLevel> = {
  free: "intern",
  pro: "associate",
  pmi: "associate",
  partner: "partner",
};
```

### 3. Usage limits (lib/stripe.ts)

```typescript
export const PLANS = {
  // ...existing...
  pmi: {
    price: 49,
    analysesPerMonth: 100,
    deepSearchLimit: Infinity,
    apiAccess: true,
    teamSize: 1,
  },
  partner: {
    price: 99,
    analysesPerMonth: 500,
    deepSearchLimit: Infinity,
    apiAccess: true,
    apiRateLimit: 10,  // req/min
    teamSize: 3,
    sla: 0.99,
  },
};
```

### 4. API key endpoint

```
POST /api/pmi/api-key        → genera HMAC key per utente PMI
GET  /api/pmi/usage          → usage stats per API key
POST /api/analyze-batch      → analisi batch (max 10 doc per request)
```

### 5. Stripe products necessari

- `STRIPE_PMI_PRICE_ID=price_xxx` (€49/mese ricorrente)
- `STRIPE_PARTNER_PRICE_ID=price_yyy` (€99/mese ricorrente)

---

## Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Abuso API key | Media | Alto | Rate limiting Upstash + alerting su anomalie |
| Costo modelli su analisi massive | Media | Medio | Tier Associate = Gemini Pro (free 250 req/day) o Haiku (~$0.001/doc) |
| Supporto PMI richiede assistenza | Alta | Medio | Documentazione + email support (no phone) |
| Churn dopo primo mese | Alta | Alto | Onboarding guidato + 14 giorni trial |

---

## Costi stimati (piano PMI a pieno carico)

- 100 analisi/mese × ~$0.01 = **$1/utente/mese** (Tier Associate)
- Margine: €49 - €1.20 (costi) - €5 (Stripe fee) - €5 (infra) = **€37.80/utente/mese**
- Break-even: 10 utenti PMI → copertura costi infra base

---

## Raccomandazione

**APPROVA piano PMI a €49. Lancia entro Q2 2026.**

Roadmap suggerita:
1. Q1 2026: implementazione DB + Stripe (2 sprint)
2. Q2 2026: API access + export + landing page PMI
3. Q3 2026: piano Partner + team collaboration
4. Q4 2026: corpus custom per Partner

Il piano Partner (€99) è più complesso (SLA, team) — posticipare a Q3.
