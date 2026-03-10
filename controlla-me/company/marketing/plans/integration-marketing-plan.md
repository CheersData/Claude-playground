# Piano Marketing — Landing Page Integrazione + Guide Connettori + Positioning PMI

**Task ID:** a6d6ebfe
**Autore:** Growth Hacker (Marketing)
**Data:** 2026-03-10
**Stato:** Draft

---

## 1. Landing Page — Value Proposition

### Headline e Sub-headline

**Headline principale:**
> Collega i tuoi strumenti. L'AI fa il resto.

**Sub-headline:**
> Integrazioni intelligenti per PMI italiane: connetti Salesforce, Fatture in Cloud, Google Workspace e decine di altri strumenti. Senza codice, senza consulenti, a un prezzo che ha senso.

**Alternative headline testate (per A/B):**
- "I tuoi dati parlano. Noi li facciamo dialogare."
- "Basta copia-incolla tra software. Automatizza tutto."
- "L'integrazione enterprise, al prezzo di una pizza."

---

### Value Proposition vs Competitor

| Aspetto | Boomi / MuleSoft | Zapier | Controlla.me |
|---------|-----------------|--------|--------------|
| Target | Enterprise (500+ dipendenti) | Freelance / startup US | PMI italiane (5-250 dip.) |
| Prezzo | Da 10.000 EUR/anno | Da 19,99 USD/mese (limitato) | Da 4,99 EUR/mese (Pro) |
| Setup | Settimane + consulente | Self-service ma in inglese | 3 step, tutto in italiano |
| AI integrata | No (routing manuale) | Limitata | 4 agenti AI che capiscono il contesto |
| Compliance IT | Da configurare | No (server US) | GDPR-native, server EU |
| Connettori IT | Generici | Generici | Fatture in Cloud, PEC, INPS, AdE |
| Lingua | Inglese | Inglese | Italiano (UI, supporto, docs) |

**Differenziatore killer:**
> "L'unica piattaforma di integrazione che capisce il contesto legale e fiscale italiano. Non collega solo i dati — li interpreta."

---

### Sezioni Landing Page (5 sezioni)

#### Sezione 1 — Hero con CTA

**Layout:** Split 50/50 (coerente con HeroSection.tsx attuale)
- Sinistra: testo + CTA
- Destra: illustrazione/screenshot connettori

**Copy:**

```
[Badge] Integrazioni AI-powered per PMI italiane

[H1] Collega i tuoi strumenti.
     L'AI fa il resto.

[Sotto] Connetti il tuo gestionale, la fatturazione, l'email
        e i documenti in 3 click. Niente codice, niente consulenti.

[CTA primaria] Prova gratis — 3 integrazioni incluse
[CTA secondaria] Vedi i connettori disponibili

[Trust signals]
Dati protetti  |  Server in EU  |  Setup in 5 minuti
```

**Design notes:**
- Stile identico a HeroVerifica: sfondo bianco, font Instrument Serif per H1, DM Sans per body
- Colore accent #FF6B35 per CTA primaria (gradient to amber-500)
- Badge con bordo accent/25 come nell'hero attuale
- Animazione Framer Motion: fade-in sequenziale come HeroVerifica

---

#### Sezione 2 — Come Funziona (3 Step)

**Layout:** 3 colonne con icone, coerente con MissionSection.tsx

```
COME FUNZIONA — 3 passaggi, zero codice

[Step 1 — icona Plug]
SCEGLI IL CONNETTORE
Seleziona dal catalogo: gestionale, fatturazione,
email, documenti. Tutti i tool che usi gia.

[Step 2 — icona Key]
AUTORIZZA IN 1 CLICK
Login con le tue credenziali. Nessuna configurazione
tecnica, nessun IT necessario.

[Step 3 — icona Sparkles]
L'AI LAVORA PER TE
I dati fluiscono automaticamente. L'AI li analizza,
li categorizza e ti avvisa se qualcosa non torna.
```

**Design notes:**
- Card bianche con bordo border, hover con shadow-md
- Numero step in cerchio accent
- Icone da lucide-react: Plug, Key, Sparkles

---

#### Sezione 3 — Connettori Disponibili (Grid)

**Layout:** Grid 4 colonne desktop, 2 mobile

