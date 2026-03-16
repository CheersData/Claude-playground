# Integration Wizard — API Key Manual Input

## Overview

The integration wizard now supports **manual API key input** for connectors that traditionally use OAuth. This enables:

- **Testing**: Users can test connectors with API keys without setting up OAuth
- **Alternative auth**: Some platforms prefer API key over OAuth (e.g., private apps in HubSpot)
- **Flexibility**: Users choose the auth method that works best for them

## Implementation

### Changes Made

#### 1. **AuthStep Component** (`components/integrations/wizard/AuthStep.tsx`)

- Added new prop: `supportsApiKey?: boolean`
- When `supportsApiKey={true}`, a toggle button appears showing:
  - **OAuth** button — triggers OAuth redirect
  - **API Key** button — shows credential form
- Users can switch between methods at any time
- State is managed with `authMethod` state variable

#### 2. **SetupWizard Component** (`components/integrations/SetupWizard.tsx`)

- Passes `supportsApiKey` prop to `AuthStep`
- Added field to `ConnectorWizardConfig` interface

#### 3. **API Route** (`app/api/integrations/[connectorId]/route.ts`)

- Added `supportsApiKey?: boolean` field to `ConnectorMeta` interface
- Configured connectors:
  - **HubSpot**: `supportsApiKey: true`
  - **Salesforce**: `supportsApiKey: true`
  - **Google Drive**: `supportsApiKey: true`
  - **Stripe, Normattiva, EUR-Lex**: Already using `authMode: "api_key"` (no toggle needed)
- Added helpful `helpText` for each connector explaining:
  - How to get API keys for manual auth
  - How OAuth is still available as an option

#### 4. **ConnectorDetailClient** (`app/integrazione/[connectorId]/ConnectorDetailClient.tsx`)

- Updated interfaces to accept `supportsApiKey`
- Passes flag through to `AuthStep` component

### Data Flow

```
GET /api/integrations/[connectorId]
  ↓
Returns: { authMode, supportsApiKey, apiKeyLabel, secretKeyLabel, helpText, ... }
  ↓
ConnectorDetailClient maps response
  ↓
SetupWizard receives config.supportsApiKey
  ↓
AuthStep renders toggle (if supportsApiKey=true)
  ↓
User selects OAuth or API Key
  ↓
AuthStep shows appropriate UI:
  - OAuth: button + permissions list
  - API Key: form with apiKeyLabel + secretKeyLabel + helpText
  ↓
POST /api/integrations/credentials (verify credentials)
  or
POST /api/integrations/[connectorId]/authorize (OAuth redirect)
```

## Supported Connectors

### With Toggle (OAuth + API Key)

| Connector | OAuth? | API Key? | API Key Label | Notes |
|-----------|--------|----------|---------------|-------|
| **HubSpot** | ✅ | ✅ | Private App Token | Recommended for testing |
| **Salesforce** | ✅ | ✅ | Client ID + Secret | Via Connected App |
| **Google Drive** | ✅ | ✅ | Service Account JSON | For automated access |

### API Key Only

| Connector | API Key Type |
|-----------|--------------|
| **Stripe** | API Key + Webhook Secret |
| **Normattiva** | Open Data API Key (optional) |
| **EUR-Lex** | Cellar API Key (optional) |

## UX Flow

### For HubSpot (Example)

1. User clicks "Setup" on HubSpot connector
2. Step 1: Entity Select
3. Step 2: Auth — Two buttons appear:
   - **"🔒 OAuth"** (default highlighted) — Click to authorize via HubSpot login
   - **"🔑 API Key"** (grayed) — Click to show credential form
4. If user selects **API Key**:
   - Input field appears: "API Key (Private App Token)" *
   - Help text: "Per autenticazione manuale: vai a Impostazioni > Integrazioni > Private apps e copia il token..."
   - "Verifica connessione" button
   - On success: ✅ "Connessione verificata"
   - On error: ❌ "Verifica fallita: chiave API non valida"
5. Step 3: Field Mapping
6. Step 4: Frequency
7. Step 5: Review & Activate

## Technical Details

### AuthMode Behavior

- **`authMode: "oauth"`** (Salesforce, HubSpot, Google Drive)
  - Default: OAuth flow
  - If `supportsApiKey: true`: User can toggle to API Key form

- **`authMode: "api_key"`** (Stripe, Normattiva, EUR-Lex)
  - Always shows API Key form
  - No toggle, pure API key mode

### Verification Flow

Both OAuth and API Key use the same verification endpoint:

```typescript
POST /api/integrations/credentials
{
  "connectorSource": "hubspot",
  "credentialType": "api_key",
  "data": {
    "api_key": "pat-na1.xxx",
    "secret_key": undefined  // optional
  }
}
```

Response:
```typescript
200 OK → { success: true }
400+ → { error: "Chiave API non valida. Verifica e riprova." }
```

### Button States

- **Disabled** when:
  - API key field is empty
  - Verification is in progress (`verifyStatus === "verifying"`)

- **Enabled** when:
  - API key field is non-empty
  - No verification in progress

### Icons

- OAuth button: 🔒 `<Shield />`
- API Key button: 🔑 `<Key />`

## Testing

### Manual Test Case

1. Go to `/integrazione`
2. Click on a connector with `supportsApiKey=true` (HubSpot, Salesforce, Google Drive)
3. Click "Setup" on the card
4. In Step 2 (Auth), verify toggle buttons appear
5. Click **API Key** button
6. Verify form shows with correct labels:
   - For HubSpot: "API Key (Private App Token)"
   - For Salesforce: "API Key (Connected App Client ID)" + "Client Secret"
   - For Google Drive: "Service Account JSON Key"
7. Verify help text appears below the form
8. Enter invalid API key, click "Verifica connessione"
9. Verify error message shows (should fail because key is invalid)

## Future Enhancements

- Store credentials securely in credential vault (AES-256-GCM)
- Implement OAuth2 PKCE flow for client-side safety
- Add "Test Connection" button that validates credentials before saving
- Add credential rotation/refresh mechanism
- Implement per-connector credential validation (specific error messages)

## Files Modified

```
components/integrations/wizard/AuthStep.tsx          ← Added supportsApiKey toggle
components/integrations/SetupWizard.tsx              ← Pass supportsApiKey to AuthStep
app/api/integrations/[connectorId]/route.ts         ← Config + response serialization
app/integrazione/[connectorId]/ConnectorDetailClient.tsx ← Type updates + pass prop
```

## Migration Notes

- **Backward compatible**: Existing connectors without `supportsApiKey` default to `false`
- **No breaking changes**: Toggle only appears for connectors explicitly configured
- **OAuth still works**: Toggling back to OAuth uses the same flow as before
