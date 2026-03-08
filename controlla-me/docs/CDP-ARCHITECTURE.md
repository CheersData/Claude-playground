# Customer Data Profile (CDP) — Architettura

> **Versione**: 1.0 — 2026-03-08
>
> Il CDP e il primo passo verso la trasformazione di Controlla.me da app di analisi legale a **piattaforma multi-agente**.
> Unifica i dati sparsi in un profilo cliente coerente, bonificato e GDPR-compliant.

---

## 1. Dati gia raccolti (AS-IS)

### 1.1 Tabella `profiles`

| Campo | Tipo | Note |
|-------|------|------|
| id | uuid | FK auth.users |
| email | text | Da OAuth |
| full_name | text | Da OAuth metadata |
| plan | text | 'free' / 'pro' |
| analyses_count | int | Contatore utilizzo |
| stripe_customer_id | text | Nullable |
| created_at | timestamptz | Data registrazione |

### 1.2 Tabella `analyses` (per utente)

Ogni analisi contiene JSONB ricchi con:
- **classification**: tipo documento, sotto-tipo, parti, giurisdizione, leggi applicabili, istituti giuridici
- **analysis**: clausole rischiose, elementi mancanti, rischio complessivo, aspetti positivi
- **investigation**: findings legali con riferimenti normativi e giurisprudenza
- **advice**: fairness score multidimensionale, rischi, azioni, necessita avvocato

### 1.3 Tabella `deep_searches`

Domande poste dall'utente su clausole specifiche -- rivela interessi e preoccupazioni reali.

### 1.4 Tabella `lawyer_referrals`

Specializzazione e regione richiesta -- indica il profilo di rischio e la geografia dell'utente.

### 1.5 Tabella `agent_cost_log`

Utilizzo API per sessione -- permette analisi del costo per utente.

### 1.6 Dati impliciti non raccolti (oggi)

- Frequenza di accesso e pattern temporali
- Tipi di documento preferiti (contratto affitto vs. lavoro vs. acquisto)
- Livello medio di rischio nei documenti analizzati
- Settore/industria dell'utente
- Comportamento di navigazione nel corpus legislativo
- Tasso di conversione deep search / lawyer referral

---

## 2. CDP Schema — Profilo Unificato

### 2.1 Principi di design

1. **JSONB flessibile** — Il profilo evolve senza migrazioni DB per ogni nuovo campo
2. **Event-sourced** — Ogni modifica e un evento tracciabile, il profilo e una vista materializzata
3. **Privacy-first** — Solo dati necessari, nessun dato sensibile in chiaro, retention policy
4. **Incrementale** — Si arricchisce ad ogni interazione, non richiede onboarding esplicito

### 2.2 Struttura `customer_profiles`

```
customer_profiles
├── user_id (PK, FK profiles.id)
├── identity {}
│   ├── email_domain         -- dominio email (non l'email intera)
│   ├── account_type         -- 'individual' | 'business' | 'professional'
│   ├── inferred_sector      -- settore derivato dai documenti analizzati
│   ├── inferred_region      -- regione derivata da giurisdizione/referral
│   └── signup_source        -- 'organic' | 'referral' | 'campaign'
│
├── behavior {}
│   ├── total_analyses       -- contatore totale (storico)
│   ├── analyses_last_30d    -- contatore rolling 30 giorni
│   ├── avg_session_duration_ms -- durata media sessione
│   ├── preferred_doc_types  -- ["contratto_lavoro", "locazione"] ordinati per frequenza
│   ├── deep_search_rate     -- % analisi seguite da deep search
│   ├── corpus_queries       -- contatore query al corpus
│   ├── last_active_at       -- ultimo accesso
│   └── engagement_score     -- 0-100, calcolato da frequenza + profondita
│
├── risk_profile {}
│   ├── avg_fairness_score   -- media fairness score documenti analizzati
│   ├── risk_distribution    -- { "critical": 2, "high": 5, "medium": 8, "low": 3 }
│   ├── common_risk_areas    -- ["clausole_vessatorie", "recesso", "penali"]
│   ├── needs_lawyer_rate    -- % analisi che raccomandano avvocato
│   └── legal_literacy       -- 'low' | 'medium' | 'high' (derivato dal tipo di domande)
│
├── preferences {}
│   ├── preferred_language   -- sempre 'it' per ora, futuro multi-lingua
│   ├── notification_opt_in  -- consenso notifiche
│   ├── lawyer_interest      -- ha mai cliccato su referral avvocato
│   └── corpus_interests     -- aree giuridiche esplorate nel corpus
│
├── lifecycle {}
│   ├── stage               -- 'new' | 'activated' | 'engaged' | 'power_user' | 'churning' | 'churned'
│   ├── first_analysis_at    -- data prima analisi completata
│   ├── plan_history         -- [{ plan, from, to }] cronologia piani
│   ├── conversion_signals   -- eventi che indicano propensione a upgrade
│   └── churn_risk           -- 0-100, calcolato da inattivita + pattern
│
├── computed_at (timestamptz) -- ultimo ricalcolo profilo
└── version (int)            -- versioning ottimistico per concorrenza
```

