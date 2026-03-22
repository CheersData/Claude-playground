/**
 * Definizioni delle fonti del corpus medico per studia.me.
 *
 * Phase 1 (MVP): fonti open access, nessuna licenza richiesta.
 * Phase 2: linee guida società scientifiche, schede AIFA.
 *
 * Usa registerVertical() per registrare le fonti nel sistema.
 */

import {
  registerVertical,
  type CorpusSource,
  type HierarchyLevel,
} from "./corpus-sources";

// ─── Medical Sources ───

export const MEDICAL_SOURCES: CorpusSource[] = [
  // ── Phase 1: Open Access Textbooks & References ──
  {
    id: "statpearls",
    name: "StatPearls — NCBI Medical Reference",
    shortName: "StatPearls",
    type: "ncbi-bookshelf",
    description:
      "Enciclopedia medica open access peer-reviewed. 9000+ articoli su patologie, procedure, farmaci. Aggiornata continuamente. Fonte primaria per studenti USA.",
    baseUrl: "https://www.ncbi.nlm.nih.gov/books/NBK430685/",
    hierarchyLevels: [
      { key: "category", label: "Categoria" },
      { key: "specialty", label: "Specialità" },
    ] as HierarchyLevel[],
    estimatedArticles: 9000,
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "loaded",   // 47 articoli caricati 2026-03-08 via NCBI Bookshelf API
    vertical: "medical",
  },
  {
    id: "europe-pmc",
    name: "Europe PMC — Open Access Medical Papers",
    shortName: "EuropePMC",
    type: "europe-pmc",
    description:
      "Repository di paper biomedici open access. 8M+ full-text articles. Focus su ricerca europea. Fonte per evidenze cliniche e review sistematiche.",
    baseUrl: "https://europepmc.org/",
    hierarchyLevels: [
      { key: "journal", label: "Rivista" },
      { key: "year", label: "Anno" },
    ] as HierarchyLevel[],
    estimatedArticles: 50000, // Top 50K più citati, non tutti gli 8M
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "api-tested",   // API verified 2026-03-08, loading in progress
    vertical: "medical",
  },
  {
    id: "openstax-anatomy",
    name: "OpenStax Anatomy & Physiology",
    shortName: "OpenStax A&P",
    type: "openstax",
    description:
      "Manuale open access di anatomia e fisiologia. Licenza CC BY 4.0. Struttura capitolo/sezione ideale per studio universitario.",
    baseUrl: "https://openstax.org/details/books/anatomy-and-physiology-2e",
    hierarchyLevels: [
      { key: "unit", label: "Unità" },
      { key: "chapter", label: "Capitolo" },
      { key: "section", label: "Sezione" },
    ] as HierarchyLevel[],
    estimatedArticles: 400,
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "planned",
    vertical: "medical",
  },
  {
    id: "openstax-microbiology",
    name: "OpenStax Microbiology",
    shortName: "OpenStax Micro",
    type: "openstax",
    description:
      "Manuale open access di microbiologia. Licenza CC BY 4.0. Batteri, virus, funghi, parassiti. Ideale per microbiologia medica.",
    baseUrl: "https://openstax.org/details/books/microbiology",
    hierarchyLevels: [
      { key: "chapter", label: "Capitolo" },
      { key: "section", label: "Sezione" },
    ] as HierarchyLevel[],
    estimatedArticles: 200,
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "planned",
    vertical: "medical",
  },

  // ── Phase 1: Italian Medical Guidelines ──
  {
    id: "snlg",
    name: "SNLG — Linee Guida Nazionali (ISS)",
    shortName: "SNLG",
    type: "html-scraper",
    description:
      "Sistema Nazionale Linee Guida dell'Istituto Superiore di Sanità. Linee guida cliniche italiane ufficiali. 200+ linee guida attive.",
    baseUrl: "https://snlg.iss.it/",
    hierarchyLevels: [
      { key: "area", label: "Area clinica" },
      { key: "guideline", label: "Linea guida" },
    ] as HierarchyLevel[],
    estimatedArticles: 200,
    connector: {
      preferredFormat: "html",
    },
    lifecycle: "planned",
    vertical: "medical",
  },
  {
    id: "aifa-farmaci",
    name: "AIFA — Prontuario Farmaceutico Nazionale",
    shortName: "AIFA",
    type: "html-scraper",
    description:
      "Agenzia Italiana del Farmaco. Note AIFA, RCP, farmaci essenziali. Fonte ufficiale per farmacologia in Italia.",
    baseUrl: "https://www.aifa.gov.it/",
    hierarchyLevels: [
      { key: "atc", label: "Gruppo ATC" },
      { key: "drug", label: "Principio Attivo" },
    ] as HierarchyLevel[],
    estimatedArticles: 500,
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "planned",
    vertical: "medical",
  },

  // ── Phase 2: International Guidelines ──
  {
    id: "who-icd11",
    name: "ICD-11 — Classificazione Internazionale delle Malattie (OMS)",
    shortName: "ICD-11",
    type: "icd-api",
    description:
      "Classificazione internazionale OMS. 55.000+ voci diagnostiche strutturate gerarchicamente. API REST disponibile.",
    baseUrl: "https://icd.who.int/",
    hierarchyLevels: [
      { key: "chapter", label: "Capitolo" },
      { key: "block", label: "Blocco" },
      { key: "category", label: "Categoria" },
    ] as HierarchyLevel[],
    estimatedArticles: 55000,
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "planned",
    vertical: "medical",
  },
  {
    id: "cochrane-reviews",
    name: "Cochrane Library — Systematic Reviews",
    shortName: "Cochrane",
    type: "cochrane",
    description:
      "Gold standard delle revisioni sistematiche. Evidenza di massimo livello per decisioni cliniche. Abstracts open access.",
    baseUrl: "https://www.cochranelibrary.com/",
    hierarchyLevels: [
      { key: "group", label: "Gruppo" },
      { key: "topic", label: "Topic" },
    ] as HierarchyLevel[],
    estimatedArticles: 8000,
    connector: {
      preferredFormat: "json",
    },
    lifecycle: "planned",
    vertical: "medical",
  },
];

// ─── Register medical vertical ───

registerVertical("medical", MEDICAL_SOURCES);

// ─── Exports ───

export function getMedicalSources(): CorpusSource[] {
  return MEDICAL_SOURCES;
}

export function getMedicalSourceById(id: string): CorpusSource | undefined {
  return MEDICAL_SOURCES.find((s) => s.id === id);
}
