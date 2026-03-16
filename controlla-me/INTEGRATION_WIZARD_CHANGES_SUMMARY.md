# Integration Wizard — Manual API Key Input Feature

## Summary

The integration wizard now allows users to input API key credentials manually as an alternative to OAuth for connectors like HubSpot, Salesforce, and Google Drive. This enables:

- **Testing**: Users can test with API keys without setting up OAuth flows
- **Flexibility**: Choose the auth method that works best
- **Enterprise use**: Some orgs prefer API keys over OAuth for service integrations

## What Changed

### Components Modified

#### 1. **AuthStep.tsx** — Toggle UI
```tsx
// Before: Only showed OAuth or API key form
// After: Shows toggle buttons (if supportsApiKey=true)

{supportsApiKey && (
  <button onClick={() => setAuthMethod("oauth")}>🔒 OAuth</button>
  <button onClick={() => setAuthMethod("api_key")}>🔑 API Key</button>
)}
```

**Changes:**
- Added `supportsApiKey?: boolean` prop
- Added `authMethod` state to track user's choice
- Toggle buttons use gradient background + styling
- Shows appropriate form based on selection

#### 2. **SetupWizard.tsx** — Configuration Passthrough
```tsx
// Pass supportsApiKey flag to AuthStep
<AuthStep
  supportsApiKey={connector.supportsApiKey}
  // ... other props
/>
```

**Changes:**
- Added `supportsApiKey?: boolean` to `ConnectorWizardConfig` interface
- Passes flag to `AuthStep` component

#### 3. **API Route** `/api/integrations/[connectorId]/route.ts` — Metadata

**HubSpot Configuration:**
```typescript
hubspot: {
  authMode: "oauth",
  supportsApiKey: true,  // NEW
  apiKeyLabel: "API Key (Private App Token)",
  helpText: "Per autenticazione manuale: vai a Impostazioni > Integrazioni > Private apps...",
}
```

**Salesforce Configuration:**
```typescript
salesforce: {
  authMode: "oauth",
  supportsApiKey: true,  // NEW
  apiKeyLabel: "API Key (Connected App Client ID)",
  secretKeyLabel: "Client Secret (opzionale)",
  helpText: "Per autenticazione manuale: crea una Connected App in Salesforce...",
}
```

**Google Drive Configuration:**
```typescript
"google-drive": {
  authMode: "oauth",
  supportsApiKey: true,  // NEW
  apiKeyLabel: "Service Account JSON Key",
  helpText: "Per autenticazione manuale: scarica il JSON della Service Account...",
}
```

**Changes:**
- Added `supportsApiKey?: boolean` to `ConnectorMeta` interface
- Configured HubSpot, Salesforce, Google Drive with `supportsApiKey: true`
- Added helpful `helpText` explaining how to find API keys
- Response now includes `supportsApiKey` field

#### 4. **ConnectorDetailClient.tsx** — Type Updates
```tsx
// Updated interfaces
interface ConnectorConfig {
  supportsApiKey?: boolean;
  // ... other fields
}

// Updated API response mapping
interface ConnectorApiResponse {
  supportsApiKey?: boolean;
  // ... other fields
}

// Pass to AuthStep
<AuthStep
  supportsApiKey={config.supportsApiKey}
  // ... other props
/>
```

**Changes:**
- Added `supportsApiKey` to both interfaces
- Updated `mapApiResponseToConfig` to pass the flag through
- Passes flag to `AuthStep` in wizard

## File Structure

```
Modified Files (5):
├── components/integrations/wizard/AuthStep.tsx
│   ├── Added supportsApiKey prop
│   ├── Added authMethod state
│   ├── Added toggle buttons (OAuth vs API Key)
│   └── Conditional rendering based on authMethod
│
├── components/integrations/SetupWizard.tsx
│   ├── Updated ConnectorWizardConfig interface
│   └── Pass supportsApiKey to AuthStep
│
├── app/api/integrations/[connectorId]/route.ts
│   ├── Updated ConnectorMeta interface
│   ├── Added supportsApiKey configs for 3 connectors
│   ├── Added helpful apiKeyLabel and helpText
│   └── Response includes supportsApiKey field
│
├── app/integrazione/[connectorId]/ConnectorDetailClient.tsx
│   ├── Updated ConnectorConfig interface
│   ├── Updated ConnectorApiResponse interface
│   ├── Updated mapApiResponseToConfig mapper
│   └── Pass supportsApiKey to AuthStep
│
└── INTEGRATION_WIZARD_API_KEY.md (new)
    └── Comprehensive documentation
```

## Feature Behavior

### Step 2: Authentication (AuthStep)

