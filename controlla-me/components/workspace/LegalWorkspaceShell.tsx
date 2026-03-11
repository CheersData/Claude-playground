"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, FileText, Search, Check, Loader2 } from "lucide-react";
import AgentBox, { type AgentId, type AgentStatus } from "./AgentBox";
import WorkspaceRightPanel, { type RightPanelTab } from "./WorkspaceRightPanel";
import FinalEvaluationPanel from "./FinalEvaluationPanel";
import type { AdvisorResult, AgentPhase } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TierName = "intern" | "associate" | "partner";

interface LegalWorkspaceShellProps {
  fileName: string;
  currentPhase: AgentPhase | null;
  completedPhases: AgentPhase[];
  phaseResults: Record<string, unknown>;
  result: AdvisorResult | null;
  sessionId: string | null;
  onBack: () => void;
  documentType?: string;
  tier?: TierName;
}

const AGENT_ORDER: AgentId[] = ["classifier", "analyzer", "investigator", "advisor"];

const AGENT_LABELS: Record<AgentId, { label: string; color: string }> = {
  classifier:   { label: "Classificatore", color: "#4ECDC4" },
  analyzer:     { label: "Analista",        color: "#FF6B6B" },
  investigator: { label: "Investigatore",   color: "#A78BFA" },
  advisor:      { label: "Consulente",      color: "#FFC832" },
};

const TIER_CONFIG: Record<TierName, { label: string; badge: string }> = {
  intern:    { label: "Intern",    badge: "bg-gray-100 text-gray-500 border-gray-200" },
  associate: { label: "Associate", badge: "bg-blue-50 text-blue-600 border-blue-200" },
  partner:   { label: "Partner",   badge: "bg-violet-50 text-violet-700 border-violet-200" },
};

function getAgentStatus(
  agentId: AgentId,
  currentPhase: AgentPhase | null,
  completedPhases: AgentPhase[]
): AgentStatus {
  if (completedPhases.includes(agentId as AgentPhase)) return "done";
  if (currentPhase === agentId) return "running";
  return "idle";
}

// ── Left Sidebar ──────────────────────────────────────────────────────────────

