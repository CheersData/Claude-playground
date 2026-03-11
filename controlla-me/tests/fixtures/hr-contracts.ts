/**
 * HR contract fixtures for QA testing.
 *
 * Three realistic Italian employment documents with intentionally
 * problematic clauses that the analyzer pipeline should flag.
 */

// ---------------------------------------------------------------------------
// 1. Contratto a Tempo Indeterminato (TI) — CCNL Commercio, Livello 3
// ---------------------------------------------------------------------------

export const CONTRATTO_TEMPO_INDETERMINATO = `CONTRATTO INDIVIDUALE DI LAVORO SUBORDINATO A TEMPO INDETERMINATO

Tra

la società ALFA DISTRIBUZIONE S.R.L. (di seguito "Azienda"), con sede legale in Milano (MI), Via Torino 88,
C.F. e P.IVA 09876543210, iscritta al Registro delle Imprese di Milano al n. REA MI-2098765,
in persona del legale rappresentante pro tempore Dott. Marco Ferri,

e

il/la Sig./Sig.ra Anna Colombo (di seguito "Lavoratore/Lavoratrice"), nata a Bergamo il 12/03/1994,
C.F. CLMNNA94C52A794R, residente in Milano, Via Padova 156, cap 20132,

si conviene e si stipula quanto segue.

PREMESSE

La Società opera nel settore della distribuzione organizzata di prodotti di largo consumo sul territorio
nazionale e intende procedere all'assunzione del/della Lavoratore/Lavoratrice per lo svolgimento di
mansioni impiegatizie di carattere commerciale-amministrativo presso la sede di Milano.

Art. 1 — CCNL applicato e inquadramento

Il presente rapporto di lavoro è regolato dal Contratto Collettivo Nazionale di Lavoro per i Dipendenti
da Aziende del Terziario, della Distribuzione e dei Servizi (CCNL Commercio), nonché dal presente
contratto individuale. Il/la Lavoratore/Lavoratrice è inquadrato/a al Livello 3 del suddetto CCNL.

Art. 2 — Mansioni

Il/la Lavoratore/Lavoratrice è assunto/a con la qualifica di "Impiegato/a" e svolgerà attività di
supporto operativo e commerciale, nonché ogni altra attività connessa e/o complementare che
l'Azienda riterrà necessaria per le esigenze organizzative e produttive, anche non strettamente
riconducibile alle mansioni inizialmente assegnate.

L'Azienda si riserva la facoltà di modificare in qualsiasi momento le mansioni del Lavoratore in
funzione delle proprie necessità organizzative, anche adibendolo a mansioni di livello inferiore
ai sensi dell'art. 2103 c.c. come modificato dal D.Lgs. 81/2015, senza che ciò comporti alcuna
variazione del trattamento economico.

Art. 3 — Sede di lavoro e trasferimento

La sede di lavoro è fissata presso gli uffici di Milano, Via Torino 88.

L'Azienda si riserva il diritto insindacabile di trasferire il/la Lavoratore/Lavoratrice presso
qualsiasi altra sede operativa della società, sul territorio nazionale, con un preavviso di soli
5 (cinque) giorni lavorativi, senza necessità di comprovate ragioni tecniche, organizzative
o produttive. Il rifiuto al trasferimento costituirà giusta causa di licenziamento.

Art. 4 — Retribuzione

La retribuzione annua lorda (RAL) è fissata in EUR 28.000,00 (ventottomila/00), suddivisa in
14 mensilità come previsto dal CCNL Commercio. La retribuzione lorda mensile risulta pertanto
pari a EUR 2.000,00.

La retribuzione comprende ogni compenso per le attività ordinarie e straordinarie eventualmente
richieste. Non è prevista alcuna indennità aggiuntiva per trasferte di durata inferiore a 3 giorni
consecutivi.

Art. 5 — Orario di lavoro

L'orario di lavoro ordinario è di 40 (quaranta) ore settimanali, distribuite su 5 giorni lavorativi,
dal lunedì al venerdì. L'Azienda potrà richiedere prestazioni di lavoro straordinario, anche in
giornate festive e nel fine settimana, per un massimo indicativo di 20 ore settimanali aggiuntive,
con un preavviso di 12 ore. Il Lavoratore si impegna a garantire la massima disponibilità.

Le prestazioni straordinarie eccedenti le prime 8 ore settimanali saranno compensate esclusivamente
mediante riposo compensativo, da fruire entro 12 mesi, senza corresponsione della relativa
maggiorazione retributiva.

Art. 6 — Periodo di prova

Il rapporto di lavoro è soggetto a un periodo di prova della durata di 6 (sei) mesi di effettivo
servizio, durante il quale ciascuna delle parti potrà recedere liberamente dal rapporto senza
obbligo di preavviso né di indennità. Il periodo di prova si intende superato decorso il termine
senza che sia intervenuta comunicazione di recesso.

Art. 7 — Ferie e permessi

Le ferie e i permessi retribuiti sono disciplinati dal CCNL applicato. L'Azienda si riserva la
facoltà esclusiva di determinare il periodo di godimento delle ferie in funzione delle esigenze
produttive, con un preavviso minimo di 7 giorni. Il Lavoratore non potrà fruire di ferie nei
periodi di alta stagione commerciale (novembre-gennaio e giugno-luglio).

Art. 8 — Patto di non concorrenza

Ai sensi dell'art. 2125 del Codice Civile, il/la Lavoratore/Lavoratrice si obbliga, per un
periodo di 24 (ventiquattro) mesi dalla cessazione del rapporto di lavoro, a non svolgere attività
in concorrenza con l'Azienda, sia in forma autonoma sia subordinata, presso qualsiasi impresa
operante nel settore della distribuzione, del commercio e della logistica, nell'intero territorio
della Repubblica Italiana.

A fronte di tale obbligo, l'Azienda corrisponderà al/alla Lavoratore/Lavoratrice, alla cessazione
del rapporto, un corrispettivo lordo una tantum pari al 5% (cinque per cento) della RAL per ciascun
anno di vincolo, e quindi complessivamente pari al 10% della RAL. Tale importo sarà corrisposto
in un'unica soluzione entro 30 giorni dalla cessazione del rapporto.

In caso di violazione del patto, il/la Lavoratore/Lavoratrice sarà tenuto/a al pagamento di una
penale pari a 24 (ventiquattro) mensilità dell'ultima retribuzione lorda percepita, fatto salvo
il diritto dell'Azienda al risarcimento del maggior danno.

Art. 9 — Riservatezza

Il/la Lavoratore/Lavoratrice si obbliga a mantenere la più rigorosa riservatezza su tutte le
informazioni, i dati, i documenti, le strategie commerciali, le liste clienti e fornitori, i
processi organizzativi e qualsiasi altra informazione di carattere riservato o confidenziale di
cui venga a conoscenza in ragione del rapporto di lavoro, anche dopo la cessazione dello stesso
e senza limiti temporali.

La violazione dell'obbligo di riservatezza costituisce giusta causa di licenziamento e comporta
l'obbligo di risarcire integralmente il danno subito dall'Azienda.

Art. 10 — Proprietà intellettuale

Tutte le opere, invenzioni, software, documenti, relazioni e qualsiasi altro risultato dell'attività
lavorativa del/della Lavoratore/Lavoratrice, realizzati nell'ambito del rapporto di lavoro o
comunque utilizzando mezzi e risorse aziendali, sono di esclusiva proprietà dell'Azienda. Il/la
Lavoratore/Lavoratrice rinuncia espressamente a qualsiasi diritto morale e patrimoniale sulle
opere create.

Art. 11 — Recesso e preavviso

Decorso il periodo di prova, il rapporto di lavoro potrà essere risolto da ciascuna parte con
preavviso scritto. I termini di preavviso sono quelli previsti dal CCNL Commercio per il livello
di inquadramento.

L'Azienda si riserva la facoltà di esonerare il/la Lavoratore/Lavoratrice dal prestare servizio
durante il periodo di preavviso, corrispondendo la relativa indennità sostitutiva.

Art. 12 — Trattamento dei dati personali

I dati personali del/della Lavoratore/Lavoratrice saranno trattati in conformità al Regolamento UE
2016/679 (GDPR) e al D.Lgs. 196/2003 e ss.mm.ii., per le finalità connesse alla gestione del
rapporto di lavoro. L'informativa completa è allegata al presente contratto (Allegato A).

Art. 13 — Rinvio

Per tutto quanto non espressamente previsto dal presente contratto, si rinvia alle disposizioni del
CCNL applicato, del Codice Civile e delle leggi vigenti in materia di lavoro subordinato.

Art. 14 — Clausola di accettazione integrale

Il/la Lavoratore/Lavoratrice dichiara di aver preso visione e di accettare integralmente tutte le
clausole del presente contratto, ivi comprese quelle di cui agli artt. 2, 3, 5, 6, 8, 9 e 10,
che vengono espressamente approvate ai sensi e per gli effetti degli artt. 1341 e 1342 del
Codice Civile.

Milano, 10 febbraio 2026

Il Legale Rappresentante                    Il/la Lavoratore/Lavoratrice
Dott. Marco Ferri                           Anna Colombo
_____________________                       _____________________

Allegati:
- Informativa privacy (Allegato A)
- Copia documento di identità
- Codice fiscale`;

