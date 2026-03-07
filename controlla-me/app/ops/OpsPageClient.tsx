"use client";

/**
 * OpsPageClient — Operations Center con layout h-screen a 4 workspace.
 *
 * Layout fisso (non scrolla mai la pagina):
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  HEADER (48px) — logo + tab workspace + refresh              │
 *   ├────────────┬─────────────────────────────────────────────────┤
 *   │  SIDEBAR   │  MAIN PANEL                                     │
 *   │  (208px)   │  (flex-1, overflow gestito per workspace)        │
 *   │            │                                                 │
 *   └────────────┴─────────────────────────────────────────────────┘
 *
 * Workspace:
 *   Operations — task board, CME, Vision, Archivio, Reports, dipartimenti
 *   Debug      — 2-column DebugPanel + LiveConsolePanel
 *   Testing    — LegalQATestPanel a schermo intero
 *   Trading    — TradingDashboard / TradingSlopePanel
 */

import { useState, useEffect, useCallback, type ComponentType } from "react";
import {
  RefreshCw,
  LayoutDashboard,
  Terminal,
  Microscope,
  TrendingUp,
  Bot,
  Telescope,
  Archive,
  FileText,
  Activity,
  Scale,
  Zap,
} from "lucide-react";
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
import { DebugPanel } from "@/components/ops/DebugPanel";
import { OverviewSummaryPanel } from "@/components/ops/OverviewSummaryPanel";
import { TradingDashboard } from "@/components/ops/TradingDashboard";
import { TradingSlopePanel } from "@/components/ops/TradingSlopePanel";
import { DaemonControlPanel } from "@/components/ops/DaemonControlPanel";
import type { Department, Task } from "@/lib/company/types";

// ─── Types ───────────────────────────────────────────────────────────────────

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

type Workspace = "operations" | "debug" | "testing" | "trading";
type OpsView = "overview" | "cme" | "vision" | "archive" | "reports" | "daemon";
type TradeView = "dashboard" | "slope";

// ─── Sidebar nav item component ───────────────────────────────────────────────

