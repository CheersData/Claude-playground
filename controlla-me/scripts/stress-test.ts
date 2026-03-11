/**
 * stress-test.ts — Recursive Quality Stress Test per agenti AI legali.
 *
 * Loop ricorsivo: agente produce output → critico valuta → feedback → agente riproduce → fino a qualità accettabile.
 *
 * IMPORTANTE: Usa `claude -p` (CLI), NON il SDK direttamente. (Regola CLAUDE.md)
 * Va eseguito da terminale ESTERNO (non dentro Claude Code — nested session limitation).
 *
 * Usage:
 *   npx tsx scripts/stress-test.ts --agent classifier --max-iterations 5
 *   npx tsx scripts/stress-test.ts --agent analyzer --threshold 7 --max-iterations 3
 *   npx tsx scripts/stress-test.ts --agent investigator --input "testo contratto..."
 *   npx tsx scripts/stress-test.ts --agent advisor --file path/to/contract.txt
 *   npx tsx scripts/stress-test.ts --agent all                     # Testa tutti gli agenti
 *   npx tsx scripts/stress-test.ts --agent classifier --sample 1   # Usa solo il sample N (0-indexed)
 *   npx tsx scripts/stress-test.ts --list-samples                  # Mostra i sample disponibili
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");
const LOGS_DIR = path.resolve(ROOT, "company", "autorun-logs");

type AgentName = "classifier" | "analyzer" | "investigator" | "advisor";
const ALL_AGENTS: AgentName[] = ["classifier", "analyzer", "investigator", "advisor"];

// ─── CLI Arg Parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getFlag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

// ─── Sample Legal Texts (Italian) ─────────────────────────────────────────────

interface SampleText {
  name: string;
  type: string;
  text: string;
  /** Expected qualities for validation — what a good output should capture */
  expectations: Record<AgentName, string[]>;
}