// ---------------------------------------------------------------------------
// 2. Contratto a Tempo Determinato (TD) — 12 mesi, mancanza causale
// ---------------------------------------------------------------------------

export const CONTRATTO_TEMPO_DETERMINATO = `CONTRATTO DI LAVORO SUBORDINATO A TEMPO DETERMINATO

Tra

la società BETA CONSULTING GROUP S.R.L. (di seguito "Società"), con sede legale in Roma,
Via Nazionale 212, C.F. e P.IVA 12345678901, in persona dell'Amministratore Unico
Dott.ssa Elena Marchetti,

e

il Sig. Davide Ferrara (di seguito "Lavoratore"), nato a Napoli il 22/09/1990,
C.F. FRRDVD90P22F839K, residente in Roma, Via Tuscolana 430, cap 00181,

PREMESSO CHE

- la Società svolge attività di consulenza direzionale e organizzativa per imprese del settore
  industriale e dei servizi;
- la Società ha necessità di integrare il proprio organico per lo svolgimento di attività di
  analisi e reportistica;

si conviene e si stipula quanto segue.

Art. 1 — Oggetto e durata

Il Lavoratore è assunto con contratto di lavoro subordinato a tempo determinato per la durata
di 12 (dodici) mesi, con decorrenza dal 1 marzo 2026 e scadenza il 28 febbraio 2027.

Art. 2 — CCNL e inquadramento

Il rapporto è regolato dal CCNL per i Dipendenti delle Aziende del Terziario, della Distribuzione
e dei Servizi (CCNL Commercio). Il Lavoratore è inquadrato al Livello 4.

Art. 3 — Mansioni

Il Lavoratore svolgerà mansioni di "Analista Junior" con compiti di raccolta dati, elaborazione
reportistica, supporto alle attività di consulenza e redazione di presentazioni per i clienti
della Società.

Art. 4 — Retribuzione

La retribuzione annua lorda (RAL) è fissata in EUR 22.000,00 (ventiduemila/00), suddivisa in
14 mensilità. La retribuzione lorda mensile è pertanto pari a EUR 1.571,43.

Non sono previsti premi di risultato, buoni pasto o altre componenti accessorie della retribuzione.

Art. 5 — Orario di lavoro

L'orario di lavoro è fissato in 40 (quaranta) ore settimanali, distribuite dal lunedì al venerdì.
L'Azienda potrà richiedere lavoro straordinario nella misura prevista dal CCNL.

Art. 6 — Periodo di prova

Il rapporto è soggetto a un periodo di prova di 60 (sessanta) giorni di calendario. Durante il
periodo di prova ciascuna parte potrà recedere senza preavviso.

Art. 7 — Sede di lavoro

La sede di lavoro è presso gli uffici di Roma, Via Nazionale 212. La Società potrà richiedere
trasferte sul territorio nazionale per esigenze operative.

Art. 8 — Rinnovo e proroga

Il presente contratto si intenderà automaticamente rinnovato per un ulteriore periodo di
12 (dodici) mesi alle medesime condizioni economiche e normative, qualora nessuna delle parti
comunichi la volontà di non procedere al rinnovo con un preavviso scritto di almeno 30 giorni
rispetto alla scadenza naturale del contratto.

In caso di rinnovo automatico, il contratto si intenderà prorogato a tempo determinato per un
periodo di pari durata senza necessità di indicare le ragioni giustificatrici di cui all'art.
19, comma 1, del D.Lgs. 81/2015.

Art. 9 — Clausola di stabilità

Il Lavoratore si impegna a non recedere dal presente contratto prima della scadenza naturale del
termine. In caso di recesso anticipato non dovuto a giusta causa, il Lavoratore sarà tenuto al
pagamento di un'indennità pari alle retribuzioni residue dal momento del recesso fino alla
scadenza del termine.

Art. 10 — Ferie, permessi e malattia

Le ferie, i permessi retribuiti e il trattamento di malattia sono disciplinati dalle disposizioni
del CCNL applicato e dalle norme di legge vigenti.

Art. 11 — Obblighi del Lavoratore

Il Lavoratore si impegna a:
a) svolgere le mansioni assegnate con diligenza, buona fede e nel rispetto delle direttive aziendali;
b) osservare l'orario di lavoro e le disposizioni organizzative;
c) mantenere la riservatezza sulle informazioni aziendali e sui clienti;
d) non svolgere attività in concorrenza con la Società durante la vigenza del rapporto;
e) restituire alla cessazione del rapporto tutti i materiali, documenti e strumenti di lavoro.

Art. 12 — Cessazione del rapporto

Il rapporto di lavoro cesserà automaticamente alla scadenza del termine, senza necessità di
comunicazione o preavviso da parte della Società. In caso di prosecuzione di fatto del rapporto
oltre il termine, si applicheranno le disposizioni dell'art. 22 del D.Lgs. 81/2015.

Art. 13 — Trattamento dati personali

Il trattamento dei dati personali avviene in conformità al Reg. UE 2016/679. Il Lavoratore
dichiara di aver ricevuto l'informativa privacy.

Art. 14 — Rinvio e foro competente

Per tutto quanto non previsto si rinvia al CCNL applicato e alle norme di legge. Per qualsiasi
controversia derivante dal presente contratto sarà competente in via esclusiva il Foro di Roma.

Art. 15 — Clausole vessatorie

Ai sensi e per gli effetti degli artt. 1341 e 1342 del Codice Civile, il Lavoratore dichiara
di approvare specificamente le clausole di cui agli artt. 8 (rinnovo automatico), 9 (clausola
di stabilità) e 14 (foro competente).

Roma, 25 febbraio 2026

L'Amministratore Unico                     Il Lavoratore
Dott.ssa Elena Marchetti                   Davide Ferrara
_____________________                       _____________________`;

