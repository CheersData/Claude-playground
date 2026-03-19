/**
 * Mock responses simulating what free-tier (intern) models would produce.
 *
 * These fixtures model realistic outputs from Groq Llama, Cerebras GPT-OSS,
 * SambaNova Llama, and Mistral Small -- the models used in the intern tier.
 *
 * Key differences from partner-tier outputs:
 * - Shorter, less detailed explanations
 * - Fewer relevant institutes and focus areas identified
 * - Simpler legal language (less nuance)
 * - Possible missing optional fields (documentSubType, scores)
 * - Still structurally valid JSON that passes schema validation
 */

import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "@/lib/types";

// ── Classifier — Intern tier mock responses ──

/** Groq Llama 4 Scout response: good structure, slightly less detail */
export const INTERN_CLASSIFICATION_GROQ: ClassificationResult = {
  documentType: "contratto_locazione_abitativa",
  documentTypeLabel: "Contratto di Locazione",
  documentSubType: "locazione_4+4",
  parties: [
    { role: "locatore", name: "Mario Rossi", type: "persona_fisica" },
    { role: "conduttore", name: "Luigi Bianchi", type: "persona_fisica" },
  ],
  jurisdiction: "Italia",
  applicableLaws: [
    { reference: "L. 431/1998", name: "Legge sulle locazioni" },
  ],
  relevantInstitutes: ["locazione_abitativa"],
  legalFocusAreas: ["diritto_immobiliare"],
  keyDates: [{ date: "2025-04-01", description: "Inizio contratto" }],
  summary: "Contratto locazione abitativa 4+4, canone 800 euro mensili.",
  confidence: 0.88,
};

/** Cerebras GPT-OSS response: minimal but valid */
export const INTERN_CLASSIFICATION_CEREBRAS: ClassificationResult = {
  documentType: "contratto_locazione",
  documentTypeLabel: "Contratto di Locazione",
  documentSubType: null,
  parties: [
    { role: "locatore", name: "Mario Rossi", type: "persona_fisica" },
    { role: "conduttore", name: "Luigi Bianchi", type: "persona_fisica" },
  ],
  jurisdiction: "Italia",
  applicableLaws: [
    { reference: "L. 431/1998", name: "Locazioni abitative" },
    { reference: "Art. 1571 c.c.", name: "Codice Civile" },
  ],
  relevantInstitutes: [],
  legalFocusAreas: [],
  keyDates: [],
  summary: "Contratto di locazione ad uso abitativo.",
  confidence: 0.82,
};

/** SambaNova Llama 3.3 response: decent quality, some missing optional fields */
export const INTERN_CLASSIFICATION_SAMBANOVA: ClassificationResult = {
  documentType: "contratto_locazione_abitativa",
  documentTypeLabel: "Contratto di Locazione ad Uso Abitativo",
  documentSubType: "locazione_4+4",
  parties: [
    { role: "locatore", name: "Mario Rossi", type: "persona_fisica" },
    { role: "conduttore", name: "Luigi Bianchi", type: "persona_fisica" },
  ],
  jurisdiction: "Italia - Diritto Civile",
  applicableLaws: [
    { reference: "L. 431/1998", name: "Disciplina locazioni abitative" },
  ],
  relevantInstitutes: ["locazione_abitativa", "deposito_cauzionale"],
  legalFocusAreas: ["diritto_immobiliare"],
  keyDates: [{ date: "2025-04-01", description: "Decorrenza" }],
  summary: "Contratto 4+4 per locazione abitativa con canone EUR 800/mese e penale di 12 mensilita.",
  confidence: 0.90,
};

/** Mistral Small response: last resort, still valid */
export const INTERN_CLASSIFICATION_MISTRAL: ClassificationResult = {
  documentType: "contratto",
  documentTypeLabel: "Contratto",
  documentSubType: null,
  parties: [
    { role: "locatore", name: "Mario Rossi", type: "persona_fisica" },
    { role: "conduttore", name: "Luigi Bianchi", type: "persona_fisica" },
  ],
  jurisdiction: "Italia",
  applicableLaws: [],
  relevantInstitutes: [],
  legalFocusAreas: [],
  keyDates: [],
  summary: "Contratto di locazione.",
  confidence: 0.70,
};

// ── Analyzer — Intern tier mock responses ──

/** Groq Llama 3.3 70B response for analyzer: good quality, finds main risk */
export const INTERN_ANALYSIS_GROQ: AnalysisResult = {
  clauses: [
    {
      id: "clause_1",
      title: "Penale per risoluzione anticipata",
      originalText:
        "In caso di risoluzione anticipata da parte del Conduttore, questi dovrà corrispondere una penale pari a 12 mensilità.",
      riskLevel: "high",
      issue: "Penale eccessiva di 12 mensilita",
      potentialViolation: "Art. 1384 c.c.",
      marketStandard: "2-3 mensilita",
      recommendation: "Ridurre la penale a 2-3 mensilita",
    },
  ],
  missingElements: [
    {
      element: "Clausola recesso per giusta causa",
      importance: "high",
      explanation: "Manca la possibilita di recedere per giusta causa.",
    },
  ],
  overallRisk: "medium",
  positiveAspects: ["Durata conforme alla L. 431/1998"],
};