const SAMPLE_TEXTS: SampleText[] = [
  {
    name: "locazione_4+4_penale_eccessiva",
    type: "locazione",
    text: `CONTRATTO DI LOCAZIONE AD USO ABITATIVO
(ai sensi della Legge 9 dicembre 1998, n. 431)

TRA
Il Sig. Mario Rossi, nato a Roma il 01/01/1970, codice fiscale RSSMRA70A01H501Z,
residente in Roma, Via Tiburtina 100 (di seguito "Locatore"),

E
Il Sig. Luigi Bianchi, nato a Milano il 15/06/1985, codice fiscale BNCLGU85H15F205X,
residente in Milano, Via Montenapoleone 10 (di seguito "Conduttore"),

SI CONVIENE E SI STIPULA QUANTO SEGUE:

Art. 1 - OGGETTO
Il Locatore concede in locazione al Conduttore l'immobile sito in Roma, Via Appia Nuova 42,
piano 3, interno 7, composto da 4 vani, categoria A/2.

Art. 2 - DURATA
Il contratto ha durata di 4 (quattro) anni con decorrenza dal 01/04/2025 e scadenza il 31/03/2029,
rinnovabile per ulteriori 4 anni salvo disdetta.

Art. 3 - CANONE
Il canone annuo è stabilito in EUR 9.600,00 pari a EUR 800,00 mensili,
da corrispondersi entro il giorno 5 di ogni mese mediante bonifico bancario.

Art. 4 - DEPOSITO CAUZIONALE
Il Conduttore versa a titolo di deposito cauzionale la somma di EUR 2.400,00 pari a 3 mensilità.
Il deposito sarà restituito al termine della locazione, dedotte eventuali somme dovute.

Art. 5 - PENALE PER RISOLUZIONE ANTICIPATA
In caso di risoluzione anticipata da parte del Conduttore prima della scadenza naturale,
questi dovrà corrispondere al Locatore una penale pari a 12 (dodici) mensilità del canone.
Il deposito cauzionale verrà trattenuto integralmente a titolo di risarcimento.

Art. 6 - SPESE
Le spese condominiali ordinarie sono a carico del Conduttore.

Roma, 15 marzo 2025`,
    expectations: {
      classifier: [
        "documentType deve contenere 'locazione'",
        "documentSubType = locazione_4+4 o simile",
        "relevantInstitutes deve includere clausola_penale o penale_risoluzione_anticipata",
        "applicableLaws deve citare L. 431/1998",
      ],
      analyzer: [
        "Deve identificare la penale di 12 mensilità come rischio critical o high",
        "Deve segnalare deposito cauzionale pari a 3 mensilità come superiore allo standard (2 mensilità max)",
        "overallRisk deve essere almeno medium",
        "Deve citare art. 1384 c.c. sulla riducibilità della clausola penale",
      ],
      investigator: [
        "Deve produrre finding per la clausola penale",
        "NON deve inventare sentenze — se non trova, scrive 'orientamento non verificato'",
        "Deve citare art. 1384 c.c. e/o L. 431/1998",
        "laws[].isInForce deve essere true per norme vigenti",
      ],
      advisor: [
        "fairnessScore tra 3 e 6 (contratto sbilanciato ma non totalmente vessatorio)",
        "risks deve avere max 3 elementi",
        "actions deve avere max 3 elementi",
        "Linguaggio chiaro, zero legalese — comprensibile a un non-giurista",
        "needsLawyer = true (la penale è problematica)",
      ],
    },
  },
  {
    name: "compravendita_immobiliare_clausola_irriducibile",
    type: "compravendita",
    text: `CONTRATTO PRELIMINARE DI COMPRAVENDITA IMMOBILIARE

TRA
Il Sig. Giuseppe Verdi, nato a Napoli il 12/03/1965, C.F. VRDGPP65C12F839N,
residente in Napoli, Corso Umberto I 50 (di seguito "Promittente Venditore"),

E
La Sig.ra Anna Bianchi, nata a Firenze il 22/08/1990, C.F. BNCNNA90M62D612X,
residente in Firenze, Via dei Calzaiuoli 15 (di seguito "Promissaria Acquirente"),

Art. 1 - OGGETTO
Il Promittente Venditore promette di vendere e la Promissaria Acquirente promette di acquistare
l'immobile sito in Roma, Via Condotti 20, piano 5, composto da 6 vani, cat. A/1.

Art. 2 - PREZZO
Il prezzo di vendita è convenuto in EUR 450.000,00.
La caparra confirmatoria è di EUR 90.000,00 pari al 20% del prezzo.

Art. 3 - TERMINE PER IL ROGITO
Il rogito notarile dovrà essere stipulato entro e non oltre il 30/06/2025.
In caso di inadempimento del Promittente Venditore, l'Acquirente avrà diritto al doppio della caparra.
In caso di inadempimento dell'Acquirente, il Venditore tratterrà la caparra.

Art. 4 - CLAUSOLA PENALE AGGIUNTIVA
Indipendentemente dalla caparra, la parte inadempiente dovrà corrispondere una penale
pari al 30% del prezzo di vendita, senza possibilità di riduzione giudiziale.
La rinuncia alla riduzione ex art. 1384 c.c. è espressamente convenuta.

Art. 5 - CONSEGNA IMMOBILE
L'immobile sarà consegnato nello stato di fatto in cui si trova, senza alcuna garanzia
per vizi apparenti o occulti. L'Acquirente dichiara di aver visionato l'immobile.

Art. 6 - CONFORMITÀ URBANISTICA
Il Venditore dichiara che l'immobile è conforme alle norme urbanistiche.
Eventuali difformità saranno a carico esclusivo dell'Acquirente post-rogito.

Napoli, 10 febbraio 2025`,
    expectations: {
      classifier: [
        "documentType deve contenere 'preliminare' o 'compravendita'",
        "relevantInstitutes deve includere caparra_confirmatoria",
        "relevantInstitutes deve includere clausola_penale",
        "applicableLaws deve citare art. 1385 c.c. (caparra confirmatoria)",
      ],
      analyzer: [
        "Deve segnalare la penale del 30% con rinuncia riduzione come critical",
        "Deve segnalare l'esclusione garanzia vizi come high risk",
        "Deve segnalare il ribaltamento difformità urbanistiche sull'acquirente",
        "Deve citare art. 1384 c.c. e la questione della riducibilità",
      ],
      investigator: [
        "Findings per la clausola penale irriducibile",
        "Findings per l'esclusione garanzia vizi",
        "Deve coprire TUTTE le clausole critical e high",
        "NON deve inventare sentenze",
      ],
      advisor: [
        "fairnessScore tra 3 e 5 (contratto molto sbilanciato)",
        "risks max 3, actions max 3",
        "needsLawyer = true",
        "Deve menzionare il rischio della rinuncia alla riduzione della penale",
      ],
    },
  },
  {
    name: "lavoro_subordinato_clausole_vessatorie",
    type: "lavoro",
    text: `CONTRATTO DI LAVORO SUBORDINATO A TEMPO INDETERMINATO

TRA
La società Innovatech S.r.l., con sede in Milano, Via della Spiga 8, P.IVA 12345678901,
in persona del legale rappresentante Dott. Francesco Neri (di seguito "Datore di Lavoro"),

E
Il Sig. Marco Russo, nato a Torino il 05/11/1992, C.F. RSSMRC92S05L219Z,
residente in Milano, Via Tortona 33 (di seguito "Lavoratore"),

Art. 1 - ASSUNZIONE E MANSIONI
Il Lavoratore è assunto con qualifica di Impiegato, livello 3° CCNL Commercio,
con mansioni di Sviluppatore Software Senior. Il Datore si riserva il diritto
di modificare le mansioni anche in riduzione di un livello senza consenso del Lavoratore.

Art. 2 - RETRIBUZIONE
La retribuzione lorda annua è di EUR 35.000,00 suddivisa in 13 mensilità.
Nessun compenso aggiuntivo per straordinari oltre le 45 ore settimanali.

Art. 3 - PATTO DI NON CONCORRENZA
Il Lavoratore si impegna, per un periodo di 36 mesi dalla cessazione del rapporto,
a non svolgere attività concorrente in tutto il territorio dell'Unione Europea.
Il corrispettivo per tale patto è fissato in EUR 500,00 una tantum.

Art. 4 - CLAUSOLA DI ESCLUSIVA INTELLETTUALE
Ogni opera, invenzione, software o creazione intellettuale del Lavoratore,
anche se realizzata fuori dall'orario di lavoro e senza utilizzo di mezzi aziendali,
è di proprietà esclusiva del Datore di Lavoro.

Art. 5 - PERIODO DI PROVA
Il periodo di prova è di 12 mesi. Durante tale periodo ciascuna parte può recedere
senza preavviso e senza alcuna indennità.

Art. 6 - FORO COMPETENTE
Per ogni controversia è competente esclusivamente il Foro di Palermo,
con espressa rinuncia al foro del lavoratore.

Milano, 1 marzo 2025`,
    expectations: {
      classifier: [
        "documentType deve contenere 'lavoro' o 'subordinato'",
        "documentSubType = subordinato_tempo_indeterminato o simile",
        "relevantInstitutes deve includere patto_non_concorrenza",
        "relevantInstitutes deve includere periodo_di_prova",
      ],
      analyzer: [
        "Deve segnalare il periodo di prova di 12 mesi come critical (max 6 mesi per legge)",
        "Deve segnalare il patto di non concorrenza con corrispettivo EUR 500 come sproporzionato",
        "Deve segnalare la clausola IP fuori orario come problematica",
        "Deve segnalare il foro di Palermo come rinuncia illegittima al foro del lavoratore",
      ],
      investigator: [
        "Deve citare art. 2096 c.c. per il periodo di prova",
        "Deve citare art. 2125 c.c. per il patto di non concorrenza",
        "Deve coprire tutte le clausole critical e high",
        "NON deve inventare sentenze Cassazione",
      ],
      advisor: [
        "fairnessScore tra 2 e 4 (contratto gravemente squilibrato)",
        "risks max 3, actions max 3",
        "needsLawyer = true",
        "lawyerSpecialization deve essere 'Diritto del lavoro' (non generico)",
      ],
    },
  },
  {
    name: "fornitura_servizi_IT_squilibrata",
    type: "fornitura",
    text: `CONTRATTO DI FORNITURA DI SERVIZI INFORMATICI

TRA
La società WebDesign Pro S.r.l., con sede in Milano, Via Torino 22, P.IVA 98765432101,
in persona del legale rappresentante Ing. Laura Conti (di seguito "Fornitore"),

E
La società PMI Manufacturing S.p.A., con sede in Roma, Viale Europa 120, P.IVA 11122233344,
in persona dell'Amministratore Delegato Dott. Roberto Ferrara (di seguito "Committente"),

SI CONVIENE E SI STIPULA QUANTO SEGUE:

Art. 1 - OGGETTO
Il Fornitore si impegna a sviluppare una piattaforma e-commerce personalizzata per il Committente,
comprensiva di hosting, manutenzione e assistenza tecnica per la durata del contratto.

Art. 2 - CORRISPETTIVO E PAGAMENTO
Il corrispettivo per lo sviluppo è di EUR 25.000,00 oltre IVA.
Il canone mensile per hosting e manutenzione è di EUR 500,00 oltre IVA.
Il pagamento avverrà a 120 (centoventi) giorni dalla data di emissione della fattura.
Non è previsto alcun anticipo. Il saldo sarà corrisposto a collaudo positivo.

Art. 3 - PROPRIETÀ INTELLETTUALE
Tutto il codice sorgente, il design, la documentazione tecnica e qualsiasi opera dell'ingegno
prodotta nell'ambito del presente contratto è di proprietà esclusiva del Committente.
Tale proprietà si estende anche al codice preesistente, alle librerie, ai framework
e agli strumenti proprietari del Fornitore utilizzati nel progetto.
Il Fornitore rinuncia a ogni diritto morale e patrimoniale sulle opere create.

Art. 4 - RESPONSABILITÀ
Il Fornitore è responsabile per qualsiasi danno diretto, indiretto, consequenziale,
perdita di profitto, danno reputazionale e qualsiasi altra perdita subita dal Committente
derivante dall'esecuzione o dalla mancata esecuzione del presente contratto,
senza alcun limite di importo.

Art. 5 - PENALE PER RITARDO
In caso di ritardo nella consegna superiore a 7 (sette) giorni rispetto al cronoprogramma,
il Fornitore corrisponderà una penale pari al 5% del corrispettivo totale per ogni giorno
di ritardo, senza necessità di messa in mora e senza limite massimo.

Art. 6 - RINNOVO E DISDETTA
Il contratto di manutenzione si rinnova automaticamente di anno in anno.
La disdetta deve essere comunicata con preavviso di 120 (centoventi) giorni
prima della scadenza annuale, a mezzo raccomandata A/R.

Art. 7 - FORO COMPETENTE
Per ogni controversia è competente esclusivamente il Foro di Roma.

Roma, 20 gennaio 2025`,
    expectations: {
      classifier: [
        "documentType deve contenere 'fornitura' o 'servizi' o 'appalto'",
        "relevantInstitutes deve includere proprietà_intellettuale o cessione_IP",
        "relevantInstitutes deve includere clausola_penale",
        "applicableLaws deve citare norme del Codice Civile su appalto/opera (art. 1655 ss.)",
      ],
      analyzer: [
        "Deve segnalare la cessione IP preesistente come critical (espropriazione illegittima)",
        "Deve segnalare la responsabilità illimitata come high risk",
        "Deve segnalare la penale 5%/giorno senza tetto come critical (potenzialmente superiore al corrispettivo)",
        "Deve segnalare il pagamento a 120 giorni come sfavorevole (D.Lgs. 231/2002 prevede max 60 gg)",
      ],
      investigator: [
        "Deve citare D.Lgs. 231/2002 per i termini di pagamento",
        "Deve citare art. 2589-2590 c.c. per diritto d'autore/IP preesistente",
        "Deve citare art. 1384 c.c. per la riducibilità della penale",
        "NON deve inventare sentenze",
      ],
      advisor: [
        "fairnessScore tra 2 e 4 (contratto gravemente squilibrato verso il committente)",
        "risks max 3, actions max 3",
        "needsLawyer = true",
        "Deve raccomandare di negoziare il cap sulla responsabilità e la clausola IP",
      ],
    },
  },
  {
    name: "locazione_transitoria_irregolare",
    type: "locazione_transitoria",
    text: `CONTRATTO DI LOCAZIONE AD USO ABITATIVO TRANSITORIO
(ai sensi dell'art. 5 della Legge 431/1998)

TRA
La Sig.ra Francesca Moretti, nata a Bologna il 18/07/1972, C.F. MRTFNC72L58A944X,
residente in Bologna, Via Indipendenza 35 (di seguito "Locatore"),

E
Il Sig. Ahmed El Fassi, nato a Casablanca (Marocco) il 03/02/1995, titolare di permesso
di soggiorno n. PS-2024-123456, residente in Bologna, Via Rizzoli 8 (di seguito "Conduttore"),

SI CONVIENE E SI STIPULA QUANTO SEGUE:

Art. 1 - OGGETTO
Il Locatore concede in locazione transitoria al Conduttore l'immobile sito in Bologna,
Via Santo Stefano 18, piano 2, composto da 3 vani, categoria A/3.

Art. 2 - DURATA
Il contratto ha durata di 24 (ventiquattro) mesi con decorrenza dal 01/03/2025.
Non è previsto rinnovo automatico.

Art. 3 - MOTIVAZIONE DELLA TRANSITORIETÀ
[Non specificata]

Art. 4 - CANONE
Il canone mensile è stabilito in EUR 1.200,00 da corrispondersi entro il giorno 1
di ogni mese. Il canone è libero e non soggetto ad accordi territoriali.

Art. 5 - DEPOSITO CAUZIONALE
Il Conduttore versa a titolo di deposito cauzionale la somma di EUR 4.800,00
pari a 4 mensilità del canone, infruttifero.

Art. 6 - DIVIETO ANIMALI
È fatto assoluto divieto al Conduttore di detenere animali di qualsiasi tipo
nell'immobile locato. La violazione comporta risoluzione immediata del contratto.

Art. 7 - MANUTENZIONE
Tutte le riparazioni, sia ordinarie che straordinarie, sono a totale carico
del Conduttore, inclusi gli interventi strutturali e impiantistici.

Art. 8 - SUBLOCAZIONE
La sublocazione, anche parziale, è vietata in ogni forma.
La cessione del contratto è parimenti vietata.

Art. 9 - RECESSO DEL CONDUTTORE
Il Conduttore può recedere con preavviso di 6 (sei) mesi.
Il mancato rispetto del preavviso comporta la perdita integrale del deposito cauzionale.

Bologna, 15 febbraio 2025`,
    expectations: {
      classifier: [
        "documentType deve contenere 'locazione' e 'transitoria'",
        "documentSubType = locazione_transitoria o simile",
        "relevantInstitutes deve includere locazione_transitoria",
        "applicableLaws deve citare art. 5 L. 431/1998 e DM 30/12/2002",
      ],
      analyzer: [
        "Deve segnalare durata 24 mesi come critical (max legale 18 mesi ex art. 5 L. 431/1998)",
        "Deve segnalare assenza motivazione transitorietà come critical (obbligatoria per legge)",
        "Deve segnalare deposito 4 mensilità come high (max legale 3 ex art. 11 L. 392/1978)",
        "Deve segnalare manutenzione straordinaria a carico conduttore come contraria ad art. 1576 c.c.",
        "Deve segnalare canone libero senza riferimento ad accordi territoriali come problematico per transitorio",
      ],
      investigator: [
        "Deve citare art. 5 L. 431/1998 per obblighi locazione transitoria",
        "Deve citare DM 30/12/2002 per requisiti motivazione e durata",
        "Deve citare art. 11 L. 392/1978 per limite deposito cauzionale",
        "Deve citare art. 1576 c.c. per ripartizione manutenzione ordinaria/straordinaria",
      ],
      advisor: [
        "fairnessScore tra 2 e 4 (contratto con molteplici violazioni di legge)",
        "risks max 3, actions max 3",
        "needsLawyer = true (ci sono clausole potenzialmente nulle)",
        "Deve evidenziare che il contratto transitorio senza motivazione può essere convertito in 4+4",
      ],
    },
  },
];

