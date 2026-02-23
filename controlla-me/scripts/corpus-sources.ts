/**
 * corpus-sources.ts — Definizioni delle 14 fonti legislative (8 IT + 6 EU).
 *
 * Ogni fonte specifica:
 * - Come scaricare gli articoli (normattiva URN, eurlex CELEX, huggingface dataset)
 * - Quanti articoli aspettarsi (per validazione)
 * - Gerarchia interna (Libro/Titolo/Capo per i codici)
 * - Keywords e istituti giuridici di default
 *
 * Usato da loader.ts per il caricamento su Supabase + Voyage AI.
 */

// ─── Tipi ───

export type SourceType = "normattiva" | "eurlex" | "huggingface";

export interface CorpusSource {
  /** Identificativo univoco della fonte */
  id: string;
  /** Nome visualizzato */
  name: string;
  /** Tipo di fonte */
  type: SourceType;
  /** Nome nel campo law_source del DB */
  lawSource: string;
  /** Articoli stimati (per validazione caricamento) */
  expectedArticles: number;
  /** Soglia minima: se sotto questa % del previsto, avvisa */
  minThresholdPct: number;
  /** Keywords di default applicate a tutti gli articoli della fonte */
  defaultKeywords: string[];
  /** Istituti giuridici di default */
  defaultInstitutes: string[];
  /** URL base per source_url degli articoli */
  sourceUrlPattern?: string;
}

export interface NormattivaSource extends CorpusSource {
  type: "normattiva";
  /** URN Normattiva (es. urn:nir:stato:regio.decreto:1942-03-16;262) */
  urn: string;
  /** Codice redazionale per API alternative */
  codiceRedazionale: string;
  /** Data pubblicazione GU (per URL API) */
  dataPubblicazioneGU: string;
  /** Tipo atto per URL */
  tipoAtto: string;
}

export interface EurLexSource extends CorpusSource {
  type: "eurlex";
  /** Numero CELEX (es. 32016R0679 per GDPR) */
  celex: string;
  /** Lingua: IT */
  lang: "IT";
}

export interface HuggingFaceSource extends CorpusSource {
  type: "huggingface";
  /** Dataset ID su HuggingFace */
  dataset: string;
  /** Config */
  config: string;
  /** Split */
  split: string;
}

// ─── Fonti Normattiva (8 fonti italiane) ───

