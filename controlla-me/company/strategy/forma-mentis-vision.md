# Forma Mentis — Vision Strategica

> **Documento:** Studio strategico nuova architettura organizzativa
> **Data:** 2026-03-18 | **Prodotto da:** Dipartimento Strategy (strategist)
> **Destinatari:** CME + Boss | **Task:** #980
> **Fonti:** 21 Agentic Design Patterns (Antonio Gulli), Q1 2026 Review, stato corrente azienda

---

## 1. VISION

Controlla.me oggi funziona come un paziente con amnesia anterograda: ogni sessione Claude Code nasce senza memoria, rilegge gli stessi file, ricostruisce lo stesso contesto, e quando si chiude perde tutto cio che ha imparato. I 12 dipartimenti non parlano tra loro — ogni comunicazione passa da CME come collo di bottiglia. Il daemon genera report che nessuno legge in modo strutturato. Non esiste un registro delle decisioni, quindi gli stessi errori si ripetono.

**Forma Mentis** trasforma questa collezione di sessioni isolate in un organismo con coscienza. Non si tratta di aggiungere feature — si tratta di dare al sistema la capacita di ricordare, comunicare, monitorare i propri obiettivi, imparare dai propri errori e collaborare in modo strutturato. E la differenza tra un'azienda che esegue compiti e un'azienda che evolve.

Il nome non e casuale: "forma mentis" e la struttura del pensiero. L'architettura a 5 livelli (Memoria, Sinapsi, Coscienza, Riflessione, Collaborazione) rispecchia le funzioni cognitive di un organismo intelligente. Ogni livello abilita il successivo — non sono feature indipendenti ma strati di capacita crescente.

---

## 2. PRIORITA DEI LIVELLI (con dipendenze)

| Priorita | Livello | Pattern | Perche prima |
|----------|---------|---------|-------------|
| **1** | MEMORIA | Pattern 8 (Memory Management) | Senza memoria persistente, tutti gli altri livelli sono inutili. Le sinapsi non hanno nulla da trasmettere, la coscienza non ha storia da monitorare, la riflessione non ha decisioni da analizzare |
| **2** | SINAPSI | Pattern 15 (A2A Communication) | Con la memoria attiva, i dipartimenti possono comunicare senza CME. Oggi CME e il collo di bottiglia: ogni interazione cross-dept richiede una sessione CME attiva. Le sinapsi eliminano il single point of failure |
| **3** | COSCIENZA | Pattern 11 (Goal Monitoring) | Richiede MEMORIA (per tracciare lo stato nel tempo) e SINAPSI (per raccogliere dati dai dipartimenti). Senza questi due, il monitoraggio obiettivi e una foto statica, non un film |
| **4** | RIFLESSIONE | Pattern 4 (Reflection) | Richiede COSCIENZA (per sapere cosa monitorare) e MEMORIA (per salvare le lezioni). La riflessione senza coscienza e analisi cieca — non sai cosa osservare |
| **5** | COLLABORAZIONE | Pattern 7 (Multi-Agent) | Richiede tutti i livelli precedenti. Fan-out/fan-in strutturato ha senso solo quando gli agenti hanno memoria condivisa, comunicazione diretta, obiettivi tracciati e capacita di apprendimento |

**Grafo delle dipendenze:**
```
MEMORIA ──> SINAPSI ──> COSCIENZA ──> RIFLESSIONE ──> COLLABORAZIONE
   |            |            |
   └────────────┴────────────┘  (tutte dipendono da MEMORIA)
```

---

## 3. MATRICE DI IMPATTO PER DIPARTIMENTO

