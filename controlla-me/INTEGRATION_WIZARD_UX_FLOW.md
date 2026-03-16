# Integration Wizard — UX Flow with API Key Toggle

## User Journey

### 1. Connectors Dashboard

```
┌────────────────────────────────────────────────────────────┐
│ CONNETTORI INTEGRAZIONE                                    │
│                                                            │
│ Collega le tue piattaforme e centralizza i dati...       │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │ 👤 HubSpot     │  │ 🔗 Salesforce  │  │ 💰 Stripe  │  │
│  │ CRM            │  │ CRM            │  │ Pagamenti  │  │
│  │ [Setup]        │  │ [Setup]        │  │ [Setup]    │  │
│  └────────────────┘  └────────────────┘  └────────────┘  │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────┐  │
│  │ 📁 Drive       │  │ 📄 Normattiva  │  │ ⚖️  EUR-Lex│  │
│  │ Storage        │  │ Legale         │  │ Legale     │  │
│  │ [Setup]        │  │ [Setup]        │  │ [Setup]    │  │
│  └────────────────┘  └────────────────┘  └────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 2. Click Setup on HubSpot → Wizard Opens

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
│ 👤 HubSpot CRM / Marketing                                    │
├───────────────────────────────────────────────────────────────┤
│ Step Progress:  ◉ — — — —  (Step 1 of 5)                     │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ Seleziona le entita da sincronizzare                         │
│                                                               │
│ ☐ Tutti (Seleziona/Deseleziona tutto)                        │
│                                                               │
│ ☑ Contatti                   (8,200 record)                  │
│ ☑ Deal                       (1,450 record)                  │
│ ☐ Campagne                   (120 record)                    │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                                     [Avanti] →    │
└───────────────────────────────────────────────────────────────┘
```

### 3. Step 2: Authorization (NEW — With Toggle)

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
│ 👤 HubSpot CRM / Marketing                                    │
├───────────────────────────────────────────────────────────────┤
│ Step Progress: ● — ◉ — — —  (Step 2 of 5)                    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ Connetti HubSpot                                             │
│ Scegli il metodo di autenticazione                           │
│                                                               │
│ ┌─────────────┬─────────────┐                                │
│ │ 🔒 OAuth    │ 🔑 API Key  │                                │
│ │  (default)  │   (new)     │                                │
│ └─────────────┴─────────────┘                                │
│          ↓                                                     │
│                                                               │
│ [Selected: OAuth]                                            │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐│
│ │                                                           ││
│ │ 🔒 HubSpot richiede accesso a:                           ││
│ │                                                           ││
│ │ ✓ Lettura contatti                                      ││
│ │ ✓ Lettura deal                                          ││
│ │ ✓ Lettura campagne                                      ││
│ │                                                           ││
│ │ Non modifichiamo mai i tuoi dati.                       ││
│ │                                                           ││
│ │              [Autorizza con HubSpot]                     ││
│ │                                                           ││
│ │ 🔒 Connessione sicura via OAuth 2.0                      ││
│ │                                                           ││
│ └───────────────────────────────────────────────────────────┘│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                                     [Avanti] →    │
└───────────────────────────────────────────────────────────────┘
```

### 4. User Clicks "API Key" Toggle

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
│ 👤 HubSpot CRM / Marketing                                    │
├───────────────────────────────────────────────────────────────┤
│ Step Progress: ● — ◉ — — —  (Step 2 of 5)                    │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ Connetti HubSpot                                             │
│ Inserisci le credenziali API                                 │
│                                                               │
│ ┌─────────────┬─────────────┐                                │
│ │ 🔒 OAuth    │ 🔑 API Key  │                                │
│ │             │ (SELECTED)  │                                │
│ └─────────────┴─────────────┘                                │
│                          ↓                                     │
│                                                               │
│ [Selected: API Key]                                          │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐│
│ │                                                           ││
│ │ API Key (Private App Token) *                            ││
│ │ ┌─────────────────────────────────────────────────────┐  ││
│ │ │ pat-na1.                                            │  ││
│ │ └─────────────────────────────────────────────────────┘  ││
│ │                                                           ││
│ │ ℹ️  Per autenticazione manuale: vai a Impostazioni >      ││
│ │    Integrazioni > Private apps e copia il token.         ││
│ │    Il metodo OAuth è ancora disponibile.                ││
│ │                                                           ││
│ │              [Verifica connessione]                       ││
│ │              (disabled se campo vuoto)                    ││
│ │                                                           ││
│ └───────────────────────────────────────────────────────────┘│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                                     [Avanti] →    │
└───────────────────────────────────────────────────────────────┘
```

