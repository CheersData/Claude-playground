# Runbook: Credential Management

## Scopo

Procedure per gestione credenziali OAuth2: flow di autorizzazione, storage criptato, refresh token, rotazione e revoca. Security-critical — nessuna eccezione alle procedure.

## Architettura

```
Utente (PMI)
    |
[1] AUTHORIZE — Redirect a vendor OAuth
    -> Utente autorizza su HubSpot/Google/Fatture in Cloud
    -> Vendor ritorna authorization code
    |
[2] TOKEN EXCHANGE — Backend scambia code per token
    -> POST vendor/oauth/token con code + client_secret
    -> Riceve access_token + refresh_token + expires_in
    |
[3] ENCRYPT — Credential vault AES-256-GCM
    -> Token criptati con VAULT_MASTER_KEY
    -> Salvati in integration_connections (Supabase, RLS per user_id)
    |
[4] USE — Connettore usa token per API calls
    -> Decrypt on-demand, in-memory only
    -> Mai loggato, mai esposto in response
    |
[5] REFRESH — Automatico prima di scadenza
    -> Controlla expires_at prima di ogni sync
    -> Se scaduto o prossimo alla scadenza (< 5 min): refresh
    -> Aggiorna token criptato nel vault
    |
[6] REVOKE — Su richiesta utente o errore irreversibile
    -> Chiama endpoint revoca del vendor
    -> Cancella credenziali dal vault
    -> Disabilita watch associati
```

## OAuth2 Flow Dettagliato

### Fase 1: Inizializzazione

```
GET /api/integrations/connect?provider=hubspot

1. Genera state parameter (CSRF protection): crypto.randomUUID()
2. Salva state in sessione utente (cookie httpOnly, 5 min TTL)
3. Costruisci authorize URL:
   https://app.hubspot.com/oauth/authorize
     ?client_id={HUBSPOT_CLIENT_ID}
     &redirect_uri={APP_URL}/api/integrations/callback
     &scope=crm.objects.deals.read crm.objects.contacts.read
     &state={generated_state}
4. Redirect utente → vendor authorize URL
```

### Fase 2: Callback

```
GET /api/integrations/callback?code=xxx&state=yyy

1. Verifica state === state in sessione (CSRF check)
2. Scambia code per token:
   POST https://api.hubapi.com/oauth/v1/token
     grant_type=authorization_code
     client_id={HUBSPOT_CLIENT_ID}
     client_secret={HUBSPOT_CLIENT_SECRET}
     redirect_uri={APP_URL}/api/integrations/callback
     code={code}
3. Ricevi: { access_token, refresh_token, expires_in }
4. Cripta token con AES-256-GCM (VAULT_MASTER_KEY)
5. Salva in integration_connections:
   { user_id, provider, encrypted_tokens, expires_at, created_at }
6. Redirect utente → /integrazione/dashboard?connected=hubspot
```

### Fase 3: Refresh Token

```typescript
// Eseguito automaticamente prima di ogni sync
async function ensureValidToken(connection: IntegrationConnection): Promise<string> {
  const tokens = decrypt(connection.encrypted_tokens, VAULT_MASTER_KEY);

  // Buffer di 5 minuti prima della scadenza
  if (tokens.expires_at > Date.now() + 5 * 60 * 1000) {
    return tokens.access_token; // Ancora valido
  }

  // Refresh
  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!response.ok) {
    // Refresh fallito — token probabilmente revocato
    await markConnectionRevoked(connection.id);
    await notifyUser(connection.user_id, "Token scaduto, riconnetti il servizio");
    throw new Error("TOKEN_REVOKED");
  }

  const newTokens = await response.json();
  const encrypted = encrypt(newTokens, VAULT_MASTER_KEY);
  await updateConnectionTokens(connection.id, encrypted, newTokens.expires_in);

  return newTokens.access_token;
}
```

## Storage Credenziali

### Encryption

| Parametro | Valore |
|-----------|--------|
| Algoritmo | AES-256-GCM |
| Key | `VAULT_MASTER_KEY` (env var, min 32 bytes) |
| IV | Random 12 bytes per-encryption (salvato con ciphertext) |
| Auth tag | 16 bytes (incluso nel ciphertext) |
| Formato storage | `base64(iv + ciphertext + authTag)` |