| Dipartimento | MEMORIA | SINAPSI | COSCIENZA | RIFLESSIONE | COLLABORAZIONE |
|-------------|---------|---------|-----------|-------------|----------------|
| **Architecture** | Alto: non rilegge ADR ogni sessione, ha context storico | Alto: riceve richieste da Strategy/QA senza passare da CME | Medio: vede progresso OKR tecnici | Alto: consulta journal "perche abbiamo scelto X" | Alto: fan-out su refactoring cross-dept |
| **Data Engineering** | Alto: ricorda quali fonti sono caricate, stato pipeline | Medio: notifica QA automaticamente post-load | Medio: monitora copertura corpus vs target | Medio: "l'ultima volta normattiva ha fallito su ZIP" | Basso: lavora in autonomia |
| **Quality Assurance** | Alto: ricorda test flaky, pattern di failure | Alto: riceve bug da chiunque senza task manuale CME | Alto: traccia coverage vs target OKR | Alto: "questo pattern di errore lo abbiamo gia visto" | Alto: lancia suite parallele per dept |
| **Security** | Medio: audit trail persistente cross-sessione | Alto: alert a CME + dept senza bottleneck | Alto: monitora postura security vs target | Alto: "questo tipo di vulnerability e ricorrente" | Basso: opera come singleton |
| **Finance** | Alto: trend costi cross-sessione senza ricalcolare | Medio: alert automatici a CME quando soglia superata | Alto: monitora budget vs burn rate | Medio: "il mese scorso abbiamo speso troppo su provider X" | Basso: opera come singleton |
| **Operations** | Alto: dashboard con dati storici, non solo snapshot | Medio: raccoglie metriche da tutti i dept | Alto: health check continuo vs baseline | Medio: trend performance nel tempo | Medio: aggregazione cross-dept |
| **Strategy** | Alto: non riscrive Q1 Review ogni sessione | Medio: sincronizza con Marketing senza CME | Alto: traccia OKR Q2 vs progresso reale | Alto: "questa opportunita l'avevamo gia valutata" | Medio: coordina con Marketing |
| **Marketing** | Alto: ricorda content calendar, stato SEO | Alto: comunica con Strategy/UL direttamente | Medio: monitora metriche growth | Medio: "questo tipo di contenuto ha funzionato" | Medio: coordina con Strategy |
| **Protocols** | Medio: decisioni passate consultabili | Alto: routing piu veloce con query diretta a dept | Alto: audit decisioni automatico | Alto: "questa decisione e stata presa 3 volte, pattern?" | Medio: pareri paralleli |
| **UX/UI** | Medio: design system persistente | Medio: feedback da QA senza CME | Basso: impatto limitato | Medio: "questo pattern UI ha causato problemi" | Basso: opera come singleton |
| **Uff. Legale** | Alto: prompt history, pattern analisi | Medio: riceve contenuti da Marketing | Alto: qualita analisi vs baseline | Alto: "questo tipo di contratto causa sempre X" | Alto: pipeline 4 agenti gia strutturata |
| **Uff. Trading** | Alto: storia trade, P&L cumulativo | Medio: alert a Finance/CME | Alto: Sharpe/win rate vs target | Alto: "questa configurazione ha causato loss" | Medio: pipeline 5 agenti gia strutturata |

**Dipartimenti con impatto massimo:** Architecture, QA, Strategy (beneficiano di tutti e 5 i livelli).
**Dipartimenti con impatto minimo:** UX/UI, Security (operano come singleton, beneficiano principalmente dalla memoria).

---

## 4. METRICHE DI SUCCESSO

### MEMORIA
- **Tempo di bootstrap sessione**: da ~45s (lettura cme.md + board + daemon) a <10s (context pre-caricato)
- **Contesto perso tra sessioni**: da 100% a <5% (misurabile: quante volte CME rilegge lo stesso file in sessioni consecutive)
- **Rework da amnesia**: da stimato 30% del tempo sessione a <5%

### SINAPSI
- **Task CME-intermediato**: da 100% a <40% (i flussi autorizzati diretti in contracts.md funzionano senza CME)
- **Latenza comunicazione cross-dept**: da "prossima sessione CME" a <5 minuti
- **Flussi vietati violati**: 0 (le sinapsi rispettano contracts.md)

### COSCIENZA
- **Frequenza check OKR**: da "quando qualcuno si ricorda" a automatica (ogni sessione)
- **Drift detection**: tempo medio per rilevare un KR off-track — target <24 ore
- **Obiettivi dimenticati**: da frequente (13 task aperti Q1 non tracciati) a 0

### RIFLESSIONE
- **Errori ripetuti**: misurabile dal decision journal — stessa decisione presa 2+ volte con stesso esito negativo — target 0
- **Tempo decisione per pattern noto**: da "rianalizzare da zero" a <2 minuti (consultazione journal)
- **Lezioni documentate vs lezioni applicate**: ratio target >80%

### COLLABORAZIONE
- **Task paralleli eseguiti con successo**: da ad-hoc a >90% success rate
- **Fan-out/fan-in completati**: numero di task multi-dept completati con tutti i risultati raccolti
- **Tempo aggregazione risultati**: da manuale (CME legge tutto) a automatico

---

## 5. ANALISI DEI RISCHI

