# CUSTOMER JOURNEY — OPS CENTER

Data: 2026-03-08
Versione: 1.0
Customer: Il Boss (CEO / Owner)

---

## 1. CHI E IL CUSTOMER

Il customer dell'Ops Center e **una persona sola**: il boss. Non e un tool per un team. E il cockpit di comando di un CEO che gestisce una piattaforma AI multi-verticale con agenti autonomi.

### Profilo

- **Ruolo**: CEO / Owner di una piattaforma AI con 2 verticali (Legal, Trading) e 12 dipartimenti staff
- **Competenza tecnica**: alta (capisce codice, architettura, API) ma non vuole FARE il tecnico — vuole DIRIGERE
- **Tempo disponibile**: limitato. Apre l'Ops Center per capire la situazione in secondi, non minuti
- **Dispositivo**: desktop (schermo largo), sessioni lunghe quando lavora, check rapidi quando monitora
- **Frequenza uso**: multipla giornaliera — all'inizio giornata, dopo comandi, prima di chiudere

### Bisogni fondamentali (in ordine di priorita)

1. **"Cosa sta succedendo ORA?"** — stato del sistema in 3 secondi
2. **"Cosa hanno fatto mentre non c'ero?"** — log attivita, task completati, decisioni prese
3. **"Su cosa sta lavorando il sistema?"** — task in progress, daemon attivo, pipeline in corso
4. **"Quanto costa?"** — spesa API, trend, budget residuo
5. **"I dipartimenti sono sani?"** — health check, blockers, warning
6. **"Devo fare qualcosa?"** — alert che richiedono azione umana, approvazioni L3/L4 pendenti
7. **"Voglio dare un ordine"** — input rapido, routing automatico

### Frustrazioni attuali (dalle conversazioni dirette)

| Frustrazione | Citazione boss | Gravita |
|-------------|---------------|---------|
| Debug non funziona | "vedo un debug non funzionante" | Critica |
| Non capisce cosa fa il sistema | "non capisco su cosa stia lavorando il sistema" | Critica |
| Colori e spazi disarmonici | "non vedo armonia dei colori e degli spazi" | Alta |
| Nessun feedback visivo quando il daemon lavora | (implicito dai comandi) | Alta |
| Troppi click per arrivare all'informazione | (osservato dal layout attuale) | Media |
| Non sa se un task e stato fatto bene | (dalla conversazione sui comandamenti non eseguiti) | Alta |

---

## 2. JOURNEY MAP

### Fase 1: APERTURA (0-3 secondi)

**Cosa fa il boss**: Apre `/ops`, inserisce credenziali se necessario, guarda lo schermo.

**Cosa vuole sapere IMMEDIATAMENTE**:
- Il sistema e vivo? (health indicator)
- Ci sono alert/emergenze? (banner rosso se kill switch, errori critici)
- Quanti task sono stati fatti da quando sono andato via?
- Il daemon e attivo?

**Stato attuale**: Login form → poi overview generica con troppi pannelli. Nessun "colpo d'occhio" dello stato.

**Stato ideale**: Dopo il login, una schermata che in 3 secondi comunica:
```
[HEALTH: verde]  [DAEMON: attivo, ultimo ciclo 2min fa]  [OGGI: 5 task done, 2 in progress]
[ALERT: nessuno]  [COSTI: $0.12 oggi]
```

**Momento di verita**: Se in 3 secondi il boss non capisce lo stato, ha gia fallito.

---

### Fase 2: ORIENTAMENTO (3-15 secondi)

**Cosa fa il boss**: Scansiona la pagina per capire dove sono le informazioni che cerca.

**Cosa vuole**:
- Timeline delle attivita recenti (cosa e successo in ordine cronologico)
- Task board con stato visivo (quanti open, in progress, done)
- Un modo rapido per vedere i dettagli di un task specifico

**Stato attuale**: Sidebar con molte voci (Overview, CME, Vision, Archive, Reports, Daemon, + lista dipartimenti). Troppo rumore. Non c'e una timeline.

**Stato ideale**: La pagina principale mostra:
1. **Activity Feed** (timeline cronologica) — cosa e successo, quando, chi l'ha fatto
2. **Task Summary** — 5 numeri (open, in_progress, review, done, blocked) + click per espandere
3. **Department Health** — griglia con pallini colorati (verde/giallo/rosso) per ogni dept

