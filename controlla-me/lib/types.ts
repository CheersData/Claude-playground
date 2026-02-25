// ─── Agent Output Types ───

export interface Party {
  role: string;
  name: string;
  type: "persona_fisica" | "persona_giuridica" | string;
}

export interface ApplicableLaw {
  reference: string;
  name: string;
}

export interface KeyDate {
  date: string;
  description: string;
}

export interface ClassificationResult {
  documentType: string;
  documentTypeLabel: string;
  /** Sotto-tipo specifico: "vendita_a_corpo", "locazione_4+4", "appalto_privato", etc. */
  documentSubType: string | null;
  parties: Party[];
  jurisdiction: string;
  applicableLaws: ApplicableLaw[];
  /** Istituti giuridici rilevanti identificati nel documento.
   * Es: ["vendita_a_corpo", "caparra_confirmatoria", "fideiussione_122_2005"]
   * Serve per guidare l'Analyzer e per query al vector DB. */
  relevantInstitutes: string[];
  /** Aree di focus legale per guidare l'Analyzer.
   * Es: ["diritto_immobiliare", "tutela_acquirente_immobili_da_costruire", "diritto_urbanistico"] */
  legalFocusAreas: string[];
  keyDates: KeyDate[];
  summary: string;
  confidence: number;
}

export interface Clause {
  id: string;
  title: string;
  originalText: string;
  riskLevel: "critical" | "high" | "medium" | "low" | "info";
  issue: string;
  potentialViolation: string;
  marketStandard: string;
  recommendation: string;
}

export interface MissingElement {
  element: string;
  importance: "high" | "medium" | "low";
  explanation: string;
}

export interface AnalysisResult {
  clauses: Clause[];
  missingElements: MissingElement[];
  overallRisk: "critical" | "high" | "medium" | "low";
  positiveAspects: string[];
}

export interface LawReference {
  reference: string;
  fullText: string;
  sourceUrl: string;
  isInForce: boolean;
  lastModified: string | null;
}

export interface CourtCase {
  reference: string;
  court: string;
  date: string;
  summary: string;
  relevance: string;
  sourceUrl: string;
}

export interface Finding {
  clauseId: string;
  laws: LawReference[];
  courtCases: CourtCase[];
  legalOpinion: string;
}

export interface InvestigationResult {
  findings: Finding[];
}

export interface Risk {
  severity: "alta" | "media" | "bassa";
  title: string;
  detail: string;
  legalBasis: string;
  courtCase: string;
}

export interface Deadline {
  date: string;
  action: string;
}

export interface Action {
  priority: number;
  action: string;
  rationale: string;
}

/** Scoring multidimensionale — ogni dimensione è 1-10. */
export interface MultiDimensionalScore {
  /** Equità complessiva tra le parti (il vecchio fairnessScore) */
  contractEquity: number;
  /** Coerenza interna tra le clausole del documento */
  legalCoherence: number;
  /** Aderenza alla prassi reale e praticità delle clausole */
  practicalCompliance: number;
  /** Copertura delle situazioni tipiche della materia */
  completeness: number;
}

export interface AdvisorResult {
  fairnessScore: number;
  /** Scoring dettagliato su 4 dimensioni */
  scores: MultiDimensionalScore | null;
  summary: string;
  risks: Risk[];
  deadlines: Deadline[];
  actions: Action[];
  needsLawyer: boolean;
  lawyerSpecialization: string;
  lawyerReason: string;
}

// ─── SSE Event Types ───

export type AgentPhase = "classifier" | "analyzer" | "investigator" | "advisor";
export type PhaseStatus = "running" | "done" | "error";

export interface ProgressEvent {
  phase: AgentPhase;
  status: PhaseStatus;
  data?: ClassificationResult | AnalysisResult | InvestigationResult | AdvisorResult;
  error?: string;
}

// ─── Database Types ───

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  analyses_count: number;
  plan: "free" | "pro";
  stripe_customer_id: string | null;
  created_at: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string | null;
  document_type: string | null;
  status: "pending" | "processing" | "completed" | "error";
  classification: ClassificationResult | null;
  analysis: AnalysisResult | null;
  investigation: InvestigationResult | null;
  advice: AdvisorResult | null;
  fairness_score: number | null;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DeepSearch {
  id: string;
  analysis_id: string;
  user_question: string;
  agent_response: Record<string, unknown> | null;
  sources: Array<{ url: string; title: string; excerpt: string }> | null;
  created_at: string;
}

export interface LawyerReferral {
  id: string;
  analysis_id: string;
  user_id: string;
  lawyer_id: string | null;
  specialization: string;
  region: string;
  status: "pending" | "contacted" | "converted";
  created_at: string;
}
