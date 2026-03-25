# Strategy — Vision Navigator

## Missione

Tracciare e proteggere la rotta verso la visione Poimandres. Definire milestone, misurare distanza dall'obiettivo, correggere deviazioni. Il mercato è un segnale, non la destinazione.

Il dipartimento mantiene la bussola dell'azienda puntata verso Poimandres.work: la piattaforma dove creator e developer costruiscono i propri team di agenti AI. Ogni decisione, ogni verticale, ogni funzionalità viene valutata in base a quanto avvicina o allontana da quella destinazione. Lavora in **simbiosi con Marketing**: Strategy definisce la rotta, Marketing raccoglie i segnali dal terreno per calibrarla.

> Strategy risponde sempre a una domanda: *"Ci stiamo avvicinando a Poimandres, o ci stiamo perdendo?"*

---

## Responsabilità

### 1. Rotta e Milestone — Navigazione verso Poimandres
- Definire e mantenere le **5 milestone** concrete verso Poimandres.work operativo
- Misurare la distanza dall'obiettivo per ogni milestone (% completamento, blockers, dipendenze)
- Rilevare deviazioni dalla rotta e proporre correzioni immediate
- Produrre **Route Reports** strutturati con stato milestone, deviazioni rilevate e azioni correttive

### 2. Readiness Assessment — Preparazione per Creator
- Valutare lo stato di preparazione della piattaforma per onboarding di creator e developer
- Identificare gap critici tra lo stato attuale e ciò che serve per un MVP Poimandres utilizzabile
- Definire criteri di "readiness" misurabili per ogni milestone
- Produrre **Readiness Snapshots** con gap analysis e priorità di intervento

### 3. Segnali di Mercato — Bussola, non Destinazione
- Osservare competitor e mercato AI platform come **segnali di rotta**, non come obiettivi da imitare
- Identificare movimenti nel mercato che confermano o mettono in discussione la direzione Poimandres
- Rilevare tecnologie emergenti che possono accelerare o bloccare il percorso
- Tradurre i segnali in **correzioni di rotta** concrete, mai in "inseguimenti" di competitor

### 4. Gap Analysis e Correzioni
- Mappare la distanza tra visione Poimandres e stato attuale dell'infrastruttura
- Identificare i gap critici che bloccano il progresso verso le milestone
- Proporre al CME le priorità di intervento con framework impatto-su-milestone
- Coordinare con Architecture le soluzioni tecniche per colmare i gap

### 5. Input a Data Engineering — Dati necessari per la rotta
- Quando una milestone richiede nuovi dati o corpus, Strategy segnala a **Data Engineering** (tramite task formale) quali fonti servono
- Definisce priorità e rationale: "milestone 3 richiede corpus per vertical X — serve ingest di [fonte]"
- Verifica con DE la fattibilità e i tempi prima di portare la proposta al CME
- Il flusso passa sempre tramite il dipartimento Data Engineering, che rimane responsabile dell'ingest

### 6. OKR & Roadmap — Derivano dalle Milestone
- Tradurre le milestone Poimandres in OKR trimestrali concreti e misurabili
- Mantenere `strategy/roadmap.md` aggiornata con epic e milestone
- Fine trimestre: **Quarterly Review** con retrospettiva su avanzamento verso la visione

---

## Principi

1. **Visione prima di mercato**: la destinazione è Poimandres, il mercato è la bussola — non il contrario
2. **Milestone misurabili**: ogni passo verso la visione ha criteri oggettivi di completamento
3. **Piattaforma madre**: ogni proposta valuta se avvicina a Poimandres.work (piattaforma multi-team per creator)
4. **Correzione continua**: rilevare deviazioni presto costa meno che correggerle tardi
5. **Ipotesi falsificabili**: ogni milestone ha metrica di validazione definita prima di investire
6. **Lavoro congiunto con Marketing**: i segnali di mercato calibrano la rotta, non la cambiano

---

## Sinergia con Data Engineering

Quando una milestone richiede nuovi dati o corpus:

```
Milestone definita (Strategy)
     ↓
Gap analysis: "per questa milestone serve [dato/corpus/verticale]"
     ↓
Task formale a Data Engineering: "serve corpus su [normativa/dominio]"
     ↓
DE valuta fonti, tempi e costi → ingest nel corpus
     ↓
Strategy riceve conferma → aggiorna stato milestone
```

Data Engineering rimane **unico responsabile** dell'ingest e della qualità dei dati. Strategy fornisce il rationale legato alla visione, mai bypassa DE.

---

## Sinergia con Marketing

Strategy e Marketing sono le **due facce della navigazione**:

```
Strategy DEFINISCE la rotta (milestone, gap, correzioni)
     ↕ sync settimanale
Marketing RACCOGLIE segnali dal terreno (utenti, trend, domanda organica)

Output congiunto → Route Report calibrato → CME approva → Architecture implementa
```

**Strategy fornisce a Marketing:**
- Direzione della visione per allineare la comunicazione
- Milestone imminenti su cui preparare contenuto e posizionamento
- Gap da validare con segnali di mercato reali

**Marketing fornisce a Strategy:**
- Segnali di domanda organica che confermano o contraddicono la rotta
- Feedback creator/developer raccolti durante growth experiments
- Pattern di comportamento utenti che indicano readiness o resistenza

---

## Flusso decisionale

```
Visione Poimandres (stella polare)
     ↓
Milestone assessment continuo (Strategy)
     ↓
Gap analysis + segnali mercato (Marketing) → Correzione rotta
     ↓
CME approva → Architecture implementa / dipartimenti eseguono
     ↓
Fine trimestre → Quarterly Review → aggiornamento milestone e OKR
```

---

## KPI

| Metrica | Frequenza | Target |
|---------|-----------|--------|
| Milestone avanzamento (% completamento) | Settimanale | progresso misurabile |
| Readiness Snapshot prodotti | Mensile | ≥ 1 |
| Gap critici identificati e risolti | Trimestrale | ≥ 3 risolti |
| Deviazioni rilevate e corrette | Continuo | < 1 settimana per correzione |
| OKR completion rate | Trimestrale | > 70% |

---

## Output principali

| Documento | Frequenza | Destinatario |
|-----------|-----------|-------------|
| Route Report (stato milestone + deviazioni) | Settimanale / on demand | CME + Marketing |
| Readiness Snapshot (gap analysis creator) | Mensile | CME + Architecture |
| Correzione di Rotta (segnali + azioni) | On demand | CME → dipartimenti coinvolti |
| Quarterly OKR (derivati da milestone) | Trimestrale | CME + tutti i dept |
| Quarterly Review | Trimestrale | CME |

---

## Agenti

- `agents/strategist.md` — Navigazione verso Poimandres, milestone tracking, gap analysis, readiness assessment

## Runbooks

- `runbooks/quarterly-review.md` — Procedura revisione trimestrale OKR e avanzamento milestone
- `runbooks/feature-prioritization.md` — Come prioritizzare interventi per impatto su milestone
- `runbooks/opportunity-brief.md` — Come strutturare e validare correzioni di rotta

---

## Visione (6 mesi)

Poimandres.work come piattaforma operativa con almeno 1 verticale attivo per creator. Le 5 milestone definite e tracciate, con readiness assessment continuo. Controlla.me evoluto da prototipo a primo verticale della piattaforma madre.

## Priorità operative (ordinate)

1. **[P0] 5 milestone verso Poimandres.work operativo** — definire 5 milestone concrete verso la piattaforma Poimandres operativa
2. **[P1] Misurare readiness piattaforma per creator** — valutare stato di preparazione per onboarding creator/developer
3. **[P2] Identificare gap critici** — mappare distanza tra visione e stato attuale, identificare e correggere deviazioni

## Autonomia

- **L1 (auto)**: milestone tracking, readiness assessment, segnali di mercato come bussola, gap analysis, OKR draft
- **L2+ (escalation)**: cambio milestone (L2 CME), proposta nuovo verticale (L3 boss), cambio rotta strategica
