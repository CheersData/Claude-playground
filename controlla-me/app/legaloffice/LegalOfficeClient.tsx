"use client";

/**
 * LegalOfficeClient — Console professionale /legaloffice.
 *
 * Layout h-screen (stile /ops e /console):
 *
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  HEADER (h-12) — logo | tier tabs | nuova analisi               │
 *  ├──────────────────┬───────────────────────────────────────────────┤
 *  │  LEFT PANEL      │  CENTER                                       │
 *  │  w-72 / w-[480]  │  ActionBar | ActivityBanner | scroll | chat   │
 *  │                  │                                               │
 *  │  [Agenti][Corpus]│                                               │
 *  │  • Leader        │  ← solo spazio chat con leader + risultati    │
 *  │  • Classificatore│                                               │
 *  │  • Analista      │                                               │
 *  │  • Investigatore │                                               │
 *  │  • Consulente    │                                               │
 *  └──────────────────┴───────────────────────────────────────────────┘
 */

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scale,
  FileText,
  Upload,
  Globe,
  BookOpen,
  Plus,
  MessageSquare,
  Terminal,
} from "lucide-react";

import AgentBox, { type AgentId, type AgentStatus } from "@/components/workspace/AgentBox";
import FinalEvaluationPanel from "@/components/workspace/FinalEvaluationPanel";
import PaywallBanner from "@/components/PaywallBanner";
import AgentStatusBlock, { type BlockAgentId, type BlockStatus } from "@/components/legaloffice/AgentStatusBlock";
import LeaderChat, { type LeaderMessage } from "@/components/legaloffice/LeaderChat";
import ActionBar from "@/components/legaloffice/ActionBar";
import ActivityBanner from "@/components/legaloffice/ActivityBanner";
import ShellPanel from "@/components/legaloffice/ShellPanel";
import type { AgentPhase, LegalOfficePhase, AdvisorResult } from "@/lib/types";

// CorpusTreePanel usa sessionStorage — SSR off
const CorpusTreePanel = dynamic(
  () => import("@/components/console/CorpusTreePanel"),
  { ssr: false }
);

// ── Types ──────────────────────────────────────────────────────────────────────

export type TierName = "intern" | "associate" | "partner";

type AppView = "upload" | "analyzing" | "results" | "paywall";

