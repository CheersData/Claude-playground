# Runbook: Aggiungere un Nuovo Connettore

## Scopo

Procedura step-by-step per aggiungere un nuovo connettore business all'Ufficio Integrazione. Dalla valutazione delle API alla messa in produzione.

## Prerequisiti

- Documentazione API del vendor disponibile
- Developer account / sandbox del vendor creato
- Approvazione Lead (L1 per connettore standard, L2 per connettore complesso)
- Classifica RICE dal brief Strategy consultata

## Procedura

### 1. Valutazione API (Connector Builder)

**Tempo stimato**: 2-4 ore

Analizzare la documentazione API del vendor e compilare la checklist:

- [ ] **Autenticazione**: OAuth2 standard? Scopes necessari? Token lifetime?
- [ ] **Endpoint rilevanti**: quali endpoint espongono documenti/contratti/fatture?
- [ ] **Rate limits**: quante richieste/minuto? Per-app o per-user?
- [ ] **Pagination**: cursor-based? Offset? Link header?
- [ ] **Webhook**: disponibili? Quali eventi? Formato payload?
- [ ] **Sandbox**: ambiente di test disponibile? Come creare dati fittizi?
- [ ] **Formato dati**: JSON? XML? Campi rilevanti per analisi legale?
- [ ] **Documentazione qualita**: ben documentata? Esempi? SDK ufficiali?

**Output**: documento di valutazione con go/no-go e stima effort.

Se l'API non soddisfa i requisiti minimi (no OAuth2, no documenti accessibili, rate limit < 10 req/min), escalare al Lead con raccomandazione no-go.

### 2. Configurazione ConnectorConfig (Connector Builder)

**Tempo stimato**: 30 minuti

Creare la configurazione del connettore nel registry:

```typescript
// In lib/staff/data-connector/registry.ts o file dedicato
const newConnectorConfig: ConnectorConfig = {
  id: "vendor-name",
  name: "Vendor Display Name",
  type: "business-documents",
  vertical: "integration",
  connector: "vendor-name",
  auth: {
    type: "oauth2",
    authUrl: "https://vendor.com/oauth/authorize",
    tokenUrl: "https://vendor.com/oauth/token",
    scopes: ["read:documents", "read:contacts"],
    refreshable: true,
  },
  schedule: "webhook", // o "polling:15min"
  enabled: true,
};
```

### 3. Implementazione Connettore (Connector Builder)

**Tempo stimato**: 1-3 giorni

Creare i 4 file seguendo i pattern esistenti:

#### 3.1 Connettore (`connectors/<vendor>.ts`)

```typescript
import { AuthenticatedBaseConnector } from "./authenticated-base";

export class VendorConnector extends AuthenticatedBaseConnector {
  async connect(credentials: EncryptedCredentials): Promise<void> {
    // Decrypt + validate token
    // Test connection con endpoint leggero (es. /me, /account)
  }

  async fetchRecords(options: FetchOptions): Promise<RawRecord[]> {
    // Fetch documenti dal vendor con pagination
    // Rispetta rate limits
    // Gestisci webhook payload se disponibile
  }

  async parseRecord(raw: RawRecord): Promise<ParsedDocument> {
    // Estrai testo dal documento
    // Normalizza metadati
  }
}
```

#### 3.2 Record Model (`models/<vendor>-record-model.ts`)

Definire lo schema dei campi estratti dal vendor e la validazione.

#### 3.3 Parser (`parsers/<vendor>-parser.ts`)

Logica di estrazione testo specifica per il formato del vendor.

#### 3.4 Store (`stores/<vendor>-store.ts`)

Adattatore per salvataggio risultati su Supabase.

### 4. Field Mapping (Mapping Engine)

**Tempo stimato**: 2-4 ore

#### 4.1 Creare regole L1

Creare file `lib/staff/data-connector/mapping/rules/<vendor>.json`:

```json
{
  "vendor": "vendor-name",
  "version": 1,
  "rules": {
    "invoice_number": "numero_fattura",
    "customer_name": "controparte",
    "created_at": "data_documento",
    "total_amount": "valore",
    "currency": "valuta",
    "document_url": "url_sorgente"
  }
}
```

#### 4.2 Testare mapping

- [ ] Tutti i campi obbligatori mappati con regole L1
- [ ] Campi secondari coperti da L2 (Levenshtein) con confidence > 0.8
- [ ] Eventuali campi residui coperti da L3 (LLM)
- [ ] Mapping accuracy complessiva > 95% su 50 documenti di test

### 5. Test (Connector Builder + QA)

**Tempo stimato**: 1-2 giorni

#### 5.1 Test unitari

```bash
npx vitest tests/unit/integration/<vendor>.test.ts
```

Copertura minima:
- [ ] `connect()`: connessione riuscita con token valido
- [ ] `connect()`: errore con token scaduto → refresh automatico
- [ ] `connect()`: errore con token revocato → notifica
- [ ] `fetchRecords()`: fetch con pagination corretta
- [ ] `fetchRecords()`: gestione rate limit (429)
- [ ] `fetchRecords()`: gestione errore server (5xx)
- [ ] `parseRecord()`: estrazione testo corretta
- [ ] `parseRecord()`: gestione documento vuoto/corrotto
- [ ] Mapping: tutti i campi L1 mappati correttamente
- [ ] Mapping: fallback L2 per campi non-standard

#### 5.2 Integration test (sandbox)

```bash
npx vitest tests/integration/<vendor>.integration.test.ts
```

- [ ] Flow OAuth completo (authorize → token → refresh)
- [ ] Sync end-to-end: fetch → map → analyze → store
- [ ] Webhook: ricezione e processing payload
- [ ] Error recovery: disconnessione temporanea → ripresa sync

### 6. Registrazione nel Plugin Registry (Connector Builder)

```typescript
import { PluginRegistry } from "lib/staff/data-connector/plugin-registry";
import { VendorConnector } from "./connectors/vendor";

PluginRegistry.register("vendor-name", VendorConnector);
```

Verificare:
- [ ] Connettore appare in `GET /api/integrations/connectors`
- [ ] Health check ritorna stato healthy

### 7. Deploy (Lead)

- [ ] Code review completata
- [ ] Test unitari tutti verdi
- [ ] Integration test su sandbox verdi
- [ ] Documentazione API interna aggiornata
- [ ] Env vars del vendor aggiunte a `.env.local.example`
- [ ] Env vars del vendor settate su Vercel
- [ ] Connettore abilitato nel registry
- [ ] Monitoring attivo (sync success rate, error rate)

## Rollback

Se il connettore causa problemi in produzione:

1. Disabilitare connettore nel registry: `enabled: false`
2. Notificare utenti con connettore attivo
3. Analizzare causa root
4. Fix e re-deploy, oppure rimuovere se non risolvibile

## Checklist riassuntiva

```
[ ] 1. Valutazione API → go/no-go
[ ] 2. ConnectorConfig nel registry
[ ] 3. Implementazione 4 file (connector, model, parser, store)
[ ] 4. Field mapping (regole L1 + test L2/L3)
[ ] 5. Test unitari + integration test
[ ] 6. Registrazione plugin registry
[ ] 7. Deploy + monitoring
```
