# Studio di Semplificazione UX — Legal Office

**Data:** 2026-03-04
**Autore:** UX/UI Department
**Stato:** Proposta
**Priorita:** Alta

---

## 1. ANALISI STATO ATTUALE

### 1.1 Inventario componenti

| File | Righe | Ruolo | Problema |
|------|-------|-------|----------|
| `app/HomePageClient.tsx` | 413 | Orchestratore principale + landing | Gestisce 4 view (landing/analyzing/results/paywall) in un unico file. La landing include 8 sezioni marketing prima dell'upload |
| `components/HeroSection.tsx` | 582 | 3 hero sections con animazioni | TextStrikeAnimation, CorpusChat live, BrandHero — 582 righe di UI che l'utente deve scrollare per arrivare all'azione |
| `components/AnalysisProgress.tsx` | 695 | Cerchio SVG progress + timeline | Componente piu pesante. ProgressRing, useAnalysisTimer, ETA, 4 fasi. Mai usato nel nuovo LegalWorkspaceShell |
| `components/MissionSection.tsx` | 650 | "Come funziona" in 4 step | Marketing puro. 650 righe di animazioni per spiegare cosa fa l'app |
| `components/TeamSection.tsx` | 582 | Avatar 4 agenti + descrizioni | Marketing puro. Presentazione team AI |
| `components/ResultsView.tsx` | 311 | Vista risultati legacy | Include FairnessScore + RiskCard + DeepSearch + LawyerCTA — usato solo nella vecchia UI |
| `components/workspace/LegalWorkspaceShell.tsx` | 328 | Workspace 3-zone (sidebar/center/right) | Gia esiste come evoluzione della landing. Ha sidebar pipeline, AgentBox progressive, right panel corpus |
| `components/chat/LegalChat.tsx` | 521 | Interfaccia chat tipo ChatGPT | Gia costruito: sidebar conversazioni, input unificato, SSE streaming, corpus Q&A, deep search |
| `components/chat/ChatMessage.tsx` | 490 | Rendering messaggi chat | Supporta ClassificationSummary, AnalysisResults, AdvisorResults, CorpusResponse |
| `components/chat/ChatWelcome.tsx` | 59 | Welcome screen con suggerimenti | Minimal, pulito: "controlla.me" + 3 suggestion chips |
| `components/chat/ChatInput.tsx` | 172 | Input unificato testo + file upload | Gia supporta drag-drop, paperclip, Enter per inviare |
| `components/chat/ChatSidebar.tsx` | 125 | Sidebar conversazioni | Storico, new conversation, tier selector |
| `components/CorpusChat.tsx` | 238 | Chat corpus standalone | Duplicata funzionalita in `chat/LegalChat.tsx` (askCorpus) |
| `components/DeepSearchChat.tsx` | 123 | Chat deep search su clausola | Duplicata in `chat/LegalChat.tsx` (deepSearch) |
| `components/RiskCard.tsx` | 234 | Card rischio con paywall | Include deep search inline + usage check |
| `components/FairnessScore.tsx` | 198 | Cerchio SVG score 1-10 | Duplicato in `workspace/FinalEvaluationPanel.tsx` (BigFairnessScore) |
| `components/LawyerCTA.tsx` | 199 | Form contatto avvocato | Standalone, riusabile |
| `components/UseCasesSection.tsx` | 229 | Casi d'uso a tab | Marketing puro |
| `components/VideoShowcase.tsx` | 222 | Player video autoplay | Marketing puro |
| `components/CTASection.tsx` | 137 | Call-to-action finale | Marketing puro |
| `components/PaywallBanner.tsx` | 149 | Banner limite utilizzo | Fullscreen paywall |
| `components/Navbar.tsx` | 262 | Navigazione principale | Da adattare al nuovo layout |
| `components/Footer.tsx` | 99 | Footer | Solo landing |
| **TOTALE** | **8259** | | |