export const NORMATTIVA_SOURCES: NormattivaSource[] = [
  {
    id: "codice-civile",
    name: "Codice Civile",
    type: "normattiva",
    lawSource: "Codice Civile",
    expectedArticles: 3150,
    minThresholdPct: 80,
    urn: "urn:nir:stato:regio.decreto:1942-03-16;262",
    codiceRedazionale: "042U0262",
    dataPubblicazioneGU: "1942-04-04",
    tipoAtto: "REGIO DECRETO",
    defaultKeywords: ["codice_civile", "diritto_civile"],
    defaultInstitutes: ["diritto_civile"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.civile:1942-03-16;262~art{N}",
  },
  {
    id: "codice-penale",
    name: "Codice Penale",
    type: "normattiva",
    lawSource: "Codice Penale",
    expectedArticles: 734,
    minThresholdPct: 80,
    urn: "urn:nir:stato:regio.decreto:1930-10-19;1398",
    codiceRedazionale: "030U1398",
    dataPubblicazioneGU: "1930-10-26",
    tipoAtto: "REGIO DECRETO",
    defaultKeywords: ["codice_penale", "diritto_penale", "reato"],
    defaultInstitutes: ["diritto_penale"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.penale:1930-10-19;1398~art{N}",
  },
  {
    id: "codice-consumo",
    name: "Codice del Consumo",
    type: "normattiva",
    lawSource: "D.Lgs. 206/2005",
    expectedArticles: 146,
    minThresholdPct: 70,
    urn: "urn:nir:stato:decreto.legislativo:2005-09-06;206",
    codiceRedazionale: "005G0232",
    dataPubblicazioneGU: "2005-10-08",
    tipoAtto: "DECRETO LEGISLATIVO",
    defaultKeywords: ["consumatore", "codice_consumo", "tutela_consumatore", "garanzia"],
    defaultInstitutes: ["tutela_consumatore", "codice_consumo"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206~art{N}",
  },
  {
    id: "codice-proc-civile",
    name: "Codice di Procedura Civile",
    type: "normattiva",
    lawSource: "Codice di Procedura Civile",
    expectedArticles: 831,
    minThresholdPct: 80,
    urn: "urn:nir:stato:regio.decreto:1940-10-28;1443",
    codiceRedazionale: "040U1443",
    dataPubblicazioneGU: "1940-12-28",
    tipoAtto: "REGIO DECRETO",
    defaultKeywords: ["procedura_civile", "processo_civile", "giudizio"],
    defaultInstitutes: ["procedura_civile"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.procedura.civile:1940-10-28;1443~art{N}",
  },
  {
    id: "dlgs-231-2001",
    name: "D.Lgs. 231/2001 — Responsabilità enti",
    type: "normattiva",
    lawSource: "D.Lgs. 231/2001",
    expectedArticles: 85,
    minThresholdPct: 70,
    urn: "urn:nir:stato:decreto.legislativo:2001-06-08;231",
    codiceRedazionale: "001G0291",
    dataPubblicazioneGU: "2001-06-19",
    tipoAtto: "DECRETO LEGISLATIVO",
    defaultKeywords: ["responsabilità_enti", "modello_organizzativo", "compliance", "231"],
    defaultInstitutes: ["responsabilità_amministrativa_enti", "compliance"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-06-08;231~art{N}",
  },
  {
    id: "dlgs-122-2005",
    name: "D.Lgs. 122/2005 — Tutela acquirenti immobili",
    type: "normattiva",
    lawSource: "D.Lgs. 122/2005",
    expectedArticles: 21,
    minThresholdPct: 70,
    urn: "urn:nir:stato:decreto.legislativo:2005-06-20;122",
    codiceRedazionale: "005G0146",
    dataPubblicazioneGU: "2005-07-06",
    tipoAtto: "DECRETO LEGISLATIVO",
    defaultKeywords: ["tutela_acquirenti", "immobili_da_costruire", "fideiussione", "preliminare"],
    defaultInstitutes: ["tutela_acquirenti_immobili", "fideiussione_immobiliare"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-06-20;122~art{N}",
  },
  {
    id: "statuto-lavoratori",
    name: "Statuto dei Lavoratori — L. 300/1970",
    type: "normattiva",
    lawSource: "L. 300/1970",
    expectedArticles: 41,
    minThresholdPct: 70,
    urn: "urn:nir:stato:legge:1970-05-20;300",
    codiceRedazionale: "070U0300",
    dataPubblicazioneGU: "1970-05-27",
    tipoAtto: "LEGGE",
    defaultKeywords: ["lavoro", "lavoratore", "diritti_lavoratore", "licenziamento", "sindacato"],
    defaultInstitutes: ["diritto_lavoro", "statuto_lavoratori"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1970-05-20;300~art{N}",
  },
  {
    id: "tu-edilizia",
    name: "TU Edilizia — DPR 380/2001",
    type: "normattiva",
    lawSource: "DPR 380/2001",
    expectedArticles: 138,
    minThresholdPct: 70,
    urn: "urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380",
    codiceRedazionale: "001G0256",
    dataPubblicazioneGU: "2001-10-20",
    tipoAtto: "DECRETO DEL PRESIDENTE DELLA REPUBBLICA",
    defaultKeywords: ["edilizia", "costruzione", "permesso_costruire", "concessione", "abuso_edilizio"],
    defaultInstitutes: ["edilizia", "urbanistica", "tu_edilizia"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:2001-06-06;380~art{N}",
  },
];

// ─── Fonti EUR-Lex (6 fonti europee) ───

export const EURLEX_SOURCES: EurLexSource[] = [
  {
    id: "gdpr",
    name: "GDPR — Reg. UE 2016/679",
    type: "eurlex",
    lawSource: "Reg. UE 2016/679 (GDPR)",
    celex: "32016R0679",
    lang: "IT",
    expectedArticles: 99,
    minThresholdPct: 80,
    defaultKeywords: ["privacy", "dati_personali", "trattamento_dati", "consenso", "GDPR", "protezione_dati"],
    defaultInstitutes: ["protezione_dati", "privacy", "GDPR"],
    sourceUrlPattern: "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:32016R0679",
  },
  {
    id: "dir-clausole-abusive",
    name: "Dir. 93/13/CEE — Clausole abusive",
    type: "eurlex",
    lawSource: "Dir. 93/13/CEE",
    celex: "31993L0013",
    lang: "IT",
    expectedArticles: 11,
    minThresholdPct: 70,
    defaultKeywords: ["clausole_abusive", "consumatore", "contratti_standard", "squilibrio"],
    defaultInstitutes: ["clausole_abusive", "tutela_consumatore"],
    sourceUrlPattern: "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:31993L0013",
  },
  {
    id: "dir-consumatori",
    name: "Dir. 2011/83/UE — Diritti consumatori",
    type: "eurlex",
    lawSource: "Dir. 2011/83/UE",
    celex: "32011L0083",
    lang: "IT",
    expectedArticles: 35,
    minThresholdPct: 70,
    defaultKeywords: ["diritto_recesso", "informazioni_precontrattuali", "consumatore", "vendita_distanza"],
    defaultInstitutes: ["recesso", "informazioni_precontrattuali", "tutela_consumatore"],
    sourceUrlPattern: "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:32011L0083",
  },
  {
    id: "dir-vendita-beni",
    name: "Dir. 2019/771/UE — Vendita beni",
    type: "eurlex",
    lawSource: "Dir. 2019/771/UE",
    celex: "32019L0771",
    lang: "IT",
    expectedArticles: 28,
    minThresholdPct: 70,
    defaultKeywords: ["vendita_beni", "garanzia_legale", "conformità", "difetto_conformità"],
    defaultInstitutes: ["garanzia_legale", "conformità_beni", "vendita_consumatore"],
    sourceUrlPattern: "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:32019L0771",
  },
  {
    id: "roma-i",
    name: "Reg. CE 593/2008 — Roma I",
    type: "eurlex",
    lawSource: "Reg. CE 593/2008 (Roma I)",
    celex: "32008R0593",
    lang: "IT",
    expectedArticles: 29,
    minThresholdPct: 70,
    defaultKeywords: ["legge_applicabile", "obbligazioni_contrattuali", "diritto_internazionale_privato"],
    defaultInstitutes: ["legge_applicabile", "Roma_I", "diritto_internazionale_privato"],
    sourceUrlPattern: "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:32008R0593",
  },
  {
    id: "dsa",
    name: "DSA — Reg. UE 2022/2065",
    type: "eurlex",
    lawSource: "Reg. UE 2022/2065 (DSA)",
    celex: "32022R2065",
    lang: "IT",
    expectedArticles: 93,
    minThresholdPct: 70,
    defaultKeywords: ["servizi_digitali", "piattaforme", "moderazione_contenuti", "intermediari"],
    defaultInstitutes: ["servizi_digitali", "DSA", "responsabilità_piattaforme"],
    sourceUrlPattern: "https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/?uri=CELEX:32022R2065",
  },
];

// ─── Fonte HuggingFace (Codice Civile alternativo con embeddings pre-calcolati) ───

export const HUGGINGFACE_SOURCES: HuggingFaceSource[] = [
  {
    id: "codice-civile-hf",
    name: "Codice Civile (HuggingFace)",
    type: "huggingface",
    lawSource: "Codice Civile",
    dataset: "AndreaSimeri/Italian_Civil_Code",
    config: "default",
    split: "train",
    expectedArticles: 2439,
    minThresholdPct: 80,
    defaultKeywords: ["codice_civile", "diritto_civile"],
    defaultInstitutes: ["diritto_civile"],
    sourceUrlPattern: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.civile:1942-03-16;262~art{N}",
  },
];

// ─── Tutte le fonti ───

export const ALL_SOURCES: CorpusSource[] = [
  ...NORMATTIVA_SOURCES,
  ...EURLEX_SOURCES,
  ...HUGGINGFACE_SOURCES,
];

// ─── Utilità ───

/** Raggruppa fonti per tipo */
export function getSourcesByType(): {
  normattiva: NormattivaSource[];
  eurlex: EurLexSource[];
  huggingface: HuggingFaceSource[];
} {
  return {
    normattiva: NORMATTIVA_SOURCES,
    eurlex: EURLEX_SOURCES,
    huggingface: HUGGINGFACE_SOURCES,
  };
}

/** Trova fonte per ID */
export function getSourceById(id: string): CorpusSource | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}

/** Articoli totali stimati */
export function getTotalExpectedArticles(): number {
  // Codice Civile: usa HuggingFace (prioritario), non sommare Normattiva
  const normattivaWithoutCC = NORMATTIVA_SOURCES.filter((s) => s.id !== "codice-civile");
  return (
    HUGGINGFACE_SOURCES.reduce((sum, s) => sum + s.expectedArticles, 0) +
    normattivaWithoutCC.reduce((sum, s) => sum + s.expectedArticles, 0) +
    EURLEX_SOURCES.reduce((sum, s) => sum + s.expectedArticles, 0)
  );
}

/** Sommario fonti per logging */
export function getSourcesSummary(): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════╗");
  lines.push("║  FONTI CORPUS LEGISLATIVO                                   ║");
  lines.push("╠══════════════════════════════════════════════════════════════╣");

  lines.push("║  IT — Normattiva:                                           ║");
  for (const s of NORMATTIVA_SOURCES) {
    lines.push(`║    ${s.name.padEnd(45)} ~${String(s.expectedArticles).padStart(5)} art. ║`);
  }

  lines.push("║  EU — EUR-Lex:                                              ║");
  for (const s of EURLEX_SOURCES) {
    lines.push(`║    ${s.name.padEnd(45)} ~${String(s.expectedArticles).padStart(5)} art. ║`);
  }

  lines.push("║  HuggingFace:                                               ║");
  for (const s of HUGGINGFACE_SOURCES) {
    lines.push(`║    ${s.name.padEnd(45)} ~${String(s.expectedArticles).padStart(5)} art. ║`);
  }

  lines.push(`║                                                              ║`);
  lines.push(`║  TOTALE STIMATO: ~${getTotalExpectedArticles()} articoli`.padEnd(63) + "║");
  lines.push("╚══════════════════════════════════════════════════════════════╝");

  return lines.join("\n");
}