function WorkspaceSidebar({
  fileName,
  currentPhase,
  completedPhases,
  tier = "partner",
  onOpenCorpusSearch,
}: {
  fileName: string;
  currentPhase: AgentPhase | null;
  completedPhases: AgentPhase[];
  tier?: TierName;
  onOpenCorpusSearch: () => void;
}) {
  const tc = TIER_CONFIG[tier];

  return (
    <div className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-y-auto h-full">

      {/* ── Documento ── */}
      <div className="px-4 pt-5 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">
          Documento
        </p>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100">
          <FileText className="w-3.5 h-3.5 text-[#FF6B35] flex-shrink-0" />
          <span className="text-xs font-medium text-gray-700 truncate leading-tight">
            {fileName}
          </span>
        </div>
      </div>

      {/* ── Pipeline ── */}
      <div className="px-4 py-4 border-t border-gray-50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-3">
          Pipeline
        </p>
        <div className="space-y-2.5">
          {AGENT_ORDER.map((id) => {
            const status = getAgentStatus(id, currentPhase, completedPhases);
            const { label, color } = AGENT_LABELS[id];
            return (
              <div key={id} className="flex items-center gap-2.5 h-5">
                {/* Status indicator */}
                <div className="relative w-4 h-4 flex items-center justify-center flex-shrink-0">
                  {status === "done" ? (
                    <Check className="w-3.5 h-3.5 text-green-400" />
                  ) : status === "running" ? (
                    <>
                      <motion.div
                        className="w-2 h-2 rounded-full absolute"
                        style={{ backgroundColor: color }}
                        animate={{ scale: [1, 1.9, 1], opacity: [0.5, 0, 0.5] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      />
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    </>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-gray-200" />
                  )}
                </div>

                {/* Agent label */}
                <span className={`text-xs font-medium flex-1 ${
                  status === "done"    ? "text-gray-700" :
                  status === "running" ? "text-gray-800" :
                  "text-gray-300"
                }`}>
                  {label}
                </span>

                {status === "running" && (
                  <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Tier attivo ── */}
      <div className="px-4 py-4 border-t border-gray-50">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">
          Tier attivo
        </p>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${tc.badge}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
          {tc.label}
        </span>
      </div>

      {/* ── Corpus ── */}
      <div className="px-4 py-4 border-t border-gray-50 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-2">
          Corpus legislativo
        </p>
        <button
          onClick={onOpenCorpusSearch}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border bg-white transition-colors text-left group hover:border-gray-300"
          style={{ borderColor: "#eff0f2" }}
        >
          <Search className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
          <span className="flex-1 text-xs text-gray-300 group-hover:text-gray-400 transition-colors">
            Cerca articolo…
          </span>
          <kbd className="text-[9px] bg-gray-50 text-gray-300 px-1.5 py-0.5 rounded border border-gray-100 flex-shrink-0">
            ⌘K
          </kbd>
        </button>
      </div>
    </div>
  );
}

// ── Main Shell ─────────────────────────────────────────────────────────────────

export default function LegalWorkspaceShell({
  fileName,
  currentPhase,
  completedPhases,
  phaseResults,
  result,
  sessionId,
  onBack,
  documentType,
  tier = "partner",
}: LegalWorkspaceShellProps) {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RightPanelTab>("article");
  const [selectedArticleRef, setSelectedArticleRef] = useState<string | null>(null);

  const handleArticleClick = useCallback((ref: string) => {
    setSelectedArticleRef(ref);
    setActiveTab("article");
    setRightPanelOpen(true);
  }, []);

  const handleArticleSelect = useCallback((ref: string) => {
    setSelectedArticleRef(ref);
    setActiveTab("article");
  }, []);

  const openCorpusSearch = useCallback(() => {
    setActiveTab("search");
    setRightPanelOpen(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setActiveTab("search");
        setRightPanelOpen(true);
      }
      if (e.key === "Escape" && rightPanelOpen) {
        setRightPanelOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rightPanelOpen]);

  const isDone = result !== null;
  const isAnalyzing = currentPhase !== null;

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FA] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-5 h-14 bg-white border-b border-gray-100 z-10 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span className="hidden sm:inline text-xs">Indietro</span>
        </button>

        <div className="w-px h-5 bg-gray-100 flex-shrink-0" />

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800 truncate">{fileName}</span>
          {documentType && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0 hidden md:block">
              {documentType}
            </span>
          )}
        </div>

        {/* Phase progress dots */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {AGENT_ORDER.map(agent => {
            const status = getAgentStatus(agent, currentPhase, completedPhases);
            return (
              <motion.div
                key={agent}
                className="w-1.5 h-1.5 rounded-full"
                animate={{
                  backgroundColor:
                    status === "done"    ? "#22c55e" :
                    status === "running" ? "#FF6B35" :
                    "#e5e7eb",
                  scale: status === "running" ? [1, 1.4, 1] : 1,
                }}
                transition={status === "running" ? { duration: 1, repeat: Infinity } : {}}
              />
            );
          })}
          {isDone && (
            <span className="text-[10px] text-green-500 font-semibold ml-2">Completata</span>
          )}
          {isAnalyzing && !isDone && (
            <span className="text-[10px] text-amber-500 font-medium ml-2">Analisi…</span>
          )}
        </div>
      </div>

      {/* ── 3-zone layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <WorkspaceSidebar
          fileName={fileName}
          currentPhase={currentPhase}
          completedPhases={completedPhases}
          tier={tier}
          onOpenCorpusSearch={openCorpusSearch}
        />

        {/* CENTER */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
            {AGENT_ORDER.map((agentId, i) => {
              const status = getAgentStatus(agentId, currentPhase, completedPhases);
              const agentData = (phaseResults[agentId] as Record<string, unknown> | null) ?? null;
              return (
                <AgentBox
                  key={agentId}
                  agentId={agentId}
                  status={status}
                  data={agentData}
                  onArticleClick={handleArticleClick}
                  delay={i * 0.08}
                />
              );
            })}

            <AnimatePresence>
              {isDone && result && (
                <FinalEvaluationPanel
                  result={result}
                  sessionId={sessionId}
                  onArticleClick={handleArticleClick}
                />
              )}
            </AnimatePresence>

            <div className="h-8" />
          </div>
        </div>

        {/* RIGHT PANEL */}
        <WorkspaceRightPanel
          isOpen={rightPanelOpen}
          activeTab={activeTab}
          selectedArticleRef={selectedArticleRef}
          documentContext={documentType || fileName}
          onTabChange={setActiveTab}
          onArticleSelect={handleArticleSelect}
          onClose={() => setRightPanelOpen(false)}
        />
      </div>
    </div>
  );
}