### 1.2 Flusso utente attuale (misurato in click)

```
FLUSSO CORRENTE (desktop):

Utente arriva su controlla.me
  |
  v
[1] HeroVerifica (582px viewport) — CTA "Analizza" che scrolla a upload
  |  -- oppure scroll manuale --
  v
[2] MissionSection (4 step illustrati)
  v
[3] VideoShowcase (video AI)
  v
[4] UseCasesSection (tab)
  v
[5] Upload Section (finalmente) — drag-drop o "Scegli file"
  v
[6] Vista "analyzing" — LegalWorkspaceShell con sidebar pipeline
  v
[7] Vista "results" — FinalEvaluationPanel inline

Click minimi per un'analisi: 2 (CTA hero + scegli file)
Tempo reale: scroll + 2 click + 60-90s analisi
Scroll prima di agire: ~2400px verticali
```

### 1.3 Flusso ChatGPT/Claude (benchmark)

```
FLUSSO BENCHMARK:

Utente arriva
  |
  v
[1] Input centrato — scrivi o allega file
  |
  v
[2] Output sotto l'input, in streaming

Click minimi: 1 (invio)
Scroll prima di agire: 0px
Contesto persistente: sidebar con storico
```

### 1.4 Problemi quantificati

| # | Problema | Impatto | Metrica |
|---|---------|---------|---------|
| P1 | **Marketing prima del tool** | L'utente deve scrollare ~2400px per arrivare all'upload. Il 60-70% del viewport iniziale e' marketing | Scroll-to-action: 2400px vs 0px benchmark |
| P2 | **3 hero sections** | 582 righe di codice per 3 animazioni hero che competono per l'attenzione | Cognitive load: 3 CTA diverse nella stessa viewport |
| P3 | **AnalysisProgress mai usato** | 695 righe di componente complesso (ProgressRing SVG, timer, ETA) che non e' piu montato in nessuna view. LegalWorkspaceShell lo ha sostituito con dots nella topbar | Dead code: 695 righe |
| P4 | **Duplicazione CorpusChat** | `CorpusChat.tsx` (238 righe) duplica la funzionalita di `LegalChat.tsx > askCorpus()`. Stesso endpoint `/api/corpus/ask`, stessa UI | Duplicazione: ~200 righe |
| P5 | **Duplicazione DeepSearchChat** | `DeepSearchChat.tsx` (123 righe) duplica `LegalChat.tsx > deepSearch()`. Stesso endpoint `/api/deep-search` | Duplicazione: ~100 righe |
| P6 | **Duplicazione FairnessScore** | `FairnessScore.tsx` (198 righe) e `FinalEvaluationPanel.tsx` (294 righe) hanno entrambi BigFairnessScore con cerchio SVG | Duplicazione: ~80 righe di SVG identico |
| P7 | **ResultsView legacy** | 311 righe di componente che assembla FairnessScore + RiskCard + DeepSearch + LawyerCTA. Mai montato nella nuova workspace | Dead code: 311 righe |
| P8 | **LegalChat gia costruito ma non raggiungibile** | Il componente `chat/LegalChat.tsx` (521 righe) implementa gia il pattern ChatGPT con sidebar, SSE, corpus Q&A, deep search. Ma non c'e nessuna route che lo monta | Feature completa non esposta |
| P9 | **4 modelli mentali diversi** | L'utente vede: (1) landing marketing, (2) workspace 3-zone, (3) dashboard lista, (4) pagina corpus separata. Nessuna coerenza | 4 paradigmi UI diversi |
| P10 | **Upload zone troppo decorativa** | L'upload in HomePageClient ha avatar agente "Read", textarea contesto, trust signals, gradient borders — 100+ righe di UI per un drop zone | Over-engineering: ratio 100 righe per 1 funzione (drag-drop file) |

### 1.5 Codice morto o duplicato (sommario)

