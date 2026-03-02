# POIMANDRES — Analisi Ristrutturazione Organizzativa

**Data:** 2026-03-02
**Richiesto da:** Boss
**Analisti:** CME + Architecture + Strategy + Security
**Status:** Analisi completa — in attesa approvazione boss

---

## EXECUTIVE SUMMARY

Il boss ha richiesto una ristrutturazione profonda dell'organizzazione Poimandres su **9 assi**. L'analisi coinvolge Architecture (fattibilita tecnica), Strategy (impatto strategico) e Security (rischi). Il documento presenta ogni richiesta con valutazione, proposta implementativa, effort stimato e dipendenze.

**Stato attuale:** 27 agenti su 11 dipartimenti. 216 task completati. Infrastruttura funzionante ma con gap critici su governance, autonomia dei dipartimenti e pianificazione strategica.

**Investimento totale stimato:** 6-8 settimane di sviluppo, distribuite su 3 fasi.

---

## INDICE RICHIESTE

| # | Richiesta | Priorita | Effort | Fase |
|---|-----------|----------|--------|------|
| R1 | Dipartimento Protocolli | ALTA | 1 settimana | 1 |
| R2 | Information retrieval veloce per leader | ALTA | 1 settimana | 1 |
| R3 | Agente ottimizzazione prompt | MEDIA | 3 giorni | 2 |
| R4 | Agenti specializzati per dipartimento | MEDIA | 1 settimana | 2 |
| R5 | CME solo dispatcher + builder dipartimentali | ALTA | 1 settimana | 1 |
| R6 | Company Scheduler evoluto (vision-driven) | ALTA | 2 settimane | 2 |
| R7 | Interfaccia Vision/Mission | MEDIA | 3 giorni | 1 |
| R8 | Piano approval workflow | MEDIA | Gia parziale | 1 |
| R9 | Migrazione VM (always-on) | BASSA | 1 giorno setup | 3 |

---

## R1 — DIPARTIMENTO PROTOCOLLI

### Richiesta
Creare un dipartimento dedicato al controllo della comunicazione interna. Deve creare un albero di decisione, gestire il processo di approvazione/decisione e task creation.

### Stato attuale
Esiste gia `company/process-designer.md` che svolge parte di questa funzione:
- Definisce 17 flussi autorizzati tra dipartimenti (`contracts.md`)
- Vieta dipendenze circolari
- Richiede che tutto passi via task system

**Gap:** Process Designer e un documento statico, non un dipartimento operativo con agente e runbook.

### Valutazione Architecture
**Raccomandazione: EVOLUZIONE, non nuovo dipartimento.**

Creare un nuovo dipartimento aggiunge complessita organizzativa. Meglio **potenziare il Process Designer** trasformandolo in un dipartimento leggero con:
- 1 agente: `protocol-enforcer` — valida ogni task cross-dipartimento
- 1 albero decisionale codificato: `company/protocols/decision-tree.md`
- 1 runbook: come gestire richieste che toccano piu dipartimenti

### Valutazione Strategy
Un dipartimento protocolli e un **differenziatore** per Poimandres come piattaforma: dimostra governance enterprise-grade. Se Poimandres diventa B2B, i clienti enterprise vorranno vedere processi di governance. Raccomandazione: **GO, ma lightweight**.

### Valutazione Security
Positivo per security: ogni decisione tracciata = audit trail migliore. Raccomandazione: il protocol-enforcer deve loggare ogni decisione nel task system con `decision_rationale`.

### Proposta implementativa

**Nuovo dipartimento: `company/protocols/`**

```
company/protocols/
├── department.md              # Missione: governance comunicazione
├── decision-tree.md           # Albero decisionale master
├── agents/
│   └── protocol-enforcer.md   # Agente che valida flussi
└── runbooks/
    ├── route-request.md       # Come instradare una richiesta
    ├── escalation.md          # Quando escalare al boss
    └── cross-dept-collab.md   # Come gestire task multi-dipartimento
```

**Albero decisionale proposto:**

