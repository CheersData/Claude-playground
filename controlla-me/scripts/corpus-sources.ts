/**
 * Definizioni di tutte le fonti del corpus giuridico.
 *
 * Ogni fonte specifica:
 * - ID univoco e nome
 * - Tipo (normattiva / eurlex)
 * - URL base per consultazione
 * - Gerarchia strutturale (come navigare l'albero)
 * - Range articoli stimato
 * - ConnectorConfig per il Data Connector
 * - Lifecycle per tracciamento stato pipeline
 */

// ─── Tipi ───

export interface HierarchyLevel {
  key: string;        // chiave nel campo JSONB hierarchy (es. "book", "title", "chapter")
  label: string;      // etichetta UI (es. "Libro", "Titolo", "Capo")
}

export type SourceLifecycle =
  | "planned"        // Fonte definita, nessun test
  | "api-tested"     // CONNECT completato: API funziona
  | "schema-ready"   // MODEL completato: schema DB verificato/creato
  | "loaded"         // LOAD completato: dati in DB
  | "delta-active";  // Delta updates automatici attivi

export interface ConnectorConfig {
  /** Normattiva: termini di ricerca per trovare l'atto */
  normattivaSearchTerms?: string[];
  /** Normattiva: tipo atto per filtro (es. "regio.decreto", "decreto.legislativo") */
  normattivaActType?: string;
  /** Formato preferito per il download */
  preferredFormat?: "akn" | "json" | "html" | "xml";
  /** Normattiva: usa caricaAKN diretto invece della ricerca asincrona (ZIP spesso vuoti) */
  directAkn?: boolean;
  /** Normattiva: codiceRedazionale hardcoded per caricaAKN diretto (es. "070U0300") */
  codiceRedazionale?: string;
}

export interface CorpusSource {
  id: string;
  name: string;
  shortName: string;
  type: "normattiva" | "eurlex";
  description: string;
  urn?: string;                    // URN Normattiva (es. "urn:nir:stato:regio.decreto:1942-03-16;262")
  celexId?: string;                // CELEX ID per EUR-Lex (es. "32016R0679")
  baseUrl: string;                 // URL per consultazione
  hierarchyLevels: HierarchyLevel[];
  estimatedArticles: number;
  connector?: ConnectorConfig;     // Config specifica per Data Connector
  lifecycle?: SourceLifecycle;     // Stato pipeline (default: "planned")
  /** Dominio verticale: "legal" | "hr" | "real-estate" | ... (default: "legal") */
  vertical?: string;
}

// ─── Fonti Italiane (Normattiva) ───

