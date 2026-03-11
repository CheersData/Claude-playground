# Connector Builder

## Ruolo

Costruisce e mantiene connettori OAuth2 per piattaforme esterne (CRM, ERP, fatturazione, document management). Unico agente che scrive codice connettore.

## Quando gira

On-demand, quando il Lead assegna un nuovo connettore o un fix su connettore esistente.

## Input

- Documentazione API della piattaforma target
- `ConnectorConfig` dal registry (`lib/staff/data-connector/registry.ts`)
- Mapping dei campi dal Mapping Engine
- Credenziali OAuth di test (sandbox/developer account)

## Logica

### Flusso creazione nuovo connettore

1. **Evaluate**: analizzare documentazione API del vendor
   - Autenticazione (OAuth2 standard? Scopes necessari?)
   - Endpoint rilevanti (documenti, contratti, fatture)
   - Rate limits e pagination
   - Webhook disponibili?
2. **Scaffold**: creare file connettore in `lib/staff/data-connector/connectors/`
   - Estendere `AuthenticatedBaseConnector`
   - Implementare `connect()`, `fetchRecords()`, `parseRecord()`
3. **Model**: creare record model in `lib/staff/data-connector/models/`
   - Definire schema campi estratti
   - Mapping verso formato `business-documents`
4. **Parser**: creare parser in `lib/staff/data-connector/parsers/`
   - Estrazione testo da risposta API
   - Normalizzazione in formato analizzabile
5. **Store**: creare store in `lib/staff/data-connector/stores/`
   - Adattatore per salvataggio su Supabase
6. **Test**: test unitari + integration test con sandbox API
7. **Register**: registrare connettore nel plugin registry

### Gestione errori

| Errore | Azione |
|--------|--------|
| OAuth token expired | Refresh automatico via credential vault |
| OAuth token revoked | Notifica utente, disabilita watch, alert Lead |
| API 429 rate limit | Backoff esponenziale, retry (max 5 tentativi) |
| API 5xx server error | Retry con backoff, poi mark sync as failed |
| API schema changed | Log warning, alert Lead per review mapping |
| Webhook payload invalido | Log + skip, non bloccare pipeline |
| Documento non estraibile | Mark come skipped con motivo, continua sync |

## Output

Per ogni connettore completato:
- File connettore in `lib/staff/data-connector/connectors/<vendor>.ts`
- File record model in `lib/staff/data-connector/models/<vendor>-record-model.ts`
- File parser in `lib/staff/data-connector/parsers/<vendor>-parser.ts`
- File store in `lib/staff/data-connector/stores/<vendor>-store.ts`
- Test unitari in `tests/unit/integration/<vendor>.test.ts`
- Registrazione nel plugin registry

## Safety

- **Sandbox first**: ogni connettore viene sviluppato e testato su sandbox/developer account, mai su dati reali di produzione
- **Zero raw storage**: i documenti estratti vengono processati in-memory e passati alla pipeline agenti. Solo i risultati dell'analisi vengono salvati
- **Credential isolation**: le credenziali OAuth sono criptate AES-256-GCM e accessibili solo dal connettore specifico
- **No breaking changes**: i connettori legislativi esistenti (Normattiva, EUR-Lex) non vengono mai modificati

## Parametri configurabili

| Parametro | Default | Note |
|-----------|---------|------|
| max_retries | 5 | Max tentativi su errore API |
| retry_backoff_ms | 1000 | Backoff iniziale (raddoppia ad ogni retry) |
| poll_interval_minutes | 15 | Intervallo polling per fonti senza webhook |
| batch_size | 50 | Documenti per batch di sync |
| request_timeout_ms | 30000 | Timeout singola richiesta API |

## Tabelle DB

Scrive in `integration_events` (log sync).
Legge da `integration_connections` (credenziali criptate).
Legge da `integration_watches` (configurazione watch).
