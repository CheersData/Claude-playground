# Piano Marketing — Lancio Ufficio Integrazione

**Autore**: Marketing Department
**Data**: 2026-03-10
**Stato**: Draft — richiede review CME
**Task ID**: a6d6ebfe
**Riferimento**: `company/strategy/briefs/integration-office-brief.md` (v2, RICE scoring)

---

## Indice

1. [Landing Page `/integrazione`](#1-landing-page-integrazione)
2. [Guide Connettori](#2-guide-connettori)
3. [Strategia di Posizionamento](#3-strategia-di-posizionamento)
4. [Sequenza di Lancio](#4-sequenza-di-lancio)
5. [Strategia SEO](#5-strategia-seo)

---

## 1. Landing Page `/integrazione`

### 1.1 Struttura completa della pagina

```
/integrazione
  |
  [A] Hero — headline + CTA waitlist
  [B] Value Proposition — 4 pilastri
  [C] Come Funziona — 4 step visuali
  [D] Vetrina Connettori — griglia con loghi
  [E] Confronto Competitor — tabella vs Zapier/Make/MuleSoft
  [F] Pricing — 3 piani integrazione
  [G] Social Proof / Testimonianze
  [H] FAQ
  [I] CTA Finale — waitlist + demo
  [J] Footer
```

---

### Sezione A — Hero

**Layout**: come `HeroVerifica` in `HeroSection.tsx` — split 50/50, testo a sinistra, immagine/illustrazione a destra. Sfondo bianco, stile pulito.

**Badge**:
```
[icona Plug] I tuoi strumenti, sotto controllo legale
```

**Headline**:
```
Connetti i tuoi strumenti.
Noi li controlliamo.
```

Il pattern e lo stesso della homepage ("Ti verifico il documento.") — poche parole, font Instrument Serif, peso font-black, la seconda riga in italic con gradiente arancione (`from-accent via-orange-400 to-amber-400`).

**Sotto-headline**:
```
Fatture in Cloud, Google Drive, HubSpot — connetti i tuoi software aziendali
e i nostri agenti AI analizzano ogni contratto e documento in automatico.
```

**CTA primario** (bottone arancione, stile identico a "Analizza il tuo documento"):
```
Iscriviti alla lista d'attesa
```

**CTA secondario** (bottone bordo, stile "Vedi i piani Pro"):
```
Scopri come funziona
```

**Trust signals** (sotto i CTA, stile identico alla homepage):
```
[Lock] Dati crittografati  ·  [Globe] Server in EU  ·  [Sparkles] Setup in 2 minuti
```

**Immagine destra**: illustrazione che mostra icone dei 3 connettori MVP (Fatture in Cloud, Google Drive, HubSpot) collegate da linee tratteggiate a un nodo centrale con il logo controlla.me e un piccolo scudo arancione.

---

### Sezione B — Value Proposition (4 pilastri)

**Header sezione**:
```
Etichetta: PERCHE SCEGLIERCI
Titolo: Non spostiamo dati. Li proteggiamo.
Sottotitolo: L'unica piattaforma che integra i tuoi strumenti aziendali
             E analizza legalmente ogni documento che ci passa dentro.
```

**4 pilastri** (griglia 2x2, stile delle card di `MissionSection.tsx` — rounded-2xl, border, bg-white, icona colorata):

| # | Icona | Titolo | Testo |
|---|-------|--------|-------|
| 1 | `Shield` (#4ECDC4) | Analisi legale automatica | Ogni contratto che transita viene analizzato dai nostri 4 agenti AI. Clausole vessatorie, squilibri, rischi nascosti — li troviamo prima che diventino problemi. |
| 2 | `Zap` (#FF6B35) | Zero lavoro manuale | Connetti una volta, protetto per sempre. I nuovi documenti vengono scansionati automaticamente — niente piu upload manuali, niente piu dimenticanze. |
| 3 | `Scale` (#A78BFA) | Normativa italiana integrata | 5.600+ articoli del corpus normativo italiano gia nel sistema. Codice Civile, Codice del Consumo, Statuto dei Lavoratori — le norme che contano per la tua azienda. |
| 4 | `Wallet` (#FFC832) | Costi da SaaS, non da consulente | Una revisione legale costa EUR 100-300. Con noi analizzi 200 documenti al mese per EUR 29.99. Costo per analisi: EUR 0.15. |

---

### Sezione C — Come Funziona (4 step)

**Header sezione**:
```
Etichetta: COME FUNZIONA
Titolo: Setup in 2 minuti. Protezione continua.
```

**4 step** (layout lineare orizzontale su desktop, verticale su mobile, frecce tra i passaggi):

| Step | Icona | Titolo | Descrizione |
|------|-------|--------|-------------|
| 1 | `Plug` | Connetti | Scegli il tuo software — Fatture in Cloud, Google Drive o HubSpot. Autorizzi l'accesso in un click con OAuth. |
| 2 | `FolderSearch` | Configura | Scegli quali cartelle, deal o tipi di documento monitorare. Noi guardiamo solo dove ci dici tu. |
| 3 | `Bot` | Analisi automatica | Ogni nuovo contratto o documento viene analizzato dai 4 agenti AI: classificazione, analisi rischi, verifica legale, consiglio. |
| 4 | `Bell` | Notifica | Ricevi un alert via email o nella tua dashboard. Se c'e un problema, lo sai subito. Se e tutto ok, dormi tranquillo. |

**Sotto gli step**: barra gradiente animata (stessa della pipeline agenti nella MissionSection) con i 4 colori degli agenti.

---

### Sezione D — Vetrina Connettori

**Header sezione**:
```
Etichetta: CONNETTORI
Titolo: I software che usi gia, ora sotto controllo.
Sottotitolo: Partiamo con i 3 strumenti piu usati dalle PMI italiane.
             Nuovi connettori in arrivo ogni trimestre.
```

**Griglia connettori** (3 colonne, card con logo, nome, categoria, stato):

| Connettore | Categoria | Stato | Descrizione card |
|-----------|-----------|-------|-----------------|
| **Fatture in Cloud** | Fatturazione | Disponibile al lancio | Il software di fatturazione #1 in Italia. Analizza automaticamente fatture, contratti e documenti commerciali. |
| **Google Drive** | Documenti | Disponibile al lancio | Connetti il tuo Drive e scegli le cartelle da monitorare. Ogni nuovo contratto PDF o Word viene analizzato in automatico. |
| **HubSpot** | CRM | Disponibile al lancio | I contratti allegati ai tuoi deal vengono analizzati in automatico. Il risultato appare direttamente nelle note del deal. |

**Sezione "In arrivo"** (griglia secondaria, card sfumate/disabilitate):

| Connettore | Categoria | Fase |
|-----------|-----------|------|
| Shopify | E-commerce | Q3 2026 |
| Zucchetti HR | Risorse umane | Q3 2026 |
| Slack | Comunicazione | Q3 2026 |
| Salesforce | CRM | Q4 2026 |
| WooCommerce | E-commerce | Q4 2026 |
| Microsoft Teams | Comunicazione | Q4 2026 |
| SharePoint | Documenti | Q4 2026 |

**CTA sotto la griglia**:
```
Non trovi il tuo software? Diccelo — lo costruiamo.
[Suggerisci un connettore]  (link a form/email)
```

---

### Sezione E — Confronto Competitor

**Header sezione**:
```
Etichetta: IL CONFRONTO
Titolo: Cosa ottieni che gli altri non danno.
```

**Tabella di confronto** (stile moderno con icone check/cross, colonna controlla.me evidenziata con bordo arancione):

| Funzionalita | controlla.me | Zapier | Make | MuleSoft |
|-------------|-------------|--------|------|----------|
| Integrazione dati | 10 connettori mirati | 7.000+ generici | 1.800+ generici | 400+ enterprise |
| Analisi legale AI | 4 agenti specializzati | -- | -- | -- |
| Normativa italiana | 5.600+ articoli | -- | -- | -- |
| Lingua interfaccia | Italiano nativo | Inglese | Inglese | Inglese |
| Connettori italiani | Fatture in Cloud, Zucchetti | -- | -- | -- |
| Prezzo mensile PMI | Da EUR 14.99 | Da $20 | Da $9 | Da $80.000/anno |
| Setup | 2 minuti, self-service | 10 min | 15 min | Settimane + consulente |
| Compliance EU AI Act | Audit trail integrato | -- | -- | -- |
| Target | PMI italiane | Globale, generico | Globale, generico | Enterprise |

**Nota sotto la tabella** (testo piccolo, tono trasparente):
```
Zapier e Make sono ottimi strumenti per automatizzare workflow generici.
Noi ci concentriamo su una cosa: assicurarci che i tuoi documenti aziendali
siano legalmente solidi. Strumenti diversi, scopi diversi.
```

---

### Sezione F — Pricing

**Header sezione**:
```
Etichetta: PIANI
Titolo: Scegli il piano giusto per la tua azienda.
Sottotitolo: Nessun vincolo, disdici quando vuoi.
```

**3 card pricing** (stile coerente con `/pricing`, la card centrale "Business" evidenziata con bordo arancione e badge "Piu popolare"):

#### Card 1 — Pro + Integrazione

```
EUR 14.99/mese

Tutto incluso nel piano Pro, piu:
- 1 connettore a scelta
- 50 documenti analizzati automaticamente al mese
- Alert via email per ogni rischio trovato
- Dashboard monitoring documenti

[Iscriviti alla waitlist]
```

#### Card 2 — Business (evidenziata)

```
EUR 29.99/mese
Badge: "Piu popolare"

- 3 connettori a scelta
- 200 documenti analizzati automaticamente al mese
- Alert via email + webhook personalizzabile
- Dashboard con storico analisi
- Risultati scritti nel CRM/Drive
- Supporto prioritario

[Iscriviti alla waitlist]
```

#### Card 3 — Business+

```
EUR 49.99/mese

- Tutti i connettori disponibili
- 500 documenti analizzati automaticamente al mese
- Tutto del piano Business
- Onboarding dedicato
- API access (futuro)

[Iscriviti alla waitlist]
```

**Sotto le card** (trust signals):
```
EUR 0.15 per documento analizzato — 1.000 volte meno di un consulente.
Nessun costo nascosto. Nessun contratto annuale.
```

---

### Sezione G — Social Proof / Testimonianze

**Header sezione**:
```
Etichetta: DALLA BETA
Titolo: Cosa dicono le prime aziende.
```

**3 testimonianze** (card con avatar, nome, ruolo, azienda — stile quote della `UseCasesSection`):

> "Avevamo 200 contratti su Google Drive che nessuno aveva mai riletto. In una settimana ne abbiamo analizzati 180 e trovato 12 clausole vessatorie."
> — **Lucia M.**, Responsabile Amministrativa, PMI settore manufatturiero

> "Connettere Fatture in Cloud e stato questione di 2 click. Ora ogni fattura con termini contrattuali viene controllata in automatico."
> — **Marco P.**, Titolare, Studio professionale

> "Il vero valore e che non devo piu ricordarmi di caricare i documenti. Il sistema li prende da HubSpot quando il deal avanza."
> — **Sara T.**, Sales Manager, Startup SaaS

*Nota: queste sono testimonianze placeholder. Verranno sostituite con feedback reali dei beta tester.*

---

### Sezione H — FAQ

**Header sezione**:
```
Etichetta: DOMANDE FREQUENTI
Titolo: Tutto chiaro? Se no, eccoci.
```

**FAQ** (accordion espandibile):

**1. I miei dati sono al sicuro?**

> Assolutamente. I documenti vengono analizzati in memoria e non vengono mai salvati sui nostri server. Usiamo crittografia end-to-end e i nostri server sono in EU. Siamo progettati per essere conformi al GDPR e all'EU AI Act.

**2. Quanto tempo richiede il setup?**

> Due minuti. Scegli il connettore, autorizza l'accesso con un click (OAuth) e seleziona quali cartelle o deal monitorare. Fatto. Nessuna installazione, nessun codice.

**3. Posso scegliere quali documenti monitorare?**

> Si. Per ogni connettore puoi definire filtri: cartelle specifiche su Google Drive, tag su HubSpot, tipi di documento su Fatture in Cloud. Monitoriamo solo quello che vuoi tu.

**4. Cosa succede quando trovate un problema?**

> Ricevi un alert via email con un riepilogo del rischio e un link al report completo. Il report include la clausola problematica, la norma violata, e un consiglio pratico su cosa fare.

**5. E se il mio software non e nella lista?**

> Stiamo aggiungendo nuovi connettori ogni trimestre. Puoi suggerirci il tuo software e daremo priorita ai piu richiesti. I prossimi in arrivo: Shopify, Zucchetti HR e Slack.

**6. Sostituisce il mio avvocato?**

> No, e non vogliamo farlo. Controlla.me e un primo livello di screening che ti dice se c'e qualcosa che non va. Per problemi seri, ti consigliamo sempre di consultare un professionista. E lo diciamo nel report stesso.

**7. Come funziona il pricing? Pago per documento?**

> No, paghi un abbonamento mensile fisso con un numero di documenti inclusi. Nessun costo a sorpresa. Se superi il limite mensile, i documenti extra vengono messi in coda per il mese successivo.

**8. Posso provare gratis?**

> Il piano base di controlla.me include 3 analisi manuali gratuite al mese. Per le integrazioni automatiche, stiamo preparando una beta gratuita di 14 giorni. Iscriviti alla waitlist per accedere.

---

### Sezione I — CTA Finale

**Layout**: stile identico a `CTASection.tsx` — card arrotondata con sfondo gradiente arancione, icona centrale, headline, sottotitolo, doppio CTA.

```
Icona: [Plug] (al posto dello Shield della homepage)

Titolo: Pronto a lavorare tranquillo?

Sottotitolo: Iscriviti alla lista d'attesa. Sarai tra i primi a provare
             le integrazioni quando saranno pronte.

CTA 1: [Iscriviti alla waitlist]  (bottone arancione)
CTA 2: [Prenota una demo]         (bottone bordo)
```

---

## 2. Guide Connettori

### 2.1 Template struttura guida

Ogni guida segue la stessa struttura. URL pattern: `/guide/connettere-[nome-software]`.

```markdown
# Come connettere [Nome Software] a controlla.me

[Badge]: Guida · Tempo di lettura: X minuti

## Cosa ottieni
Descrizione in 2-3 righe di cosa succede quando connetti questo software.

## Prerequisiti
- Account [Software] attivo (piano minimo richiesto se applicabile)
- Account controlla.me con piano Pro + Integrazione o superiore
- [Eventuali prerequisiti specifici]

## Step 1: Accedi alle Integrazioni
1. Accedi a controlla.me
2. Vai su **Dashboard > Integrazioni**
3. Clicca su **Aggiungi connettore**

[Screenshot placeholder: dashboard integrazioni]

## Step 2: Autorizza [Software]
1. Seleziona [Software] dalla lista
2. Clicca **Connetti**
3. Verrai reindirizzato alla pagina di autorizzazione di [Software]
4. Clicca **Autorizza** per dare accesso in lettura ai tuoi documenti

[Screenshot placeholder: schermata OAuth]

> Nota: controlla.me richiede solo permessi di lettura. Non modifichiamo
> mai i tuoi dati su [Software].

## Step 3: Configura il monitoraggio
[Specifico per connettore — cartelle, tag, filtri]

[Screenshot placeholder: configurazione filtri]

## Step 4: Verifica la connessione
1. Torna su **Dashboard > Integrazioni**
2. Il connettore mostrera stato "Connesso" con un punto verde
3. Clicca **Test connessione** per verificare

[Screenshot placeholder: stato connesso]

## Come leggere i risultati
[Descrizione dell'alert email e del report nella dashboard]

## Troubleshooting

### "Errore di autorizzazione"
- Verifica di essere loggato su [Software] con l'account corretto
- Controlla che il tuo piano [Software] supporti le API
- Riprova da un browser in modalita incognito

### "Nessun documento trovato"
- Verifica di aver selezionato la cartella/tag corretti
- Controlla che i documenti siano nei formati supportati (PDF, DOCX, TXT)
- Attendi qualche minuto: la prima scansione puo richiedere fino a 5 minuti

### "Connessione scaduta"
- Le autorizzazioni OAuth scadono periodicamente
- Vai su Dashboard > Integrazioni e clicca **Riconnetti**

## FAQ specifiche per [Software]
[2-3 domande specifiche del connettore]
```

---

### 2.2 Guida 1: Fatture in Cloud

# Come connettere Fatture in Cloud a controlla.me

**Badge**: Guida · Tempo di lettura: 3 minuti

## Cosa ottieni

Ogni fattura, contratto e documento commerciale caricato su Fatture in Cloud viene analizzato automaticamente dai nostri agenti AI. Clausole rischiose, termini squilibrati, scadenze critiche — li troviamo noi.

## Prerequisiti

- Account Fatture in Cloud attivo (qualsiasi piano, incluso base)
- Account controlla.me con piano **Pro + Integrazione** o superiore
- Almeno un documento (fattura o contratto) gia presente su Fatture in Cloud

## Step 1: Accedi alle Integrazioni

1. Accedi a [controlla.me](https://controlla.me)
2. Vai su **Dashboard > Integrazioni**
3. Clicca **Aggiungi connettore**
4. Seleziona **Fatture in Cloud** dalla lista

[Screenshot placeholder: selezione Fatture in Cloud nella lista connettori]

## Step 2: Autorizza Fatture in Cloud

1. Clicca **Connetti Fatture in Cloud**
2. Verrai reindirizzato alla pagina di login TeamSystem
3. Inserisci le tue credenziali Fatture in Cloud
4. Clicca **Autorizza** per consentire l'accesso in sola lettura

[Screenshot placeholder: schermata autorizzazione TeamSystem OAuth]

> **Importante**: controlla.me richiede solo permessi di **lettura**. Non emettiamo fatture, non modifichiamo documenti, non accediamo ai dati di pagamento.

## Step 3: Configura il monitoraggio

1. Dopo l'autorizzazione, tornerai automaticamente su controlla.me
2. Scegli cosa monitorare:
   - **Fatture attive** — analizza le fatture emesse e ricevute
   - **Documenti allegati** — analizza contratti e documenti caricati come allegati
   - **Tutto** — monitora sia fatture che documenti
3. Opzionale: imposta filtri per data o importo minimo
4. Clicca **Salva configurazione**

[Screenshot placeholder: pannello configurazione monitoraggio]

## Step 4: Verifica la connessione

1. Nella pagina Integrazioni, Fatture in Cloud mostrera lo stato **Connesso** (punto verde)
2. Clicca **Test connessione** per verificare che tutto funzioni
3. Il sistema scansionera gli ultimi 10 documenti come test

[Screenshot placeholder: stato connesso con ultimo documento analizzato]

## Come leggere i risultati

Quando un documento viene analizzato:
- Ricevi una **email di notifica** con il riepilogo
- Il report completo appare nella **Dashboard > Analisi automatiche**
- Ogni report include: classificazione del documento, clausole rischiose trovate, normativa applicabile, consiglio pratico

Se non vengono trovati rischi, ricevi una conferma silenziosa (nessuna email, visibile in dashboard).

## Troubleshooting

### "Errore di autorizzazione TeamSystem"
- Verifica di usare le credenziali corrette di Fatture in Cloud (non quelle di altri prodotti TeamSystem)
- Se usi l'autenticazione a due fattori, assicurati di completare anche quel passaggio
- Prova ad accedere prima a Fatture in Cloud in un'altra scheda per verificare le credenziali

### "Nessun documento trovato"
- Fatture in Cloud potrebbe impiegare qualche minuto per sincronizzarsi
- Verifica che ci siano effettivamente documenti nel periodo selezionato
- Controlla che i filtri impostati non siano troppo restrittivi

### "Le fatture non vengono analizzate"
- Le fatture puramente numeriche (senza testo contrattuale) vengono saltate automaticamente: non c'e nulla da analizzare legalmente
- Se una fattura ha allegati contrattuali (condizioni generali, termini di fornitura), quelli vengono analizzati

## FAQ specifiche

**Posso connettere piu aziende di Fatture in Cloud?**
Si, se gestisci piu aziende su Fatture in Cloud puoi connetterle separatamente. Ogni azienda conta come un connettore.

**I dati di fatturazione (importi, IVA) vengono analizzati?**
No. Analizziamo solo il testo contrattuale e le condizioni. I dati contabili non ci interessano e non vengono salvati.

**Funziona anche con le fatture elettroniche XML?**
Si. Estraiamo il testo dalle fatture elettroniche in formato XML/SDI per analizzare eventuali condizioni contrattuali incluse.

---

### 2.3 Guida 2: Google Drive

# Come connettere Google Drive a controlla.me

**Badge**: Guida · Tempo di lettura: 3 minuti

## Cosa ottieni

Scegli le cartelle del tuo Google Drive da monitorare. Ogni contratto, accordo o documento legale che viene aggiunto o modificato viene analizzato automaticamente dai nostri agenti AI.

## Prerequisiti

- Account Google con Google Drive attivo (personale o Google Workspace)
- Account controlla.me con piano **Pro + Integrazione** o superiore
- Almeno una cartella con documenti contrattuali (PDF, DOCX o Google Docs)

## Step 1: Accedi alle Integrazioni

1. Accedi a [controlla.me](https://controlla.me)
2. Vai su **Dashboard > Integrazioni**
3. Clicca **Aggiungi connettore**
4. Seleziona **Google Drive** dalla lista

[Screenshot placeholder: selezione Google Drive nella lista connettori]

## Step 2: Autorizza Google Drive

1. Clicca **Connetti Google Drive**
2. Seleziona l'account Google da connettere
3. Controlla i permessi richiesti: **sola lettura sui file di Drive**
4. Clicca **Consenti**

[Screenshot placeholder: schermata consenso Google OAuth]

> **Nota privacy**: chiediamo accesso in sola lettura. Non possiamo modificare, cancellare o condividere i tuoi file. L'accesso puo essere revocato in qualsiasi momento dalle impostazioni del tuo account Google.

## Step 3: Scegli le cartelle da monitorare

1. Dopo l'autorizzazione, vedrai l'albero delle cartelle del tuo Drive
2. Seleziona le cartelle che contengono documenti contrattuali
   - Esempio: `Contratti clienti`, `Fornitori`, `HR - Assunzioni`
3. Opzionale: attiva **Sottocartelle** per monitorare anche i contenuti delle sotto-cartelle
4. Opzionale: filtra per tipo file (solo PDF, solo DOCX, o tutti)
5. Clicca **Salva configurazione**

[Screenshot placeholder: selettore cartelle Drive con checkbox]

> **Consiglio**: inizia con una o due cartelle per verificare che tutto funzioni. Potrai aggiungerne altre in qualsiasi momento.

## Step 4: Verifica la connessione

1. Nella pagina Integrazioni, Google Drive mostrera lo stato **Connesso**
2. Clicca **Test connessione** — il sistema leggera gli ultimi file dalla cartella selezionata
3. I primi documenti verranno analizzati entro 5 minuti

[Screenshot placeholder: stato connesso con log prima scansione]

## Come leggere i risultati

- **Nuovo documento aggiunto alla cartella** → analisi automatica entro 5 minuti, email di notifica se ci sono rischi
- **Documento modificato** → nuova analisi con confronto rispetto alla versione precedente
- **Dashboard** → tutti i documenti analizzati con stato, rischi trovati e report completo

## Troubleshooting

### "Non vedo le mie cartelle"
- Verifica di aver selezionato l'account Google corretto (se ne hai piu di uno)
- Se usi Google Workspace aziendale, l'amministratore potrebbe dover abilitare le app di terze parti
- Le cartelle condivise con te appaiono solo se hai almeno accesso in lettura

### "I Google Docs non vengono analizzati"
- I Google Docs vengono esportati automaticamente in formato testo per l'analisi
- Se un Google Doc e vuoto o contiene solo immagini, verra saltato
- Fogli di calcolo (Google Sheets) e presentazioni (Google Slides) non sono supportati

### "L'autorizzazione e scaduta"
- Le autorizzazioni Google scadono se non vengono usate per un periodo prolungato
- Vai su **Dashboard > Integrazioni** e clicca **Riconnetti**
- Se il problema persiste, revoca l'accesso dalle [impostazioni Google](https://myaccount.google.com/permissions) e riconnetti

## FAQ specifiche

**Posso monitorare i file di un Drive condiviso (Shared Drive)?**
Si. I Drive condivisi di Google Workspace sono supportati. Selezionali dalla lista cartelle durante la configurazione.

**Vengono analizzate anche le immagini (foto di contratti)?**
Non ancora. L'OCR (riconoscimento testo da immagini) e in fase di sviluppo. Per ora, analizza i PDF e i DOCX. Se hai foto di contratti, ti consigliamo di convertirli in PDF prima di caricarli.

**Quanto spazio Drive viene usato?**
Zero. Non salviamo copie dei tuoi file. Li leggiamo, li analizziamo in memoria e salviamo solo il risultato dell'analisi.

---

### 2.4 Guida 3: HubSpot

# Come connettere HubSpot a controlla.me

**Badge**: Guida · Tempo di lettura: 4 minuti

## Cosa ottieni

I contratti allegati ai deal del tuo HubSpot CRM vengono analizzati automaticamente quando il deal cambia fase. Il risultato dell'analisi viene scritto nelle note del deal, cosi tutto il team commerciale vede subito se c'e un problema.

## Prerequisiti

- Account HubSpot (Free CRM, Starter, Professional o Enterprise)
- Account controlla.me con piano **Pro + Integrazione** o superiore
- Almeno un deal con documenti allegati (contratti, offerte, T&C)

## Step 1: Accedi alle Integrazioni

1. Accedi a [controlla.me](https://controlla.me)
2. Vai su **Dashboard > Integrazioni**
3. Clicca **Aggiungi connettore**
4. Seleziona **HubSpot** dalla lista

[Screenshot placeholder: selezione HubSpot nella lista connettori]

## Step 2: Autorizza HubSpot

1. Clicca **Connetti HubSpot**
2. Seleziona il portale HubSpot da connettere
3. Verifica i permessi: **lettura deal, lettura allegati, scrittura note**
4. Clicca **Connetti app**

[Screenshot placeholder: schermata autorizzazione HubSpot OAuth]

> **Perche scrittura note?** Per scrivere il risultato dell'analisi direttamente nelle note del deal. Non modifichiamo nessun altro dato del deal (importo, fase, contatto, ecc.).

## Step 3: Configura il monitoraggio

1. Scegli quando analizzare i documenti:
   - **Su cambio fase** — quando un deal passa a una fase specifica (es. "Contratto inviato", "Negoziazione")
   - **Nuovo allegato** — ogni volta che un documento viene allegato a un deal
   - **Entrambi** (consigliato)
2. Opzionale: filtra per pipeline specifica
3. Opzionale: scegli se scrivere i risultati come nota nel deal (consigliato)
4. Clicca **Salva configurazione**

[Screenshot placeholder: configurazione trigger e filtri HubSpot]

## Step 4: Verifica la connessione

1. Nella pagina Integrazioni, HubSpot mostrera lo stato **Connesso**
2. Clicca **Test connessione** — il sistema leggera l'ultimo deal con allegati
3. Se c'e un contratto allegato, verra analizzato come test

[Screenshot placeholder: stato connesso con test deal]

## Come funziona nel flusso quotidiano

```
Deal "Contratto Fornitore ABC" → fase "Contratto inviato"
     |
     controlla.me rileva il cambio fase
     |
     Legge il PDF allegato al deal
     |
     4 agenti AI analizzano il contratto
     |
     Risultato scritto come nota nel deal:
     "controlla.me: 2 clausole rischiose trovate.
      - Clausola di recesso unilaterale (rischio alto)
      - Penale eccessiva per ritardo (rischio medio)
      Report completo: [link]"
```

## Troubleshooting

### "HubSpot chiede permessi che non voglio concedere"
- I permessi richiesti sono il minimo necessario
- Se sei un utente non-admin, chiedi al tuo admin HubSpot di autorizzare l'app
- Per portali HubSpot Enterprise: l'app potrebbe richiedere l'approvazione del super admin

### "I deal non vengono analizzati"
- Verifica che il deal abbia effettivamente allegati in formato supportato (PDF, DOCX)
- Controlla che il deal sia nella pipeline monitorata
- Se usi il trigger "su cambio fase", verifica che il deal sia effettivamente passato alla fase configurata

### "Le note non appaiono nel deal"
- Verifica che l'opzione "Scrivi risultati come nota" sia attiva nella configurazione
- Le note possono impiegare fino a 1 minuto per apparire
- Se usi HubSpot Free, alcune limitazioni API possono rallentare la scrittura delle note

## FAQ specifiche

**Funziona con HubSpot Free?**
Si. L'API di HubSpot Free supporta la lettura di deal e allegati. Alcune funzionalita avanzate (webhook real-time) richiedono HubSpot Professional.

**Posso analizzare anche i documenti di Marketing Hub?**
Per ora monitoriamo solo i deal di Sales Hub. Il supporto per documenti di Marketing Hub (template email, landing page) e nella roadmap.

**I risultati sono visibili a tutto il team?**
Si. La nota viene scritta nel deal con l'utente "controlla.me Bot", visibile a chiunque abbia accesso al deal. Puoi gestire la visibilita tramite i permessi standard di HubSpot.

---

## 3. Strategia di Posizionamento

### 3.1 Persona target: PMI italiana (5-50 dipendenti)

**Nome**: Giulia, 42 anni
**Ruolo**: Titolare / Responsabile amministrativa di una PMI manifatturiera con 18 dipendenti

**Contesto**:
- Gestisce 5-8 software diversi (fatturazione, CRM, email, Drive, HR)
- Nessun reparto IT dedicato — si arrangia con il gestionale e il commercialista
- Firma/riceve 10-20 contratti al mese (fornitori, clienti, dipendenti)
- Ha avuto almeno un'esperienza negativa con un contratto non letto bene
- Il suo commercialista costa EUR 200/ora e non ha tempo per rileggere ogni contratto

**Pain points**:
1. "Firmo contratti senza leggerli perche non ho tempo" (80% delle PMI)
2. "Il consulente legale costa troppo per ogni documento" (EUR 100-300 a revisione)
3. "I miei documenti sono sparsi tra Drive, email, Fatture in Cloud — non ho una visione d'insieme"
4. "Non so se i miei contratti sono conformi alle ultime normative" (GDPR, Codice del Consumo, Statuto Lavoratori)
5. "Zapier e Make sono in inglese e non capiscono nulla di legge italiana"

**Cosa cerca**:
- Soluzione italiana, in italiano, che capisca la normativa locale
- Setup rapido — non ha settimane da dedicare a un onboarding
- Prezzo da SaaS, non da consulente — EUR 15-50/mese massimo
- Risultati chiari — niente legalese, consigli pratici

### 3.2 Pain points indirizzati dall'Ufficio Integrazione

| Pain point | Come lo risolviamo |
|-----------|-------------------|
| "Non ho tempo di caricare i documenti manualmente" | Integrazione automatica — i documenti arrivano da soli dai tuoi software |
| "Il consulente legale costa troppo" | EUR 0.15 per documento analizzato vs EUR 100-300 a revisione manuale |
| "I miei documenti sono sparsi ovunque" | Dashboard unica con visione su tutti i connettori |
| "Non capisco la normativa" | 5.600+ articoli del corpus italiano, spiegazioni senza legalese |
| "Gli strumenti sono in inglese" | Interfaccia italiana nativa, risultati in italiano, normativa italiana |
| "Non so cosa devo controllare" | I 4 agenti AI controllano tutto: clausole, equilibrio, normativa, consiglio |

### 3.3 Valore unico: AI legale + Integrazione dati

Nessun competitor al mondo combina questi due asset:

1. **Analisi legale AI con corpus normativo italiano** — 4 agenti specializzati, 5.600+ articoli, verticali HR/consumer/immobiliare
2. **Integrazione nativa con software italiani** — Fatture in Cloud (fatturazione obbligatoria), Zucchetti HR (leader payroll IT)

Zapier/Make spostano dati. Noi li _comprendiamo_ legalmente.

### 3.4 Messaging framework

**Headline principale**:
> Connetti i tuoi strumenti. Noi li controlliamo.

**Tagline** (per social, email header, meta description):
> L'unica piattaforma che integra i tuoi software aziendali e analizza legalmente ogni documento.

**Elevator pitch** (30 secondi):
> Controlla.me e una piattaforma AI che analizza i tuoi documenti legali. Con il nuovo Ufficio Integrazione, puoi connettere Fatture in Cloud, Google Drive e HubSpot: ogni contratto che arriva viene analizzato automaticamente da 4 agenti AI specializzati in normativa italiana. Costa EUR 29.99 al mese — mille volte meno di un consulente legale. Setup in 2 minuti, risultati immediati.

**Variazioni per canale**:

| Canale | Messaggio |
|--------|----------|
| LinkedIn (PMI owner) | "200 contratti analizzati al mese per EUR 29.99. Il tuo consulente legale ti chiede EUR 200 per uno solo. Connetti i tuoi software e dormi tranquillo." |
| Email nurturing | "Hai contratti su Google Drive che nessuno ha mai riletto? Connettili a controlla.me e scopri cosa c'e dentro — in automatico." |
| Google Ads | "Analisi legale automatica dei tuoi contratti aziendali. Connetti Fatture in Cloud, Drive, HubSpot. Da EUR 14.99/mese." |
| SEO blog title | "Come analizzare automaticamente i contratti della tua PMI (senza avvocato)" |

### 3.5 Matrice di differenziazione competitiva

```
                    Complessita Setup
                Semplice              Complesso
              +------------+-----------+
    Alto      | CONTROLLA.ME|           |
              | Integrazione| Juro,     |
   Valore     | (target)   | Ironclad  |
   Legale     |            |           |
              +------------+-----------+
              |            |           |
    Basso     | Zapier,    | MuleSoft, |
              | Make, n8n  | Boomi     |
              |            |           |
              +------------+-----------+
```

**Contro Zapier/Make**: "Loro spostano dati. Noi li analizziamo legalmente."
**Contro MuleSoft/Boomi**: "Loro servono enterprise con budget da EUR 80.000/anno. Noi serviamo PMI a EUR 29.99/mese."
**Contro consulenti legali**: "Loro costano EUR 200 per un contratto. Noi analizziamo 200 contratti per EUR 29.99/mese."
**Contro tool CLM (Juro, Ironclad)**: "Loro gestiscono il ciclo di vita del contratto. Noi controlliamo che sia legalmente solido, integrato con i tuoi software esistenti."

---

## 4. Sequenza di Lancio

### 4.1 Pre-lancio (6 settimane prima del lancio)

**Settimana -6 / -5: Preparazione**

| Attivita | Canale | Owner |
|----------|--------|-------|
| Pubblicare landing page `/integrazione` con form waitlist | Web | UX/UI + Marketing |
| Creare pagina "Coming Soon" con countdown | Web | UX/UI |
| Setup Mailchimp/Resend per sequenza email waitlist | Email | Marketing |
| Scrivere 2 articoli blog SEO (vedi sezione 5) | Blog | Marketing |
| Creare LinkedIn post teaser: "Qualcosa di nuovo sta arrivando..." | LinkedIn | Marketing |

**Settimana -4 / -3: Build anticipation**

| Attivita | Canale | Owner |
|----------|--------|-------|
| Email 1 alla waitlist: "Ecco cosa stiamo costruendo" (preview screenshot) | Email | Marketing |
| LinkedIn post: "Le PMI italiane usano 5-8 software non integrati. E nessuno controlla i contratti che ci passano dentro." | LinkedIn | Marketing |
| Pubblicare articolo blog: "5 clausole vessatorie che le PMI non controllano mai" | Blog | Marketing |
| Contattare 20 PMI target per beta chiusa | Direct | Marketing + CME |
| Preparare demo video (Loom, 3 minuti) | Video | Marketing |

**Settimana -2 / -1: Hype finale**

| Attivita | Canale | Owner |
|----------|--------|-------|
| Email 2 alla waitlist: "Mancano 7 giorni. Ecco i 3 connettori al lancio." | Email | Marketing |
| LinkedIn: post demo video | LinkedIn | Marketing |
| Pubblicare le 3 guide connettori sul blog | Blog | Marketing |
| Inviare accesso beta ai 10-20 PMI selezionate | Email | Marketing + CME |
| Preparare press kit (screenshot, one-pager, pricing) | PR | Marketing |

### 4.2 Lancio (Giorno 0)

| Attivita | Canale | Timing |
|----------|--------|--------|
| Email 3 alla waitlist: "Siamo live. Accedi ora." con link diretto | Email | 09:00 |
| LinkedIn post annuncio (video demo + link) | LinkedIn | 09:30 |
| Post su Reddit r/commercialisti, r/startupitalia (se esistono, o community equivalenti) | Reddit | 10:00 |
| Product Hunt launch (se prodotto in inglese, opzionale) | Product Hunt | 10:00 |
| Inviare comunicato stampa a TechCrunch IT, StartupItalia, Wired IT | PR | 10:00 |
| Email personalizzata ai beta tester: "Grazie per il feedback, ora e per tutti" | Email | 11:00 |
| Monitorare signup, errori, feedback in tempo reale | Dashboard | Tutto il giorno |

### 4.3 Post-lancio: Calendario contenuti (4 settimane)

#### Settimana 1

| Giorno | Tipo | Titolo/Contenuto |
|--------|------|-----------------|
| Lun | Blog | "Come connettere Fatture in Cloud a controlla.me — guida completa" |
| Mar | LinkedIn | Dato: "Il 68% delle PMI italiane non ha personale IT dedicato. Per questo il setup richiede 2 minuti." |
| Gio | Email | Newsletter: "Primo report settimanale: X documenti analizzati, Y rischi trovati" |
| Ven | LinkedIn | Testimonianza beta tester (con permesso) |

#### Settimana 2

| Giorno | Tipo | Titolo/Contenuto |
|--------|------|---|
| Lun | Blog | "Perche un'analisi legale automatica costa EUR 0.15 e un avvocato EUR 200" |
| Mar | LinkedIn | Mini-caso: "Abbiamo trovato una clausola vessatoria in un contratto di fornitura da EUR 50.000. Tempo: 30 secondi." |
| Gio | Email | Newsletter: "Guida: come connettere Google Drive in 2 minuti" |
| Ven | LinkedIn | Confronto visuale: workflow manuale vs automatico |

#### Settimana 3

| Giorno | Tipo | Titolo/Contenuto |
|--------|------|---|
| Lun | Blog | "EU AI Act 2026: cosa cambia per le PMI che usano software con AI" |
| Mar | LinkedIn | Dato dal corpus: "Lo sapevi che il Codice del Consumo prevede X?" |
| Gio | Email | Newsletter: "Case study: [azienda beta] ha analizzato 180 contratti in una settimana" |
| Ven | LinkedIn | Behind the scenes: come funzionano i 4 agenti AI |

#### Settimana 4

| Giorno | Tipo | Titolo/Contenuto |
|--------|------|---|
| Lun | Blog | "5 cose da controllare in un contratto di fornitura prima di firmarlo" |
| Mar | LinkedIn | Annuncio: "Prossimi connettori in arrivo: Shopify e Slack" |
| Gio | Email | Newsletter: report mensile + invito a condividere feedback |
| Ven | LinkedIn | AMA (Ask Me Anything): "Chiedici qualsiasi cosa sulle integrazioni" |

### 4.4 Metriche da tracciare

| Metrica | Strumento | Target lancio (30 giorni) |
|---------|----------|--------------------------|
| **Iscrizioni waitlist** | Form + Mailchimp/Resend | 500 email |
| **Signup post-lancio** | Supabase analytics | 100 nuovi account |
| **Connettori attivati** | Dashboard integrazioni | 30 connettori totali (tra tutti gli utenti) |
| **Conversion waitlist -> signup** | Funnel tracking | > 20% |
| **Conversion signup -> connettore attivato** | Funnel tracking | > 30% |
| **Documenti analizzati automaticamente** | Supabase `integration_events` | 500 documenti |
| **Churn rate primo mese** | Stripe | < 15% |
| **NPS beta tester** | Survey (Typeform) | > 30 |
| **MRR** | Stripe | EUR 500 |
| **Cost per acquisition (CPA)** | Analytics | < EUR 10 (organico) |
| **Traffico landing page** | GA4 | 2.000 visite |
| **Bounce rate landing page** | GA4 | < 50% |

---

## 5. Strategia SEO

### 5.1 Keyword target (italiano)

#### Keyword primarie (alta intenzione commerciale)

| Keyword | Volume stimato | Difficolta | Pagina target |
|---------|---------------|-----------|---------------|
| analisi contratti automatica | 90-200/mese | Media | `/integrazione` |
| software analisi contratti | 70-150/mese | Media | `/integrazione` |
| revisione contratti AI | 50-100/mese | Bassa | `/integrazione` |
| controllo contratti online | 40-90/mese | Bassa | `/integrazione` |
| compliance contratti PMI | 30-70/mese | Bassa | Blog |
| analisi legale automatica | 60-120/mese | Media | `/integrazione` |

#### Keyword long-tail (blog content)

| Keyword | Volume stimato | Articolo proposto |
|---------|---------------|-------------------|
| clausole vessatorie contratto fornitura | 200-400/mese | "5 clausole vessatorie nei contratti di fornitura" |
| come controllare un contratto | 300-600/mese | "Come controllare un contratto prima di firmarlo" |
| contratto di lavoro clausole illegali | 400-800/mese | Articolo gia esistente: `clausole-illegali-contratto-lavoro.md` |
| diritto recesso consumatore | 500-1000/mese | Articolo gia esistente: `diritto-recesso-consumatore-tempistiche.md` |
| eu ai act contratti | 50-100/mese | Articolo gia esistente: `eu-ai-act-contratti-obblighi-2026.md` |
| fatturazione elettronica obblighi | 1000-2000/mese | Nuovo: "Fatturazione elettronica e compliance contrattuale" |
| come integrare fatture in cloud | 100-200/mese | Guida connettore Fatture in Cloud |
| contratti Google Drive organizzare | 50-100/mese | Guida connettore Google Drive |
| HubSpot analisi contratti | 20-50/mese | Guida connettore HubSpot |

#### Keyword brand/competitor

| Keyword | Strategia |
|---------|----------|
| zapier alternativa italiana | Blog: "Zapier per i contratti? Ecco un'alternativa migliore" |
| make integromat contratti | Blog: "Automazione contratti: Make vs analisi legale AI" |
| analisi contratti gratis | Landing page con CTA "3 analisi gratis" |

### 5.2 Content pillars per il blog

Il blog serve 3 funzioni strategiche: SEO (traffico organico), educazione (trust building), e intelligence (segnali di mercato dai commenti e condivisioni).

#### Pillar 1: Guide pratiche contratti

Articoli "come fare" che risolvono problemi concreti delle PMI. Alta intenzione di ricerca, buona conversione.

- "Come controllare un contratto prima di firmarlo: checklist completa"
- "5 clausole vessatorie nei contratti di fornitura che le PMI non controllano"
- "Contratto di lavoro: 7 cose da verificare prima di far firmare un dipendente"
- "Contratto d'affitto commerciale: cosa controllare se sei l'inquilino"
- "Rinnovo tacito: cos'e e come proteggersi"

#### Pillar 2: Normativa e compliance

Articoli educativi sulle norme che impattano le PMI. Posizionano controlla.me come autorevole.

- "EU AI Act 2026: cosa cambia per le PMI che usano software con AI" (gia esistente)
- "GDPR e contratti: obblighi per le PMI nel 2026"
- "Codice del Consumo: i diritti che i tuoi clienti non sanno di avere"
- "Fatturazione elettronica e compliance contrattuale: la guida"
- "Statuto dei Lavoratori: cosa deve sapere un imprenditore nel 2026"

#### Pillar 3: Integrazione e automazione

Articoli specifici sull'integrazione software + analisi legale. Differenziazione rispetto ai competitor.

- "Come analizzare automaticamente i contratti della tua PMI (senza avvocato)"
- "Fatture in Cloud + AI legale: come funziona l'integrazione"
- "Google Drive per PMI: come organizzare e controllare i tuoi contratti"
- "HubSpot e compliance: analizzare i contratti dei tuoi deal in automatico"
- "Zapier per i contratti? Ecco perche ti serve qualcosa di diverso"

### 5.3 SEO tecnico per le pagine connettori

#### Struttura URL

```
/integrazione                          — landing page principale
/integrazione/fatture-in-cloud         — pagina connettore + guida
/integrazione/google-drive             — pagina connettore + guida
/integrazione/hubspot                  — pagina connettore + guida
/integrazione/shopify                  — pagina "coming soon" con waitlist
/integrazione/zucchetti-hr             — pagina "coming soon" con waitlist
/integrazione/slack                    — pagina "coming soon" con waitlist
```

#### Meta tag per `/integrazione`

```html
<title>Integrazione Contratti AI per PMI | controlla.me</title>
<meta name="description" content="Connetti Fatture in Cloud, Google Drive e HubSpot. I nostri agenti AI analizzano automaticamente ogni contratto e documento. Da EUR 14.99/mese." />
<meta property="og:title" content="controlla.me — Connetti i tuoi strumenti. Noi li controlliamo." />
<meta property="og:description" content="L'unica piattaforma che integra i tuoi software aziendali e analizza legalmente ogni documento. Setup in 2 minuti." />
<meta property="og:image" content="/images/og-integrazione.png" />
```

#### Meta tag per pagine connettore (esempio Fatture in Cloud)

```html
<title>Connettere Fatture in Cloud per Analisi Legale AI | controlla.me</title>
<meta name="description" content="Connetti Fatture in Cloud a controlla.me. Ogni fattura e contratto viene analizzato automaticamente da 4 agenti AI. Guida completa con setup in 2 minuti." />
```

#### Schema markup (JSON-LD)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "controlla.me Integrazione",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "14.99",
    "highPrice": "49.99",
    "priceCurrency": "EUR",
    "offerCount": 3
  },
  "description": "Piattaforma di analisi legale AI con integrazione automatica per PMI italiane. Connetti Fatture in Cloud, Google Drive e HubSpot."
}
```

#### FAQ Schema (per la sezione FAQ)

Aggiungere markup `FAQPage` per ogni domanda/risposta, in modo che appaiano come rich snippet nei risultati di ricerca Google.

#### Internal linking

- Dalla homepage: link nella navbar "Integrazioni" che punta a `/integrazione`
- Dalle guide connettori: link agli articoli blog rilevanti (es. guida Fatture in Cloud -> articolo su fatturazione elettronica)
- Dagli articoli blog: link alla landing page integrazione come CTA
- Dalla pagina `/pricing`: menzione dei piani integrazione con link a `/integrazione`
- Dalla pagina `/corpus`: link cross "I nostri agenti usano questo corpus per analizzare i tuoi documenti integrati"

#### Sitemap

Aggiungere tutte le pagine `/integrazione/*` alla sitemap XML. Priorita 0.8 per la landing, 0.6 per le pagine connettore.

---

## Note finali

### Dipendenze da altri dipartimenti

| Dipartimento | Necessita | Priorita |
|-------------|-----------|----------|
| **UX/UI** | Implementazione landing page `/integrazione`, design connettori grid, setup wizard | P0 |
| **Architecture** | Struttura route `/integrazione` + sotto-pagine | P1 |
| **Data Engineering** | Implementazione connettori MVP (per avere screenshot reali nelle guide) | P1 |
| **QA** | Test della landing page su mobile/desktop, verifica link, form waitlist | P2 |

### Timeline marketing

| Milestone | Data target | Dipendenza |
|-----------|------------|------------|
| Landing page live con waitlist | Aprile 2026 | UX/UI + Architecture |
| 3 guide connettori pubblicate | Maggio 2026 | Data Engineering (per screenshot) |
| 5 articoli blog SEO seed | Maggio 2026 | Nessuna |
| Sequenza email waitlist attiva | Maggio 2026 | Nessuna |
| Beta chiusa (10-20 PMI) | Luglio 2026 | Data Engineering + QA |
| Lancio pubblico | Agosto 2026 | Tutti i dipartimenti |

### Budget stimato

| Voce | Costo | Note |
|------|-------|------|
| Landing page | EUR 0 | Sviluppo interno |
| Dominio/hosting | EUR 0 | Gia incluso in Vercel |
| Email tool (Resend) | EUR 0-20/mese | Free tier fino a 3.000 email/mese |
| GA4 + GSC | EUR 0 | Gratuiti |
| LinkedIn Ads (opzionale) | EUR 200-500/mese | Solo post-lancio se organico insufficiente |
| Screenshot tool (per guide) | EUR 0 | Browser built-in |
| **Totale pre-lancio** | **~EUR 0** | Tutto organico |