| Componente | Righe | Stato |
|-----------|-------|-------|
| `AnalysisProgress.tsx` | 695 | MORTO — non montato in nessuna view attiva |
| `ResultsView.tsx` | 311 | MORTO — sostituito da workspace/FinalEvaluationPanel |
| `CorpusChat.tsx` | 238 | DUPLICATO — funzionalita in LegalChat |
| `DeepSearchChat.tsx` | 123 | DUPLICATO — funzionalita in LegalChat |
| `HeroSection.tsx` | 582 | MARKETING — eliminabile se la landing diventa il tool |
| `MissionSection.tsx` | 650 | MARKETING — eliminabile |
| `TeamSection.tsx` | 582 | MARKETING — eliminabile (info spostabile in about) |
| `UseCasesSection.tsx` | 229 | MARKETING — eliminabile |
| `VideoShowcase.tsx` | 222 | MARKETING — eliminabile |
| `CTASection.tsx` | 137 | MARKETING — eliminabile |
| **Totale eliminabile** | **3769** | **45.6% del codice UI totale** |

---

## 2. PROPOSTA REDESIGN

### 2.1 Principio guida

> La home page E' il tool. Non c'e distinzione tra marketing e funzionalita.
> L'utente arriva, agisce, ottiene risultati. Il marketing e' il risultato stesso.

### 2.2 Flusso utente proposto

```
FLUSSO NUOVO:

Utente arriva su controlla.me
  |
  v
[1] Input centrato (ChatWelcome + ChatInput)
    — "Carica un documento o fai una domanda"
    — 3 suggestion chips sotto
    — Sidebar sinistra con storico (collassata su mobile)
  |
  v
[2] Output in streaming sotto l'input
    — Messaggi agente per agente (Classifier, Analyzer, Investigator, Advisor)
    — Progressive rendering dei risultati
    — Inline: score, rischi, azioni, CTA avvocato
  |
  v
[3] Follow-up nella stessa conversazione
    — "Dimmi di piu su questa clausola"
    — Deep search inline
    — Domande corpus inline

Click minimi: 1
Scroll prima di agire: 0px
Paradigma UI: 1 (chat)
```

### 2.3 Mockup ASCII — Desktop (1440px)

```
+------------------------------------------------------------------+
|  controlla.me                                   [?] [Tier] [User] |
+--------+---------------------------------------------------------+
| SIDEBAR |                      MAIN AREA                          |
|         |                                                         |
| [+ New] |                                                         |
|         |           controlla.me                                  |
| Storico |   Analisi legale AI. Carica un documento                |
| -----   |   o fai una domanda.                                    |
| > Conv 1|                                                         |
|   Conv 2|   +------------------+  +------------------+             |
|   Conv 3|   | [icon] Analizza  |  | [icon] Chiedi    |             |
|         |   | un contratto     |  | una norma        |             |
|         |   | PDF, DOCX, TXT   |  | Diritto IT + EU  |             |
|         |   +------------------+  +------------------+             |
|         |              +------------------+                        |
|         |              | [icon] Capire    |                        |
|         |              | una clausola     |                        |
|         |              | In parole semplici|                       |
|         |              +------------------+                        |
|         |                                                         |
|         |                                                         |
| -----   |                                                         |
| Tier:   |                                                         |
| Intern  | +-----------------------------------------------------+ |
|         | | [clip] Scrivi un messaggio o trascina un doc...  [>] | |
|         | +-----------------------------------------------------+ |
+---------+---------------------------------------------------------+
```

### 2.4 Mockup ASCII — Desktop durante analisi