interface UsageInfo {
  authenticated: boolean;
  plan: "free" | "pro";
  analysesUsed: number;
  analysesLimit: number;
  canAnalyze: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

// All 6 unified sidebar phases: Q&A activates comprensione+corpus-search+advisor,
// document pipeline activates classifier+analyzer+investigator+advisor.
// Dynamic filtering hides inactive agents.
const SIDEBAR_ORDER: BlockAgentId[] = ["comprensione", "classifier", "analyzer", "corpus-search", "investigator", "advisor"];

// Agents activated by each pipeline mode
const QA_AGENTS: BlockAgentId[] = ["comprensione", "corpus-search", "advisor"];
const DOC_AGENTS: BlockAgentId[] = ["classifier", "analyzer", "investigator", "advisor"];

// Legacy 4-agent order for document pipeline content area
const AGENT_ORDER: AgentId[] = ["classifier", "analyzer", "investigator", "advisor"];

const AGENT_LABELS: Record<AgentId, string> = {
  classifier:   "Classificatore",
  analyzer:     "Analista",
  investigator: "Investigatore",
  advisor:      "Consulente",
};

const TIER_BADGE: Record<TierName, string> = {
  intern:    "bg-gray-100 text-gray-600 border-gray-200",
  associate: "bg-blue-50 text-blue-600 border-blue-200",
  partner:   "bg-violet-50 text-violet-700 border-violet-200",
};

const INITIAL_LEADER_MSG: LeaderMessage = {
  role: "leader",
  content: "Benvenuto. Carica un documento per avviare l'analisi, oppure fai una domanda sulla legislazione italiana.",
  timestamp: Date.now(),
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAgentStatus(
  agentId: AgentId,
  currentPhase: AgentPhase | null,
  completedPhases: AgentPhase[]
): AgentStatus {
  if (completedPhases.includes(agentId as AgentPhase)) return "done";
  if (currentPhase === agentId) return "running";
  return "idle";
}

function getBlockStatus(
  agentId: BlockAgentId,
  currentPhase: AgentPhase | null,
  completedPhases: AgentPhase[],
  view: AppView,
  qaPhase: LegalOfficePhase | null = null,
  qaCompletedPhases: LegalOfficePhase[] = [],
  isQaMode: boolean = false
): BlockStatus {
  if (agentId === "leader") {
    if (view === "analyzing" || isQaMode) return "running";
    if (view === "results" || qaCompletedPhases.length > 0 || completedPhases.length > 0) return "done";
    return "idle";
  }

  const phase = agentId as LegalOfficePhase;

  // Durante Q&A attivo: priorità allo stato QA
  if (isQaMode) {
    if (qaCompletedPhases.includes(phase)) return "done";
    if (qaPhase === phase) return "running";
    // Mantieni "done" se il pipeline documento aveva già completato questo agente
    if (completedPhases.includes(agentId as AgentPhase)) return "done";
    return "idle";
  }

  // Dopo Q&A completato (isQaMode=false ma qaCompletedPhases ha elementi)
  if (qaCompletedPhases.includes(phase)) return "done";

  // Default: stato pipeline documento (solo i 4 agenti classici si attivano)
  if (completedPhases.includes(agentId as AgentPhase)) return "done";
  if (currentPhase === (agentId as AgentPhase)) return "running";
  return "idle";
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function LegalOfficeClient() {

  // ── Pipeline state ──────────────────────────────────────────────────────────
  const [view, setView]                       = useState<AppView>("upload");
  const [fileName, setFileName]               = useState("");
  const [currentPhase, setCurrentPhase]       = useState<AgentPhase | null>(null);
  const [completedPhases, setCompletedPhases] = useState<AgentPhase[]>([]);
  const [result, setResult]                   = useState<AdvisorResult | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [sessionId, setSessionId]             = useState<string | null>(null);
  const [dragOver, setDragOver]               = useState(false);
  const [usage, setUsage]                     = useState<UsageInfo | null>(null);
  const [contextPrompt, setContextPrompt]     = useState("");
  const [phaseResults, setPhaseResults]       = useState<Record<string, unknown>>({});
  const [tier, setTier]                       = useState<TierName>("intern");
  const [documentType, setDocumentType]       = useState<string | undefined>(undefined);

  // ── Layout state ─────────────────────────────────────────────────────────────
  const [leftPanelTab, setLeftPanelTab]       = useState<"agents" | "corpus">("agents");
  const [shellPanelOpen, setShellPanelOpen]   = useState(false);

  // ── Leader chat state ─────────────────────────────────────────────────────────
  const [leaderMessages, setLeaderMessages]   = useState<LeaderMessage[]>([INITIAL_LEADER_MSG]);
  const [leaderLoading, setLeaderLoading]     = useState(false);
  const [pendingAgentContext, setPendingAgentContext] = useState<string | null>(null);

  // ── Q&A orchestration state (LegalOfficePhase includes corpus agent phases) ──
  const [qaPhase, setQaPhase]                       = useState<LegalOfficePhase | null>(null);
  const [qaCompletedPhases, setQaCompletedPhases]   = useState<LegalOfficePhase[]>([]);
  const [qaResults, setQaResults]                   = useState<Record<string, unknown>>({});
  const [isQaMode, setIsQaMode]                     = useState(false);

  // ── Corpus navigation state ──────────────────────────────────────────────────
  const [focusArticleId, setFocusArticleId] = useState<string | null>(null);

  const lastFileRef  = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Leader chat actions ───────────────────────────────────────────────────────

  const sendToLeader = useCallback(async (message: string) => {
    setLeaderLoading(true);
    setIsQaMode(true);
    setQaPhase(null);
    setQaCompletedPhases([]);
    setLeaderMessages(prev => [
      ...prev,
      { role: "user", content: message, timestamp: Date.now() },
    ]);

    // Includi contesto agente evocato come parte del messaggio se presente
    const fullMessage = pendingAgentContext
      ? `${message}\n\n[Contesto agente: ${pendingAgentContext}]`
      : message;
    setPendingAgentContext(null);

    let response: Response;
    try {
      // Includi gli ultimi scambi come contesto conversazione (max 6 messaggi = 3 exchanges)
      const conversationHistory = leaderMessages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      response = await fetch("/api/legaloffice/orchestrator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: fullMessage,
          sessionId,
          phaseResults,
          tier,
          conversationHistory,
        }),
      });
    } catch {
      setLeaderMessages(prev => [
        ...prev,
        { role: "leader", content: "Errore di connessione. Riprova.", timestamp: Date.now() },
      ]);
      setLeaderLoading(false);
      setIsQaMode(false);
      return;
    }

    if (!response.ok || !response.body) {
      setLeaderMessages(prev => [
        ...prev,
        { role: "leader", content: "Errore del server. Riprova.", timestamp: Date.now() },
      ]);
      setLeaderLoading(false);
      setIsQaMode(false);
      return;
    }

    // Consuma lo stream SSE — stesso pattern di startAnalysis()
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    const processBuffer = () => {
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const block of events) {
        const lines = block.trim().split("\n");
        let eventType = "message";
        let dataStr   = "";
        for (const line of lines) {
          if (line.startsWith("event:"))     eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) dataStr   = line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (eventType === "agent") {
            if (data.status === "running") {
              setQaPhase(data.phase as LegalOfficePhase);
            } else if (data.status === "done") {
              setQaPhase(null);
              setQaCompletedPhases(p => [...p, data.phase as LegalOfficePhase]);
              if (data.output) {
                setQaResults(prev => ({ ...prev, [data.phase]: data.output }));
              }
            }
          } else if (eventType === "complete") {
            // Estrai dati corpus strutturati per rendering ricco
            const corpusData = data.agentOutputs?.corpusResult ?? null;
            setLeaderMessages(prev => [
              ...prev,
              {
                role: "leader",
                content: data.leaderAnswer || "Analisi completata.",
                timestamp: Date.now(),
                corpusData: corpusData || undefined,
              },
            ]);
            setQaPhase(null);
            setIsQaMode(false);
            setLeaderLoading(false);
          } else if (eventType === "error") {
            setLeaderMessages(prev => [
              ...prev,
              {
                role: "leader",
                content: "Si è verificato un errore. Riprova.",
                timestamp: Date.now(),
              },
            ]);
            setQaPhase(null);
            setIsQaMode(false);
            setLeaderLoading(false);
          }
        } catch { /* ignore JSON parse errors */ }
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }
    } catch {
      setLeaderMessages(prev => [
        ...prev,
        { role: "leader", content: "Connessione interrotta. Riprova.", timestamp: Date.now() },
      ]);
    } finally {
      setQaPhase(null);
      setIsQaMode(false);
      setLeaderLoading(false);
    }
  }, [sessionId, pendingAgentContext, phaseResults, tier]);

  const BLOCK_LABELS: Record<BlockAgentId, string> = {
    leader: "Leader",
    comprensione: "Comprensione",
    classifier: "Classificatore",
    analyzer: "Analista",
    "corpus-search": "Ricerca Corpus",
    investigator: "Investigatore",
    advisor: "Consulente",
  };

  const handleAskAgent = useCallback((agentId: BlockAgentId) => {
    const agentName = BLOCK_LABELS[agentId] || agentId;
    const agentData = qaResults[agentId] ?? phaseResults[agentId];
    const context = agentData
      ? `Agente evocato: ${agentName}\nOutput: ${JSON.stringify(agentData).slice(0, 500)}`
      : null;
    setPendingAgentContext(context);
    setLeaderMessages(prev => [
      ...prev,
      {
        role: "leader",
        content: `Certo, hai una domanda su ${agentName}? Dimmi pure.`,
        timestamp: Date.now(),
      },
    ]);
  }, [qaResults, phaseResults]);

  const handleQA = useCallback(() => {
    setLeaderMessages(prev => [
      ...prev,
      {
        role: "leader",
        content: "Fai pure la tua domanda sul contratto o sulla normativa.",
        timestamp: Date.now(),
      },
    ]);
  }, []);

  const handleProduce = useCallback(() => {
    setLeaderMessages(prev => [
      ...prev,
      {
        role: "leader",
        content: "Produzione documento — funzionalità in lavorazione. Sarà disponibile a breve.",
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // ── Article click → apre corpus tab e naviga all'articolo ───────────────────
  const handleArticleClick = useCallback((articleId: string) => {
    setLeftPanelTab("corpus");
    setFocusArticleId(articleId);
  }, []);

  // ── Pipeline ──────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setView("upload");
    setFileName("");
    setCurrentPhase(null);
    setCompletedPhases([]);
    setResult(null);
    setError(null);
    setSessionId(null);
    setPhaseResults({});
    setDocumentType(undefined);
    setLeaderMessages([INITIAL_LEADER_MSG]);
    setPendingAgentContext(null);
    // Reset stato Q&A
    setQaPhase(null);
    setQaCompletedPhases([]);
    setQaResults({});
    setIsQaMode(false);
    setFocusArticleId(null);
  }, []);

  const startAnalysis = useCallback(
    async (file: File, resumeId?: string) => {
      setFileName(file.name);
      setView("analyzing");
      setCurrentPhase(null);
      setCompletedPhases([]);
      setError(null);
      setPhaseResults({});
      lastFileRef.current = file;

      // Notifica leader
      setLeaderMessages(prev => [
        ...prev,
        { role: "leader", content: `Avvio l'analisi di "${file.name}". Segui il progresso nel pannello agenti.`, timestamp: Date.now() },
      ]);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("tier", tier);
      if (resumeId)      formData.append("sessionId", resumeId);
      if (contextPrompt) formData.append("context", contextPrompt);

      let response: Response;
      try {
        response = await fetch("/api/analyze", { method: "POST", body: formData });
      } catch {
        setError("Errore di connessione. Riprova.");
        setView("upload");
        return;
      }

      if (!response.ok || !response.body) {
        setError("Errore durante l'analisi. Riprova.");
        setView("upload");
        return;
      }

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      const processBuffer = () => {
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const block of events) {
          const lines = block.trim().split("\n");
          let eventType = "message";
          let dataStr   = "";
          for (const line of lines) {
            if (line.startsWith("event:"))     eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) dataStr   = line.slice(5).trim();
          }
          if (!dataStr) continue;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "session") {
              setSessionId(data.sessionId);
            } else if (eventType === "progress") {
              if (data.status === "running") {
                setCurrentPhase(data.phase);
              } else if (data.status === "done") {
                setCompletedPhases(p => [...p, data.phase]);
                if (data.data) {
                  setPhaseResults(prev => ({ ...prev, [data.phase]: data.data }));
                  if (data.phase === "classifier" && (data.data as Record<string, unknown>)?.documentType) {
                    setDocumentType((data.data as Record<string, unknown>).documentType as string);
                  }
                }
              }
            } else if (eventType === "complete") {
              setResult(data.advice || data);
              setCurrentPhase(null);
              setView("results");
              // Leader annuncia il completamento
              setLeaderMessages(prev => [
                ...prev,
                { role: "leader", content: "Analisi completata. Puoi leggere il dettaglio nel pannello centrale o farmi domande.", timestamp: Date.now() },
              ]);
            } else if (eventType === "error") {
              if (data.code === "LIMIT_REACHED") {
                fetch("/api/user/usage").then(r => r.json()).then(setUsage).catch(() => {});
                setView("paywall");
              } else {
                setError(data.error || "Errore durante l'analisi");
              }
            }
          } catch { /* ignore */ }
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          processBuffer();
        }
      } catch {
        setError("Connessione interrotta. Riprova.");
        setView("upload");
      }
    },
    [contextPrompt, tier]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) startAnalysis(file);
    },
    [startAnalysis]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) startAnalysis(file);
      // reset input value so same file can be re-selected
      e.target.value = "";
    },
    [startAnalysis]
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleTierChange = useCallback((newTier: TierName) => {
    setTier(newTier);
  }, []);

  // Escape key closes corpus panel back to agents
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && leftPanelTab === "corpus") {
        setLeftPanelTab("agents");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [leftPanelTab]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const isDone        = result !== null;
  const isAnalyzing   = view === "analyzing";
  const showWorkspace = view === "analyzing" || view === "results";

  // Dynamic sidebar: only show agents relevant to the current pipeline mode
  const hasQaActivity  = isQaMode || qaCompletedPhases.length > 0;
  const hasDocActivity = view === "analyzing" || view === "results";
  const visibleAgents: BlockAgentId[] = (() => {
    if (!hasQaActivity && !hasDocActivity) return SIDEBAR_ORDER;
    const visible = new Set<BlockAgentId>();
    if (hasQaActivity)  QA_AGENTS.forEach(a => visible.add(a));
    if (hasDocActivity) DOC_AGENTS.forEach(a => visible.add(a));
    return SIDEBAR_ORDER.filter(id => visible.has(id));
  })();

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-white font-sans">

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.txt"
        onChange={handleFileChange}
      />

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <header className="h-12 flex-none flex items-center justify-between px-4 border-b border-gray-100 bg-white gap-3">

        {/* Brand */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Scale className="w-4 h-4 text-gray-700" />
          <span className="text-sm font-semibold text-gray-900">Legal Workspace</span>
          {fileName && (
            <span className="text-xs text-gray-400 ml-1 hidden md:block truncate max-w-40">
              — {fileName}
            </span>
          )}
        </div>

        {/* Tier tabs */}
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
          {(["intern", "associate", "partner"] as TierName[]).map(t => {
            const active = tier === t;
            const badge = TIER_BADGE[t];
            return (
              <button
                key={t}
                onClick={() => handleTierChange(t)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                  active
                    ? `bg-white shadow-sm border ${badge}`
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            );
          })}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAnalyzing && !isDone && (
            <span className="text-[10px] text-amber-500 font-medium">Analisi in corso…</span>
          )}
          {isDone && (
            <span className="text-[10px] text-green-500 font-medium">Completata</span>
          )}
          {showWorkspace && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 h-7 bg-gray-100 hover:bg-gray-200 rounded text-xs text-gray-600 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Nuova
            </button>
          )}
          {/* Shell button — comandi di sistema */}
          <button
            onClick={() => setShellPanelOpen(true)}
            className="flex items-center gap-1.5 px-2.5 h-7 bg-gray-900 hover:bg-gray-700 rounded text-xs text-white transition-colors"
            title="Shell Commands"
          >
            <Terminal className="w-3 h-3" />
            <span className="hidden sm:inline">Shell</span>
          </button>
        </div>
      </header>

      {/* ── SHELL PANEL ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {shellPanelOpen && (
          <ShellPanel open={shellPanelOpen} onClose={() => setShellPanelOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
        <aside
          className={`border-r border-gray-100 flex flex-col overflow-hidden bg-gray-50/40 transition-all duration-300 ease-in-out ${
            leftPanelTab === "corpus" ? "flex-[7]" : "flex-none w-72"
          }`}
        >
          {/* Tab switcher */}
          <div className="flex-shrink-0 flex border-b border-gray-100 bg-white">
            {(["agents", "corpus"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setLeftPanelTab(tab)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  leftPanelTab === tab
                    ? "text-gray-900 border-b-2 border-gray-900"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                {tab === "agents" ? "Agenti" : "Corpus"}
              </button>
            ))}
          </div>

          {/* Agents tab */}
          <div
            className={`flex-1 min-h-0 overflow-y-auto py-2 px-2 space-y-0.5 ${
              leftPanelTab === "agents" ? "block" : "hidden"
            }`}
          >
            {/* Leader */}
            <AgentStatusBlock
              agentId="leader"
              status={getBlockStatus("leader", currentPhase, completedPhases, view, qaPhase, qaCompletedPhases, isQaMode)}
              data={null}
              onAskClick={handleAskAgent}
            />

            <div className="my-1 mx-2 h-px bg-gray-100" />

            {/* Dynamic pipeline phases — solo agenti attivi nel mode corrente */}
            {visibleAgents.map(id => (
              <AgentStatusBlock
                key={id}
                agentId={id}
                status={getBlockStatus(id, currentPhase, completedPhases, view, qaPhase, qaCompletedPhases, isQaMode)}
                data={((qaResults[id] ?? phaseResults[id]) as Record<string, unknown> | null) ?? null}
                onAskClick={handleAskAgent}
              />
            ))}

            {/* Context textarea — solo in upload */}
            {view === "upload" && (
              <div className="mt-4 mx-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-300 mb-1.5 px-2">
                  Contesto opzionale
                </p>
                <div className="relative">
                  <MessageSquare className="absolute left-2.5 top-2.5 w-3 h-3 text-gray-300" />
                  <textarea
                    value={contextPrompt}
                    onChange={e => setContextPrompt(e.target.value)}
                    placeholder='Es. "Sono il conduttore"'
                    className="w-full bg-white border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-xs text-gray-700 placeholder-gray-300 resize-none focus:outline-none focus:border-gray-400 transition-colors"
                    rows={2}
                    maxLength={500}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Corpus tab — sempre montato, solo nascosto */}
          <div
            className={`flex-1 min-h-0 overflow-hidden ${
              leftPanelTab === "corpus" ? "flex flex-col" : "hidden"
            }`}
          >
            <CorpusTreePanel
              open={true}
              onClose={() => setLeftPanelTab("agents")}
              focusArticleId={focusArticleId}
            />
          </div>
        </aside>

        {/* ── CENTER ────────────────────────────────────────────────────────── */}
        <main className={`overflow-hidden flex flex-col bg-[#F8F9FA] ${leftPanelTab === "corpus" ? "flex-[3] min-w-[280px]" : "flex-1"}`}>

          {/* Action bar */}
          <ActionBar
            onQA={handleQA}
            onUpload={handleUploadClick}
            onProduce={handleProduce}
            disabled={isAnalyzing}
          />

          {/* Activity banner — doc pipeline o Q&A orchestrator */}
          <AnimatePresence>
            {(currentPhase || qaPhase) && (
              <ActivityBanner
                currentPhase={qaPhase ?? currentPhase}
                completedPhases={isQaMode ? qaCompletedPhases : completedPhases}
                qaMode={isQaMode}
                visiblePhases={visibleAgents.filter((id): id is LegalOfficePhase => id !== "leader")}
              />
            )}
          </AnimatePresence>

          {/* Leader chat — componente principale, occupa la maggior parte dello spazio */}
          <LeaderChat
            messages={leaderMessages}
            loading={leaderLoading}
            prefilledHint={pendingAgentContext ? `Hai una domanda su questo agente?` : null}
            onSend={sendToLeader}
            onArticleClick={handleArticleClick}
            className="flex-1 min-h-0"
          />

          {/* Content area — compatta, sotto la chat */}
          <div
            className={`flex-none h-56 overflow-y-auto border-t border-gray-200 transition-all duration-200 ${
              dragOver ? "bg-indigo-50/30" : "bg-white"
            }`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >

            {/* Upload view — compatta */}
            {view === "upload" && (
              <div className="flex items-center gap-4 px-6 py-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${
                    dragOver ? "bg-indigo-100" : "bg-gray-100"
                  }`}
                >
                  {dragOver
                    ? <FileText className="w-5 h-5 text-indigo-500" />
                    : <Upload className="w-5 h-5 text-gray-400" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700">
                    {dragOver ? "Rilascia per avviare l'analisi" : "Trascina il documento qui oppure"}
                  </p>
                  <p className="text-[10px] text-gray-400">PDF · DOCX · TXT · max 20 MB</p>
                  {error && (
                    <p className="text-[10px] text-red-500 mt-1">{error}</p>
                  )}
                </div>
                <button
                  onClick={handleUploadClick}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-700 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Carica
                </button>
              </div>
            )}

            {/* Analyzing / Results — scrollabile nella zona compatta */}
            {showWorkspace && (
              <div className="px-4 py-3 space-y-3">
                {AGENT_ORDER.map((agentId, i) => {
                  const status    = getAgentStatus(agentId, currentPhase, completedPhases);
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

                <div className="h-2" />
              </div>
            )}

            {/* Paywall */}
            {view === "paywall" && usage && (
              <div className="flex items-center justify-center p-6">
                <PaywallBanner
                  analysesUsed={usage.analysesUsed}
                  analysesLimit={usage.analysesLimit}
                  authenticated={usage.authenticated}
                />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
