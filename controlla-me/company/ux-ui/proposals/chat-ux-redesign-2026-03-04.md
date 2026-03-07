# Proposta Redesign UX: Chat-First Interface

**Data:** 2026-03-04
**Autore:** UX/UI Department (ui-ux-designer)
**Stato:** Proposta — approvazione CME richiesta
**Priorita:** Alta — feedback utenti indica complessita come barriera principale

---

## 1. Executive Summary

Il feedback iniziale degli utenti indica che l'interfaccia e troppo complicata. L'analisi del codebase rivela **3 interfacce separate** per funzionalita strettamente correlate (landing page, workspace, legaloffice), con flussi di navigazione frammentati e un alto carico cognitivo.

Questa proposta presenta un redesign ispirato al pattern ChatGPT/Claude: **un'unica interfaccia conversazionale** dove l'utente interagisce con un solo punto di ingresso. Il documento caricato e le domande fluiscono nella stessa esperienza. L'analisi appare progressivamente come risposta dell'AI, non come un cruscotto separato.

**Obiettivo:** ridurre il tempo medio dal primo click al risultato utile da ~7 step a ~2 step.

---

## 2. Analisi dello Stato Attuale

### 2.1 Le tre interfacce parallele

Il codebase contiene tre esperienze utente distinte per l'analisi legale:

| Interfaccia | Route | File principale | Descrizione |
|-------------|-------|----------------|-------------|
| **Landing + Workspace** | `/` | `app/HomePageClient.tsx` + `components/workspace/LegalWorkspaceShell.tsx` | Upload da landing page marketing, poi workspace con sidebar/center/right panel |
| **Legal Office** | `/legaloffice` | `app/legaloffice/LegalOfficeClient.tsx` | Console professionale con leader chat, agent sidebar, tier switching |
| **Corpus Q&A** | `/corpus` | `app/corpus/CorpusPageClient.tsx` | Navigazione corpus + chat Q&A separata |

Questo crea **confusione**:
- Un utente che arriva dalla home non sa che esiste `/legaloffice`
- Un utente su `/legaloffice` non ha accesso alla navigazione corpus completa (solo sidebar compatta)
- Il corpus chat in homepage (`HeroDubbi`) e un'esperienza disconnessa dal risultato analisi

### 2.2 Flusso utente attuale (Landing + Workspace)

```
Step 1: Landing page — scroll 3 sezioni hero (100vh ciascuna = ~300vh totale)
Step 2: Scroll fino alla sezione upload (o click CTA che fa smooth scroll)
Step 3: (Opzionale) Scrivi contesto nella textarea
Step 4: Drag-drop o click "Scegli file"
Step 5: Vista cambia a LegalWorkspaceShell — layout 3 colonne
Step 6: Osserva 4 AgentBox che si completano uno alla volta
Step 7: Scroll nel pannello centrale per leggere FinalEvaluationPanel
Step 8: (Opzionale) Click su riferimento normativo → apre right panel
Step 9: (Opzionale) Click "Approfondisci" su un rischio → DeepSearchChat inline
```

**Problemi identificati:**

1. **300vh di scroll marketing prima dell'azione** (`HeroSection.tsx`, righe 143-553): tre sezioni hero full-screen (HeroVerifica, HeroDubbi, HeroBrand) che l'utente deve superare per arrivare all'upload
2. **Duplicazione upload**: l'upload compare nella HeroVerifica (riga 221-301 di HeroSection.tsx) E nella sezione upload in fondo (riga 240-375 di HomePageClient.tsx). Due zone identiche confondono
3. **Transizione brusca**: da landing scrollabile a workspace full-screen senza animazione di continuita (HomePageClient.tsx riga 389: condizionale `view === "analyzing" || view === "results"`)
4. **Workspace a 3 colonne su mobile = non funziona**: `LegalWorkspaceShell.tsx` usa layout flex con sidebar fissa 224px (riga 70: `w-56`), non ha breakpoint mobile. Su schermi < 768px la sidebar schiaccia il contenuto
5. **Risultati sepolti**: dopo il completamento, il FinalEvaluationPanel appare in fondo a 4 AgentBox espansi. L'utente deve scrollare per trovare il risultato finale
6. **DeepSearch disconnesso**: il Q&A su rischi (`DeepSearchChat.tsx`) e un form inline nella RiskCard — non conversazionale, una domanda alla volta, nessuno storico