```
+------------------------------------------------------------------+
|  controlla.me                                   [?] [Tier] [User] |
+--------+---------------------------------------------------------+
| SIDEBAR |                      MAIN AREA                          |
|         |                                                         |
| [+ New] |  [user] Analizza: contratto-affitto.pdf                 |
|         |                                                         |
| Storico |  [Classifier] Catalogatore                              |
| -----   |  Tipo: Contratto di locazione abitativa                 |
| > Conv 1|  Sotto-tipo: Locazione 4+4                              |
|   Conv 2|  Istituti: locazione, deposito cauzionale, recesso      |
|         |  Tags: [Immobiliare] [Abitativo] [L. 431/1998]          |
|         |                                                         |
|         |  [Analyzer] Analista                [spinner]           |
|         |  Analisi rischi in corso...                              |
|         |                                                         |
|         |                                                         |
|         |                                                         |
|         |                                                         |
|         |                                                         |
|         |                                                         |
|         |                                                         |
| -----   |                                                         |
| Tier:   |                                                         |
| Intern  | +-----------------------------------------------------+ |
|         | | Analisi in corso...                              [>] | |
|         | +-----------------------------------------------------+ |
+---------+---------------------------------------------------------+
```

### 2.5 Mockup ASCII — Desktop risultati completi

```
+------------------------------------------------------------------+
|  controlla.me                                   [?] [Tier] [User] |
+--------+---------------------------------------------------------+
| SIDEBAR |                      MAIN AREA                          |
|         |                                                         |
| [+ New] |  [user] Analizza: contratto-affitto.pdf                 |
|         |                                                         |
| Storico |  [Classifier] Classificazione completata                |
| -----   |  Tipo: Locazione 4+4 | 3 istituti | 2 leggi            |
| > Conv 1|                                                         |
|   Conv 2|  [Analyzer] 3 rischi trovati                             |
|         |  +----------------------------------------------------+ |
|         |  | [ALTA] Clausola penale eccessiva                    | |
|         |  | L'importo della penale (3 mensilita) per ritardo... | |
|         |  | Art. 1382 c.c. | [Approfondisci]                   | |
|         |  +----------------------------------------------------+ |
|         |  | [MEDIA] Deposito cauzionale superiore a 3 mesi     | |
|         |  | ...                                                 | |
|         |  +----------------------------------------------------+ |
|         |                                                         |
|         |  [Investigator] Ricerca normativa completata             |
|         |  2 fonti verificate, 1 orientamento giurisprudenziale   |
|         |                                                         |
|         |  [Advisor] Valutazione finale                            |
|         |  +----------------------------------------------------+ |
|         |  |  Score: 5.8/10    [Equita 5] [Coerenza 7]          | |
|         |  |                   [Prassi 6]  [Completezza 5]       | |
|         |  |                                                     | |
|         |  |  Rischi principali:                                 | |
|         |  |  1. Penale eccessiva → riduci a 1 mensilita         | |
|         |  |  2. Deposito troppo alto → negozia a 2 mesi        | |
|         |  |                                                     | |
|         |  |  Azioni consigliate:                                | |
|         |  |  1. Chiedi di modificare la clausola penale         | |
|         |  |  2. Verifica con un avvocato le condizioni di...    | |
|         |  +----------------------------------------------------+ |
|         |                                                         |
|         |  [!] Consigliamo un avvocato per le clausole critiche   |
|         |  [Contatta un avvocato]                                 |
|         |                                                         |
| -----   |                                                         |
| Tier:   |                                                         |
| Intern  | +-----------------------------------------------------+ |
|         | | Fai una domanda di approfondimento...            [>] | |
|         | +-----------------------------------------------------+ |
+---------+---------------------------------------------------------+
```

### 2.6 Mockup ASCII — Mobile (390px)

```
+----------------------------------+
| [=] controlla.me      [Tier] [?] |
+----------------------------------+
|                                  |
|       controlla.me               |
|  Analisi legale AI.              |
|  Carica un documento             |
|  o fai una domanda.              |
|                                  |
|  +----------------------------+  |
|  | [icon] Analizza contratto  |  |
|  | PDF, DOCX, TXT             |  |
|  +----------------------------+  |
|  | [icon] Chiedi una norma    |  |
|  | Diritto IT + EU            |  |
|  +----------------------------+  |
|  | [icon] Capire una clausola |  |
|  | In parole semplici         |  |
|  +----------------------------+  |
|                                  |
|                                  |
|                                  |
+----------------------------------+
| [clip] Scrivi o trascina... [>]  |
+----------------------------------+
```