```
Nuova richiesta
  |
  ├── Tocca 1 solo dipartimento?
  |     ├── SI → CME assegna direttamente
  |     └── NO → Protocol-enforcer identifica dipartimenti coinvolti
  |               ├── Serve decisione architetturale?
  |               |     ├── SI → Architecture propone → CME approva → implementa
  |               |     └── NO → CME crea task paralleli con dipendenze esplicite
  |               └── Serve budget/costi?
  |                     ├── SI → Finance valuta prima
  |                     └── NO → procedi
  |
  ├── E una nuova feature?
  |     └── Strategy valuta → Marketing valida → Architecture progetta → CME approva
  |
  ├── E un fix/bug?
  |     └── Dipartimento competente → QA valida → done
  |
  ├── Tocca security/dati sensibili?
  |     └── Security review obbligatoria prima dell'implementazione
  |
  └── Tocca i prompt degli agenti?
        └── Ufficio competente (Legale/Trading) + QA valida output
```

### Effort: 1 settimana
### Dipendenze: nessuna

---

## R2 — INFORMATION RETRIEVAL VELOCE PER LEADER

### Richiesta
I leader di dipartimento devono poter contribuire alle decisioni senza dover rileggere tutto il codice. Serve un modo per reperire info velocemente.

### Stato attuale
Ogni leader ha il suo `department.md` e `agents/*.md`, ma per rispondere a domande specifiche su stato del codice, tech debt o dipendenze deve leggere file sparsi. Nessun sistema di knowledge retrieval strutturato.

### Valutazione Architecture
**Tre opzioni valutate:**

| Opzione | Pro | Contro | Effort |
|---------|-----|--------|--------|
| A. **Department Context Files** | Semplice, zero infra | Manuale, rischio stale | 2 giorni |
| B. **Auto-generated dept summaries** | Sempre aggiornato | Richiede script + manutenzione | 1 settimana |
| C. **Codebase RAG per agenti** | Query in linguaggio naturale | Complesso, costo embedding | 2+ settimane |

**Raccomandazione Architecture: Opzione A + B ibrida.**

Per ogni dipartimento, mantenere un file `state.md` auto-generato dai daily controls:

```
company/<dept>/state.md
```

Contenuto generato automaticamente:
- File di competenza del dipartimento (glob patterns)
- Ultimi 5 task completati con summary
- Tech debt aperti che lo riguardano
- Metriche chiave (coverage test, costi API, articoli corpus...)

Il leader legge `department.md` + `state.md` e ha il 90% del contesto necessario in < 30 secondi.

### Valutazione Strategy
L'opzione C (Codebase RAG) e strategicamente interessante per Poimandres come prodotto B2B — ma overkill per le esigenze attuali. Raccomandazione: partire con A+B, valutare C quando si scala a 50+ agenti.

### Valutazione Security
`state.md` non deve contenere secret, API key o dati sensibili. Solo metriche aggregate e riferimenti a file. **OK**.

### Proposta implementativa

1. **Estendere `daily-controls.ts`** per generare `state.md` per ogni dipartimento
2. **Template `state.md`:**

```markdown
# {Department} — Stato al {data}
## File di competenza
- lib/agents/*.ts (7 file, ultimo modifica: 2026-03-01)
- lib/prompts/*.ts (6 file)

## Ultimi task completati
- [TASK-189] Revisione prompt analyzer — "Aggiunto scoring multidimensionale"
- [TASK-185] Fix rate limit investigator — "Retry 60s + fallback chain"

## Tech debt aperti
- TD-2: global mutable state in tiers.ts (effort: basso)

## Metriche
- Test coverage: 73% (target: 80%)
- API cost 7gg: $0.31
```

3. **Aggiornamento a `cme.md`**: prima di delegare a un dipartimento, CME legge `state.md`

### Effort: 1 settimana (script generazione + template per 11 dipartimenti)
### Dipendenze: R1 (albero decisionale definisce chi consulta cosa)

---

## R3 — AGENTE OTTIMIZZAZIONE PROMPT

### Richiesta
Un agente che rivede e ottimizza i prompt degli altri agenti, allineandoli con obiettivi del boss e best recommendation.

### Stato attuale
I prompt sono in `lib/prompts/*.ts` (6 file) + prompt trading in Python. Nessun processo di review sistematico — le modifiche passano da Ufficio Legale + QA manualmente.

### Valutazione Architecture

**Proposta: `prompt-optimizer` agent nel dipartimento Protocols**

L'agente NON modifica i prompt automaticamente. Il flusso:

