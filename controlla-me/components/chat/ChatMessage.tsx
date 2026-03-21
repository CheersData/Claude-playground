"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Scale,
} from "lucide-react";
import type { ChatMessage as ChatMessageType, AgentId } from "./types";
import { AGENT_META } from "./types";
import type {
  ClassificationResult,
  AnalysisResult,
  InvestigationResult,
  AdvisorResult,
  Clause,
} from "@/lib/types";

interface ChatMessageProps {
  message: ChatMessageType;
  onDeepSearch?: (clause: Clause) => void;
  onArticleClick?: (articleId: string) => void;
}

// --- Agent avatar ---
function AgentAvatar({ agent }: { agent: AgentId }) {
  const meta = AGENT_META[agent];
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: meta.color }}
    >
      {meta.name[0]}
    </div>
  );
}

// --- Phase running indicator ---
function PhaseRunning({ agent }: { agent: AgentId }) {
  const meta = AGENT_META[agent];
  return (
    <div className="flex items-center gap-3 py-2">
      <Loader2 className="w-4 h-4 animate-spin" style={{ color: meta.color }} />
      <span className="text-sm text-[#6B6B6B]">
        {meta.name} sta analizzando...
      </span>
    </div>
  );
}

// --- Classification summary ---
function ClassificationSummary({ data }: { data: ClassificationResult }) {
  return (
    <div className="space-y-2">
      <p className="text-[15px] text-[#1A1A2E] leading-relaxed">{data.summary}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className="px-2 py-0.5 rounded-full bg-[#4ECDC4]/10 text-[#4ECDC4] text-xs font-medium">
          {data.documentTypeLabel || data.documentType}
        </span>
        {data.jurisdiction && (
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#6B6B6B] text-xs">
            {data.jurisdiction}
          </span>
        )}
        {data.applicableLaws?.slice(0, 3).map((law, i: number) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-full bg-gray-50 text-[#9B9B9B] text-xs"
          >
            {typeof law === "string" ? law : law.reference}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Risk severity badge ---
const RISK_COLORS: Record<string, { bg: string; text: string }> = {
  critical: { bg: "bg-red-50", text: "text-red-700" },
  high: { bg: "bg-orange-50", text: "text-orange-700" },
  medium: { bg: "bg-amber-50", text: "text-amber-700" },
  low: { bg: "bg-green-50", text: "text-green-700" },
  info: { bg: "bg-blue-50", text: "text-blue-700" },
};

function RiskBadge({ level }: { level: string }) {
  const style = RISK_COLORS[level] || RISK_COLORS.info;
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${style.bg} ${style.text}`}>
      {level}
    </span>
  );
}

// --- Analysis clauses ---
function AnalysisSummary({
  data,
  onDeepSearch,
}: {
  data: AnalysisResult;
  onDeepSearch?: (clause: Clause) => void;
}) {
  const criticalHigh = data.clauses?.filter(
    (c) => c.riskLevel === "critical" || c.riskLevel === "high"
  );
  const others = data.clauses?.filter(
    (c) => c.riskLevel !== "critical" && c.riskLevel !== "high"
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-[#9B9B9B] uppercase tracking-wide">
          Rischio complessivo
        </span>
        <RiskBadge level={data.overallRisk} />
      </div>

      {criticalHigh && criticalHigh.length > 0 && (
        <div className="space-y-2">
          {criticalHigh.map((clause, i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-red-100 bg-red-50/30"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-sm font-medium text-[#1A1A2E]">
                  {clause.title || clause.id || `Clausola ${i + 1}`}
                </span>
                <RiskBadge level={clause.riskLevel} />
              </div>
              <p className="text-sm text-[#6B6B6B] leading-relaxed">{clause.issue}</p>
              {onDeepSearch && (
                <button
                  onClick={() => onDeepSearch(clause)}
                  className="mt-2 flex items-center gap-1 text-xs text-[#FF6B35] hover:text-[#E8451A] font-medium transition-colors"
                >
                  Approfondisci <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {others && others.length > 0 && (
        <div className="space-y-1.5">
          {others.map((clause, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50">
              <RiskBadge level={clause.riskLevel} />
              <span className="text-sm text-[#6B6B6B]">
                {clause.title || clause.id}: {clause.issue?.slice(0, 120)}
                {(clause.issue?.length || 0) > 120 ? "..." : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.positiveAspects && data.positiveAspects.length > 0 && (
        <div className="mt-2">
          <span className="text-xs text-[#9B9B9B] uppercase tracking-wide">Aspetti positivi</span>
          <ul className="mt-1 space-y-0.5">
            {data.positiveAspects.map((p, i) => (
              <li key={i} className="flex items-start gap-1.5 text-sm text-[#6B6B6B]">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// --- Investigation summary ---
function InvestigationSummary({ data }: { data: InvestigationResult }) {
  if (!data.findings || data.findings.length === 0) return null;
  return (
    <div className="space-y-2">
      {data.findings.map((f, i) => (
        <div key={i} className="p-3 rounded-xl bg-[#A78BFA]/5 border border-[#A78BFA]/10">
          <p className="text-sm text-[#1A1A2E] leading-relaxed">{f.legalOpinion}</p>
          {f.laws && f.laws.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {f.laws.slice(0, 4).map((law, j) => (
                <span
                  key={j}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#A78BFA]/10 text-[#A78BFA] text-[10px] font-medium"
                >
                  <Scale className="w-2.5 h-2.5" />
                  {law.reference}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Advisor result (final) ---
function AdvisorSummary({ data }: { data: AdvisorResult }) {
  return (
    <div className="space-y-4">
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
            <circle
              cx="18" cy="18" r="15.9"
              fill="none" stroke="#F0F0F0" strokeWidth="3"
            />
            <circle
              cx="18" cy="18" r="15.9"
              fill="none"
              stroke={data.fairnessScore >= 7 ? "#4ECDC4" : data.fairnessScore >= 4 ? "#FFC832" : "#FF6B6B"}
              strokeWidth="3"
              strokeDasharray={`${(data.fairnessScore / 10) * 100} 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xl font-bold text-[#1A1A2E]">
            {data.fairnessScore}
          </span>
        </div>
        <div>
          <span className="text-xs text-[#9B9B9B] uppercase tracking-wide">Fairness Score</span>
          <p className="text-sm text-[#1A1A2E] font-medium mt-0.5">
            {data.fairnessScore >= 8
              ? "Documento equilibrato"
              : data.fairnessScore >= 5
              ? "Alcuni aspetti da verificare"
              : "Attenzione: squilibrio significativo"}
          </p>
        </div>
      </div>

      {/* Multidimensional scores */}
      {data.scores && (
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(data.scores).map(([key, val]) => {
            const labels: Record<string, string> = {
              contractEquity: "Equità",
              legalCoherence: "Coerenza",
              practicalCompliance: "Prassi",
              completeness: "Completezza",
              legalCompliance: "Conformità",
              contractBalance: "Equilibrio",
              industryPractice: "Prassi settore",
            };
            return (
              <div key={key} className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${((val as number) / 10) * 100}%`,
                      backgroundColor:
                        (val as number) >= 7 ? "#4ECDC4" : (val as number) >= 4 ? "#FFC832" : "#FF6B6B",
                    }}
                  />
                </div>
                <span className="text-[10px] text-[#9B9B9B] w-20 text-right">
                  {labels[key] || key}
                </span>
                <span className="text-xs font-medium text-[#1A1A2E] w-5 text-right">
                  {val as number}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <p className="text-[15px] text-[#1A1A2E] leading-relaxed">{data.summary}</p>

      {/* Risks (max 3) */}
      {data.risks && data.risks.length > 0 && (
        <div>
          <span className="text-xs text-[#9B9B9B] uppercase tracking-wide">Rischi principali</span>
          <ul className="mt-1.5 space-y-1.5">
            {data.risks.slice(0, 3).map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-[#FFC832] mt-0.5 shrink-0" />
                <span className="text-[#1A1A2E]">{r.detail || r.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions (max 3) */}
      {data.actions && data.actions.length > 0 && (
        <div>
          <span className="text-xs text-[#9B9B9B] uppercase tracking-wide">Cosa fare</span>
          <ol className="mt-1.5 space-y-1.5">
            {data.actions.slice(0, 3).map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-[#FF6B35]/10 text-[#FF6B35] flex items-center justify-center text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="text-[#1A1A2E]">{a.action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Lawyer CTA */}
      {data.needsLawyer && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
          <p className="text-sm text-amber-800 font-medium">
            Consigliamo di consultare un avvocato{" "}
            {data.lawyerSpecialization && `(${data.lawyerSpecialization})`}
          </p>
          {data.lawyerReason && (
            <p className="text-xs text-amber-700 mt-1">{data.lawyerReason}</p>
          )}
        </div>
      )}
    </div>
  );
}

// --- Corpus response ---
function CorpusResponseView({
  data,
  onArticleClick,
}: {
  data: NonNullable<ChatMessageType["corpusResponse"]>;
  onArticleClick?: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[15px] text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
        {data.answer}
      </p>

      {data.citedArticles && data.citedArticles.length > 0 && (
        <div>
          <span className="text-xs text-[#9B9B9B] uppercase tracking-wide">Fonti citate</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {data.citedArticles.map((art) => (
              <button
                key={art.id}
                onClick={() => onArticleClick?.(art.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#A78BFA]/10 text-[#A78BFA] text-xs font-medium hover:bg-[#A78BFA]/20 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Art. {art.articleNumber} {art.sourceName}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.followUpQuestions && data.followUpQuestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {data.followUpQuestions.map((q, i) => (
            <span
              key={i}
              className="px-2.5 py-1 rounded-full bg-gray-50 text-xs text-[#6B6B6B] border border-gray-100 cursor-default"
            >
              {q}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main message component ---
function ChatMessageComponent({ message, onDeepSearch, onArticleClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  // User message
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end mb-4"
      >
        <div className="max-w-[80%] md:max-w-[60%]">
          <div className="px-4 py-3 rounded-2xl rounded-br-md bg-[#1A1A2E] text-white">
            {message.fileName && (
              <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-white/10">
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                <span className="text-xs opacity-80">{message.fileName}</span>
              </div>
            )}
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </motion.div>
    );
  }

  // System/error message
  if (message.isError) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex mb-4"
      >
        <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-100 max-w-[80%]">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <AlertTriangle className="w-4 h-4" />
            {message.content}
          </div>
        </div>
      </motion.div>
    );
  }

  // Agent message
  const agent = message.agent || "advisor";
  const meta = AGENT_META[agent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3 mb-4 items-start"
    >
      <AgentAvatar agent={agent} />
      <div className="flex-1 min-w-0 max-w-[85%]">
        {/* Agent name + label */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium" style={{ color: meta.color }}>
            {meta.name}
          </span>
          <span className="text-[10px] text-[#9B9B9B]">{meta.label}</span>
        </div>

        {/* Content */}
        <div className="rounded-2xl rounded-tl-md bg-white border border-gray-100 px-4 py-3">
          {/* Running state */}
          {message.phaseStatus === "running" && <PhaseRunning agent={agent} />}

          {/* Completed phase with data */}
          {message.phaseStatus === "done" && message.phaseData && (
            <>
              {message.phase === "classifier" && (
                <ClassificationSummary data={message.phaseData as ClassificationResult} />
              )}
              {message.phase === "analyzer" && (
                <AnalysisSummary
                  data={message.phaseData as AnalysisResult}
                  onDeepSearch={onDeepSearch}
                />
              )}
              {message.phase === "investigator" && (
                <InvestigationSummary data={message.phaseData as InvestigationResult} />
              )}
              {message.phase === "advisor" && (
                <AdvisorSummary data={message.phaseData as AdvisorResult} />
              )}
            </>
          )}

          {/* Corpus response */}
          {message.corpusResponse && (
            <CorpusResponseView data={message.corpusResponse} onArticleClick={onArticleClick} />
          )}

          {/* Plain text */}
          {!message.phaseData && !message.corpusResponse && message.phaseStatus !== "running" && (
            <p className="text-[15px] text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default memo(ChatMessageComponent);
