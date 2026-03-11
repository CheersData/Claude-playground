import type {
  AgentPhase,
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
} from "@/lib/types";

// --- Chat message model ---

export type MessageRole = "user" | "assistant" | "system";

export type AgentId = "leo" | "marta" | "giulia" | "enzo" | "corpus" | "prep";

export const AGENT_META: Record<
  AgentId,
  { name: string; label: string; color: string; phase?: AgentPhase }
> = {
  leo: { name: "Leo", label: "Catalogatore", color: "#4ECDC4", phase: "classifier" },
  marta: { name: "Marta", label: "Analista", color: "#FF6B6B", phase: "analyzer" },
  giulia: { name: "Giulia", label: "Giurista", color: "#A78BFA", phase: "investigator" },
  enzo: { name: "Enzo", label: "Consulente", color: "#FFC832", phase: "advisor" },
  corpus: { name: "Corpus", label: "Esperto normativo", color: "#A78BFA" },
  prep: { name: "Prep", label: "Riformulatore", color: "#9B9B9B" },
};

export interface ChatMessage {
  id: string;
  role: MessageRole;
  agent?: AgentId;
  content: string;
  timestamp: Date;
  // Analysis-specific
  phase?: AgentPhase;
  phaseStatus?: "running" | "done" | "error" | "skipped";
  phaseData?: ClassificationResult | AnalysisResult | InvestigationResult | AdvisorResult;
  // Corpus-specific
  corpusResponse?: CorpusResponse;
  // File upload
  fileName?: string;
  // Error
  isError?: boolean;
}

export interface CorpusResponse {
  answer: string;
  citedArticles: Array<{
    id: string;
    articleNumber: string;
    sourceName: string;
    title?: string;
  }>;
  confidence: number;
  followUpQuestions: string[];
  provider: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: ChatMessage[];
  sessionId?: string;
  fileName?: string;
}

export type TierName = "intern" | "associate" | "partner";

export interface TierData {
  current: TierName;
  agents: Record<string, { chain: Array<{ model: string; provider: string }>; enabled: boolean }>;
  estimatedCost: { perQuery: string; label: string };
}