```
1. Trigger: richiesta manuale o scheduled (mensile)
2. prompt-optimizer legge:
   - Tutti i prompt attuali (lib/prompts/*.ts)
   - Vision/Mission corrente (company/vision.md)
   - Ultime raccomandazioni del boss
   - Metriche di output degli agenti (accuracy, token usage, errori)
3. Produce un Prompt Review Report:
   - Allineamento con obiettivi: OK/WARN per ogni prompt
   - Suggerimenti di ottimizzazione
   - Token waste identificato
   - Inconsistenze tra agenti
4. Report → CME → Ufficio competente implementa
```

**Vincolo critico (Architecture):** L'agente analizza, NON modifica. Le modifiche ai prompt restano competenza dell'ufficio proprietario (Legale per agenti legali, Trading per agenti trading).

### Valutazione Strategy
Alto valore strategico: prompt drift e un rischio reale quando gli agenti crescono. Un reviewer sistematico previene degradazione. Raccomandazione: **GO, ma post-R1 e R7** (serve vision/mission come input).

### Valutazione Security
I prompt contengono istruzioni sensibili (output format, vincoli legali). Il prompt-optimizer deve avere accesso read-only ai prompt. I report NON devono essere esposti via API pubblica.

### Proposta implementativa

```
company/protocols/agents/prompt-optimizer.md  # Identity card
company/protocols/runbooks/prompt-review.md   # Procedura review
```

**Output del prompt-optimizer:**

```markdown
# Prompt Review Report — {data}

## Allineamento Vision/Mission
- Vision: "Piattaforma multi-agente per analisi documentale"
- Classifier: ALLINEATO — identifica tipo documento
- Analyzer: WARN — non menziona scoring multidimensionale (obiettivo Q1)
- Investigator: ALLINEATO

## Ottimizzazioni suggerite
- Advisor: rimuovere 340 token di istruzioni ridondanti (risparmio ~15%)
- Corpus Agent: aggiungere istruzione su nuove fonti EU (aggiornamento corpus)

## Metriche
- Token medi per agente: Classifier 1.2K, Analyzer 3.8K, Investigator 4.1K, Advisor 2.9K
- Errori JSON parse ultimi 30gg: 3 (tutti su Investigator)
```

### Effort: 3 giorni
### Dipendenze: R7 (vision/mission), R1 (protocolli)

---

## R4 — AGENTI SPECIALIZZATI PER DIPARTIMENTO

### Richiesta
Ogni dipartimento deve avere agenti specializzati, non tutto in un unico prompt. Identificare con i leader quali agenti servono e definire con Protocolli come vengono ingaggiati.

### Stato attuale

| Dipartimento | Agenti attuali | Gap |
|-------------|---------------|-----|
| Ufficio Legale | 7 | Completo |
| Trading | 7 | Completo |
| Data Engineering | 2 | OK |
| Architecture | 2 | Manca: **tech-debt-tracker** |
| QA | 1 | Manca: **e2e-runner** (separato da unit-tester) |
| Security | 1 | Manca: **dependency-scanner** (CVE check) |
| Finance | 1 | OK — unico focus |
| Operations | 2 | OK |
| Marketing | 2 | OK |
| Strategy | 1 | OK — unico focus |
| UX/UI | 1 | OK |

### Valutazione Architecture

**Principio: aggiungere agenti solo dove c'e un task ripetitivo distinto.**

Non serve un agente per ogni micro-compito. Serve quando:
1. Il task e ricorrente (almeno settimanale)
2. Richiede contesto specializzato diverso dal leader
3. Il leader attuale e sovraccarico (troppe responsabilita)

**Agenti proposti (3 nuovi):**

| Agente | Dipartimento | Giustificazione |
|--------|-------------|-----------------|
| `tech-debt-tracker` | Architecture | Monitora tech debt register, verifica se i fix sono stati implementati, segnala scadenze |
| `e2e-test-runner` | QA | Specializzato in Playwright E2E — separato dal unit test runner (Vitest) |
| `dependency-auditor` | Security | Scansione CVE, audit `package.json` + `pyproject.toml`, segnala vulnerabilita |

### Valutazione Strategy
3 nuovi agenti e ragionevole. Non superare 30 agenti totali senza valutare il costo di coordinamento.

### Protocollo di ingaggio (da R1)

Ogni agente ha nel suo `agent.md`:
- **Trigger**: quando viene attivato (manuale, scheduled, evento)
- **Input**: cosa riceve (task, file, contesto)
- **Output**: cosa produce (report, fix, task)
- **Escalation**: a chi segnala problemi

