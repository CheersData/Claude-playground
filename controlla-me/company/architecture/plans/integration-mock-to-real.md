# Integration: Mock to Real -- Piano di Sviluppo

> Task #918 | Priority: critical | Department: Architecture
> Autore: Architecture Builder | Data: 2026-03-16

---

## Obiettivo

Portare `/integrazione` da shell demo con dati hardcoded a feature funzionale end-to-end.
Questo documento classifica ogni file come REAL, MOCK o MIXED, descrive cosa deve cambiare,
definisce acceptance criteria e ordine di implementazione.

---

## Legenda stati

| Stato | Significato |
|-------|-------------|
| REAL | Codice in produzione, backed da Supabase/API reali |
| MOCK | Dati hardcoded, stub, placeholder -- non funzionale |
| MIXED | Parte reale, parte mock -- richiede intervento chirurgico |

---

## 1. BACKEND API ROUTES

### 1.1 `app/api/integrations/route.ts` -- REAL

GET/POST/DELETE su `integration_connections` via Supabase. Auth + CSRF + rate-limit presenti.

- Stato: **Nessun intervento necessario.**

---

### 1.2 `app/api/integrations/credentials/route.ts` -- REAL

GET/POST/DELETE su credential vault (pgcrypto). Usa `vault-middleware` per auth combinata.

- Stato: **Nessun intervento necessario.**

---

### 1.3 `app/api/integrations/status/route.ts` -- MIXED

**Cosa e' mock:**
- Catalogo statico di 12 connettori hardcoded nell'array `CONNECTOR_CATALOG` (linee ~30-180).
  Ciascuno con descrizione, icona, categoria, pricing, features, `supported_entities` fissi.
- I connettori "coming_soon" (SAP, Odoo, Mailchimp, SendGrid, Personio, BambooHR) sono puro marketing.

**Cosa e' real:**
- Merge con dati DB: query `integration_connections` per user, arricchisce ciascun connettore con
  `status`, `lastSync`, `syncFrequency`, `entityCount` reali.

**Cosa deve cambiare:**
1. Estrarre il catalogo in un file di configurazione dedicato (`lib/integrations/connector-catalog.ts`)
   separando metadata marketing da capability tecniche.
2. Le `supported_entities` devono provenire dal connettore reale (metodo `getEntities()` o schema discovery)
   anziche' essere hardcoded.
3. I connettori "coming_soon" possono restare statici ma devono essere chiaramente separati.

**Acceptance criteria:**
- Catalogo estratto in file dedicato, importato dalla route.
- Per connettori attivi (fatture-in-cloud, google-drive, hubspot, salesforce), `supported_entities`
  viene da una fonte dinamica (connettore o DB).
- I coming_soon non inquinano la logica dei connettori reali.

**Priorita':** P2 (medio) -- non bloccante ma crea confusione architetturale.

---

### 1.4 `app/api/integrations/setup/route.ts` -- REAL

Crea connection + salva field mappings su `entity_mapping_configs` + crea entry sync_log.

- Stato: **Nessun intervento necessario.**

---

### 1.5 `app/api/integrations/dashboard/route.ts` -- MIXED

**Cosa e' mock:**
- L'azione `sync` nel POST handler e' uno **STUB**: aggiorna solo lo stato nel DB senza
  effettivamente invocare la pipeline di sync. Commento nel codice:
  `"In a real implementation, this would trigger the actual sync via a background job"`
- Dopo aver settato `sync_status = 'syncing'`, aspetta 2 secondi con `setTimeout` e poi
  aggiorna a `completed` -- puro teatro.

**Cosa e' real:**
- GET: query reale su `integration_connections` + `integration_sync_log` per errori recenti.
- POST: azioni `pause`, `resume`, `disconnect` aggiornano realmente il DB.

**Cosa deve cambiare:**
1. L'azione `sync` deve invocare la pipeline reale: instanziare il connettore appropriato,
   chiamare `fetchAll()` o `fetchDelta()`, applicare mapping, salvare risultati.
2. Il sync deve essere asincrono (background job o queue) con update progressivo dello stato.
3. Aggiungere SSE endpoint o polling per progress real-time.

**Acceptance criteria:**
- `POST { action: "sync" }` triggera una sync reale che recupera dati dal provider esterno.
- Lo stato transisce correttamente: `syncing` -> `completed` o `syncing` -> `error`.
- Il sync_log registra record_count e duration reali.
- Nessun `setTimeout` artificiale.

