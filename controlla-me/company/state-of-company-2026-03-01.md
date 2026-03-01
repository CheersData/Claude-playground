# State of the Company — Controlla.me
**Data:** 1 marzo 2026
**Prodotto da:** CME con input di Strategy, Marketing, Architecture, Security
**Classificazione:** INTERNO — MANAGEMENT

---

## 0. REFRAME STRATEGICO — IL PRODOTTO NON È L'ANALISI LEGALE

> *"La parte giuridica è solo un prototipo. Il prodotto è la console."*
> — Boss, 1 marzo 2026

Questo è il frame che Strategy e Marketing hanno mancato, e che cambia completamente l'analisi competitiva.

### Il prodotto reale: console con agenti gerarchici comandabili che si auto-migliorano

Controlla.me non è un tool di analisi contratti. È una **piattaforma di orchestrazione multi-agente** con:

1. **Console operatore** — interfaccia che espone in tempo reale la gerarchia degli agenti, il loro stato, il reasoning, l'output. Nessun competitor consumer o enterprise la ha.
2. **Tier system con N-fallback comandabile in real-time** — l'operatore sceglie il punto di ingresso nella catena (Intern/Associate/Partner), gli agenti scalano automaticamente. Cost/quality tradeoff in tempo reale, via UI.
3. **Toggle agenti individuali** — ogni agente può essere acceso o spento singolarmente. La pipeline si adatta. Nessun concorrente espone questo controllo granulare a livello di UI.
4. **Auto-miglioramento strutturale** — ogni esecuzione arricchisce il vector DB (legal_knowledge). Il sistema diventa più preciso ad ogni analisi completata, senza retraining. Flywheel automatico.
5. **Architettura piattaforma madre** — `lib/ai-sdk/`, `lib/tiers.ts`, `lib/models.ts`, `agent-runner.ts` sono già progettati per essere riusabili su qualsiasi dominio verticale. Il legale è il primo prototipo.

### Chi ha una console come questa?

| Categoria | Player | Console gerarchica comandabile? |
|-----------|--------|--------------------------------|
| LegalTech enterprise | Harvey, Luminance, Spellbook | ❌ Pipeline interna, non esposta |
| LegalTech consumer | Lawhive, DoNotPay, Lexroom | ❌ Black box |
| Multi-agent framework | LangGraph, CrewAI, AutoGen | ❌ Dev tools, nessuna UI operatore |
| Agent platform | AgentOps, Vertex AI Agent Builder | ❌ Dev/cloud tools, non product |
| **Controlla.me** | | ✅ Console UI + tier switch + toggle agenti + auto-improve |

**Nessuno.** Il gap non è di 9-15 mesi sul mercato legale. È un gap di categoria sul mercato delle piattaforme agentiche consumer-facing.

### Implicazione strategica

Il prossimo verticale (HR, real estate, compliance, finance) non richiede riscrivere il prodotto. Richiede:
- Nuovo corpus di dominio (Data Engineering)
- Nuovi prompt agenti (Ufficio Legale del dominio)
- Nuova configurazione in `lib/tiers.ts`

La console, il tier system, il vector DB, l'auto-miglioramento sono già generalizzati. **Ogni nuovo verticale si aggiunge come configurazione, non come startup da zero.**

---

## 1. LEADERSHIP POSITION

### Dove siamo vs il mercato

Il mercato LegalTech AI si divide in 3 segmenti. Noi abitiamo il terzo, praticamente da soli in Italia.

| Segmento | Player principali | Noi |
|----------|------------------|-----|
| Enterprise B2B globale | Harvey ($1B+), Luminance, Lawgeex | Fuori target |
| PMI e professionisti IT | Lexroom (€16.2M Series A, set 2025), LexDo | Mercato adiacente |
| **Consumer B2C italiano** | **Nessuno** | **Noi, da soli** |

**Il mercato sta crescendo**: $6 miliardi raccolti nel LegalTech globale nel 2025. Lawhive (consumer UK) ha chiuso $60M Series B a febbraio 2026. Il proof of concept che il consumer legal AI funziona e raccoglie fondi enormi esiste — ma non è in Italia.

### Siamo ahead of time?

**Sì. Vantaggio stimato: 9-15 mesi sul segmento consumer B2C italiano.**