// ─── Quality Rubrics per Agent ────────────────────────────────────────────────

const RUBRICS: Record<AgentName, string> = {
  classifier: `RUBRICA DI VALUTAZIONE — CLASSIFIER (Classificatore Documenti Legali)

Valuta l'output del classificatore su questi criteri (peso 1-10 per ciascuno):

1. TIPO DOCUMENTO (peso 2): Il documentType è corretto? Corrisponde al tipo reale del documento?
2. SOTTO-TIPO (peso 2): Il documentSubType è specifico e corretto? (es. "locazione_4+4" non generico "locazione")
3. ISTITUTI GIURIDICI (peso 3): relevantInstitutes identifica TUTTI gli istituti presenti nel documento?
   - Cerca: clausola penale, caparra, fideiussione, patto di non concorrenza, periodo di prova, ecc.
   - Penalizza se ne manca qualcuno evidente dal testo.
4. LEGGI APPLICABILI (peso 2): applicableLaws cita le leggi e gli articoli corretti e specifici?
   - Le referenze devono essere PRECISE (art. specifico, non generico "Codice Civile")
5. FORMATO OUTPUT (peso 1): L'output è JSON valido che inizia con { e finisce con }? I campi sono tutti presenti?

PENALIZZAZIONI GRAVI (score -3):
- Istituto giuridico inventato o inesistente
- Tipo documento completamente sbagliato
- Legge citata non pertinente al tipo di documento

Il punteggio finale è la media pesata, scala 1-10.`,

  analyzer: `RUBRICA DI VALUTAZIONE — ANALYZER (Analista Rischi Legali)

Valuta l'output dell'analista su questi criteri (peso 1-10 per ciascuno):

1. COMPLETEZZA RISCHI (peso 3): Identifica TUTTI i rischi reali presenti nel documento?
   - Clausole penali eccessive, garanzie mancanti, squilibri tra le parti
   - Penalizza se manca un rischio evidente dal testo
2. SEVERITÀ CORRETTA (peso 2): I riskLevel sono calibrati correttamente?
   - critical = probabilmente nullo/illegale
   - high = ai limiti della legalità
   - medium = sfavorevole ma legale
   - Penalizza se classifica come "low" qualcosa che è chiaramente "high" o viceversa
3. RIFERIMENTI NORMATIVI (peso 2): Le potentialViolation citano articoli corretti?
   - NON confondere istituti (art. 1537 vs 1538, 1385 vs 1386)
   - Penalizza se inventa articoli inesistenti
4. PUNTO DI VISTA PARTE DEBOLE (peso 2): L'analisi adotta il punto di vista del consumatore/conduttore/lavoratore?
5. FORMATO OUTPUT (peso 1): JSON valido, tutti i campi presenti, testo conciso

PENALIZZAZIONI GRAVI (score -3):
- Articolo di legge errato per l'istituto giuridico (confusione tra istituti simili)
- Rischio evidente non identificato (false negative)
- overallRisk incoerente con le clausole trovate

Il punteggio finale è la media pesata, scala 1-10.`,

  investigator: `RUBRICA DI VALUTAZIONE — INVESTIGATOR (Ricercatore Legale)

Valuta l'output dell'investigatore su questi criteri (peso 1-10 per ciascuno):

1. COPERTURA (peso 3): Produce findings per TUTTE le clausole critical e high? Non ne salta nessuna?
2. ACCURATEZZA NORMATIVA (peso 3): Le leggi citate sono corrette, vigenti e pertinenti?
   - reference: articolo esatto e corretto
   - isInForce: true solo se davvero vigente
   - NON confondere istituti (es. rescissione vs risoluzione vs annullamento)
3. SENTENZE (peso 2): Le courtCases sono reali o dichiarate come "non verificate"?
   - Sentenze inventate = GRAVE (score -5)
   - "Orientamento non verificato" quando non si trova = CORRETTO
4. LEGAL OPINION (peso 1): Il legalOpinion è coerente con le fonti citate?
5. FORMATO OUTPUT (peso 1): JSON valido, struttura findings corretta

PENALIZZAZIONI GRAVI (score -5):
- Sentenza Cassazione inventata con numero falso
- Legge citata abrogata senza segnalarlo
- Clausola critical o high senza finding

Il punteggio finale è la media pesata, scala 1-10.`,

  advisor: `RUBRICA DI VALUTAZIONE — ADVISOR (Consulente — linguaggio semplice)

Valuta l'output del consulente su questi criteri (peso 1-10 per ciascuno):

1. CHIAREZZA LINGUAGGIO (peso 3): Scrive "come parleresti a un amico"? Zero legalese?
   - "clausola penale eccessiva" NO → "la multa che devi pagare è troppo alta" SÌ
   - Frasi brevi, linguaggio da bar, niente paroloni giuridici
   - Penalizza pesantemente se usa termini tecnici senza spiegarli
2. LIMITI OUTPUT (peso 2): Rispetta i MASSIMI TASSATIVI?
   - risks: MASSIMO 3 (anche se ne trova di più, deve scegliere i 3 peggiori)
   - actions: MASSIMO 3
   - deadlines: MASSIMO 3
   - Violazione = score automatico 3/10
3. SCORING (peso 2): fairnessScore e scores sono calibrati correttamente?
   - fairnessScore = media dei 4 sub-scores
   - Non allarmista se il documento è buono
   - Non indulgente se il documento è pessimo
4. NEEDSLAWYER (peso 2): needsLawyer = true solo per problemi seri?
   - Se il contratto ha clausole potenzialmente nulle → true
   - Se il contratto è equilibrato con difetti minori → false
5. FORMATO OUTPUT (peso 1): JSON valido, tutti i campi presenti

PENALIZZAZIONI GRAVI (score -3):
- Più di 3 risks o 3 actions (violazione vincolo tassativo)
- Linguaggio da avvocato anziché da amico
- fairnessScore incoerente con i sub-scores (non è la media)
- needsLawyer = true per un contratto equilibrato (allarmismo)

Il punteggio finale è la media pesata, scala 1-10.`,
};

// ─── Agent Prompts (matching the real prompts from lib/prompts/) ──────────────

