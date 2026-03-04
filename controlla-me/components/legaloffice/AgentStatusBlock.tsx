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
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockAgentId = "leader" | "classifier" | "analyzer" | "investigator" | "advisor";
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
  classifier: {
    label: "Classificatore",
    role: "Analisi documento",
    description: "Identifica il tipo di documento, le parti coinvolte, la giurisdizione e le leggi applicabili.",
    color: "#4ECDC4",
    Icon: FileSearch,
  },
  analyzer: {
    label: "Analista",
    role: "Analisi rischi",
    description: "Esamina ogni clausola e identifica i rischi per la parte debole, con riferimento al quadro normativo.",
    color: "#FF6B6B",
    Icon: Scale,
  },
  investigator: {
    label: "Investigatore",
    role: "Ricerca normativa",
    description: "Ricerca normativa aggiornata e giurisprudenza rilevante per le clausole rischiose identificate.",
    color: "#A78BFA",
    Icon: Search,
  },
  advisor: {
    label: "Consulente",
    role: "Valutazione finale",
    description: "Produce il giudizio finale con scoring multidimensionale, rischi prioritizzati e azioni consigliate.",
    color: "#FFC832",
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
      case "leader":       return "Coordinando l'analisi…";
      case "classifier":   return "Classificando il documento…";
      case "analyzer":     return "Analizzando le clausole…";
      case "investigator": return "Ricercando normativa…";
      case "advisor":      return "Elaborando la valutazione…";
    }
  }

  // done
  if (!data) return "Completato";

  switch (agentId) {
    case "leader": return "Analisi completata";

    case "classifier": {
      const type = (data.documentType as string) || "";
      const sub  = (data.documentSubType as string) || "";
      return type ? `${type}${sub ? ` · ${sub}` : ""}` : "Completato";
    }

    case "analyzer": {
      const clauses  = (data.clauses as Array<{ severity?: string }>) || [];
      const critical = clauses.filter(c => c.severity === "alta").length;
      const medium   = clauses.filter(c => c.severity === "media").length;
      if (clauses.length === 0) return "Nessuna clausola rischiosa";
      const parts: string[] = [];
      if (critical > 0) parts.push(`${critical} critica${critical !== 1 ? "e" : ""}`);
      if (medium   > 0) parts.push(`${medium} media${medium !== 1 ? "e" : ""}`);
      return parts.join(", ");
    }

    case "investigator": {
      const findings = (data.findings as unknown[]) || [];
      return findings.length > 0
        ? `${findings.length} riferiment${findings.length !== 1 ? "i" : "o"} trovato`
        : "Nessun riferimento specifico";
    }

    case "advisor": {
      const score = data.fairnessScore as number;
      return score != null ? `Score equità: ${score}/10` : "Completato";
    }
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
  const meta    = AGENT_META[agentId];
  const summary = generateSummary(agentId, status, data);
  const { Icon } = meta;

  return (
    <div
      className={`rounded-xl px-3 py-2.5 transition-all duration-200 ${
        status === "running"
          ? "bg-white border border-gray-200 shadow-sm"
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
