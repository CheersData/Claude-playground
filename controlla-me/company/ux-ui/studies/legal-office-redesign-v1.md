# Studio UX: Semplificare Legal Office (stile ChatGPT/Claude)

**Task**: #e058565f | **Priorità**: HIGH | **Data**: 2026-03-04
**Autore**: UX/UI Lead | **Richiesto da**: Boss (feedback utenti)

---

## 1. PROBLEMA

I primi feedback utenti segnalano un'interfaccia **troppo complicata**. L'utente deve:
1. Scrollare una landing page marketing per trovare l'upload
2. Capire un progress ring con 4 fasi, ETA, timer, illustrazioni agenti
3. Leggere un risultato lungo (score, rischi, deadlines, azioni, lawyer CTA)
4. Scoprire da solo le feature nascoste (deep search, corpus Q&A)
5. Navigare 3 paywall diversi (globale, deep search, per-rischio)

**Benchmark**: ChatGPT e Claude hanno 1 input al centro. Scrivi → ricevi risposta. Allega file → ricevi analisi. Chiedi follow-up → continui la conversazione. Zero friction.

---

## 2. ANALISI INTERFACCIA ATTUALE

### Flusso utente corrente (7 step)

```
Landing Page (scroll)
    ↓ scroll fino a upload zone
Upload File (drag-drop)
    ↓ POST /api/analyze
Progress View (4 fasi, ~90s)
    ↓ SSE streaming
Workspace (4 AgentBox + FinalEvaluation)
    ↓ scroll risultati
Results (score, rischi, azioni)
    ↓ click "Approfondisci" su rischio
Deep Search (chat Q&A)
    ↓ click back
Landing Page (da capo)
```

### Pain points identificati

| # | Problema | Severità | Dettaglio |
|---|---------|----------|-----------|
| 1 | **Upload sepolto** | ALTA | L'upload è in fondo alla landing, dopo hero, video, use cases. L'utente deve scrollare ~3 schermi |
| 2 | **Progress opaco** | MEDIA | 4 fasi con nomi tecnici (Classifier, Analyzer...) non significano nulla per l'utente. Il ring SVG è bello ma non informativo |
| 3 | **Risultati wall-of-text** | ALTA | Score + summary + rischi + deadlines + azioni + lawyer CTA = scroll lungo. L'utente perde il filo |
| 4 | **Deep search nascosta** | ALTA | Il pulsante "Approfondisci" dentro ogni RiskCard non è scoperto dal 70%+ degli utenti (stima) |
| 5 | **Corpus Q&A invisibile** | MEDIA | Presente solo nella navbar e nell'hero "Dubbi". La maggior parte degli utenti non lo scopre |
| 6 | **Nessun follow-up** | ALTA | Dopo l'analisi, l'utente non può chiedere "e se tolgo questa clausola?" o "cosa rischio davvero?" |
| 7 | **3 paywall diversi** | MEDIA | Paywall globale, deep search limit, per-rischio. Confusione su cosa è incluso |
| 8 | **No conversazione** | ALTA | Ogni analisi è one-shot. Non c'è memoria, non c'è dialogo. L'utente deve ricominciare da capo |

### Cosa funziona bene (da mantenere)

- Pipeline 4 agenti con streaming SSE — il backend è solido
- Design system coerente (palette, tipografia, animazioni)
- Workspace layout con sidebar pipeline + centro risultati + pannello corpus
- Agenti con personalità (Leo, Marta, Giulia, Enzo) — differenziazione visiva
- Score circolare (FairnessScore) — immediato e visivo
- Context prompt — l'idea di guidare l'analisi con una nota utente

---

## 3. PARADIGMA PROPOSTO: "CHAT-FIRST"

### Principio guida

> **L'interfaccia è una conversazione.** L'utente parla con il sistema. Il sistema risponde con analisi, rischi, consigli. L'utente chiede follow-up. Non esiste "landing" vs "risultati" — esiste un dialogo.

### Reference: come funzionano ChatGPT e Claude

