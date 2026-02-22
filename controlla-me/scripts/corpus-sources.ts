/**
 * corpus-sources.ts — Definizione di tutte le fonti legislative per il vector DB.
 *
 * Ogni fonte ha:
 * - Metadati (nome, URN Normattiva, CELEX EUR-Lex)
 * - Gerarchia strutturale (Libri/Titoli/Capi/Sezioni)
 * - Mappa istituti giuridici → range articoli
 *
 * Fonti:
 * 1. HuggingFace (Codice Civile — già implementato in seed-corpus.ts)
 * 2. Normattiva Open Data (codici e decreti italiani)
 * 3. EUR-Lex CELLAR (regolamenti e direttive UE)
 */

// ─── Tipi ───

export interface LawSourceConfig {
  id: string;
  name: string;
  abbreviation: string;
  sourceType: "huggingface" | "normattiva" | "eurlex";
  huggingfaceDataset?: string;
  normattivaUrn?: string;
  celexNumber?: string;
  webUrl: string;
  type: "codice" | "decreto_legislativo" | "legge" | "regolamento_ue" | "direttiva_ue" | "dpr";
  priority: number;
  estimatedArticles: number;
  hierarchy: HierarchyRange[];
  institutes: InstituteMapping[];
}

export interface HierarchyRange {
  from: number;
  to: number;
  hierarchy: {
    book?: string;
    part?: string;
    title?: string;
    chapter?: string;
    section?: string;
  };
}

export interface InstituteMapping {
  from: number;
  to: number;
  institutes: string[];
  keywords: string[];
}

// ═══════════════════════════════════════════════════════
// CODICI ITALIANI
// ═══════════════════════════════════════════════════════

export const CODICE_PENALE: LawSourceConfig = {
  id: "Codice Penale",
  name: "Codice Penale",
  abbreviation: "c.p.",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:regio.decreto:1930-10-19;1398",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1930-10-19;1398",
  type: "codice",
  priority: 2,
  estimatedArticles: 734,
  hierarchy: [
    { from: 1, to: 16, hierarchy: { book: "Libro I — Dei reati in generale", title: "Titolo I — Della legge penale" } },
    { from: 17, to: 38, hierarchy: { book: "Libro I", title: "Titolo II — Delle pene" } },
    { from: 39, to: 84, hierarchy: { book: "Libro I", title: "Titolo III — Del reato" } },
    { from: 85, to: 99, hierarchy: { book: "Libro I", title: "Titolo IV — Del reo e della persona offesa" } },
    { from: 100, to: 110, hierarchy: { book: "Libro I", title: "Titolo V — Delle modificazioni della pena" } },
    { from: 150, to: 184, hierarchy: { book: "Libro I", title: "Titolo VI — Dell'estinzione del reato e della pena" } },
    { from: 185, to: 198, hierarchy: { book: "Libro I", title: "Titolo VII — Delle sanzioni civili" } },
    { from: 199, to: 240, hierarchy: { book: "Libro I", title: "Titolo VIII — Delle misure di sicurezza" } },
    { from: 241, to: 313, hierarchy: { book: "Libro II — Dei delitti in particolare", title: "Titolo I — Dei delitti contro la personalità dello Stato" } },
    { from: 314, to: 360, hierarchy: { book: "Libro II", title: "Titolo II — Dei delitti contro la pubblica amministrazione" } },
    { from: 361, to: 401, hierarchy: { book: "Libro II", title: "Titolo III — Dei delitti contro l'amministrazione della giustizia" } },
    { from: 414, to: 421, hierarchy: { book: "Libro II", title: "Titolo V — Dei delitti contro l'ordine pubblico" } },
    { from: 453, to: 498, hierarchy: { book: "Libro II", title: "Titolo VII — Dei delitti contro la fede pubblica" } },
    { from: 499, to: 518, hierarchy: { book: "Libro II", title: "Titolo VIII — Dei delitti contro l'economia pubblica" } },
    { from: 575, to: 623, hierarchy: { book: "Libro II", title: "Titolo XII — Dei delitti contro la persona" } },
    { from: 624, to: 649, hierarchy: { book: "Libro II", title: "Titolo XIII — Dei delitti contro il patrimonio" } },
    { from: 650, to: 734, hierarchy: { book: "Libro III — Delle contravvenzioni in particolare" } },
  ],
  institutes: [
    { from: 314, to: 335, institutes: ["corruzione", "concussione", "peculato", "traffico_influenze"], keywords: ["corruzione", "concussione", "peculato", "pubblico_ufficiale", "indebita_percezione", "traffico_influenze"] },
    { from: 453, to: 498, institutes: ["falsità", "falso_documentale", "falso_ideologico", "uso_atto_falso"], keywords: ["falsità", "falso", "contraffazione", "documento", "atto_pubblico", "scrittura_privata"] },
    { from: 499, to: 518, institutes: ["frode_commercio", "aggiotaggio"], keywords: ["aggiotaggio", "frode", "commercio", "contraffazione"] },
    { from: 640, to: 649, institutes: ["truffa", "frode_informatica", "insolvenza_fraudolenta", "appropriazione_indebita", "usura"], keywords: ["truffa", "artifizio", "raggiro", "frode", "insolvenza", "appropriazione", "usura"] },
    { from: 629, to: 632, institutes: ["estorsione"], keywords: ["estorsione", "minaccia", "violenza", "costrizione"] },
    { from: 648, to: 648, institutes: ["ricettazione", "riciclaggio"], keywords: ["ricettazione", "riciclaggio", "provenienza_delittuosa"] },
  ],
};

