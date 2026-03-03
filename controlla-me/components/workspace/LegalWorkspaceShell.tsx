"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Keyboard, FileText } from "lucide-react";
import AgentBox, { type AgentId, type AgentStatus } from "./AgentBox";
import WorkspaceRightPanel, { type RightPanelTab } from "./WorkspaceRightPanel";
import FinalEvaluationPanel from "./FinalEvaluationPanel";
import type { AdvisorResult, AgentPhase, PhaseStatus } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentState {
  status: AgentStatus;
  data: Record<string, unknown> | null;
}

interface LegalWorkspaceShellProps {
  fileName: string;
  currentPhase: AgentPhase | null;
  completedPhases: AgentPhase[];
  phaseResults: Record<string, unknown>;
  result: AdvisorResult | null;
  sessionId: string | null;
  onBack: () => void;
  documentType?: string;
}

const AGENT_ORDER: AgentId[] = ["classifier", "analyzer", "investigator", "advisor"];

function getAgentStatus(
  agentId: AgentId,
  currentPhase: AgentPhase | null,
  completedPhases: AgentPhase[]
): AgentStatus {
  if (completedPhases.includes(agentId as AgentPhase)) return "done";
  if (currentPhase === agentId) return "running";
  return "idle";
}

// ── Keyboard shortcut hint ─────────────────────────────────────────────────────

function KeyboardHint() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2 }}
      className="fixed bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/80 backdrop-blur-sm text-white rounded-full text-[10px] pointer-events-none z-10"
    >
      <Keyboard className="w-3 h-3 opacity-60" />
      <span className="opacity-60">⌘K ricerca · Esc chiudi</span>
    </motion.div>
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
}: LegalWorkspaceShellProps) {
  // Right panel state
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RightPanelTab>("article");
  const [selectedArticleRef, setSelectedArticleRef] = useState<string | null>(null);

  // Handle article chip click from any agent box
  const handleArticleClick = useCallback((ref: string) => {
    setSelectedArticleRef(ref);
    setActiveTab("article");
    setRightPanelOpen(true);
  }, []);

  // Handle search selection → go to article tab
  const handleArticleSelect = useCallback((ref: string) => {
    setSelectedArticleRef(ref);
    setActiveTab("article");
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K → open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setActiveTab("search");
        setRightPanelOpen(true);
      }
      // Esc → close right panel
      if (e.key === "Escape" && rightPanelOpen) {
        setRightPanelOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rightPanelOpen]);

  // Auto-open right panel with article tab when first article is clicked
  // Auto-open search panel when analysis starts
  useEffect(() => {
    if (completedPhases.length === 4 && result) {
      // All done — keep panel if open, don't force-open
    }
  }, [completedPhases, result]);

  const isAnalyzing = currentPhase !== null;
  const isDone = result !== null;

  return (
    <div className="flex flex-col h-screen bg-[#fafafa] overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-100 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          <span>Indietro</span>
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0 mx-4">
          <FileText className="w-4 h-4 text-accent flex-shrink-0" />
          <span className="font-medium text-sm text-gray-700 truncate">{fileName}</span>
          {documentType && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
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
                className="w-2 h-2 rounded-full"
                animate={{
                  backgroundColor:
                    status === "done" ? "#22c55e" :
                    status === "running" ? "#FF6B35" :
                    "#e5e7eb",
                  scale: status === "running" ? [1, 1.3, 1] : 1,
                }}
                transition={status === "running" ? { duration: 1, repeat: Infinity } : {}}
              />
            );
          })}
          {isDone && (
            <span className="text-[10px] text-green-500 font-medium ml-1">Completata</span>
          )}
          {isAnalyzing && (
            <span className="text-[10px] text-amber-500 font-medium ml-1">Analisi…</span>
          )}
        </div>

        {/* Open search shortcut */}
        <button
          onClick={() => { setActiveTab("search"); setRightPanelOpen(true); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-400 border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-600 transition-all"
        >
          <span>Cerca</span>
          <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘K</kbd>
        </button>
      </div>

      {/* ── Main content (2-panel) ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT: Agent pipeline + Results ── */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-2xl mx-auto px-5 py-6 space-y-4">
            {/* Agent boxes */}
            {AGENT_ORDER.map((agentId, i) => {
              const status = getAgentStatus(agentId, currentPhase, completedPhases);
              const agentData = phaseResults[agentId] as Record<string, unknown> | null || null;

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

            {/* Final evaluation — large, prominent, below all agents */}
            <AnimatePresence>
              {isDone && result && (
                <FinalEvaluationPanel
                  result={result}
                  sessionId={sessionId}
                  onArticleClick={handleArticleClick}
                />
              )}
            </AnimatePresence>

            {/* Bottom padding */}
            <div className="h-8" />
          </div>
        </div>

        {/* ── RIGHT: Context panel ── */}
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

      {/* Keyboard hint (fades in after 2s) */}
      {!rightPanelOpen && <KeyboardHint />}
    </div>
  );
}