```
┌────────────────────────────────────────────┐
│                                            │
│   (area messaggi — scrollabile)            │
│                                            │
│   [Messaggio utente]                       │
│   [Risposta AI — streaming]                │
│   [Messaggio utente]                       │
│   [Risposta AI — streaming]                │
│                                            │
├────────────────────────────────────────────┤
│  [  Input + allegato + invio            ]  │
└────────────────────────────────────────────┘
```

Caratteristiche chiave:
- **Input sempre visibile** in basso (non sepolto)
- **Allegati inline** — drag-drop direttamente sull'input
- **Risposte progressive** — testo che appare in streaming
- **Follow-up naturale** — scrivi sotto e la conversazione continua
- **Sidebar** per storico conversazioni (opzionale)

---

## 4. PROPOSTA DI REDESIGN

### Architettura a 2 viste

```
VISTA 1: HOME (prima analisi)
   → Input centrato + branding minimale
   → L'utente carica un documento o scrive una domanda

VISTA 2: WORKSPACE (dopo prima azione)
   → Chat conversazionale con risultati inline
   → Sidebar per navigazione fasi
   → Pannello laterale per corpus/articoli
```

### 4.1 — VISTA HOME (Welcome Screen)

```
┌──────────────────────────────────────────────────────────────────┐
│  controlla.me                                    [Prezzi] [Accedi]│
│                                                                   │
│                                                                   │
│                                                                   │
│                                                                   │
│                      controlla.me                                 │
│              La legge, compresa da tutti.                          │
│                                                                   │
│                                                                   │
│     ┌──────────────────────────────────────────────────────┐     │
│     │  📎 Carica un contratto o fai una domanda...         │     │
│     │                                                       │     │
│     │                                            [Invio ➤] │     │
│     └──────────────────────────────────────────────────────┘     │
│                                                                   │
│        Trascina un PDF/DOCX qui, oppure scrivi una domanda       │
│                                                                   │
│     ┌──────────┐  ┌──────────┐  ┌──────────────┐                │
│     │ Analizza  │  │ Chiedi   │  │ Cerca nel    │                │
│     │ contratto │  │ ai nostri│  │ codice       │                │
│     │           │  │ esperti  │  │ civile       │                │
│     └──────────┘  └──────────┘  └──────────────┘                │
│                                                                   │
│        Sicuro · Server EU · 3 analisi gratuite al mese           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Differenze dalla landing attuale:**
- Niente hero a 3 pannelli, niente video, niente testimonial, niente use cases
- **Un solo input** al centro — come Claude/ChatGPT
- 3 "suggestion chip" sotto: analizza contratto, fai domanda, cerca corpus
- Trust signals minimali in fondo (1 riga)
- La landing marketing diventa una pagina separata (`/about` o `/come-funziona`)

**Azioni possibili dall'input:**
1. **Drop/allega file** → avvia analisi completa (pipeline 4 agenti)
2. **Scrivi domanda** → corpus Q&A (question-prep + vector search + corpus agent)
3. **Click chip** → pre-compila l'input con suggerimento

### 4.2 — VISTA WORKSPACE (Conversazione)

```
┌──────────────────────────────────────────────────────────────────┐
│  controlla.me              [Nuova analisi]   [Storico] [Accedi]  │
├───────────┬──────────────────────────────────────┬───────────────┤
│           │                                      │               │
│  Pipeline │   TU                                 │  (pannello    │
│           │   ┌──────────────────────────────┐   │   articoli    │
│  ✓ Leo    │   │ 📄 Contratto_affitto.pdf     │   │   chiuso per  │
│    Tipo   │   │    "Verifica le clausole"    │   │   default)    │
│           │   └──────────────────────────────┘   │               │
│  ● Marta  │                                      │               │
│    Analisi│   LEO (Classificatore)               │               │
│           │   ┌──────────────────────────────┐   │               │
│  ○ Giulia │   │ Ho classificato il documento:│   │               │
│    Ricerca│   │ • Tipo: Locazione 4+4        │   │               │
│           │   │ • Parti: Locatore/Conduttore │   │               │
│  ○ Enzo   │   │ • Leggi: L.431/98, CC 1571  │   │               │
│    Consig.│   └──────────────────────────────┘   │               │
│           │                                      │               │
│  ───────  │   MARTA (Analista) ●                 │               │
│  Tier:    │   ┌──────────────────────────────┐   │               │
│  Associate│   │ ▋ Sto analizzando le clausole│   │               │
│           │   │   del contratto...            │   │               │
│           │   └──────────────────────────────┘   │               │
│           │                                      │               │
│           │                                      │               │
│           │                                      │               │
│           │                                      │               │
│           │                                      │               │
├───────────┼──────────────────────────────────────┤               │
│           │ ┌──────────────────────────────────┐ │               │
│           │ │ Fai una domanda sull'analisi...  │ │               │
│           │ │                          [Invio] │ │               │
│           │ └──────────────────────────────────┘ │               │
└───────────┴──────────────────────────────────────┴───────────────┘
```

**Il cuore del redesign**: i risultati appaiono come **messaggi di una conversazione**, non come una dashboard statica.

#### Flusso messaggi durante l'analisi

```
MESSAGGIO 1 — Utente
  📄 Contratto_affitto.pdf
  "Verifica le clausole vessatorie"