```
I TUOI STRUMENTI, GIA PRONTI

[Grid di card con logo + nome + stato]

GESTIONALI & CRM
- Salesforce          Disponibile
- HubSpot             Disponibile
- Zoho CRM            In arrivo
- TeamSystem          In arrivo

FATTURAZIONE & CONTABILITA
- Fatture in Cloud    Disponibile
- Aruba Fatturazione  In arrivo
- Zucchetti           In arrivo
- Danea Easyfatt      In arrivo

PRODUTTIVITA
- Google Workspace    Disponibile
- Microsoft 365       Disponibile
- Slack               In arrivo
- Notion              In arrivo

DOCUMENTI & LEGALE
- PEC (Aruba/Legalmail)  In arrivo
- DocuSign               In arrivo
- Dropbox Business       In arrivo
- INPS / AdE             In arrivo

[CTA] Non trovi il tuo strumento? Segnalacelo
```

**Design notes:**
- Card con logo connettore (dove disponibile), nome, badge stato
- Badge "Disponibile" = verde, "In arrivo" = grigio/amber
- CTA in basso per raccogliere segnalazioni (lead gen)
- Ordinare per popolarita/richieste

---

#### Sezione 4 — Pricing Comparison

**Layout:** Tabella comparison + pricing cards (riutilizza stile PricingPageClient)

```
QUANTO COSTA INTEGRARE I TUOI STRUMENTI?

Confronto onesto — noi vs i "grandi"

| Funzionalita            | Boomi      | Zapier     | Controlla.me |
|-------------------------|-----------|------------|--------------|
| Prezzo mensile          | ~800 EUR  | ~50 EUR    | 4,99 EUR     |
| Setup                   | Settimane | Ore        | 5 minuti     |
| Connettori italiani     | Pochi     | Pochi      | Priorita     |
| AI integrata            | No        | Basica     | 4 agenti     |
| Supporto in italiano    | No        | No         | Si           |
| Server in EU            | Opzionale | No         | Si           |
| Analisi legale inclusa  | No        | No         | Si           |

[Pricing cards — 3 piani come /pricing attuale]
Free: 0 EUR — 3 integrazioni, 3 analisi/mese
Pro: 4,99 EUR/mese — Integrazioni illimitate, analisi illimitate
Single: 0,99 EUR — 1 integrazione completa, 1 analisi
```

**Design notes:**
- Tabella con righe alternate, highlight colonna Controlla.me
- Check verdi per Controlla.me, X grigie per competitor
- Stile card pricing identico a PricingPageClient (border-accent/40, gradient CTA)

---

#### Sezione 5 — FAQ

```
DOMANDE FREQUENTI

[Accordion — 6 domande]

D: Devo essere un tecnico per usare le integrazioni?
R: Assolutamente no. Il nostro sistema e progettato per imprenditori e
   professionisti, non per sviluppatori. Scegli il connettore, autorizza
   con le tue credenziali, e il gioco e fatto.

D: I miei dati sono al sicuro?
R: Si. Tutti i dati transitano su server EU, con crittografia end-to-end.
   Non vendiamo mai i tuoi dati a terzi. Siamo GDPR-compliant by design.

D: Posso collegare software italiani come Fatture in Cloud?
R: Si. Abbiamo dato priorita ai software piu usati dalle PMI italiane.
   Fatture in Cloud, Aruba, TeamSystem sono nella nostra roadmap prioritaria.

D: In cosa siete diversi da Zapier?
R: Zapier e pensato per il mercato americano. Noi siamo nati per le PMI italiane:
   interfaccia in italiano, connettori per software italiani, analisi legale AI
   integrata, server in EU, prezzo accessibile.

D: Cosa succede se il mio software non e nella lista?
R: Segnalacelo! Aggiungiamo connettori in base alle richieste degli utenti.
   Se lo usi tu, probabilmente lo usano anche altri.

D: Posso provare gratis?
R: Si. Il piano Free include 3 integrazioni e 3 analisi al mese, per sempre.
   Nessuna carta di credito richiesta.
```

---

## 2. Guide "Come Connettere X" — Template + Draft Pilota

### Template Standard (per tutte le guide)