export const CODICE_DEL_CONSUMO: LawSourceConfig = {
  id: "Codice del Consumo",
  name: "Codice del Consumo — D.Lgs. 206/2005",
  abbreviation: "Cod. Consumo",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:decreto.legislativo:2005-09-06;206",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-09-06;206",
  type: "decreto_legislativo",
  priority: 2,
  estimatedArticles: 146,
  hierarchy: [
    { from: 1, to: 3, hierarchy: { part: "Parte I — Disposizioni generali" } },
    { from: 18, to: 27, hierarchy: { part: "Parte II — Educazione, informazione, pratiche commerciali" } },
    { from: 33, to: 38, hierarchy: { part: "Parte III — Il rapporto di consumo", title: "Clausole vessatorie" } },
    { from: 45, to: 67, hierarchy: { part: "Parte III", title: "Contratti a distanza e fuori sede" } },
    { from: 52, to: 59, hierarchy: { part: "Parte III", title: "Contratti a distanza", chapter: "Diritto di recesso" } },
    { from: 128, to: 135, hierarchy: { part: "Parte III", title: "Garanzia legale di conformità" } },
    { from: 102, to: 113, hierarchy: { part: "Parte IV — Sicurezza e qualità" } },
    { from: 136, to: 141, hierarchy: { part: "Parte V — Associazioni consumatori e accesso alla giustizia" } },
  ],
  institutes: [
    { from: 33, to: 38, institutes: ["clausole_vessatorie", "squilibrio_contrattuale", "nullità_protezione"], keywords: ["vessatoria", "clausola_abusiva", "squilibrio", "consumatore", "professionista", "buona_fede", "lista_nera", "lista_grigia"] },
    { from: 45, to: 67, institutes: ["contratto_distanza", "contratto_fuori_sede", "obbligo_informazione_precontrattuale"], keywords: ["distanza", "fuori_sede", "informazione", "precontrattuale", "online", "e-commerce"] },
    { from: 52, to: 59, institutes: ["diritto_recesso", "quattordici_giorni", "rimborso"], keywords: ["recesso", "14_giorni", "ripensamento", "rimborso", "restituzione"] },
    { from: 128, to: 135, institutes: ["garanzia_legale", "conformità", "difetto_conformità", "riparazione_sostituzione"], keywords: ["garanzia", "conformità", "difetto", "riparazione", "sostituzione", "due_anni"] },
    { from: 18, to: 27, institutes: ["pratica_commerciale_scorretta", "pubblicità_ingannevole"], keywords: ["pratica_scorretta", "ingannevole", "aggressiva", "pubblicità"] },
    { from: 140, to: 141, institutes: ["class_action", "azione_classe"], keywords: ["class_action", "azione_classe", "collettiva", "associazione_consumatori"] },
  ],
};