### 2.3 Flusso utente attuale (Legal Office)

```
Step 1: Naviga a /legaloffice (se sa che esiste)
Step 2: Osserva layout h-screen con header, left panel, center
Step 3: Drag-drop o click upload nella zona compatta in basso (h-56, riga 769)
Step 4: Leader annuncia analisi nel chat panel
Step 5: Sidebar mostra agent status blocks che si accendono
Step 6: Risultati appaiono in zona compatta h-56 (scrollabile, ma stretta)
Step 7: Leader annuncia completamento nel chat
Step 8: Fai domande al leader nel chat
```

**Problemi identificati:**

1. **Scopribilita zero**: l'utente non sa che `/legaloffice` esiste. Il link e nel navbar ma non e evidenziato come "il modo migliore"
2. **Zona risultati troppo compatta**: `h-56` (224px) per i risultati dell'analisi (LegalOfficeClient.tsx riga 769) — insufficiente per leggere rischi e azioni
3. **Duplicazione codice**: LegalOfficeClient reimplementa tutta la logica SSE di HomePageClient (startAnalysis, handleDrop, handleFileChange, buffer processing — ~100 righe identiche)
4. **Tier switching esposto all'utente finale**: il selector Intern/Associate/Partner nel header (riga 590-607) e un concetto interno, non user-facing
5. **Shell button**: il bottone "Shell" nel header (riga 628-635) espone funzionalita di debug all'utente normale

### 2.4 Carico cognitivo

| Elemento | Landing | Workspace | LegalOffice | Corpus |
|----------|---------|-----------|-------------|--------|
| Sezioni scrollabili | 9 | 0 | 0 | 4+ |
| Pannelli simultanei | 0 | 3 | 2+chat | 2 |
| CTA visibili | 6+ | 2 | 3 | 2 |
| Concetti da capire | agenti, rischi, score, tier | pipeline, agenti, corpus, chat | leader, agenti, tier, corpus, shell | fonti, istituti, articoli, Q&A |
| Navigazione necessaria | scroll + stato app | sidebar + center + right | tab + chat + zona compatta | tab + albero + articolo |

**Benchmark ChatGPT/Claude:**

| Elemento | ChatGPT/Claude |
|----------|---------------|
| Sezioni scrollabili | 0 — tutto in una vista |
| Pannelli simultanei | 1 (chat) + sidebar opzionale |
| CTA visibili | 1 (input) |
| Concetti da capire | scrivi/allega → leggi risposta |
| Navigazione necessaria | nessuna, tutto nel flusso |

---

## 3. Pattern di Riferimento: ChatGPT / Claude

### 3.1 Principi chiave

1. **Single input surface**: un solo campo di testo + opzione allegato. L'utente non deve decidere "dove" fare qualcosa
2. **Streaming response**: la risposta appare token per token. Non c'e una "pagina risultati" separata — il risultato E la conversazione
3. **Progressive disclosure**: i dettagli appaiono solo quando servono. Non tutto in una volta
4. **Conversational memory**: ogni messaggio ha il contesto dei precedenti. Non serve "tornare indietro"
5. **Minimal chrome**: niente sidebar, niente toolbar, niente pannelli — solo contenuto
6. **Artifacts/pannelli on demand**: Claude mostra artefatti (codice, documenti) in un pannello laterale solo quando rilevante

### 3.2 Mapping al nostro dominio

| Pattern ChatGPT/Claude | Controlla.me equivalente |
|------------------------|------------------------|
| Scrivi messaggio | "Carica contratto" o "Fai domanda legale" |
| Risposta streaming | Analisi progressiva (classifier → analyzer → investigator → advisor) resa come testo narrativo |
| Artefatto laterale | Articolo del corpus, score multidimensionale, grafico |
| Conversazione continua | Follow-up sul rischio, domanda al corpus, nuova analisi |
| History sidebar | Lista analisi precedenti |

---

## 4. Proposta: Chat-First Interface

### 4.1 Architettura della nuova esperienza

Una sola interfaccia con 3 zone:

```
1. SIDEBAR SINISTRA (collassabile, nascosta su mobile)
   - Logo + nuova chat
   - Lista conversazioni precedenti (analisi + Q&A)
   - Link corpus, pricing

2. AREA CENTRALE (protagonista)
   - Benvenuto/empty state con suggerimenti
   - Flusso conversazionale: upload → analisi → risultati → follow-up
   - Input in basso (testo + allegato)

3. PANNELLO DESTRO (on-demand, tipo Claude artifacts)
   - Articolo corpus quando cliccato
   - Score breakdown dettagliato quando cliccato
   - Deep search risultati
```

### 4.2 Flusso utente proposto

```
Step 1: Utente vede interfaccia pulita con input in basso
Step 2: Drag-drop documento OPPURE scrivi domanda
Step 3: Analisi appare come "messaggio dell'AI" con progress inline
Step 4: Risultato appare progressivamente nel flusso chat
Step 5: Utente fa follow-up nella stessa conversazione
```

**Da 7-9 step a 3-5 step.** Zero scroll marketing obbligatorio.

### 4.3 ASCII Mockup — Desktop (1280px+)

```
+--+-----------------------------------------------------------+
|  |                                                           |
|S |                   AREA CHAT CENTRALE                      |
|I |                                                           |
|D |  +------------------------------------------------------+ |
|E |  | [AI Avatar]                                          | |
|B |  |                                                      | |
|A |  | Ciao! Sono il tuo assistente legale AI.              | |
|R |  | Carica un contratto, una bolletta o qualsiasi        | |
|  |  | documento — oppure fammi una domanda.                | |
|  |  |                                                      | |
|  |  | Suggerimenti:                                        | |
|  |  | [Analizza un contratto di affitto]                   | |
|  |  | [Cosa prevede il codice civile sulla caparra?]       | |
|  |  | [Verifica clausole vessatorie nel mio contratto]     | |
|  |  +------------------------------------------------------+ |
|  |                                                           |
|  |                                                           |
|  |                                                           |
|  |  +------------------------------------------------------+ |
|L |  | [clip] Scrivi un messaggio o trascina un file... [->]| |
|O |  +------------------------------------------------------+ |
|G |                                                           |
|O |  Dati protetti · Server EU · 3 analisi gratis            |
+--+-----------------------------------------------------------+
```

### 4.4 ASCII Mockup — Desktop durante analisi

```
+--+-----------------------------------------------------------+
|  |                                                           |
|S |  +------------------------------------------------------+ |
|I |  | [User]                                               | |
|D |  | contratto_affitto.pdf                     [PDF icon] | |
|E |  +------------------------------------------------------+ |
|B |  |                                                      | |
|A |  | [AI Avatar]                                          | |
|R |  |                                                      | |
|  |  | Sto analizzando il tuo contratto di locazione.       | |
|  |  |                                                      | |
|  |  | ✓ Classificazione: Contratto di locazione 4+4        | |
|  |  |   Parti: 2 · Leggi applicabili: 3                   | |
|  |  |                                                      | |
|  |  | ✓ Analisi rischi: 2 clausole critiche trovate        | |
|  |  |   ⚠ Clausola di recesso unilaterale                 | |
|  |  |   ⚠ Penale eccessiva (Art. 1382 c.c.)   [→corpus]  | |
|  |  |                                                      | |
|  |  | ◌ Ricerca normativa in corso...                      | |
|  |  |   ● ● ●                                             | |
|  |  +------------------------------------------------------+ |
|  |                                                           |
|  |  +------------------------------------------------------+ |
|  |  | [clip] Scrivi un messaggio o trascina un file... [->]| |
|  |  +------------------------------------------------------+ |
+--+-----------------------------------------------------------+
```

### 4.5 ASCII Mockup — Desktop risultati completi + pannello corpus