```
---
title: "Come connettere [NOME STRUMENTO] a Controlla.me"
description: "Guida passo-passo per integrare [NOME] con Controlla.me. Setup in 5 minuti, zero codice."
keywords: [keyword1, keyword2, keyword3]
category: "guide-integrazione"
difficulty: "facile"
time: "5 minuti"
lastUpdated: "YYYY-MM-DD"
---

# Come connettere [NOME STRUMENTO] a Controlla.me

**Tempo richiesto:** 5 minuti
**Difficolta:** Facile — nessuna competenza tecnica necessaria
**Prerequisiti:** Account [NOME] attivo, account Controlla.me (anche Free)

---

## Perche connettere [NOME]?

[2-3 frasi su cosa ottieni collegando questo strumento. Benefici concreti per PMI.]

---

## Guida passo-passo

### Step 1 — Accedi al pannello integrazioni
1. Vai su controlla.me e accedi al tuo account
2. Clicca su "Integrazioni" nel menu laterale
3. Cerca "[NOME]" nella lista connettori

### Step 2 — Autorizza la connessione
1. Clicca "Connetti [NOME]"
2. Si aprira la pagina di login di [NOME]
3. Inserisci le tue credenziali [NOME]
4. Clicca "Autorizza" per confermare l'accesso

### Step 3 — Configura cosa sincronizzare
1. Scegli quali dati importare: [lista specifica per strumento]
2. Imposta la frequenza di sincronizzazione (consigliato: ogni ora)
3. Clicca "Attiva" — fatto!

### Step 4 — Verifica (opzionale)
1. Vai nella dashboard di Controlla.me
2. Dovresti vedere i primi dati sincronizzati entro 5 minuti
3. Se non vedi nulla, controlla che le credenziali siano corrette

---

## Cosa fa l'AI con i tuoi dati [NOME]?

[Spiegazione specifica di come l'AI analizza i dati da questo strumento.]

---

## Risoluzione problemi

| Problema | Soluzione |
|----------|----------|
| "Connessione rifiutata" | Verifica le credenziali. Prova a disconnettere e riconnettere. |
| "Nessun dato sincronizzato" | Controlla che il tuo account [NOME] abbia dati. Attendi 10 minuti. |
| "Errore di autorizzazione" | Il tuo piano [NOME] potrebbe non supportare API. Contattaci. |

---

## Domande frequenti

**Posso disconnettere [NOME] in qualsiasi momento?**
Si. Vai in Integrazioni > [NOME] > Disconnetti. I tuoi dati restano al sicuro.

**Controlla.me puo modificare i miei dati su [NOME]?**
No. L'accesso e in sola lettura. Non modifichiamo mai nulla sul tuo account [NOME].

**Quanto costa?**
L'integrazione con [NOME] e inclusa in tutti i piani, anche Free.
```

---

### Guida Pilota 1 — Salesforce

**Titolo SEO:** "Come connettere Salesforce a Controlla.me"
**Meta description:** "Guida passo-passo per integrare Salesforce CRM con Controlla.me. Analisi AI automatica dei contratti dal tuo CRM."

#### SEO Keywords target

| Keyword | Volume stimato | Difficolta | Intento |
|---------|---------------|-----------|---------|
| salesforce integrazione analisi contratti | Basso-medio | Bassa | Transazionale |
| collegare CRM analisi legale automatica | Basso | Bassa | Informazionale |
| salesforce documenti legali AI | Basso | Bassa | Informazionale |
| integrazione salesforce PMI italia | Medio | Media | Transazionale |
| analisi contratti automatica CRM | Basso-medio | Bassa | Transazionale |

#### Perche connettere Salesforce?

Hai contratti, preventivi e documenti sparsi nel CRM? Collegando Salesforce a Controlla.me, ogni documento allegato alle tue Opportunity viene analizzato automaticamente dall'AI. Clausole rischiose, scadenze critiche, penali nascoste — tutto controllato prima che il deal si chiuda.

#### Guida passo-passo

**Step 1 — Accedi al pannello integrazioni**
1. Vai su controlla.me e accedi al tuo account
2. Clicca su "Integrazioni" nel menu laterale
3. Cerca "Salesforce" nella lista connettori

**Step 2 — Autorizza con OAuth**
1. Clicca "Connetti Salesforce"
2. Si aprira la pagina di login Salesforce
3. Accedi con le credenziali del tuo org Salesforce
4. Clicca "Consenti" per autorizzare Controlla.me in sola lettura

**Step 3 — Scegli cosa analizzare**
1. **Opportunity con allegati**: analizza i contratti allegati alle Opportunity
2. **Account con documenti**: analizza i documenti associati ai clienti
3. **Custom Objects** (opzionale): collega oggetti personalizzati con campi documento
4. Imposta la frequenza: "Ad ogni modifica" (consigliato) o "Ogni ora"
5. Clicca "Attiva"