```
Richiesta → Protocol-enforcer identifica agente competente
  → CME assegna task all'agente
  → Agente produce output
  → Leader di dipartimento valida
  → Done
```

### Effort: 1 settimana (3 identity card + runbook ingaggio)
### Dipendenze: R1 (protocollo ingaggio)

---

## R5 — CME SOLO DISPATCHER + BUILDER DIPARTIMENTALI

### Richiesta
CME deve essere solo smistatore, non implementatore. Ogni dipartimento deve avere i propri builder (leader con Opus o agente dedicato).

### Stato attuale
CME oggi fa **entrambe le cose**: smista task E li implementa personalmente leggendo `department.md` + runbook. Questo crea un bottleneck — tutto passa da CME.

### Valutazione Architecture

**Proposta: separazione CME (coordinator) / Department Builder (executor)**

```
PRIMA (attuale):
Boss → CME → [legge dept.md + runbook] → implementa → QA

DOPO (proposto):
Boss → CME → [crea task] → Dept Leader Builder → implementa → QA → CME verifica
```

**Come funziona tecnicamente:**

Ogni dipartimento ha un **builder agent** definito nel suo `department.md`:

```markdown
## Builder
- **Modello**: opus (per task complessi) / sonnet (per task standard)
- **Contesto**: department.md + state.md + runbook pertinente
- **Autonomia**: puo implementare senza chiedere a CME
- **Escalation**: se il task tocca altri dipartimenti → segnala a CME
```