### Schema DB

```sql
integration_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  provider TEXT NOT NULL,              -- "hubspot", "google-drive", "fatture-in-cloud"
  encrypted_tokens TEXT NOT NULL,      -- AES-256-GCM encrypted JSON
  expires_at TIMESTAMPTZ NOT NULL,     -- Scadenza access_token
  refresh_expires_at TIMESTAMPTZ,      -- Scadenza refresh_token (se nota)
  status TEXT DEFAULT 'active',        -- active, revoked, expired, error
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: ogni utente vede solo le proprie connessioni
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own connections"
  ON integration_connections FOR ALL
  USING (auth.uid() = user_id);
```

### Cosa NON fare (mai)

- **MAI** loggare token (nemmeno parziali, nemmeno in debug mode)
- **MAI** esporre token in response API
- **MAI** salvare token in chiaro nel DB
- **MAI** salvare token in localStorage/sessionStorage client-side
- **MAI** includere token in URL (query parameters)
- **MAI** usare lo stesso IV per due encryption diverse
- **MAI** hardcodare `VAULT_MASTER_KEY` nel codice sorgente

## Rotazione Token

### Rotazione automatica (refresh)

Ogni sync verifica la validita del token e lo refresha se necessario. Il vecchio access_token viene sovrascritto — non serve rotazione manuale per access_token.

### Rotazione VAULT_MASTER_KEY

Se la master key viene compromessa:

1. **Generare nuova key**: `openssl rand -hex 32`
2. **Re-encrypt tutte le credenziali**:
   ```bash
   npx tsx scripts/rotate-vault-key.ts --old-key=<old> --new-key=<new>
   ```
   Lo script decripta con la vecchia key e re-cripta con la nuova, record per record.
3. **Aggiornare env var** `VAULT_MASTER_KEY` su Vercel e .env.local
4. **Verificare**: testare un sync per ogni connettore attivo
5. **Distruggere vecchia key**: rimuovere da ogni backup, log, history

## Revoca Credenziali

### Su richiesta utente (disconnect)

```
POST /api/integrations/disconnect?provider=hubspot

1. Chiama endpoint revoca del vendor (se disponibile):
   POST https://api.hubapi.com/oauth/v1/refresh-tokens/{token}
   Method: DELETE
2. Aggiorna status connessione: "revoked"
3. Disabilita tutti i watch associati
4. Cancella encrypted_tokens dal DB
5. Logga evento in integration_events
6. Conferma all'utente
```

### Su errore irreversibile (token rejected dal vendor)

Se il refresh token viene rifiutato con 401/403:

1. Marcare connessione come `expired`
2. Disabilitare watch associati
3. Notificare utente: "La connessione a {vendor} e scaduta. Riconnetti il servizio."
4. Loggare evento in integration_events con dettaglio errore

## Troubleshooting

| Problema | Diagnosi | Soluzione |
|----------|---------|----------|
| "TOKEN_REVOKED" durante sync | Utente ha revocato accesso dal lato vendor | Notificare utente, guidarlo a riconnettere |
| "DECRYPT_FAILED" | VAULT_MASTER_KEY cambiata senza re-encryption | Ripristinare vecchia key o eseguire rotazione |
| "INVALID_GRANT" su refresh | Refresh token scaduto (alcuni vendor: 6 mesi) | Utente deve riautorizzare da zero |
| Connessione OK ma nessun dato | Scopes insufficienti — utente non ha autorizzato tutti i permessi | Guidare utente a riconnettere con tutti gli scopes |
| OAuth callback fallisce con "state mismatch" | Cookie sessione scaduto (> 5 min) o CSRF tentato | Utente riprovi il flow dall'inizio |

## Monitoring

- **Alert automatico** se > 5% delle connessioni in stato `error` o `expired`
- **Daily check**: script verifica che tutte le connessioni `active` abbiano token non scaduti
- **Audit log**: ogni operazione su credenziali (create, refresh, revoke) loggata in `integration_events`