**Priorita':** P0 (critico) -- senza sync reale l'intera feature e' una demo.

---

### 1.6 `app/api/integrations/[connectorId]/route.ts` -- MIXED

**Cosa e' mock:**
- `CONNECTOR_META` (linee ~40-250): metadata statico per ogni connettore con entita' hardcoded.
  Es. HubSpot ha `{ id: "contacts", name: "Contacts", recordCount: 12450, ... }` -- il `recordCount`
  e' un numero inventato.
- I `sampleRecords` nei field definitions sono hardcoded.
- Le `features` (`realTimeSync`, `incrementalSync`, `webhookSupport`) sono dichiarate ma non verificate
  contro le capacita' reali del connettore.

**Cosa e' real:**
- Merge con DB: connection status, sync history da `integration_sync_log`, field mappings
  da `entity_mapping_configs`.
- POST: salva field mappings realmente nel DB.

**Cosa deve cambiare:**
1. `recordCount` deve provenire dalla sync reale (ultimo conteggio noto) o da una chiamata
   `count()` al connettore.
2. Le entity definitions (campi, tipi) devono essere generate da schema discovery del connettore
   reale -- la migration 037 ha gia' creato `entity_mapping_configs` per questo.
3. I `sampleRecords` devono mostrare dati reali (ultimi N record dalla sync).
4. Le `features` devono riflettere le capacita' reali del connettore class.

**Acceptance criteria:**
- `recordCount` e' `null` se mai sincronizzato, oppure il conteggio reale dall'ultima sync.
- Entity fields provengono dal risultato di schema discovery o dal connettore.
- Nessun numero magico hardcoded per conteggi o sample data.

**Priorita':** P1 (alto) -- dati falsi nell'UI minano la fiducia dell'utente.

---

### 1.7 `app/api/integrations/[connectorId]/authorize/route.ts` -- REAL

OAuth2 authorize redirect con CSRF state cookie. Supporta google-drive, hubspot, salesforce,
fatture-in-cloud.

- Stato: **Nessun intervento necessario.**

---

### 1.8 `app/api/integrations/[connectorId]/callback/route.ts` -- MIXED

**Cosa e' mock:**
- Importa `getCredentialVault()` da `@/lib/staff/credential-vault` per storage AES-256-GCM
  come seconda copia del token. **Questo file NON ESISTE sul disco.**
  Il glob `lib/staff/credential-vault*` restituisce zero risultati.
- Il dual vault store (pgcrypto + AES-256-GCM) fallisce silenziosamente perche' il secondo
  vault non e' disponibile -- il catch swallows l'errore.

**Cosa e' real:**
- OAuth2 callback completo: state validation, token exchange (con config per-provider),
  pgcrypto vault storage, connection creation, audit logging.

**Cosa deve cambiare:**
1. Decidere: (a) creare `lib/staff/credential-vault.ts` con AES-256-GCM, oppure
   (b) rimuovere il dual vault e usare solo pgcrypto.
   Raccomandazione: opzione (b) -- pgcrypto e' gia' sicuro, il dual vault aggiunge complessita'
   senza beneficio tangibile. Se si vuole defense-in-depth, implementare (a) come task separato.
2. Rimuovere l'import morto e il try-catch silenzioso.

**Acceptance criteria:**
- Nessun import verso file inesistenti.
- Token OAuth2 salvato in un vault funzionante (pgcrypto).
- Il callback completa senza errori silenziosamente swallowed.

**Priorita':** P0 (critico) -- import di file inesistente potrebbe causare build failure.

---

### 1.9 `app/api/integrations/[connectorId]/sync/route.ts` -- MIXED

**Cosa e' mock:**
- `SYNC_HANDLERS` contiene solo `google-drive` e `hubspot`. I connettori `salesforce`,
  `fatture-in-cloud`, `stripe` NON hanno handler di sync.
- La pipeline e' reale per i 2 connettori implementati ma incompleta per gli altri 3.

**Cosa e' real:**
- Per google-drive e hubspot: instanzia connettore, chiama `fetchAll()`, applica `FieldMapper`,
  aggiorna sync_log con conteggio reale.

**Cosa deve cambiare:**
1. Aggiungere sync handler per `fatture-in-cloud` (connettore gia' implementato in
   `lib/staff/data-connector/connectors/fatture-in-cloud.ts`).
2. Aggiungere sync handler per `salesforce` (connettore class esiste?).
3. Valutare se `stripe` necessita un sync handler (potrebbe non essere MVP).