```
+--+------------------------------------------+--------------+
|  |                                          |              |
|S |  [AI Avatar]                             | CORPUS       |
|I |                                          |              |
|D |  Ecco la mia valutazione del tuo         | Art. 1382    |
|E |  contratto di locazione.                 | c.c.         |
|B |                                          |              |
|A |  ┌─────────────────────────────────┐     | "La clausola |
|R |  │ SCORE COMPLESSIVO     6.2/10    │     | penale ha   |
|  |  │                                 │     | l'effetto di|
|  |  │ Equita:     5  ████████░░       │     | limitare il |
|  |  │ Coerenza:   7  ██████████████░  │     | risarcimento|
|  |  │ Prassi:     6  ████████████░░   │     | dovuto..."  |
|  |  │ Completezza:7  ██████████████░  │     |              |
|  |  └─────────────────────────────────┘     | [Vai alla    |
|  |                                          |  pagina]     |
|  |  ⚠ RISCHI (2)                           |              |
|  |  ├ Clausola di recesso unilaterale  ALTA |              |
|  |  │ Il locatore puo recedere con solo     |              |
|  |  │ 30 giorni di preavviso...             |              |
|  |  │ Rif: Art. 3 L. 431/1998  [→corpus]   |              |
|  |  │                                       |              |
|  |  └ Penale eccessiva            MEDIA     |              |
|  |    La penale del 20% supera...           |              |
|  |    Rif: Art. 1382 c.c.  [→corpus]       |              |
|  |                                          |              |
|  |  ✅ COSA FARE                            |              |
|  |  1. Rinegozia il termine di preavviso    |              |
|  |  2. Riduci la penale al 10%              |              |
|  |  3. Aggiungi clausola di mediazione      |              |
|  |                                          |              |
|  |  ⚖️ Consigliamo un avvocato per le       |              |
|  |     clausole critiche identificate.      |              |
|  |                                          |              |
|  |  +--------------------------------------+|              |
|  |  | Hai domande su questo contratto? [->] ||              |
|  |  +--------------------------------------+|              |
+--+------------------------------------------+--------------+
```

### 4.6 ASCII Mockup — Mobile (375px)

```
+-------------------------------+
|  controlla.me          [=]    |
+-------------------------------+
|                               |
|  [AI Avatar]                  |
|                               |
|  Ciao! Carica un documento    |
|  o fammi una domanda.         |
|                               |
|  [Analizza un contratto]      |
|  [Domanda sul codice civile]  |
|  [Verifica clausole]          |
|                               |
|                               |
|                               |
|                               |
|                               |
|                               |
|                               |
+-------------------------------+
| [+] Messaggio o file...  [>] |
+-------------------------------+
| Dati protetti · 3 gratis     |
+-------------------------------+
```

### 4.7 ASCII Mockup — Mobile durante risultati

```
+-------------------------------+
|  controlla.me    [score 6.2]  |
+-------------------------------+
|                               |
|  [User] contratto.pdf         |
|                               |
|  [AI] Ecco la mia analisi:   |
|                               |
|  Score: 6.2/10                |
|  ┌───────────────────────┐    |
|  │ Equita     5 ████░░░  │    |
|  │ Coerenza   7 ██████░  │    |
|  │ Prassi     6 █████░░  │    |
|  │ Completez. 7 ██████░  │    |
|  └───────────────────────┘    |
|                               |
|  ⚠ Clausola recesso    ALTA  |
|  Il locatore puo recedere...  |
|  [Art. 3 L. 431/1998]        |
|                               |
|  ⚠ Penale eccessiva   MEDIA  |
|  La penale del 20%...         |
|  [Art. 1382 c.c.]            |
|                               |
|  ✅ Cosa fare:                |
|  1. Rinegozia preavviso      |
|  2. Riduci penale            |
|                               |
+-------------------------------+
| Hai domande?              [>] |
+-------------------------------+
```

---

## 5. Cosa Resta, Cosa Cambia, Cosa Sparisce

### 5.1 Resta (funzionalita preservate)

| Funzionalita | Stato attuale | Nella nuova UI |
|-------------|--------------|----------------|
| Upload file (PDF, DOCX, TXT) | UploadZone inline in HeroSection + HomePageClient | Input bar con clip icon + drag-drop sull'area chat |
| Analisi SSE 4 agenti | `POST /api/analyze` con streaming | Identico backend, rendering diverso nel chat |
| Classificazione progressiva | AgentBox con status idle/running/done | Testo inline nel messaggio AI con checkmark progressivi |
| Score multidimensionale | FairnessScore + ScoreBreakdown in ResultsView | Inline nel messaggio + pannello destro on-demand |
| Risk cards con severita | RiskCard con badge alta/media/bassa | Inline nel messaggio, stile piu compatto |
| Deep search Q&A | DeepSearchChat per clausola specifica | Messaggio follow-up nella stessa conversazione |
| Corpus Q&A | CorpusChat (hero + /corpus) | Integrato nella chat principale ("fammi una domanda legale") |
| Riferimenti normativi cliccabili | TextWithArticleChips in AgentBox | Chip cliccabili nel testo → pannello destro |
| Corpus navigation | `/corpus` con SourcesGrid, HierarchyTree, ArticleReader | Pannello destro + pagina `/corpus` preservata per power users |
| Dashboard analisi | `/dashboard` con lista Supabase | Sidebar sinistra con history |
| Paywall | PaywallBanner per limiti | Messaggio inline nella chat |
| Lawyer CTA | LawyerCTA con form contatto | Messaggio inline con CTA |
| Context prompt | Textarea "Cosa vuoi controllare?" | Testo libero nella chat stessa |
| Keyboard shortcuts | Cmd+K per corpus search | Preservato |