**Default Display (authMode="oauth", supportsApiKey=true):**
```
┌─────────────────────────────┐
│ Connetti HubSpot            │
│ Autorizza l'accesso...      │
├─────────────────────────────┤
│ [🔒 OAuth] [🔑 API Key]     │  ← Toggle buttons
├─────────────────────────────┤
│ 🔒 OAuth button             │
│   "Autorizza con HubSpot"   │
│   "Connessione sicura..."   │
└─────────────────────────────┘
```

**After clicking API Key:**
```
┌─────────────────────────────┐
│ Connetti HubSpot            │
│ Inserisci le credenziali... │
├─────────────────────────────┤
│ [OAuth] [🔑 API Key]        │  ← Toggle (API Key now active)
├─────────────────────────────┤
│ API Key (Private App Token) │
│ ┌─────────────────────────┐ │
│ │ pat-na1.xxxxx...        │ │
│ └─────────────────────────┘ │
│                             │
│ Help: Per autenticazione... │
│ ┌─────────────────────────┐ │
│ │ Verifica connessione    │ │
│ └─────────────────────────┘ │
│                             │
│ ✅ Connessione verificata   │  ← Feedback
└─────────────────────────────┘
```

### Verification Flow

**API Key Verification:**
```
POST /api/integrations/credentials
{
  "connectorSource": "hubspot",
  "credentialType": "api_key",
  "data": {
    "api_key": "pat-na1.abc123...",
    "secret_key": undefined
  }
}

Response (200):
{
  "success": true,
  "connectorId": "hubspot",
  "message": "Connessione verificata con successo"
}

Response (400+):
{
  "error": "Chiave API non valida. Verifica e riprova."
}
```

## Supported Connectors

| Connector | Default Auth | API Key Support | Notes |
|-----------|--------------|-----------------|-------|
| **HubSpot** | OAuth | ✅ Private App Token | Toggle between methods |
| **Salesforce** | OAuth | ✅ Client ID + Secret | Toggle between methods |
| **Google Drive** | OAuth | ✅ Service Account JSON | Toggle between methods |
| **Stripe** | API Key | ✅ (no toggle) | API key only |
| **Normattiva** | API Key | ✅ (no toggle) | API key only |
| **EUR-Lex** | API Key | ✅ (no toggle) | API key only |

## Testing

### Unit Tests Added

```bash
npm test -- tests/integration/wizard-api-key.test.ts
```

**24 tests covering:**
1. ✅ Connector configuration validation
2. ✅ AuthStep toggle logic
3. ✅ Form field visibility
4. ✅ Help text display
5. ✅ Wizard flow integration
6. ✅ Verification endpoint behavior
7. ✅ UX feedback states
8. ✅ Backward compatibility

**Result:** All 24 tests PASSED ✅

### Manual Testing Checklist

- [ ] Go to `/integrazione`
- [ ] Click setup on HubSpot
- [ ] Step 2 shows toggle buttons (OAuth | API Key)
- [ ] Click API Key button
- [ ] Form shows "API Key (Private App Token)" label
- [ ] Help text displays below
- [ ] Enter random string, click "Verifica"
- [ ] Error message shows: "Chiave API non valida..."
- [ ] Click OAuth button to toggle back
- [ ] OAuth form reappears
- [ ] Test with Salesforce (same pattern)
- [ ] Test with Google Drive (same pattern)

## Backward Compatibility

✅ **Fully backward compatible**

- Existing OAuth-only connectors still work (no toggle if `supportsApiKey` not set)
- Existing API-key-only connectors still work (no toggle, form always visible)
- Default behavior unchanged: toggle only appears when explicitly configured
- No breaking changes to API or component interfaces

## Documentation

Created:
- `INTEGRATION_WIZARD_API_KEY.md` — Complete feature guide
- `tests/integration/wizard-api-key.test.ts` — Comprehensive test suite
- This summary (`INTEGRATION_WIZARD_CHANGES_SUMMARY.md`)

## Future Enhancements

1. **Credential Vault**: Store credentials securely with AES-256-GCM encryption
2. **OAuth2 PKCE**: Implement PKCE flow for client-side OAuth safety
3. **Test Connection**: Add button to validate before saving
4. **Credential Rotation**: Support automatic token refresh
5. **Per-Connector Errors**: Specific error messages for each platform
6. **Webhook Management**: Auto-configure webhooks (e.g., Stripe)

## Commits

1. **b827d87** — `feat(integrations): add manual API key input option to OAuth connectors`
   - 5 files changed, 420 insertions

2. **9084af9** — `test(integrations): add comprehensive tests for API key wizard toggle`
   - 1 file changed, 263 insertions
   - 24 tests added, all passing

## Questions?

For detailed technical info, see:
- `INTEGRATION_WIZARD_API_KEY.md` — Implementation guide
- `tests/integration/wizard-api-key.test.ts` — Test examples
- Source files: `components/integrations/wizard/AuthStep.tsx`, etc.