**Acceptance criteria:**
- Almeno fatture-in-cloud ha un sync handler funzionante.
- Ogni connettore nel catalogo "available" ha un corrispondente sync handler.
- Connettori senza handler restituiscono 501 Not Implemented anziche' 500.

**Priorita':** P0 (critico) -- senza handler di sync i connettori non funzionano.

---

## 2. FRONTEND COMPONENTS

### 2.1 `app/integrazione/IntegrazioneClient.tsx` (~1100 righe) -- REAL

Fetcha da `/api/integrations/status`, renderizza ConnectorCard grid con filtri.
Contiene marketing content statico (come funziona, FAQ, comparison).

- Stato: **Nessun intervento necessario** (dipende dalla qualita' dei dati dell'API).

---

### 2.2 `app/integrazione/[connectorId]/ConnectorDetailClient.tsx` (~1600+ righe) -- MIXED

**Cosa e' mock:**
- `CONNECTOR_CONFIGS` (linea ~54+): configurazione hardcoded per-connettore con entita',
  campi, sample data. Duplica `CONNECTOR_META` del backend.
- I record count e sample records sono inventati.
- Il tab "Mapping" mostra entita' da questa config statica.

**Cosa e' real:**
- Fetch da `/api/integrations/[connectorId]` per metadata + connection status.
- Setup wizard invoca API reali per credenziali e attivazione.
- Sync dashboard invoca API reali.

**Cosa deve cambiare:**
1. Eliminare `CONNECTOR_CONFIGS` hardcoded.
2. Le entita' e i campi devono provenire interamente dalla risposta API
   (che a sua volta deve usare schema discovery reale -- vedi 1.6).
3. Il tab Mapping deve caricare i mapping salvati e permettere modifica.

**Acceptance criteria:**
- Zero dati hardcoded nel componente. Tutto viene dall'API.
- Le entita' mostrate corrispondono a quelle realmente disponibili dal connettore.
- Il componente gestisce gracefully il caso "nessuna entita' disponibile" (pre-sync).

**Priorita':** P1 (alto) -- dipende da P0 backend (1.6).

---

### 2.3 `components/integrations/SyncDashboard.tsx` (~780 righe) -- MIXED

**Cosa e' mock:**
- `DEMO_INTEGRATIONS` (linee ~536-580): array di 4 integrazioni fake (Salesforce, HubSpot,
  Stripe, Mailchimp) con conteggi, date, stato inventati. Usato come fallback quando l'API
  fallisce o restituisce array vuoto.
- `DEMO_ERRORS` (linee ~582-613): array di errori fake con timestamp, messaggi, severita'.
- Quando `data?.integrations` e' vuoto o assente, il componente mostra i dati demo come se
  fossero reali -- l'utente non sa che sta vedendo dati finti.

**Cosa e' real:**
- Fetch da `/api/integrations/dashboard`.
- Azioni (sync, pause, resume) chiamano API reali.
- Rendering e layout.

**Cosa deve cambiare:**
1. Rimuovere `DEMO_INTEGRATIONS` e `DEMO_ERRORS`.
2. Quando non ci sono integrazioni: mostrare empty state con CTA "Connetti il tuo primo servizio".
3. Quando l'API fallisce: mostrare error state con retry, non dati fake.

**Acceptance criteria:**
- Zero dati demo/fallback hardcoded.
- Empty state chiaro e utile quando non ci sono connessioni.
- Error state con messaggio e retry button quando l'API fallisce.

**Priorita':** P1 (alto) -- dati fake presentati come reali sono un anti-pattern UX critico.

---

### 2.4 `components/integrations/SetupWizard.tsx` (~540 righe) -- MIXED

**Cosa e' mock:**
- `buildInitialMappings()` (linea ~535): genera confidence score random:
  `confidence: 85 + Math.floor(Math.random() * 15)` -- range 85-99% finto.
- I mapping iniziali non provengono da nessun engine di mapping reale.

**Cosa e' real:**
- OAuth flow via `/api/integrations/[connectorId]/authorize`.
- API key validation via `/api/integrations/credentials`.
- Setup activation via `/api/integrations/setup`.
- Entity selection, frequency selection, review step.

**Cosa deve cambiare:**
1. `buildInitialMappings()` deve chiamare il mapping engine reale
   (`lib/staff/data-connector/mapping/`) che usa regole + Levenshtein + LLM.
2. La confidence deve provenire dal risultato del mapping engine.
3. Aggiungere un endpoint API per auto-mapping: `POST /api/integrations/[connectorId]/auto-map`
   che invoca il FieldMapper backend.