### 5.2 Cambia

| Elemento | Da | A | Motivazione |
|---------|-----|---|------------|
| Entry point | 3 sezioni hero + scroll + upload zone | Input bar unica in basso | Riduce da 7 step a 2 |
| Layout analisi | Workspace 3 colonne (sidebar/center/right) | Chat single column + pannello on-demand | Leggibilita, mobile-first |
| Progress analisi | AnalysisProgress con ring + timer + 4 righe | Messaggio AI con checkmark inline | Meno intimidatorio |
| Risultati | FinalEvaluationPanel dopo 4 AgentBox | Testo narrativo con score card inline | Piu conversazionale |
| Deep search | Form Q&A in-card, una domanda | Messaggio follow-up nella stessa thread | Conversazionale, storico |
| Contesto utente | Textarea separata prima dell'upload | Messaggio di testo prima o dopo upload | Naturale come chat |
| Navigation | Navbar con 5 link + hamburger | Sidebar minimale + hamburger menu | Meno distrazioni |
| Tier switching | Tab nel header di LegalOffice | Impostazioni nascoste (utente non deve scegliere) | Riduce complessita |

### 5.3 Sparisce (o diventa opzionale)

| Elemento | Motivazione |
|---------|------------|
| 3 sezioni hero full-screen (HeroVerifica, HeroDubbi, HeroBrand) | Utente vuole agire, non leggere marketing. Landing page separata per SEO/marketing |
| MissionSection ("Come funziona" 4 step) | Info utile ma non nel flusso principale. Spostata in `/about` o tooltip |
| VideoShowcase | Marketing — spostato in landing separata |
| UseCasesSection | Marketing — spostato in landing separata |
| CTASection | Non serve se l'azione e gia sotto il naso |
| TeamSection (4 avatar agenti) | Bello ma non funzionale. I nomi degli agenti appaiono nel flusso |
| TestimonialsSection | Marketing — landing separata |
| WorkspaceSidebar con tier badge | Complessita non necessaria per l'utente finale |
| Shell button in LegalOffice | Debug — solo in `/ops` |
| AnalysisProgress (643 righe con ring animato) | Sostituito da progress inline nella chat, molto piu semplice |

---

## 6. Struttura dei Componenti Proposta

### 6.1 Nuovi componenti

```
components/chat/
├── ChatShell.tsx            # Layout h-screen: sidebar + center + (right panel)
├── ChatSidebar.tsx          # Logo, nuovo chat, history, link
├── ChatMessageList.tsx      # Scroll area con messaggi
├── ChatMessage.tsx          # Singolo messaggio (user o assistant)
├── ChatInput.tsx            # Input bar in basso (text + file attach + send)
├── ChatWelcome.tsx          # Empty state con suggerimenti
├── AnalysisMessage.tsx      # Messaggio AI per analisi progressiva
│   ├── PhaseProgress.tsx    # Checkmark inline per fasi (leggero, ~50 righe)
│   ├── InlineScoreCard.tsx  # Score complessivo + breakdown compatto
│   ├── InlineRiskList.tsx   # Lista rischi compatta
│   └── InlineActions.tsx    # Lista azioni compatta
├── CorpusMessage.tsx        # Messaggio AI per Q&A corpus
├── ArtifactPanel.tsx        # Pannello destro (tipo Claude artifacts)
│   ├── ArticleView.tsx      # Visualizzazione articolo corpus
│   ├── ScoreDetail.tsx      # Score breakdown dettagliato
│   └── DeepSearchView.tsx   # Risultati ricerca approfondita
└── PaywallMessage.tsx       # Messaggio inline per limiti
```

### 6.2 Componenti riusati (con adattamenti minimi)