MESSAGGIO 2 — Leo (teal, ~12s)
  "Ho classificato il documento:"
  • Tipo: Locazione abitativa 4+4
  • Parti: Locatore / Conduttore
  • Leggi rilevanti: L. 431/98, CC art. 1571-1614
  • Focus: clausole vessatorie, deposito cauzionale

MESSAGGIO 3 — Marta (corallo, ~25s, streaming)
  "Ho trovato 3 clausole problematiche:"

  ⚠️ ALTO — Clausola penale sproporzionata (Art. 7)
  Il locatore prevede una penale di 6 mensilità...
  Base legale: Art. 1384 CC
  [Approfondisci →]

  ⚠️ MEDIO — Deposito cauzionale eccessivo (Art. 4)
  Il deposito richiesto è di 5 mensilità...
  Base legale: L. 392/78 art. 11
  [Approfondisci →]

  ⚡ BASSO — Clausola di rinnovo tacito (Art. 12)
  ...

MESSAGGIO 4 — Giulia (viola, ~30s, streaming)
  "Ho verificato le norme citate:"
  • Art. 1384 CC: la penale può essere ridotta dal giudice ✓
  • L. 392/78 art. 11: deposito max 3 mensilità ✓
  • Orientamento Cass. 2019/12345: penale > 3x = vessatoria

MESSAGGIO 5 — Enzo (oro, ~18s, streaming)
  ┌─────────────────────────────────────────┐
  │  VALUTAZIONE FINALE        Score: 5/10  │
  │  ○○○○○●●●●●                             │
  │                                         │
  │  In parole semplici:                    │
  │  "Questo contratto ha 2 problemi seri.  │
  │   La penale di 6 mesi è esagerata e il  │
  │   deposito di 5 mesi è illegale."       │
  │                                         │
  │  Cosa fare:                             │
  │  1. Negozia la penale sotto 3 mensilità │
  │  2. Riduci il deposito a max 3 mesi    │
  │  3. Aggiungi clausola di recesso        │
  │                                         │
  │  ⚖️ Consiglio un avvocato? Sì          │
  │  Specializzazione: diritto locazioni    │
  └─────────────────────────────────────────┘

--- dopo l'analisi, l'input resta attivo ---

MESSAGGIO 6 — Utente (follow-up)
  "E se il locatore non accetta di ridurre la penale?"

MESSAGGIO 7 — Sistema (deep search + corpus agent)
  "Se il locatore rifiuta la riduzione, hai queste opzioni:
   1. Firmare e poi contestare in giudizio (art. 1384 CC)
   2. Non firmare e cercare un altro immobile
   3. Proporre un compromesso: penale di 3 mensilità...

   Riferimenti: Cass. civ. 2019/12345, Art. 1384 CC
   [Vedi art. 1384 CC →]"
