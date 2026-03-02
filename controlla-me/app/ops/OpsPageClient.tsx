"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";
import { TaskBoard } from "@/components/ops/TaskBoard";
import { TaskBoardFullscreen } from "@/components/ops/TaskBoardFullscreen";
import { CostSummary } from "@/components/ops/CostSummary";
import { AgentHealth } from "@/components/ops/AgentHealth";
import { DepartmentList } from "@/components/ops/DepartmentList";
import { QAStatus } from "@/components/ops/QAStatus";
import { PipelineStatus } from "@/components/ops/PipelineStatus";
import { TaskModal, type TaskItem } from "@/components/ops/TaskModal";
import { DepartmentDetailPanel } from "@/components/ops/DepartmentDetailPanel";
import { ReportsPanel } from "@/components/ops/ReportsPanel";
import { CMEChatPanel } from "@/components/ops/CMEChatPanel";
import { LegalQATestPanel } from "@/components/ops/LegalQATestPanel";
import { ArchivePanel } from "@/components/ops/ArchivePanel";
import { VisionMissionPanel } from "@/components/ops/VisionMissionPanel";
import type { Department, Task } from "@/lib/company/types";

interface OpsData {
  board: {
    total: number;
    byStatus: Record<string, number>;
    byDepartment: Record<string, { total: number; open: number; done: number }>;
    recent: TaskItem[];
    reviewPending?: TaskItem[];
  };
  costs: {
    total: number;
    calls: number;
    avgPerCall: number;
    byAgent: Record<string, { cost: number; calls: number }>;
    byProvider: Record<string, { cost: number; calls: number }>;
    fallbackRate: number;
  };
  pipeline: Array<{
    sourceId: string;
    lastSync: { completedAt: string | null; status: string; itemsFetched: number } | null;
    totalSyncs: number;
  }>;
  agents: Record<string, { model: string; maxTokens: number; temperature: number }>;
}

export default function OpsPageClient() {
  const [authed, setAuthed] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [showReports, setShowReports] = useState(false);
  const [showCME, setShowCME] = useState(false);
  const [showLegalQA, setShowLegalQA] = useState(false);
  const [showVision, setShowVision] = useState(false);
  const [showArchive, setShowArchive] = useState(false);

  // Check existing token on mount
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("lexmea-token")) {
      setAuthed(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/console/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: authInput }),
      });
      const json = await res.json();
      if (json.authorized && json.token) {
        sessionStorage.setItem("lexmea-token", json.token);
        setAuthed(true);
      } else {
        setAuthError(json.message ?? "Accesso negato");
      }
    } catch {
      setAuthError("Errore di connessione");
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/status", {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch ops data:", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  const timeSinceRefresh = () => {
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    return `${Math.floor(diff / 60)}m ago`;
  };

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-8 w-full max-w-sm space-y-4">
          <h2 className="text-lg font-semibold text-white">Operations Center</h2>
          <p className="text-sm text-zinc-400">Inserisci le credenziali per accedere.</p>
          <input
            type="text"
            value={authInput}
            onChange={(e) => setAuthInput(e.target.value)}
            placeholder="Nome Cognome, Ruolo"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 outline-none focus:border-[#FF6B35] transition-colors"
            autoFocus
          />
          {authError && <p className="text-xs text-red-400">{authError}</p>}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-2 bg-[#FF6B35] hover:bg-[#FF6B35]/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            Accedi
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Operations Center
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Controlla.me — Virtual Company Dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowCME(true); setShowReports(false); setShowLegalQA(false); setShowVision(false); setShowArchive(false); setSelectedDepartment(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${showCME ? "bg-[#FF6B35] text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            <span className="w-2 h-2 rounded-full bg-current opacity-80" />
            CME
          </button>
          <button
            onClick={() => { setShowVision(true); setShowCME(false); setShowReports(false); setShowLegalQA(false); setShowArchive(false); setSelectedDepartment(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${showVision ? "bg-[#FF6B35]/80 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            🎯 Vision
          </button>
          <button
            onClick={() => { setSelectedDepartment("trading"); setShowCME(false); setShowReports(false); setShowLegalQA(false); setShowVision(false); setShowArchive(false); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${selectedDepartment === "trading" ? "bg-zinc-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            📈 Trading
          </button>
          <button
            onClick={() => { setShowLegalQA(true); setShowReports(false); setShowCME(false); setShowVision(false); setShowArchive(false); setSelectedDepartment(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${showLegalQA ? "bg-purple-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            ⚖️ Legal Q&A
          </button>
          <button
            onClick={() => { setShowArchive(true); setShowReports(false); setShowCME(false); setShowVision(false); setShowLegalQA(false); setSelectedDepartment(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${showArchive ? "bg-zinc-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            📦 Archivio
          </button>
          <button
            onClick={() => { setShowReports(true); setShowCME(false); setShowLegalQA(false); setShowVision(false); setShowArchive(false); setSelectedDepartment(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${showReports ? "bg-zinc-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"}`}
          >
            Reports
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {timeSinceRefresh()}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left sidebar */}
        <div className="lg:col-span-1 space-y-6">
          <DepartmentList
            departments={data?.board.byDepartment ?? {}}
            onSelectTask={setSelectedTask}
            onSelectDepartment={setSelectedDepartment}
            selectedDepartment={selectedDepartment}
          />
          <CostSummary costs={data?.costs ?? null} />
          <QAStatus board={data?.board ?? null} />
        </div>

        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {selectedDepartment ? (
            <DepartmentDetailPanel
              department={selectedDepartment as Department}
              onBack={() => setSelectedDepartment(null)}
              onSelectTask={(task: Task) => setSelectedTask(task as TaskItem)}
            />
          ) : showCME ? (
            <CMEChatPanel onBack={() => setShowCME(false)} />
          ) : showVision ? (
            <VisionMissionPanel />
          ) : showArchive ? (
            <ArchivePanel onBack={() => setShowArchive(false)} />
          ) : showLegalQA ? (
            <LegalQATestPanel />
          ) : showReports ? (
            <ReportsPanel onBack={() => setShowReports(false)} />
          ) : (
            <>
              <TaskBoard
                board={data?.board ?? null}
                onSelectTask={setSelectedTask}
                onExpand={(status) => setExpandedStatus(status)}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <AgentHealth agents={data?.agents ?? null} />
                <PipelineStatus pipeline={data?.pipeline ?? []} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); fetchData(); }}
        />
      )}

      {/* Task board fullscreen */}
      {expandedStatus && (
        <TaskBoardFullscreen
          initialStatus={expandedStatus}
          onClose={() => setExpandedStatus(null)}
        />
      )}
    </div>
  );
}