### 5. User Enters Invalid Key and Clicks Verify

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
│                                                               │
│ Connetti HubSpot                                             │
│ Inserisci le credenziali API                                 │
│                                                               │
│ ┌─────────────┬─────────────┐                                │
│ │ 🔒 OAuth    │ 🔑 API Key  │                                │
│ └─────────────┴─────────────┘                                │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐│
│ │                                                           ││
│ │ API Key (Private App Token) *                            ││
│ │ ┌─────────────────────────────────────────────────────┐  ││
│ │ │ invalid-key-12345                                   │  ││
│ │ └─────────────────────────────────────────────────────┘  ││
│ │                                                           ││
│ │ ℹ️  Per autenticazione manuale: vai a Impostazioni >      ││
│ │    Integrazioni > Private apps e copia il token...       ││
│ │                                                           ││
│ │              [⟳ Verifica in corso...]                     ││
│ │              (button disabled + spinner)                  ││
│ │                                                           ││
│ │ ⚠️  Chiave API non valida. Verifica e riprova.            ││
│ │                                                           ││
│ │ (Mostra errore in rosso con icona alert)                 ││
│ │                                                           ││
│ └───────────────────────────────────────────────────────────┘│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                     [Avanti] (disabled)  →        │
└───────────────────────────────────────────────────────────────┘
```

### 6. User Enters Valid Key and Verifies

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
│                                                               │
│ Connetti HubSpot                                             │
│ Inserisci le credenziali API                                 │
│                                                               │
│ ┌─────────────┬─────────────┐                                │
│ │ 🔒 OAuth    │ 🔑 API Key  │                                │
│ └─────────────┴─────────────┘                                │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐│
│ │                                                           ││
│ │ API Key (Private App Token) *                            ││
│ │ ┌─────────────────────────────────────────────────────┐  ││
│ │ │ pat-na1.25c2a6f78e7c9b3d4f5a1e8c2b6d9f0a3e5c8b1d  │  ││
│ │ └─────────────────────────────────────────────────────┘  ││
│ │                                                           ││
│ │ ℹ️  Per autenticazione manuale: vai a Impostazioni >      ││
│ │    Integrazioni > Private apps e copia il token...       ││
│ │                                                           ││
│ │              [Verifica connessione]                       ││
│ │                                                           ││
│ │ ✅ Connessione verificata con successo                    ││
│ │                                                           ││
│ │ (Mostra successo in verde con checkmark)                 ││
│ │                                                           ││
│ └───────────────────────────────────────────────────────────┘│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                                     [Avanti] →    │
│                                                 (enabled)      │
└───────────────────────────────────────────────────────────────┘
```

### 7. Continue to Step 3: Field Mapping

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
│ 👤 HubSpot CRM / Marketing                                    │
├───────────────────────────────────────────────────────────────┤
│ Step Progress: ● — ● — ◉ — —  (Step 3 of 5)                  │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ Mappa i campi (Field Mapping)                                │
│                                                               │
│ CONTATTI                                                     │
│                                                               │
│ Nome               →  [nome] ▼                               │
│ Email              →  [email] ▼                              │
│ Azienda            →  [azienda] ▼                            │
│ Lifecycle stage    →  [-- Ignora --] ▼                       │
│                                                               │
│ DEAL                                                         │
│                                                               │
│ Nome               →  [nome] ▼                               │
│ Valore             →  [valore] ▼                             │
│ Pipeline           →  [pipeline] ▼                           │
│ Stage              →  [stage] ▼                              │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                                     [Avanti] →    │
└───────────────────────────────────────────────────────────────┘
```

### 8. Step 4: Sync Frequency

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
├───────────────────────────────────────────────────────────────┤
│ Step Progress: ● — ● — ● — ◉ —  (Step 4 of 5)                │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ Con quale frequenza sincronizzare?                           │
│                                                               │
│ ◉ Ogni giorno (Every 24h)                                    │
│ ○ Ogni settimana                                            │
│ ○ Ogni mese                                                 │
│ ○ Manuale (on-demand)                                       │
│                                                               │
│ Prossima sincronizzazione: domani alle 02:00 UTC            │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [Indietro]                                     [Avanti] →    │
└───────────────────────────────────────────────────────────────┘
```

### 9. Step 5: Review & Activate