export const CODICE_PROCEDURA_CIVILE: LawSourceConfig = {
  id: "Codice di Procedura Civile",
  name: "Codice di Procedura Civile",
  abbreviation: "c.p.c.",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:regio.decreto:1940-10-28;1443",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:regio.decreto:1940-10-28;1443",
  type: "codice",
  priority: 3,
  estimatedArticles: 831,
  hierarchy: [
    { from: 1, to: 68, hierarchy: { book: "Libro I — Disposizioni generali", title: "Giurisdizione e competenza" } },
    { from: 75, to: 111, hierarchy: { book: "Libro I", title: "Delle parti e dei difensori" } },
    { from: 163, to: 310, hierarchy: { book: "Libro II — Del processo di cognizione" } },
    { from: 323, to: 405, hierarchy: { book: "Libro II", title: "Delle impugnazioni" } },
    { from: 474, to: 632, hierarchy: { book: "Libro III — Del processo di esecuzione" } },
    { from: 633, to: 656, hierarchy: { book: "Libro IV — Procedimenti speciali", title: "Procedimento d'ingiunzione" } },
    { from: 657, to: 669, hierarchy: { book: "Libro IV", title: "Convalida di sfratto" } },
    { from: 669, to: 702, hierarchy: { book: "Libro IV", title: "Procedimenti cautelari" } },
    { from: 806, to: 840, hierarchy: { book: "Libro IV", title: "Dell'arbitrato" } },
  ],
  institutes: [
    { from: 1, to: 50, institutes: ["giurisdizione", "competenza_territoriale", "foro_competente"], keywords: ["giurisdizione", "competenza", "foro", "territoriale", "domicilio"] },
    { from: 806, to: 840, institutes: ["arbitrato", "clausola_arbitrale", "lodo_arbitrale"], keywords: ["arbitrato", "arbitro", "lodo", "clausola_compromissoria"] },
    { from: 633, to: 656, institutes: ["decreto_ingiuntivo", "procedimento_monitorio"], keywords: ["decreto_ingiuntivo", "ingiunzione", "opposizione", "provvisoria_esecuzione"] },
    { from: 669, to: 702, institutes: ["procedimento_cautelare", "sequestro", "provvedimento_urgenza"], keywords: ["cautelare", "sequestro", "conservativo", "urgenza"] },
    { from: 474, to: 632, institutes: ["esecuzione_forzata", "pignoramento", "titolo_esecutivo"], keywords: ["esecuzione", "pignoramento", "titolo_esecutivo", "precetto"] },
  ],
};

export const DLGS_231_2001: LawSourceConfig = {
  id: "D.Lgs. 231/2001",
  name: "Responsabilità amministrativa enti — D.Lgs. 231/2001",
  abbreviation: "D.Lgs. 231/2001",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:decreto.legislativo:2001-06-08;231",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2001-06-08;231",
  type: "decreto_legislativo",
  priority: 3,
  estimatedArticles: 85,
  hierarchy: [
    { from: 1, to: 4, hierarchy: { chapter: "Capo I — Disposizioni generali" } },
    { from: 5, to: 8, hierarchy: { chapter: "Capo I — Criteri di imputazione" } },
    { from: 9, to: 23, hierarchy: { chapter: "Capo I — Sanzioni" } },
    { from: 24, to: 25, hierarchy: { chapter: "Capo II — Reati presupposto" } },
    { from: 34, to: 51, hierarchy: { chapter: "Capo III — Procedimento di accertamento" } },
  ],
  institutes: [
    { from: 1, to: 8, institutes: ["responsabilità_ente", "modello_organizzativo_231", "compliance"], keywords: ["responsabilità", "ente", "persona_giuridica", "modello_organizzativo", "OdV", "compliance", "interesse", "vantaggio"] },
    { from: 24, to: 25, institutes: ["reati_presupposto_231", "corruzione", "frode", "reati_societari"], keywords: ["reato_presupposto", "corruzione", "truffa", "societario", "ambientale", "sicurezza_lavoro", "riciclaggio"] },
    { from: 9, to: 23, institutes: ["sanzioni_231", "sanzione_pecuniaria", "sanzione_interdittiva"], keywords: ["sanzione", "pecuniaria", "interdittiva", "confisca", "commissario_giudiziale"] },
  ],
};