### 2.7 Mockup ASCII — Mobile durante analisi

```
+----------------------------------+
| [<] contratto-affitto.pdf [....] |
+----------------------------------+
|                                  |
| [user] Analizza: contratto...    |
|                                  |
| [Classifier] Classificazione     |
| Tipo: Locazione 4+4              |
| [Immobiliare] [L. 431/1998]     |
|                                  |
| [Analyzer] [spinner]             |
| Analisi rischi in corso...       |
|                                  |
|                                  |
|                                  |
+----------------------------------+
| Analisi in corso...          [>] |
+----------------------------------+
```

### 2.8 Navigazione proposta

```
ROUTES:

/               → LegalChat (il tool E' la home)
/about          → Landing marketing (hero, mission, team, video, use cases)
/pricing        → Piani (invariato)
/dashboard      → Redirect a / (storico nella sidebar)
/corpus         → Invariato (navigazione corpus legislativo)
/corpus/article/[id] → Invariato (dettaglio articolo)
/console        → Invariato (console operatori)
/legaloffice    → Invariato (workspace professionale)
```

---

## 3. PIANO IMPLEMENTAZIONE

### Fase 1 — Chat come home page (1-2 giorni)

**Obiettivo:** l'utente arriva su `/` e vede l'interfaccia chat.

**File da modificare:**
- `app/HomePageClient.tsx` — Sostituire il contenuto con `<LegalChat />`
- `app/page.tsx` — Nessuna modifica (wrapper server)
- `components/Navbar.tsx` — Adattare: rimuovere link a sezioni marketing, aggiungere link a `/about`

**File da creare:**
- `app/about/page.tsx` — Nuova landing marketing con tutto il materiale spostato (hero, mission, team, video, use cases, CTA, footer)

**Logica di routing in HomePageClient:**
```tsx
// PRIMA (413 righe, 4 view states)
type AppView = "landing" | "analyzing" | "results" | "paywall";

// DOPO (~20 righe)
export default function HomePageClient() {
  return <LegalChat />;
}
```

**Rischio:** utenti che arrivano da link diretti alla vecchia landing. **Mitigazione:** `/about` ha lo stesso contenuto.

### Fase 2 — Integrazione paywall nella chat (0.5 giorni)

**Obiettivo:** il paywall funziona dentro la chat senza rompere il flusso.

**File da modificare:**
- `components/chat/LegalChat.tsx` — Aggiungere gestione `LIMIT_REACHED` come messaggio inline (gia parzialmente implementato a riga 225-233)

**Logica:**
```
Limite raggiunto → messaggio di sistema in chat con link /pricing
Non piu: redirect a fullscreen PaywallBanner
```

**File eliminabili dopo questa fase:**
- `components/PaywallBanner.tsx` (149 righe) — non piu necessario

### Fase 3 — LawyerCTA nella chat (0.5 giorni)

**Obiettivo:** quando l'advisor rileva `needsLawyer: true`, il CTA avvocato appare come messaggio inline nella chat.

**File da modificare:**
- `components/chat/ChatMessage.tsx` — Aggiungere rendering LawyerCTA dentro il messaggio advisor
- `components/LawyerCTA.tsx` — Nessuna modifica, riusare cosi com'e

### Fase 4 — Dashboard nella sidebar (0.5 giorni)

**Obiettivo:** lo storico analisi e' nella sidebar della chat, non in una pagina separata.