function NavItem({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors text-left ${
        active
          ? "bg-zinc-800 text-white font-medium"
          : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OpsPageClient() {
  // Auth
  const [authed, setAuthed] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState("");

  // Data
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modals
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);

  // Workspace state
  const [workspace, setWorkspace] = useState<Workspace>("operations");
  const [opsView, setOpsView] = useState<OpsView>("overview");
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [tradeView, setTradeView] = useState<TradeView>("dashboard");

  // ── Auth ──────────────────────────────────────────────────────────────────

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

  // ── Data fetch ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/company/status", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 401) {
        // Token scaduto o invalido → forza re-login
        sessionStorage.removeItem("lexmea-token");
        setAuthed(false);
        setData(null);
      } else {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setFetchError(body.error ?? `Errore ${res.status}`);
      }
    } catch (err) {
      console.error("Failed to fetch ops data:", err);
      setFetchError("Errore di connessione al server");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const switchWorkspace = (ws: Workspace) => {
    setWorkspace(ws);
    setOpsView("overview");
    setSelectedDepartment(null);
  };

  const timeSinceRefresh = () => {
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (diff < 60) return `${diff}s fa`;
    return `${Math.floor(diff / 60)}m fa`;
  };

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950">
        <form
          onSubmit={handleLogin}
          className="bg-zinc-900 border border-zinc-700/50 rounded-xl p-8 w-full max-w-sm space-y-4"
        >
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

  // ── Sidebar content per workspace ─────────────────────────────────────────

  const renderSidebar = () => {
    if (workspace === "operations") {
      return (
        <div className="py-1">
          <NavItem
            label="Overview"
            icon={LayoutDashboard}
            active={opsView === "overview" && !selectedDepartment}
            onClick={() => { setOpsView("overview"); setSelectedDepartment(null); }}
          />
          <NavItem
            label="CME"
            icon={Bot}
            active={opsView === "cme" && !selectedDepartment}
            onClick={() => { setOpsView("cme"); setSelectedDepartment(null); }}
          />
          <NavItem
            label="Vision"
            icon={Telescope}
            active={opsView === "vision" && !selectedDepartment}
            onClick={() => { setOpsView("vision"); setSelectedDepartment(null); }}
          />
          <NavItem
            label="Archivio"
            icon={Archive}
            active={opsView === "archive" && !selectedDepartment}
            onClick={() => { setOpsView("archive"); setSelectedDepartment(null); }}
          />
          <NavItem
            label="Reports"
            icon={FileText}
            active={opsView === "reports" && !selectedDepartment}
            onClick={() => { setOpsView("reports"); setSelectedDepartment(null); }}
          />
          <NavItem
            label="Daemon"
            icon={Zap}
            active={opsView === "daemon" && !selectedDepartment}
            onClick={() => { setOpsView("daemon"); setSelectedDepartment(null); }}
          />

          {/* Department list */}
          <div className="px-3 pt-5 pb-1">
            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Dipartimenti
            </div>
          </div>
          <DepartmentList
            departments={data?.board.byDepartment ?? {}}
            onSelectTask={setSelectedTask}
            onSelectDepartment={setSelectedDepartment}
            selectedDepartment={selectedDepartment}
          />
        </div>
      );
    }

    if (workspace === "debug") {
      return (
        <div className="py-3 px-3 space-y-3">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            Pannelli
          </div>
          <div className="space-y-0.5">
            {["Console Live", "Tier & Agenti", "Environment", "Costi API"].map((item) => (
              <div key={item} className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-zinc-500 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (workspace === "testing") {
      return (
        <div className="py-1">
          <NavItem
            label="Legal Q&A"
            icon={Scale}
            active={true}
            onClick={() => {}}
          />
        </div>
      );
    }

    if (workspace === "trading") {
      return (
        <div className="py-1">
          <NavItem
            label="Dashboard"
            icon={LayoutDashboard}
            active={tradeView === "dashboard"}
            onClick={() => setTradeView("dashboard")}
          />
          <NavItem
            label="Slope Monitor"
            icon={Activity}
            active={tradeView === "slope"}
            onClick={() => setTradeView("slope")}
          />
        </div>
      );
    }

    return null;
  };

  // ── Main content per workspace ────────────────────────────────────────────

  const renderMain = () => {
    // ── Operations ──
    if (workspace === "operations") {
      // Department detail
      if (selectedDepartment) {
        return (
          <div className="h-full overflow-y-auto p-4">
            <DepartmentDetailPanel
              department={selectedDepartment as Department}
              onBack={() => setSelectedDepartment(null)}
              onSelectTask={(task: Task) => setSelectedTask(task as TaskItem)}
            />
          </div>
        );
      }

      switch (opsView) {
        case "cme":
          return (
            <div className="h-full overflow-y-auto p-4">
              <CMEChatPanel onBack={() => setOpsView("overview")} />
            </div>
          );
        case "vision":
          return (
            <div className="h-full overflow-y-auto p-4">
              <VisionMissionPanel />
            </div>
          );
        case "archive":
          return (
            <div className="h-full overflow-y-auto p-4">
              <ArchivePanel onBack={() => setOpsView("overview")} />
            </div>
          );
        case "reports":
          return (
            <div className="h-full overflow-y-auto p-4">
              <ReportsPanel onBack={() => setOpsView("overview")} />
            </div>
          );
        case "daemon":
          return (
            <div className="h-full overflow-y-auto p-4">
              <DaemonControlPanel />
            </div>
          );
        default: // overview
          return (
            <div className="h-full overflow-y-auto p-4 space-y-4">
              {/* Error banner */}
              {fetchError && (
                <div className="flex items-center gap-3 bg-red-950/50 border border-red-800/50 rounded-lg px-4 py-3">
                  <span className="text-red-400 text-xs font-medium flex-1">{fetchError}</span>
                  <button
                    onClick={fetchData}
                    className="text-red-300 hover:text-white text-xs underline"
                  >
                    Riprova
                  </button>
                </div>
              )}
              {/* Summary: focus + decisions + manual notes */}
              <OverviewSummaryPanel />
              {/* Quick stats row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <CostSummary costs={data?.costs ?? null} />
                <QAStatus board={data?.board ?? null} />
              </div>
              {/* Task board */}
              <TaskBoard
                board={data?.board ?? null}
                onSelectTask={setSelectedTask}
                onExpand={(status) => setExpandedStatus(status)}
              />
              {/* Health + Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AgentHealth agents={data?.agents ?? null} />
                <PipelineStatus pipeline={data?.pipeline ?? []} />
              </div>
            </div>
          );
      }
    }

    // ── Debug — DebugPanel manages its own height ──
    if (workspace === "debug") {
      return <DebugPanel />;
    }

    // ── Testing ──
    if (workspace === "testing") {
      return (
        <div className="h-full overflow-y-auto">
          <LegalQATestPanel />
        </div>
      );
    }

    // ── Trading ──
    if (workspace === "trading") {
      if (tradeView === "slope") {
        return (
          <div className="h-full overflow-y-auto p-4">
            <TradingSlopePanel />
          </div>
        );
      }
      return (
        <div className="h-full overflow-y-auto p-4">
          <TradingDashboard />
        </div>
      );
    }

    return null;
  };

  // ── Workspace tab definitions ─────────────────────────────────────────────

  const WORKSPACES: { id: Workspace; label: string; icon: ComponentType<{ className?: string }> }[] =
    [
      { id: "operations", label: "Operations", icon: LayoutDashboard },
      { id: "debug", label: "Debug", icon: Terminal },
      { id: "testing", label: "Testing", icon: Microscope },
      { id: "trading", label: "Trading", icon: TrendingUp },
    ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-zinc-950">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="h-12 flex-none flex items-center gap-3 px-4 border-b border-zinc-800 bg-zinc-900">
        <span className="text-sm font-bold text-white whitespace-nowrap mr-2">Ops Center</span>

        {/* Workspace tabs */}
        <nav className="flex items-center gap-0.5 flex-1">
          {WORKSPACES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchWorkspace(id)}
              className={`flex items-center gap-1.5 px-3 h-8 rounded text-xs font-medium transition-colors ${
                workspace === id
                  ? "bg-[#FF6B35] text-white"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 h-7 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-zinc-300 transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {timeSinceRefresh()}
        </button>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <aside className="w-52 flex-none border-r border-zinc-800 bg-zinc-900/40 overflow-y-auto">
          {renderSidebar()}
        </aside>

        {/* Main — overflow-hidden so each workspace manages its own scroll */}
        <main className="flex-1 overflow-hidden">
          {renderMain()}
        </main>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => {
            setSelectedTask(null);
            fetchData();
          }}
        />
      )}
      {expandedStatus && (
        <TaskBoardFullscreen
          initialStatus={expandedStatus}
          onClose={() => setExpandedStatus(null)}
        />
      )}
    </div>
  );
}
