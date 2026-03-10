# Wireframe: Integration Platform UI

**Task**: e5bd253a
**Autore**: UX/UI Department (ui-ux-designer)
**Data**: 2026-03-10
**Design System**: Lightlife / Poimandres Dark

---

## Indice

1. [A. Connector Browser / Marketplace](#a-connector-browser--marketplace)
2. [B. Setup Wizard (5 step)](#b-setup-wizard-5-step)
3. [C. Sync Dashboard](#c-sync-dashboard)
4. [D. Mapping UI](#d-mapping-ui)
5. [E. Error Detail View](#e-error-detail-view)
6. [F. User Journey Flow](#f-user-journey-flow)
7. [Note implementative](#note-implementative)

---

## Design System Reference

Queste wireframe seguono il design system Lightlife (light pages) e Poimandres (dark pages, console/ops). La pagina integrations sara in tema **Poimandres dark** perche fa parte dell'area operativa (/ops o /console).

| Token | Valore | Uso in wireframe |
|-------|--------|-----------------|
| `--bg-base` | #1b1e28 | Sfondo pagina |
| `--bg-raised` | #252837 | Card, pannelli |
| `--bg-overlay` | #2d3146 | Modal, wizard overlay |
| `--border-dark` | #383b4d | Bordi card |
| `--border-dark-subtle` | #2a2d3e | Separatori leggeri |
| `--fg-primary` | #e4f0fb | Titoli, testo principale |
| `--fg-secondary` | #a6accd | Corpo testo |
| `--fg-muted` | #767c9d | Placeholder, caption |
| `--fg-invisible` | #5e6382 | Metadata, contatori |
| `--accent` | #FF6B35 | CTA, badge attivi |
| `--success` | #5de4c7 | Stato "connected" / sync OK |
| `--error` | #e58d78 | Errori sync |
| `--warning` | #d0679d | Attenzione |
| `--caution` | #fffac2 | In attesa |
| `--info` | #add7ff | Link, badge info |
| `--info-bright` | #89ddff | Dati live |

**Tipografia**: DM Sans (UI), Instrument Serif (heading decorativi)
**Icone**: Lucide React
**Animazioni**: Framer Motion, durate 150-300ms, easing naturale
**Radii**: card = `rounded-xl` (16px), badge = `rounded-full`, input = `rounded-xl`

---

## A. Connector Browser / Marketplace

### Layout Overview

Pagina full-width sotto la nav, accessibile da `/integrations` o come pannello dentro `/ops`.

```
+=========================================================================+
|  [<-]  Integrazioni                                    [? Help]         |
+=========================================================================+
|                                                                         |
|  .-- Search Bar -------------------------------------------------.     |
|  | [Q] Cerca connettore...                              [Filters] |     |
|  '---------------------------------------------------------------'     |
|                                                                         |
|  .-- Category Filter Pills ------------------------------------------.  |
|  | [Tutti (24)]  [CRM (6)]  [ERP (4)]  [Marketing (5)]  [Finance (3)]|  |
|  | [HR (2)]  [Legal (2)]  [Storage (1)]  [Custom (1)]                 |  |
|  '-------------------------------------------------------------------'  |
|                                                                         |
|  .-- Connector Grid (3 col desktop / 2 col tablet / 1 col mobile) ---.  |
|  |                                                                    |  |
|  |  +------------------+  +------------------+  +------------------+  |  |
|  |  | [Logo]           |  | [Logo]           |  | [Logo]           |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | Salesforce       |  | HubSpot          |  | Stripe           |  |  |
|  |  | CRM              |  | CRM / Marketing  |  | Finance          |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | "Sincronizza     |  | "Contatti, deal  |  | "Fatture,        |  |  |
|  |  |  contatti e      |  |  e campagne      |  |  pagamenti e     |  |  |
|  |  |  opportunita"    |  |  marketing"      |  |  abbonamenti"    |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | [*] Popolare     |  | [*] Popolare     |  |                  |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | [== Connetti ==] |  | [== Connetti ==] |  | [== Connetti ==] |  |  |
|  |  +------------------+  +------------------+  +------------------+  |  |
|  |                                                                    |  |
|  |  +------------------+  +------------------+  +------------------+  |  |
|  |  | [Logo]           |  | [Logo]           |  | [Logo]           |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | SAP              |  | Mailchimp        |  | Google Sheets    |  |  |
|  |  | ERP              |  | Marketing        |  | Storage          |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | "Gestionale      |  | "Liste, campagne |  | "Importa/esporta |  |  |
|  |  |  completo ERP"   |  |  email e         |  |  dati da fogli   |  |  |
|  |  |                  |  |  automazioni"    |  |  di calcolo"     |  |  |
|  |  |                  |  |                  |  |                  |  |  |
|  |  | [== Connetti ==] |  | [== Connetti ==] |  | [== Connetti ==] |  |  |
|  |  +------------------+  +------------------+  +------------------+  |  |
|  |                                                                    |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
|  .-- Footer Row ----------------------------------------------------.   |
|  | Mostrando 6 di 24 connettori           [Carica altri] [Richiedi]  |   |
|  '-------------------------------------------------------------------'  |
+=========================================================================+
```

### Connector Card — Dettaglio

```
+----------------------------------------------+
|                                              |
|  .-------.                                   |
|  | LOGO  |   48x48px, rounded-lg             |
|  | (svg)  |   bg-[var(--bg-overlay)]          |
|  '-------'                                   |
|                                              |
|  Salesforce                    <- fg-primary  |
|  .-------. .-----------.                     |
|  | CRM   | | Popolare  |      <- badges     |
|  '-------' '-----------'                     |
|                                              |
|  Sincronizza contatti,         <- fg-secondary|
|  opportunita e pipeline                      |
|  di vendita.                                 |
|                                              |
|  .-- Status Indicator -----------------.     |
|  | (dot) Non configurato               |     |  <- fg-muted, dot grigio
|  '-------------------------------------'     |
|     OPPURE                                   |
|  | (dot) Connesso  -  Ultimo sync 2h fa |    |  <- success, dot verde
|  '-------------------------------------'     |
|                                              |
|  +========================================+  |
|  |           Connetti                     |  |  <- CTA accent gradient
|  +========================================+  |
|     OPPURE (se gia connesso)                 |
|  +--------------------+ +----------------+   |
|  |    Configura       | |    Disconnetti |   |  <- secondary / ghost
|  +--------------------+ +----------------+   |
|                                              |
+----------------------------------------------+

Card CSS classes:
  bg-[var(--bg-raised)]
  rounded-xl
  border border-[var(--border-dark-subtle)]
  hover:border-[var(--border-dark)]
  transition-colors duration-[var(--duration-fast)]
  p-6
  flex flex-col gap-4

Badge "Popolare":
  bg-[var(--accent)]/15
  text-[var(--accent)]
  rounded-full px-3 py-1
  text-xs font-semibold uppercase tracking-wider

Badge categoria:
  bg-[var(--bg-overlay)]
  text-[var(--fg-muted)]
  rounded-full px-3 py-1
  text-xs

CTA "Connetti":
  bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)]
  text-white
  rounded-xl
  py-3 px-6
  font-semibold
  hover:scale-[1.02]
  transition-transform duration-[var(--duration-fast)]
```

### Category Filter Pills

```
.-- Selected -----.   .-- Default ------.   .-- Default ------.
| Tutti (24)      |   | CRM (6)         |   | ERP (4)         |
'-----------------'   '------------------'   '------------------'

Selected:
  bg-[var(--accent)]/15
  text-[var(--accent)]
  border border-[var(--accent)]/30
  rounded-full px-4 py-2
  text-sm font-medium

Default:
  bg-[var(--bg-overlay)]
  text-[var(--fg-muted)]
  border border-transparent
  hover:border-[var(--border-dark)]
  rounded-full px-4 py-2
  text-sm
```

### Search Bar

```
+------------------------------------------------------------+
| [Search icon]  Cerca connettore...          [Sliders icon]  |
+------------------------------------------------------------+

bg-[var(--bg-raised)]
border border-[var(--border-dark-subtle)]
focus-within:border-[var(--accent)]/50
focus-within:ring-2 focus-within:ring-[var(--accent)]/20
rounded-xl
px-4 py-3
text-[var(--fg-primary)]
placeholder:text-[var(--fg-muted)]
```

### Responsive Behavior

| Breakpoint | Colonne grid | Search | Pill overflow |
|-----------|-------------|--------|---------------|
| Mobile (<640px) | 1 col | Sticky top | Scroll orizzontale |
| Tablet (640-1024px) | 2 col | Sticky top | Wrap |
| Desktop (>1024px) | 3 col | Inline | Inline |

### Interazioni

1. **Hover card**: border diventa `--border-dark`, ombra `--shadow-md`
2. **Click "Connetti"**: apre Setup Wizard (sezione B) come modal overlay
3. **Click card body**: espande card per mostrare dettagli (entita disponibili, documentazione)
4. **Search**: filtra in real-time, debounce 300ms
5. **Filter pills**: click = filtra, animazione Framer Motion `layout` sulle card

### Stato Connesso

Quando un connettore e gia configurato, la card mostra:

```
+----------------------------------------------+
|  .-------.    Salesforce          [*active*]  |
|  | LOGO  |    CRM                            |
|  '-------'                                   |
|                                              |
|  (green dot) Connesso                        |
|  Ultimo sync: 2h fa  |  1.234 record         |
|                                              |
|  +-------------------+ +-------------------+ |
|  |   Configura       | |   Disconnetti     | |
|  +-------------------+ +-------------------+ |
+----------------------------------------------+

Active badge: bg-[var(--success)]/15 text-[var(--success)] text-xs rounded-full
"Configura": bg-[var(--bg-overlay)] text-[var(--fg-secondary)] border border-[var(--border-dark)]
"Disconnetti": text-[var(--error)] hover:bg-[var(--error)]/10
```

---

## B. Setup Wizard (5 step)

### Layout Overview

Modal overlay full-screen (mobile) o centered overlay (desktop). Stepper in alto, contenuto al centro, navigazione in basso.

```
+=========================================================================+
|                                                                         |
|  .-- Wizard Overlay (centered, max-w-[680px]) ----------------------.  |
|  |                                                                    |  |
|  |  [X close]                                                         |  |
|  |                                                                    |  |
|  |  .-- Stepper -------------------------------------------------.   |  |
|  |  |                                                             |   |  |
|  |  |  (1)-----(2)-----(3)-----(4)-----(5)                        |   |  |
|  |  |  Fonte   Auth    Dati    Mapping  Attiva                    |   |  |
|  |  |                                                             |   |  |
|  |  '-------------------------------------------------------------'   |  |
|  |                                                                    |  |
|  |  .-- Step Content (variable) ---------------------------------.   |  |
|  |  |                                                             |   |  |
|  |  |                   [step-specific content]                   |   |  |
|  |  |                                                             |   |  |
|  |  '-------------------------------------------------------------'   |  |
|  |                                                                    |  |
|  |  .-- Navigation Bar ------------------------------------------.   |  |
|  |  |                                                             |   |  |
|  |  |  [<- Indietro]                         [Avanti ->]          |   |  |
|  |  |                                                             |   |  |
|  |  '-------------------------------------------------------------'   |  |
|  |                                                                    |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
+=========================================================================+
```

### Stepper Component

```
  (1)==========(2)==========(3)==========(4)==========(5)
  Fonte        Auth         Dati        Mapping       Attiva

  Completed step:     (checkmark) ========== (filled line)
  Current step:       (number, accent)
  Future step:        (number, muted)
  Connecting line:    completed = accent, future = border-dark

  Step circle:
    Completed: bg-[var(--success)] text-white w-8 h-8 rounded-full
    Current:   bg-[var(--accent)] text-white w-8 h-8 rounded-full ring-4 ring-[var(--accent)]/20
    Future:    bg-[var(--bg-overlay)] text-[var(--fg-muted)] w-8 h-8 rounded-full border border-[var(--border-dark)]

  Step label:
    Current:   text-[var(--fg-primary)] text-xs font-semibold mt-2
    Other:     text-[var(--fg-muted)] text-xs mt-2

  Line between:
    Completed: h-0.5 bg-[var(--success)] flex-1
    Future:    h-0.5 bg-[var(--border-dark)] flex-1
```

### Step 1: Seleziona Fonte

```
+------------------------------------------------------------+
|                                                            |
|  Seleziona il connettore              <- text-2xl fg-primary
|  Scegli il servizio da integrare      <- text-sm fg-secondary
|                                                            |
|  .-- Search ------------------------------------------.   |
|  | [Q] Filtra connettori...                            |   |
|  '----------------------------------------------------'   |
|                                                            |
|  .-- Mini Connector Grid (2 col) ---------------------.   |
|  |                                                     |   |
|  |  +---------------------+  +---------------------+  |   |
|  |  | [Logo] Salesforce   |  | [Logo] HubSpot      |  |   |
|  |  |        CRM          |  |        CRM           |  |   |
|  |  +---------------------+  +---------------------+  |   |
|  |                                                     |   |
|  |  +---------------------+  +---------------------+  |   |
|  |  | [Logo] Stripe       |  | [Logo] SAP          |  |   |
|  |  |        Finance      |  |        ERP           |  |   |
|  |  +---------------------+  +---------------------+  |   |
|  |                                                     |   |
|  |  +---------------------+  +---------------------+  |   |
|  |  | [Logo] Mailchimp    |  | [Logo] Sheets       |  |   |
|  |  |        Marketing    |  |        Storage       |  |   |
|  |  +---------------------+  +---------------------+  |   |
|  |                                                     |   |
|  '-----------------------------------------------------'   |
|                                                            |
+------------------------------------------------------------+

Mini card (selezionabile):
  Default:
    bg-[var(--bg-overlay)]
    border border-[var(--border-dark-subtle)]
    rounded-xl p-4
    cursor-pointer
    hover:border-[var(--border-dark)]

  Selected:
    bg-[var(--accent)]/10
    border border-[var(--accent)]/50
    rounded-xl p-4
    ring-2 ring-[var(--accent)]/20
```

### Step 2: Autenticazione

Due varianti: OAuth e API Key.

**Variante OAuth:**

```
+------------------------------------------------------------+
|                                                            |
|  Connetti [Logo] Salesforce      <- text-2xl fg-primary    |
|  Autorizza l'accesso al tuo account  <- text-sm fg-secondary
|                                                            |
|  .-- OAuth Card ----------------------------------------.  |
|  |                                                       |  |
|  |  [Shield icon]                                        |  |
|  |                                                       |  |
|  |  Controlla.me richiede accesso a:                     |  |
|  |                                                       |  |
|  |  (check) Lettura contatti                             |  |
|  |  (check) Lettura opportunita                          |  |
|  |  (check) Lettura pipeline                             |  |
|  |                                                       |  |
|  |  Non modifichiamo mai i tuoi dati.                    |  |
|  |                                                       |  |
|  |  +================================================+   |  |
|  |  |        Autorizza con Salesforce                |   |  |
|  |  +================================================+   |  |
|  |                                                       |  |
|  |  [Lock icon] Connessione sicura via OAuth 2.0         |  |
|  |                                                       |  |
|  '-------------------------------------------------------'  |
|                                                            |
+------------------------------------------------------------+

OAuth card:
  bg-[var(--bg-overlay)]
  border border-[var(--border-dark)]
  rounded-xl p-8
  text-center

Permissions list:
  text-left
  text-sm text-[var(--fg-secondary)]
  check icon: text-[var(--success)] w-4 h-4

CTA:
  bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)]
  text-white rounded-xl py-3 px-8 font-semibold
  w-full

Security note:
  text-xs text-[var(--fg-muted)]
  flex items-center gap-2 justify-center mt-4
```

**Variante API Key:**

```
+------------------------------------------------------------+
|                                                            |
|  Connetti [Logo] Stripe          <- text-2xl fg-primary    |
|  Inserisci le credenziali API    <- text-sm fg-secondary   |
|                                                            |
|  .-- Credential Form ----------------------------------.   |
|  |                                                      |   |
|  |  API Key *                                           |   |
|  |  +------------------------------------------------+  |   |
|  |  | sk_live_...                                     |  |   |
|  |  +------------------------------------------------+  |   |
|  |                                                      |   |
|  |  Secret Key (opzionale)                              |   |
|  |  +------------------------------------------------+  |   |
|  |  | whsec_...                          [Eye icon]   |  |   |
|  |  +------------------------------------------------+  |   |
|  |                                                      |   |
|  |  [Info icon] Trova le tue chiavi API in              |   |
|  |  Stripe Dashboard > Developers > API Keys            |   |
|  |                                                      |   |
|  |  +================================================+  |   |
|  |  |              Verifica connessione              |  |   |
|  |  +================================================+  |   |
|  |                                                      |   |
|  '------------------------------------------------------'   |
|                                                            |
|  .-- Connection Status (after verify) ----------------.    |
|  |  (green dot) Connessione verificata                 |    |
|  |  Account: acme-corp  |  Piano: Business             |    |
|  '-----------------------------------------------------'    |
|                                                            |
+------------------------------------------------------------+

Input field:
  bg-[var(--bg-base)]
  border border-[var(--border-dark-subtle)]
  focus:border-[var(--accent)]/50
  focus:ring-2 focus:ring-[var(--accent)]/20
  rounded-xl px-4 py-3
  text-[var(--fg-primary)]
  placeholder:text-[var(--fg-muted)]
  font-mono text-sm

Label:
  text-sm text-[var(--fg-secondary)] font-medium mb-2

Help text:
  text-xs text-[var(--fg-muted)]
  bg-[var(--bg-overlay)] rounded-lg p-3 mt-3
  flex items-start gap-2

Verify button:
  Same as CTA accent gradient
  Loading state: spinner + "Verifica in corso..."

Connection status:
  bg-[var(--success)]/10
  border border-[var(--success)]/30
  rounded-xl p-4 mt-4
  text-sm text-[var(--success)]

Error state:
  bg-[var(--error)]/10
  border border-[var(--error)]/30
  rounded-xl p-4 mt-4
  text-sm text-[var(--error)]
  "Verifica fallita: chiave API non valida"
```

### Step 3: Seleziona Dati

```
+------------------------------------------------------------+
|                                                            |
|  Seleziona i dati da sincronizzare   <- text-2xl fg-primary
|  Scegli le entita da importare       <- text-sm fg-secondary
|                                                            |
|  .-- Select All Row ---------------------------------.     |
|  | [x] Seleziona tutto              3 di 6 selezionati|     |
|  '----------------------------------------------------'     |
|                                                            |
|  .-- Entity List -----------------------------------.      |
|  |                                                   |      |
|  |  +-----------------------------------------------+|      |
|  |  | [x]  Contatti                                  ||      |
|  |  |      12.450 record  |  Ultimo agg: 2h fa      ||      |
|  |  |      Nome, email, telefono, azienda, ruolo     ||      |
|  |  +-----------------------------------------------+|      |
|  |                                                   |      |
|  |  +-----------------------------------------------+|      |
|  |  | [x]  Opportunita                               ||      |
|  |  |      3.210 record  |  Ultimo agg: 30min fa     ||      |
|  |  |      Titolo, valore, fase, probabilita          ||      |
|  |  +-----------------------------------------------+|      |
|  |                                                   |      |
|  |  +-----------------------------------------------+|      |
|  |  | [x]  Pipeline                                  ||      |
|  |  |      8 record  |  Ultimo agg: 1g fa            ||      |
|  |  |      Nome, fasi, probabilita default            ||      |
|  |  +-----------------------------------------------+|      |
|  |                                                   |      |
|  |  +-----------------------------------------------+|      |
|  |  | [ ]  Attivita  (collassato)                    ||      |
|  |  +-----------------------------------------------+|      |
|  |                                                   |      |
|  |  +-----------------------------------------------+|      |
|  |  | [ ]  Note  (collassato)                        ||      |
|  |  +-----------------------------------------------+|      |
|  |                                                   |      |
|  |  +-----------------------------------------------+|      |
|  |  | [ ]  Report  (collassato)                      ||      |
|  |  +-----------------------------------------------+|      |
|  |                                                   |      |
|  '---------------------------------------------------'      |
|                                                            |
|  Stima sincronizzazione: ~15.668 record, ~2 minuti         |
|                                                            |
+------------------------------------------------------------+

Entity row (selected):
  bg-[var(--accent)]/5
  border border-[var(--accent)]/20
  rounded-xl p-4 mb-2
  cursor-pointer

Entity row (unselected):
  bg-[var(--bg-overlay)]
  border border-[var(--border-dark-subtle)]
  rounded-xl p-4 mb-2
  cursor-pointer
  hover:border-[var(--border-dark)]

Checkbox:
  w-5 h-5 rounded-md
  Checked: bg-[var(--accent)] border-[var(--accent)]
  Unchecked: bg-[var(--bg-base)] border-[var(--border-dark)]

Entity name:
  text-[var(--fg-primary)] font-medium text-sm

Record count + last update:
  text-xs text-[var(--fg-muted)]

Fields preview:
  text-xs text-[var(--fg-invisible)] mt-1

Estimation:
  text-xs text-[var(--fg-muted)]
  bg-[var(--bg-overlay)] rounded-lg p-3 mt-4
  flex items-center gap-2
  [Clock icon] text-[var(--info-bright)]
```

### Step 4: Mapping Campi

> Vedi sezione D per la versione full-detail del Mapping UI.
> Qui si mostra la versione compatta dentro il wizard.

```
+------------------------------------------------------------+
|                                                            |
|  Mappa i campi                       <- text-2xl fg-primary
|  L'AI ha suggerito la mappatura.     <- text-sm fg-secondary
|  Verifica e correggi se necessario.                        |
|                                                            |
|  .-- Entity Tabs ------------------------------------.     |
|  | [Contatti (8)]  [Opportunita (6)]  [Pipeline (4)] |     |
|  '----------------------------------------------------'     |
|                                                            |
|  .-- Mapping Table (Contatti) ----------------------.      |
|  |                                                   |      |
|  |  Campo Sorgente   ->   Campo Destinazione  Conf.  |      |
|  |  ------------------------------------------------|      |
|  |  first_name       ->   [nome v]             98%   |      |
|  |  last_name        ->   [cognome v]          98%   |      |
|  |  email            ->   [email v]            99%   |      |
|  |  phone            ->   [telefono v]         95%   |      |
|  |  company          ->   [azienda v]          92%   |      |
|  |  title            ->   [ruolo v]            88%   |      |
|  |  custom_field_1   ->   [-- Ignora -- v]     --    |      |
|  |  address          ->   [indirizzo v]        85%   |      |
|  |                                                   |      |
|  '---------------------------------------------------'      |
|                                                            |
|  .-- AI Suggestion Banner ---------------------------.     |
|  | [Sparkles icon] 6/8 campi mappati automaticamente  |     |
|  | 2 campi richiedono verifica manuale                |     |
|  '----------------------------------------------------'     |
|                                                            |
|  [Anteprima dati mappati ->]     <- link, text-[var(--info)]
|                                                            |
+------------------------------------------------------------+

Entity tabs:
  Active: text-[var(--accent)] border-b-2 border-[var(--accent)] pb-2 font-medium text-sm
  Inactive: text-[var(--fg-muted)] pb-2 text-sm hover:text-[var(--fg-secondary)]

Mapping row:
  flex items-center gap-3 py-3
  border-b border-[var(--border-dark-subtle)] last:border-0

Source field:
  text-sm text-[var(--fg-primary)] font-mono
  bg-[var(--bg-overlay)] rounded-lg px-3 py-2
  flex-1

Arrow:
  text-[var(--fg-invisible)] w-5 h-5 (ArrowRight icon)

Destination dropdown:
  bg-[var(--bg-base)]
  border border-[var(--border-dark-subtle)]
  rounded-lg px-3 py-2
  text-sm text-[var(--fg-primary)]
  flex-1
  Includes: "-- Ignora --" option + "-- Nuovo campo --" option

Confidence:
  >= 90%: text-[var(--success)] font-mono text-xs
  70-89%: text-[var(--caution)] font-mono text-xs (warning icon)
  < 70%:  text-[var(--error)] font-mono text-xs (alert icon)

AI banner:
  bg-[var(--info)]/10
  border border-[var(--info)]/20
  rounded-xl p-4 mt-4
  text-sm text-[var(--info)]
  flex items-center gap-3
```

### Step 5: Review e Attiva

```
+------------------------------------------------------------+
|                                                            |
|  Riepilogo integrazione              <- text-2xl fg-primary
|  Verifica le impostazioni prima      <- text-sm fg-secondary
|  di attivare la sincronizzazione.                          |
|                                                            |
|  .-- Summary Card -----------------------------------.     |
|  |                                                    |     |
|  |  .-------.   Salesforce                            |     |
|  |  | LOGO  |   CRM  |  Connesso                     |     |
|  |  '-------'                                         |     |
|  |                                                    |     |
|  |  .- Section: Dati Selezionati -----------------.   |     |
|  |  | Contatti        12.450 record    [Modifica]  |   |     |
|  |  | Opportunita      3.210 record    [Modifica]  |   |     |
|  |  | Pipeline             8 record    [Modifica]  |   |     |
|  |  '---------------------------------------------'   |     |
|  |                                                    |     |
|  |  .- Section: Mapping --------------------------.   |     |
|  |  | 18 campi mappati (14 auto, 4 manuali)       |   |     |
|  |  | 2 campi ignorati                [Modifica]  |   |     |
|  |  '---------------------------------------------'   |     |
|  |                                                    |     |
|  '----------------------------------------------------'     |
|                                                            |
|  .-- Schedule Selector -------------------------------.    |
|  |                                                     |    |
|  |  Frequenza sincronizzazione                         |    |
|  |                                                     |    |
|  |  ( ) Tempo reale (webhook)                          |    |
|  |  (*) Ogni ora                                       |    |
|  |  ( ) Ogni 6 ore                                     |    |
|  |  ( ) Giornaliera (06:00)                            |    |
|  |  ( ) Manuale                                        |    |
|  |                                                     |    |
|  '-----------------------------------------------------'    |
|                                                            |
|  .-- Action Bar -------------------------------------.     |
|  |                                                    |     |
|  |  [<- Indietro]       [===== Attiva Sync =====]    |     |
|  |                                                    |     |
|  '----------------------------------------------------'     |
|                                                            |
+------------------------------------------------------------+

Summary card:
  bg-[var(--bg-raised)]
  border border-[var(--border-dark)]
  rounded-xl p-6

Section header:
  text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wider mb-3

Section row:
  flex items-center justify-between py-2
  border-b border-[var(--border-dark-subtle)] last:border-0
  text-sm text-[var(--fg-secondary)]

"Modifica" link:
  text-xs text-[var(--info)] hover:underline cursor-pointer

Schedule radio group:
  bg-[var(--bg-raised)]
  border border-[var(--border-dark-subtle)]
  rounded-xl p-6 mt-4

Radio:
  Selected: accent ring
  Unselected: border-dark

CTA "Attiva Sync":
  bg-gradient-to-r from-[var(--success)] to-emerald-500
  text-white rounded-xl py-3 px-8 font-semibold
  hover:scale-[1.02]

  Loading state:
    spinner + "Attivazione in corso..."

  Success state:
    (check icon) "Integrazione attiva!"
    -> auto-redirect a Sync Dashboard dopo 2s
```

### Wizard — Overlay e Navigazione

```
Overlay background:
  bg-black/60 backdrop-blur-sm
  fixed inset-0 z-50

Wizard container:
  bg-[var(--bg-base)]
  border border-[var(--border-dark)]
  rounded-2xl
  max-w-[680px] w-full
  mx-auto my-8
  max-h-[calc(100vh-64px)]
  overflow-y-auto
  p-8

  Mobile (<640px):
    fixed inset-0 rounded-none m-0 max-h-none

Close button:
  absolute top-4 right-4
  text-[var(--fg-muted)] hover:text-[var(--fg-primary)]
  w-8 h-8 rounded-lg hover:bg-[var(--bg-overlay)]

Navigation bar:
  flex items-center justify-between
  border-t border-[var(--border-dark-subtle)]
  pt-6 mt-6

"Indietro":
  text-[var(--fg-secondary)] hover:text-[var(--fg-primary)]
  flex items-center gap-2 text-sm

"Avanti":
  bg-[var(--accent)] text-white rounded-xl py-2.5 px-6 font-medium
  disabled:opacity-40 disabled:cursor-not-allowed

Animazione step transition:
  Framer Motion AnimatePresence
  enter: opacity 0 -> 1, translateX 20px -> 0
  exit: opacity 1 -> 0, translateX 0 -> -20px
  duration: var(--duration-normal) 300ms
```

---

## C. Sync Dashboard

### Layout Overview

Pagina dedicata `/integrations/dashboard` o tab dentro `/ops`. Mostra tutte le integrazioni attive con stato real-time.

```
+=========================================================================+
|  [<-]  Sync Dashboard                    [+ Nuova Integrazione]         |
+=========================================================================+
|                                                                         |
|  .-- Stats Bar ----------------------------------------------------.   |
|  |                                                                   |   |
|  |  +---------------+  +---------------+  +---------------+         |   |
|  |  | 5             |  | 12.4K         |  | 2             |         |   |
|  |  | Integrazioni  |  | Record        |  | Errori        |         |   |
|  |  | attive        |  | sincronizzati |  | da risolvere  |         |   |
|  |  +---------------+  +---------------+  +---------------+         |   |
|  |                                                                   |   |
|  '-------------------------------------------------------------------'   |
|                                                                         |
|  .-- Integration List ----------------------------------------------.   |
|  |                                                                    |   |
|  |  +----------------------------------------------------------------+|   |
|  |  | [Logo]  Salesforce                                    [...]    ||   |
|  |  |         CRM                                                    ||   |
|  |  |                                                                ||   |
|  |  |  (green dot) Sincronizzato                                     ||   |
|  |  |  Ultimo sync: 14:32  |  Prossimo: 15:32  |  12.450 record     ||   |
|  |  |                                                                ||   |
|  |  |  .-- Sync Progress Bar (if syncing) --------------------.     ||   |
|  |  |  | ==============================------   78%  3.210 rec |     ||   |
|  |  |  '------------------------------------------------------'     ||   |
|  |  |                                                                ||   |
|  |  +----------------------------------------------------------------+|   |
|  |                                                                    |   |
|  |  +----------------------------------------------------------------+|   |
|  |  | [Logo]  HubSpot                                       [...]    ||   |
|  |  |         CRM / Marketing                                        ||   |
|  |  |                                                                ||   |
|  |  |  (red dot) Errore                                              ||   |
|  |  |  Ultimo sync: 12:15 (fallito)  |  Prossimo: --                ||   |
|  |  |                                                                ||   |
|  |  |  .-- Error Banner ------------------------------------.        ||   |
|  |  |  | [!] Rate limit exceeded (429). Retry in 5 min.     |        ||   |
|  |  |  |     [Riprova ora]    [Vedi dettagli]               |        ||   |
|  |  |  '----------------------------------------------------'        ||   |
|  |  |                                                                ||   |
|  |  +----------------------------------------------------------------+|   |
|  |                                                                    |   |
|  |  +----------------------------------------------------------------+|   |
|  |  | [Logo]  Stripe                                        [...]    ||   |
|  |  |         Finance                                                ||   |
|  |  |                                                                ||   |
|  |  |  (yellow dot) In pausa                                         ||   |
|  |  |  Ultimo sync: ieri 23:00  |  Prossimo: -- (in pausa)          ||   |
|  |  |  1.890 record                                                  ||   |
|  |  |                                                                ||   |
|  |  |  [Riprendi sync]                                               ||   |
|  |  |                                                                ||   |
|  |  +----------------------------------------------------------------+|   |
|  |                                                                    |   |
|  |  +----------------------------------------------------------------+|   |
|  |  | [Logo]  Mailchimp                                     [...]    ||   |
|  |  |         Marketing                                              ||   |
|  |  |                                                                ||   |
|  |  |  (blue dot) In sync...                                         ||   |
|  |  |  Avviato: 14:28  |  45% completato  |  2.100/4.650 record     ||   |
|  |  |                                                                ||   |
|  |  |  .-- Sync Progress Bar --------------------------------.       ||   |
|  |  |  | =======================--------------------   45%    |       ||   |
|  |  |  '------------------------------------------------------'       ||   |
|  |  |                                                                ||   |
|  |  +----------------------------------------------------------------+|   |
|  |                                                                    |   |
|  '--------------------------------------------------------------------'   |
|                                                                         |
|  .-- Error Log (collassabile) --------------------------------------.   |
|  |  [!] Log Errori (2)                                    [Espandi]  |   |
|  |                                                                    |   |
|  |  (collapsed by default — click to expand)                          |   |
|  '--------------------------------------------------------------------'   |
|                                                                         |
+=========================================================================+
```

### Integration Row — Dettaglio

```
+--------------------------------------------------------------------+
|                                                                    |
|  .-- Header Row ------------------------------------------------.  |
|  | [Logo]  Nome Connettore                          [... menu]   |  |
|  |  48x48  Categoria / Tag                                       |  |
|  '--------------------------------------------------------------'  |
|                                                                    |
|  .-- Status Row ------------------------------------------------.  |
|  | (status dot)  Status Label                                    |  |
|  | Ultimo sync: HH:MM  |  Prossimo: HH:MM  |  N record          |  |
|  '--------------------------------------------------------------'  |
|                                                                    |
|  .-- Entities Breakdown (click to expand) ----------------------.  |
|  | Contatti: 12.450  |  Opportunita: 3.210  |  Pipeline: 8       |  |
|  '--------------------------------------------------------------'  |
|                                                                    |
|  .-- Progress Bar (only during sync) ---------------------------.  |
|  | ================================-----------   78%  |  ~2 min   |  |
|  '--------------------------------------------------------------'  |
|                                                                    |
|  .-- Error Banner (only on error) -----------------------------.   |
|  | [AlertTriangle] Messaggio errore                             |   |
|  | [Riprova ora]  [Vedi dettagli]                               |   |
|  '-------------------------------------------------------------'   |
|                                                                    |
+--------------------------------------------------------------------+

Status dot colors:
  synced:    bg-[var(--success)] + subtle pulse animation
  syncing:   bg-[var(--info-bright)] + pulse animation
  error:     bg-[var(--error)]
  paused:    bg-[var(--caution)]
  disabled:  bg-[var(--fg-invisible)]

Integration row:
  bg-[var(--bg-raised)]
  border border-[var(--border-dark-subtle)]
  rounded-xl p-6
  mb-3
  hover:border-[var(--border-dark)]
  transition-colors

"..." menu (DropdownMenu):
  - Sync manuale
  - Configura mapping
  - Modifica schedule
  - Pausa / Riprendi
  - Disconnetti

Progress bar:
  bg-[var(--bg-overlay)] rounded-full h-2 overflow-hidden
  Inner bar: bg-gradient-to-r from-[var(--accent)] to-[var(--accent-dark)]
             rounded-full h-full
             transition-all duration-500

Error banner:
  bg-[var(--error)]/10
  border border-[var(--error)]/20
  rounded-lg p-4 mt-3
  text-sm

  "Riprova ora": text-[var(--accent)] font-medium hover:underline
  "Vedi dettagli": text-[var(--fg-muted)] hover:underline
```

### Stats Bar

```
+------------------+  +------------------+  +------------------+
|                  |  |                  |  |                  |
|  5               |  |  12.4K           |  |  2               |
|  Integrazioni    |  |  Record          |  |  Errori          |
|  attive          |  |  sincronizzati   |  |  da risolvere    |
|                  |  |                  |  |                  |
+------------------+  +------------------+  +------------------+

Stat card:
  bg-[var(--bg-raised)]
  border border-[var(--border-dark-subtle)]
  rounded-xl p-5
  text-center

Number:
  text-3xl font-bold text-[var(--fg-primary)]
  AnimatedCount component (come in SourcesGrid)

Label:
  text-xs text-[var(--fg-muted)] mt-1

Error stat:
  Number color: text-[var(--error)] (if > 0)
```

### Error Log (Expanded)

```
+--------------------------------------------------------------------+
|  [!] Log Errori (2)                                    [Comprimi]  |
+--------------------------------------------------------------------+
|                                                                    |
|  +--------------------------------------------------------------+  |
|  | 14:32  HubSpot  |  Rate limit (429)                          |  |
|  |                                                               |  |
|  | .-- Expandable Details (click) ----------------------------.  |  |
|  | | Request: GET /contacts?limit=100&offset=12400             |  |  |
|  | | Response: 429 Too Many Requests                           |  |  |
|  | | Headers: X-RateLimit-Remaining: 0                         |  |  |
|  | | Retry-After: 300                                          |  |  |
|  | |                                                           |  |  |
|  | | Stack trace:                                              |  |  |
|  | | at HubSpotConnector.fetchContacts (line 142)              |  |  |
|  | | at SyncPipeline.run (line 89)                             |  |  |
|  | '-----------------------------------------------------------'  |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  | 12:15  HubSpot  |  Timeout after 30s                         |  |
|  |                                                               |  |
|  | [Espandi dettagli]                                            |  |
|  +--------------------------------------------------------------+  |
|                                                                    |
+--------------------------------------------------------------------+

Error row:
  bg-[var(--bg-overlay)]
  border border-[var(--border-dark-subtle)]
  rounded-lg p-4 mb-2

Timestamp:
  text-xs text-[var(--fg-invisible)] font-mono

Connector name:
  text-sm text-[var(--fg-secondary)] font-medium

Error message:
  text-sm text-[var(--error)]

Expanded details:
  bg-[var(--bg-base)]
  border border-[var(--border-dark-subtle)]
  rounded-lg p-4 mt-3
  font-mono text-xs text-[var(--fg-muted)]
  overflow-x-auto
```

### Manual Sync Trigger

```
Nella row di integrazione, menu [...] > "Sync manuale":

  Apre un confirmation toast/dialog:
  +--------------------------------------------+
  | [RefreshCw]  Avviare sync manuale?         |
  |                                             |
  | Salesforce - Contatti, Opportunita, Pipeline|
  | Stima: ~15.668 record, ~2 minuti           |
  |                                             |
  | [Annulla]              [Avvia Sync]         |
  +--------------------------------------------+

  Dopo conferma:
  - Row passa a stato "syncing" con progress bar
  - Toast bottom-right: "Sync avviato per Salesforce"
```

---

## D. Mapping UI

### Layout Overview — Full Page Version

Versione full-page accessibile da Sync Dashboard > Configura mapping, oppure dallo step 4 del wizard in modalita espansa.

```
+=========================================================================+
|  [<-]  Mapping: Salesforce > Contatti          [Salva]  [Annulla]       |
+=========================================================================+
|                                                                         |
|  .-- Entity Tabs -------------------------------------------------.    |
|  | [Contatti (8)]  [Opportunita (6)]  [Pipeline (4)]               |    |
|  '-----------------------------------------------------------------'    |
|                                                                         |
|  .-- AI Suggestion Banner ----------------------------------------.    |
|  | [Sparkles]  6/8 campi mappati automaticamente dall'AI.          |    |
|  |             Confidenza media: 93%. Verifica i campi evidenziati.|    |
|  '-----------------------------------------------------------------'    |
|                                                                         |
|  .-- Two-Column Mapping ------------------------------------------.    |
|  |                                                                  |    |
|  |  CAMPO SORGENTE              CAMPO DESTINAZIONE          CONF.  |    |
|  |  (Salesforce)                (Controlla.me)                      |    |
|  |  ============================================================== |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | first_name        | ----> | nome              |  98%  [ok]   |    |
|  |  | string            |       | string            |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | last_name         | ----> | cognome           |  98%  [ok]   |    |
|  |  | string            |       | string            |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | email             | ----> | email             |  99%  [ok]   |    |
|  |  | string            |       | string            |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | phone             | ----> | telefono          |  95%  [ok]   |    |
|  |  | string            |       | string            |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | company_name      | ----> | azienda       [v] |  92%  [!]   |    |
|  |  | string            |       | string            |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                   ^                              |    |
|  |                                   | dropdown: azienda,           |    |
|  |                                   |   ragione_sociale,           |    |
|  |                                   |   societa,                   |    |
|  |                                   |   -- Ignora --               |    |
|  |                                   |   -- Nuovo campo --          |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | title             | ----> | ruolo         [v] |  88%  [!]   |    |
|  |  | string            |       | string            |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | custom_field_1    | --X-> | -- Ignora --  [v] |  --   [--]  |    |
|  |  | string            |       |                   |              |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  |  +-------------------+       +-------------------+              |    |
|  |  | address           | ----> | indirizzo         |  85%  [!]   |    |
|  |  | object            |       | string            |  tipo!      |    |
|  |  +-------------------+       +-------------------+              |    |
|  |                                                                  |    |
|  '------------------------------------------------------------------'    |
|                                                                         |
|  .-- Data Preview ------------------------------------------------.    |
|  |                                                                  |    |
|  |  Anteprima dati mappati (3 record campione)                      |    |
|  |                                                                  |    |
|  |  +----+------------+----------+------------------+-----------+   |    |
|  |  | #  | nome       | cognome  | email            | telefono  |   |    |
|  |  +----+------------+----------+------------------+-----------+   |    |
|  |  | 1  | Mario      | Rossi    | m.rossi@acme.it  | +39 02... |   |    |
|  |  | 2  | Laura      | Bianchi  | l.bianchi@xyz.it | +39 06... |   |    |
|  |  | 3  | Giuseppe   | Verdi    | g.verdi@abc.com  | --        |   |    |
|  |  +----+------------+----------+------------------+-----------+   |    |
|  |                                                                  |    |
|  |  [Mostra piu record]                                             |    |
|  |                                                                  |    |
|  '------------------------------------------------------------------'    |
|                                                                         |
+=========================================================================+
```

### Mapping Row — Dettaglio Interazione

```
  HIGH confidence (>= 90%):

  +-------------------+  ------>  +-------------------+
  | first_name        |           | nome              |   98%
  | string            |           | string            |   [check icon]
  +-------------------+           +-------------------+

  Arrow:  text-[var(--success)] (solid line)
  Confidence: text-[var(--success)] font-mono text-xs
  Status icon: CheckCircle text-[var(--success)] w-4 h-4


  MEDIUM confidence (70-89%):

  +-------------------+  - - ->   +-------------------+
  | company_name      |           | azienda       [v] |   88%
  | string            |           | string            |   [! icon]
  +-------------------+           +-------------------+

  Arrow:  text-[var(--caution)] (dashed line)
  Confidence: text-[var(--caution)] font-mono text-xs
  Status icon: AlertCircle text-[var(--caution)] w-4 h-4
  Dropdown visible for manual override


  LOW confidence (< 70%) or TYPE MISMATCH:

  +-------------------+  - - X>   +-------------------+
  | address           |           | indirizzo     [v] |   45%
  | object            |           | string            |   tipo!
  +-------------------+           +-------------------+

  Arrow:  text-[var(--error)] (dashed with X)
  Confidence: text-[var(--error)] font-mono text-xs
  Status icon: XCircle text-[var(--error)] w-4 h-4
  Type mismatch badge: bg-[var(--error)]/15 text-[var(--error)] text-[10px] rounded px-1.5


  IGNORED:

  +-------------------+     X     +-------------------+
  | custom_field_1    |           | -- Ignora --  [v] |   --
  | string            |           |                   |
  +-------------------+           +-------------------+

  Arrow: text-[var(--fg-invisible)] (strikethrough line)
  Row: opacity-60
```

### Source Field Block

```
+-------------------+
| field_name        |   <- text-sm text-[var(--fg-primary)] font-mono
| data_type         |   <- text-[10px] text-[var(--fg-invisible)] uppercase
+-------------------+

bg-[var(--bg-overlay)]
border border-[var(--border-dark-subtle)]
rounded-lg px-4 py-3
min-w-[180px]
```

### Destination Dropdown

```
+----------------------------------+
| nome                         [v] |
| string                          |
+----------------------------------+

Default: same styling as source field
On click: dropdown opens below

Dropdown:
  bg-[var(--bg-overlay)]
  border border-[var(--border-dark)]
  rounded-lg
  shadow-[var(--shadow-lg)]
  max-h-[240px] overflow-y-auto
  py-1

  Option (hover):
    bg-[var(--bg-hover)] px-4 py-2 text-sm

  "-- Ignora --":
    text-[var(--fg-muted)] italic

  "-- Nuovo campo --":
    text-[var(--accent)]
    border-t border-[var(--border-dark-subtle)]

  AI suggested (top option):
    bg-[var(--accent)]/5
    text-[var(--fg-primary)]
    flex items-center gap-2
    [Sparkles icon] text-[var(--accent)]
```

### Data Preview Table

```
+----+------------+----------+------------------+-----------+
| #  | nome       | cognome  | email            | telefono  |
+----+------------+----------+------------------+-----------+
| 1  | Mario      | Rossi    | m.rossi@acme.it  | +39 02... |
| 2  | Laura      | Bianchi  | l.bianchi@xyz.it | +39 06... |
| 3  | Giuseppe   | Verdi    | g.verdi@abc.com  | --        |
+----+------------+----------+------------------+-----------+

Table:
  bg-[var(--bg-raised)]
  border border-[var(--border-dark-subtle)]
  rounded-xl overflow-hidden
  mt-6

Header row:
  bg-[var(--bg-overlay)]
  text-xs text-[var(--fg-invisible)] uppercase tracking-wider font-semibold
  px-4 py-3
  border-b border-[var(--border-dark-subtle)]

Data row:
  text-sm text-[var(--fg-secondary)] font-mono
  px-4 py-3
  border-b border-[var(--border-dark-subtle)] last:border-0
  hover:bg-[var(--bg-hover)]

Row number:
  text-[var(--fg-invisible)] text-xs w-8

Empty value:
  text-[var(--fg-invisible)] italic ("--")

"Mostra piu record":
  text-center py-3
  text-sm text-[var(--info)] hover:underline cursor-pointer
```

### AI Suggestion Banner

```
+--------------------------------------------------------------------+
|                                                                    |
|  [Sparkles icon]  6/8 campi mappati automaticamente dall'AI.       |
|                   Confidenza media: 93%.                           |
|                   Verifica i campi evidenziati con [!].            |
|                                                                    |
|  [Accetta tutti i suggerimenti]     [Resetta mapping]              |
|                                                                    |
+--------------------------------------------------------------------+

bg-[var(--info)]/10
border border-[var(--info)]/20
rounded-xl p-5

Icon: Sparkles text-[var(--info)] w-5 h-5

Text: text-sm text-[var(--info)]

"Accetta tutti":
  bg-[var(--info)]/15 text-[var(--info)]
  rounded-lg px-4 py-2 text-sm font-medium
  hover:bg-[var(--info)]/25

"Resetta":
  text-[var(--fg-muted)] text-sm hover:text-[var(--fg-secondary)]
```

---

## E. Error Detail View

### Layout Overview

Pagina dedicata alla visualizzazione e risoluzione degli errori di sincronizzazione. Accessibile da Sync Dashboard > "Vedi errori" o dal click su un error log entry. Su desktop usa un layout split-view master/detail. Su mobile e una lista espandibile.

### Mobile (< 640px)

```
+=========================================================================+
|  [<-]  Errori: FattureInCloud                          12 errori        |
+=========================================================================+
|                                                                         |
|  .-- Riepilogo Errori ----------------------------------------------.   |
|  |                                                                    |  |
|  |  Tipo piu frequente:                                               |  |
|  |  "Campo partita_iva mancante"                    8 occorrenze      |  |
|  |                                                                    |  |
|  |  Sync fallita: 10 mar 2026, 10:23                                  |  |
|  |  Record processati: 316 / 328                                      |  |
|  |  Tasso successo: 96.3%                                             |  |
|  |                                                                    |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
|  .-- Filtro + Bulk Actions ------------------------------------------.  |
|  |  [Tutti (12)]  [P.IVA (8)]  [Data (3)]  [Altro (1)]              |  |
|  |                                                                    |  |
|  |  [Salta tutti]  [Riprova tutti]                                    |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
|  .-- Error Record Card #1 ------------------------------------------.   |
|  |                                                                    |  |
|  |  Fattura #892                                               1/12   |  |
|  |  10:23                                                             |  |
|  |  ----------------------------------------------------------------  |  |
|  |                                                                    |  |
|  |  Record originale:                                                 |  |
|  |  +--------------------------------------------------------------+  |  |
|  |  |  {                                                            |  |  |
|  |  |    "numero": "892",                                           |  |  |
|  |  |    "data": "2024-01-15",                                      |  |  |
|  |  |    "importo": 1500.00,                                        |  |  |
|  |  |    "cliente": "Rossi SRL",                                    |  |  |
|  |  | >> "partita_iva": null,                                  <<   |  |  |
|  |  |    "descrizione": "Consulenza aziendale"                      |  |  |
|  |  |  }                                                            |  |  |
|  |  +--------------------------------------------------------------+  |  |
|  |                                                                    |  |
|  |  .-- Errore -------------------------------------------------.   |  |
|  |  | [AlertTriangle]  Campo obbligatorio "partita_iva" e null   |   |  |
|  |  |                  o mancante nel record sorgente.            |   |  |
|  |  '------------------------------------------------------------'   |  |
|  |                                                                    |  |
|  |  .-- Suggerimento AI ------------------------------------------.  |  |
|  |  | [Sparkles]  Possibili soluzioni:                             |  |  |
|  |  |                                                              |  |  |
|  |  |  1. Recupera la P.IVA dal campo "codice_fiscale"            |  |  |
|  |  |     se presente (match: codice_fiscale = "RSSMRA80A01H501Z")|  |  |
|  |  |                                                              |  |  |
|  |  |  2. Imposta valore default "00000000000" per i privati      |  |  |
|  |  |     (il campo "tipo_cliente" indica "privato")              |  |  |
|  |  |                                                              |  |  |
|  |  |  3. Salta questo record se la P.IVA non e reperibile       |  |  |
|  |  '--------------------------------------------------------------'  |  |
|  |                                                                    |  |
|  |  .-- Azioni -------------------------------------------------.   |  |
|  |  | [Riprova]      [Salta]      [Fix & Riprova]                |   |  |
|  |  |  secondary      ghost        primary/accent                 |   |  |
|  |  '------------------------------------------------------------'   |  |
|  |                                                                    |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
|  .-- Error Record Card #2 ------------------------------------------.   |
|  |                                                                    |  |
|  |  Fattura #891                                               2/12   |  |
|  |  10:23                                                             |  |
|  |  ----------------------------------------------------------------  |  |
|  |                                                                    |  |
|  |  Errore: "Formato data non valido: '15-gen-2024'"                  |  |
|  |                                                                    |  |
|  |  [Espandi dettagli]                                                |  |
|  |                                                                    |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
|  (... altri 10 record errore ...)                                       |
|                                                                         |
|  .-- Sticky Bulk Action Bar (bottom) --------------------------------.  |
|  |  [Salta tutti (12)]              [Riprova tutti (12)]              |  |
|  '--------------------------------------------------------------------'  |
|                                                                         |
+=========================================================================+
```

### Desktop (>= 1024px) — Split View Master/Detail

```
+=========================================================================+
|  [<-]  Errori sincronizzazione — FattureInCloud              12 errori  |
+=========================================================================+
|                                                                         |
|  .-- LEFT PANEL (w-[340px]) ----.  .-- RIGHT PANEL (flex-1) ----------.|
|  |                               |  |                                   ||
|  |  .-- Riepilogo ------------.  |  |  Fattura #892                     ||
|  |  | 12 errori               |  |  |  10:23 — Tipo: P.IVA mancante    ||
|  |  | 316/328 processati      |  |  |                                   ||
|  |  | Successo: 96.3%         |  |  |  .-- Record originale ----------.||
|  |  '-------------------------'  |  |  |                               |||
|  |                               |  |  |  {                            |||
|  |  .-- Filtri ----------------.  |  |  |    "numero": "892",          |||
|  |  | [Tutti]  [P.IVA]  [Data] |  |  |  |    "data": "2024-01-15",    |||
|  |  '---------------------------'  |  |  |    "importo": 1500.00,      |||
|  |                               |  |  |    "cliente": "Rossi SRL",   |||
|  |  .-- Error List ------------.  |  |  | >> "partita_iva": null,  <<  |||
|  |  |                          |  |  |  |    "descrizione": "Cons..."  |||
|  |  |  +--------------------+  |  |  |  |  }                           |||
|  |  |  | [active]           |  |  |  |  '------------------------------'||
|  |  |  | Fattura #892       |  |  |  |                                   ||
|  |  |  | P.IVA mancante    |  |  |  |  .-- Errore --------------------.||
|  |  |  | 10:23             |  |  |  |  | [AlertTriangle]               |||
|  |  |  +--------------------+  |  |  |  | Campo obbligatorio           |||
|  |  |                          |  |  |  | "partita_iva" e null o       |||
|  |  |  +--------------------+  |  |  |  | mancante nel record.         |||
|  |  |  | Fattura #891       |  |  |  |  '------------------------------'||
|  |  |  | Formato data       |  |  |  |                                   ||
|  |  |  | 10:23             |  |  |  |  .-- Suggerimento AI ------------.||
|  |  |  +--------------------+  |  |  |  | [Sparkles]                    |||
|  |  |                          |  |  |  |                               |||
|  |  |  +--------------------+  |  |  |  | 1. Recupera P.IVA dal campo  |||
|  |  |  | Fattura #887       |  |  |  |  |    "codice_fiscale" (match:  |||
|  |  |  | P.IVA mancante    |  |  |  |  |    RSSMRA80A01H501Z)         |||
|  |  |  | 10:22             |  |  |  |  |                               |||
|  |  |  +--------------------+  |  |  |  | 2. Default "00000000000"     |||
|  |  |                          |  |  |  |    (tipo_cliente = "privato")|||
|  |  |  +--------------------+  |  |  |  |                               |||
|  |  |  | Fattura #884       |  |  |  |  | 3. Salta il record           |||
|  |  |  | P.IVA mancante    |  |  |  |  |                               |||
|  |  |  | 10:22             |  |  |  |  '------------------------------'||
|  |  |  +--------------------+  |  |  |                                   ||
|  |  |                          |  |  |  .-- Fix Preview ----------------.||
|  |  |  ... (altri 8 errori)    |  |  |  | Se applichi fix #1:           |||
|  |  |                          |  |  |  |                               |||
|  |  '-------------------------'  |  |  | "partita_iva": null            |||
|  |                               |  |  |       -> "00000000000"        |||
|  |  .-- Bulk Actions -----------.  |  |  |                               |||
|  |  | [Salta tutti (12)]        |  |  |  | [v] Applica a tutti gli 8    |||
|  |  | [Riprova tutti (12)]      |  |  |  |     errori dello stesso tipo |||
|  |  '----------------------------'  |  |  '------------------------------'||
|  |                               |  |  |                                   ||
|  '-------------------------------'  |  |  .-- Azioni -------------------.||
|                                      |  |  | [Riprova]  [Salta]          |||
|                                      |  |  |                [Fix&Riprova] |||
|                                      |  |  '-----------------------------'||
|                                      |  |                                   ||
|                                      |  '-----------------------------------'|
|                                      |                                       |
+=========================================================================+
```

### Error Record Card — Styling

```
Error card (mobile):
  bg-[var(--bg-raised)]
  border border-[var(--border-dark-subtle)]
  rounded-xl p-5 mb-3
  transition: border-color var(--transition-fast)

Active card (selected in list):
  border-l-3 border-l-[var(--accent)]
  bg-[var(--bg-overlay)]

Error highlight in code block:
  The line with the error field gets:
  bg-[var(--error)]/10
  border-l-2 border-[var(--error)]
  px-3 py-1
  (the ">>" and "<<" markers are visual indicators in the wireframe,
   implementation uses bg highlight only)

Code block:
  bg-[var(--bg-base)]
  border border-[var(--border-dark-subtle)]
  rounded-lg p-4
  font-mono text-xs text-[var(--fg-muted)]
  overflow-x-auto
  max-h-[300px] overflow-y-auto
```

### Error Message Banner — Styling

```
Error banner:
  bg-[var(--error)]/10
  border border-[var(--error)]/20
  border-l-3 border-l-[var(--error)]
  rounded-lg p-4 mt-4

Icon:
  AlertTriangle w-4 h-4 text-[var(--error)] shrink-0

Text:
  text-sm text-[var(--error)]
```

### AI Suggestion Box — Styling

```
AI suggestion:
  bg-[var(--accent)]/5
  border border-[var(--accent)]/15
  border-l-3 border-l-[var(--accent)]
  rounded-lg p-4 mt-4

Icon:
  Sparkles w-4 h-4 text-[var(--accent)] shrink-0

Title:
  text-sm text-[var(--accent)] font-medium

Body:
  text-sm text-[var(--fg-secondary)] mt-2

Numbered steps:
  ol list-decimal list-inside space-y-2
  text-sm text-[var(--fg-secondary)]

Code references (inline):
  bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[11px] font-mono
```

### Fix Preview — Styling

```
Fix preview:
  bg-[var(--success)]/5
  border border-[var(--success)]/15
  rounded-lg p-4 mt-4

Before value:
  text-[var(--fg-muted)] line-through text-sm font-mono

After value:
  text-[var(--success)] font-medium text-sm font-mono

Arrow between:
  text-[var(--fg-invisible)] mx-2

Batch apply checkbox:
  Standard checkbox with label
  text-sm text-[var(--fg-secondary)]
  mt-3

  [v] = bg-[var(--accent)] border-[var(--accent)] text-white
  [ ] = bg-transparent border-[var(--border-dark)]
```

### Action Buttons — Styling

```
"Riprova" (secondary):
  bg-[var(--bg-overlay)]
  border border-[var(--border-dark)]
  text-[var(--fg-primary)]
  rounded-lg px-4 py-2.5
  text-sm font-medium
  hover:bg-[var(--bg-hover)]
  hover:border-[var(--border-dark)]
  min-w-[100px] min-h-[44px]

"Salta" (ghost):
  bg-transparent
  text-[var(--fg-muted)]
  rounded-lg px-4 py-2.5
  text-sm
  hover:bg-[var(--bg-overlay)]
  hover:text-[var(--fg-secondary)]
  min-w-[100px] min-h-[44px]

"Fix & Riprova" (accent/primary):
  bg-[var(--accent)]
  text-white
  rounded-lg px-5 py-2.5
  text-sm font-medium
  hover:bg-[var(--accent-dark)]
  shadow-sm
  min-w-[140px] min-h-[44px]

  Loading state:
    opacity-70 cursor-not-allowed
    [Loader2 icon spinning] "Applicando fix..."

  Success state (transient, 2s):
    bg-[var(--success)] text-[var(--bg-base)]
    [CheckCircle icon] "Risolto!"

Bulk actions (sticky bar on mobile):
  position: sticky bottom-0
  bg-[var(--bg-raised)]/95
  backdrop-blur-sm
  border-t border-[var(--border-dark-subtle)]
  px-4 py-3
  flex gap-3

  "Salta tutti":
    Same as "Salta" but full text with count
  "Riprova tutti":
    Same as "Riprova" but with count badge
```

### Error List Item (Left Panel, Desktop) — Styling

```
Error list item:
  px-4 py-3.5
  border-b border-[var(--border-dark-subtle)]
  cursor-pointer
  transition: background var(--transition-fast)

  hover:
    bg-[var(--bg-hover)]

  active/selected:
    bg-[var(--accent)]/5
    border-l-3 border-l-[var(--accent)]

Record name:
  text-sm text-[var(--fg-primary)] font-medium

Error type:
  text-xs text-[var(--error)] mt-0.5

Timestamp:
  text-[10px] text-[var(--fg-invisible)] font-mono mt-0.5

Status indicator (right side):
  Unresolved: (!) text-[var(--error)] w-3.5 h-3.5
  Skipped:    (--) text-[var(--fg-invisible)] w-3.5 h-3.5
  Fixed:      (v) text-[var(--success)] w-3.5 h-3.5
```

### Keyboard & Accessibility

```
Error list navigation:
  Arrow Up/Down: navigate between error items
  Enter: select error (show detail in right panel)
  Tab: move to action buttons in detail panel

Detail panel:
  Tab order: Code block (scrollable) > Error banner > AI suggestion >
             Fix Preview > Riprova > Salta > Fix & Riprova

Bulk actions:
  Tab after last error card reaches bulk action bar

Screen reader:
  Error list: role="listbox" aria-label="Lista errori sincronizzazione"
  Error item: role="option" aria-selected="true/false"
  Detail panel: role="region" aria-label="Dettaglio errore: Fattura #892"
  AI suggestion: role="complementary" aria-label="Suggerimento AI per la risoluzione"
  Action buttons: aria-label descrittive (es. "Riprova sincronizzazione Fattura #892")
  Bulk actions: aria-label con conteggio (es. "Salta tutti i 12 errori")

Live region (for action feedback):
  role="status" aria-live="polite"
  Announces: "Errore risolto", "Record saltato", "Fix applicato, riprovando..."
```

---

## F. User Journey Flow

```
  UTENTE                           SISTEMA
    |                                 |
    |  1. Apre /integrations          |
    |  =============================> |
    |                                 |  Carica ConnectorBrowser
    |  <============================= |  con grid connettori disponibili
    |                                 |
    |  2. Click "Connetti" su card    |
    |  =============================> |
    |                                 |  Apre SetupWizard (overlay)
    |                                 |
    |  3. STEP 1: Seleziona sorgente  |
    |  =============================> |
    |                                 |  Valida selezione, abilita "Avanti"
    |                                 |
    |  4. STEP 2: Autenticazione      |
    |  =============================> |
    |     (OAuth flow o API key)      |  Verifica credenziali
    |  <============================= |  Ritorna status "connesso"
    |                                 |
    |  5. STEP 3: Selezione dati      |
    |  =============================> |
    |     (checkbox tree)             |  Conta record, stima tempo
    |                                 |
    |  6. STEP 4: Mapping campi       |
    |  =============================> |
    |     (o click "Suggerisci AI")   |  AI analizza nomi/tipi campi
    |  <============================= |  Ritorna mapping suggerito
    |                                 |
    |  7. STEP 5: Conferma + schedule |
    |  =============================> |
    |     click "Attiva connettore"   |  Salva config, avvia prima sync
    |  <============================= |  Redirect a Sync Dashboard
    |                                 |
    |  8. Monitora sync               |
    |  <============================= |  Polling status ogni 30s
    |                                 |  Progress bar si aggiorna
    |                                 |
    |  9. (se errori) Click "Vedi     |
    |     errori"                     |
    |  =============================> |
    |                                 |  Apre Error Detail View
    |                                 |
    |  10. Risolve errori             |
    |      (Fix & Riprova / Salta)    |
    |  =============================> |
    |                                 |  Applica fix, ritenta record
    |  <============================= |  Aggiorna conteggio errori
    |                                 |

Flow alternativo — da Sync Dashboard:
  - "Sync now": trigger manuale -> conferma -> sync in corso
  - "Pausa": ferma sync programmata -> card diventa grigia
  - "Configura mapping": apre Mapping UI full page
  - "[...] > Disconnetti": conferma distruttiva -> rimuove connettore
```

### Stato Connettore — State Machine

```
                      +-------------+
                      |  available  |  (nel marketplace)
                      +------+------+
                             |
                        "Connetti"
                             |
                      +------v------+
                      | configuring |  (wizard aperto)
                      +------+------+
                             |
                    "Attiva connettore"
                             |
                      +------v------+
           +--------->|   syncing   |<---------+
           |          +------+------+           |
           |                 |                  |
           |           (completata)        "Sync now"
           |                 |             "Riprova"
           |          +------v------+           |
           |          |   synced    |-----------+
           |          +------+------+
           |                 |
           |            (errori)
           |                 |
           |          +------v------+
           +----------+    error    |
           "Riprova"  +------+------+
                             |
                         "Pausa"
                             |
                      +------v------+
                      |   paused    |
                      +------+------+
                             |
                        "Riprendi"
                             |
                      +------v------+
                      |   syncing   |
                      +-------------+

Ogni stato ha un colore e icona dedicati (vedi sezione C, Status dot colors).
```

---

## Note Implementative

### Componenti React suggeriti

| Componente | File | Descrizione |
|------------|------|-------------|
| `ConnectorBrowser` | `components/integrations/ConnectorBrowser.tsx` | Grid filtri + card |
| `ConnectorCard` | `components/integrations/ConnectorCard.tsx` | Singola card connettore |
| `SetupWizard` | `components/integrations/SetupWizard.tsx` | Modal wizard 5 step |
| `WizardStepper` | `components/integrations/WizardStepper.tsx` | Stepper progress |
| `AuthStep` | `components/integrations/steps/AuthStep.tsx` | OAuth / API key |
| `DataSelectStep` | `components/integrations/steps/DataSelectStep.tsx` | Selezione entita |
| `MappingStep` | `components/integrations/steps/MappingStep.tsx` | Mapping campi |
| `ReviewStep` | `components/integrations/steps/ReviewStep.tsx` | Review + schedule |
| `SyncDashboard` | `components/integrations/SyncDashboard.tsx` | Dashboard sync |
| `IntegrationRow` | `components/integrations/IntegrationRow.tsx` | Riga integrazione |
| `MappingUI` | `components/integrations/MappingUI.tsx` | Full mapping editor |
| `MappingRow` | `components/integrations/MappingRow.tsx` | Singola riga mapping |
| `DataPreview` | `components/integrations/DataPreview.tsx` | Tabella anteprima |
| `ErrorLog` | `components/integrations/ErrorLog.tsx` | Log errori espandibile |
| `ErrorDetailView` | `components/integrations/ErrorDetailView.tsx` | Split-view errori con AI suggestion |
| `ErrorRecordCard` | `components/integrations/ErrorRecordCard.tsx` | Singolo record errore con fix/retry |
| `AISuggestionBox` | `components/integrations/AISuggestionBox.tsx` | Box suggerimento AI per risoluzione |
| `FixPreview` | `components/integrations/FixPreview.tsx` | Preview trasformazione fix |

### Pattern Framer Motion

```typescript
// Card stagger animation (ConnectorBrowser)
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
};

// Step transition (SetupWizard)
<AnimatePresence mode="wait">
  <motion.div
    key={currentStep}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
  >
    {stepContent}
  </motion.div>
</AnimatePresence>

// Progress bar fill
<motion.div
  className="h-full bg-gradient-to-r from-accent to-accent-dark rounded-full"
  initial={{ width: 0 }}
  animate={{ width: `${percent}%` }}
  transition={{ duration: 0.5, ease: "easeOut" }}
/>
```

### Icone Lucide React suggerite

| Contesto | Icone |
|----------|-------|
| Search | `Search`, `SlidersHorizontal` |
| Connectors | `Plug`, `Unplug`, `Link`, `ExternalLink` |
| Auth | `Shield`, `Lock`, `Key`, `Eye`, `EyeOff` |
| Data | `Database`, `Table`, `Rows`, `Hash` |
| Mapping | `ArrowRight`, `ArrowLeftRight`, `Sparkles`, `Wand2` |
| Status | `CheckCircle`, `AlertCircle`, `XCircle`, `Clock`, `Loader2` |
| Sync | `RefreshCw`, `Play`, `Pause`, `Square` |
| Actions | `Settings`, `Trash2`, `MoreHorizontal`, `Plus`, `Download` |
| Info | `Info`, `HelpCircle`, `AlertTriangle` |

### Accessibilita (WCAG 2.1 AA)

1. **Focus visible**: tutti gli elementi interattivi hanno `focus-visible` outline accent
2. **Touch target**: 44x44px minimo su mobile per tutti i bottoni e checkbox
3. **Contrasto testo**: tutti i token testo dark rispettano WCAG AA (vedi commenti in globals.css)
4. **aria-label**: bottoni icon-only (close, menu, toggle) devono avere `aria-label` esplicita
5. **Role e states**:
   - Stepper: `role="progressbar"` + `aria-valuenow` + `aria-valuemax`
   - Checkbox: `role="checkbox"` + `aria-checked`
   - Dropdown: `role="listbox"` + `aria-expanded`
   - Error banner: `role="alert"` + `aria-live="polite"`
6. **Keyboard navigation**: Tab order logico, Enter/Space per attivare, Escape per chiudere modal
7. **Reduced motion**: tutte le animazioni Framer Motion rispettano `prefers-reduced-motion` tramite la regola in globals.css

### Responsive Breakpoints

| Breakpoint | Connector Grid | Wizard | Sync Dashboard | Mapping |
|-----------|---------------|--------|----------------|---------|
| <640px (mobile) | 1 col | Fullscreen | Stack | 1 col (source sopra dest.) |
| 640-1024px (tablet) | 2 col | Centered overlay | 1 col list | 2 col stretto |
| >1024px (desktop) | 3 col | Centered overlay | 1 col list | 2 col full |

### Mobile Mapping Layout

Su mobile, la two-column mapping diventa stacked:

```
+---------------------------------------+
| Campo sorgente                        |
| +-----------------------------------+ |
| | first_name                        | |
| | string                            | |
| +-----------------------------------+ |
|              |                        |
|              v  98%                   |
|              |                        |
| Campo destinazione                    |
| +-----------------------------------+ |
| | nome                          [v] | |
| | string                            | |
| +-----------------------------------+ |
|                                       |
| ------------------------------------- |
|                                       |
| Campo sorgente                        |
| +-----------------------------------+ |
| | last_name                         | |
| | string                            | |
| +-----------------------------------+ |
|              |                        |
|              v  98%                   |
|              |                        |
| Campo destinazione                    |
| +-----------------------------------+ |
| | cognome                       [v] | |
| | string                            | |
| +-----------------------------------+ |
+---------------------------------------+
```

### Data Types di Integrazione

Per il sistema di mapping, i tipi supportati:

| Tipo sorgente | Icona | Mapping automatico |
|--------------|-------|-------------------|
| `string` | `Type` | -> `string`, `text` |
| `number` | `Hash` | -> `number`, `integer`, `float` |
| `boolean` | `ToggleLeft` | -> `boolean` |
| `date` | `Calendar` | -> `date`, `timestamp` |
| `email` | `Mail` | -> `string` (email validated) |
| `phone` | `Phone` | -> `string` (phone validated) |
| `url` | `Link` | -> `string` (url validated) |
| `object` | `Braces` | -> flattening o JSON |
| `array` | `List` | -> JSON o join |

### Stato Globale Suggerito

```typescript
interface IntegrationState {
  connectors: Connector[];           // da API: lista connettori disponibili
  activeIntegrations: Integration[]; // connessioni attive dell'utente
  wizardState: {
    isOpen: boolean;
    currentStep: 1 | 2 | 3 | 4 | 5;
    selectedConnector: Connector | null;
    authStatus: 'pending' | 'connected' | 'failed';
    selectedEntities: string[];
    fieldMappings: FieldMapping[];
    schedule: SyncSchedule;
  };
  syncStatus: Record<string, SyncStatus>;  // per integration ID
  errorLog: SyncError[];
}
```