/** Cerebras GPT-OSS response for analyzer: minimal */
export const INTERN_ANALYSIS_CEREBRAS: AnalysisResult = {
  clauses: [
    {
      id: "clause_1",
      title: "Penale risoluzione",
      originalText: "penale pari a 12 mensilità del canone",
      riskLevel: "high",
      issue: "Penale troppo alta",
      potentialViolation: "Codice Civile",
      marketStandard: "Poche mensilita",
      recommendation: "Negoziare la riduzione",
    },
  ],
  missingElements: [],
  overallRisk: "medium",
  positiveAspects: [],
};

// ── Advisor — Intern tier mock responses ──

/** Groq Llama 3.3 70B response for advisor: valid structure, simpler language */
export const INTERN_ADVISOR_GROQ: AdvisorResult = {
  fairnessScore: 5.5,
  scores: {
    contractEquity: 5.0,
    legalCoherence: 6.0,
    practicalCompliance: 5.5,
    completeness: 5.5,
  },
  summary:
    "Il contratto ha una penale molto alta per chi vuole andarsene prima. Il resto e nella norma.",
  risks: [
    {
      severity: "alta",
      title: "Penale eccessiva",
      detail: "12 mesi di penale sono troppi se vuoi lasciare l'appartamento.",
      legalBasis: "Art. 1384 c.c.",
      courtCase: "Cass. Civ. n. 4258/2023",
    },
  ],
  deadlines: [],
  actions: [
    {
      priority: 1,
      action: "Negozia la penale",
      rationale: "Chiedi di ridurla a 2-3 mensilita.",
    },
  ],
  needsLawyer: true,
  lawyerSpecialization: "Diritto immobiliare",
  lawyerReason: "La penale potrebbe essere nulla.",
};

/** Cerebras GPT-OSS advisor: missing scores object (common for smaller models) */
export const INTERN_ADVISOR_CEREBRAS_NO_SCORES: AdvisorResult = {
  fairnessScore: 5,
  scores: null,
  summary: "La penale di 12 mensilita e eccessiva. Il resto e ok.",
  risks: [
    {
      severity: "alta",
      title: "Penale alta",
      detail: "12 mesi di penale.",
      legalBasis: "Art. 1384 c.c.",
      courtCase: "",
    },
  ],
  deadlines: [],
  actions: [
    {
      priority: 1,
      action: "Negozia la penale",
      rationale: "Troppo alta.",
    },
  ],
  needsLawyer: false,
  lawyerSpecialization: "",
  lawyerReason: "",
};

/** Advisor with too many risks (5) and actions (4) — tests enforcement truncation */
export const INTERN_ADVISOR_OVER_LIMIT: AdvisorResult = {
  fairnessScore: 4.0,
  scores: {
    contractEquity: 3.5,
    legalCoherence: 4.5,
    practicalCompliance: 4.0,
    completeness: 4.0,
  },
  summary: "Contratto molto sfavorevole.",
  risks: [
    { severity: "alta", title: "Penale eccessiva", detail: "12 mesi", legalBasis: "Art. 1384 c.c.", courtCase: "" },
    { severity: "alta", title: "Deposito trattenuto", detail: "Deposito non restituibile", legalBasis: "Art. 1608 c.c.", courtCase: "" },
    { severity: "media", title: "Manca recesso", detail: "No giusta causa", legalBasis: "Art. 1612 c.c.", courtCase: "" },
    { severity: "media", title: "Spese a carico", detail: "Tutte al conduttore", legalBasis: "", courtCase: "" },
    { severity: "bassa", title: "Registrazione", detail: "Non menzionata", legalBasis: "", courtCase: "" },
  ],
  deadlines: [],
  actions: [
    { priority: 1, action: "Negozia penale", rationale: "Troppo alta" },
    { priority: 2, action: "Chiedi recesso", rationale: "Manca" },
    { priority: 3, action: "Verifica deposito", rationale: "Non chiaro" },
    { priority: 4, action: "Registra contratto", rationale: "Obbligatorio" },
  ],
  needsLawyer: true,
  lawyerSpecialization: "Diritto immobiliare",
  lawyerReason: "Clausole potenzialmente nulle.",
};

// ── Investigation — empty (intern models don't have web_search) ──

export const INTERN_INVESTIGATION_EMPTY: InvestigationResult = {
  findings: [],
};

// ── Helper: make an AgentRunResult-shaped mock return ──

export function makeAgentRunResult<T>(
  parsed: T,
  overrides?: {
    provider?: string;
    model?: string;
    usedFallback?: boolean;
    usedModelKey?: string;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
  },
) {
  return {
    parsed,
    text: JSON.stringify(parsed),
    usage: {
      inputTokens: overrides?.inputTokens ?? 500,
      outputTokens: overrides?.outputTokens ?? 300,
    },
    durationMs: overrides?.durationMs ?? 2000,
    provider: overrides?.provider ?? "groq",
    model: overrides?.model ?? "llama-3.3-70b-versatile",
    usedFallback: overrides?.usedFallback ?? false,
    usedModelKey: overrides?.usedModelKey ?? "groq-llama3-70b",
  };
}
