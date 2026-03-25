/**
 * Config-driven Vertical System — Poimandres
 *
 * Ogni verticale (legale, medicina, HR, ...) è definito qui con tutte le sue proprietà.
 * Un unico punto di configurazione per aggiungere nuovi verticali.
 *
 * Usato da: embeddings, corpus agent, question-prep, UI, API routes.
 */

// ─── Types ───

export interface VerticalConfig {
  /** Identificatore univoco (usato in DB, URL, codice) */
  id: string;
  /** Nome visualizzato */
  name: string;
  /** Sottotitolo / tagline */
  tagline: string;
  /** Dominio di prodotto (per URL, branding) */
  domain: string;
  /** Colore accent per UI (hex) */
  accentColor: string;
  /** Colore accent secondario (per gradienti) */
  accentColorSecondary: string;
  /** Modello embedding Voyage AI */
  embeddingModel: string;
  /** Lingua principale dei contenuti */
  language: string;
  /** Agent names per questo verticale */
  agents: {
    questionPrep: string;
    corpusAgent: string;
  };
  /** Labels UI localizzate */
  ui: {
    chatPlaceholder: string;
    chatTitle: string;
    sourcesLabel: string;
    topicsLabel: string;
    articleLabel: string;
    articlesLabel: string;
    searchPlaceholder: string;
    emptyState: string;
    breadcrumbHome: string;
  };
  /** Categorie di conoscenza per il knowledge store */
  knowledgeCategories: string[];
  /** Route base nell'app */
  basePath: string;
  /** API route base */
  apiPath: string;
}

// ─── Vertical Definitions ───

