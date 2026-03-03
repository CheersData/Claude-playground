"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, FileText, Search, Scale, Lightbulb, Check, Loader2, SkipForward, AlertCircle } from "lucide-react";

// ── Agent identity ────────────────────────────────────────────────────────────

export type AgentId = "classifier" | "analyzer" | "investigator" | "advisor";
export type AgentStatus = "idle" | "running" | "done" | "skipped" | "error";

const AGENT_CONFIG: Record<AgentId, {
  name: string;
  role: string;
  color: string;
  bg: string;
  Icon: React.ElementType;
}> = {
  classifier: {
    name: "Leo",
    role: "Catalogatore",
    color: "#4ECDC4",
    bg: "rgba(78,205,196,0.08)",
    Icon: FileText,
  },
  analyzer: {
    name: "Marta",
    role: "Analista",
    color: "#FF6B6B",
    bg: "rgba(255,107,107,0.08)",
    Icon: Scale,
  },
  investigator: {
    name: "Giulia",
    role: "Giurista",
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.08)",
    Icon: Search,
  },
  advisor: {
    name: "Enzo",
    role: "Consulente",
    color: "#FFC832",
    bg: "rgba(255,200,50,0.08)",
    Icon: Lightbulb,
  },
};

// ── Article chip detection ─────────────────────────────────────────────────────

// Matches: Art. 1571 c.c. | art. 4 | D.Lgs. 23/2015 | L. 300/1970 | D.P.R. 633/1972
const ARTICLE_REGEX = /\b(Art\.?\s*\d+(?:[\w\s.-]*(?:c\.c\.|c\.p\.|cost\.|c\.n\.))?\s*|D\.Lgs\.?\s*[\d]+\/\d{4}(?:,?\s*art\.?\s*\d+)?|L\.?\s*\d+\/\d{4}|D\.P\.R\.?\s*\d+\/\d{4})/gi;

