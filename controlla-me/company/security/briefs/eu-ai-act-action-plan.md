# Brief Operativo: EU AI Act — Piano d'Azione

**Autore:** security-auditor (Dipartimento Security)
**Data:** 2026-03-10
**Task:** d2110293
**Priorita:** HIGH
**Scadenza critica:** Agosto 2026 (obbligo di conformita per sistemi ad alto rischio)

---

## 1. Classificazione del sistema Controlla.me

### 1.1 Analisi Allegato III — Sistemi AI ad alto rischio

Il Regolamento (UE) 2024/1689 (AI Act) classifica come **alto rischio** i sistemi AI elencati nell'Allegato III. La sezione rilevante per Controlla.me e:

> **Allegato III, punto 8(a): Amministrazione della giustizia e processi democratici**
>
> Sistemi di AI destinati ad assistere un'autorita giudiziaria nella ricerca e nell'interpretazione dei fatti e del diritto e nell'applicazione della legge a una serie concreta di fatti.

### 1.2 Controlla.me rientra nell'Allegato III punto 8(a)?

| Criterio | Controlla.me | Valutazione |
|----------|-------------|-------------|
| Assiste un'autorita giudiziaria? | No — assiste cittadini e PMI, non giudici | Potenzialmente fuori scope |
| Ricerca e interpretazione fatti/diritto? | Si — analizza contratti, identifica clausole rischiose, cita norme | Attivita coperta |
| Applicazione della legge a fatti concreti? | Parzialmente — fornisce analisi di supporto, non decisioni vincolanti | Zona grigia |
| Influenza materialmente l'esito decisionale? | Possibilmente — l'utente potrebbe basarsi sull'analisi per firmare o rifiutare un contratto | Rischio significativo |

### 1.3 Conclusione sulla classificazione

**Raccomandazione: trattare Controlla.me come sistema ad alto rischio.**

Motivazione:
1. Anche se non assiste direttamente un'autorita giudiziaria, il sistema fornisce analisi legale che puo influenzare decisioni con conseguenze giuridiche significative per l'utente
2. L'Art. 6(3) prevede una deroga se il sistema "non pone un rischio significativo" — ma un'analisi legale errata puo causare danni economici e legali reali
3. Trattare il sistema come alto rischio e la scelta conservativa piu sicura: se il consulente conferma che non lo e, avremo gia la conformita come bonus
4. La Legge italiana 132/2025 di recepimento potrebbe aggiungere requisiti ulteriori

### 1.4 Rilevanza dell'Art. 6(3) — Deroga

L'Art. 6(3) permette di non considerare alto rischio un sistema dell'Allegato III se:
- (a) Esegue un compito procedurale ristretto
- (b) Migliora il risultato di un'attivita umana precedente
- (c) Rileva pattern decisionali senza sostituire la valutazione umana
- (d) Esegue un compito preparatorio

Controlla.me potrebbe rientrare nel caso (c) o (d), ma **la valutazione richiede un parere legale esperto** — da qui la necessita del consulente.

---

## 2. Requisiti obbligatori per sistemi ad alto rischio

Se confermata la classificazione ad alto rischio, l'Art. 16 del Regolamento impone i seguenti obblighi al **fornitore** (provider):

### 2.1 Sistema di gestione della qualita (Art. 17)

- [ ] **Quality Management System (QMS)** documentato e mantenuto
- [ ] Procedure per la conformita ai requisiti dell'AI Act
- [ ] Processo di sviluppo documentato (design, data governance, training, testing)
- [ ] Procedure per la gestione dei rischi
- [ ] Procedure di monitoraggio post-deployment
- [ ] Procedure per incidenti e malfunzionamenti
- [ ] Gestione della comunicazione con autorita competenti

### 2.2 Sistema di gestione dei rischi (Art. 9)

- [ ] Identificazione e analisi dei rischi noti e prevedibili
- [ ] Stima e valutazione dei rischi in caso di uso conforme e **misuso prevedibile**
- [ ] Misure di mitigazione adottate
- [ ] Test per verificare l'efficacia delle mitigazioni
- [ ] Il sistema e iterativo e aggiornato durante tutto il ciclo di vita

**Per Controlla.me**, i rischi principali sono:
1. Analisi legale errata che porta l'utente a firmare un contratto svantaggioso
2. Falso senso di sicurezza (utente non consulta un avvocato quando dovrebbe)
3. Bias nell'analisi (certi tipi di contratto o clausole meno coperti)
4. Allucinazioni: citazione di sentenze o norme inesistenti

### 2.3 Documentazione tecnica (Art. 11 + Allegato IV)