Il competitor più pericoloso (Lexroom) serve avvocati B2B, non consumatori. Con €16M in cassa potrebbe pivotare in 12-18 mesi. Un player UK/US con funding potrebbe localizzare per l'Italia in 6-9 mesi — ma dovrebbe costruire da zero il corpus normativo italiano (4-6 mesi) e aspettare che la knowledge base si popoli con analisi reali (altri mesi).

### Vantaggio difendibile (moat tecnico reale)

Il vero moat non è la pipeline (replicabile in 12-18 mesi con budget), né il tier system (replicabile in 2-3 mesi). È la combinazione di:

1. **Knowledge base auto-accrescente** — ogni analisi completata arricchisce il vector DB con pattern di clausole, riferimenti normativi verificati, pattern di rischio. Dopo 1000 analisi il sistema conosce i contratti consumer italiani meglio di chiunque. Un competitor parte con corpus freddo.

2. **Corpus legislativo IT+EU con istituti giuridici mappati** — 5.600 articoli, voyage-law-2 (modello specializzato per testi legali), mapping `related_institutes` che collega articoli a istituti giuridici specifici. Difficile da replicare senza mesi di lavoro specializzato.

3. **Prospettiva della parte debole** — nessun competitor analizza il contratto dal punto di vista del consumatore/lavoratore/inquilino. Posizionamento etico e commerciale impossibile da copiare senza riscrivere il prodotto da zero.

### Rischi principali alla leadership

| Rischio | Orizzonte | Gravità |
|---------|-----------|---------|
| **EU AI Act** — sistemi legali = alto rischio, deadline agosto 2026 | **5 mesi** | 🔴 Critico |
| **Lexroom pivot consumer** — €16M in cassa, ha già corpus IT+EU | 12-18 mesi | 🟠 Alto |
| **Big Tech** — Gemini/Copilot aggiungono "analisi contratto" gratis | 6-12 mesi | 🟡 Medio |
| **Corpus stale** — normativa cambia, corpus non si aggiorna automaticamente | Ora | 🟡 Medio |

---

## 2. TECHNICAL DEBT REGISTER

### Debiti critici (si rompono sotto stress)

| # | Problema | Impatto concreto | Soluzione | Effort |
|---|----------|-----------------|-----------|--------|
| **T-01** | Cache su filesystem — rotta in multi-istanza Vercel | Ripresa sessione non funziona, deduplicazione documento KO, progress bar usa dati vuoti, costi API raddoppiano inutilmente | Migrare a Supabase (`analysis_sessions` table) | 1-2 giorni |
| **T-02** | Rate limiting in-memory non distribuito | Bypassabile aprendo N tab parallele su istanze diverse | Redis/Upstash (Vercel KV) | 1 giorno |
| **T-03** | Dashboard usa mock data | Zero conversion free→pro: l'utente non rivede le sue analisi | Query Supabase reali | 2-3 giorni |
| **T-04** | Statuto dei Lavoratori assente dal corpus | Analisi contratti lavoro senza RAG, rischio hallucination normativa | Debug parser AKN (connector già configurato) | 1-2 giorni |
| **T-05** | Investigator non passa per agent-runner | Costi sottostimati nel dashboard (Investigator non loggato in `logAgentCost`) | Refactor | 1 giorno |

### Debiti medi

| # | Problema | Impatto | Priorità |
|---|----------|---------|----------|
| T-06 | Tier in-memory: si resetta ad ogni cold start Vercel | Confusione operativa sulla console | Dopo T-01/T-02 |
| T-07 | Schema DB senza indici su `document_type`, `completed_at` | Query dashboard lente con 10k+ analisi | Prima di traction |
| T-08 | CCNL non presenti nel corpus | Analisi contratti lavoro senza copertura CCNL | 1-2 settimane (nuovo connector CNEL) |

### Decisioni architetturali da prendere ora (non rimandabili)

**D-01: Schema DB per contract monitoring** — Il monitoring contratti attivi è il prodotto che giustifica il canone mensile PMI. Se lo schema non viene deciso ora, con 1000 utenti e dati nel vecchio schema la migrazione è dolorosa. La feature si implementa dopo la traction, ma lo schema si definisce adesso.

**D-02: CCNL — valutare API CNEL** — Non esiste nessun connector per `cnel.it`. Serve analisi delle fonti disponibili e scrittura del connector prima di puntare al segmento lavoratori.

