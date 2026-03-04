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
} from "lucide-react";

import AgentBox, { type AgentId, type AgentStatus } from "@/components/workspace/AgentBox";
import FinalEvaluationPanel from "@/components/workspace/FinalEvaluationPanel";
import PaywallBanner from "@/components/PaywallBanner";
import AgentStatusBlock, { type BlockAgentId, type BlockStatus } from "@/components/legaloffice/AgentStatusBlock";
import LeaderChat, { type LeaderMessage } from "@/components/legaloffice/LeaderChat";
import ActionBar from "@/components/legaloffice/ActionBar";
import ActivityBanner from "@/components/legaloffice/ActivityBanner";
import type { AgentPhase, AdvisorResult } from "@/lib/types";

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
  view: AppView
): BlockStatus {
  if (agentId === "leader") {
    if (view === "analyzing") return "running";
    if (view === "results")   return "done";
    return "idle";
  }
  return getAgentStatus(agentId as AgentId, currentPhase, completedPhases) as BlockStatus;
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
  const [tier, setTier]                       = useState<TierName>("partner");
  const [documentType, setDocumentType]       = useState<string | undefined>(undefined);

  // ── Layout state ─────────────────────────────────────────────────────────────
  const [leftPanelTab, setLeftPanelTab]       = useState<"agents" | "corpus">("agents");

  // ── Leader chat state ─────────────────────────────────────────────────────────
  const [leaderMessages, setLeaderMessages]   = useState<LeaderMessage[]>([INITIAL_LEADER_MSG]);
  const [leaderLoading, setLeaderLoading]     = useState(false);
  const [pendingAgentContext, setPendingAgentContext] = useState<string | null>(null);

  const lastFileRef  = useRef<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Leader chat actions ───────────────────────────────────────────────────────

  const sendToLeader = useCallback(async (message: string) => {
    setLeaderLoading(true);
    setLeaderMessages(prev => [
      ...prev,
      { role: "user", content: message, timestamp: Date.now() },
    ]);

    try {
      const res = await fetch("/api/legaloffice/leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          sessionId,
          agentContext: pendingAgentContext,
          phaseResults,
        }),
      });
      const data = await res.json();
      setLeaderMessages(prev => [
        ...prev,
        { role: "leader", content: data.answer || "Nessuna risposta.", timestamp: Date.now() },
      ]);
      setPendingAgentContext(null);
    } catch {
      setLeaderMessages(prev => [
        ...prev,
        { role: "leader", content: "Errore di connessione. Riprova.", timestamp: Date.now() },
      ]);
    } finally {
      setLeaderLoading(false);
    }
  }, [sessionId, pendingAgentContext, phaseResults]);

  const handleAskAgent = useCallback((agentId: BlockAgentId) => {
    const agentName = agentId === "leader" ? "Leader" : AGENT_LABELS[agentId as AgentId] || agentId;
    const agentData = phaseResults[agentId];
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
  }, [phaseResults]);

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

  // ── Article click → apre corpus tab ──────────────────────────────────────────
  const handleArticleClick = useCallback((_ref: string) => {
    setLeftPanelTab("corpus");
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
        </div>
      </header>

      {/* ── BODY ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── LEFT PANEL ───────────────────────────────────────────────────── */}
        <aside
          className={`flex-none border-r border-gray-100 flex flex-col overflow-hidden bg-gray-50/40 transition-[width] duration-300 ease-in-out ${
            leftPanelTab === "corpus" ? "w-[480px]" : "w-72"
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
              status={getBlockStatus("leader", currentPhase, completedPhases, view)}
              data={null}
              onAskClick={handleAskAgent}
            />

            <div className="my-1 mx-2 h-px bg-gray-100" />

            {/* 4 pipeline agents */}
            {AGENT_ORDER.map(id => (
              <AgentStatusBlock
                key={id}
                agentId={id}
                status={getBlockStatus(id, currentPhase, completedPhases, view)}
                data={(phaseResults[id] as Record<string, unknown> | null) ?? null}
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
            />
          </div>
        </aside>

        {/* ── CENTER ────────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden flex flex-col bg-[#F8F9FA]">

          {/* Action bar */}
          <ActionBar
            onQA={handleQA}
            onUpload={handleUploadClick}
            onProduce={handleProduce}
            disabled={isAnalyzing}
          />

          {/* Activity banner */}
          <AnimatePresence>
            {currentPhase && (
              <ActivityBanner
                currentPhase={currentPhase}
                completedCount={completedPhases.length}
              />
            )}
          </AnimatePresence>

          {/* Main scroll area */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* Upload view */}
            {view === "upload" && (
              <div
                className={`h-full flex items-center justify-center p-8 transition-all duration-200 ${
                  dragOver ? "bg-indigo-50/30" : ""
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div className="text-center max-w-sm">
                  <div
                    className={`w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all ${
                      dragOver ? "bg-indigo-100" : "bg-gray-100"
                    }`}
                  >
                    {dragOver
                      ? <FileText className="w-7 h-7 text-indigo-500" />
                      : <Upload className="w-7 h-7 text-gray-400" />
                    }
                  </div>
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {dragOver ? "Rilascia per avviare l'analisi" : "Trascina il documento qui"}
                  </p>
                  <p className="text-xs text-gray-400 mb-5">
                    PDF · DOCX · TXT · max 20 MB
                  </p>
                  <button
                    onClick={handleUploadClick}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Carica documento
                  </button>

                  {error && (
                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs">
                      {error}
                    </div>
                  )}

                  {/* Trust signals */}
                  <div className="flex items-center justify-center gap-4 mt-6">
                    {[
                      { icon: <Globe className="w-3 h-3" />, text: "6.100+ articoli" },
                      { icon: <Scale className="w-3 h-3" />, text: "Parte debole tutelata" },
                      { icon: <BookOpen className="w-3 h-3" />, text: "Corpus IT + EU" },
                    ].map(item => (
                      <div key={item.text} className="flex items-center gap-1 text-gray-400 text-[10px]">
                        {item.icon}
                        {item.text}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Analyzing / Results */}
            {showWorkspace && (
              <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
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

                <div className="h-4" />
              </div>
            )}

            {/* Paywall */}
            {view === "paywall" && usage && (
              <div className="h-full flex items-center justify-center p-8">
                <PaywallBanner
                  analysesUsed={usage.analysesUsed}
                  analysesLimit={usage.analysesLimit}
                  authenticated={usage.authenticated}
                />
              </div>
            )}
          </div>

          {/* Leader chat — fixed bottom strip */}
          <LeaderChat
            messages={leaderMessages}
            loading={leaderLoading}
            prefilledHint={pendingAgentContext ? `Hai una domanda su questo agente?` : null}
            onSend={sendToLeader}
          />
        </main>
      </div>
    </div>
  );
}