// ---------------------------------------------------------------------------
// 3. Lettera di licenziamento per giusta causa
// ---------------------------------------------------------------------------

export const LETTERA_LICENZIAMENTO_GIUSTA_CAUSA = `RACCOMANDATA A/R

Spett.le
Sig. Roberto Esposito
Via dei Mille 45
80121 Napoli (NA)

Milano, 5 marzo 2026

OGGETTO: Licenziamento per giusta causa ai sensi dell'art. 2119 del Codice Civile

Egregio Sig. Esposito,

con la presente, la società GAMMA LOGISTICA S.P.A., con sede in Milano, Viale Certosa 50,
C.F. e P.IVA 01234567890 (di seguito "Società"), Le comunica il licenziamento per giusta causa
dal rapporto di lavoro subordinato a tempo indeterminato in essere, con effetto immediato dalla
data di ricezione della presente comunicazione.

MOTIVAZIONE

Il licenziamento è determinato da gravi comportamenti posti in essere dal Sig. Esposito che
configurano una grave violazione degli obblighi contrattuali e del vincolo fiduciario che è alla
base del rapporto di lavoro, tali da non consentire la prosecuzione, neppure provvisoria, del
rapporto stesso.

In particolare, è stato accertato che il Lavoratore ha tenuto una condotta gravemente lesiva
degli interessi aziendali e in violazione dei principi di diligenza, fedeltà e buona fede
contrattuale di cui agli artt. 2104 e 2105 del Codice Civile. I fatti contestati consistono
in comportamenti reiterati incompatibili con il corretto svolgimento del rapporto di lavoro
e con le responsabilità connesse alla qualifica ricoperta.

Tali comportamenti rappresentano una violazione del codice disciplinare aziendale e delle norme
contrattuali collettive ed individuali applicabili al rapporto di lavoro.

La gravità dei fatti è tale da integrare gli estremi della giusta causa di licenziamento ai
sensi dell'art. 2119 c.c. e dell'art. 7 della Legge 300/1970 (Statuto dei Lavoratori), in
quanto la condotta tenuta ha irrimediabilmente compromesso il rapporto fiduciario tra le parti.

TERMINE PER LE GIUSTIFICAZIONI

Ai sensi dell'art. 7 della Legge 20 maggio 1970, n. 300, il Lavoratore ha facoltà di presentare
le proprie giustificazioni scritte entro il termine di 3 (tre) giorni di calendario dalla
ricezione della presente comunicazione, inviandole a mezzo raccomandata A/R o PEC all'indirizzo
gammalogistica@pec.it.

Il Lavoratore potrà altresì richiedere di essere sentito a difesa, con l'eventuale assistenza
di un rappresentante sindacale.

EFFETTI DEL LICENZIAMENTO

Il licenziamento ha effetto immediato dalla data di ricezione della presente, senza obbligo di
preavviso né di corresponsione della relativa indennità sostitutiva, trattandosi di recesso per
giusta causa.

Al Lavoratore saranno corrisposti:
- le competenze di fine rapporto maturate fino alla data di cessazione;
- il trattamento di fine rapporto (TFR) maturato;
- le ferie e i permessi non goduti.

Le predette somme saranno erogate nei tempi tecnici necessari per l'elaborazione, comunque non
oltre 45 giorni dalla cessazione del rapporto.

RESTITUZIONE BENI AZIENDALI

Il Lavoratore è tenuto a restituire immediatamente tutti i beni aziendali in suo possesso, ivi
inclusi: badge aziendale, computer portatile, telefono cellulare, documentazione, chiavi e
qualsiasi altro bene di proprietà della Società.

DECADENZA E IMPUGNAZIONE

Si ricorda che, ai sensi dell'art. 6 della Legge 604/1966 come modificata dalla Legge 183/2010,
il licenziamento può essere impugnato entro 60 giorni dalla ricezione della presente
comunicazione, a pena di decadenza, mediante qualsiasi atto scritto, anche extragiudiziale,
idoneo a rendere nota la volontà del lavoratore. Nei successivi 180 giorni dall'impugnazione
stragiudiziale, il lavoratore dovrà depositare il ricorso giudiziale, a pena di inefficacia
dell'impugnazione.

NOTA BENE

La presente comunicazione è stata predisposta nel rispetto delle procedure previste dalla legge
e dal CCNL applicato al rapporto di lavoro. Ogni diritto della Società resta espressamente
riservato.

Distinti saluti.

GAMMA LOGISTICA S.P.A.
L'Amministratore Delegato
Dott. Giorgio Valentini

_____________________

Per ricevuta:
Il Lavoratore
_____________________
Data: ___/___/______`;

