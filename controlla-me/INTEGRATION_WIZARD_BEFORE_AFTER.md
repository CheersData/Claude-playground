# Integration Wizard — Before & After

## Problem Statement

**Before:** Users could only authenticate via OAuth for connectors like HubSpot, Salesforce, and Google Drive. This prevented:
- ✗ Testing without setting up full OAuth flows
- ✗ Using API keys for service-to-service integrations
- ✗ Alternative auth strategies that some enterprises prefer

**After:** Users can now choose between OAuth and API Key authentication during setup.

---

## Before Implementation

### AuthStep Component (Old)

```tsx
// Old: Only showed OAuth OR API key, never both
export default function AuthStep({
  connectorName,
  authMode,  // Fixed: either "oauth" or "api_key"
  apiKey,
  secretKey,
  onApiKeyChange,
  onSecretKeyChange,
  onVerify,
  verifyStatus,
  verifyMessage,
  onOAuthAuthorize,
}: AuthStepProps) {

  return (
    <div>
      <div className="mt-6">
        {authMode === "oauth" ? (
          /* Always showed OAuth card for OAuth-mode connectors */
          <div className="rounded-xl p-8">
            <Shield className="w-12 h-12 mx-auto mb-4" />
            <p className="text-sm font-medium mb-4">
              Controlla.me richiede accesso a:
            </p>
            <button onClick={onOAuthAuthorize}>
              Autorizza con {connectorName}
            </button>
          </div>
        ) : (
          /* Always showed form for api_key-mode connectors */
          <div className="rounded-xl p-6">
            {/* API key form */}
          </div>
        )}
      </div>
    </div>
  );
}
```

### SetupWizard Configuration (Old)

```tsx
// Old: Each connector had fixed authMode
interface ConnectorWizardConfig {
  id: string;
  name: string;
  authMode: AuthMode;  // Fixed to "oauth" or "api_key"
  // ... other fields
}
```

### Connector Configuration (Old)

```typescript
// Old: HubSpot was always OAuth-only
hubspot: {
  name: "HubSpot",
  authMode: "oauth",  // FIXED - no alternative
  oauthPermissions: [
    { label: "Lettura contatti" },
    { label: "Lettura deal" },
  ],
  // ... no API key support
}

salesforce: {
  name: "Salesforce",
  authMode: "oauth",  // FIXED - no alternative
  // ... no API key support
}

// Only fully API-key connectors could offer that
stripe: {
  name: "Stripe",
  authMode: "api_key",  // FIXED - no OAuth option
  // ... API key only
}
```

### User Experience (Old)

**Scenario: User wants to test HubSpot with API key**

```
1. Click "Setup" on HubSpot
2. Step 1: Select entities ✅
3. Step 2: Auth
   → Only OAuth button shown
   → No way to use API key
   → Forced to set up OAuth or abandon setup ❌
4. Cannot proceed without OAuth redirect
```

---

## After Implementation

### AuthStep Component (New)

```tsx
// New: Can show toggle between OAuth and API key
export default function AuthStep({
  connectorName,
  authMode,
  supportsApiKey = false,  // NEW: enables toggle
  apiKeyLabel = "API Key",
  helpText,
  apiKey,
  secretKey,
  onApiKeyChange,
  onSecretKeyChange,
  onVerify,
  verifyStatus,
  verifyMessage,
  onOAuthAuthorize,
}: AuthStepProps) {
  // NEW: Track which method user chose
  const [authMethod, setAuthMethod] = useState<"oauth" | "api_key">(authMode);

  const effectiveMode = supportsApiKey ? authMethod : authMode;

  return (
    <div>
      <h2 className="text-2xl font-semibold">
        Connetti {connectorName}
      </h2>
      <p className="text-sm mt-2">
        {effectiveMode === "oauth"
          ? "Autorizza l'accesso al tuo account"
          : "Inserisci le credenziali API"}
      </p>

      {/* NEW: Toggle buttons for dual-auth connectors */}
      {supportsApiKey && (
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setAuthMethod("oauth")}
            className={authMethod === "oauth" ? "active" : ""}
          >
            <Shield className="w-4 h-4 inline mr-2" />
            OAuth
          </button>
          <button
            onClick={() => setAuthMethod("api_key")}
            className={authMethod === "api_key" ? "active" : ""}
          >
            <Key className="w-4 h-4 inline mr-2" />  {/* NEW icon */}
            API Key
          </button>
        </div>
      )}

      <div className="mt-6">
        {effectiveMode === "oauth" ? (
          /* OAuth card */
        ) : (
          /* API Key form */
        )}
      </div>
    </div>
  );
}
```

