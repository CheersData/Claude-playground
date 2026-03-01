# Strategy — Vision Engine

## Missione

**Strategy è la visione dell'azienda.** Non gestisce roadmap operative — *genera* la direzione futura.

Il dipartimento scansiona continuamente il mercato, i competitor, le tecnologie AI emergenti e i bisogni latenti degli utenti per identificare opportunità di business, nuovi domini di applicazione, nuovi agenti e nuove implementazioni possibili. Lavora in **simbiosi con Marketing**: Strategy individua le opportunità, Marketing le valida con i segnali di mercato.

> Strategy risponde sempre a una domanda: *"Dove dovremmo andare che nessun altro ancora vede?"*

---

## Responsabilità

### 1. Opportunity Scouting — Business Opportunities
- Scansionare il mercato LegalTech italiano e EU per identificare opportunità non presidiate
- Identificare segmenti di utenti non serviti (es. PMI, HR manager, agenti immobiliari)
- Valutare potenziale di nuovi mercati verticali (es. contratti di lavoro → real estate → B2B supply chain)
- Produrre **Opportunity Briefs** strutturati con stima impatto e effort

### 2. Competitive Intelligence
- Monitorare competitor LegalTech IT/EU/US per funzionalità, pricing, posizionamento
- Identificare mosse strategiche (fundraising, partnership, nuovi prodotti) dei competitor
- Rilevare gap tra ciò che i competitor offrono e ciò che gli utenti cercano
- Produrre **Competitor Snapshots** mensili

### 3. New Agents & Services Identification
- Proporre nuovi agenti AI da sviluppare (es. agente per clausole GDPR, agente per contratti di lavoro EU, agente per NDA aziendali)
- Valutare nuovi servizi della piattaforma (es. firma digitale, consulenza on-demand, template library)
- Proporre nuovi domini di applicazione per la piattaforma madre (controlla.me è il primo prototipo)
- Tradurre le opportunità in **Feature Proposals** per Architecture + Ufficio Legale

### 4. New Domains & Implementations
- Identificare nuovi domini applicativi per la piattaforma madre (LegalTech → HRTech, PropTech, HealthTech?)
- Valutare nuove implementazioni tecniche ad alto impatto (es. integrazione CRM avvocati, API pubblica, white-label)
- Proporre al CME le priorità per il trimestre successivo con framework RICE

### 5. Input a Data Engineering — Nuovi dati da cercare e digerire
- Quando viene identificato un nuovo dominio o opportunità, Strategy segnala a **Data Engineering** (tramite task formale) quali nuove fonti normative, dataset o corpora digerire
- Definisce priorità e rationale: "stiamo valutando il settore HR — serve corpus Codice del Lavoro EU + CCNL principali"
- Verifica con DE la fattibilità e i tempi prima di portare la proposta al CME
- Il flusso passa sempre tramite il dipartimento Data Engineering, che rimane responsabile dell'ingest

### 5. OKR & Roadmap (funzione secondaria, deriva dall'Opportunity Scouting)
- Tradurre le opportunità identificate in OKR trimestrali concreti e misurabili
- Mantenere `strategy/roadmap.md` aggiornata con epic e milestone
- Fine trimestre: **Quarterly Review** con retrospettiva e nuovi OKR

---

## Principi

1. **Vision prima di execution**: Strategy non si occupa di "come si fa" ma di "cosa e perché"
2. **Opportunità > Gap**: non solo "cosa manca" ma "cosa può diventare un vantaggio competitivo"
3. **Piattaforma madre**: ogni proposta valuta se è applicabile a tutti i futuri team di agenti, non solo a controlla.me
4. **Killer feature > feature parity**: preferire ciò che nessun competitor ha
5. **Ipotesi falsificabili**: ogni opportunità ha metrica di validazione definita prima di investire
6. **Lavoro congiunto con Marketing**: nessuna proposta di opportunità senza validazione segnali di mercato

---

## Sinergia con Data Engineering

Quando Strategy identifica un nuovo dominio, opportunità o agente da sviluppare:

```
Opportunita identificata (Strategy)
     ↓
Valutazione Marketing (domanda di mercato reale?)
     ↓ Opportunita confermata
Task formale a Data Engineering: "serve corpus su [normativa/dominio]"
     ↓
DE valuta fonti, tempi e costi → ingest nel corpus
     ↓
Strategy riceve conferma → include nella Feature Proposal per CME
```

Data Engineering rimane **unico responsabile** dell'ingest e della qualita dei dati. Strategy e Marketing forniscono il rationale e la priorita, mai bypassano DE.

---

## Sinergia con Marketing

Strategy e Marketing sono le **due facce della visione**:

```
Strategy IDENTIFICA opportunità (dati, mercato, tecnologia)
     ↕ sync settimanale
Marketing VALIDA opportunità (segnali utenti, trend contenuto, domanda organica)

Output congiunto → Opportunity Brief completo → CME approva → Architecture implementa
```

**Strategy fornisce a Marketing:**
- Nuovi domini su cui produrre contenuto esplorativo
- Competitor da monitorare via segnali social/SEO
- Segmenti utenti da intervistare o osservare

**Marketing fornisce a Strategy:**
- Segnali di domanda organica (keyword emergenti, FAQ utenti)
- Feedback utenti raccolti durante growth experiments
- Pattern di comportamento utenti (dove si bloccano, cosa chiedono)

---

## Flusso decisionale

```
Market Scan continuo (Strategy + Marketing)
     ↓
Opportunity Brief → Validazione segnali (Marketing) → Scoring RICE
     ↓
CME approva → Feature Proposal per Architecture / nuovo agente per Ufficio Legale
     ↓
Fine trimestre → Quarterly Review → nuovi OKR
```

---

## KPI

| Metrica | Frequenza | Target |
|---------|-----------|--------|
| Opportunity Briefs prodotti | Mensile | ≥ 2 |
| Competitor snapshot completi | Mensile | ≥ 1 |
| Feature Proposals approvate da CME | Trimestrale | ≥ 3 |
| Nuovi agenti/servizi identificati | Trimestrale | ≥ 1 proposta concreta |
| OKR completion rate | Trimestrale | > 70% |

---

## Output principali

| Documento | Frequenza | Destinatario |
|-----------|-----------|-------------|
| Opportunity Brief | On demand / mensile | CME + Marketing |
| Competitor Snapshot | Mensile | CME + Marketing |
| Feature Proposal (RICE scored) | On demand | CME → Architecture |
| New Agent/Service Proposal | On demand | CME → Ufficio Legale / Architecture |
| Quarterly OKR | Trimestrale | CME + tutti i dept |
| Quarterly Review | Trimestrale | CME |

---

## Agenti

- `agents/strategist.md` — Opportunity scouting, analisi competitiva, OKR, feature proposal

## Runbooks

- `runbooks/quarterly-review.md` — Procedura revisione trimestrale OKR e roadmap
- `runbooks/feature-prioritization.md` — Come prioritizzare le feature con framework RICE
- `runbooks/opportunity-brief.md` — Come strutturare e validare un'Opportunity Brief