| Componente attuale | Uso nel redesign | Modifiche |
|-------------------|-----------------|-----------|
| `FairnessScore.tsx` | Dentro `InlineScoreCard` | Dimensione ridotta, niente tooltip su mobile |
| `CorpusChat.tsx` | Logica riusata in `ChatInput` handler | Rimosso il componente standalone, logica integrata |
| `WorkspaceRightPanel.tsx` | Base per `ArtifactPanel` | Semplificato: niente tab bar, contenuto diretto |
| `AgentBox.tsx` | Rimosso, sostituito da `PhaseProgress` | Inline nel messaggio, non card separate |
| `Navbar.tsx` | Semplificato: solo logo + hamburger | Rimosso: nav links, active section tracking, scroll-to-top |

### 6.3 Componenti eliminati

| Componente | Righe | Motivazione |
|-----------|-------|------------|
| `AnalysisProgress.tsx` | 696 | Sostituito da ~50 righe in PhaseProgress inline |
| `HeroSection.tsx` | 583 | Marketing, spostato in landing separata |
| `ResultsView.tsx` | 312 | Sostituito da AnalysisMessage (~100 righe) |
| `RiskCard.tsx` | 235 | Sostituito da InlineRiskList (~60 righe) |
| `DeepSearchChat.tsx` | 124 | Integrato nella chat principale |
| `LawyerCTA.tsx` | 200 | Messaggio inline (~30 righe) |
| `MissionSection.tsx` | ~200 | Spostato in landing |
| `UseCasesSection.tsx` | ~150 | Spostato in landing |
| `CTASection.tsx` | ~100 | Non necessario |
| `VideoShowcase.tsx` | ~120 | Spostato in landing |
| `LegalWorkspaceShell.tsx` | 329 | Sostituito da ChatShell |
| `workspace/AgentBox.tsx` | 353 | Inline in AnalysisMessage |
| `workspace/FinalEvaluationPanel.tsx` | 295 | Inline in AnalysisMessage |

**Stima riduzione codice UI:** da ~4.000 righe in 13 componenti a ~1.200 righe in 12 componenti nuovi. Riduzione netta ~70%.

---

## 7. Piano di Implementazione

### Fase 1: Chat Shell + Input (Effort: 2 giorni)

**File da creare:**
- `components/chat/ChatShell.tsx` — Layout con sidebar collassabile + area chat + slot pannello destro
- `components/chat/ChatInput.tsx` — Input bar con: text field, paperclip per file, send button, drag-drop
- `components/chat/ChatWelcome.tsx` — Empty state con avatar, benvenuto, 3 chip suggerimenti
- `components/chat/ChatSidebar.tsx` — Logo, "Nuova analisi", lista history (fetch da Supabase)

**File da modificare:**
- `app/HomePageClient.tsx` — Riscrivere completamente: sostituire l'attuale flusso con ChatShell
- `app/page.tsx` — Nessuna modifica (gia server wrapper)

**Test:**
- Upload file trigger SSE stream (stessa API `/api/analyze`)
- Domanda di testo trigger `/api/corpus/ask` (stessa API)
- Sidebar mostra history da Supabase

### Fase 2: Rendering Analisi nel Chat (Effort: 3 giorni)

**File da creare:**
- `components/chat/ChatMessageList.tsx` — Lista messaggi con scroll-to-bottom
- `components/chat/ChatMessage.tsx` — Wrapper per messaggi user/assistant
- `components/chat/AnalysisMessage.tsx` — Messaggio AI che:
  - Mostra fase corrente con animazione (pallino pulsante)
  - Aggiunge checkmark quando fase completa
  - Renderizza mini-summary per classifier (tipo doc, leggi)
  - Renderizza score card inline quando advisor completa
  - Renderizza lista rischi inline
  - Renderizza azioni inline
- `components/chat/PhaseProgress.tsx` — 4 righe con checkmark/spinner, ~50 righe totali
- `components/chat/InlineScoreCard.tsx` — Cerchio score + 4 barre, compatto
- `components/chat/InlineRiskList.tsx` — Lista rischi con severita badge
- `components/chat/InlineActions.tsx` — Lista azioni numerate

**File da modificare:**
- `app/HomePageClient.tsx` — Integrare AnalysisMessage nel flusso chat