**Pain point**: Oggi il boss deve navigare tra sidebar items per ricostruire mentalmente cosa e successo. L'informazione dovrebbe venire a lui, non il contrario.

---

### Fase 3: APPROFONDIMENTO (15-60 secondi)

**Cosa fa il boss**: Ha identificato qualcosa di interessante/preoccupante, vuole i dettagli.

**Scenari**:
- "Il trading ha un warning — perche?"
- "Questo task e done ma voglio vedere il risultato"
- "Quanto abbiamo speso oggi sui vari provider?"
- "Il daemon ha creato task autonomamente?"

**Stato attuale**: Click su sidebar item → pannello specifico. I pannelli sono indipendenti, non collegati tra loro. Il debug panel ha 2 colonne ma il log live non funziona correttamente.

**Stato ideale**: Drill-down fluido:
- Click su pallino health dipartimento → apre dettaglio dept con task + ultimo status
- Click su task → modal con dettaglio + risultato + timeline
- Click su costi → breakdown per provider, per giorno, trend
- Tutto collegato: dal task posso andare al dept, dal dept posso vedere i costi

**Pain point**: Oggi le informazioni sono in silos. Overview, Debug, Testing, Trading sono 4 workspace separati. Il boss non ragiona per "workspace" — ragiona per "cosa voglio sapere".

---

### Fase 4: COMANDO (quando serve)

**Cosa fa il boss**: Vuole dare un ordine al sistema.

**Scenari**:
- "Concentrati sul Brand Book"
- "Ferma il daemon"
- "Esegui i task aperti"
- "Cambia priorita di questo task"

**Stato attuale**: CMEChatPanel esiste ma e un pannello sidebar tra tanti. DaemonControlPanel separato.

**Stato ideale**: Input sempre visibile (stile terminal/command bar), con:
- Comandi naturali: "focus trading", "pause daemon", "run task X"
- Feedback immediato: "Ricevuto. Task creato: #525"
- History dei comandi dati oggi

**Pain point**: Troppi posti dove interagire. Un comando potrebbe richiedere di andare nel pannello CME, poi nel Daemon, poi tornare all'Overview. Serve un unico punto di comando.

---

### Fase 5: CHIUSURA (fine sessione)

**Cosa fa il boss**: Ha finito di lavorare, vuole assicurarsi che il sistema continui.

**Cosa vuole sapere**:
- Task lasciati aperti (riassunto)
- Daemon attivo e prossimo ciclo schedulato
- Alert attivi (se ce ne sono)
- "Posso chiudere il PC senza preoccuparmi?"

**Stato attuale**: Nessun riassunto di chiusura. Il boss deve ricostruire mentalmente.

**Stato ideale**: Un indicatore sempre visibile: "Sistema autonomo: si / 3 task in coda / daemon attivo" oppure "Attenzione: 1 task bloccato richiede approvazione".

---

## 3. PROBLEMI STRUTTURALI DELL'OPS CENTER ATTUALE

### 3.1 Architettura a 4 workspace non riflette il pensiero del boss

Il boss non pensa in "Operations / Debug / Testing / Trading". Pensa in:
- "Cosa succede?" (activity feed)
- "Come sta il sistema?" (health)
- "Quanto costa?" (finance)
- "Cosa devo fare?" (action items)
- "Dammi i dettagli di X" (drill-down)

**Soluzione proposta**: Eliminare i workspace rigidi. Creare una pagina unica con sezioni collassabili ordinate per importanza.

### 3.2 Debug panel: il fallimento piu visibile

Il boss ha detto esplicitamente "vedo un debug non funzionante". Il LiveConsolePanel fa SSE streaming del log, ma:
- Non c'e feedback se la connessione e attiva
- Non c'e differenziazione visiva tra tipi di log (info/warn/error)
- Non c'e filtraggio
- Non e chiaro cosa il log sta mostrando (quale processo? quale agente?)

**Soluzione proposta**: Il "debug" come concetto va ripensato. Il boss non vuole debuggare — vuole CAPIRE. Rinominare in "Activity Log" e mostrare:
- Timeline di eventi con timestamp
- Filtri: per dipartimento, per tipo (task/cost/error/daemon)
- Colore semantico per severita
- Connessione attiva visibilmente indicata (pulsing dot)

### 3.3 Colori e spazi: il boss ha ragione