- [ ] Descrizione generale del sistema AI
- [ ] Descrizione dettagliata degli elementi e del processo di sviluppo
- [ ] Informazioni dettagliate sul monitoraggio, funzionamento e controllo
- [ ] Descrizione del sistema di gestione dei rischi
- [ ] Descrizione delle misure di cybersecurity adottate
- [ ] Descrizione delle prestazioni del sistema (metriche, benchmark)
- [ ] Descrizione del sistema di logging automatico (gia: `audit-log.ts`)

### 2.4 Logging automatico (Art. 12)

- [ ] Il sistema deve registrare automaticamente gli eventi rilevanti (gia implementato: `lib/middleware/audit-log.ts`)
- [ ] I log devono consentire la tracciabilita del funzionamento
- [ ] Periodo di conservazione: almeno 6 mesi (verificare TTL attuale)

**Stato attuale:** Parzialmente conforme. L'audit log registra eventi AI (modello, token, durata), auth e rate limit. Mancano: log delle decisioni specifiche dell'analisi (quale clausola, quale rischio, quale score).

### 2.5 Trasparenza e informazioni agli utenti (Art. 13)

- [ ] Istruzioni d'uso chiare e comprensibili
- [ ] Informazioni sulle capacita e limitazioni del sistema
- [ ] Livello di accuratezza, robustezza e cybersecurity
- [ ] Rischi noti residui
- [ ] Misure di sorveglianza umana

**Per Controlla.me:** aggiungere in app una sezione "Limitazioni e avvertenze" ben visibile — non solo nel footer.

### 2.6 Sorveglianza umana (Art. 14)

- [ ] Il sistema deve essere progettato per consentire la sorveglianza umana
- [ ] L'utente deve poter comprendere le capacita e i limiti del sistema
- [ ] L'utente deve poter ignorare, sovrascrivere o invertire l'output del sistema

**Stato attuale:** Conforme. L'analisi e presentata come suggerimento, con raccomandazione esplicita di consultare un avvocato (`needsLawyer`). L'utente decide se seguire i consigli o meno.

### 2.7 Accuratezza, robustezza, cybersecurity (Art. 15)

- [ ] Livelli di accuratezza dichiarati e verificati (metriche di benchmark)
- [ ] Resilienza a errori, guasti e tentativi di manipolazione
- [ ] Misure di cybersecurity (gia: middleware completo, audit completo 50 route)

### 2.8 Valutazione di conformita (Art. 43)

- [ ] Auto-valutazione (basata su controllo interno) per sistemi dell'Allegato III punto 8
- [ ] Dichiarazione di conformita UE (Art. 47)
- [ ] Marcatura CE (Art. 48) — se applicabile
- [ ] Registrazione nella banca dati UE (Art. 49)

### 2.9 Obblighi post-market (Art. 72)

- [ ] Monitoraggio post-market del sistema AI
- [ ] Segnalazione di incidenti gravi alle autorita competenti
- [ ] Azioni correttive se il sistema non e piu conforme

---

## 3. Timeline e azioni

### 3.1 Scadenze chiave

| Data | Evento |
|------|--------|
| 2 feb 2025 | Divieto pratiche AI proibite (Art. 5) — **gia in vigore** |
| 2 ago 2025 | Obblighi per GPAI (modelli general-purpose) — **gia in vigore** |
| **2 ago 2026** | **Obbligo conformita per sistemi ad alto rischio (Allegato III)** |
| 2 ago 2027 | Obbligo per sistemi ad alto rischio parte di prodotti regolamentati |

### 3.2 Piano d'azione (marzo - agosto 2026)

| Mese | Attivita | Owner | Deliverable |
|------|---------|-------|-------------|
| **Marzo 2026** | Selezione e primo contatto consulente | Security | Shortlist 3 consulenti, email inviate |
| **Aprile 2026** | Ingaggio consulente, kick-off progetto | Security + CME + Boss | Contratto firmato, scope definito |
| **Aprile 2026** | Gap analysis: stato attuale vs requisiti AI Act | Consulente + Security | Report gap analysis |
| **Maggio 2026** | Classificazione definitiva (alto rischio si/no) | Consulente | Parere scritto con motivazione |
| **Maggio 2026** | Compilazione documentazione tecnica (Art. 11) | Architecture + Security | Bozza documentazione tecnica |
| **Giugno 2026** | Sistema di gestione rischi (Art. 9) | Security + Consulente | Risk management framework |
| **Giugno 2026** | Quality Management System (Art. 17) | Operations + Consulente | QMS documentato |
| **Luglio 2026** | Auto-valutazione conformita (Art. 43) | Consulente + Security | Report di conformita |
| **Luglio 2026** | Aggiornamento UI: trasparenza e avvertenze (Art. 13) | UX/UI | Sezione limitazioni in app |
| **Agosto 2026** | Dichiarazione di conformita UE + registrazione DB | Consulente + Boss | Dichiarazione firmata |
| **Agosto 2026** | Monitoraggio post-market attivo (Art. 72) | Operations | Piano monitoraggio |