**File da rimuovere (o spostare in `/deprecated/`):**
- `components/AnalysisProgress.tsx`
- `components/ResultsView.tsx`
- `components/RiskCard.tsx`
- `components/DeepSearchChat.tsx`
- `components/LawyerCTA.tsx`
- `components/workspace/LegalWorkspaceShell.tsx`
- `components/workspace/AgentBox.tsx`
- `components/workspace/FinalEvaluationPanel.tsx`
- `components/workspace/WorkspaceRightPanel.tsx`

### Fase 3: Pannello Artifacts + Corpus (Effort: 2 giorni)

**File da creare:**
- `components/chat/ArtifactPanel.tsx` — Pannello destro slide-in con:
  - ArticleView: testo articolo corpus
  - ScoreDetail: score breakdown con tooltip
  - Deep search results
- `components/chat/CorpusMessage.tsx` — Rendering risposta corpus Q&A con articoli citati

**File da riusare:**
- Logica da `WorkspaceRightPanel.tsx` (ArticleViewer, CorpusSearchPanel) → integrata in ArtifactPanel
- `CorpusChat.tsx` → logica fetch riusata, componente standalone eliminato

### Fase 4: Conversazione Follow-up (Effort: 1 giorno)

**Modifiche:**
- `ChatInput.tsx` — Dopo analisi completata, input diventa "Hai domande su questo contratto?"
- Deep search integrato: l'utente chiede "Approfondisci la clausola di recesso" → chiama `/api/deep-search` con contesto
- Corpus Q&A integrato: l'utente chiede "Cosa dice la legge sulla penale?" → chiama `/api/corpus/ask`

### Fase 5: Landing Page Marketing (Effort: 1 giorno)

**File da creare:**
- `app/about/page.tsx` — Pagina marketing con le sezioni spostate:
  - HeroSection (semplificato, un solo hero con CTA "Prova gratis")
  - MissionSection
  - VideoShowcase
  - UseCasesSection
  - TestimonialsSection
  - CTASection
  - Footer

**File da modificare:**
- `components/Navbar.tsx` — Semplificato: solo logo + "About" + "Corpus" + "Prezzi" + "Accedi"

### Fase 6: Pulizia + /legaloffice (Effort: 1 giorno)

**Decisione richiesta:** unificare `/legaloffice` nella nuova interfaccia chat o mantenerla come "modalita pro"?

**Opzione A (consigliata):** `/legaloffice` diventa un alias che reindirizza alla chat principale. Rimuovere tutti i file LegalOffice-specific.

**Opzione B:** mantenere `/legaloffice` come interfaccia power-user con tier switching e shell. La chat diventa l'interfaccia standard, `/legaloffice` per professionisti.

**File da rimuovere (Opzione A):**
- `app/legaloffice/LegalOfficeClient.tsx`
- `app/legaloffice/page.tsx`
- `components/legaloffice/ActionBar.tsx`
- `components/legaloffice/ActivityBanner.tsx`
- `components/legaloffice/AgentStatusBlock.tsx`
- `components/legaloffice/LeaderChat.tsx`
- `components/legaloffice/ShellPanel.tsx`

---

## 8. Timeline

| Fase | Giorni | Dipendenze |
|------|--------|-----------|
| Fase 1: Chat Shell + Input | 2 | Nessuna |
| Fase 2: Rendering Analisi | 3 | Fase 1 |
| Fase 3: Artifacts + Corpus | 2 | Fase 2 |
| Fase 4: Follow-up conversazionale | 1 | Fase 3 |
| Fase 5: Landing Marketing | 1 | Fase 1 (parallelo con Fase 2-4) |
| Fase 6: Pulizia + /legaloffice | 1 | Fase 4 |
| **Totale** | **~10 giorni** | |

---

## 9. Analisi dei Rischi

### 9.1 Rischi tecnici

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| SSE streaming non funziona nel chat layout | Bassa | Alto | Il backend e identico. Solo il rendering cambia. Test manuale su ogni fase |
| Performance scroll con molti messaggi | Media | Medio | Virtualizzazione lista (react-window) se > 50 messaggi. Inizialmente non necessario |
| Pannello destro su mobile | Alta | Medio | Su mobile: bottom sheet full-screen (non pannello laterale). Puo usare il pattern sheet di Framer Motion |
| Drag-drop file su mobile non funziona | Alta | Medio | Su mobile: solo button "Allega file". Drag-drop solo desktop. Gia cosi oggi |
| FairnessScore SVG nel messaggio chat | Bassa | Basso | Componente gia testato, solo wrappato in contesto diverso |