**In pratica (nell'ambiente Claude Code attuale):**
CME rimane l'unica sessione Claude Code. Ma il pattern cambia:

1. CME legge solo il task + il `department.md`
2. CME "indossa il cappello" del leader di dipartimento
3. Implementa seguendo il runbook del dipartimento
4. Verifica come CME (non come builder)

Questo e gia il pattern attuale, ma va **formalizzato**:
- CME NON decide *come* implementare — il runbook decide
- CME NON scrive codice "a braccio" — segue procedure documentate
- Se il runbook non copre il caso → Architecture crea prima il runbook

**In futuro (con VM always-on, R9):**
Ogni dipartimento potrebbe avere una sessione Claude Code dedicata (sub-agent), realmente autonoma. Il task system diventa il bus di comunicazione.

### Valutazione Strategy
Critico per scalabilita. Oggi CME e il collo di bottiglia. La formalizzazione dei builder rende l'organizzazione parallelizzabile. Prerequisito per Poimandres B2B.

### Valutazione Security
I builder devono avere permessi limitati ai file di competenza del dipartimento. Non devono poter modificare file di altri dipartimenti senza review di Protocol-enforcer.

### Proposta implementativa

1. Aggiornare `cme.md`: rimuovere la parte "implementa" → solo dispatch + verify
2. Aggiornare ogni `department.md`: aggiungere sezione `## Builder` con autonomia e vincoli
3. Regola: se un runbook non esiste per un task → prima crearlo, poi eseguire

### Effort: 1 settimana (aggiornamento 11 department.md + cme.md + protocolli)
### Dipendenze: R1 (protocolli definiscono i confini), R2 (state.md per contesto builder)

---

## R6 — COMPANY SCHEDULER EVOLUTO

### Richiesta
Lo scheduler deve:
- Essere company-wide (non solo trading)
- Lanciare attivita basate su visione/missione corrente
- Usare best recommendation del piano precedente
- Ogni piano deve chiudersi con raccomandazioni
- I piani devono essere approvati dal boss

### Stato attuale (gap analysis dettagliata)

| Aspetto | Stato | Gap |
|---------|-------|-----|
| Company-wide | Parziale — copre tutti i dept ma il contesto e superficiale | Non legge Strategy/Marketing/tech debt |
| Vision-driven | NO — il piano e reattivo al board state | Nessun input da vision/mission |
| Recommendation carry-forward | NO — ogni piano parte da zero | Nessuna persistenza raccomandazioni |
| Piano con raccomandazioni finali | NO — il piano e solo lista task | Manca sezione "raccomandazioni per il prossimo ciclo" |
| Approvazione boss | SI (Telegram) — ma all-or-nothing | Gia funzionante, migliorabile |

### Valutazione Architecture

**Proposta: Scheduler V2 — Strategy-Driven Planning Engine**

```
INPUT ATTUALE:
  Board state + interview answers + trading status

INPUT V2 (aggiuntivo):
  + company/vision.md              # Visione e missione corrente
  + company/strategy/roadmap.md    # OKR trimestrali
  + company/<dept>/state.md        # Stato per dipartimento (da R2)
  + Raccomandazioni piano precedente (da daily-plans/)
  + Tech debt register (da CLAUDE.md o dedicated file)
  + Security risk register
```

**Struttura piano V2:**

```markdown
# Piano di Lavoro #{N} — {data}

## Contesto strategico
- Vision: {vision corrente}
- Mission: {mission corrente}
- Focus trimestre: {OKR attivi}

## Analisi stato
- Dipartimenti attivi: {N}/{totale}
- Tech debt critico: {lista}
- Risk aperti: {lista}

## Task proposti
1. [DEPT] Task — priorita — rationale (collegamento a OKR/vision)
2. ...

## Raccomandazioni per il prossimo ciclo
- Se {condizione} → suggerisco {azione}
- Attenzione a {rischio} — monitorare {metrica}
- Opportunita: {segnale di mercato} → valutare con Strategy

## Carry-forward da piano precedente
- [COMPLETATO] Task X
- [NON COMPLETATO] Task Y — motivo: {blocco} → riproposto
- [ESCALATION] Raccomandazione Z non attuata per 3 cicli → serve decisione boss
```

**Meccanismo carry-forward:**

Il piano precedente viene letto e analizzato:
1. Task completati → log
2. Task non completati → riproposti con priorita aumentata
3. Raccomandazioni ignorate per 3+ cicli → escalation automatica al boss
4. Raccomandazioni attuate → feedback positivo (il sistema impara)

### Valutazione Strategy
Questo e il cuore della ristrutturazione. Uno scheduler vision-driven trasforma Poimandres da "task runner reattivo" a "organizzazione goal-oriented". Alto impatto strategico. **Prerequisito: R7 (vision/mission interface)**.

### Valutazione Security
Il piano contiene informazioni strategiche sensibili (OKR, tech debt, rischi). Non deve essere accessibile via API pubblica. Telegram con HTTPS e sufficiente per l'approvazione.

### Effort: 2 settimane
### Dipendenze: R7 (vision/mission), R2 (state.md), R1 (protocolli)

---

## R7 — INTERFACCIA VISION/MISSION

### Richiesta
Avere un posto dove scrivere visione e missione corrente, consultabile da tutti i dipartimenti e dallo scheduler.

### Stato attuale
Non esiste un file `vision.md` o equivalente. La visione e dispersa tra `cme.md`, `strategy/department.md` e report trimestrali.

### Valutazione Architecture

**Proposta: file `company/vision.md` + comando Telegram per aggiornamento**

```markdown
# Poimandres — Visione e Missione

## Visione (dove vogliamo arrivare)
{Testo libero del boss — aggiornato quando cambia}

## Missione (cosa facciamo oggi per arrivarci)
{Testo libero del boss — aggiornato quando cambia}

## Focus corrente (cosa e prioritario adesso)
{Testo libero del boss — cambia piu spesso}

## Principi non negoziabili
{Lista di vincoli che non cambiano — es. "risk management trading NON negoziabile"}

## Ultimo aggiornamento
{data} — aggiornato dal boss via {canale}
```

**Due modalita di aggiornamento:**

1. **Telegram**: comando `/visione {testo}` o `/missione {testo}` → aggiorna il file
2. **Manuale**: il boss modifica direttamente `company/vision.md`

**Consumatori:**
- Scheduler V2 (R6) — legge vision/mission per generare piani allineati
- Prompt-optimizer (R3) — verifica allineamento prompt con visione
- Strategy — usa come bussola per opportunity scouting
- CME — riferimento per ogni decisione

### Effort: 3 giorni (file + comandi Telegram + integrazione scheduler)
### Dipendenze: nessuna (puo partire subito)

---

## R8 — PIANO APPROVAL WORKFLOW

### Richiesta
Ogni piano deve essere inviato al boss e approvato.

### Stato attuale
**Gia implementato parzialmente.** Il scheduler daemon ha:
- Generazione piano via `claude -p`
- Invio su Telegram con bottoni Approva/Modifica/Annulla
- Creazione task automatica post-approvazione

### Gap residui

| Gap | Soluzione |
|-----|-----------|
| Approvazione all-or-nothing | Aggiungere bottone "Approva parziale" → boss seleziona task da approvare |
| Piano non salvato se rifiutato | Salvare anche i piani rifiutati in `daily-plans/` con tag `[REJECTED]` |
| Nessun feedback su piani passati | Aggiungere sezione "lessons learned" nel piano successivo |
| Boss non puo modificare singoli task | Aggiungere `/modifica {task_id} {nuova_priorita}` su Telegram |

### Valutazione Architecture
I gap sono miglioramenti incrementali allo scheduler esistente. Non serve riscrivere — bastano estensioni al daemon.

### Effort: incluso in R6 (scheduler V2)
### Dipendenze: R6

---

## R9 — MIGRAZIONE VM (ALWAYS-ON)

### Richiesta
Valutare la possibilita di spostare tutta la soluzione su una VM per essere sempre operativi da ovunque. Costi e fattibilita.

### Analisi costi

| Provider | Spec VM | Prezzo/mese | Note |
|----------|---------|-------------|------|
| **Hetzner Cloud** | CX31: 4 vCPU, 8GB RAM, 80GB SSD | ~€14/mese | GDPR EU, miglior rapporto prezzo/perf |
| **Hetzner Cloud** | CX41: 8 vCPU, 16GB RAM, 160GB SSD | ~€28/mese | Per build + test paralleli |
| AWS EC2 | t3.large: 2 vCPU, 8GB RAM | ~$60/mese | 4-6x piu costoso di Hetzner |
| Azure | B2ms: 2 vCPU, 8GB RAM | ~$70/mese | 5-10x piu costoso di Hetzner |
| DigitalOcean | 4 vCPU, 8GB RAM | ~$48/mese | Buon compromesso US |

### Valutazione Architecture

**Fattibilita: ALTA.** Lo stack e standard (Node.js + Python + PostgreSQL via Supabase cloud).

**Cosa serve sulla VM:**
- Node.js 18+ (Next.js app + scripts company)
- Python 3.11+ (trading)
- Claude CLI (`claude`) installato e autenticato
- Git per pull/push
- PM2 o systemd per processi persistenti
- Scheduler daemon come servizio

**Cosa NON va sulla VM:**
- Supabase (resta cloud — gestione DB managed e meglio)
- Stripe webhooks (restano su Vercel o redirect)
- Frontend Next.js in produzione (resta su Vercel — CDN + edge)

**Architettura proposta:**

```
[Vercel] ← Frontend Next.js + API routes (produzione)
    |
[Hetzner VM] ← Scheduler daemon + company scripts + trading pipeline
    |
[Supabase Cloud] ← Database condiviso
```

La VM e il **back-office operativo**: scheduler, daily controls, trading pipeline, batch jobs.
Il frontend resta su Vercel per performance e CDN globale.

### Valutazione Strategy
Una VM always-on abilita:
- Trading pipeline 24/7 (pre-market scan automatico)
- Scheduler daemon sempre attivo (niente piu avvio manuale)
- Daily controls automatici senza intervento umano
- Possibilita di sessioni Claude Code dedicate per dipartimento (futuro)

**ROI**: €14-28/mese per avere un'organizzazione autonoma 24/7. Altamente giustificato.

### Valutazione Security

| Rischio | Mitigazione |
|---------|-------------|
| VM esposta a internet | Firewall: solo SSH (chiave, no password) + HTTPS in uscita |
| Secret sulla VM | `.env` con permessi 600, mai in git |
| Accesso non autorizzato | SSH key-only + fail2ban + no root login |
| Data in transito | HTTPS per tutte le API (Supabase, Stripe, provider AI) |
| Backup | Hetzner snapshot automatici (€0.01/GB/mese) |

**Raccomandazione Security: OK con mitigazioni standard.**

### Effort: 1 giorno setup (provisioning + deploy scripts + systemd services)
### Dipendenze: nessuna (indipendente, puo partire in qualsiasi momento)

---

## PIANO DI IMPLEMENTAZIONE

### Fase 1 — Fondamenta (settimana 1-2)

| Task | Dipartimento | Priorita | Dipende da |
|------|-------------|----------|------------|
| R7: Creare `company/vision.md` + comandi Telegram | Architecture | ALTA | — |
| R1: Creare `company/protocols/` + decision tree | Architecture + Process Designer | ALTA | — |
| R5: Aggiornare `cme.md` (dispatcher only) + 11 `department.md` (builder section) | Architecture + CME | ALTA | R1 |
| R2: Script generazione `state.md` per dipartimenti | Architecture + Operations | ALTA | — |
| R8: Miglioramenti approval workflow (incluso in scheduler) | Architecture | MEDIA | R7 |

**Output Fase 1:** Governance definita, CME e dispatcher, dipartimenti hanno builder e state.md.

### Fase 2 — Scheduler V2 + Agenti (settimana 3-5)

| Task | Dipartimento | Priorita | Dipende da |
|------|-------------|----------|------------|
| R6: Scheduler V2 con input strategico | Architecture | ALTA | R7, R2 |
| R6: Carry-forward raccomandazioni | Architecture | ALTA | R6 |
| R6: Template piano V2 con raccomandazioni finali | Architecture | ALTA | R6 |
| R4: 3 nuovi agenti (tech-debt-tracker, e2e-runner, dependency-auditor) | Architecture + Dept leaders | MEDIA | R1 |
| R3: Prompt-optimizer agent | Protocols + Architecture | MEDIA | R7, R1 |

**Output Fase 2:** Scheduler vision-driven operativo, 30 agenti totali, prompt review sistematico.

### Fase 3 — Infrastruttura (settimana 6+)

| Task | Dipartimento | Priorita | Dipende da |
|------|-------------|----------|------------|
| R9: Provisioning VM Hetzner | Operations + Security | BASSA | — |
| R9: Deploy scheduler daemon + trading su VM | Operations | BASSA | R6, R9 |
| R9: Monitoring e alerting VM | Operations | BASSA | R9 |

**Output Fase 3:** Organizzazione always-on, scheduler e trading autonomi 24/7.

---

## RISCHI E MITIGAZIONI

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Over-engineering governance | MEDIA | Burocrazia rallenta | Protocolli leggeri, review dopo 30gg |
| State.md diventa stale | BASSA | Info sbagliate | Generazione automatica da daily-controls |
| Prompt-optimizer produce suggerimenti errati | MEDIA | Prompt peggiorati | Review obbligatoria da dept leader prima di applicare |
| Scheduler V2 troppo complesso | BASSA | Piani incomprensibili | Template fisso, massimo 8 task per piano |
| VM downtime | BASSA | Trading/scheduler offline | Hetzner SLA 99.9%, snapshot per recovery |

---

## COSTO TOTALE STIMATO

| Voce | Costo |
|------|-------|
| Sviluppo (6-8 settimane) | $0 (lavoro agenti interni) |
| VM Hetzner CX31 (annuale) | ~€168/anno (~€14/mese) |
| Hetzner backup/snapshot | ~€5/anno |
| Claude API per scheduler (stimato) | ~$15/mese (gia nel budget) |
| **Totale ricorrente** | **~€19/mese** |

---

## DECISIONI RICHIESTE AL BOSS

| ID | Decisione | Opzioni | Raccomandazione CME |
|----|-----------|---------|---------------------|
| D-R1 | Creare Dipartimento Protocolli? | SI / NO / EVOLUZIONE Process Designer | EVOLUZIONE (nuovo dept leggero, non pesante) |
| D-R5 | CME dispatcher-only confermato? | SI / NO | SI — elimina bottleneck |
| D-R7 | Dove scrivere Vision/Mission? | File .md / Telegram / Web UI | File .md + comandi Telegram |
| D-R9 | Procedere con VM Hetzner? | SI / NO / Altro provider | SI — Hetzner CX31 €14/mese |
| D-R6 | Priorita scheduler V2? | Fase 2 (sett. 3-5) / Anticipare | Fase 2 — serve R7 prima |
| D-ALL | Approvare piano 3 fasi? | SI / Modifiche / NO | SI |

---

## NOTE FINALI

Questa ristrutturazione trasforma Poimandres da "task runner con CME bottleneck" a "organizzazione goal-oriented con governance". I cambiamenti sono incrementali — ogni fase produce valore indipendentemente dalle successive.

Il costo e minimo (€19/mese ricorrente). Il rischio principale e over-engineering la governance. Mitigazione: review dopo 30 giorni, semplificare cio che non funziona.

**Il pezzo piu critico e R7 (Vision/Mission)** — senza, tutto il resto (scheduler, prompt-optimizer, protocolli) non ha una bussola. Raccomando di partire da li.
