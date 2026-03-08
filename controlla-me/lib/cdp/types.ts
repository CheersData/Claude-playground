// ─── Customer Data Profile — Type Definitions ───
// Interfacce TypeScript per il CDP di Controlla.me.
// Corrispondono allo schema JSONB in customer_profiles (migration 026).

// ─── Identity Section ───

export type AccountType = "individual" | "business" | "professional";
export type SignupSource = "organic" | "referral" | "campaign";

export interface CDPIdentity {
  /** Dominio email (non l'email intera, per privacy) */
  email_domain: string | null;
  /** Tipo di account inferito */
  account_type: AccountType;
  /** Settore derivato dai documenti analizzati */
  inferred_sector: string | null;
  /** Regione derivata da giurisdizione / lawyer referral */
  inferred_region: string | null;
  /** Fonte di registrazione */
  signup_source: SignupSource;
}

// ─── Behavior Section ───

export interface CDPBehavior {
  /** Contatore totale analisi (storico) */
  total_analyses: number;
  /** Contatore rolling 30 giorni */
  analyses_last_30d: number;
  /** Durata media sessione in ms */
  avg_session_duration_ms: number | null;
  /** Tipi di documento preferiti, ordinati per frequenza */
  preferred_doc_types: string[];
  /** Percentuale analisi seguite da deep search */
  deep_search_rate: number;
  /** Contatore query al corpus legislativo */
  corpus_queries: number;
  /** Ultimo accesso */
  last_active_at: string | null;
  /** Score di engagement 0-100 */
  engagement_score: number;
}

// ─── Risk Profile Section ───

export type LegalLiteracy = "low" | "medium" | "high";

export interface RiskDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CDPRiskProfile {
  /** Media fairness score dei documenti analizzati */
  avg_fairness_score: number | null;
  /** Distribuzione dei livelli di rischio */
  risk_distribution: RiskDistribution;
  /** Aree di rischio piu comuni (es. "clausole_vessatorie", "recesso") */
  common_risk_areas: string[];
  /** Percentuale analisi che raccomandano avvocato */
  needs_lawyer_rate: number;
  /** Livello di alfabetizzazione legale inferito */
  legal_literacy: LegalLiteracy;
}

// ─── Preferences Section ───

export interface CDPPreferences {
  /** Lingua preferita (default: "it") */
  preferred_language: string;
  /** Consenso notifiche */
  notification_opt_in: boolean;
  /** Ha mai mostrato interesse per referral avvocato */
  lawyer_interest: boolean;
  /** Aree giuridiche esplorate nel corpus */
  corpus_interests: string[];
}

// ─── Lifecycle Section ───

export type LifecycleStage =
  | "new"
  | "activated"
  | "engaged"
  | "power_user"
  | "churning"
  | "churned";

export interface PlanHistoryEntry {
  plan: string;
  from: string;
  to: string | null;
}

export interface CDPLifecycle {
  /** Stage corrente nel lifecycle */
  stage: LifecycleStage;
  /** Data prima analisi completata */
  first_analysis_at: string | null;
  /** Cronologia cambi piano */
  plan_history: PlanHistoryEntry[];
  /** Segnali di propensione a upgrade */
  conversion_signals: string[];
  /** Rischio di churn 0-100 */
  churn_risk: number;
}

// ─── Complete Profile ───

export interface CustomerProfile {
  user_id: string;
  identity: CDPIdentity;
  behavior: CDPBehavior;
  risk_profile: CDPRiskProfile;
  preferences: CDPPreferences;
  lifecycle: CDPLifecycle;
  computed_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

// ─── Profile Events ───

export type ProfileEventType =
  | "analysis_completed"
  | "deep_search_performed"
  | "corpus_query"
  | "lawyer_referral_requested"
  | "plan_changed"
  | "login"
  | "profile_updated";

export interface AnalysisCompletedEventData {
  analysis_id: string;
  document_type: string | null;
  document_sub_type: string | null;
  fairness_score: number | null;
  overall_risk: string | null;
  needs_lawyer: boolean;
  jurisdiction: string | null;
  clause_count: number;
  critical_count: number;
  high_count: number;
}

export interface DeepSearchEventData {
  analysis_id: string;
  clause_id: string | null;
  topic: string | null;
}

export interface CorpusQueryEventData {
  question_topic: string | null;
  confidence: number | null;
  cited_articles_count: number;
}

export interface PlanChangedEventData {
  from_plan: string;
  to_plan: string;
}

export interface LawyerReferralEventData {
  analysis_id: string;
  specialization: string;
  region: string;
}

export type ProfileEventData =
  | AnalysisCompletedEventData
  | DeepSearchEventData
  | CorpusQueryEventData
  | PlanChangedEventData
  | LawyerReferralEventData
  | Record<string, never>; // login, profile_updated (empty)

export interface ProfileEvent {
  id: string;
  user_id: string;
  event_type: ProfileEventType;
  event_data: ProfileEventData;
  processed: boolean;
  created_at: string;
}

// ─── Default Factories ───

export function createDefaultIdentity(): CDPIdentity {
  return {
    email_domain: null,
    account_type: "individual",
    inferred_sector: null,
    inferred_region: null,
    signup_source: "organic",
  };
}

export function createDefaultBehavior(): CDPBehavior {
  return {
    total_analyses: 0,
    analyses_last_30d: 0,
    avg_session_duration_ms: null,
    preferred_doc_types: [],
    deep_search_rate: 0,
    corpus_queries: 0,
    last_active_at: null,
    engagement_score: 0,
  };
}

export function createDefaultRiskProfile(): CDPRiskProfile {
  return {
    avg_fairness_score: null,
    risk_distribution: { critical: 0, high: 0, medium: 0, low: 0 },
    common_risk_areas: [],
    needs_lawyer_rate: 0,
    legal_literacy: "low",
  };
}

export function createDefaultPreferences(): CDPPreferences {
  return {
    preferred_language: "it",
    notification_opt_in: false,
    lawyer_interest: false,
    corpus_interests: [],
  };
}

export function createDefaultLifecycle(): CDPLifecycle {
  return {
    stage: "new",
    first_analysis_at: null,
    plan_history: [],
    conversion_signals: [],
    churn_risk: 0,
  };
}