**File da modificare:**
- `components/chat/ChatSidebar.tsx` — Aggiungere fetch da Supabase per caricare conversazioni salvate
- `components/chat/LegalChat.tsx` — Collegare il caricamento delle conversazioni precedenti

**File da modificare:**
- `app/dashboard/page.tsx` — Redirect a `/` (o tenere come fallback per utenti con bookmark)
- `app/dashboard/DashboardClient.tsx` — Puo restare come fallback

### Fase 5 — Pulizia codice morto (0.5 giorni)

**Obiettivo:** rimuovere i 3769 righe di codice morto/duplicato.

**File da eliminare:**
- `components/AnalysisProgress.tsx` (695 righe) — non montato
- `components/ResultsView.tsx` (311 righe) — sostituito da workspace
- `components/CorpusChat.tsx` (238 righe) — duplicato in LegalChat
- `components/DeepSearchChat.tsx` (123 righe) — duplicato in LegalChat

**File da spostare in `/about` (non eliminare):**
- `components/HeroSection.tsx` (582 righe)
- `components/MissionSection.tsx` (650 righe)
- `components/TeamSection.tsx` (582 righe)
- `components/UseCasesSection.tsx` (229 righe)
- `components/VideoShowcase.tsx` (222 righe)
- `components/CTASection.tsx` (137 righe)

### Fase 6 — Consolidamento FairnessScore (0.5 giorni)

**Obiettivo:** un solo componente FairnessScore usato ovunque.

**File da modificare:**
- `components/workspace/FinalEvaluationPanel.tsx` — Rimuovere `BigFairnessScore` locale, importare da `FairnessScore.tsx`
- `components/chat/ChatMessage.tsx` — Usare `FairnessScore.tsx` per rendering score advisor

**File da mantenere:**
- `components/FairnessScore.tsx` — Single source of truth per il cerchio SVG score

---

## 4. MATRICE COMPONENTI

### Legenda
- **TENERE** = componente resta, eventualmente con modifiche minori
- **TAGLIARE** = componente eliminato, codice morto
- **TRASFORMARE** = componente spostato o refactorato significativamente
- **CONSOLIDARE** = funzionalita duplicata assorbita in un componente canonico