| # | Rischio | Probabilita | Impatto | Mitigazione |
|---|---------|-------------|---------|-------------|
| 1 | **Over-engineering**: costruire un sistema sofisticato che nessuno usa perche troppo complesso | Alta | Alto — spreco di 4-8 settimane | Regola: ogni livello deve funzionare con file JSON/Markdown e CLI esistente. Niente database aggiuntivi, niente infrastruttura nuova. Se non funziona con `cat` e `grep`, e troppo complesso |
| 2 | **Performance**: la memoria persistente rallenta il bootstrap della sessione invece di velocizzarlo | Media | Medio | Limite fisso: context file <50KB. Pruning automatico. Se il caricamento supera 15s, il livello va semplificato |
| 3 | **Complessita accidentale**: le sinapsi creano dipendenze nascoste tra dipartimenti | Media | Alto | Le sinapsi rispettano rigorosamente contracts.md. Nessun flusso nuovo senza approvazione Process Designer. Audit mensile delle comunicazioni |
| 4 | **Falsa coscienza**: il sistema traccia metriche irrilevanti, dando l'illusione di monitoraggio | Media | Medio | Solo metriche gia definite in OKR e status.json. Nessuna metrica nuova senza giustificazione dal dipartimento owner |
| 5 | **Costo cognitivo per il boss**: il boss deve imparare nuovi comandi e concetti | Bassa | Alto — il boss abbandona il sistema | Interfaccia identica: stessi comandi CLI, stesso flusso. Forma Mentis lavora sotto il cofano, il boss vede solo risultati migliori |
| 6 | **Conflitto con sessioni isolate**: Claude Code non supporta nativamente stato persistente tra sessioni | Certa | Medio | Usare filesystem come state store (gia funziona per task system, status.json, daemon-report). CLAUDE.md gia letto automaticamente. Estendere lo stesso pattern |
| 7 | **Distrazione dal prodotto**: 5 livelli di architettura interna mentre il prodotto ha 0 utenti reali | Alta | Alto | Fasi minime (vedi sezione 7). Fase 1 = 1 settimana. Se dopo Fase 1 non c'e beneficio misurabile, STOP |

---

## 6. COMPETITIVE MOAT — Forma Mentis come differenziatore

### Il problema dei competitor

Tutti i competitor (Harvey, Luminance, Lexroom, Lawhive) usano LLM in modo stateless: ogni sessione e una chiamata API isolata. Luminance ha introdotto "institutional memory" ma e limitata a pattern matching su contratti enterprise — non e coscienza organizzativa.

### Cosa cambia con Forma Mentis

| Capacita | Competitor stateless | Controlla.me con Forma Mentis |
|----------|---------------------|-------------------------------|
| Sessioni consecutive | Ogni sessione parte da zero | Il sistema ricorda cosa ha fatto, cosa ha imparato, cosa e cambiato |
| Coordinamento agenti | Agenti isolati, nessun apprendimento cross-agente | Agenti che condividono conoscenza e si correggono a vicenda |
| Adattamento | Stesso comportamento indipendentemente dal feedback | Riflessione attiva: "la scorsa analisi ha sottovalutato il rischio X, calibro" |
| Efficienza operativa | Ricalcola tutto ogni volta | Context pre-caricato, decisioni gia prese consultabili |
| Evoluzione | Migliora solo se un umano riscrive i prompt | Auto-miglioramento: il sistema segnala i propri gap e propone correzioni |

### Il moat reale

Forma Mentis non e solo un'architettura interna — e un **moat composto**:
1. **Knowledge base auto-accrescente** (gia attivo con vector DB) + **memoria organizzativa** = il sistema diventa piu intelligente E piu efficiente nel tempo
2. **Corpus legislativo specializzato** + **riflessione su analisi passate** = qualita delle analisi migliora con ogni utilizzo
3. **Multi-provider con N-fallback** + **coscienza dei costi** = ottimizzazione automatica del rapporto qualita/costo

Un competitor puo copiare il nostro codice, ma non puo copiare la nostra memoria accumulata e le lezioni apprese. Forma Mentis trasforma il tempo in vantaggio competitivo irreversibile.

---

## 7. FASI DI IMPLEMENTAZIONE

### Fase 1 — MEMORIA (settimane 1-2)

**Obiettivo:** Ogni sessione Claude Code parte con il contesto della sessione precedente.