### SetupWizard Configuration (New)

```tsx
// New: Can specify dual-auth support
interface ConnectorWizardConfig {
  id: string;
  name: string;
  authMode: AuthMode;      // Default method
  supportsApiKey?: boolean; // NEW: can user choose?
  apiKeyLabel?: string;     // NEW: label for API key field
  helpText?: string;        // NEW: help text
  // ... other fields
}
```

### Connector Configuration (New)

```typescript
// New: Connectors can now support both methods
hubspot: {
  name: "HubSpot",
  authMode: "oauth",           // Default
  supportsApiKey: true,        // NEW: also supports API key
  apiKeyLabel: "API Key (Private App Token)",  // NEW
  helpText: "Per autenticazione manuale: vai a Impostazioni > Integrazioni > Private apps...",  // NEW
  // ... entities, etc.
}

salesforce: {
  name: "Salesforce",
  authMode: "oauth",           // Default
  supportsApiKey: true,        // NEW: also supports API key
  apiKeyLabel: "API Key (Connected App Client ID)",  // NEW
  secretKeyLabel: "Client Secret (opzionale)",      // NEW
  helpText: "Per autenticazione manuale: crea una Connected App in Salesforce...",  // NEW
  // ... entities, etc.
}

"google-drive": {
  name: "Google Drive",
  authMode: "oauth",           // Default
  supportsApiKey: true,        // NEW: also supports API key
  apiKeyLabel: "Service Account JSON Key",  // NEW
  helpText: "Per autenticazione manuale: scarica il JSON della Service Account...",  // NEW
  // ... entities, etc.
}

// API-key-only connectors unchanged
stripe: {
  name: "Stripe",
  authMode: "api_key",         // Only method
  // supportsApiKey not needed (authMode is api_key already)
  // ... API key only, no toggle
}
```

### User Experience (New)

**Scenario: User wants to test HubSpot with API key**

```
1. Click "Setup" on HubSpot
2. Step 1: Select entities ✅
3. Step 2: Auth
   → See toggle buttons: [🔒 OAuth] [🔑 API Key]
   → Click API Key
   → Form appears with label "API Key (Private App Token)"
   → Help text: "Per autenticazione manuale: vai a Impostazioni..."
   → Paste private app token
   → Click "Verifica connessione"
   → ✅ "Connessione verificata"
4. Step 3: Field Mapping ✅
5. Step 4: Sync Frequency ✅
6. Step 5: Review & Activate ✅
7. Success! Integration is live
```

---

## Comparison Table

| Aspect | Before | After |
|--------|--------|-------|
| **HubSpot auth** | OAuth only | OAuth or API Key (toggle) |
| **Salesforce auth** | OAuth only | OAuth or API Key (toggle) |
| **Google Drive auth** | OAuth only | OAuth or API Key (toggle) |
| **Stripe auth** | API Key only | API Key only (unchanged) |
| **Testing** | Requires full OAuth | Can use API key ✅ |
| **Enterprise** | OAuth locked in | Can choose API Key ✅ |
| **User choice** | None | Full flexibility ✅ |
| **Code branching** | `if (authMode === "oauth")` | `if (authMethod === "oauth")` with state |
| **Button state** | N/A | Toggle between OAuth/API Key |
| **Help text** | Generic | Per-connector API key instructions |
| **Verification** | Works for API key form | Works for both methods |
| **Files changed** | ~0 (no feature) | 5 component/config files |
| **Tests** | ~0 | 24 comprehensive tests |