export const DLGS_122_2005: LawSourceConfig = {
  id: "D.Lgs. 122/2005",
  name: "Tutela acquirenti immobili da costruire — D.Lgs. 122/2005",
  abbreviation: "D.Lgs. 122/2005",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:decreto.legislativo:2005-06-20;122",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.legislativo:2005-06-20;122",
  type: "decreto_legislativo",
  priority: 3,
  estimatedArticles: 21,
  hierarchy: [
    { from: 1, to: 1, hierarchy: { chapter: "Definizioni" } },
    { from: 2, to: 5, hierarchy: { chapter: "Garanzia fideiussoria" } },
    { from: 6, to: 7, hierarchy: { chapter: "Assicurazione dell'immobile" } },
    { from: 8, to: 10, hierarchy: { chapter: "Contenuto del contratto preliminare" } },
  ],
  institutes: [
    { from: 1, to: 5, institutes: ["acquisto_immobile_da_costruire", "fideiussione_122", "garanzia_fideiussoria"], keywords: ["immobile_da_costruire", "fideiussione", "garanzia", "costruttore", "acquirente", "crisi"] },
    { from: 6, to: 7, institutes: ["assicurazione_immobile", "polizza_decennale"], keywords: ["assicurazione", "polizza", "decennale", "vizi", "difetti"] },
    { from: 8, to: 10, institutes: ["contratto_preliminare_immobile", "contenuto_obbligatorio_preliminare"], keywords: ["preliminare", "contenuto", "obbligatorio", "fideiussione", "capitolato"] },
  ],
};

export const STATUTO_LAVORATORI: LawSourceConfig = {
  id: "Statuto dei Lavoratori",
  name: "Statuto dei Lavoratori — L. 300/1970",
  abbreviation: "L. 300/1970",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:legge:1970-05-20;300",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:1970-05-20;300",
  type: "legge",
  priority: 4,
  estimatedArticles: 41,
  hierarchy: [
    { from: 1, to: 13, hierarchy: { title: "Titolo I — Della libertà e dignità del lavoratore" } },
    { from: 14, to: 18, hierarchy: { title: "Titolo II — Della libertà sindacale" } },
    { from: 19, to: 27, hierarchy: { title: "Titolo III — Dell'attività sindacale" } },
    { from: 28, to: 41, hierarchy: { title: "Titolo IV — Disposizioni varie e generali" } },
  ],
  institutes: [
    { from: 4, to: 4, institutes: ["controllo_distanza_lavoratore", "videosorveglianza_lavoro"], keywords: ["controllo_distanza", "impianti_audiovisivi", "videosorveglianza", "strumenti_lavoro", "privacy"] },
    { from: 7, to: 10, institutes: ["sanzioni_disciplinari", "procedimento_disciplinare"], keywords: ["sanzione", "disciplinare", "contestazione", "difesa", "licenziamento"] },
    { from: 18, to: 18, institutes: ["licenziamento", "reintegrazione", "tutela_reale"], keywords: ["licenziamento", "reintegrazione", "tutela_reale", "giusta_causa", "giustificato_motivo"] },
  ],
};