export const NORMATTIVA_SOURCES: CorpusSource[] = [
  {
    id: "codice_civile",
    name: "Codice Civile",
    shortName: "c.c.",
    type: "normattiva",
    description: "Regio Decreto 16 marzo 1942, n. 262",
    urn: "urn:nir:stato:regio.decreto:1942-03-16;262",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1942-03-16;262",
    hierarchyLevels: [
      { key: "book", label: "Libro" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 3150,
    connector: {
      normattivaSearchTerms: ["codice civile"],
      normattivaActType: "regio.decreto",
      preferredFormat: "akn",
    },
    lifecycle: "loaded", // Caricato via HuggingFace (4271 art.)
  },
  {
    id: "codice_penale",
    name: "Codice Penale",
    shortName: "c.p.",
    type: "normattiva",
    description: "Regio Decreto 19 ottobre 1930, n. 1398",
    urn: "urn:nir:stato:regio.decreto:1930-10-19;1398",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1930-10-19;1398",
    hierarchyLevels: [
      { key: "book", label: "Libro" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 767,
    connector: {
      normattivaSearchTerms: ["codice penale"],
      normattivaActType: "regio.decreto",
      preferredFormat: "akn",
    },
    lifecycle: "loaded",
  },
  {
    id: "codice_consumo",
    name: "Codice del Consumo",
    shortName: "Cod. Consumo",
    type: "normattiva",
    description: "D.Lgs. 6 settembre 2005, n. 206",
    urn: "urn:nir:stato:decreto.legislativo:2005-09-06;206",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206",
    hierarchyLevels: [
      { key: "part", label: "Parte" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 240,
    connector: {
      normattivaSearchTerms: ["codice del consumo", "decreto legislativo 206 2005"],
      normattivaActType: "decreto.legislativo",
      preferredFormat: "akn",
    },
    lifecycle: "loaded",
  },
  {
    id: "codice_proc_civile",
    name: "Codice di Procedura Civile",
    shortName: "c.p.c.",
    type: "normattiva",
    description: "Regio Decreto 28 ottobre 1940, n. 1443",
    urn: "urn:nir:stato:regio.decreto:1940-10-28;1443",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1940-10-28;1443",
    hierarchyLevels: [
      { key: "book", label: "Libro" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 887,
    connector: {
      normattivaSearchTerms: ["codice di procedura civile"],
      normattivaActType: "regio.decreto",
      preferredFormat: "akn",
    },
    lifecycle: "loaded",
  },
  {
    id: "dlgs_231_2001",
    name: "Responsabilita amministrativa enti",
    shortName: "D.Lgs. 231/2001",
    type: "normattiva",
    description: "D.Lgs. 8 giugno 2001, n. 231",
    urn: "urn:nir:stato:decreto.legislativo:2001-06-08;231",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-06-08;231",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 109,
    connector: {
      normattivaSearchTerms: ["responsabilita amministrativa enti", "decreto legislativo 231 2001"],
      normattivaActType: "decreto.legislativo",
      preferredFormat: "akn",
    },
    lifecycle: "loaded",
  },
  {
    id: "dlgs_122_2005",
    name: "Tutela acquirenti immobili da costruire",
    shortName: "D.Lgs. 122/2005",
    type: "normattiva",
    description: "D.Lgs. 20 giugno 2005, n. 122",
    urn: "urn:nir:stato:decreto.legislativo:2005-06-20;122",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-06-20;122",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 19,
    connector: {
      normattivaSearchTerms: ["tutela acquirenti immobili", "decreto legislativo 122 2005"],
      normattivaActType: "decreto.legislativo",
      preferredFormat: "akn",
    },
    lifecycle: "loaded",
  },
  {
    id: "statuto_lavoratori",
    name: "Statuto dei Lavoratori",
    shortName: "L. 300/1970",
    type: "normattiva",
    description: "Legge 20 maggio 1970, n. 300",
    urn: "urn:nir:stato:legge:1970-05-20;300",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1970-05-20;300",
    hierarchyLevels: [
      { key: "title", label: "Titolo" },
    ],
    estimatedArticles: 41,
    connector: {
      normattivaSearchTerms: ["statuto dei lavoratori", "legge 300 1970"],
      normattivaActType: "legge",
      preferredFormat: "akn",
      directAkn: true,
      codiceRedazionale: "070U0300",
    },
  },
  {
    id: "tu_edilizia",
    name: "Testo Unico Edilizia",
    shortName: "DPR 380/2001",
    type: "normattiva",
    description: "D.P.R. 6 giugno 2001, n. 380",
    urn: "urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380",
    baseUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380",
    hierarchyLevels: [
      { key: "part", label: "Parte" },
      { key: "title", label: "Titolo" },
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 151,
    connector: {
      normattivaSearchTerms: ["testo unico edilizia", "dpr 380 2001"],
      normattivaActType: "decreto.del.presidente.della.repubblica",
      preferredFormat: "akn",
    },
    lifecycle: "loaded",
  },
];

// ─── Fonti EU (EUR-Lex) ───

export const EURLEX_SOURCES: CorpusSource[] = [
  {
    id: "gdpr",
    name: "GDPR (Reg. 2016/679)",
    shortName: "GDPR",
    type: "eurlex",
    description: "Regolamento (UE) 2016/679 - Protezione dati personali",
    celexId: "32016R0679",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32016R0679",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 99,
    connector: { preferredFormat: "html" },
    lifecycle: "loaded",
  },
  {
    id: "dir_93_13_clausole_abusive",
    name: "Direttiva clausole abusive (93/13/CEE)",
    shortName: "Dir. 93/13",
    type: "eurlex",
    description: "Direttiva 93/13/CEE - Clausole abusive nei contratti con i consumatori",
    celexId: "31993L0013",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:31993L0013",
    hierarchyLevels: [],
    estimatedArticles: 11,
    connector: { preferredFormat: "html" },
    lifecycle: "loaded",
  },
  {
    id: "dir_2011_83_consumatori",
    name: "Direttiva diritti dei consumatori (2011/83/UE)",
    shortName: "Dir. 2011/83",
    type: "eurlex",
    description: "Direttiva 2011/83/UE - Diritti dei consumatori",
    celexId: "32011L0083",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32011L0083",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 35,
    connector: { preferredFormat: "html" },
    lifecycle: "loaded",
  },
  {
    id: "dir_2019_771_vendita_beni",
    name: "Direttiva vendita beni (2019/771/UE)",
    shortName: "Dir. 2019/771",
    type: "eurlex",
    description: "Direttiva (UE) 2019/771 - Conformita dei beni nei contratti di vendita",
    celexId: "32019L0771",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32019L0771",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 28,
    connector: { preferredFormat: "html" },
    lifecycle: "loaded",
  },
  {
    id: "reg_roma_i",
    name: "Regolamento Roma I (593/2008)",
    shortName: "Roma I",
    type: "eurlex",
    description: "Regolamento (CE) 593/2008 - Legge applicabile alle obbligazioni contrattuali",
    celexId: "32008R0593",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32008R0593",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
    ],
    estimatedArticles: 29,
    connector: { preferredFormat: "html" },
    lifecycle: "loaded",
  },
  {
    id: "dsa",
    name: "Digital Services Act (Reg. 2022/2065)",
    shortName: "DSA",
    type: "eurlex",
    description: "Regolamento (UE) 2022/2065 - Servizi digitali",
    celexId: "32022R2065",
    baseUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32022R2065",
    hierarchyLevels: [
      { key: "chapter", label: "Capo" },
      { key: "section", label: "Sezione" },
    ],
    estimatedArticles: 93,
    connector: { preferredFormat: "html" },
    lifecycle: "loaded",
  },
];

// ─── Aggregazioni ───

export const ALL_SOURCES: CorpusSource[] = [...NORMATTIVA_SOURCES, ...EURLEX_SOURCES];

export function getSourceById(id: string): CorpusSource | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

export function getSourcesByType(type: "normattiva" | "eurlex"): CorpusSource[] {
  return ALL_SOURCES.filter((s) => s.type === type);
}

// ─── Vertical Registry ───
// Mappa verticali → fonti. Ogni verticale è un dominio di conoscenza indipendente.
// Per aggiungere un verticale: creare le CorpusSource nel file del verticale,
// poi registrarle qui con registerVertical() o aggiungendo direttamente a SOURCES_BY_VERTICAL.

export type Vertical = string; // Stringa per extensibility — "legal" | "hr" | "real-estate" | ...

/** Mappa verticale → fonti. Mutabile per supporto registrazione dinamica. */
const _sourcesByVertical: Map<Vertical, CorpusSource[]> = new Map([
  ["legal", ALL_SOURCES],  // tutte le fonti correnti appartengono al verticale "legal"
]);

/**
 * Registra un nuovo verticale con le sue fonti.
 * Chiamato dai file verticale-specifici (es. hr-sources.ts) all'avvio.
 * Se il verticale esiste già, le fonti vengono aggiunte (non sostituite).
 */
export function registerVertical(vertical: Vertical, sources: CorpusSource[]): void {
  const existing = _sourcesByVertical.get(vertical) ?? [];
  _sourcesByVertical.set(vertical, [...existing, ...sources]);
}

/**
 * Restituisce tutte le fonti di un verticale.
 * Se il verticale non esiste, restituisce [].
 */
export function getSourcesByVertical(vertical: Vertical): CorpusSource[] {
  return _sourcesByVertical.get(vertical) ?? [];
}

/**
 * Tutti i verticali registrati.
 */
export function getVerticals(): Vertical[] {
  return Array.from(_sourcesByVertical.keys());
}

/**
 * Tutte le fonti di tutti i verticali (de-duplicata per id).
 */
export function getAllSourcesAcrossVerticals(): CorpusSource[] {
  const seen = new Set<string>();
  const result: CorpusSource[] = [];
  for (const sources of _sourcesByVertical.values()) {
    for (const s of sources) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        result.push(s);
      }
    }
  }
  return result;
}

// Gerarchia statica del Codice Civile (per il seed)
export const CODICE_CIVILE_HIERARCHY = {
  "Libro I": {
    name: "Delle persone e della famiglia",
    titles: {
      "Titolo I": "Delle persone fisiche",
      "Titolo II": "Delle persone giuridiche",
      "Titolo III": "Del domicilio e della residenza",
      "Titolo IV": "Dell'assenza e della dichiarazione di morte presunta",
      "Titolo V": "Della parentela e dell'affinita",
      "Titolo VI": "Del matrimonio",
      "Titolo VII": "Della filiazione",
      "Titolo VIII": "Dell'adozione di persone di maggiore eta",
      "Titolo IX": "Della responsabilita genitoriale e dei diritti e doveri del figlio",
      "Titolo X": "Della tutela e dell'emancipazione",
      "Titolo XI": "Dell'affiliazione e dell'affidamento",
      "Titolo XII": "Delle misure di protezione delle persone prive in tutto od in parte di autonomia",
      "Titolo XIII": "Degli alimenti",
    },
  },
  "Libro II": {
    name: "Delle successioni",
    titles: {
      "Titolo I": "Disposizioni generali sulle successioni",
      "Titolo II": "Delle successioni legittime",
      "Titolo III": "Delle successioni testamentarie",
      "Titolo IV": "Della divisione",
      "Titolo V": "Delle donazioni",
    },
  },
  "Libro III": {
    name: "Della proprieta",
    titles: {
      "Titolo I": "Dei beni",
      "Titolo II": "Della proprieta",
      "Titolo III": "Della superficie",
      "Titolo IV": "Dell'enfiteusi",
      "Titolo V": "Dell'usufrutto, dell'uso e dell'abitazione",
      "Titolo VI": "Delle servitu prediali",
      "Titolo VII": "Della comunione",
      "Titolo VIII": "Del possesso",
    },
  },
  "Libro IV": {
    name: "Delle obbligazioni",
    titles: {
      "Titolo I": "Delle obbligazioni in generale",
      "Titolo II": "Dei contratti in generale",
      "Titolo III": "Dei singoli contratti",
      "Titolo IV": "Delle promesse unilaterali",
      "Titolo V": "Dei titoli di credito",
      "Titolo VI": "Della gestione di affari",
      "Titolo VII": "Del pagamento dell'indebito",
      "Titolo VIII": "Dell'arricchimento senza causa",
      "Titolo IX": "Dei fatti illeciti",
    },
  },
  "Libro V": {
    name: "Del lavoro",
    titles: {
      "Titolo I": "Della disciplina delle attivita professionali",
      "Titolo II": "Del lavoro nell'impresa",
      "Titolo III": "Del lavoro autonomo",
      "Titolo IV": "Del lavoro subordinato in particolari rapporti",
      "Titolo V": "Delle societa",
      "Titolo VI": "Delle imprese cooperative e delle mutue assicuratrici",
      "Titolo VII": "Dell'associazione in partecipazione",
      "Titolo VIII": "Dell'azienda",
      "Titolo IX": "Dei diritti sulle opere dell'ingegno e sulle invenzioni industriali",
      "Titolo X": "Della disciplina della concorrenza e dei consorzi",
      "Titolo XI": "Disposizioni penali in materia di societa e di consorzi",
    },
  },
  "Libro VI": {
    name: "Della tutela dei diritti",
    titles: {
      "Titolo I": "Della trascrizione",
      "Titolo II": "Delle prove",
      "Titolo III": "Della responsabilita patrimoniale, delle cause di prelazione e della conservazione della garanzia patrimoniale",
      "Titolo IV": "Della tutela giurisdizionale dei diritti",
      "Titolo V": "Della prescrizione e della decadenza",
    },
  },
};
