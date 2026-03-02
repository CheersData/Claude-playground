# ADR-TD1: Migrazione analysis-cache da filesystem a Supabase

**Data**: 2026-03-01
**Stato**: Proposta
**Autore**: Architecture Dept.
**Riferimento tech debt**: TD-1 (`lib/analysis-cache.ts`)

---

## 1. Contesto

### Problema attuale

`lib/analysis-cache.ts` persiste le sessioni di analisi sul **filesystem locale** nella directory `.analysis-cache/`. Ogni sessione viene serializzata come file JSON con nome `{sessionId}.json`.

Questa implementazione ha tre conseguenze critiche in produzione su Vercel:

1. **Multi-istanza**: Vercel scala orizzontalmente. Ogni istanza ha il proprio filesystem effimero e isolato. Una sessione avviata sull'istanza A non è visibile all'istanza B. La ripresa di sessioni interrotte (resume) e la deduplicazione per hash documento sono rotte in questo scenario.

2. **Filesystem effimero**: I filesystem delle istanze Vercel vengono ricreati a ogni deploy. Tutte le sessioni in corso vengono perse a ogni rilascio.

3. **TD-1 secondario**: `savePhaseTiming()` esegue 2 operazioni di I/O separate per fase (leggi sessione + riscrivi sessione), per un totale di 8 roundtrip nell'intera pipeline. In filesystem locale il costo è trascurabile; su I/O di rete (alternativa Redis/DB) il costo diventa misurabile.

### Impatto attuale

| Ambiente | Impatto |
|----------|---------|
| Sviluppo locale (demo) | Nessuno — filesystem locale funziona correttamente |
| Produzione Vercel (single instance) | Basso — funziona finché c'è una sola istanza attiva |
| Produzione Vercel (multi-instance) | **Critico** — resume e deduplicazione non funzionano |

Il problema è latente: non si manifesta in demo ma si attiva non appena il traffico giustifica lo scale-out automatico di Vercel (tipicamente >10 req/s concorrenti).

### Funzionalità impattate

- `resumeSessionId`: il client può riprendere un'analisi interrotta — **rotto in multi-istanza**
- Deduplicazione per hash documento: evita di rianalizzare lo stesso file — **rotto in multi-istanza**
- `getAverageTimings()`: medie dai tempi delle ultime 30 sessioni per calibrare la progress bar — **dati parziali in multi-istanza**

---

## 2. Opzioni valutate

### Opzione A — Supabase `analysis_sessions` table (CONSIGLIATA)

Sostituire il filesystem con una tabella PostgreSQL su Supabase, già presente nel progetto.

**Pro:**
- Zero nuove dipendenze — Supabase è già nel progetto (`@supabase/ssr`, client server/browser)
- RLS nativa — le sessioni anonime e autenticate sono gestite con la stessa infrastruttura delle tabelle `analyses` e `profiles`
- Persistenza cross-deploy e cross-istanza garantita
- Supporto JSONB per i campi `classification`, `analysis`, `investigation`, `advice`, `phase_timing` — schema identico alla cache attuale
- Indici HNSW già operativi — la stessa infrastruttura regge il vector DB; aggiungere indici B-tree su `document_hash` è banale
- TTL tramite `expires_at` + cron Edge Function (già pianificato per `reset_monthly_analyses`)
- `savePhaseTiming()` può essere riscritta con `jsonb_set` atomico — risolve anche il TD-1 secondario (8 roundtrip → 4 UPDATE atomici)

**Contro:**
- Latenza per singola operazione ~5-20ms (vs filesystem locale ~0.1ms) — trascurabile rispetto ai tempi degli agenti AI (12-30s per fase)
- Richiede migrazione SQL (migration 016)

### Opzione B — Vercel KV (Redis managed da Vercel)

Usare il servizio Redis gestito di Vercel (basato su Upstash).

**Pro:**
- Integrazione nativa con Vercel — zero configurazione infrastrutturale
- Latenza sub-millisecondo per operazioni semplici

**Contro:**
- Nuova dipendenza vendor (lock-in Vercel KV)
- Piano gratuito molto limitato (256MB storage, 30k req/giorno)
- Redis non ha RLS — serve implementare autorizzazione manualmente
- Serializzazione JSON esplicita per strutture complesse
- Upstash Redis è già usato per rate-limiting (`UPSTASH_REDIS_REST_URL`) — due cluster Redis distinti aumentano la complessità operativa