L'Ops Center attuale usa:
- `--ops-bg: #0a0a0a` — nero quasi puro (viola il Brand Book: mai nero puro, usare `#1b1e28`)
- `--ops-surface: #1a1a1a` — grigio neutro senza il blueberry tint Poimandres
- `--ops-accent: #FF6B35` — corretto
- Ma i testi muted, i bordi, le superfici non seguono la palette Poimandres

**Soluzione proposta**: Allineare TUTTI i CSS variable dell'Ops Center alla palette Poimandres del Brand Book. Zero eccezioni.

### 3.4 Densita informativa non calibrata

Alcuni pannelli sono troppo vuoti (OverviewSummaryPanel), altri troppo densi (TaskBoardFullscreen). Non c'e un ritmo visivo coerente.

**Soluzione proposta**: Applicare la griglia 8px e i token spaziatura del Brand Book. Ogni card ha lo stesso padding, ogni gruppo lo stesso gap.

---

## 4. PRINCIPI DI REDESIGN (derivati dalla Journey)

1. **3-Second Rule**: Lo stato del sistema deve essere comprensibile in 3 secondi dall'apertura
2. **Information Comes to You**: Il boss non cerca informazioni — le informazioni vengono a lui (activity feed, alert, summary)
3. **Single Command Point**: Un unico input per dare ordini, sempre visibile
4. **Drill-Down, Not Navigate**: Click su qualsiasi dato → dettaglio contestuale. Mai "vai in un altro pannello"
5. **Palette Poimandres**: Zero deviazioni dal Brand Book. `#1b1e28` come base, non `#0a0a0a`
6. **Semantic Color Always**: Verde=ok, arancione=attenzione, rosso=critico. Ovunque, sempre, senza eccezioni
7. **Daemon Visibility**: Lo stato del daemon e visibile come il battito cardiaco del sistema — sempre, non in un pannello nascosto

---

## 5. LAYOUT PROPOSTO (wireframe testuale)

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER                                                              │
│ [Logo]  SYSTEM: ● Live  DAEMON: ● Attivo (2m fa)  ALERT: 0       │
│ Oggi: 5 done, 2 in progress | $0.12 spesi                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ACTIVITY FEED (timeline cronologica)                          │  │
│  │ 14:32  ● Task #520 completato (ux-ui) — "Design tokens..."   │  │
│  │ 14:28  ● Daemon ciclo #47 — 2 task generati                  │  │
│  │ 14:15  ● Costo: $0.03 (cerebras, 12 chiamate)                │  │
│  │ 13:50  ⚠ Trading: slope signal SPY ignorato (risk limit)     │  │
│  │ 13:45  ● Task #519 completato (architecture)                  │  │
│  │ [Mostra di piu...]                                             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │ TASK BOARD       │  │ DEPT HEALTH      │  │ COSTS TODAY      │   │
│  │ Open: 8          │  │ ● Legal    ✓     │  │ Total: $0.12     │   │
│  │ In Progress: 1   │  │ ● Trading  ⚠     │  │ Cerebras: $0.08  │   │
│  │ Review: 2        │  │ ● Arch     ✓     │  │ Gemini: $0.03    │   │
│  │ Blocked: 2       │  │ ● QA       ✓     │  │ Groq: $0.01      │   │
│  │ Done today: 5    │  │ ● Security ✓     │  │                  │   │
│  │ [Espandi...]     │  │ [Tutti...]       │  │ [Dettaglio...]   │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ > COMMAND BAR                                                  │  │
│  │ │ Scrivi un comando...                                 [Invio]│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### Drill-down (modal/pannello laterale)

Click su qualsiasi elemento apre un pannello laterale con dettagli:
- Task → dettaglio + risultato + timeline
- Dipartimento → status + task aperti + ultimo report
- Costo → breakdown provider, trend 7gg, stima mensile
- Alert → dettaglio + azioni suggerite

---

## 6. METRICHE DI SUCCESSO

| Metrica | Target | Come misurare |
|---------|--------|--------------|
| Tempo a comprensione stato | < 3 secondi | Test con il boss |
| Click per dare un ordine | 1 (command bar) | Contare click |
| Click per dettaglio task | 1 (click su task) | Contare click |
| Frustrazione "non capisco" | Zero | Feedback diretto boss |
| Colori coerenti con Brand Book | 100% | Audit visivo |
| Spaziatura coerente con grid 8px | 100% | Audit visivo |
