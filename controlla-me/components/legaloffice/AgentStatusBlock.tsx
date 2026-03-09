"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users2,
  FileSearch,
  Scale,
  Search,
  Lightbulb,
  MessageSquare,
  ChevronRight,
  Info,
  Brain,
  BookOpen,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockAgentId = "leader" | "comprensione" | "classifier" | "analyzer" | "corpus-search" | "investigator" | "advisor";
export type BlockStatus = "idle" | "running" | "done" | "skipped" | "error";

// ── Agent config ──────────────────────────────────────────────────────────────

const AGENT_META: Record<BlockAgentId, {
  label: string;
  role: string;
  description: string;
  color: string;
  Icon: React.ElementType;
}> = {
  leader: {
    label: "Leader",
    role: "Coordinatore",
    description: "Coordina la pipeline di analisi e risponde alle tue domande sul documento. È il tuo interlocutore principale.",
    color: "#6366F1",
    Icon: Users2,
  },
  comprensione: {
    label: "Comprensione",
    role: "Analisi domanda",
    description: "Analizza e riformula la domanda in linguaggio giuridico per massimizzare la pertinenza della ricerca nel corpus legislativo.",
    color: "#06B6D4",
    Icon: Brain,
  },
  classifier: {
    label: "Classificatore",
    role: "Analisi documento",
    description: "Identifica il tipo di documento, le parti coinvolte, la giurisdizione e le leggi applicabili.",
    color: "var(--agent-classifier)",
    Icon: FileSearch,
  },
  analyzer: {
    label: "Analista",
    role: "Analisi rischi",
    description: "Esamina ogni clausola e identifica i rischi per la parte debole, con riferimento al quadro normativo.",
    color: "var(--agent-analyzer)",
    Icon: Scale,
  },
  "corpus-search": {
    label: "Ricerca Corpus",
    role: "Consultazione normativa",
    description: "Cerca nel corpus legislativo (5600+ articoli italiani ed europei) gli articoli più pertinenti alla domanda riformulata.",
    color: "#818CF8",
    Icon: BookOpen,
  },
  investigator: {
    label: "Investigatore",
    role: "Ricerca normativa",
    description: "Ricerca normativa aggiornata e giurisprudenza rilevante per le clausole rischiose identificate.",
    color: "var(--agent-investigator)",
    Icon: Search,
  },
  advisor: {
    label: "Consulente",
    role: "Valutazione finale",
    description: "Produce il giudizio finale con scoring multidimensionale, rischi prioritizzati e azioni consigliate.",
    color: "var(--agent-advisor)",
    Icon: Lightbulb,
  },
};

// ── Summary generators ────────────────────────────────────────────────────────