---

## 4. Budget stimato

### 4.1 Costi consulenza

| Voce | Range | Note |
|------|-------|------|
| Consulenza legale specializzata AI Act | 5.000 - 10.000 EUR | Gap analysis + classificazione + documentazione |
| Supporto compilazione documentazione tecnica | 2.000 - 5.000 EUR | Se il consulente supporta la parte tecnica |
| Auto-valutazione conformita | 1.000 - 3.000 EUR | Inclusa nel pacchetto o separata |
| **Totale stimato** | **5.000 - 15.000 EUR** | |

### 4.2 Costi interni (tempo team)

| Attivita | Effort stimato |
|---------|---------------|
| Documentazione tecnica (Architecture + Security) | 5-10 giorni |
| Aggiornamento audit log per compliance | 2-3 giorni |
| UI trasparenza e avvertenze | 2-3 giorni |
| Risk management framework | 3-5 giorni |
| QMS documentazione | 3-5 giorni |
| **Totale effort interno** | **15-26 giorni** |

### 4.3 Considerazioni budget

- La startup e in fase pre-revenue — il budget e limitato
- Privilegiare consulenti che offrono pacchetti "startup-friendly" o tariffe ridotte per PMI
- Alcune attivita (documentazione tecnica, audit log) sono gia parzialmente completate
- Il QMS puo partire dalla documentazione esistente (CLAUDE.md, ARCHITECTURE.md, procedure operative in `company/`)

---

## 5. Consulenti e studi legali specializzati

### 5.1 Studi legali italiani con expertise AI Act

| # | Studio / Consulente | Specializzazione | Sede | Note |
|---|-------------------|-----------------|------|------|
| 1 | **DLA Piper Italia** | AI regulation, data protection, compliance | Milano, Roma | Pubblicazioni specifiche su AI Act e legge italiana 132/2025. Team tech dedicato. Struttura internazionale per questioni cross-border. |
| 2 | **BonelliErede** | Compliance, IP, tech regulation | Milano | Uno dei principali studi italiani. Expertise in compliance programs e piattaforme digitali. |
| 3 | **Portolano Cavallo** | TMT, data protection, AI, compliance | Roma, Milano | Specializzazione verticale su tech, media, telecom. Conoscenza approfondita GDPR + NIS2. |
| 4 | **Chiomenti** | IP, TMT, data protection | Milano, Roma | Studio top-tier italiano. Team TMT consolidato. |
| 5 | **Dentons Italia** | Tech regulation, data protection | Milano, Roma | Network globale, expertise AI Act a livello europeo. |
| 6 | **Hogan Lovells Studio Legale** | AI, tech regulation, IP | Milano | Pubblicazioni specifiche su judicial AI. Network internazionale. |
| 7 | **ICT Legal Consulting** (Paolo Balboni) | Privacy, AI Act, data protection | Bologna, Amsterdam | Boutique specializzata in privacy e AI. Pricing piu accessibile per startup. Membro EDPB e ENISA. |
| 8 | **E-Lex** (studio Scorza/Nenna) | Diritto digitale, privacy, AI | Roma | Studio boutique, esperti riconosciuti in diritto digitale italiano. Guido Scorza e componente del Garante Privacy. |
| 9 | **LT42** (Legal Tech) | AI Act compliance, legal tech | Milano | Consulenza specializzata in legal tech e AI compliance. Focus su startup e PMI. |
| 10 | **Aptus.AI** | AI Act compliance tooling | Milano | Non studio legale ma piattaforma di compliance AI Act. Utile come tool complementare al consulente. Round Serie A da 16M EUR. |

### 5.2 Criteri di selezione

Prioritizzare:
1. **Esperienza specifica con AI Act** (non solo GDPR generico)
2. **Conoscenza del legal tech** (capisce cosa fa Controlla.me)
3. **Tariffe startup-friendly** (boutique > big law per rapporto qualita/prezzo)
4. **Capacita di supportare anche la parte tecnica** (documentazione, audit)
5. **Disponibilita immediata** (entro aprile 2026)

### 5.3 Shortlist consigliata (top 3 per primo contatto)