**Step 4 — Verifica**
1. Apri una Opportunity con un contratto allegato
2. Entro 5 minuti vedrai il report di analisi nella dashboard Controlla.me
3. Un badge apparira anche nella sidebar Salesforce (se usi il nostro widget)

#### Cosa fa l'AI con i dati Salesforce

Quando un commerciale allega un contratto a una Opportunity, i 4 agenti AI di Controlla.me lo analizzano automaticamente:

- **Leo (Catalogatore)** classifica il tipo di contratto
- **Marta (Analista)** individua clausole rischiose
- **Giulia (Giurista)** verifica la conformita legale
- **Enzo (Consulente)** ti da il verdetto in linguaggio semplice

Il risultato appare nella dashboard e, opzionalmente, come nota nella Opportunity Salesforce.

---

### Guida Pilota 2 — Fatture in Cloud

**Titolo SEO:** "Come connettere Fatture in Cloud a Controlla.me"
**Meta description:** "Guida per integrare Fatture in Cloud con Controlla.me. Controllo automatico AI su fatture, contratti e documenti fiscali."

#### SEO Keywords target

| Keyword | Volume stimato | Difficolta | Intento |
|---------|---------------|-----------|---------|
| fatture in cloud integrazione | Alto | Media | Transazionale |
| controllo automatico fatture AI | Medio | Bassa | Informazionale |
| fatturazione elettronica analisi legale | Medio | Bassa | Informazionale |
| fatture in cloud API integrazione | Medio | Media | Transazionale |
| verifica fatture fornitore automatica | Basso-medio | Bassa | Transazionale |

#### Perche connettere Fatture in Cloud?

Le PMI italiane gestiscono migliaia di fatture l'anno. Con Controlla.me collegato a Fatture in Cloud, l'AI verifica automaticamente che le condizioni contrattuali nelle fatture corrispondano agli accordi firmati. Discrepanze nei prezzi, termini di pagamento diversi dal contratto, IVA applicata in modo errato — tutto rilevato prima che diventi un problema.

#### Guida passo-passo

**Step 1 — Accedi al pannello integrazioni**
1. Vai su controlla.me e accedi al tuo account
2. Clicca su "Integrazioni" nel menu laterale
3. Cerca "Fatture in Cloud" nella lista connettori

**Step 2 — Autorizza con API key**
1. Clicca "Connetti Fatture in Cloud"
2. Accedi al tuo account Fatture in Cloud in un'altra tab
3. Vai in Impostazioni > API > Genera chiave API
4. Copia la chiave e incollala nel campo su Controlla.me
5. Clicca "Verifica e connetti"

**Step 3 — Scegli cosa monitorare**
1. **Fatture emesse**: verifica conformita e condizioni
2. **Fatture ricevute**: confronta con contratti fornitori
3. **Preventivi**: analizza clausole prima di firmare
4. Imposta la frequenza: "Ad ogni nuova fattura" (consigliato)
5. Clicca "Attiva"

**Step 4 — Verifica**
1. Controlla che le ultime fatture appaiano nella dashboard
2. L'AI iniziera ad analizzare automaticamente
3. Riceverai una notifica se trova anomalie

#### Cosa fa l'AI con i dati Fatture in Cloud

L'AI di Controlla.me non si limita a leggere le fatture. Le confronta con:

- **I contratti originali** caricati in precedenza — per trovare discrepanze
- **La normativa fiscale italiana** — IVA corretta, ritenute, bolli
- **I termini di pagamento** — scadenze, penali, interessi di mora

Se una fattura del fornitore applica condizioni diverse dal contratto firmato, Controlla.me te lo dice subito. In italiano, senza legalese.

---

### Guida Pilota 3 — Google Workspace

**Titolo SEO:** "Come connettere Google Workspace a Controlla.me"
**Meta description:** "Guida per integrare Google Drive, Gmail e Docs con Controlla.me. Analisi AI automatica dei documenti legali nel tuo Workspace."

#### SEO Keywords target

| Keyword | Volume stimato | Difficolta | Intento |
|---------|---------------|-----------|---------|
| google workspace integrazione documenti legali | Basso-medio | Bassa | Transazionale |
| google drive analisi contratti automatica | Basso | Bassa | Informazionale |
| gmail allegati contratti analisi AI | Basso | Bassa | Informazionale |
| google docs contratti PMI italia | Medio | Media | Informazionale |
| collegare google workspace analisi legale | Basso | Bassa | Transazionale |

#### Perche connettere Google Workspace?