| Componente | Righe | Decisione | Motivazione |
|-----------|-------|-----------|-------------|
| `chat/LegalChat.tsx` | 521 | **TENERE** — diventa la home | Gia implementa il pattern chat con SSE, corpus, deep search |
| `chat/ChatWelcome.tsx` | 59 | **TENERE** | Welcome screen minimale, perfetto |
| `chat/ChatInput.tsx` | 172 | **TENERE** | Input unificato testo + file, gia drag-drop |
| `chat/ChatSidebar.tsx` | 125 | **TENERE** — aggiungere fetch Supabase | Sidebar con storico conversazioni |
| `chat/ChatMessage.tsx` | 490 | **TENERE** — aggiungere LawyerCTA + FairnessScore | Rendering messaggi multi-tipo |
| `chat/TierPanel.tsx` | 147 | **TENERE** | Pannello selezione tier |
| `chat/types.ts` | 74 | **TENERE** | Type definitions per il sistema chat |
| `Navbar.tsx` | 262 | **TRASFORMARE** — semplificare per layout chat | Rimuovere link sezioni marketing, aggiungere /about |
| `FairnessScore.tsx` | 198 | **TENERE** — single source of truth | Cerchio SVG + pill multidimensionali |
| `RiskCard.tsx` | 234 | **CONSOLIDARE** in ChatMessage | La logica rischio va inline nel messaggio chat |
| `LawyerCTA.tsx` | 199 | **TENERE** — montare in ChatMessage | Form contatto avvocato, riusabile |
| `LegalBreadcrumb.tsx` | — | **TENERE** | Breadcrumb per pagine corpus |
| `Footer.tsx` | 99 | **TRASFORMARE** — solo per /about | Footer resta ma solo nella landing marketing |
| `AnalysisProgress.tsx` | 695 | **TAGLIARE** | Non montato in nessuna view, sostituito da dots topbar |
| `ResultsView.tsx` | 311 | **TAGLIARE** | Sostituito da workspace/FinalEvaluationPanel |
| `CorpusChat.tsx` | 238 | **TAGLIARE** | Duplicato di LegalChat > askCorpus() |
| `DeepSearchChat.tsx` | 123 | **TAGLIARE** | Duplicato di LegalChat > deepSearch() |
| `PaywallBanner.tsx` | 149 | **TAGLIARE** | Paywall inline nella chat |
| `HeroSection.tsx` | 582 | **TRASFORMARE** — spostare in /about | Marketing, non tool |
| `MissionSection.tsx` | 650 | **TRASFORMARE** — spostare in /about | Marketing, non tool |
| `TeamSection.tsx` | 582 | **TRASFORMARE** — spostare in /about | Marketing, non tool |
| `UseCasesSection.tsx` | 229 | **TRASFORMARE** — spostare in /about | Marketing, non tool |
| `VideoShowcase.tsx` | 222 | **TRASFORMARE** — spostare in /about | Marketing, non tool |
| `CTASection.tsx` | 137 | **TRASFORMARE** — spostare in /about | Marketing, non tool |
| `workspace/LegalWorkspaceShell.tsx` | 328 | **TENERE** — per /legaloffice | Workspace professionale, non per utente consumer |
| `workspace/AgentBox.tsx` | 352 | **TENERE** — per /legaloffice | Progressive rendering degli agenti |
| `workspace/FinalEvaluationPanel.tsx` | 294 | **CONSOLIDARE** — usare FairnessScore.tsx | Rimuovere BigFairnessScore duplicato |
| `workspace/WorkspaceRightPanel.tsx` | 448 | **TENERE** — per /legaloffice | Pannello corpus laterale |

### Sommario impatto

| Azione | Righe | % del totale |
|--------|-------|--------------|
| TENERE (invariato) | 2295 | 27.8% |
| TENERE (con modifiche) | 752 | 9.1% |
| TRASFORMARE (spostare in /about) | 2402 | 29.1% |
| CONSOLIDARE | 528 | 6.4% |
| TAGLIARE (eliminare) | 2216 | 26.8% |
| **Righe eliminate nette** | **2216** | **26.8%** |
| **Righe spostate** | **2402** | **29.1%** |

---

## 5. RISCHI E MITIGAZIONI

### R1 — SEO e marketing

| Rischio | La rimozione della landing marketing dalla home riduce il contenuto indicizzabile e il pitch per visitatori nuovi |
|---------|---|
| Probabilita | Media |
| Impatto | Medio — meno contenuto per i motori di ricerca |
| Mitigazione | (1) `/about` conserva tutto il materiale marketing. (2) Meta tags e OG tags su `/` rimangono ottimizzati. (3) Structured data per la pagina tool. (4) Analizzare traffico: se la maggior parte degli utenti arriva da link diretto o referral, la landing non serve come entry point SEO |

### R2 — Utenti esistenti con bookmark

| Rischio | Utenti che hanno salvato URL specifici (es. dashboard, sezioni landing) trovano pagine diverse |
|---------|---|
| Probabilita | Bassa |
| Impatto | Basso — l'app e' in fase pre-lancio |
| Mitigazione | (1) `/dashboard` resta funzionante come redirect o fallback. (2) I deep link con `?session=` continuano a funzionare in LegalChat |

### R3 — Sessioni SSE e navigazione

| Rischio | L'utente naviga via dalla chat durante un'analisi SSE in corso, perdendo lo stream |
|---------|---|
| Probabilita | Alta — gia presente nella versione attuale |
| Impatto | Medio — l'analisi e' cachata lato server, ma il client perde lo stato |
| Mitigazione | (1) LegalChat gia usa `AbortController` e gestisce la riconnessione. (2) Il sistema di cache server-side (`analysis-cache.ts`) permette di riprendere sessioni. (3) Aggiungere `beforeunload` warning se analisi in corso |