### 2.3 Struttura `profile_events`

Event log immutabile (append-only). Ogni evento genera un ricalcolo incrementale del profilo.

```
profile_events
├── id (uuid PK)
├── user_id (FK profiles.id)
├── event_type
│   ├── 'analysis_completed'
│   ├── 'deep_search_performed'
│   ├── 'corpus_query'
│   ├── 'lawyer_referral_requested'
│   ├── 'plan_changed'
│   ├── 'login'
│   └── 'profile_updated'
├── event_data (JSONB)      -- payload specifico per tipo
├── created_at (timestamptz)
└── processed (boolean)     -- flag per pipeline di ricalcolo
```

---

## 3. Data Cleansing Pipeline

### 3.1 Validazione input

Ogni dato in ingresso passa per il modulo `lib/cdp/data-cleanser.ts`:

| Regola | Descrizione | Esempio |
|--------|-------------|---------|
| **Email normalization** | Lowercase, trim, dominio validato | `" User@Gmail.COM " -> "user@gmail.com"` |
| **Name normalization** | Trim, title case, rimozione caratteri speciali | `"  mario ROSSI " -> "Mario Rossi"` |
| **Document type mapping** | Normalizza tipi documento a enum standard | `"Contratto Lavoro" -> "contratto_lavoro"` |
| **Region normalization** | Normalizza regioni italiane | `"Lazio" / "lazio" / "RM" -> "lazio"` |
| **Score clamping** | Fairness score sempre in range 1.0-10.0 | `11.5 -> 10.0`, `0 -> 1.0` |
| **XSS sanitization** | Rimozione HTML/script da testi liberi | Usa `sanitizeQuestion()` esistente |
| **Date validation** | ISO 8601, non nel futuro, non prima del 2024 | Rifiuta date invalide |

### 3.2 Deduplicazione

- **Analisi duplicate**: stesso `document_hash` dallo stesso utente in < 24h -> merge
- **Eventi duplicate**: stesso `event_type` + `user_id` in < 1 secondo -> ignora
- **Profili orfani**: profile senza `auth.users` corrispondente -> flag per cleanup

### 3.3 Normalizzazione tipi documento

Mappa i `documentType` dal Classifier (testo libero) a una tassonomia controllata:

```typescript
const DOCUMENT_TYPE_MAP: Record<string, string> = {
  "contratto_di_lavoro": "contratto_lavoro",
  "contratto lavoro": "contratto_lavoro",
  "employment_contract": "contratto_lavoro",
  "contratto_locazione": "locazione",
  "contratto di locazione": "locazione",
  "lease_agreement": "locazione",
  "contratto_vendita": "compravendita",
  "contratto_acquisto": "compravendita",
  // ... mappatura completa in data-cleanser.ts
};
```

### 3.4 Inferenza dati

Il CDP arricchisce il profilo con inferenze derivate:

| Campo derivato | Fonte | Logica |
|---------------|-------|--------|
| `inferred_sector` | `classification.documentType` + frequenza | Se 60%+ analisi sono contratti di lavoro -> "HR/employment" |
| `inferred_region` | `classification.jurisdiction` + `lawyer_referrals.region` | Regione piu frequente |
| `legal_literacy` | Tipo di domande nel deep search + corpus queries | Domande tecniche = high, generiche = low |
| `engagement_score` | Frequenza + varieta + profondita | Formula pesata su attivita ultimi 30gg |
| `churn_risk` | Inattivita + stage lifecycle | Giorni dall'ultimo accesso / media storica |
| `lifecycle.stage` | Regole basate su behavior | Vedi sezione 3.5 |

### 3.5 Lifecycle stage rules

```
new         -> 0 analisi, account < 7 giorni
activated   -> 1+ analisi completata
engaged     -> 3+ analisi negli ultimi 30 giorni
power_user  -> 10+ analisi totali AND attivo negli ultimi 14 giorni AND (pro OR deep_search_rate > 0.3)
churning    -> era engaged/power_user, inattivo da 21-60 giorni
churned     -> inattivo da 60+ giorni
```

---

## 4. Privacy e GDPR Compliance