Il 73% delle PMI italiane usa Google Workspace per i documenti. Contratti in Google Drive, preventivi via Gmail, bozze su Google Docs — tutto sparso e non controllato. Collegando Workspace a Controlla.me, ogni documento legale viene analizzato automaticamente appena caricato o ricevuto.

#### Guida passo-passo

**Step 1 — Accedi al pannello integrazioni**
1. Vai su controlla.me e accedi al tuo account
2. Clicca su "Integrazioni" nel menu laterale
3. Cerca "Google Workspace" nella lista connettori

**Step 2 — Autorizza con Google OAuth**
1. Clicca "Connetti Google Workspace"
2. Scegli il tuo account Google
3. Rivedi i permessi richiesti (solo lettura documenti)
4. Clicca "Consenti"

**Step 3 — Scegli cosa monitorare**
1. **Google Drive**: seleziona le cartelle con documenti legali
   - Consigliato: crea una cartella "Contratti" e seleziona solo quella
2. **Gmail**: monitora allegati PDF/DOCX nelle email ricevute
   - Opzionale: filtra per mittente o etichetta
3. **Google Docs**: analizza documenti Docs specifici
4. Clicca "Attiva"

**Step 4 — Verifica**
1. Carica un contratto nella cartella Google Drive selezionata
2. Entro 10 minuti vedrai l'analisi nella dashboard Controlla.me
3. Per Gmail: invia a te stesso un'email con un contratto allegato

#### Cosa fa l'AI con i dati Google Workspace

- **Drive**: monitora le cartelle selezionate. Ogni nuovo PDF, DOCX o Docs viene analizzato automaticamente dai 4 agenti AI
- **Gmail**: scansiona gli allegati delle email in arrivo. Se trova un contratto o documento legale, lo analizza e ti avvisa
- **Docs**: analizza bozze di contratto direttamente su Google Docs. Puoi anche chiedere all'AI di suggerire modifiche (disponibile su piano Pro)

Tutto avviene in background. Tu lavori come sempre — l'AI ti avvisa solo quando trova qualcosa di importante.

---

## 3. Positioning PMI Italiane

### Messaging Framework

#### Posizionamento core

**Per chi:** PMI italiane (5-250 dipendenti) che gestiscono contratti, fatture e documenti legali quotidianamente.

**Problema:** Strumenti di integrazione esistenti (Boomi, MuleSoft, Zapier) sono progettati per enterprise americane o freelance tech-savvy. Le PMI italiane restano escluse: prezzi proibitivi, interfacce in inglese, nessuna comprensione del contesto normativo italiano.

**Soluzione:** Controlla.me offre integrazioni AI-powered pensate per il mercato italiano: connettori per software italiani (Fatture in Cloud, PEC, TeamSystem), analisi legale automatica, tutto in italiano, a un prezzo accessibile.

**Promessa:** "Connetti i tuoi strumenti in 5 minuti. L'AI controlla tutto per te."

---

#### Pain Points Specifici PMI Italia

| Pain Point | Intensita (1-5) | Come lo risolviamo |
|-----------|-----------------|-------------------|
| **Compliance fiscale e normativa**: "Non so se le mie fatture sono conformi" | 5 | AI che verifica automaticamente conformita IVA, ritenute, termini di pagamento |
| **Costi integrazione**: "I consulenti IT costano piu del software" | 5 | Setup self-service in 5 minuti, piano da 4,99 EUR/mese |
| **Complessita tecnica**: "Non ho un reparto IT" | 4 | Zero codice, autorizzazione OAuth, configurazione guidata in italiano |
| **Frammentazione dati**: "Contratti su Drive, fatture su FiC, email con allegati importanti" | 4 | Un unico punto di controllo per tutti i documenti legali |
| **Lingua**: "Tutti i tool sono in inglese" | 3 | Interfaccia, documentazione, supporto e AI in italiano |
| **GDPR e privacy**: "Non so dove finiscono i miei dati" | 4 | Server EU, GDPR-compliant by design, nessuna vendita dati |
| **Tempo**: "Non ho tempo di controllare ogni contratto" | 5 | L'AI controlla in background, ti avvisa solo quando serve |

---

#### Differenziatori vs Enterprise Tools

**1. Prezzo radicalmente diverso**
- MuleSoft: da 10.000 EUR/anno + costo consulente implementazione
- Controlla.me: 4,99 EUR/mese, tutto incluso, setup self-service
- Messaggio: "Il 95% delle PMI italiane non puo permettersi MuleSoft. Noi esistiamo per loro."

