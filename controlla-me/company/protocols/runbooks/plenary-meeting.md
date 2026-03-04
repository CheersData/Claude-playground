# Runbook: Riunione Plenaria

## Cos'è

Una riunione plenaria è una sessione strutturata in cui CME convoca più dipartimenti per prendere decisioni su temi cross-dipartimentali. Ogni riunione produce **decisioni tracciabili**, non solo discussioni.

## Quando convocarla

| Trigger | Frequenza | Esempio |
|---------|-----------|---------|
| Board quasi vuoto (open < 3) | Ad hoc | Fine sprint, nuovo ciclo |
| Decisione cross-dept bloccata | Ad hoc | Nuova fonte corpus richiede Architecture + Data Eng + QA |
| Review strategica | Mensile | OKR, priorità, retrospettiva |
| Emergenza aziendale | Immediata | Kill switch trading, security breach |
| Richiesta esplicita del boss | Su ordine | — |

## Partecipanti

| Ruolo | Chi | Cosa porta |
|-------|-----|-----------|
| **Facilitatore** | CME | Agenda, sintesi, decisioni |
| **Decisore** | Boss | Approvazione finale (L3/L4) o delega a CME (L1/L2) |
| **Dipartimenti convocati** | Solo quelli rilevanti | Parere nel loro dominio |

**Regola:** non convocare dipartimenti non rilevanti. Max 4 dipartimenti per riunione.

## Struttura standard (45 minuti max)

### 1. Apertura — 5 minuti
- CME presenta l'agenda
- CME dichiara il livello decisionale (L1/L2/L3/L4)
- Ogni dipartimento conferma disponibilità del parere

### 2. Context sharing — 10 minuti
- CME presenta il problema o la situazione
- Dati rilevanti: task board, metriche, costi, stato corpus/trading

### 3. Pareri dipartimenti — 15 minuti
- Ogni dipartimento espone il proprio parere (max 3 minuti ciascuno)
- Formato: Analisi | Raccomandazione | Risk/Effort
- CME registra i pareri

### 4. Sintesi e decisione — 10 minuti
- CME sintetizza i pareri
- CME propone la decisione
- Se L1/L2: CME decide
- Se L3/L4: CME invia al boss per approvazione (Telegram)

### 5. Action items — 5 minuti
- CME assegna task formali con `company-tasks.ts create`
- Owner e deadline per ogni action item
- Verbale salvato in `company/plenary-minutes/YYYY-MM-DD-<topic>.md`

## Formato verbale (obbligatorio)

```markdown
# Verbale Plenaria — <Data> — <Argomento>

## Partecipanti
- CME (facilitatore)
- <Dept 1>
- <Dept 2>

## Agenda
1. <Punto 1>
2. <Punto 2>

## Pareri raccolti

### <Dept 1>
Analisi: ...
Raccomandazione: ...
Risk/Effort: ...

### <Dept 2>
...

## Decisioni prese

| # | Decisione | Livello | Approvato da | Data |
|---|-----------|---------|--------------|------|
| 1 | ... | L1 | CME | YYYY-MM-DD |
| 2 | ... | L3 | Boss | YYYY-MM-DD |

## Task creati

| Task ID | Titolo | Owner | Deadline |
|---------|--------|-------|---------|
| #XXX | ... | <dept> | YYYY-MM-DD |

## Rinviati / Aperti
- <Punto non risolto> → riprende in: <data/sessione>
```

## Regole non negoziabili

1. **Ogni riunione produce almeno una decisione** — se non si decide nulla, la riunione non è riuscita
2. **Verbale obbligatorio** — senza verbale la riunione non esiste
3. **Task formali per ogni action item** — nessuna decisione senza task corrispondente
4. **Max 4 dipartimenti** — più è una riunione plenaria, è una discussione informale
5. **CME non implementa durante la riunione** — prima si decide, poi si delega

## Dove salvare i verbali

```
company/
└── plenary-minutes/
    └── YYYY-MM-DD-<argomento>.md
```

CME crea la directory `plenary-minutes/` al primo verbale.

## Riunioni plenarie tipo

### Sprint Review (fine ciclo)
- **Chi**: CME + Architecture + QA + Operations
- **Focus**: cosa è stato fatto, cosa resta, cosa è bloccato
- **Output**: task per prossimo ciclo, tech debt aggiornato

### Strategic Sync (mensile)
- **Chi**: CME + Strategy + Marketing + Finance
- **Focus**: OKR, revenue, opportunità, budget
- **Output**: priorità aggiornate, task strategici

### Trading Review
- **Chi**: CME + Trading + Finance + Operations
- **Focus**: performance paper/live, P&L, algoritmo, kill switch
- **Output**: go/no-go per live, aggiustamenti strategia

### Corpus Planning
- **Chi**: CME + Data Engineering + Architecture + Ufficio Legale
- **Focus**: nuove fonti, gap corpus, priorità ingestion
- **Output**: backlog fonti prioritizzato, task Data Engineering