// ---------------------------------------------------------------------------
// Metadata per QA — expected results for each fixture
// ---------------------------------------------------------------------------

export interface HRContractMetadata {
  id: string;
  expectedDocType: string;
  expectedSubType: string;
  expectedRisks: string[];
  description: string;
}

export const METADATA_TEMPO_INDETERMINATO: HRContractMetadata = {
  id: "hr-ti-ccnl-commercio",
  expectedDocType: "contratto_lavoro_subordinato",
  expectedSubType: "tempo_indeterminato",
  expectedRisks: [
    // Art. 2 — Mansioni troppo vaghe e demansionamento unilaterale
    "mansioni_vaghe_demansionamento",
    // Art. 3 — Trasferimento unilaterale senza ragioni comprovate (viola art. 2103 c.c.)
    "trasferimento_unilaterale_illegittimo",
    // Art. 5 — Straordinario eccessivo (20h/sett. oltre le 40h, compensa solo con riposo)
    "straordinario_eccessivo_senza_maggiorazione",
    // Art. 6 — Periodo di prova 6 mesi potenzialmente eccessivo per Livello 3 CCNL Commercio
    "periodo_prova_eccessivo",
    // Art. 8 — Non concorrenza: compenso troppo basso (10% RAL per 24 mesi su tutto il territorio)
    "non_concorrenza_compenso_inadeguato",
    // Art. 8 — Penale 24 mensilita' per violazione non concorrenza sproporzionata
    "penale_non_concorrenza_sproporzionata",
    // Art. 7 — Ferie: l'azienda decide unilateralmente e limita i periodi di godimento
    "limitazione_ferie",
    // Art. 4 — RAL omnicomprensiva (include straordinario) potenzialmente sotto CCNL effettivo
    "retribuzione_omnicomprensiva",
  ],
  description:
    "Contratto TI CCNL Commercio Livello 3 con clausole abusive: mansioni vaghe, " +
    "trasferimento unilaterale, straordinario eccessivo senza maggiorazione, " +
    "patto di non concorrenza sottopagato con penale sproporzionata.",
};