function getAgentPrompt(agent: AgentName, inputText: string, previousFeedback?: string): string {
  const feedbackSection = previousFeedback
    ? `\n\nFEEDBACK DAL REVISORE SULLA TUA RISPOSTA PRECEDENTE:
${previousFeedback}

ISTRUZIONI: Correggi i problemi evidenziati dal revisore. Produci un output migliorato che risolva TUTTI i punti critici segnalati.`
    : "";

  switch (agent) {
    case "classifier":
      return `Sei un esperto legale italiano con profonda conoscenza del diritto civile, commerciale e del lavoro. Classifica il documento fornito con la massima precisione giuridica.

IMPORTANTE: Rispondi ESCLUSIVAMENTE con JSON puro. NON usare backtick, code fence, markdown o testo aggiuntivo. La tua risposta deve iniziare con { e finire con }.

Formato richiesto:
{
  "documentType": "tipo_documento",
  "documentTypeLabel": "Etichetta Leggibile",
  "documentSubType": "sotto_tipo_specifico",
  "parties": [{ "role": "ruolo", "name": "Nome", "type": "persona_fisica|persona_giuridica" }],
  "jurisdiction": "Italia - Diritto ...",
  "applicableLaws": [{ "reference": "Art. ... c.c.", "name": "Nome legge" }],
  "relevantInstitutes": ["istituto_1", "istituto_2"],
  "legalFocusAreas": ["area_1", "area_2"],
  "keyDates": [{ "date": "YYYY-MM-DD", "description": "Descrizione" }],
  "summary": "Riassunto 2-3 frasi.",
  "confidence": 0.9
}

Identifica TUTTI gli istituti giuridici presenti (clausola_penale, caparra_confirmatoria, patto_non_concorrenza, periodo_di_prova, ecc.).
Identifica il sotto-tipo specifico (es. locazione_4+4, vendita_a_corpo, subordinato_tempo_indeterminato).
Campi incerti = null.${feedbackSection}

DOCUMENTO DA CLASSIFICARE:
${inputText}`;

    case "analyzer":
      return `Sei un avvocato italiano senior. Analizza il documento dal punto di vista della parte debole (consumatore/conduttore/lavoratore).

Identifica: clausole rischiose, potenzialmente nulle, ambigue, elementi mancanti, deviazioni dallo standard di mercato.

Rispondi SOLO con JSON valido (no markdown):
{
  "clauses": [{
    "id": "clause_1",
    "title": "Titolo breve",
    "originalText": "Testo originale dal documento",
    "riskLevel": "critical|high|medium|low|info",
    "issue": "Problema in 1-2 frasi",
    "potentialViolation": "Art. specifico violato",
    "marketStandard": "Cosa prevede il mercato",
    "recommendation": "Cosa fare"
  }],
  "missingElements": [{ "element": "Nome", "importance": "high|medium|low", "explanation": "Perché serve" }],
  "overallRisk": "critical|high|medium|low",
  "positiveAspects": ["Aspetto positivo 1"]
}

Livelli: critical=probabilmente nullo/illegale, high=ai limiti legalità, medium=sfavorevole ma legale, low=sotto standard.
NON classificare come rischio qualcosa conforme alla legge. Cita articoli specifici.${feedbackSection}

DOCUMENTO DA ANALIZZARE:
${inputText}`;

    case "investigator":
      return `Sei un ricercatore legale italiano esperto. Trova norme vigenti e sentenze per le clausole problematiche nel documento.

Per ogni clausola problematica:
1. Cerca la norma esatta vigente
2. Trova 1-2 sentenze Cassazione recenti (2020-2025) se possibile
3. Verifica la vigenza della norma

Rispondi SOLO con JSON valido (no markdown):
{
  "findings": [{
    "clauseId": "clause_1",
    "laws": [{
      "reference": "Art. ... c.c.",
      "fullText": "Testo della norma",
      "sourceUrl": "url se disponibile",
      "isInForce": true,
      "lastModified": null
    }],
    "courtCases": [{
      "reference": "Cass. Civ. n. .../2023",
      "court": "Corte di Cassazione",
      "date": "2023-01-01",
      "summary": "Cosa ha deciso",
      "relevance": "Perché è pertinente",
      "sourceUrl": "url"
    }],
    "legalOpinion": "Orientamento prevalente in 1-2 frasi"
  }]
}

REGOLE:
- Produci findings per TUTTE le clausole critical e high.
- NON inventare sentenze. Se non trovi, scrivi "orientamento non verificato".
- NON confondere istituti giuridici diversi.${feedbackSection}

DOCUMENTO DA INVESTIGARE:
${inputText}`;

    case "advisor":
      return `Traduci l'analisi legale in linguaggio chiaro. Scrivi come parleresti a un amico che non ha studiato legge. Italiano corrente, zero legalese, frasi brevi.

Rispondi SOLO con JSON valido (no markdown):
{
  "fairnessScore": 6.2,
  "scores": {
    "contractEquity": 6.2,
    "legalCoherence": 7.0,
    "practicalCompliance": 5.5,
    "completeness": 4.8
  },
  "summary": "Riassunto in 2-3 frasi.",
  "risks": [{ "severity": "alta|media|bassa", "title": "Titolo semplice", "detail": "Spiegazione chiara 1-2 frasi", "legalBasis": "Art. ...", "courtCase": "Cass. ..." }],
  "deadlines": [{ "date": "data", "action": "cosa fare" }],
  "actions": [{ "priority": 1, "action": "Cosa fare", "rationale": "Perché" }],
  "needsLawyer": true,
  "lawyerSpecialization": "Diritto ...",
  "lawyerReason": "Perché serve un avvocato"
}

LIMITI TASSATIVI: risks MASSIMO 3, actions MASSIMO 3, deadlines MASSIMO 3.
Se ne trovi di più, scegli i peggiori/più urgenti.

Non essere allarmista se il documento è buono. needsLawyer=true solo per problemi seri.
Linguaggio da bar — zero legalese, frasi brevi, come spiegare a un amico.${feedbackSection}

DOCUMENTO DA VALUTARE:
${inputText}`;
  }
}

// ─── Critic Prompt ────────────────────────────────────────────────────────────

function buildCriticPrompt(
  agent: AgentName,
  inputText: string,
  agentOutput: string,
  expectations: string[]
): string {
  return `Sei un supervisore senior della qualità per un sistema di analisi legale AI. Devi valutare l'output di un agente "${agent}".

RUBRICA DI VALUTAZIONE:
${RUBRICS[agent]}

ASPETTATIVE SPECIFICHE PER QUESTO DOCUMENTO:
${expectations.map((e, i) => `${i + 1}. ${e}`).join("\n")}

DOCUMENTO ORIGINALE FORNITO ALL'AGENTE:
${inputText.slice(0, 2000)}${inputText.length > 2000 ? "\n[...troncato...]" : ""}

OUTPUT DELL'AGENTE DA VALUTARE:
${agentOutput}

ISTRUZIONI: Valuta l'output dell'agente secondo la rubrica. Rispondi ESCLUSIVAMENTE con JSON puro (no markdown, no backtick). Inizia con { e finisci con }.

Formato richiesto:
{
  "score": 7.5,
  "passed": true,
  "strengths": ["punto forte 1", "punto forte 2"],
  "weaknesses": ["debolezza 1", "debolezza 2"],
  "criticalErrors": ["errore grave 1"],
  "feedback": "Feedback dettagliato per l'agente su come migliorare. Se score < threshold, spiega ESATTAMENTE cosa correggere.",
  "rubricScores": {
    "criterio1": 8,
    "criterio2": 6,
    "criterio3": 9
  }
}

"passed" = true se score >= 8 (o la soglia configurata), false altrimenti.
Sii severo ma giusto. Non regalare punti.`;
}

// ─── Claude CLI Runner ────────────────────────────────────────────────────────

interface CliResult {
  success: boolean;
  output: string;
  error?: string;
  timeMs: number;
}

function runClaude(prompt: string): CliResult {
  const startTime = Date.now();

  try {
    const result = spawnSync("claude", ["-p", prompt], {
      encoding: "utf-8",
      timeout: 120_000, // 2 minutes
      maxBuffer: 10 * 1024 * 1024, // 10MB
      env: { ...process.env },
      windowsHide: true,
    });

    const timeMs = Date.now() - startTime;

    if (result.error) {
      const errorMsg = result.error.message || String(result.error);

      // Expected demo environment errors
      if (errorMsg.includes("ENOENT")) {
        return {
          success: false,
          output: "",
          error: "ENOENT: 'claude' non trovato nel PATH. Esegui questo script da un terminale con claude CLI installato.",
          timeMs,
        };
      }

      return { success: false, output: "", error: errorMsg, timeMs };
    }

    if (result.status !== 0) {
      const stderr = (result.stderr || "").trim();

      // Credit balance error (expected in demo)
      if (stderr.includes("Credit balance") || stderr.includes("credit")) {
        return {
          success: false,
          output: "",
          error: "CREDITI INSUFFICIENTI: Credit balance is too low. Ambiente demo — nessun credito API disponibile.",
          timeMs,
        };
      }

      return {
        success: false,
        output: "",
        error: `Exit code ${result.status}: ${stderr.slice(0, 500)}`,
        timeMs,
      };
    }

    const output = (result.stdout || "").trim();
    return { success: true, output, timeMs };
  } catch (err) {
    const timeMs = Date.now() - startTime;
    return {
      success: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      timeMs,
    };
  }
}