**2. AI che capisce il contesto italiano**
- Non e un semplice "connettore di dati"
- L'AI analizza il contenuto dei documenti, non solo li trasferisce
- Capisce IVA, codice civile, normativa del lavoro, GDPR italiano
- Messaggio: "Non colleghiamo solo i dati. Li capiamo."

**3. Localizzazione profonda**
- Connettori per software specificamente italiani (Fatture in Cloud, Aruba PEC, TeamSystem)
- Corpus normativo italiano integrato (~5600 articoli legislativi)
- UI, documentazione, AI e supporto in italiano
- Messaggio: "Nato in Italia, per le imprese italiane."

**4. Zero complessita tecnica**
- Nessun consulente, nessun codice, nessuna formazione
- 3 step: scegli, autorizza, attiva
- Progettato per l'imprenditore, non per lo sviluppatore
- Messaggio: "Se sai usare un'email, sai usare Controlla.me."

---

#### Buyer Personas

**Persona 1 — Marco, Titolare PMI manifatturiera (15 dip.)**
- Eta: 48 anni
- Tool: Fatture in Cloud, Gmail, Excel
- Pain: "Ho firmato un contratto con un fornitore cinese senza capire la penale. Mi e costato 12.000 EUR."
- Trigger: un problema legale costoso che si poteva evitare
- Canale: Google Search, passaparola, commercialista

**Persona 2 — Sara, Responsabile amministrativa studio professionale (8 dip.)**
- Eta: 35 anni
- Tool: Google Workspace, TeamSystem, PEC Aruba
- Pain: "Gestisco 200 contratti l'anno per i clienti dello studio. Non posso controllarli tutti a mano."
- Trigger: volume di documenti ingestibile
- Canale: LinkedIn, community professionali, newsletter settore

**Persona 3 — Andrea, Commercialista con 50 clienti PMI**
- Eta: 42 anni
- Tool: Fatture in Cloud, Excel, email
- Pain: "I miei clienti firmano contratti senza consultarmi. Poi devo risolvere i problemi."
- Trigger: opportunita di offrire un servizio in piu ai clienti
- Canale: Ordine dei Commercialisti, LinkedIn, referral

---

### Canali di Acquisizione Suggeriti

#### Canale 1 — Google Ads (Search)

**Budget suggerito:** 500-1.000 EUR/mese
**Keywords target:**
- "analisi contratto online" (transazionale, alta conversione)
- "controllo clausole contratto" (informazionale, top funnel)
- "fatture in cloud integrazione" (transazionale, specifica)
- "analisi legale AI" (informazionale, brand awareness)
- "software contratti PMI" (transazionale, buyer intent)

**Landing page:** pagina integrazione dedicata (sezione 1 di questo piano)
**Conversione attesa:** 3-5% click-to-signup (free trial)

---

#### Canale 2 — LinkedIn (Organico + Ads)

**Targeting:** Titolari PMI, responsabili amministrativi, commercialisti — Italia
**Formati:**
- Post educativi (2-3/settimana): "Lo sapevi che il 40% dei contratti PMI ha clausole illegali?"
- Carousel: "5 clausole vietate nel contratto di affitto" (con link a guida blog)
- Testimonianze: screenshot analisi reali (anonimizzate)

**Budget Ads:** 300-500 EUR/mese per campagne lead gen
**Targeting Ads:** Job title (Titolare, CEO, Direttore Amministrativo, Commercialista), industry (manifatturiero, servizi, commercio), location Italia, company size 10-200

---

#### Canale 3 — Partnership Commercialisti e Consulenti del Lavoro

**Strategia:** offrire account Pro gratuito a commercialisti/consulenti che portano clienti
**Proposta:**
- Il commercialista usa Controlla.me Pro gratis (per sempre)
- Per ogni cliente che si abbona, il commercialista riceve una commissione del 20% per 12 mesi
- Co-branding: "Analisi legale powered by Controlla.me" sulla dashboard del commercialista

**Canali outreach:**
- Ordini professionali (commercialisti, consulenti del lavoro, avvocati)
- Associazioni di categoria (Confindustria PMI, Confcommercio, CNA)
- Eventi di settore (festival del lavoro, fiere PMI)

**Volume atteso:** 5-10 partnership nei primi 6 mesi

---

#### Canale 4 — SEO + Content Marketing (Organico)