export const TU_EDILIZIA: LawSourceConfig = {
  id: "DPR 380/2001",
  name: "Testo Unico Edilizia — DPR 380/2001",
  abbreviation: "TU Edilizia",
  sourceType: "normattiva",
  normattivaUrn: "urn:nir:stato:decreto.presidente.repubblica:2001-06-06;380",
  webUrl: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.presidente.repubblica:2001-06-06;380",
  type: "dpr",
  priority: 4,
  estimatedArticles: 138,
  hierarchy: [
    { from: 1, to: 5, hierarchy: { part: "Parte I — Attività edilizia", title: "Disposizioni generali" } },
    { from: 6, to: 23, hierarchy: { part: "Parte I", title: "Titoli abilitativi" } },
    { from: 27, to: 51, hierarchy: { part: "Parte I", title: "Vigilanza e sanzioni" } },
    { from: 34, to: 34, hierarchy: { part: "Parte I", title: "Vigilanza", section: "Tolleranza costruttiva (2%)" } },
    { from: 52, to: 76, hierarchy: { part: "Parte II — Normativa tecnica" } },
  ],
  institutes: [
    { from: 6, to: 23, institutes: ["titolo_abilitativo", "permesso_costruire", "SCIA", "CILA"], keywords: ["permesso", "costruire", "SCIA", "CILA", "edilizia_libera", "ristrutturazione"] },
    { from: 34, to: 34, institutes: ["tolleranza_costruttiva", "tolleranza_2_percento"], keywords: ["tolleranza", "2%", "difformità", "superficie", "altezza", "cubatura"] },
    { from: 36, to: 51, institutes: ["abuso_edilizio", "demolizione", "sanatoria"], keywords: ["abuso", "demolizione", "sanzione", "sanatoria", "condono"] },
    { from: 46, to: 48, institutes: ["nullità_atto_abuso_edilizio", "menzioni_urbanistiche"], keywords: ["nullità", "atto", "permesso_costruire", "menzioni", "urbanistiche", "rogito"] },
  ],
};

// ═══════════════════════════════════════════════════════
// NORMATIVE EUROPEE
// ═══════════════════════════════════════════════════════

export const GDPR: LawSourceConfig = {
  id: "GDPR",
  name: "Regolamento (UE) 2016/679 — GDPR",
  abbreviation: "GDPR",
  sourceType: "eurlex",
  celexNumber: "32016R0679",
  webUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32016R0679",
  type: "regolamento_ue",
  priority: 2,
  estimatedArticles: 99,
  hierarchy: [
    { from: 1, to: 4, hierarchy: { chapter: "Capo I — Disposizioni generali" } },
    { from: 5, to: 11, hierarchy: { chapter: "Capo II — Principi" } },
    { from: 12, to: 23, hierarchy: { chapter: "Capo III — Diritti dell'interessato" } },
    { from: 24, to: 43, hierarchy: { chapter: "Capo IV — Titolare e responsabile del trattamento" } },
    { from: 44, to: 50, hierarchy: { chapter: "Capo V — Trasferimenti dati verso paesi terzi" } },
    { from: 77, to: 84, hierarchy: { chapter: "Capo VIII — Mezzi di ricorso e sanzioni" } },
  ],
  institutes: [
    { from: 5, to: 7, institutes: ["principi_trattamento", "liceità_trattamento", "consenso", "base_giuridica"], keywords: ["liceità", "consenso", "base_giuridica", "legittimo_interesse", "minimizzazione"] },
    { from: 12, to: 23, institutes: ["diritti_interessato", "diritto_accesso", "diritto_oblio", "portabilità"], keywords: ["diritto_accesso", "rettifica", "cancellazione", "oblio", "portabilità", "opposizione", "informativa"] },
    { from: 13, to: 14, institutes: ["informativa_privacy", "obbligo_informazione"], keywords: ["informativa", "privacy", "trasparenza"] },
    { from: 24, to: 36, institutes: ["titolare_trattamento", "responsabile_trattamento", "DPO", "DPIA"], keywords: ["titolare", "responsabile", "DPO", "registro", "DPIA", "valutazione_impatto", "privacy_by_design"] },
    { from: 28, to: 28, institutes: ["responsabile_trattamento", "DPA", "data_processing_agreement"], keywords: ["responsabile", "sub-responsabile", "DPA", "contratto", "nomina"] },
    { from: 44, to: 50, institutes: ["trasferimento_dati_extra_ue", "clausole_contrattuali_tipo"], keywords: ["trasferimento", "paese_terzo", "adeguatezza", "SCC", "BCR"] },
    { from: 33, to: 34, institutes: ["data_breach", "violazione_dati"], keywords: ["violazione", "data_breach", "notifica", "72_ore", "garante"] },
    { from: 83, to: 84, institutes: ["sanzioni_gdpr"], keywords: ["sanzione", "multa", "4%", "20_milioni", "risarcimento"] },
  ],
};