### 4.1 Principi

| Principio GDPR | Implementazione |
|----------------|-----------------|
| **Minimizzazione** | Solo dati necessari per il servizio. No tracking comportamentale esterno |
| **Limitazione finalita** | CDP usato solo per personalizzazione servizio, mai venduto a terzi |
| **Limitazione conservazione** | `profile_events` TTL 365 giorni. Profili eliminati con account |
| **Accuratezza** | Pipeline di bonifica automatica. Utente puo correggere |
| **Integrita e riservatezza** | RLS Supabase, email non in chiaro nel CDP (solo dominio), encryption at rest |

### 4.2 Data retention

| Dato | Retention | Motivazione |
|------|-----------|-------------|
| `profile_events` | 365 giorni | Sufficiente per calcoli rolling, poi aggregati |
| `customer_profiles` | Vita account + 30 giorni post-eliminazione | GDPR art. 17 |
| Dati aggregati (contatori, medie) | Indefinito | Anonimizzati, non personali |

### 4.3 Diritti utente

- **Accesso (art. 15)**: API endpoint `GET /api/cdp/profile` restituisce il profilo completo
- **Rettifica (art. 16)**: Campi `preferences` modificabili dall'utente
- **Cancellazione (art. 17)**: Elimina `customer_profiles` + `profile_events` su account deletion
- **Portabilita (art. 20)**: Export JSON del profilo completo + eventi

### 4.4 Cosa NON raccogliamo

- Testo dei documenti analizzati (gia non persistito dopo l'analisi)
- Indirizzo IP dell'utente nel CDP
- Dati di navigazione (pagine visitate, click)
- Informazioni finanziarie oltre al piano Stripe
- Dati personali delle parti nei documenti (nomi, CF, indirizzi)

---

## 5. Integrazione con il sistema esistente

### 5.1 Trigger points

Il CDP si aggiorna in risposta a eventi gia presenti nel sistema:

```
POST /api/analyze (completata)
  -> profile_event('analysis_completed', { docType, fairnessScore, riskLevel, ... })
  -> profile-builder.updateFromAnalysis()

POST /api/deep-search (completata)
  -> profile_event('deep_search_performed', { clauseId, topic })
  -> profile-builder.updateFromDeepSearch()

POST /api/corpus/ask (risposta)
  -> profile_event('corpus_query', { topic, confidence })
  -> profile-builder.updateFromCorpusQuery()

POST /api/webhook (Stripe)
  -> profile_event('plan_changed', { from, to })
  -> profile-builder.updateFromPlanChange()

OAuth callback
  -> profile_event('login', {})
  -> profile-builder.touchLastActive()
```

### 5.2 Pattern di integrazione

L'aggiornamento CDP e **fire-and-forget** — non blocca mai il flusso principale.
Se il CDP fallisce, l'analisi/query continua normalmente. Log errore per debug.

```typescript
// Pattern in ogni API route
try {
  await updateCDPFromEvent(userId, 'analysis_completed', eventData);
} catch (err) {
  console.error('[CDP] Failed to update profile:', err);
  // Non ri-lanciare — il CDP non deve mai bloccare il flusso
}
```

### 5.3 Architettura futura

Il CDP e progettato per scalare verso:

1. **Personalizzazione prompt**: adattare il tono degli agenti in base a `legal_literacy`
2. **Raccomandazioni proattive**: suggerire analisi basate su `preferred_doc_types`
3. **Onboarding guidato**: flusso diverso per `new` vs `power_user`
4. **Pricing dinamico**: suggerimenti upgrade basati su `engagement_score`
5. **Multi-vertical**: quando Controlla.me espande a HR, il CDP unifica i profili cross-vertical

---

## 6. Schema di implementazione

### 6.1 File

```
supabase/migrations/026_cdp.sql    -- Tabelle, RLS, indici, funzione cleanup
lib/cdp/
├── types.ts                       -- Interfacce TypeScript
├── profile-builder.ts             -- Costruzione e aggiornamento profili
└── data-cleanser.ts               -- Validazione, normalizzazione, bonifica
```

### 6.2 Dipendenze

- Nessuna nuova dipendenza npm
- Usa Supabase admin client esistente (`lib/supabase/admin.ts`)
- Usa sanitization middleware esistente (`lib/middleware/sanitize.ts`)

### 6.3 Migration path

1. Eseguire `026_cdp.sql` su Supabase SQL Editor
2. Per utenti esistenti: eseguire `backfillExistingProfiles()` da `profile-builder.ts`
3. Integrare trigger negli API routes (Phase 2 — non in scope per questa implementazione iniziale)