**Strategia:** posizionarsi come autorita su "analisi legale AI" e "contratti PMI"
**Contenuti:** guide blog (gia in produzione, 8 articoli pubblicati), guide integrazione (sezione 2), FAQ legali
**Keywords long-tail:**
- "clausole vietate contratto affitto" (gia coperto)
- "clausole illegali contratto lavoro" (gia coperto)
- "come collegare fatture in cloud" (nuova, guida integrazione)
- "analisi contratto AI gratis" (transazionale, alta conversione)
- "confronto zapier alternative italiane" (competitor, alta intenzione)

**Volume atteso:** 1.000+ sessioni/mese entro 6 mesi (obiettivo Marketing KPI)

---

## 4. Content Calendar — 12 Settimane per il Lancio

### Settimana 1 (Lancio)

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "Controlla.me lancia le integrazioni: collega i tuoi strumenti in 5 minuti" | Blog + LinkedIn | Awareness |
| Mar | Social | Post LinkedIn: "Il 68% delle PMI italiane perde tempo a copiare dati tra software. Noi abbiamo una soluzione." | LinkedIn | Engagement |
| Gio | Guida | "Come connettere Salesforce a Controlla.me" (guida pilota 1) | Blog + Google Ads | SEO + Traffic |
| Ven | Newsletter | "Le integrazioni sono live — prova gratis" | Email list | Conversion |

### Settimana 2

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Guida | "Come connettere Fatture in Cloud a Controlla.me" (guida pilota 2) | Blog | SEO |
| Mer | Social | Carousel LinkedIn: "3 step per collegare il tuo gestionale" | LinkedIn | Engagement |
| Ven | Blog | "Perche le PMI italiane meritano strumenti migliori di Zapier" | Blog + LinkedIn | Positioning |

### Settimana 3

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Guida | "Come connettere Google Workspace a Controlla.me" (guida pilota 3) | Blog | SEO |
| Mer | Social | Testimonianza: "Ho trovato una penale nascosta nel contratto del fornitore" | LinkedIn | Trust |
| Ven | Blog | "5 errori che le PMI fanno con i contratti dei fornitori" | Blog | SEO long-tail |

### Settimana 4

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "Fatturazione elettronica: come l'AI ti aiuta a evitare errori" | Blog | SEO |
| Mer | Social | Video breve: demo integrazione Fatture in Cloud (30 sec) | LinkedIn + IG | Awareness |
| Ven | Newsletter | "Mese 1 recap + nuovi connettori in arrivo" | Email list | Retention |

### Settimana 5

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "Clausole pericolose nei contratti commerciali tra PMI" (gia scritto, riproponi) | Blog + LinkedIn | SEO boost |
| Mer | Social | Sondaggio LinkedIn: "Quanto tempo dedichi a controllare contratti?" | LinkedIn | Engagement |
| Ven | Guida | "Come connettere HubSpot a Controlla.me" (guida 4) | Blog | SEO |

### Settimana 6

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "Confronto: Controlla.me vs Zapier vs MuleSoft per PMI italiane" | Blog + Google Ads | Conversion |
| Mer | Social | Infografica: "Quanto costa NON controllare i contratti" | LinkedIn | Awareness |
| Ven | Partnership | Primo outreach a 10 commercialisti (email personalizzata) | Email diretto | Partnership |

### Settimana 7

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "GDPR e PMI: cosa devi sapere nel 2026" | Blog | SEO |
| Mer | Social | Post: "Il nostro corpus ha 5600+ articoli legislativi italiani" | LinkedIn | Trust |
| Ven | Guida | "Come connettere Microsoft 365 a Controlla.me" (guida 5) | Blog | SEO |

### Settimana 8

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Case study | "Come una PMI ha risparmiato 8.000 EUR evitando una clausola penale" | Blog + LinkedIn | Trust + Conv. |
| Mer | Social | Behind the scenes: "Come funzionano i 4 agenti AI" | LinkedIn | Education |
| Ven | Newsletter | "Mese 2 recap + caso studio + nuove guide" | Email list | Retention |

### Settimana 9

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "Contratti di lavoro: 7 clausole che il tuo datore non puo inserire" (riproponi) | Blog | SEO boost |
| Mer | Social | Video: "Analisi di un contratto in real-time" (screen recording, 60 sec) | LinkedIn | Conversion |
| Ven | Guida | "Come connettere Aruba PEC a Controlla.me" (guida 6) | Blog | SEO |