```

### 4.3 — PANNELLO LATERALE DESTRO (invariato, già buono)

Il pannello corpus/articoli attuale funziona bene. Si apre quando l'utente clicca un riferimento normativo.

```
┌───────────────┐
│ Art. 1384 CC  │
│               │
│ Riduzione     │
│ della penale  │
│               │
│ "La penale    │
│  può essere   │
│  diminuita    │
│  equamente    │
│  dal giudice  │
│  se..."       │
│               │
│ [Chiudi]      │
└───────────────┘
```

### 4.4 — SIDEBAR SINISTRA (semplificata)

```
┌─────────────┐
│ PIPELINE     │
│              │
│ ✓ Leo       │  ← click = scrolla al messaggio di Leo
│ ● Marta     │  ← pulsante = fase in corso
│ ○ Giulia    │  ← grigio = in attesa
│ ○ Enzo      │
│              │
│ ─────────── │
│ Tier:        │
│ Associate    │
│              │
│ ─────────── │
│ STORICO      │
│              │
│ 📄 Affitto   │  ← analisi precedenti
│ 📄 Lavoro    │
│ 📄 NDA       │
│              │
└─────────────┘
```

**Novità**: lo storico analisi è nella sidebar (come ChatGPT mostra le conversazioni passate), non in una pagina separata `/dashboard`.

---

## 5. CONFRONTO PRIMA/DOPO

| Aspetto | PRIMA | DOPO |
|---------|-------|------|
| **Primo contatto** | Landing marketing con scroll | Input centrato, azione immediata |
| **Upload** | Sepolto in fondo alla pagina | Drag-drop sull'input, sempre visibile |
| **Attesa** | Progress ring con 4 fasi tecniche | Messaggi che appaiono uno a uno (come typing) |
| **Risultati** | Dashboard lunga da scrollare | Messaggi conversazionali, leggibili in sequenza |
| **Deep search** | Pulsante nascosto dentro RiskCard | "Approfondisci →" inline + input follow-up sempre disponibile |
| **Corpus Q&A** | Pagina separata, quasi invisibile | Stessa interfaccia — scrivi domanda senza allegato |
| **Follow-up** | Impossibile | Input sempre attivo, conversazione naturale |
| **Storico** | Pagina `/dashboard` separata | Sidebar come ChatGPT |
| **Paywall** | 3 diversi, confusi | 1 solo: banner inline nel flusso chat |
| **Feeling** | "Sto usando un tool" | "Sto parlando con qualcuno" |

---

## 6. TRATTAMENTO DELLA LANDING MARKETING

La landing page attuale (hero, video, testimonial, use cases, CTA) **non viene eliminata** — viene spostata:

### Opzione A: Pagina `/about` (raccomandata)

```
controlla.me/           → Chat-first (input centrato)
controlla.me/about      → Landing marketing completa
controlla.me/pricing    → Invariata
controlla.me/corpus     → Invariata (ma accessibile anche da chat)
controlla.me/dashboard  → Rimossa (storico in sidebar)
```

Vantaggi: SEO intatta, contenuti marketing preservati, utente non costretto a scrollare.

### Opzione B: Landing marketing SOLO per utenti non autenticati

- Primo accesso: vedi landing marketing con CTA "Inizia gratis"
- Dopo login: sempre chat-first
- Problema: utente non loggato non può provare subito → friction

**Raccomandazione: Opzione A.** La home è sempre chat-first. Chi vuole saperne di più va su `/about`.

---

## 7. FEATURE MAP: DOVE FINISCE OGNI FUNZIONALITÀ

| Funzionalità attuale | Dove va nel redesign |
|-----------------------|---------------------|
| HeroVerifica (upload) | **Home** — input centrato |
| HeroDubbi (corpus chat) | **Home** — stessa input (senza file = domanda corpus) |
| HeroBrand (branding) | **Home** — titolo + payoff sopra l'input |
| MissionSection | `/about` — come funziona |
| VideoShowcase | `/about` — sezione video |
| UseCasesSection | `/about` — casi d'uso |
| TestimonialsSection | `/about` — testimonianze |
| UploadZone | **Home/Workspace** — input con drag-drop integrato |
| AnalysisProgress | **Workspace** — sostituito dai messaggi progressivi + sidebar pipeline |
| ResultsView | **Workspace** — messaggio Enzo (valutazione finale) |
| RiskCard | **Workspace** — inline nel messaggio di Marta (con "Approfondisci →") |
| DeepSearchChat | **Workspace** — follow-up nell'input principale |
| FairnessScore | **Workspace** — card nel messaggio Enzo |
| LawyerCTA | **Workspace** — suggerimento nel messaggio Enzo |
| PaywallBanner | **Workspace** — messaggio di sistema inline |
| Dashboard (/dashboard) | **Sidebar** — storico analisi |
| Corpus (/corpus) | **Rimane** ma accessibile anche da chat |
| Navbar | **Semplificata** — logo + nuova analisi + storico + pricing + login |

---

## 8. GESTIONE FOLLOW-UP (NUOVA FEATURE CORE)

### Come funziona

Dopo che l'analisi è completa (messaggio Enzo), l'input resta attivo. L'utente può:

1. **Domanda su un rischio specifico** → deep search (endpoint esistente `/api/deep-search`)
2. **Domanda generica sul diritto** → corpus agent (endpoint esistente `/api/corpus/ask`)
3. **"Cosa succede se..."** → deep search con contesto dell'analisi
4. **Nuovo file** → nuova analisi nella stessa conversazione

### Routing automatico

```
Input utente → contiene file?
  SÌ → nuova analisi (pipeline 4 agenti)
  NO → contiene riferimento a rischio/clausola dell'analisi corrente?
    SÌ → deep search (con contesto)
    NO → corpus agent (domanda generica)