function generateSummary(
  agentId: BlockAgentId,
  status: BlockStatus,
  data?: Record<string, unknown> | null
): string | null {
  if (status === "idle") return agentId === "leader" ? "Pronto" : null;
  if (status === "error") return "Errore durante l'elaborazione";
  if (status === "skipped") return "Saltato";

  if (status === "running") {
    switch (agentId) {
      case "leader":         return "Coordinando l'analisi…";
      case "comprensione":   return "Riformulando la domanda…";
      case "classifier":     return "Classificando il documento…";
      case "analyzer":       return "Analizzando le clausole…";
      case "corpus-search":  return "Cercando nel corpus legislativo…";
      case "investigator":   return "Ricercando normativa…";
      case "advisor":        return "Elaborando la valutazione…";
    }
  }

  // done
  if (!data) return "Completato";

  switch (agentId) {
    case "leader": return "Analisi completata";

    case "comprensione": {
      const query = (data.legalQuery as string) || "";
      return query.length > 70 ? query.slice(0, 67) + "…" : query || "Preparazione completata";
    }

    case "classifier": {
      // Q&A mode: usa questionTypeLabel
      if ("questionType" in data) {
        const label = (data.questionTypeLabel as string) || (data.questionType as string) || "";
        return label || "Classificato";
      }
      // Document mode
      const type = (data.documentType as string) || "";
      const sub  = (data.documentSubType as string) || "";
      return type ? `${type}${sub ? ` · ${sub}` : ""}` : "Completato";
    }

    case "analyzer": {
      // Q&A mode: usa riskAssessment + keyIssues
      if ("riskAssessment" in data) {
        const risk   = (data.riskAssessment as string) || "";
        const issues = (data.keyIssues as unknown[]) || [];
        return `Rischio ${risk}${issues.length > 0 ? ` · ${issues.length} probl${issues.length !== 1 ? "emi" : "ema"}` : ""}`;
      }
      // Document mode
      const clauses  = (data.clauses as Array<{ severity?: string }>) || [];
      const critical = clauses.filter(c => c.severity === "alta").length;
      const medium   = clauses.filter(c => c.severity === "media").length;
      if (clauses.length === 0) return "Nessuna clausola rischiosa";
      const parts: string[] = [];
      if (critical > 0) parts.push(`${critical} critica${critical !== 1 ? "e" : ""}`);
      if (medium   > 0) parts.push(`${medium} media${medium !== 1 ? "e" : ""}`);
      return parts.join(", ");
    }

    case "corpus-search": {
      const articles = (data.articlesFound as number) || 0;
      const knowledge = (data.knowledgeFound as number) || 0;
      return `${articles} articoli · ${knowledge} fonti`;
    }

    case "investigator": {
      // Q&A mode: output con "response" + "sources"
      if ("response" in data) {
        const sources = (data.sources as unknown[]) || [];
        return sources.length > 0
          ? `${sources.length} riferiment${sources.length !== 1 ? "i" : "o"} normativ${sources.length !== 1 ? "i" : "o"}`
          : "Analisi normativa completata";
      }
      // Document mode: output con "findings"
      const findings = (data.findings as unknown[]) || [];
      return findings.length > 0
        ? `${findings.length} riferiment${findings.length !== 1 ? "i" : "o"} trovato`
        : "Nessun riferimento specifico";
    }

    case "advisor": {
      // Corpus agent path: output con "answer" + "confidence"
      if ("answer" in data && "confidence" in data) {
        const conf = (data.confidence as number) || 0;
        const arts = (data.articlesRetrieved as number) || 0;
        return `${arts} articoli · conf. ${(conf * 100).toFixed(0)}%`;
      }
      // Q&A mode: output con "answer"
      if ("answer" in data) {
        const needsLawyer = data.needsLawyer as boolean;
        return needsLawyer ? "Consiglio avvocato" : "Parere disponibile";
      }
      // Document mode: output con "fairnessScore"
      const score = data.fairnessScore as number;
      return score != null ? `Score equità: ${score}/10` : "Completato";
    }
  }
}

// ── QA Content renderer ────────────────────────────────────────────────────────
// Mostra il contenuto dell'agente nella sua box quando completa (solo Q&A mode)