```
┌───────────────────────────────────────────────────────────────┐
│ ← Configura HubSpot                                        [×] │
├───────────────────────────────────────────────────────────────┤
│ Step Progress: ● — ● — ● — ● — ◉  (Step 5 of 5)              │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│ RIEPILOGO DELLA CONFIGURAZIONE                               │
│                                                               │
│ 👤 HubSpot CRM / Marketing                                    │
│                                                               │
│ Entita selezionate:                                          │
│ • Contatti (8,200)                                           │
│ • Deal (1,450)                                               │
│                                                               │
│ Autenticazione: API Key (Private App Token)                  │
│ • Chiave verificata ✅                                        │
│                                                               │
│ Mapping:                                                     │
│ • 7 campi mappati (6 automatici, 1 manuale)                  │
│                                                               │
│ Sincronizzazione: Ogni giorno a 02:00 UTC                    │
│                                                               │
│ ┌───────────────────────────────────────────────────────────┐│
│ │                                                           ││
│ │         🚀 [ATTIVA CONNESSIONE]                           ││
│ │                                                           ││
│ │   La sincronizzazione inizierà immediatamente            ││
│ │                                                           ││
│ └───────────────────────────────────────────────────────────┘│
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ [← Torna indietro]           [Modifica mapping]              │
└───────────────────────────────────────────────────────────────┘
```

### 10. Success!

```
┌───────────────────────────────────────────────────────────────┐
│ ← Torna a Connettori                                       [×] │
│                                                               │
│ ✅ CONNESSIONE ATTIVATA                                       │
│                                                               │
│ 👤 HubSpot è ora connesso                                     │
│                                                               │
│ Sincronizzazione avviata:                                    │
│ • Contatti: 8,200 record importati                           │
│ • Deal: 1,450 record importati                               │
│                                                               │
│ Prossima sincronizzazione: domani alle 02:00 UTC             │
│                                                               │
│          [Torna al dashboard] [Vai alla sincronizzazione]    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Salesforce Example (Similar Flow)

### Step 2: Auth with Both Keys

```
┌───────────────────────────────────────────────────────────────┐
│ Connetti Salesforce                                           │
│ Inserisci le credenziali API                                 │
│                                                               │
│ ┌─────────────┬─────────────┐                                │
│ │ 🔒 OAuth    │ 🔑 API Key  │                                │
│ └─────────────┴─────────────┘                                │
│                                                               │
│ API Key (Connected App Client ID) *                          │
│ ┌────────────────────────────────────────────────┐           │
│ │ 3MVGfZ....                                     │           │
│ └────────────────────────────────────────────────┘           │
│                                                               │
│ Client Secret (opzionale)                                    │
│ ┌────────────────────────────────────────────────┐           │
│ │ (password field with eye toggle)               │           │
│ └────────────────────────────────────────────────┘           │
│                                                               │
│ ℹ️  Per autenticazione manuale: crea una Connected App       │
│    in Salesforce e usa Client ID + Secret...                │
│                                                               │
│               [Verifica connessione]                          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Google Drive Example

### Step 2: Auth with Service Account

```
┌───────────────────────────────────────────────────────────────┐
│ Connetti Google Drive                                         │
│ Inserisci le credenziali API                                 │
│                                                               │
│ ┌─────────────┬─────────────┐                                │
│ │ 🔒 OAuth    │ 🔑 API Key  │                                │
│ └─────────────┴─────────────┘                                │
│                                                               │
│ Service Account JSON Key *                                   │
│ ┌────────────────────────────────────────────────┐           │
│ │ Incolla il file JSON completo qui...          │           │
│ │ {                                              │           │
│ │   "type": "service_account",                  │           │
│ │   "project_id": "my-project",                 │           │
│ │   ...                                          │           │
│ │ }                                              │           │
│ │                                                │           │
│ └────────────────────────────────────────────────┘           │
│                                                               │
│ ℹ️  Per autenticazione manuale: scarica il JSON della        │
│    Service Account da Google Cloud Console...               │
│                                                               │
│               [Verifica connessione]                          │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Key Features

### ✅ Smart Toggle
- Only appears when connector supports both methods
- Instant switching with visual feedback
- Clear labeling: "OAuth" (🔒) vs "API Key" (🔑)

### ✅ Contextual Help
- Each connector shows how to find its API key
- Links to platform docs (implicit in help text)
- Clear distinction between OAuth and API key methods

### ✅ Robust Verification
- Real-time validation with immediate feedback
- Spinner during verification
- Clear success/error messages
- Prevents advancing without valid credentials

### ✅ Backward Compatible
- Existing OAuth-only connectors unaffected
- Existing API-key-only connectors work as before
- No breaking changes to UI or API

## Interaction States

| State | Button | Form | Help Text | Next Button |
|-------|--------|------|-----------|-------------|
| **Initial** | OAuth highlighted | OAuth card | OAuth perms | Disabled |
| **Toggle to API Key** | API Key highlighted | API Key form | API Key help | Disabled |
| **Key Empty** | API Key highlighted | API Key form | API Key help | Disabled |
| **Key Entered** | API Key highlighted | API Key form | API Key help | Enabled |
| **Verifying** | Spinner | Form frozen | Spinner text | Disabled |
| **Success** | API Key highlighted | Form + ✅ | Success msg | Enabled |
| **Error** | API Key highlighted | Form + ❌ | Error msg | Disabled |