// ─── JSON Extraction (robust, mirrors lib/anthropic.ts parser) ────────────────

function extractJson(raw: string): unknown | null {
  // 1. Direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // 2. Strip code fences
  const stripped = raw.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // continue
  }

  // 3. Regex extract { ... } or [ ... ]
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[0]);
    } catch {
      // continue
    }
  }

  const arrMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try {
      return JSON.parse(arrMatch[0]);
    } catch {
      // continue
    }
  }

  return null;
}

// ─── Iteration Types ──────────────────────────────────────────────────────────

interface CriticResult {
  score: number;
  passed: boolean;
  strengths: string[];
  weaknesses: string[];
  criticalErrors: string[];
  feedback: string;
  rubricScores?: Record<string, number>;
}

interface Iteration {
  iterationNumber: number;
  timestamp: string;
  agent: AgentName;
  agentTimeMs: number;
  criticTimeMs: number;
  agentOutput: unknown | null;
  agentOutputRaw: string;
  criticResult: CriticResult | null;
  criticRaw: string;
  score: number;
  passed: boolean;
  error?: string;
}

interface StressTestResult {
  agent: AgentName;
  sample: string;
  startedAt: string;
  completedAt: string;
  threshold: number;
  maxIterations: number;
  iterations: Iteration[];
  finalScore: number;
  finalPassed: boolean;
  totalIterations: number;
  totalTimeMs: number;
  verdict: "PASS" | "FAIL" | "ERROR";
  verdictReason: string;
}

// ─── Core Loop ────────────────────────────────────────────────────────────────