function generateQAContent(
  agentId: BlockAgentId,
  data: Record<string, unknown> | null | undefined
): React.ReactNode | null {
  if (!data) return null;

  switch (agentId) {
    case "comprensione": {
      const legalQuery = (data.legalQuery as string) || "";
      const keywords = (data.keywords as string[]) || [];
      const areas = (data.legalAreas as string[]) || [];
      return (
        <div className="mt-1.5 pl-4 space-y-1">
          {legalQuery && (
            <p className="text-[10px] text-gray-500 italic leading-snug">
              &ldquo;{legalQuery.slice(0, 140)}{legalQuery.length > 140 ? "…" : ""}&rdquo;
            </p>
          )}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {keywords.slice(0, 5).map((k, i) => (
                <span
                  key={i}
                  className="text-[9px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-100"
                >
                  {k}
                </span>
              ))}
            </div>
          )}
          {areas.length > 0 && (
            <p className="text-[10px] text-gray-400 italic">
              {areas.join(" · ")}
            </p>
          )}
        </div>
      );
    }

    case "classifier": {
      // Q&A mode (multi-agent pipeline)
      if ("questionType" in data) {
        const typeLabel  = (data.questionTypeLabel as string) || (data.questionType as string) || "";
        const laws       = (data.applicableLaws as Array<{ reference: string; name: string }>) || [];
        const institutes = (data.relevantInstitutes as string[]) || [];
        return (
          <div className="mt-1.5 pl-4 space-y-1">
            {typeLabel && (
              <p className="text-[11px] text-gray-700 font-medium">{typeLabel}</p>
            )}
            {laws.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {laws.slice(0, 4).map((l, i) => (
                  <span
                    key={i}
                    className="text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded font-mono border border-teal-100"
                    title={l.name}
                  >
                    {l.reference}
                  </span>
                ))}
              </div>
            )}
            {institutes.length > 0 && (
              <p className="text-[10px] text-gray-400 italic">
                {institutes.slice(0, 3).join(" · ")}
              </p>
            )}
          </div>
        );
      }
      // Document mode
      return null;
    }

    case "analyzer": {
      if (!("riskAssessment" in data)) return null;
      const risk   = (data.riskAssessment as string) || "";
      const issues = (data.keyIssues as Array<{ issue: string; legalBasis?: string; impactLevel?: string }>) || [];
      const riskColor = risk === "alto" ? "text-red-600 bg-red-50 border-red-100"
                      : risk === "medio" ? "text-amber-600 bg-amber-50 border-amber-100"
                      : "text-emerald-600 bg-emerald-50 border-emerald-100";
      return (
        <div className="mt-1.5 pl-4 space-y-1.5">
          <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${riskColor}`}>
            Rischio {risk}
          </span>
          {issues.length > 0 && (
            <ul className="space-y-1">
              {issues.slice(0, 3).map((iss, i) => (
                <li key={i} className="text-[10px] text-gray-500 flex gap-1 leading-snug">
                  <span className="text-gray-300 flex-shrink-0 mt-0.5">·</span>
                  <span>
                    {iss.issue.slice(0, 80)}{iss.issue.length > 80 ? "…" : ""}
                    {iss.legalBasis && (
                      <span className="ml-1 text-gray-400 font-mono text-[9px]">({iss.legalBasis})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    case "corpus-search": {
      const topArticles = (data.topArticles as Array<{ reference: string; source: string; similarity: number }>) || [];
      const articlesFound = (data.articlesFound as number) || 0;
      const knowledgeFound = (data.knowledgeFound as number) || 0;
      return (
        <div className="mt-1.5 pl-4 space-y-1.5">
          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border text-indigo-600 bg-indigo-50 border-indigo-100">
            {articlesFound} articoli + {knowledgeFound} knowledge
          </span>
          {topArticles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {topArticles.map((a, i) => (
                <span
                  key={i}
                  className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-mono"
                  title={`${a.source} · pertinenza ${(a.similarity * 100).toFixed(0)}%`}
                >
                  {a.reference}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "investigator": {
      if (!("response" in data)) return null;
      const response = (data.response as string) || "";
      const sources  = (data.sources as Array<{ title: string; url?: string }>) || [];
      return (
        <div className="mt-1.5 pl-4 space-y-1.5">
          {response && (
            <p className="text-[10px] text-gray-500 leading-snug line-clamp-3">
              {response.slice(0, 220)}{response.length > 220 ? "…" : ""}
            </p>
          )}
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sources.slice(0, 5).map((s, i) => (
                <span
                  key={i}
                  className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100 font-mono"
                  title={s.title}
                >
                  {s.title.slice(0, 28)}{s.title.length > 28 ? "…" : ""}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "advisor": {
      // Corpus agent path: mostra articoli citati
      if ("citedArticles" in data) {
        const cited = (data.citedArticles as Array<{ reference: string; source: string }>) || [];
        const conf = (data.confidence as number) || 0;
        return (
          <div className="mt-1.5 pl-4 space-y-1.5">
            <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              conf >= 0.8 ? "text-emerald-600 bg-emerald-50 border-emerald-100"
              : conf >= 0.6 ? "text-amber-600 bg-amber-50 border-amber-100"
              : "text-red-600 bg-red-50 border-red-100"
            }`}>
              Conf. {(conf * 100).toFixed(0)}%
            </span>
            {cited.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {cited.slice(0, 5).map((a, i) => (
                  <span
                    key={i}
                    className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-mono"
                    title={a.source}
                  >
                    {a.reference}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      }
      // Multi-agent advisor: contenuto nella chat
      return null;
    }

    // leader: il contenuto è nella chat
    default:
      return null;
  }
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusDot({ status, color }: { status: BlockStatus; color: string }) {
  if (status === "running") {
    return (
      <span className="relative flex items-center justify-center w-2.5 h-2.5 flex-shrink-0">
        <motion.span
          className="absolute w-2.5 h-2.5 rounded-full opacity-60"
          style={{ backgroundColor: color }}
          animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      </span>
    );
  }
  if (status === "done") {
    return <span className="w-2 h-2 rounded-full bg-gray-900 flex-shrink-0" />;
  }
  if (status === "error") {
    return <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />;
  }
  if (status === "skipped") {
    return <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />;
  }
  // idle
  return <span className="w-2 h-2 rounded-full bg-gray-200 flex-shrink-0" />;
}

// ── Main component ────────────────────────────────────────────────────────────

interface AgentStatusBlockProps {
  agentId: BlockAgentId;
  status: BlockStatus;
  data?: Record<string, unknown> | null;
  onAskClick: (agentId: BlockAgentId) => void;
}

export default function AgentStatusBlock({
  agentId,
  status,
  data,
  onAskClick,
}: AgentStatusBlockProps) {
  const [showDesc, setShowDesc] = useState(false);
  const meta = AGENT_META[agentId];
  const summary = generateSummary(agentId, status, data);
  const content = status === "done" ? generateQAContent(agentId, data) : null;
  const { Icon } = meta;

  return (
    <div
      className={`rounded-xl px-3 py-2.5 transition-all duration-200 ${
        status === "running"
          ? "bg-white border border-gray-200 shadow-sm"
          : status === "done" && content
          ? "bg-white border border-gray-100"
          : "hover:bg-white/60"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <StatusDot status={status} color={meta.color} />

        {/* Icon + Name */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Icon
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: status !== "idle" ? meta.color : "#d1d5db" }}
          />
          <span
            className={`text-xs font-semibold truncate ${
              status === "idle" ? "text-gray-400" : "text-gray-800"
            }`}
          >
            {meta.label}
          </span>
          {status !== "idle" && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">{meta.role}</span>
          )}
        </div>

        {/* Info button */}
        <button
          onClick={() => setShowDesc(v => !v)}
          className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
          title="Descrizione agente"
        >
          <Info className="w-3 h-3" />
        </button>

        {/* Ask button */}
        <button
          onClick={() => onAskClick(agentId)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex-shrink-0"
          title={`Parla con ${meta.label}`}
        >
          <MessageSquare className="w-3 h-3" />
          <ChevronRight className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <p
          className={`text-[11px] mt-1 pl-4 leading-tight ${
            status === "running" ? "text-gray-500" :
            status === "done"    ? "text-gray-600" :
            "text-gray-400"
          }`}
        >
          {summary}
        </p>
      )}

      {/* QA Content — risultati dell'agente mostrati progressivamente */}
      <AnimatePresence>
        {content && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Description tooltip */}
      <AnimatePresence>
        {showDesc && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-[11px] text-gray-500 mt-1.5 pl-4 leading-snug border-l-2 border-gray-100">
              {meta.description}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