function TextWithArticleChips({
  text,
  onArticleClick,
}: {
  text: string;
  onArticleClick: (ref: string) => void;
}) {
  const parts = text.split(ARTICLE_REGEX);
  return (
    <>
      {parts.map((part, i) => {
        if (ARTICLE_REGEX.test(part)) {
          ARTICLE_REGEX.lastIndex = 0;
          return (
            <button
              key={i}
              onClick={() => onArticleClick(part.trim())}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium mx-0.5 transition-all hover:scale-105 cursor-pointer"
              style={{
                backgroundColor: "rgba(255,107,53,0.12)",
                color: "#FF6B35",
                border: "1px solid rgba(255,107,53,0.25)",
              }}
              title={`Cerca "${part.trim()}" nel corpus`}
            >
              {part.trim()}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Agent summaries ───────────────────────────────────────────────────────────

function ClassifierSummary({ data, onArticleClick }: { data: Record<string, unknown>; onArticleClick: (ref: string) => void }) {
  const type = data.documentType as string || "—";
  const subtype = data.documentSubType as string || "";
  const laws = (data.relevantLaws as string[]) || [];
  const risk = data.riskLevel as string;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Tipo</span>
        <span className="font-medium text-gray-700">{type}{subtype ? ` — ${subtype}` : ""}</span>
      </div>
      {laws.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-gray-400 uppercase tracking-wide mr-1">Leggi</span>
          {laws.slice(0, 4).map((l, i) => (
            <button
              key={i}
              onClick={() => onArticleClick(l)}
              className="px-2 py-0.5 rounded-full text-[11px] font-medium transition-all hover:scale-105"
              style={{ backgroundColor: "rgba(78,205,196,0.12)", color: "#4ECDC4", border: "1px solid rgba(78,205,196,0.25)" }}
            >
              {l}
            </button>
          ))}
        </div>
      )}
      {risk && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Rischio</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            risk === "alta" ? "bg-red-100 text-red-600" :
            risk === "media" ? "bg-amber-100 text-amber-600" :
            "bg-green-100 text-green-600"
          }`}>{risk}</span>
        </div>
      )}
    </div>
  );
}

function AnalyzerSummary({ data, onArticleClick }: { data: Record<string, unknown>; onArticleClick: (ref: string) => void }) {
  const clauses = (data.clauses as Array<{ severity: string; title: string; explanation?: string }>) || [];
  const critical = clauses.filter(c => c.severity === "alta").length;
  const high = clauses.filter(c => c.severity === "media").length;
  const overallRisk = data.overallRisk as string;

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3">
        {critical > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-600">
            {critical} critica{critical !== 1 ? "e" : ""}
          </span>
        )}
        {high > 0 && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-600">
            {high} media{high !== 1 ? "" : ""}
          </span>
        )}
        {clauses.length === 0 && <span className="text-green-600 text-xs font-medium">Nessuna clausola rischiosa</span>}
      </div>
      {clauses.slice(0, 2).map((c, i) => (
        <div key={i} className="text-xs text-gray-600 pl-2 border-l-2 border-gray-200">
          <span className="font-medium">{c.title}</span>
          {c.explanation && (
            <span className="text-gray-400 ml-1">
              — <TextWithArticleChips text={c.explanation.slice(0, 80) + (c.explanation.length > 80 ? "…" : "")} onArticleClick={onArticleClick} />
            </span>
          )}
        </div>
      ))}
      {clauses.length > 2 && (
        <div className="text-xs text-gray-400">+{clauses.length - 2} altre clausole nel dettaglio</div>
      )}
    </div>
  );
}

function InvestigatorSummary({ data, onArticleClick }: { data: Record<string, unknown>; onArticleClick: (ref: string) => void }) {
  const findings = (data.findings as Array<{ reference: string; summary: string }>) || [];

  if (findings.length === 0) {
    return <p className="text-sm text-gray-400">Nessun riferimento normativo specifico trovato.</p>;
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="text-xs text-gray-400 uppercase tracking-wide">{findings.length} riferiment{findings.length !== 1 ? "i" : "o"} trovato</div>
      {findings.slice(0, 2).map((f, i) => (
        <div key={i} className="text-xs text-gray-600 pl-2 border-l-2 border-purple-200">
          <TextWithArticleChips text={f.reference || ""} onArticleClick={onArticleClick} />
          {f.summary && <span className="text-gray-400"> — {f.summary.slice(0, 80)}{f.summary.length > 80 ? "…" : ""}</span>}
        </div>
      ))}
    </div>
  );
}

function AdvisorSummary({ data, onArticleClick }: { data: Record<string, unknown>; onArticleClick: (ref: string) => void }) {
  const fairness = data.fairnessScore as number || 0;
  const risks = (data.risks as Array<{ title: string }>) || [];
  const actions = (data.actions as Array<{ action: string }>) || [];

  const color = fairness >= 7 ? "#2ECC40" : fairness >= 5 ? "#FF851B" : "#FF4136";

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold"
            style={{ backgroundColor: `${color}15`, color, border: `2px solid ${color}40` }}>
            {fairness}
          </div>
          <div className="text-xs text-gray-400">/ 10<br /><span className="text-gray-500">equità</span></div>
        </div>
        <div className="flex-1 space-y-1">
          {risks.slice(0, 1).map((r, i) => (
            <div key={i} className="text-xs text-red-500 font-medium">⚠ {r.title}</div>
          ))}
          {actions.slice(0, 1).map((a, i) => (
            <div key={i} className="text-xs text-blue-500">→ {a.action?.slice(0, 60)}{(a.action?.length || 0) > 60 ? "…" : ""}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Status indicator ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === "idle") return <span className="text-[10px] text-gray-400">In attesa</span>;
  if (status === "running") return (
    <span className="flex items-center gap-1 text-[10px] text-amber-500">
      <Loader2 className="w-3 h-3 animate-spin" /> Elaborazione…
    </span>
  );
  if (status === "done") return (
    <span className="flex items-center gap-1 text-[10px] text-green-500">
      <Check className="w-3 h-3" /> Completato
    </span>
  );
  if (status === "skipped") return (
    <span className="flex items-center gap-1 text-[10px] text-gray-400">
      <SkipForward className="w-3 h-3" /> Saltato
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] text-red-400">
      <AlertCircle className="w-3 h-3" /> Errore
    </span>
  );
}

// ── Running animation ─────────────────────────────────────────────────────────

function RunningPulse({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-1.5 py-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
      <span className="text-xs text-gray-400 ml-1">Analisi in corso…</span>
    </div>
  );
}

// ── Main AgentBox ─────────────────────────────────────────────────────────────

interface AgentBoxProps {
  agentId: AgentId;
  status: AgentStatus;
  data?: Record<string, unknown> | null;
  onArticleClick: (ref: string) => void;
  delay?: number;
}

export default function AgentBox({ agentId, status, data, onArticleClick, delay = 0 }: AgentBoxProps) {
  const [expanded, setExpanded] = useState(true);
  const cfg = AGENT_CONFIG[agentId];
  const { Icon } = cfg;

  const showContent = status !== "idle" && status !== "skipped";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border overflow-hidden transition-all"
      style={{
        borderColor: status === "done" ? cfg.color + "40" : status === "running" ? cfg.color + "60" : "rgba(0,0,0,0.08)",
        backgroundColor: status === "running" ? cfg.bg : "white",
        boxShadow: status === "running" ? `0 0 0 2px ${cfg.color}30` : "none",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50/50 transition-colors"
        disabled={!showContent}
      >
        {/* Icon */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: status !== "idle" ? cfg.bg : "rgba(0,0,0,0.04)" }}>
          <Icon className="w-4 h-4" style={{ color: status !== "idle" ? cfg.color : "#9ca3af" }} />
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-800">{cfg.name}</span>
            <span className="text-xs text-gray-400">{cfg.role}</span>
          </div>
          <StatusBadge status={status} />
        </div>

        {/* Expand toggle */}
        {showContent && (
          <div className="text-gray-300">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {showContent && expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-gray-50">
              {status === "running" && <RunningPulse color={cfg.color} />}
              {status === "done" && data && (
                <div className="mt-3">
                  {agentId === "classifier" && <ClassifierSummary data={data} onArticleClick={onArticleClick} />}
                  {agentId === "analyzer" && <AnalyzerSummary data={data} onArticleClick={onArticleClick} />}
                  {agentId === "investigator" && <InvestigatorSummary data={data} onArticleClick={onArticleClick} />}
                  {agentId === "advisor" && <AdvisorSummary data={data} onArticleClick={onArticleClick} />}
                </div>
              )}
              {status === "error" && (
                <p className="text-sm text-red-400 mt-2">Errore durante l'elaborazione.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