**Acceptance criteria:**
- Confidence scores provengono dal mapping engine reale.
- L'utente puo' vedere e modificare i mapping suggeriti prima di confermare.
- Il mapping engine backend e' invocato almeno al livello rules + similarity.

**Priorita':** P2 (medio) -- il mapping finto non blocca il flow ma degrada la qualita'.

---

### 2.5 `components/integrations/wizard/AuthStep.tsx` -- REAL
### 2.6 `components/integrations/wizard/EntitySelect.tsx` -- REAL
### 2.7 `components/integrations/wizard/FieldMappingStep.tsx` -- REAL
### 2.8 `components/integrations/wizard/FrequencyStep.tsx` -- REAL
### 2.9 `components/integrations/wizard/ReviewStep.tsx` -- REAL

- Stato: **Nessun intervento necessario** (componenti presentazionali, dipendono dai dati).

---

### 2.10 `components/integrations/ConnectorCard.tsx` -- REAL
### 2.11 `components/integrations/IntegrationFilters.tsx` -- REAL
### 2.12 `components/integrations/SyncHistory.tsx` -- REAL

- Stato: **Nessun intervento necessario.**

---

### 2.13 `components/integrations/mapper/*` (14 componenti) -- SCAFFOLDING

SchemaExplorer, TargetSchemaPanel, MappingCanvas, MappingLine, FieldNode, TransformEditor,
EntitySelector, MappingToolbar, SchemaDiscoveryModal, RelationshipGraph, MappingPreview,
ValidationPanel, AutoMapSuggestions, MappingStats.

**Stato:** Componenti UI costruiti ma non integrati in un flusso end-to-end.
Il tab "Mapping" in ConnectorDetailClient li usa parzialmente.

**Cosa deve cambiare:**
1. Collegare SchemaDiscoveryModal a un endpoint reale di schema discovery.
2. Collegare AutoMapSuggestions al mapping engine backend.
3. Verificare che MappingCanvas e MappingLine funzionino con dati reali (non solo mock schema).

**Acceptance criteria:**
- Lo schema mostrato proviene dal connettore reale.
- Le auto-suggestions provengono dal mapping engine.
- L'utente puo' drag-and-drop mapping e salvare nel DB.

**Priorita':** P3 (basso) -- feature avanzata, non bloccante per MVP.

---

## 3. BACKEND LIB / UTILITIES

### 3.1 `lib/credential-vault.ts` -- REAL

SupabaseCredentialVault con pgcrypto RPCs. Funzionante.

- Stato: **Nessun intervento necessario.**

---

### 3.2 `lib/staff/credential-vault` -- MISSING

**Problema:** Importato in `callback/route.ts` come `getCredentialVault()` ma il file non esiste.
Doveva essere il vault AES-256-GCM come seconda copia di sicurezza.