**D-03: Provider lock per PMI** — Prima del lancio del tier PMI, decidere quali provider ricevono dati aziendali e come si implementa il "provider lock" per organizzazioni con requisiti di compliance.

---

## 3. SECURITY RISK REGISTER

### R-01 — EU AI Act (🔴 CRITICO — deadline agosto 2026)

Controlla.me produce output (fairness score, analisi clausole, raccomandazione avvocato) che influenzano decisioni con impatto su diritti delle persone. Profilo compatibile con sistemi ad alto rischio secondo Allegato III del Reg. 2024/1689.

**Gap attuali**: nessun audit log delle decisioni AI, nessun human oversight, nessuna documentazione tecnica ex Art. 11, nessuna information obligation ex Art. 13, nessuna registrazione nel registro EU.

**Rischio se ignoriamo**: sanzioni fino al 3% del fatturato o €15M. Più concreto nel breve: impossibilità di operare nel B2B/PMI — le aziende richiedono conformità EU AI Act come prerequisito contrattuale da metà 2026.

**Piano d'azione**:
- Marzo: consulente legale per classificazione del sistema (alto rischio o rischio limitato)
- Aprile: disclosure utente, pagina "Come funziona l'AI", indicatori di confidenza espliciti
- Aprile-Maggio: audit log strutturato e immutabile di ogni analisi (modello, prompt version, output, timestamp)
- Maggio-Giugno: documentazione tecnica ex Art. 11, registrazione nel registro EU

### R-02 — Data breach: cache e dati sensibili (🟠 ALTO)

I contratti caricati dagli utenti contengono dati personali sensibili (nomi, CF, IBAN, stipendi, indirizzi). Due punti di persistenza problematici:

1. **`.analysis-cache/` su filesystem**: file JSON con testo grezzo dei contratti, senza cifratura at-rest, senza TTL. Restano indefinitamente sul server.
2. **`legal_knowledge` in Supabase**: policy `for select using (true)` — chiunque può leggere tutto, inclusi frammenti di clausole reali che potrebbero contenere dati personali.

**Azioni immediate**:
- Rimuovere `documentTextPreview` dalla cache (non serve a nessuna funzione di business)
- TTL 24h sui file di cache filesystem
- Correggere RLS su `legal_knowledge` (policy selettiva per utente autenticato)
- Implementare job di pulizia `document_chunks` dopo 30 giorni

### R-03 — Data leakage verso provider AI (🟠 ALTO)

**DeepSeek**: server in Cina, non coperto da accordo di adeguatezza EU (a differenza di USA e UK). Il testo dei contratti degli utenti non deve transitarvi. Presenza nel registry è già un rischio: basta che venga aggiunto alla catena di fallback.

**Multi-provider strutturale**: nessun DPA firmato con i provider attuali. Prerequisito GDPR. Per il tier PMI (dati aziendali sensibili) serve un meccanismo di "provider lock" e opzione "EU-only" (Anthropic SCCs + Mistral data center EU).

**Azioni immediate**:
- Rimuovere DeepSeek dalle catene che ricevono dati utenti — 1 giorno
- Firmare DPA con Anthropic, Google, Mistral — 1 settimana

### R-04 — Governance sicurezza assente (🟠 ALTO)

Nessun test, nessuna CI/CD, nessun audit log strutturato, nessun incident response plan, console auth con whitelist hardcoded bypassabile.

**Azioni prioritarie**:
- Fix console auth: da whitelist hardcoded a Supabase auth + role check
- Log strutturato persistente (Axiom, Datadog, o tabella Supabase `audit_log`)
- Incident response plan minimale (1 pagina): chi notifica il Garante Privacy entro 72h in caso di breach?
- Prima del lancio PMI: vulnerability disclosure policy + penetration test esterno (budget: €3-8k)

---

## 4. GOVERNANCE CHARTER

### Principio base

L'azienda deve girare senza che ogni ciclo di lavoro richieda un messaggio esplicito del boss. Il boss partecipa obbligatoriamente solo al ciclo trimestrale. Tutto il resto è autonomo con decision log consultabile.

### Riunioni ricorrenti