### R4 — Complessita ChatMessage

| Rischio | `ChatMessage.tsx` (490 righe) rischia di diventare un god component se assorbe RiskCard + FairnessScore + LawyerCTA |
|---------|---|
| Probabilita | Alta |
| Impatto | Medio — manutenibilita ridotta |
| Mitigazione | (1) Mantenere i sub-componenti separati (RiskCard, FairnessScore, LawyerCTA) e importarli in ChatMessage. (2) ChatMessage diventa un router di rendering, non un monolite. Pattern: `switch(msg.phase) → <ClassificationSummary>`, `<AnalysisRisks>`, `<AdvisorResult>` |

### R5 — Persistenza conversazioni

| Rischio | LegalChat attualmente salva le conversazioni solo in memoria React (useState). Refresh pagina = tutto perso |
|---------|---|
| Probabilita | Certa — e' lo stato attuale |
| Impatto | Alto — l'utente perde il contesto |
| Mitigazione | (1) Fase 4 prevede integrazione con Supabase per persistenza. (2) Come workaround immediato: `sessionStorage` per salvataggio locale. (3) Le analisi sono gia salvate server-side in `analyses` table — serve solo collegare il recupero |

### R6 — Coesistenza con /legaloffice e /console

| Rischio | Il nuovo layout chat per `/` potrebbe confliggere con i layout di `/legaloffice` (workspace professionale) e `/console` (operatori) |
|---------|---|
| Probabilita | Bassa |
| Impatto | Basso — sono route completamente separate con i propri layout |
| Mitigazione | Nessuna azione necessaria. I tre layout servono audience diverse: `/` = utente consumer, `/legaloffice` = professionista legale, `/console` = operatore interno |

### R7 — Mobile sidebar

| Rischio | La sidebar conversazioni occupa troppo spazio su mobile (390px) |
|---------|---|
| Probabilita | Media |
| Impatto | Medio — UX mobile degradata |
| Mitigazione | (1) ChatSidebar gia ha un toggle per collassarsi. (2) Su mobile: sidebar come drawer overlay, non inline. (3) Pattern identico a ChatGPT mobile |

---

## 6. METRICHE DI SUCCESSO

| Metrica | Stato attuale | Target |
|---------|---------------|--------|
| Scroll-to-action | ~2400px | 0px |
| Click per prima analisi | 2 (CTA + file) | 1 (file) |
| Paradigmi UI | 4 (landing/workspace/dashboard/corpus) | 2 (chat/corpus) |
| Righe codice UI | 8259 | ~5300 (-36%) |
| Codice morto | 1006 righe (AnalysisProgress + ResultsView) | 0 |
| Codice duplicato | ~380 righe (CorpusChat + DeepSearch + FairnessScore) | 0 |
| Tempo totale implementazione stimato | — | 3-5 giorni |

---

## 7. DIPENDENZE E PREREQUISITI

1. **Nessuna modifica backend** — Tutte le API routes restano invariate (`/api/analyze`, `/api/corpus/ask`, `/api/deep-search`, `/api/user/usage`). Il redesign e' puramente frontend.

2. **Nessuna modifica al tier system** — `lib/tiers.ts` e il PowerPanel restano invariati. Il TierPanel nella chat gia funziona.

3. **Nessuna modifica al sistema di cache** — `lib/analysis-cache.ts` continua a funzionare trasparentemente.

4. **Prerequisito per Fase 4 (Dashboard in sidebar)** — Serve decidere se le conversazioni vengono salvate in Supabase (nuova tabella `conversations`) o in `sessionStorage`. La prima opzione e' preferibile per persistenza cross-device.

---

*Fine report. Per domande o chiarimenti: UX/UI Department via task board.*