function runStressTest(
  agent: AgentName,
  sample: SampleText,
  maxIterations: number,
  threshold: number
): StressTestResult {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const iterations: Iteration[] = [];
  let previousFeedback: string | undefined;
  let finalScore = 0;
  let finalPassed = false;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  AGENT: ${agent.toUpperCase()} | SAMPLE: ${sample.name}`);
  console.log(`  Threshold: ${threshold}/10 | Max iterations: ${maxIterations}`);
  console.log(`${"─".repeat(60)}`);

  for (let i = 1; i <= maxIterations; i++) {
    console.log(`\n  Iterazione ${i}/${maxIterations}:`);

    // ── Step A: Run agent ──
    process.stdout.write(`    [${agent}] Generazione output...`);
    const agentPrompt = getAgentPrompt(agent, sample.text, previousFeedback);
    const agentResult = runClaude(agentPrompt);

    if (!agentResult.success) {
      console.log(` ERRORE`);
      console.log(`    ${agentResult.error}`);

      iterations.push({
        iterationNumber: i,
        timestamp: new Date().toISOString(),
        agent,
        agentTimeMs: agentResult.timeMs,
        criticTimeMs: 0,
        agentOutput: null,
        agentOutputRaw: "",
        criticResult: null,
        criticRaw: "",
        score: 0,
        passed: false,
        error: agentResult.error,
      });

      // If CLI not found or credits exhausted, no point retrying
      if (
        agentResult.error?.includes("ENOENT") ||
        agentResult.error?.includes("CREDITI INSUFFICIENTI")
      ) {
        console.log(`\n    Interruzione: errore non recuperabile.`);
        break;
      }

      continue;
    }

    console.log(` OK (${(agentResult.timeMs / 1000).toFixed(1)}s)`);

    const agentJson = extractJson(agentResult.output);
    if (!agentJson) {
      console.log(`    WARN: Output non è JSON valido (${agentResult.output.slice(0, 100)}...)`);
    }

    // ── Step B: Run critic ──
    process.stdout.write(`    [critic] Valutazione qualità...`);
    const criticPrompt = buildCriticPrompt(
      agent,
      sample.text,
      agentResult.output,
      sample.expectations[agent]
    );
    const criticResult = runClaude(criticPrompt);

    if (!criticResult.success) {
      console.log(` ERRORE`);
      console.log(`    ${criticResult.error}`);

      iterations.push({
        iterationNumber: i,
        timestamp: new Date().toISOString(),
        agent,
        agentTimeMs: agentResult.timeMs,
        criticTimeMs: criticResult.timeMs,
        agentOutput: agentJson,
        agentOutputRaw: agentResult.output,
        criticResult: null,
        criticRaw: "",
        score: 0,
        passed: false,
        error: `Critico fallito: ${criticResult.error}`,
      });

      if (
        criticResult.error?.includes("ENOENT") ||
        criticResult.error?.includes("CREDITI INSUFFICIENTI")
      ) {
        break;
      }

      continue;
    }

    console.log(` OK (${(criticResult.timeMs / 1000).toFixed(1)}s)`);

    const criticJson = extractJson(criticResult.output) as CriticResult | null;
    const score = criticJson?.score ?? 0;
    const passed = score >= threshold;

    // Build iteration record
    const iteration: Iteration = {
      iterationNumber: i,
      timestamp: new Date().toISOString(),
      agent,
      agentTimeMs: agentResult.timeMs,
      criticTimeMs: criticResult.timeMs,
      agentOutput: agentJson,
      agentOutputRaw: agentResult.output,
      criticResult: criticJson,
      criticRaw: criticResult.output,
      score,
      passed,
    };
    iterations.push(iteration);

    // ── Print iteration result ──
    const icon = passed ? "PASS" : "FAIL";
    const scoreColor = score >= threshold ? "OK" : score >= threshold - 2 ? "QUASI" : "BASSO";
    console.log(`\n    Score: ${score}/10 [${scoreColor}] — ${icon}`);

    if (criticJson) {
      if (criticJson.strengths?.length) {
        console.log(`    Punti di forza: ${criticJson.strengths.slice(0, 2).join("; ")}`);
      }
      if (criticJson.weaknesses?.length) {
        console.log(`    Debolezze: ${criticJson.weaknesses.slice(0, 2).join("; ")}`);
      }
      if (criticJson.criticalErrors?.length) {
        console.log(`    ERRORI CRITICI: ${criticJson.criticalErrors.join("; ")}`);
      }
    }

    finalScore = score;
    finalPassed = passed;

    // ── Step C: Check if passed ──
    if (passed) {
      console.log(`\n    QUALITÀ ACCETTABILE raggiunta in ${i} iterazione/i.`);
      break;
    }

    // ── Step D: Feed critique back for next iteration ──
    if (i < maxIterations) {
      previousFeedback = criticJson?.feedback ?? criticResult.output;
      console.log(`\n    Feedback al prossimo tentativo: ${(previousFeedback ?? "").slice(0, 200)}...`);
    } else {
      console.log(`\n    Max iterazioni raggiunto. Qualità non sufficiente.`);
    }
  }

  const totalTimeMs = Date.now() - startTime;
  const completedAt = new Date().toISOString();

  // Determine verdict
  let verdict: "PASS" | "FAIL" | "ERROR";
  let verdictReason: string;

  if (iterations.length === 0 || iterations.every((it) => it.error)) {
    verdict = "ERROR";
    verdictReason = `Tutte le iterazioni fallite: ${iterations[0]?.error ?? "nessun tentativo"}`;
  } else if (finalPassed) {
    verdict = "PASS";
    verdictReason = `Score ${finalScore}/10 >= threshold ${threshold}/10 in ${iterations.length} iterazione/i`;
  } else {
    verdict = "FAIL";
    verdictReason = `Score finale ${finalScore}/10 < threshold ${threshold}/10 dopo ${iterations.length} iterazione/i`;
  }

  return {
    agent,
    sample: sample.name,
    startedAt,
    completedAt,
    threshold,
    maxIterations,
    iterations,
    finalScore,
    finalPassed,
    totalIterations: iterations.length,
    totalTimeMs,
    verdict,
    verdictReason,
  };
}

// ─── Pipeline Mode (Full Chain: Classifier → Analyzer → Advisor) ─────────────

interface PipelinePhaseResult {
  output: unknown | null;
  raw: string;
  timeMs: number;
  error?: string;
}

interface PipelineTestResult {
  sample: string;
  sampleType: string;
  startedAt: string;
  completedAt: string;
  threshold: number;
  phases: {
    classifier: PipelinePhaseResult;
    analyzer: PipelinePhaseResult;
    advisor: PipelinePhaseResult;
  };
  critic: CriticResult | null;
  criticRaw: string;
  totalTimeMs: number;
  score: number;
  verdict: "PASS" | "FAIL" | "ERROR";
  verdictReason: string;
}

function buildAnalyzerPipelinePrompt(documentText: string, classifierOutput: unknown): string {
  return `Sei un avvocato italiano senior. Analizza il documento dal punto di vista della parte debole (consumatore/conduttore/lavoratore).

CONTESTO DAL CLASSIFICATORE (usa queste informazioni per guidare la tua analisi):
${JSON.stringify(classifierOutput, null, 2)}

Identifica: clausole rischiose, potenzialmente nulle, ambigue, elementi mancanti, deviazioni dallo standard di mercato.

Rispondi SOLO con JSON valido (no markdown):
{
  "clauses": [{
    "id": "clause_1",
    "title": "Titolo breve",
    "originalText": "Testo originale dal documento",
    "riskLevel": "critical|high|medium|low|info",
    "issue": "Problema in 1-2 frasi",
    "potentialViolation": "Art. specifico violato",
    "marketStandard": "Cosa prevede il mercato",
    "recommendation": "Cosa fare"
  }],
  "missingElements": [{ "element": "Nome", "importance": "high|medium|low", "explanation": "Perché serve" }],
  "overallRisk": "critical|high|medium|low",
  "positiveAspects": ["Aspetto positivo 1"]
}

Livelli: critical=probabilmente nullo/illegale, high=ai limiti legalità, medium=sfavorevole ma legale, low=sotto standard.
NON classificare come rischio qualcosa conforme alla legge. Cita articoli specifici.

DOCUMENTO DA ANALIZZARE:
${documentText}`;
}

function buildAdvisorPipelinePrompt(
  documentText: string,
  classifierOutput: unknown,
  analyzerOutput: unknown
): string {
  return `Traduci l'analisi legale in linguaggio chiaro. Scrivi come parleresti a un amico che non ha studiato legge. Italiano corrente, zero legalese, frasi brevi.

RISULTATO DEL CLASSIFICATORE:
${JSON.stringify(classifierOutput, null, 2)}

RISULTATO DELL'ANALISTA (clausole rischiose trovate):
${JSON.stringify(analyzerOutput, null, 2)}

Rispondi SOLO con JSON valido (no markdown):
{
  "fairnessScore": 6.2,
  "scores": {
    "contractEquity": 6.2,
    "legalCoherence": 7.0,
    "practicalCompliance": 5.5,
    "completeness": 4.8
  },
  "summary": "Riassunto in 2-3 frasi.",
  "risks": [{ "severity": "alta|media|bassa", "title": "Titolo semplice", "detail": "Spiegazione chiara 1-2 frasi", "legalBasis": "Art. ...", "courtCase": "Cass. ..." }],
  "deadlines": [{ "date": "data", "action": "cosa fare" }],
  "actions": [{ "priority": 1, "action": "Cosa fare", "rationale": "Perché" }],
  "needsLawyer": true,
  "lawyerSpecialization": "Diritto ...",
  "lawyerReason": "Perché serve un avvocato"
}

LIMITI TASSATIVI: risks MASSIMO 3, actions MASSIMO 3, deadlines MASSIMO 3.
Basati sui risultati del classificatore e dell'analista. Il fairnessScore deve riflettere la gravità delle clausole trovate.
Linguaggio da bar — zero legalese, frasi brevi, come spiegare a un amico.

DOCUMENTO ORIGINALE:
${documentText.slice(0, 1500)}`;
}

function buildPipelineCriticPrompt(
  sample: SampleText,
  classifier: unknown,
  analyzer: unknown,
  advisor: unknown
): string {
  const allExpectations = [
    ...sample.expectations.classifier.map((e) => `[CLASSIFICATORE] ${e}`),
    ...sample.expectations.analyzer.map((e) => `[ANALISTA] ${e}`),
    ...sample.expectations.advisor.map((e) => `[CONSIGLIERE] ${e}`),
  ];

  return `Sei un supervisore senior della qualità per un sistema di analisi legale AI.
Valuta l'output COMPLETO della pipeline a 3 fasi: classificatore → analista → consigliere.

DOCUMENTO ORIGINALE:
${sample.text.slice(0, 2000)}

ASPETTATIVE (ground truth):
${allExpectations.map((e, i) => `${i + 1}. ${e}`).join("\n")}

OUTPUT CLASSIFICATORE:
${JSON.stringify(classifier, null, 2)}

OUTPUT ANALISTA:
${JSON.stringify(analyzer, null, 2)}

OUTPUT CONSIGLIERE:
${JSON.stringify(advisor, null, 2)}

VALUTA la pipeline su questi criteri (peso 1-10 per ciascuno):
1. COERENZA TRA FASI (peso 3): Il classificatore alimenta correttamente l'analista? L'analista alimenta correttamente il consigliere? Gli istituti identificati dal classificatore sono usati dall'analista?
2. COMPLETEZZA (peso 2): Tutti i problemi importanti (vedi aspettative) sono stati identificati dalla pipeline? Rischi mancati?
3. ACCURATEZZA LEGALE (peso 2): Riferimenti normativi corretti? Articoli giusti per il tipo di documento e istituto?
4. QUALITÀ CONSIGLIO FINALE (peso 2): Il consiglio è chiaro, actionable, non allarmista? Linguaggio da bar?
5. FORMATO (peso 1): Tutti gli output sono JSON validi con campi completi? Max 3 risks e 3 actions rispettati?

Rispondi ESCLUSIVAMENTE con JSON puro (no markdown, no backtick). Inizia con { e finisci con }.
{
  "score": 7.5,
  "passed": true,
  "strengths": ["punto forte 1", "punto forte 2"],
  "weaknesses": ["debolezza 1", "debolezza 2"],
  "criticalErrors": ["errore grave"],
  "feedback": "Feedback dettagliato su cosa migliorare.",
  "rubricScores": {
    "coerenzaFasi": 8,
    "completezza": 7,
    "accuratezzaLegale": 8,
    "qualitaConsiglio": 7,
    "formato": 9
  }
}

Sii severo ma giusto. Non regalare punti. "passed" = true se score >= 7.`;
}

function runPipelineTest(
  sample: SampleText,
  threshold: number
): PipelineTestResult {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const phases: PipelineTestResult["phases"] = {
    classifier: { output: null, raw: "", timeMs: 0 },
    analyzer: { output: null, raw: "", timeMs: 0 },
    advisor: { output: null, raw: "", timeMs: 0 },
  };

  console.log(`\n${"─".repeat(60)}`);
  console.log(`  PIPELINE: ${sample.name} (${sample.type})`);
  console.log(`${"─".repeat(60)}`);

  // ── Phase 1: Classifier ──
  process.stdout.write(`  [1/3] Classificatore...`);
  const classifierPrompt = getAgentPrompt("classifier", sample.text);
  const classifierResult = runClaude(classifierPrompt);

  if (!classifierResult.success) {
    console.log(` ERRORE: ${classifierResult.error}`);
    phases.classifier = { output: null, raw: "", timeMs: classifierResult.timeMs, error: classifierResult.error };
    return buildPipelineResult(sample, startedAt, phases, null, "", startTime, threshold);
  }

  const classifierJson = extractJson(classifierResult.output);
  phases.classifier = { output: classifierJson, raw: classifierResult.output, timeMs: classifierResult.timeMs };
  console.log(` OK (${(classifierResult.timeMs / 1000).toFixed(1)}s)`);

  if (!classifierJson) {
    console.log(`    WARN: Output classificatore non è JSON valido`);
  }

  // ── Phase 2: Analyzer (con output classificatore) ──
  process.stdout.write(`  [2/3] Analista...`);
  const analyzerPrompt = buildAnalyzerPipelinePrompt(sample.text, classifierJson);
  const analyzerResult = runClaude(analyzerPrompt);

  if (!analyzerResult.success) {
    console.log(` ERRORE: ${analyzerResult.error}`);
    phases.analyzer = { output: null, raw: "", timeMs: analyzerResult.timeMs, error: analyzerResult.error };
    return buildPipelineResult(sample, startedAt, phases, null, "", startTime, threshold);
  }

  const analyzerJson = extractJson(analyzerResult.output);
  phases.analyzer = { output: analyzerJson, raw: analyzerResult.output, timeMs: analyzerResult.timeMs };
  const clauseCount = (analyzerJson as Record<string, unknown>)?.clauses ? (((analyzerJson as Record<string, unknown>).clauses) as unknown[]).length : "?";
  const overallRisk = (analyzerJson as Record<string, unknown>)?.overallRisk ?? "?";
  console.log(` OK (${(analyzerResult.timeMs / 1000).toFixed(1)}s) — ${clauseCount} clausole, rischio: ${overallRisk}`);

  // ── Phase 3: Advisor (con output classificatore + analista) ──
  process.stdout.write(`  [3/3] Consigliere...`);
  const advisorPrompt = buildAdvisorPipelinePrompt(sample.text, classifierJson, analyzerJson);
  const advisorResult = runClaude(advisorPrompt);

  if (!advisorResult.success) {
    console.log(` ERRORE: ${advisorResult.error}`);
    phases.advisor = { output: null, raw: "", timeMs: advisorResult.timeMs, error: advisorResult.error };
    return buildPipelineResult(sample, startedAt, phases, null, "", startTime, threshold);
  }

  const advisorJson = extractJson(advisorResult.output);
  phases.advisor = { output: advisorJson, raw: advisorResult.output, timeMs: advisorResult.timeMs };
  const fairness = (advisorJson as Record<string, unknown>)?.fairnessScore ?? "?";
  const needsLawyer = (advisorJson as Record<string, unknown>)?.needsLawyer ?? "?";
  console.log(` OK (${(advisorResult.timeMs / 1000).toFixed(1)}s) — score: ${fairness}, lawyer: ${needsLawyer}`);

  // ── Evaluate full pipeline ──
  process.stdout.write(`  [eval] Valutazione pipeline...`);
  const criticPrompt = buildPipelineCriticPrompt(sample, classifierJson, analyzerJson, advisorJson);
  const criticResult = runClaude(criticPrompt);

  let criticJson: CriticResult | null = null;
  let criticRaw = "";

  if (criticResult.success) {
    criticJson = extractJson(criticResult.output) as CriticResult | null;
    criticRaw = criticResult.output;
    const score = criticJson?.score ?? 0;
    const passed = score >= threshold;
    const icon = passed ? "PASS" : "FAIL";
    console.log(` ${score}/10 [${icon}] (${(criticResult.timeMs / 1000).toFixed(1)}s)`);

    if (criticJson?.strengths?.length) {
      console.log(`    Forza: ${criticJson.strengths.slice(0, 2).join("; ")}`);
    }
    if (criticJson?.weaknesses?.length) {
      console.log(`    Debolezze: ${criticJson.weaknesses.slice(0, 2).join("; ")}`);
    }
    if (criticJson?.criticalErrors?.length) {
      console.log(`    ERRORI: ${criticJson.criticalErrors.join("; ")}`);
    }
  } else {
    console.log(` ERRORE: ${criticResult.error}`);
  }

  return buildPipelineResult(sample, startedAt, phases, criticJson, criticRaw, startTime, threshold);
}

function buildPipelineResult(
  sample: SampleText,
  startedAt: string,
  phases: PipelineTestResult["phases"],
  criticJson: CriticResult | null,
  criticRaw: string,
  startTime: number,
  threshold: number
): PipelineTestResult {
  const totalTimeMs = Date.now() - startTime;
  const score = criticJson?.score ?? 0;
  const allErrors = [phases.classifier, phases.analyzer, phases.advisor].filter((p) => p.error);

  let verdict: "PASS" | "FAIL" | "ERROR";
  let verdictReason: string;

  if (allErrors.length === 3 || (phases.classifier.error && !phases.classifier.output)) {
    verdict = "ERROR";
    verdictReason = `Pipeline fallita: ${phases.classifier.error ?? "errore sconosciuto"}`;
  } else if (score >= threshold) {
    verdict = "PASS";
    verdictReason = `Score ${score}/10 >= threshold ${threshold}/10`;
  } else {
    verdict = "FAIL";
    verdictReason = `Score ${score}/10 < threshold ${threshold}/10`;
  }

  return {
    sample: sample.name,
    sampleType: sample.type,
    startedAt,
    completedAt: new Date().toISOString(),
    threshold,
    phases,
    critic: criticJson,
    criticRaw,
    totalTimeMs,
    score,
    verdict,
    verdictReason,
  };
}

function runPipelineMode(samples: SampleText[], threshold: number) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   PIPELINE STRESS TEST — Classifier → Analyzer → Advisor   ║");
  console.log("║   Full chain via claude -p (Opus, Max subscription)         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nSample: ${samples.map((s) => s.name).join(", ")}`);
  console.log(`Threshold: ${threshold}/10 | Totale: ${samples.length}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const results: PipelineTestResult[] = [];

  for (const sample of samples) {
    const result = runPipelineTest(sample, threshold);
    results.push(result);
  }

  // ── Summary ──
  console.log("\n\n" + "═".repeat(70));
  console.log("  RIEPILOGO PIPELINE STRESS TEST");
  console.log("═".repeat(70));

  console.log(
    "\n  " +
      "Sample".padEnd(40) +
      "Score".padEnd(8) +
      "Tempo".padEnd(10) +
      "Verdict"
  );
  console.log("  " + "─".repeat(58));

  for (const r of results) {
    const verdictIcon = r.verdict === "PASS" ? "PASS" : r.verdict === "FAIL" ? "FAIL" : "ERR ";
    console.log(
      "  " +
        r.sample.slice(0, 38).padEnd(40) +
        `${r.score}/10`.padEnd(8) +
        `${(r.totalTimeMs / 1000).toFixed(1)}s`.padEnd(10) +
        verdictIcon
    );
  }

  // ── Phase timing ──
  console.log("\n  Tempi per fase:");
  for (const r of results) {
    const c = (r.phases.classifier.timeMs / 1000).toFixed(1);
    const a = (r.phases.analyzer.timeMs / 1000).toFixed(1);
    const v = (r.phases.advisor.timeMs / 1000).toFixed(1);
    console.log(`    ${r.sample.slice(0, 35)}: C=${c}s A=${a}s V=${v}s`);
  }

  // ── Save results ──
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const reportPath = path.resolve(LOGS_DIR, `stress-test-pipeline-${timestamp}.json`);

  // Clean results for saving (remove raw strings)
  const cleanedResults = results.map((r) => ({
    ...r,
    phases: {
      classifier: { output: r.phases.classifier.output, timeMs: r.phases.classifier.timeMs, error: r.phases.classifier.error },
      analyzer: { output: r.phases.analyzer.output, timeMs: r.phases.analyzer.timeMs, error: r.phases.analyzer.error },
      advisor: { output: r.phases.advisor.output, timeMs: r.phases.advisor.timeMs, error: r.phases.advisor.error },
    },
    criticRaw: undefined,
  }));

  fs.writeFileSync(reportPath, JSON.stringify(cleanedResults, null, 2));
  console.log(`\n  Report salvato: ${reportPath}`);

  // ── Also save individual scenario results as JSON in stress-test-results/ ──
  const resultsDir = path.resolve(__dirname, "stress-test-results");
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  for (const r of results) {
    const scenarioPath = path.resolve(resultsDir, `${r.sample}-pipeline.json`);
    fs.writeFileSync(scenarioPath, JSON.stringify({
      sample: r.sample,
      type: r.sampleType,
      score: r.score,
      verdict: r.verdict,
      timestamp: r.completedAt,
      classification: r.phases.classifier.output,
      analysis: r.phases.analyzer.output,
      advice: r.phases.advisor.output,
      evaluation: r.critic,
    }, null, 2));
  }
  console.log(`  Risultati individuali: ${resultsDir}/`);

  // ── Final stats ──
  const passed = results.filter((r) => r.verdict === "PASS").length;
  const failed = results.filter((r) => r.verdict === "FAIL").length;
  const errors = results.filter((r) => r.verdict === "ERROR").length;
  const avgScore = results.length > 0
    ? (results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(1)
    : "0";
  const totalTime = results.reduce((sum, r) => sum + r.totalTimeMs, 0);

  console.log(`\n  Risultati: ${passed} PASS | ${failed} FAIL | ${errors} ERROR`);
  console.log(`  Score medio: ${avgScore}/10`);
  console.log(`  Tempo totale: ${(totalTime / 1000).toFixed(1)}s`);
  console.log("");

  process.exit(errors === results.length ? 1 : 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // ── List samples ──
  if (hasFlag("list-samples")) {
    console.log("\nSample disponibili:\n");
    SAMPLE_TEXTS.forEach((s, i) => {
      console.log(`  [${i}] ${s.name} (${s.type}) — ${s.text.length} chars`);
      console.log(`      Agenti testabili: ${ALL_AGENTS.join(", ")}`);
    });
    console.log(`\nUsage: npx tsx scripts/stress-test.ts --agent classifier --sample 0\n`);
    return;
  }

  // ── Parse args ──
  const agentArg = getFlag("agent");
  const maxIterations = parseInt(getFlag("max-iterations") ?? "5", 10);
  const threshold = parseInt(getFlag("threshold") ?? "8", 10);
  const sampleIdx = getFlag("sample") !== undefined ? parseInt(getFlag("sample")!, 10) : undefined;
  const inputText = getFlag("input");
  const inputFile = getFlag("file");

  // ── Pipeline mode ──
  if (hasFlag("pipeline")) {
    const pipelineSampleIdx = getFlag("sample") !== undefined ? parseInt(getFlag("sample")!, 10) : undefined;
    let pipelineSamples: SampleText[];

    if (pipelineSampleIdx !== undefined) {
      if (pipelineSampleIdx < 0 || pipelineSampleIdx >= SAMPLE_TEXTS.length) {
        console.error(`Sample index ${pipelineSampleIdx} fuori range. Validi: 0-${SAMPLE_TEXTS.length - 1}`);
        process.exit(1);
      }
      pipelineSamples = [SAMPLE_TEXTS[pipelineSampleIdx]];
    } else {
      pipelineSamples = SAMPLE_TEXTS;
    }

    runPipelineMode(pipelineSamples, threshold);
    return;
  }

  // ── Export scenarios as JSON ──
  if (hasFlag("export-scenarios")) {
    const scenariosDir = path.resolve(__dirname, "stress-test-scenarios");
    if (!fs.existsSync(scenariosDir)) fs.mkdirSync(scenariosDir, { recursive: true });

    for (const sample of SAMPLE_TEXTS) {
      const filepath = path.resolve(scenariosDir, `${sample.name}.json`);
      fs.writeFileSync(filepath, JSON.stringify({
        id: sample.name,
        name: sample.name.replace(/_/g, " "),
        category: sample.type,
        documentText: sample.text,
        expectations: sample.expectations,
      }, null, 2));
      console.log(`  Esportato: ${filepath}`);
    }
    console.log(`\nTotale: ${SAMPLE_TEXTS.length} scenari esportati in ${scenariosDir}/`);
    return;
  }

  if (!agentArg) {
    console.log(`
Recursive Quality Stress Test — Agenti Legali AI
═══════════════════════════════════════════════════

Usage:
  npx tsx scripts/stress-test.ts --agent <agent> [options]
  npx tsx scripts/stress-test.ts --pipeline [options]

Agenti: classifier, analyzer, investigator, advisor, all

Modalità:
  --agent <name>          Testa un singolo agente (loop ricorsivo agent→critic→feedback)
  --pipeline              Testa la catena completa Classifier→Analyzer→Advisor

Options:
  --max-iterations <n>    Max iterazioni per convergenza (default: 5, solo --agent)
  --threshold <n>         Score minimo per PASS (default: 8, scala 1-10)
  --sample <n>            Indice sample da usare (0-${SAMPLE_TEXTS.length - 1})
  --input "testo"         Testo contratto inline (al posto dei sample)
  --file path/to/file     File di testo da usare come input
  --list-samples          Mostra i sample disponibili
  --export-scenarios      Esporta tutti gli scenari come JSON in stress-test-scenarios/

Esempi:
  npx tsx scripts/stress-test.ts --pipeline                    # Pipeline completa su tutti i sample
  npx tsx scripts/stress-test.ts --pipeline --sample 0         # Pipeline su un solo sample
  npx tsx scripts/stress-test.ts --agent classifier --max-iterations 3
  npx tsx scripts/stress-test.ts --agent all --threshold 7
  npx tsx scripts/stress-test.ts --agent advisor --sample 2
  npx tsx scripts/stress-test.ts --export-scenarios            # Esporta JSON
`);
    process.exit(1);
  }

  // Determine agents to test
  const agents: AgentName[] = agentArg === "all" ? [...ALL_AGENTS] : [agentArg as AgentName];

  // Validate agent names
  for (const a of agents) {
    if (!ALL_AGENTS.includes(a)) {
      console.error(`Agente sconosciuto: "${a}". Validi: ${ALL_AGENTS.join(", ")}, all`);
      process.exit(1);
    }
  }

  // Determine input samples
  let samples: SampleText[];
  if (inputText) {
    // Custom inline text — use for all agents with generic expectations
    samples = [
      {
        name: "custom_input",
        type: "custom",
        text: inputText,
        expectations: {
          classifier: ["Output JSON valido con tutti i campi"],
          analyzer: ["Identifica rischi reali", "riskLevel calibrati"],
          investigator: ["Findings per clausole critical/high", "Nessuna sentenza inventata"],
          advisor: ["Max 3 risks", "Max 3 actions", "Linguaggio chiaro"],
        },
      },
    ];
  } else if (inputFile) {
    // Read from file
    const filePath = path.resolve(inputFile);
    if (!fs.existsSync(filePath)) {
      console.error(`File non trovato: ${filePath}`);
      process.exit(1);
    }
    const fileContent = fs.readFileSync(filePath, "utf-8");
    samples = [
      {
        name: path.basename(filePath, path.extname(filePath)),
        type: "file",
        text: fileContent,
        expectations: {
          classifier: ["Output JSON valido con tutti i campi"],
          analyzer: ["Identifica rischi reali", "riskLevel calibrati"],
          investigator: ["Findings per clausole critical/high", "Nessuna sentenza inventata"],
          advisor: ["Max 3 risks", "Max 3 actions", "Linguaggio chiaro"],
        },
      },
    ];
  } else if (sampleIdx !== undefined) {
    if (sampleIdx < 0 || sampleIdx >= SAMPLE_TEXTS.length) {
      console.error(`Sample index ${sampleIdx} fuori range. Validi: 0-${SAMPLE_TEXTS.length - 1}`);
      process.exit(1);
    }
    samples = [SAMPLE_TEXTS[sampleIdx]];
  } else {
    samples = SAMPLE_TEXTS;
  }

  // ── Header ──
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   RECURSIVE QUALITY STRESS TEST — Agenti Legali AI         ║");
  console.log("║   Loop: agent → critic → feedback → agent → until quality  ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nAgenti: ${agents.join(", ")}`);
  console.log(`Sample: ${samples.map((s) => s.name).join(", ")}`);
  console.log(`Threshold: ${threshold}/10 | Max iterazioni: ${maxIterations}`);
  console.log(`Totale test: ${agents.length * samples.length}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // ── Run tests ──
  const allResults: StressTestResult[] = [];

  for (const agent of agents) {
    for (const sample of samples) {
      const result = runStressTest(agent, sample, maxIterations, threshold);
      allResults.push(result);
    }
  }

  // ── Summary ──
  console.log("\n\n" + "═".repeat(70));
  console.log("  RIEPILOGO STRESS TEST QUALITATIVO");
  console.log("═".repeat(70));

  console.log(
    "\n  " +
      "Agent".padEnd(16) +
      "Sample".padEnd(32) +
      "Score".padEnd(8) +
      "Iter".padEnd(6) +
      "Tempo".padEnd(10) +
      "Verdict"
  );
  console.log("  " + "─".repeat(68));

  for (const r of allResults) {
    const verdictIcon = r.verdict === "PASS" ? "PASS" : r.verdict === "FAIL" ? "FAIL" : "ERR ";
    console.log(
      "  " +
        r.agent.padEnd(16) +
        r.sample.slice(0, 30).padEnd(32) +
        `${r.finalScore}/10`.padEnd(8) +
        `${r.totalIterations}`.padEnd(6) +
        `${(r.totalTimeMs / 1000).toFixed(1)}s`.padEnd(10) +
        verdictIcon
    );
  }

  // ── Score progression per test ──
  console.log("\n  Progressione score per test:");
  for (const r of allResults) {
    const scores = r.iterations.map((it) => (it.error ? "ERR" : `${it.score}`));
    console.log(`    ${r.agent}/${r.sample}: ${scores.join(" → ")} [${r.verdict}]`);
  }

  // ── Save report ──
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const reportPath = path.resolve(LOGS_DIR, `stress-test-${timestamp}.json`);

  // Save a cleaned version (no raw outputs to keep file size manageable)
  const cleanedResults = allResults.map((r) => ({
    ...r,
    iterations: r.iterations.map((it) => ({
      iterationNumber: it.iterationNumber,
      timestamp: it.timestamp,
      agent: it.agent,
      agentTimeMs: it.agentTimeMs,
      criticTimeMs: it.criticTimeMs,
      score: it.score,
      passed: it.passed,
      error: it.error,
      criticResult: it.criticResult,
      // Include parsed agent output but not raw strings
      agentOutput: it.agentOutput,
    })),
  }));

  fs.writeFileSync(reportPath, JSON.stringify(cleanedResults, null, 2));
  console.log(`\n  Report salvato: ${reportPath}`);

  // ── Final stats ──
  const passed = allResults.filter((r) => r.verdict === "PASS").length;
  const failed = allResults.filter((r) => r.verdict === "FAIL").length;
  const errors = allResults.filter((r) => r.verdict === "ERROR").length;
  const avgScore =
    allResults.length > 0
      ? (allResults.reduce((sum, r) => sum + r.finalScore, 0) / allResults.length).toFixed(1)
      : "0";
  const totalTime = allResults.reduce((sum, r) => sum + r.totalTimeMs, 0);

  console.log(`\n  Risultati: ${passed} PASS | ${failed} FAIL | ${errors} ERROR`);
  console.log(`  Score medio: ${avgScore}/10`);
  console.log(`  Tempo totale: ${(totalTime / 1000).toFixed(1)}s`);
  console.log("");

  process.exit(errors === allResults.length ? 1 : 0);
}

main();