### 9.2 Rischi UX

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| Utenti esistenti disorientati dal cambio | Media | Alto | Transition graduale: mantieni `/legaloffice` per 30 giorni. Banner "Prova la nuova interfaccia" |
| Analisi lunga (90s+) nel chat sembra lenta | Media | Medio | Progress inline con timer, messaggio "ci vogliono circa 90 secondi". Animazione pulsante costante |
| Risultati lunghi richiedono molto scroll | Media | Medio | Collapsible sections nei risultati. Score + rischi espansi, dettagli collassati |
| SEO: perdita landing page content | Alta | Alto | Mantenere `/about` con tutto il content marketing. Redirect 301 da pagine rimosse |
| Utenti non capiscono che possono caricare file | Media | Alto | Placeholder chiaro: "Scrivi una domanda o carica un documento". Icona paperclip prominente |

### 9.3 Rischi di business

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| Perdita conversioni da landing page | Media | Alto | A/B test: 50% utenti vedono vecchia landing, 50% nuova chat. Misurare conversion rate |
| Corpus page `/corpus` diventa orfana | Bassa | Basso | Resta accessibile dal menu. Power users la usano. Link nel pannello artifacts |
| `/legaloffice` users perdono funzionalita pro | Media | Medio | Se Opzione B: mantienila. Se Opzione A: assicurati che tier switching sia accessibile in settings |

---

## 10. Metriche di Successo

| Metrica | Valore attuale (stimato) | Target |
|---------|------------------------|--------|
| Tempo al primo upload | ~45s (scroll + trova upload) | < 10s |
| Step per completare analisi | 7-9 | 3-5 |
| Bounce rate landing page | Alto (scroll lungo) | -30% |
| Utenti che fanno follow-up | Basso (deep search nascosto) | +50% |
| Mobile completion rate | Basso (workspace non responsive) | +100% |
| Pagine/componenti da mantenere | 4 interfacce, ~4000 righe | 1 interfaccia, ~1200 righe |

---

## 11. Decisioni Aperte per CME

1. **Opzione A vs B per /legaloffice**: unificare o mantenere dual-interface?
2. **A/B test**: implementare gradualmente o big-bang switch?
3. **Landing page `/about`**: quanto content marketing preservare?
4. **Tier switching**: nascondere completamente o mettere in settings?
5. **Corpus page `/corpus`**: mantenere invariata o integrare anche quella nella chat?

---

## 12. Appendice: File Reference Completa

### File principali analizzati

| File | Righe | Ruolo |
|------|-------|-------|
| `app/HomePageClient.tsx` | 413 | Orchestratore landing + analisi |
| `app/legaloffice/LegalOfficeClient.tsx` | 857 | Console professionale |
| `app/corpus/CorpusPageClient.tsx` | 522 | Navigazione corpus |
| `app/dashboard/DashboardClient.tsx` | 181 | Lista analisi |
| `components/HeroSection.tsx` | 583 | 3 hero sections |
| `components/AnalysisProgress.tsx` | 696 | Progress ring + timer |
| `components/ResultsView.tsx` | 312 | Vista risultati |
| `components/RiskCard.tsx` | 235 | Card rischio + deep search |
| `components/DeepSearchChat.tsx` | 124 | Q&A clausole |
| `components/FairnessScore.tsx` | 199 | Indicatore circolare |
| `components/LawyerCTA.tsx` | 200 | CTA avvocato |
| `components/CorpusChat.tsx` | 239 | Chat corpus |
| `components/Navbar.tsx` | 263 | Navigazione |
| `components/workspace/LegalWorkspaceShell.tsx` | 329 | Layout workspace |
| `components/workspace/AgentBox.tsx` | 353 | Card agente |
| `components/workspace/WorkspaceRightPanel.tsx` | 449 | Pannello destro |
| `components/workspace/FinalEvaluationPanel.tsx` | 295 | Valutazione finale |

### Department context

| File | Ruolo |
|------|-------|
| `company/ux-ui/department.md` | Design system, principi, responsabilita |
| `company/ux-ui/runbooks/implement-ui-change.md` | Procedura implementazione UI |
| `company/ux-ui/runbooks/accessibility-audit.md` | Checklist WCAG 2.1 AA |