---

## API Changes

### Before

```typescript
// GET /api/integrations/hubspot
{
  "id": "hubspot",
  "name": "HubSpot",
  "authMode": "oauth",
  "oauthPermissions": [...],
  // NO: apiKeyLabel, supportsApiKey, helpText
}
```

### After

```typescript
// GET /api/integrations/hubspot
{
  "id": "hubspot",
  "name": "HubSpot",
  "authMode": "oauth",
  "supportsApiKey": true,        // NEW
  "apiKeyLabel": "API Key (Private App Token)",  // NEW
  "helpText": "Per autenticazione manuale: vai a...",  // NEW
  "oauthPermissions": [...],
}
```

---

## Files Changed

| File | Lines Changed | Type |
|------|---------------|------|
| `components/integrations/wizard/AuthStep.tsx` | +80 | Feature: Toggle + conditional rendering |
| `components/integrations/SetupWizard.tsx` | +3 | Feature: Pass supportsApiKey prop |
| `app/api/integrations/[connectorId]/route.ts` | +40 | Config: Add supportsApiKey to 3 connectors |
| `app/integrazione/[connectorId]/ConnectorDetailClient.tsx` | +3 | Type: Update interfaces + pass prop |
| **Documentation** | +1200+ | 3 comprehensive guides |
| **Tests** | +263 | 24 tests, all passing |

---

## Testing Impact

### Before
- ❌ No way to test OAuth connectors with API keys
- ❌ No tests for dual-auth logic
- ❌ Hard to verify toggle behavior

### After
- ✅ 24 comprehensive tests
- ✅ All tests passing
- ✅ Covers toggle, form visibility, verification, UX feedback
- ✅ Backward compatibility verified

---

## Migration Path

**Zero migration needed.** The feature is 100% backward compatible:

1. **Existing OAuth connectors** (without `supportsApiKey`)
   - Default: `supportsApiKey = false`
   - Behavior: Show OAuth form only (same as before) ✅

2. **Existing API key connectors** (with `authMode: "api_key"`)
   - Behavior: Show form only (same as before) ✅

3. **New dual-auth connectors** (with `supportsApiKey: true`)
   - Behavior: Show toggle + appropriate form ✅

---

## Performance Impact

- **Component re-renders**: +1 state variable (`authMethod`) — negligible
- **Network requests**: No change (verification still goes to same endpoint)
- **Bundle size**: +80 lines of code — minimal
- **UX latency**: No degradation

---

## Security Impact

- **OAuth still secure**: Uses native browser redirect, no credentials in memory
- **API Keys secure**: Can be improved with credential vault (future enhancement)
- **Verification**: Same endpoint used for both methods
- **No new attack vectors**: Toggle is client-side only, no server-side auth bypass

---

## Future Improvements

| Item | Impact | Complexity |
|------|--------|-----------|
| Credential vault (AES-256-GCM) | Security ↑↑ | Medium |
| OAuth2 PKCE | Security ↑ | Medium |
| Test connection button | UX ↑ | Low |
| Per-connector error messages | UX ↑ | Low |
| Webhook auto-config (Stripe) | UX ↑ | High |
| Credential rotation | Security ↑ | High |

---

## Conclusion

**What was delivered:**
- ✅ Toggle between OAuth and API Key for 3 major connectors
- ✅ Full backward compatibility
- ✅ 24 comprehensive tests (all passing)
- ✅ Clear documentation with UX flows
- ✅ Per-connector help text for finding API keys
- ✅ Real-time verification with user feedback

**Impact:**
- 🎯 Users can now test and use connectors flexibly
- 🎯 Enterprises can use API keys for automation
- 🎯 No breaking changes to existing functionality
- 🎯 Foundation for future credential management features