Deliverable:
- `company/memory/session-context.json` — stato corrente condensato (ultimo board, ultimi task completati, decisioni recenti)
- Aggiornamento automatico a fine sessione (append, non riscrittura)
- Pruning automatico: mantieni ultimi 7 giorni, archivia il resto
- CLAUDE.md aggiornato: "leggi memory/session-context.json all'avvio"

**Criterio di successo:** tempo di bootstrap <15s, CME non rilegge file gia letti nella sessione precedente.

### Fase 2 — SINAPSI (settimane 3-4)

**Obiettivo:** I flussi diretti autorizzati in contracts.md funzionano senza sessione CME attiva.

Deliverable:
- `company/mailbox/<dept>/inbox.json` — coda messaggi per dipartimento
- Script `send-message.ts --from qa --to architecture --type bug_report --body "..."`
- Il daemon legge le inbox e le include nel report
- Validazione: solo flussi autorizzati (contracts.md) passano. Flussi vietati rifiutati con errore

**Criterio di successo:** almeno 3 flussi diretti funzionanti senza CME (QA->dept bug, Security->CME alert, Trading->Finance P&L).

### Fase 3 — COSCIENZA (settimane 5-6)

**Obiettivo:** Il sistema sa dove si trova rispetto ai propri obiettivi e lo segnala autonomamente.

Deliverable:
- `company/consciousness/okr-tracker.json` — stato OKR aggiornato da ogni sessione
- `company/consciousness/drift-alerts.json` — KR off-track con severity e raccomandazione
- Integrazione nel daemon: sezione "GOAL STATUS" nel report con semafori (verde/giallo/rosso)
- Alert Telegram automatico se un KR passa da verde a rosso

**Criterio di successo:** drift detection <24h, 0 obiettivi dimenticati nel trimestre.

### Fase 4 — RIFLESSIONE (settimane 7-8)

**Obiettivo:** Il sistema impara dalle decisioni passate e non ripete gli stessi errori.

Deliverable:
- `company/reflection/decision-journal.json` — registro strutturato: decisione, contesto, esito, lezione
- Query: "abbiamo gia affrontato questo problema?" → risposta in <5s
- Integrazione nel daemon: pattern ricorrenti segnalati automaticamente
- Template per post-mortem automatico dopo task falliti

**Criterio di successo:** 0 errori ripetuti (stesso pattern negativo osservato 2+ volte), tempo decisione per pattern noto <2 minuti.

### Fase 5 — COLLABORAZIONE (settimane 9-10)

**Obiettivo:** Task multi-dipartimento eseguiti con pattern fan-out/fan-in strutturato.

Deliverable:
- `company/collaboration/multi-dept-task.json` — template task con subtask per dept, aggregazione risultati
- Script `fan-out.ts --task <id> --depts "arch,qa,security"` — crea subtask paralleli
- Aggregazione automatica: quando tutti i subtask sono `done`, il task padre si chiude con sintesi
- Dashboard `/ops`: vista task multi-dept con stato per subtask

**Criterio di successo:** >90% task multi-dept completati con tutti i risultati, tempo aggregazione <5 minuti.

### Timeline complessiva

```
Sett. 1-2   [MEMORIA]       ████████░░░░░░░░░░░░  Fondamenta
Sett. 3-4   [SINAPSI]       ░░░░░░░░████████░░░░  Comunicazione
Sett. 5-6   [COSCIENZA]     ░░░░░░░░░░░░░░░░████  Monitoraggio
Sett. 7-8   [RIFLESSIONE]   dopo review intermedia
Sett. 9-10  [COLLABORAZIONE] dopo review intermedia
```

**Gate:** review dopo Fase 2. Se MEMORIA e SINAPSI non mostrano beneficio misurabile, rivalutare Fasi 3-5 prima di procedere.

---

## NOTE FINALI

Forma Mentis e un investimento in capacita organizzativa, non in feature prodotto. Il ROI non si misura in utenti acquisiti ma in velocita decisionale, riduzione di rework e qualita delle analisi nel tempo.

Il rischio principale non e tecnico — e strategico: dedicare 10 settimane all'architettura interna mentre il prodotto ha 0 utenti. Per questo la Fase 1 e progettata per durare 1 settimana e produrre beneficio immediato. Se dopo 2 settimane il beneficio non e evidente, il progetto va messo in pausa.

La raccomandazione di Strategy: **GO su Fase 1 immediatamente**, con review obbligatoria dopo Fase 2.

---

*Documento prodotto dal dipartimento Strategy (strategist). Task #980.*
*Prossima azione: approvazione boss + handoff ad Architecture per design tecnico.*