export const DIRETTIVA_CLAUSOLE_ABUSIVE: LawSourceConfig = {
  id: "Direttiva 93/13/CEE",
  name: "Direttiva 93/13/CEE — Clausole abusive nei contratti consumatori",
  abbreviation: "Dir. 93/13",
  sourceType: "eurlex",
  celexNumber: "31993L0013",
  webUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:31993L0013",
  type: "direttiva_ue",
  priority: 3,
  estimatedArticles: 11,
  hierarchy: [
    { from: 1, to: 2, hierarchy: { section: "Ambito di applicazione e definizioni" } },
    { from: 3, to: 7, hierarchy: { section: "Clausole abusive — valutazione e conseguenze" } },
  ],
  institutes: [
    { from: 3, to: 6, institutes: ["clausola_abusiva", "squilibrio_significativo", "buona_fede"], keywords: ["abusiva", "squilibrio", "significativo", "buona_fede", "consumatore", "allegato", "lista"] },
  ],
};

export const DIRETTIVA_DIRITTI_CONSUMATORI: LawSourceConfig = {
  id: "Direttiva 2011/83/UE",
  name: "Direttiva 2011/83/UE — Diritti dei consumatori",
  abbreviation: "Dir. 2011/83",
  sourceType: "eurlex",
  celexNumber: "32011L0083",
  webUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32011L0083",
  type: "direttiva_ue",
  priority: 3,
  estimatedArticles: 35,
  hierarchy: [
    { from: 1, to: 4, hierarchy: { chapter: "Capo I — Oggetto e ambito di applicazione" } },
    { from: 5, to: 8, hierarchy: { chapter: "Capo II — Informazione consumatore" } },
    { from: 9, to: 16, hierarchy: { chapter: "Capo III — Diritto di recesso" } },
  ],
  institutes: [
    { from: 6, to: 8, institutes: ["obbligo_informazione_precontrattuale"], keywords: ["informazione", "precontrattuale", "consumatore", "prezzo"] },
    { from: 9, to: 16, institutes: ["diritto_recesso", "quattordici_giorni"], keywords: ["recesso", "14_giorni", "ripensamento", "rimborso"] },
  ],
};

export const DIRETTIVA_VENDITA_BENI: LawSourceConfig = {
  id: "Direttiva 2019/771/UE",
  name: "Direttiva (UE) 2019/771 — Vendita di beni e garanzia",
  abbreviation: "Dir. 2019/771",
  sourceType: "eurlex",
  celexNumber: "32019L0771",
  webUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32019L0771",
  type: "direttiva_ue",
  priority: 4,
  estimatedArticles: 28,
  hierarchy: [
    { from: 1, to: 4, hierarchy: { chapter: "Capo I — Disposizioni generali" } },
    { from: 5, to: 9, hierarchy: { chapter: "Capo II — Conformità del bene" } },
    { from: 10, to: 16, hierarchy: { chapter: "Capo III — Rimedi del consumatore" } },
  ],
  institutes: [
    { from: 5, to: 9, institutes: ["conformità_bene", "difetto_conformità"], keywords: ["conformità", "difetto", "requisiti", "qualità"] },
    { from: 10, to: 16, institutes: ["rimedi_difetto_conformità", "riparazione", "sostituzione"], keywords: ["rimedio", "riparazione", "sostituzione", "riduzione_prezzo", "garanzia"] },
  ],
};