export const METADATA_TEMPO_DETERMINATO: HRContractMetadata = {
  id: "hr-td-12-mesi-senza-causale",
  expectedDocType: "contratto_lavoro_subordinato",
  expectedSubType: "tempo_determinato",
  expectedRisks: [
    // Art. 1 — 12 mesi senza causale: lecito come primo contratto, ma il rinnovo senza causale
    // viola l'art. 19 co. 1 D.Lgs. 81/2015 (causale obbligatoria oltre 12 mesi)
    "rinnovo_senza_causale_oltre_12_mesi",
    // Art. 8 — Rinnovo automatico contrario alla disciplina D.Lgs. 81/2015
    "rinnovo_automatico_td_illegittimo",
    // Art. 9 — Clausola di stabilita' con penale pari a retribuzioni residue: sproporzionata
    "clausola_stabilita_penale_eccessiva",
    // Art. 4 — RAL EUR 22.000 per Livello 4 CCNL Commercio a Roma: potenzialmente sotto minimo
    "retribuzione_sotto_ccnl",
    // Art. 4 — Nessun benefit (buoni pasto, premio, welfare)
    "assenza_benefit_contrattuali",
    // Art. 14 — Clausola di foro competente in contratto di lavoro: nulla (art. 413 c.p.c.)
    "foro_competente_nullo",
  ],
  description:
    "Contratto TD 12 mesi senza causale con rinnovo automatico illegittimo, " +
    "clausola di stabilita' penalizzante, retribuzione sotto CCNL e foro esclusivo nullo.",
};