1. **ICT Legal Consulting** — boutique specializzata, pricing accessibile, expertise profonda su AI + privacy
2. **DLA Piper Italia** — pubblicazioni specifiche su AI Act italiano, team strutturato
3. **Portolano Cavallo** — specializzazione verticale TMT, buon rapporto qualita/prezzo tra gli studi tier-1

---

## 6. Template email per primo contatto

### 6.1 Oggetto

```
Richiesta consulenza EU AI Act — Sistema AI per analisi legale contratti
```

### 6.2 Corpo email

```
Gentili [Nome Studio / Avv. Nome],

sono [Nome], [ruolo] di Controlla.me, una startup italiana che sviluppa
un sistema di intelligenza artificiale per l'analisi automatica di contratti
e documenti legali.

Il nostro sistema utilizza una pipeline di 4 agenti AI specializzati
(classificazione, analisi rischi, ricerca legale, consulenza) per analizzare
contratti e identificare clausole rischiose, fornendo all'utente una
valutazione di supporto con riferimenti normativi verificati.

Ci rivolgiamo a Voi per una consulenza su:

1. CLASSIFICAZIONE AI ACT: valutazione se il nostro sistema rientra tra
   i "sistemi ad alto rischio" ai sensi dell'Allegato III, punto 8(a)
   del Regolamento (UE) 2024/1689, considerando anche la Legge 132/2025
   di recepimento nazionale

2. GAP ANALYSIS: verifica dello stato di conformita attuale rispetto
   ai requisiti degli Articoli 9-15 e 17 del Regolamento

3. SUPPORTO ALLA CONFORMITA: assistenza nella compilazione della
   documentazione tecnica, del sistema di gestione dei rischi e della
   dichiarazione di conformita, con scadenza agosto 2026

Il nostro stack tecnologico include: Next.js, PostgreSQL (Supabase),
modelli AI multi-provider (Anthropic Claude, Google Gemini, Mistral),
vector database per RAG su corpus legislativo italiano ed europeo.

Disponiamo gia di:
- Audit log strutturato conforme Art. 12 (tracciabilita decisioni AI)
- Infrastruttura security completa (audit 50 route, middleware auth/CSRF/rate-limit)
- Documentazione tecnica parziale dell'architettura
- DPA in fase di firma con i provider AI principali

Budget indicativo: 5.000 - 15.000 EUR per l'intero percorso di conformita.

Saremmo disponibili per una call conoscitiva a Vostra convenienza.

Cordiali saluti,
[Nome Cognome]
[Ruolo]
Controlla.me
[email]
[telefono]
```

---

## 7. Rischi e mitigazioni

| Rischio | Probabilita | Impatto | Mitigazione |
|---------|------------|---------|-------------|
| Consulente non disponibile entro aprile | Media | Alto | Contattare almeno 3 studi in parallelo |
| Budget insufficiente | Media | Alto | Negoziare pagamento in fasi; valutare boutique vs big law |
| Classificazione come alto rischio confermata | Alta | Alto | Gia preparati: audit log, middleware, documentazione parziale |
| Requisiti Legge 132/2025 piu stringenti | Media | Medio | Il consulente deve coprire anche la normativa nazionale |
| Ritardi nella compilazione documentazione tecnica | Media | Alto | Assegnare owner interno dedicato (Architecture) |

---

## 8. Prossimi passi immediati

1. **Entro 15 marzo 2026**: Boss approva budget e shortlist consulenti
2. **Entro 20 marzo 2026**: Inviare email a 3 consulenti (shortlist sezione 5.3)
3. **Entro 31 marzo 2026**: Call conoscitive completate
4. **Entro 15 aprile 2026**: Contratto firmato con consulente selezionato
5. **Entro 30 aprile 2026**: Kick-off gap analysis

---

## Riferimenti

- Regolamento (UE) 2024/1689 (AI Act): https://artificialintelligenceact.eu/
- Allegato III: https://artificialintelligenceact.eu/annex/3/
- Art. 6 (Classificazione): https://artificialintelligenceact.eu/article/6/
- Art. 16 (Obblighi provider): https://artificialintelligenceact.eu/article/16/
- Legge 132/2025 (recepimento italiano): https://www.ictsecuritymagazine.com/articoli/legge-132-2025/
- DLA Piper su AI Act italiano: https://www.dlapiper.com/en/insights/publications/2024/04/ai-regulation-in-europe-italys-new-draft-ai-law-introduces-local-peculiarities-compared-to-the-eu
- Hogan Lovells su judicial AI: https://www.hoganlovells.com/en/publications/judicial-ai-guidance-updated-caution-still-prevails