export const REGOLAMENTO_ROMA_I: LawSourceConfig = {
  id: "Reg. Roma I",
  name: "Regolamento (CE) 593/2008 — Roma I — Legge applicabile obbligazioni contrattuali",
  abbreviation: "Roma I",
  sourceType: "eurlex",
  celexNumber: "32008R0593",
  webUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32008R0593",
  type: "regolamento_ue",
  priority: 4,
  estimatedArticles: 29,
  hierarchy: [
    { from: 1, to: 2, hierarchy: { chapter: "Capo I — Ambito di applicazione" } },
    { from: 3, to: 9, hierarchy: { chapter: "Capo II — Norme uniformi" } },
  ],
  institutes: [
    { from: 3, to: 4, institutes: ["scelta_legge_applicabile", "autonomia_privata_internazionale"], keywords: ["legge_applicabile", "scelta", "autonomia", "internazionale"] },
    { from: 6, to: 6, institutes: ["legge_applicabile_consumatore"], keywords: ["consumatore", "protezione", "residenza_abituale"] },
  ],
};

export const DSA: LawSourceConfig = {
  id: "DSA",
  name: "Regolamento (UE) 2022/2065 — Digital Services Act",
  abbreviation: "DSA",
  sourceType: "eurlex",
  celexNumber: "32022R2065",
  webUrl: "https://eur-lex.europa.eu/legal-content/IT/TXT/?uri=CELEX:32022R2065",
  type: "regolamento_ue",
  priority: 5,
  estimatedArticles: 93,
  hierarchy: [
    { from: 1, to: 2, hierarchy: { chapter: "Capo I — Disposizioni generali" } },
    { from: 3, to: 10, hierarchy: { chapter: "Capo II — Responsabilità intermediari" } },
    { from: 11, to: 48, hierarchy: { chapter: "Capo III — Obblighi di diligenza" } },
  ],
  institutes: [
    { from: 3, to: 10, institutes: ["responsabilità_intermediario", "safe_harbour", "hosting"], keywords: ["intermediario", "hosting", "piattaforma", "responsabilità", "rimozione"] },
    { from: 11, to: 33, institutes: ["obblighi_piattaforma", "trasparenza_online", "moderazione_contenuti"], keywords: ["trasparenza", "moderazione", "termini_servizio", "dark_pattern"] },
  ],
};

// ═══════════════════════════════════════════════════════
// REGISTRO COMPLETO
// ═══════════════════════════════════════════════════════

export const ALL_SOURCES: LawSourceConfig[] = [
  CODICE_PENALE,
  CODICE_DEL_CONSUMO,
  CODICE_PROCEDURA_CIVILE,
  DLGS_231_2001,
  DLGS_122_2005,
  STATUTO_LAVORATORI,
  TU_EDILIZIA,
  GDPR,
  DIRETTIVA_CLAUSOLE_ABUSIVE,
  DIRETTIVA_DIRITTI_CONSUMATORI,
  DIRETTIVA_VENDITA_BENI,
  REGOLAMENTO_ROMA_I,
  DSA,
].sort((a, b) => a.priority - b.priority);

export const ITALIAN_SOURCES = ALL_SOURCES.filter(
  (s) => s.sourceType === "normattiva"
);

export const EU_SOURCES = ALL_SOURCES.filter(
  (s) => s.sourceType === "eurlex"
);

export const NORMATTIVA_URNS: Record<string, string> = {
  "Codice Civile": "urn:nir:stato:regio.decreto:1942-03-16;262",
  "Codice Penale": "urn:nir:stato:regio.decreto:1930-10-19;1398",
  "Codice di Procedura Civile": "urn:nir:stato:regio.decreto:1940-10-28;1443",
  "Codice del Consumo": "urn:nir:stato:decreto.legislativo:2005-09-06;206",
  "D.Lgs. 231/2001": "urn:nir:stato:decreto.legislativo:2001-06-08;231",
  "D.Lgs. 122/2005": "urn:nir:stato:decreto.legislativo:2005-06-20;122",
  "Statuto dei Lavoratori": "urn:nir:stato:legge:1970-05-20;300",
  "DPR 380/2001": "urn:nir:stato:decreto.presidente.repubblica:2001-06-06;380",
};

export const EURLEX_CELEX: Record<string, string> = {
  "GDPR": "32016R0679",
  "Direttiva 93/13/CEE": "31993L0013",
  "Direttiva 2011/83/UE": "32011L0083",
  "Direttiva 2019/771/UE": "32019L0771",
  "Reg. Roma I": "32008R0593",
  "DSA": "32022R2065",
};