export const METADATA_LICENZIAMENTO: HRContractMetadata = {
  id: "hr-licenziamento-giusta-causa",
  expectedDocType: "lettera_licenziamento",
  expectedSubType: "licenziamento_giusta_causa",
  expectedRisks: [
    // Motivazione generica senza fatti specifici, date, circostanze (viola art. 7 L. 300/1970)
    "motivazione_generica_non_specifica",
    // Termine 3 giorni per le giustificazioni: inferiore al minimo di 5 giorni (art. 7 Statuto)
    "termine_giustificazioni_insufficiente",
    // Nessun riferimento a preventiva contestazione disciplinare scritta
    "contestazione_disciplinare_mancante",
    // Licenziamento e contestazione nello stesso atto (viola principio di gradualita')
    "licenziamento_contestuale_alla_contestazione",
    // Mancato riferimento al codice disciplinare affisso (obbligo art. 7 co. 1 Statuto)
    "codice_disciplinare_non_affisso",
    // Genericita' della giusta causa: non consente al lavoratore di difendersi
    "diritto_difesa_compromesso",
  ],
  description:
    "Lettera di licenziamento per giusta causa con motivazione generica, " +
    "termine difensivo di soli 3 giorni (minimo 5), assenza di contestazione disciplinare " +
    "preventiva e mancanza di fatti specifici contestati.",
};

/**
 * All HR fixtures as an array, useful for parameterized tests.
 */
export const ALL_HR_FIXTURES = [
  {
    text: CONTRATTO_TEMPO_INDETERMINATO,
    metadata: METADATA_TEMPO_INDETERMINATO,
  },
  {
    text: CONTRATTO_TEMPO_DETERMINATO,
    metadata: METADATA_TEMPO_DETERMINATO,
  },
  {
    text: LETTERA_LICENZIAMENTO_GIUSTA_CAUSA,
    metadata: METADATA_LICENZIAMENTO,
  },
] as const;