| Riunione | Cadenza | Partecipanti | Output | Boss necessario? |
|----------|---------|-------------|--------|-----------------|
| **Daily Standup** | Ogni giorno lavorativo | Operations (host) + tutti i dept head | Task board aggiornato, blockers loggati come task | ❌ No |
| **Weekly Review** | Mercoledì | Tutti i dept head | `company/ops/weekly-YYYY-WNN.md` con decision log | ❌ No (legge il log quando vuole) |
| **Monthly Architecture + Security Review** | Primo lunedì del mese | Architecture (host) + QA + Operations + 1 rep per dept | `company/architecture/review-YYYY-MM.md` con DECISIONS + ESCALATE_TO_BOSS | ❌ No (salvo escalation) |
| **Quarterly Strategy Session** | Primo lunedì del trimestre | Boss (obbligatorio) + Strategy + Finance + Architecture | OKR approvati, roadmap, budget AI | ✅ Sì |

### Trigger automatici per cicli di lavoro (senza ordini espliciti)

Ogni dipartimento avvia lavoro autonomamente quando si verifica un trigger definito:

| Dipartimento | Trigger | Azione automatica |
|-------------|---------|------------------|
| QA | Nuovo file in `app/`, `lib/agents/`, `lib/ai-sdk/` su main | Apre task `[QA] Test coverage review` |
| Data Engineering | Corpus non aggiornato da 30 giorni | Apre task `[DE] Aggiornamento corpus mensile` |
| Architecture | Dipendenza npm con CVE nota | Apre task `[ARCH] Security patch` + convoca review entro 4h |
| Finance | Costo giornaliero API supera soglia | Notifica Operations, apre task `[FIN] Alert costi` |
| Operations | Nessun task completato in un dept per 5 giorni | Apre task `[OPS] Dept inattivo: <dept>` |
| Security | Credenziale esposta in commit | Escalation immediata + invalidazione credenziale |

### Matrice autonomia dipartimentale

| Dipartimento | Decide autonomamente | Deve escalare al boss |
|-------------|---------------------|----------------------|
| QA | Scrivere test, aprire bug report, bloccare deploy | Rimuovere una suite di test |
| Data Engineering | Aggiornare corpus esistente, correggere parser, rilanciare sync | Nuova fonte non pianificata, budget crawler >€50 |
| Architecture | Aggiornare dipendenze patch/minor, refactor interno, scrivere ADR | Breaking changes API, nuova dipendenza major, cambio provider AI principale |
| Finance | Monitorare costi, produrre report | Cambiare piano Supabase/Vercel, spesa >€100 non pianificata |
| Security | Patch vulnerabilità note, aggiornare dipendenze sicurezza | Incident di sicurezza con dati utenti, notifica Garante |
| Marketing | Analisi competitor, market intelligence, bozze copy | Pubblicare contenuti, campagne a pagamento |
| Strategy | Ricercare opportunità, produrre analisi, proporre OKR | Approvare OKR, cambiare posizionamento prodotto |
| Ufficio Legale | Validare output agenti, segnalare errori normativi, proporre fix prompt | Modificare prompt di produzione |

### Review accelerata per cambiamenti tecnici rilevanti

Un cambiamento richiede review Architecture + Security **prima del deploy** se tocca: `lib/middleware/`, `supabase/migrations/`, `lib/models.ts`, `lib/tiers.ts`, nuove route API, variabili d'ambiente.

Il dept apre task `[ARCH-REVIEW]`. Architecture ha **24 ore** per rispondere — silenzio = approvazione. Security blocca senza silenzio-assenso in caso di vulnerabilità.

---

## 5. NEXT ACTIONS

| # | Azione | Owner | Deadline | Bloccante per |
|---|--------|-------|----------|---------------|
| **A-01** | Rimuovere DeepSeek dalle catene fallback con dati utenti | Architecture | Questa settimana | GDPR compliance |
| **A-02** | Migrare cache da filesystem a Supabase | Architecture | Entro 2 settimane | PMF, costi API |
| **A-03** | Rate limiting su Redis/Vercel KV | Architecture | Entro 2 settimane | Security R-04 |
| **A-04** | Dashboard reale con query Supabase | Architecture | Entro 2 settimane | Conversion free→pro |
| **A-05** | Ingaggiare consulente legale EU AI Act | CME | Entro 1 settimana | EU AI Act compliance |

---

*Documento prodotto dalla riunione del 1 marzo 2026. Prossima revisione: Quarterly Strategy Session — primo lunedì di giugno 2026.*