### Settimana 10

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "AI Act 2026: cosa cambia per chi usa AI nei contratti" (riproponi con update) | Blog | SEO topical |
| Mer | Social | Poll: "Useresti un AI per controllare i contratti?" + risultati | LinkedIn | Engagement |
| Ven | Partnership | Follow-up commercialisti + primo webinar congiunto | Email + Zoom | Partnership |

### Settimana 11

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "I 10 connettori piu richiesti dalle PMI italiane (e quando arrivano)" | Blog | Engagement |
| Mer | Social | Carousel: "Prima vs Dopo Controlla.me — la gestione contratti" | LinkedIn | Conversion |
| Ven | Guida | "Come connettere TeamSystem a Controlla.me" (guida 7) | Blog | SEO |

### Settimana 12

| Giorno | Tipo | Contenuto | Canale | Obiettivo |
|--------|------|-----------|--------|-----------|
| Lun | Blog | "Report Q1: cosa abbiamo imparato dalle prime 1.000 analisi AI" | Blog + LinkedIn | Trust + PR |
| Mer | Social | Annuncio: "5 nuovi connettori in arrivo nel Q2" | LinkedIn | Hype |
| Ven | Newsletter | "Mese 3 recap + roadmap Q2 + offerta speciale early adopter" | Email list | Conversion |

---

### Metriche di Successo

#### Lead Generation

| Metrica | Target Sett. 4 | Target Sett. 8 | Target Sett. 12 |
|---------|---------------|----------------|-----------------|
| Visite landing integrazione | 500 | 1.500 | 3.000 |
| Signup Free (da landing) | 25 (5%) | 90 (6%) | 210 (7%) |
| Guide lette (pageviews) | 200 | 800 | 2.000 |
| Form "Segnala connettore" | 10 | 30 | 60 |

#### Conversion

| Metrica | Target Sett. 4 | Target Sett. 8 | Target Sett. 12 |
|---------|---------------|----------------|-----------------|
| Free to Pro conversion | 3% | 5% | 7% |
| Acquisto singola analisi | 5 | 20 | 50 |
| Churn Pro | < 10% | < 8% | < 5% |
| Revenue MRR | 50 EUR | 200 EUR | 500 EUR |

#### Engagement

| Metrica | Target Sett. 4 | Target Sett. 8 | Target Sett. 12 |
|---------|---------------|----------------|-----------------|
| LinkedIn followers | +50 | +150 | +300 |
| LinkedIn engagement rate | > 3% | > 4% | > 5% |
| Newsletter subscribers | 100 | 300 | 600 |
| Newsletter open rate | > 35% | > 35% | > 35% |

#### Partnership

| Metrica | Target Sett. 4 | Target Sett. 8 | Target Sett. 12 |
|---------|---------------|----------------|-----------------|
| Commercialisti contattati | 10 | 30 | 50 |
| Partnership attive | 0 | 2 | 5 |
| Clienti da referral | 0 | 5 | 20 |

---

### Budget Stimato (12 settimane)

| Voce | Costo mensile | Totale 3 mesi |
|------|--------------|--------------|
| Google Ads | 750 EUR | 2.250 EUR |
| LinkedIn Ads | 400 EUR | 1.200 EUR |
| Tool (SEMrush/Ahrefs) | 100 EUR | 300 EUR |
| Grafica (Canva Pro) | 12 EUR | 36 EUR |
| **Totale** | **1.262 EUR** | **3.786 EUR** |

**Note:** Il contenuto (blog, guide, social copy) viene prodotto internamente dall'AI Content Writer. Nessun costo esterno per copywriting. Il budget e conservativo e puo essere aumentato se il CAC (costo acquisizione cliente) risulta sostenibile dopo le prime 4 settimane.

---

## Appendice — Checklist Pre-Lancio

- [ ] Landing page integrazione implementata e testata
- [ ] Almeno 3 connettori funzionanti (Salesforce, Fatture in Cloud, Google Workspace)
- [ ] 3 guide pilota pubblicate sul blog
- [ ] Google Ads account configurato con keyword e budget
- [ ] LinkedIn company page aggiornata con nuovo messaging
- [ ] Newsletter list importata e template creato
- [ ] Tracking (GA4 + GSC) operativo sulla landing page
- [ ] Form "Segnala connettore" funzionante e collegato a CRM/spreadsheet
- [ ] Piano commercialisti pronto (materiale + proposta commissione)
- [ ] FAQ aggiornate con domande su integrazioni