### Opzione C — Upstash Redis (già usato per rate-limiting)

Usare lo stesso cluster Upstash Redis già configurato per il rate-limiting in `lib/middleware/rate-limit.ts`.

**Pro:**
- Infrastruttura già presente e configurata (variabili d'ambiente già in `.env.local.example`)
- Latenza sub-millisecondo

**Contro:**
- Mescolare cache sessioni e rate-limit sullo stesso cluster: se il cluster è pieno o ha problemi, entrambe le feature sono impattate
- Piano Upstash free: 10k comandi/giorno — esauribile rapidamente con molte analisi
- Nessuna RLS — stesse problematiche di Opzione B
- TTL gestito manualmente (no indici, no query per hash)

---

## 3. Decisione

**Opzione A — Supabase `analysis_sessions` table.**

Motivazioni:
1. **Zero dipendenze nuove**: l'intera infrastruttura (client, RLS, JSONB, indici) è già operativa.
2. **Consistenza architetturale**: tutte le entità persistenti del progetto (profili, analisi, corpus, knowledge) vivono su Supabase. Aggiungere una sessione effimera su un sistema separato introduce dualismo senza benefici concreti.
3. **Risolve TD-1 secondario gratuitamente**: `jsonb_set` atomico in un singolo UPDATE per fase elimina i 2 roundtrip attuali.
4. **Latenza accettabile**: le operazioni di cache sono eseguite tra le fasi degli agenti AI (12-30s ciascuna). Un overhead di 10-20ms per operazione Supabase è inferiore all'1% del tempo totale.

---

## 4. Schema proposto

```sql
-- Migration: supabase/migrations/016_analysis_sessions.sql

CREATE TABLE analysis_sessions (
  id TEXT PRIMARY KEY,                    -- sessionId (es. "a1b2c3d4e5f6g7h8-lx3abc")
  document_hash TEXT NOT NULL,            -- SHA256 primari 16 char del documento
  user_id UUID REFERENCES profiles(id),   -- nullable: analisi non autenticate
  classification JSONB,
  analysis JSONB,
  investigation JSONB,
  advice JSONB,
  phase_timing JSONB DEFAULT '{}',
  status TEXT DEFAULT 'in_progress',      -- in_progress | complete | failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- Indice per deduplicazione documento (ricerca per hash)
CREATE INDEX idx_analysis_sessions_hash ON analysis_sessions(document_hash);

-- Indice per storico utente (future dashboard)
CREATE INDEX idx_analysis_sessions_user ON analysis_sessions(user_id);

-- Indice per cleanup TTL (cron job)
CREATE INDEX idx_analysis_sessions_expires ON analysis_sessions(expires_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_analysis_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_analysis_sessions_updated_at
  BEFORE UPDATE ON analysis_sessions
  FOR EACH ROW EXECUTE FUNCTION update_analysis_sessions_updated_at();

-- RLS
ALTER TABLE analysis_sessions ENABLE ROW LEVEL SECURITY;

-- Sessioni autenticate: visibili solo al proprietario
CREATE POLICY "analysis_sessions_owner" ON analysis_sessions
  FOR ALL USING (user_id = auth.uid());

-- Sessioni anonime: accessibili tramite sessionId (nessuna RLS su user_id NULL)
-- Il server usa service_role per le operazioni server-side, bypassa RLS
CREATE POLICY "analysis_sessions_anon_insert" ON analysis_sessions
  FOR INSERT WITH CHECK (user_id IS NULL);

CREATE POLICY "analysis_sessions_anon_select" ON analysis_sessions
  FOR SELECT USING (user_id IS NULL);
```

### Pattern `savePhaseTiming` atomico (risolve TD-1 secondario)

```typescript
// Invece di: leggi sessione → aggiorna campo → riscrivi sessione (2 roundtrip)
// Usa UPDATE con jsonb_set atomico (1 roundtrip):
await supabase
  .from("analysis_sessions")
  .update({
    phase_timing: supabase.rpc("jsonb_set_deep", {
      target: "phase_timing",
      path: `{${phase}}`,
      value: timingData,
    }),
  })
  .eq("id", sessionId);
```

---

## 5. Piano di migrazione

### Fase 1 — Schema (0.5 giorni)

- [ ] Scrivere `supabase/migrations/016_analysis_sessions.sql` con schema, indici, trigger, RLS
- [ ] Eseguire la migrazione su Supabase SQL Editor (dev + prod)
- [ ] Verificare indici e policy con `\d analysis_sessions`

### Fase 2 — Adapter (0.5 giorni)

- [ ] Creare `lib/analysis-cache-supabase.ts` con la stessa interfaccia pubblica di `lib/analysis-cache.ts`:
  - `createSession(documentHash, userId?)` → `string` (sessionId)
  - `loadSession(sessionId)` → `AnalysisSession | null`
  - `findSessionByHash(documentHash)` → `AnalysisSession | null`
  - `savePhase(sessionId, phase, data)` → `void`
  - `savePhaseTiming(sessionId, phase, timing)` → `void` (atomico con jsonb_set)
  - `completeSession(sessionId)` → `void`
  - `getAverageTimings()` → `PhaseTimings`
- [ ] Usare `supabaseAdmin` (service role) per le operazioni server-side — bypassa RLS, necessario per sessioni anonime

### Fase 3 — Switch (0.25 giorni)

- [ ] In `app/api/analyze/route.ts`: sostituire import `lib/analysis-cache` → `lib/analysis-cache-supabase`
- [ ] Test manuale: avviare analisi, verificare riga in `analysis_sessions`, verificare resume
- [ ] Test multi-istanza simulato: due tab browser, stesso documento — deve restituire la stessa sessione

### Fase 4 — Cleanup (0.25 giorni)

- [ ] Rimuovere `lib/analysis-cache.ts` (o rinominare in `.legacy.ts` per 1 sprint)
- [ ] Aggiungere `.analysis-cache/` a `.gitignore` se non presente (già presente — OK)
- [ ] Aggiungere cron job per cleanup TTL: `DELETE FROM analysis_sessions WHERE expires_at < NOW()`
  - Opzione: Edge Function schedulata su Supabase (già pianificata per `reset_monthly_analyses`)

---

## 6. Rischi e mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Sessioni anonime senza RLS leakage | Bassa | Alto | Usare `service_role` solo lato server; il client browser non accede mai a `analysis_sessions` direttamente |
| Supabase momentaneamente non disponibile durante analisi | Molto bassa | Alto | Il fallback attuale (filesystem) può restare attivo in parallelo durante la transizione. In produzione: circuit breaker con retry su `loadSession` |
| Costo query Supabase su alto volume | Bassa | Basso | ~4 UPDATE + 2 SELECT per analisi. A $0.09/milione req Supabase, il costo è trascurabile anche a 10k analisi/giorno |
| Accumulo di sessioni `in_progress` orfane | Media | Basso | Il cron di cleanup TTL (expires_at 7gg) le rimuove automaticamente. Il dashboard `/ops` può mostrare il conteggio |
| Breaking change interfaccia pubblica | Bassa | Medio | L'adapter replica esattamente l'interfaccia di `analysis-cache.ts` — nessun cambiamento ai chiamanti |

---

## 7. Stima effort

| Fase | Effort stimato |
|------|---------------|
| Fase 1 — Schema SQL | 0.5 giorni |
| Fase 2 — Adapter Supabase | 0.5 giorni |
| Fase 3 — Switch e test | 0.25 giorni |
| Fase 4 — Cleanup e cron | 0.25 giorni |
| **Totale** | **~1-2 giorni** |

Il range 1-2 giorni dipende dalla complessità dei test di verifica multi-istanza e dall'eventuale necessità di gestire edge case sulla migrazione di sessioni in volo.

---

## 8. Riferimenti

- `lib/analysis-cache.ts` — implementazione filesystem corrente
- `app/api/analyze/route.ts` — chiamante principale
- `supabase/migrations/001_initial.sql` — schema esistente (profiles, analyses, RLS)
- `lib/supabase/admin.ts` — client service_role già disponibile
- CLAUDE.md §18 — Tech Debt TD-1
- CLAUDE.md §6 — Sistema di Cache (documentazione attuale)