```

### Backend necessario

Nuovo endpoint: `POST /api/chat` (o estensione di `/api/deep-search`)
- Riceve: `{ message, sessionId, analysisId? }`
- Decide: deep-search vs corpus-agent basandosi sul contesto
- Risponde: SSE streaming (come l'analisi)

**Effort**: medio. I 2 endpoint esistono già. Serve un router che li unisca.

---

## 9. MOCKUP MOBILE

### Home (mobile)

```
┌──────────────────────┐
│ controlla.me  [≡]    │
│                      │
│                      │
│    controlla.me      │
│  La legge, compresa  │
│     da tutti.        │
│                      │
│ ┌──────────────────┐ │
│ │ 📎 Carica o      │ │
│ │    scrivi...     │ │
│ │          [Invio] │ │
│ └──────────────────┘ │
│                      │
│ [Analizza] [Chiedi]  │
│ [Cerca corpus]       │
│                      │
│ Sicuro · Server EU   │
│ 3 analisi gratis     │
└──────────────────────┘
```

### Workspace (mobile) — sidebar collassata

```
┌──────────────────────┐
│ ← controlla.me  [☰]  │
│ ● Marta · 2/4       │  ← barra progresso mini
├──────────────────────┤
│                      │
│ TU                   │
│ ┌──────────────────┐ │
│ │📄 Contratto.pdf  │ │
│ └──────────────────┘ │
│                      │
│ LEO                  │
│ ┌──────────────────┐ │
│ │Tipo: Locazione   │ │
│ │Parti: 2          │ │
│ │Leggi: L.431/98   │ │
│ └──────────────────┘ │
│                      │
│ MARTA ●              │
│ ┌──────────────────┐ │
│ │▋ Analizzo le     │ │
│ │clausole...       │ │
│ └──────────────────┘ │
│                      │
├──────────────────────┤
│ ┌──────────────────┐ │
│ │ Domanda...  [➤]  │ │
│ └──────────────────┘ │
└──────────────────────┘
```

### Risultati (mobile) — conversazione scroll

```
┌──────────────────────┐
│ ← controlla.me  [☰]  │
│ ✓ Completata · 4/4   │
├──────────────────────┤
│                      │
│ ENZO                 │
│ ┌──────────────────┐ │
│ │ Score: 5/10      │ │
│ │ ○○○○○●●●●●      │ │
│ │                  │ │
│ │ Questo contratto │ │
│ │ ha 2 problemi    │ │
│ │ seri...          │ │
│ │                  │ │
│ │ Cosa fare:       │ │
│ │ 1. Negozia penale│ │
│ │ 2. Riduci dep.   │ │
│ │ 3. Aggiungi rec. │ │
│ │                  │ │
│ │ ⚖️ Serve avvoc.  │ │
│ └──────────────────┘ │
│                      │
├──────────────────────┤
│ ┌──────────────────┐ │
│ │ Domanda...  [➤]  │ │
│ └──────────────────┘ │
└──────────────────────┘
```

---

## 10. COMPONENTI DA CREARE / MODIFICARE

### Nuovi componenti

| Componente | Descrizione | Effort |
|-----------|-------------|--------|
| `ChatHome.tsx` | Welcome screen con input centrato + chip | Basso |
| `ChatWorkspace.tsx` | Layout conversazionale (sostituisce HomePageClient) | Alto |
| `ChatMessage.tsx` | Singolo messaggio (utente o agente) | Medio |
| `ChatInput.tsx` | Input unificato (testo + file + invio) | Medio |
| `AgentMessage.tsx` | Messaggio agente con avatar, colore, streaming | Medio |
| `ScoreCard.tsx` | Card score compatta (inline nel messaggio Enzo) | Basso |
| `RiskInline.tsx` | Rischio inline con "Approfondisci →" | Basso |
| `PipelineMini.tsx` | Sidebar/topbar pipeline semplificata | Basso |
| `AnalysisHistory.tsx` | Sidebar storico (sostituisce /dashboard) | Medio |

### Componenti da modificare

| Componente | Modifica | Effort |
|-----------|---------|--------|
| `Navbar.tsx` | Semplificare: logo + nuova analisi + pricing + login | Basso |
| `FairnessScore.tsx` | Versione compatta per inline in messaggio | Basso |

### Componenti da rimuovere dalla home

| Componente | Destinazione |
|-----------|-------------|
| `HeroSection.tsx` | → `/about` |
| `MissionSection.tsx` | → `/about` |
| `VideoShowcase.tsx` | → `/about` |
| `UseCasesSection.tsx` | → `/about` |
| `TestimonialsSection.tsx` | → `/about` |
| `CTASection.tsx` | → `/about` |
| `AnalysisProgress.tsx` | → Sostituito da messaggi progressivi |
| `ResultsView.tsx` | → Sostituito da messaggi Enzo |

### Componenti invariati

- `CorpusChat.tsx` — resta su `/corpus`, accessibile anche da chat
- `console/*` — non toccati (ops console separata)
- `PaywallBanner.tsx` — adattato come messaggio inline

---

## 11. PIANO IMPLEMENTATIVO

### Fase 1 — Fondazione (3-4 task, ~1 giorno)

1. **Creare `ChatInput.tsx`** — Input unificato con:
   - Textarea auto-resize
   - Drag-drop file zone (inline, non separata)
   - Pulsante allegato (📎)
   - Pulsante invio (→)
   - Chip suggerimenti sotto ("Analizza contratto", "Fai domanda", "Cerca corpus")

2. **Creare `ChatMessage.tsx` + `AgentMessage.tsx`** — Componenti messaggio:
   - Utente: sfondo grigio chiaro, allineato a destra
   - Agente: sfondo bianco, avatar + nome + colore agente, allineato a sinistra
   - Supporto streaming (testo che appare progressivamente)
   - Supporto contenuto strutturato (rischi, score, azioni)

3. **Creare `ChatHome.tsx`** — Welcome screen:
   - Logo + payoff centrato
   - ChatInput centrato
   - Chip suggerimenti
   - Trust signals minimali

4. **Creare `ChatWorkspace.tsx`** — Layout workspace:
   - Sidebar sinistra (pipeline + storico)
   - Centro: area messaggi scrollabile + ChatInput fisso in basso
   - Pannello destro: corpus/articoli (invariato)

### Fase 2 — Integrazione Backend (2-3 task, ~1 giorno)

5. **Adattare SSE handler** — Mappare eventi SSE a messaggi:
   - `event: progress (classifier, done)` → `AgentMessage` di Leo
   - `event: progress (analyzer, done)` → `AgentMessage` di Marta (con RiskInline)
   - `event: progress (investigator, done)` → `AgentMessage` di Giulia
   - `event: complete` → `AgentMessage` di Enzo (con ScoreCard)

6. **Creare router follow-up** — `POST /api/chat`:
   - Input: `{ message, sessionId }`
   - Se c'è un'analisi attiva: deep-search con contesto
   - Se non c'è analisi: corpus-agent
   - Output: SSE streaming

7. **Adattare `page.tsx`** — Sostituire HomePageClient con ChatHome/ChatWorkspace:
   - `view === "landing"` → `<ChatHome />`
   - `view === "analyzing" | "results"` → `<ChatWorkspace />`

### Fase 3 — Polish (2-3 task, ~1 giorno)

8. **Creare `/about`** — Spostare componenti marketing:
   - HeroSection, MissionSection, VideoShowcase, UseCases, Testimonials, CTA
   - Mantenere SEO metadata

9. **Creare `AnalysisHistory.tsx`** — Sidebar storico:
   - Fetch da Supabase (query esistente in dashboard)
   - Click → carica analisi nella chat

10. **Mobile responsive** — Ottimizzare per mobile:
    - Sidebar collassata con hamburger
    - Input sempre visibile in basso
    - Messaggi full-width
    - Barra progresso mini in alto

### Fase 4 — QA e Refinement (~0.5 giorno)

11. **Accessibilità** — Audit WCAG 2.1 AA su nuovi componenti
12. **Test E2E** — Aggiornare suite Playwright per nuovo flusso
13. **Beauty Report** — Aggiornare docs/BEAUTY-REPORT.md

---

## 12. RISCHI E MITIGAZIONI

| Rischio | Probabilità | Mitigazione |
|---------|------------|-------------|
| Backend non supporta follow-up | Media | Il 90% è già implementato (deep-search + corpus-ask). Serve solo un router |
| Streaming in chat è complesso | Media | Framer Motion `AnimatePresence` + `motion.div` per messaggi. Pattern già usato in AnalysisProgress |
| Utenti che vogliono la landing | Bassa | Landing preservata su `/about`. Link nel footer e nella navbar |
| SEO impatto | Media | Pagina `/about` con tutti i contenuti marketing. Meta tag preservati su home |
| Performance con molti messaggi | Bassa | Virtualizzazione lista messaggi se > 50 (react-window). Improbabile nel caso d'uso legale |

---

## 13. METRICHE DI SUCCESSO

| Metrica | Attuale (stimato) | Target |
|---------|-------------------|--------|
| Time to first action | ~45s (scroll + find upload) | < 5s (input visibile subito) |
| Drop-off rate landing → upload | ~60% | < 20% |
| Feature discovery (deep search) | ~30% | > 70% (inline nella conversazione) |
| Feature discovery (corpus Q&A) | ~10% | > 50% (stessa interfaccia) |
| Follow-up dopo analisi | 0% (impossibile) | > 40% |
| Satisfaction score | Non misurato | NPS > 50 |

---

## 14. CONCLUSIONE

Il redesign trasforma controlla.me da **"tool con dashboard"** a **"assistente legale con cui parli"**.

L'utente non deve più:
- Scrollare per trovare l'upload
- Capire cosa fanno 4 agenti con nomi tecnici
- Leggere una dashboard di risultati
- Scoprire feature nascoste

L'utente semplicemente:
- Apre la pagina → vede l'input → carica il file → legge le risposte → chiede follow-up

**Zero friction. Come parlare con un avvocato amico.**

---

*Studio prodotto dal Dipartimento UX/UI — 4 marzo 2026*