**Decisione necessaria:**
- Opzione A: Creare il file con implementazione AES-256-GCM (defense-in-depth).
- Opzione B: Rimuovere il dual vault pattern e usare solo pgcrypto (semplicita').
- **Raccomandazione: Opzione B per MVP.** pgcrypto e' gia' crittografia at-rest.
  AES-256-GCM si puo' aggiungere come hardening post-MVP.

**Acceptance criteria (opzione B):**
- Import rimosso da `callback/route.ts`.
- Nessun riferimento residuo a `lib/staff/credential-vault` nel codebase.
- Token salvato nel pgcrypto vault e recuperabile correttamente.

**Priorita':** P0 (critico) -- file mancante = potenziale build failure.

---

### 3.3 `lib/staff/data-connector/connectors/hubspot.ts` -- REAL
### 3.4 `lib/staff/data-connector/connectors/fatture-in-cloud.ts` -- REAL
### 3.5 `lib/staff/data-connector/connectors/google-drive.ts` -- REAL
### 3.6 `lib/staff/data-connector/connectors/authenticated-base.ts` -- REAL
### 3.7 `lib/staff/data-connector/auth/oauth2-handler.ts` -- REAL

- Stato: **Nessun intervento necessario.** I connettori sono implementati ma non tutti
  hanno un sync handler nell'API (vedi 1.9).

---

### 3.8 `lib/staff/data-connector/mapping/` -- REAL (ma disconnesso dal frontend)

Il mapping engine (rules + similarity + LLM + learning) esiste ma:
- Il SetupWizard non lo invoca (usa random confidence).
- Nessun endpoint API espone il mapping engine al frontend.

**Cosa deve cambiare:**
1. Creare endpoint `POST /api/integrations/[connectorId]/auto-map` che invoca FieldMapper.
2. Il wizard chiama questo endpoint per ottenere mapping suggeriti con confidence reale.

**Acceptance criteria:**
- Endpoint API per auto-mapping esiste e funziona.
- Il FieldMapper restituisce mappings con confidence calcolata (non random).

**Priorita':** P2 (medio).

---

### 3.9 `lib/middleware/vault-middleware.ts` -- REAL

- Stato: **Nessun intervento necessario.**

---

### 3.10 Connettore Salesforce -- MISSING

`scripts/integration-sources.ts` definisce Salesforce come source ma non esiste
un file `lib/staff/data-connector/connectors/salesforce.ts`.
Il sync handler in `sync/route.ts` non lo include.

**Cosa deve cambiare:**
1. Implementare `SalesforceConnector` estendendo `AuthenticatedBaseConnector`.
2. Aggiungere sync handler.

**Acceptance criteria:**
- Connettore Salesforce implementato con `fetchAll()` e `fetchDelta()`.
- Sync handler registrato in `SYNC_HANDLERS`.

**Priorita':** P2 (medio) -- Salesforce non e' nel MVP primario (RICE score piu' basso).

---

### 3.11 Connettore Stripe -- PARTIAL

`scripts/integration-sources.ts` definisce Stripe ma non esiste un connector class dedicato,
ne' un sync handler. Stripe usa API key (non OAuth2), quindi il flow e' diverso.

**Priorita':** P3 (basso) -- non nel MVP.

---

## 4. DATABASE / MIGRATIONS

### Tabelle esistenti (migrations 030-032, 037)

- `integration_credentials` -- REAL, usata da vault
- `integration_connections` -- REAL, usata da tutte le route
- `integration_sync_log` -- REAL, usata da sync e dashboard
- `integration_field_mappings` -- REAL, TTL 30gg
- `integration_credential_audit` -- REAL, GDPR audit trail
- `entity_mapping_configs` -- REAL (migration 037)

**Stato: Nessun intervento necessario sullo schema.** Il DB e' pronto.

---

## 5. PIANO DI IMPLEMENTAZIONE -- ORDINE DI PRIORITA'

### Fase 0: Fix critici (P0) -- Prerequisiti

| # | File | Intervento | Dipendenze |
|---|------|-----------|------------|
| 0.1 | `callback/route.ts` | Rimuovere import `lib/staff/credential-vault`, eliminare dual vault | Nessuna |
| 0.2 | `dashboard/route.ts` | Implementare sync reale nell'azione POST "sync" | 0.3 |
| 0.3 | `[connectorId]/sync/route.ts` | Aggiungere sync handler per `fatture-in-cloud` | Nessuna |

**Stima effort:** 1-2 giorni
**Risultato:** I 3 connettori MVP (Google Drive, HubSpot, Fatture in Cloud) possono sincronizzare dati reali.

### Fase 1: Dati reali nel frontend (P1)

| # | File | Intervento | Dipendenze |
|---|------|-----------|------------|
| 1.1 | `SyncDashboard.tsx` | Rimuovere DEMO_INTEGRATIONS e DEMO_ERRORS, aggiungere empty/error state | Fase 0 |
| 1.2 | `[connectorId]/route.ts` (API) | Sostituire record count hardcoded con conteggi reali da sync_log | Fase 0 |
| 1.3 | `ConnectorDetailClient.tsx` | Rimuovere CONNECTOR_CONFIGS hardcoded, usare dati da API | 1.2 |

**Stima effort:** 2-3 giorni
**Risultato:** L'utente vede solo dati reali, nessun numero inventato.

### Fase 2: Mapping intelligente (P2)

| # | File | Intervento | Dipendenze |
|---|------|-----------|------------|
| 2.1 | Nuovo: `auto-map/route.ts` | Endpoint API per auto-mapping via FieldMapper backend | Nessuna |
| 2.2 | `SetupWizard.tsx` | Sostituire random confidence con chiamata a auto-map | 2.1 |
| 2.3 | `status/route.ts` | Estrarre catalogo in file dedicato, entity da schema discovery | Fase 1 |
| 2.4 | Connettore Salesforce | Implementare connector class + sync handler | Nessuna |

**Stima effort:** 3-5 giorni
**Risultato:** Mapping con confidence reale, catalogo connettori pulito.

### Fase 3: Polish e E2E (P3)

| # | File | Intervento | Dipendenze |
|---|------|-----------|------------|
| 3.1 | `mapper/*` (14 componenti) | Collegare a schema discovery reale e mapping engine | Fase 2 |
| 3.2 | Test E2E | Playwright: OAuth flow mock, wizard completion, sync trigger, dashboard check | Fasi 0-1 |
| 3.3 | Connettore Stripe | Implementare connector class (API key, non OAuth) | Nessuna |
| 3.4 | SSE sync progress | Endpoint SSE per progress real-time durante sync | Fase 0 |

**Stima effort:** 5-8 giorni
**Risultato:** Feature completa con test E2E e UX avanzata.

---

## 6. DIPENDENZE TRA FASI

```
Fase 0 (fix critici)
  |
  +---> Fase 1 (dati reali frontend)
  |       |
  |       +---> Fase 2 (mapping intelligente)
  |               |
  |               +---> Fase 3 (polish + E2E)
  |
  +---> Fase 3.2 (test E2E -- puo' iniziare in parallelo con Fase 1)
```

Fase 0 e' prerequisito di tutto. Fase 3.2 (test E2E) puo' iniziare in parallelo con Fase 1
testando il flow OAuth mock + wizard base.

---

## 7. RIEPILOGO FILE MOCK/MIXED

| File | Stato | Fase fix |
|------|-------|----------|
| `callback/route.ts` | MIXED (import mancante) | 0.1 |
| `dashboard/route.ts` POST sync | MOCK (stub) | 0.2 |
| `[connectorId]/sync/route.ts` | MIXED (2/5 handler) | 0.3 |
| `SyncDashboard.tsx` | MIXED (demo fallback) | 1.1 |
| `[connectorId]/route.ts` API | MIXED (record count hardcoded) | 1.2 |
| `ConnectorDetailClient.tsx` | MIXED (CONNECTOR_CONFIGS hardcoded) | 1.3 |
| `SetupWizard.tsx` | MIXED (random confidence) | 2.2 |
| `status/route.ts` | MIXED (catalogo statico) | 2.3 |
| `lib/staff/credential-vault` | MISSING | 0.1 |
| Salesforce connector | MISSING | 2.4 |
| Stripe connector | MISSING | 3.3 |
| `mapper/*` (14 componenti) | SCAFFOLDING | 3.1 |

**Totale: 8 file da modificare, 3 file/moduli da creare, 14 componenti da collegare.**

---

## 8. RISCHI E MITIGAZIONI

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| OAuth token scaduti durante sync lunga | Sync fallisce a meta' | `AuthenticatedBaseConnector` ha gia' auto-refresh su 401 |
| Rate limit provider esterni (HubSpot, FIC) | Sync incompleta | Connettori hanno gia' rate limiting configurabile |
| Mapping engine LLM costa crediti API | Costo per setup wizard | Usare solo livelli rules + similarity per MVP, LLM opt-in |
| Schema discovery lenta (>10s) | UX degradata nel wizard | Cache schema in `entity_mapping_configs` con TTL 24h |
| Dual vault rimosso = meno defense-in-depth | Sicurezza ridotta | pgcrypto e' gia' encryption at-rest; AES-256-GCM come hardening post-MVP |

---

## 9. ACCEPTANCE CRITERIA GLOBALI (E2E)

Un utente puo' completare questo flusso senza incontrare dati finti:

1. Naviga su `/integrazione` e vede i connettori disponibili con stato reale.
2. Clicca su un connettore (es. Fatture in Cloud) e vede le sue entita' reali.
3. Avvia il setup wizard: autentica via OAuth2, seleziona entita', configura mapping
   con confidence reale, sceglie frequenza, attiva.
4. Il sync parte e recupera dati reali dal provider.
5. La dashboard mostra conteggi, date, errori reali.
6. Lo storico sync mostra entry reali con durata e record count.

**Test E2E Playwright da implementare:**
- `e2e/integration-oauth-flow.spec.ts` -- OAuth flow con mock provider
- `e2e/integration-wizard.spec.ts` -- Wizard completion end-to-end
- `e2e/integration-sync.spec.ts` -- Sync trigger e dashboard update
- `e2e/integration-mapping.spec.ts` -- Mapping editor salvataggio

---

*Piano prodotto da Architecture Builder per task #918.*
*Prossimo passo: implementare Fase 0 (fix critici), partendo da 0.1 (rimuovere dual vault morto).*