export const VERTICALS: Record<string, VerticalConfig> = {
  legal: {
    id: "legal",
    name: "Controlla.me",
    tagline: "Analisi legale AI per contratti e documenti",
    domain: "poimandres.work",
    accentColor: "#FF6B35",
    accentColorSecondary: "#FF8F65",
    embeddingModel: "voyage-law-2",
    language: "it",
    agents: {
      questionPrep: "question-prep",
      corpusAgent: "corpus-agent",
    },
    ui: {
      chatPlaceholder: "Chiedimi qualsiasi dubbio legale...",
      chatTitle: "Hai un dubbio legale?",
      sourcesLabel: "Per fonte",
      topicsLabel: "Per istituto",
      articleLabel: "Articolo",
      articlesLabel: "Articoli",
      searchPlaceholder: "Cerca articoli, norme, istituti...",
      emptyState: "Nessun articolo trovato.",
      breadcrumbHome: "Corpus Giuridico",
    },
    knowledgeCategories: [
      "law_reference",
      "court_case",
      "clause_pattern",
      "risk_pattern",
    ],
    basePath: "/corpus",
    apiPath: "/api/corpus",
  },

  medical: {
    id: "medical",
    name: "Studia.me",
    tagline: "AI per studenti di medicina — studia meglio, non di più",
    domain: "studia.me",
    accentColor: "#0EA5E9",           // Sky blue
    accentColorSecondary: "#38BDF8",  // Lighter sky blue
    embeddingModel: "voyage-3",       // General purpose (no medical-specific Voyage model)
    language: "it",
    agents: {
      questionPrep: "question-prep",   // Same agent, different system prompt
      corpusAgent: "corpus-agent",     // Same agent, different system prompt
    },
    ui: {
      chatPlaceholder: "Chiedimi qualsiasi argomento di medicina...",
      chatTitle: "Hai una domanda medica?",
      sourcesLabel: "Per fonte",
      topicsLabel: "Per specialità",
      articleLabel: "Voce",
      articlesLabel: "Voci",
      searchPlaceholder: "Cerca patologie, procedure, farmaci...",
      emptyState: "Nessuna voce trovata.",
      breadcrumbHome: "Corpus Medico",
    },
    knowledgeCategories: [
      "clinical_guideline",
      "pathology",
      "procedure",
      "pharmacology",
      "anatomy",
      "evidence",
    ],
    basePath: "/studia",
    apiPath: "/api/studia",
  },

  hr: {
    id: "hr",
    name: "Controlla.me HR",
    tagline: "Analisi AI per contratti di lavoro e diritto del lavoro",
    domain: "poimandres.work",
    accentColor: "#10B981",           // Emerald green
    accentColorSecondary: "#34D399",  // Lighter emerald
    embeddingModel: "voyage-law-2",   // Legal embedding — diritto del lavoro è diritto
    language: "it",
    agents: {
      questionPrep: "question-prep",   // Same agent, HR-aware via prompt context
      corpusAgent: "corpus-agent",     // Same agent, HR-aware via prompt context
    },
    ui: {
      chatPlaceholder: "Chiedimi qualsiasi dubbio su contratti di lavoro...",
      chatTitle: "Hai un dubbio su lavoro o contratti?",
      sourcesLabel: "Per fonte",
      topicsLabel: "Per istituto",
      articleLabel: "Articolo",
      articlesLabel: "Articoli",
      searchPlaceholder: "Cerca norme lavoro, CCNL, licenziamento, TFR...",
      emptyState: "Nessun articolo trovato.",
      breadcrumbHome: "Corpus Diritto del Lavoro",
    },
    knowledgeCategories: [
      "law_reference",
      "court_case",
      "clause_pattern",
      "risk_pattern",
      "ccnl_reference",
      "labor_institute",
    ],
    basePath: "/corpus/hr",
    apiPath: "/api/corpus",  // Same corpus API, filtered by vertical="hr"
  },

  tax: {
    id: "tax",
    name: "Controlla.me Fiscale",
    tagline: "Analisi AI per diritto tributario e fiscale",
    domain: "poimandres.work",
    accentColor: "#F59E0B",           // Amber
    accentColorSecondary: "#FBBF24",  // Lighter amber
    embeddingModel: "voyage-law-2",   // Legal embedding — diritto tributario è diritto
    language: "it",
    agents: {
      questionPrep: "question-prep",   // Same agent, tax-aware via prompt context
      corpusAgent: "corpus-agent",     // Same agent, tax-aware via prompt context
    },
    ui: {
      chatPlaceholder: "Chiedimi qualsiasi dubbio fiscale o tributario...",
      chatTitle: "Hai un dubbio fiscale?",
      sourcesLabel: "Per fonte",
      topicsLabel: "Per istituto",
      articleLabel: "Articolo",
      articlesLabel: "Articoli",
      searchPlaceholder: "Cerca IRPEF, IVA, deduzioni, sanzioni, accertamento...",
      emptyState: "Nessun articolo trovato.",
      breadcrumbHome: "Corpus Diritto Tributario",
    },
    knowledgeCategories: [
      "law_reference",
      "tax_ruling",
      "tax_penalty",
      "tax_procedure",
      "deduction_pattern",
      "vat_rule",
    ],
    basePath: "/corpus/tax",
    apiPath: "/api/corpus",  // Same corpus API, filtered by vertical="tax"
  },
};

// ─── Helper Functions ───

/** Get a vertical config by ID. Throws if not found. */
export function getVertical(id: string): VerticalConfig {
  const v = VERTICALS[id];
  if (!v) throw new Error(`Vertical "${id}" non trovato. Disponibili: ${Object.keys(VERTICALS).join(", ")}`);
  return v;
}

/** Get all vertical configs. */
export function getAllVerticals(): VerticalConfig[] {
  return Object.values(VERTICALS);
}

/** Get the embedding model for a vertical. */
export function getEmbeddingModel(verticalId: string): string {
  return VERTICALS[verticalId]?.embeddingModel ?? "voyage-3";
}

/** Check if a vertical exists. */
export function hasVertical(id: string): boolean {
  return id in VERTICALS;
}

/** Get vertical by base path (e.g., "/studia" → medical config). */
export function getVerticalByPath(path: string): VerticalConfig | undefined {
  return Object.values(VERTICALS).find((v) => v.basePath === path);
}
