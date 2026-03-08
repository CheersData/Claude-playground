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
  agents: Record<string, { model: string; maxTokens: number; temperature: number; enabled?: boolean; chainPosition?: number }>;
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
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-all duration-150 text-left rounded-lg mx-1 ${
        active
          ? "bg-[var(--ops-surface)] text-[var(--ops-fg)] font-medium border-l-2 border-[var(--ops-accent)] shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
          : "text-[var(--ops-fg-muted)] hover:text-[var(--ops-fg)] hover:bg-[var(--ops-surface)]/50 border-l-2 border-transparent"
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[var(--ops-accent)]" : ""}`} />
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

  // Workspace state — persiste in localStorage
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ops_workspace") as Workspace) ?? "operations";
    }
    return "operations";
  });
  const [opsView, setOpsView] = useState<OpsView>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ops_view") as OpsView) ?? "overview";
    }
    return "overview";
  });
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ops_dept") ?? null;
    }
    return null;
  });
  const [tradeView, setTradeView] = useState<TradeView>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ops_trade_view") as TradeView) ?? "dashboard";
    }
    return "dashboard";
  });

  // ── Persist workspace state ──────────────────────────────────────────────
  useEffect(() => { localStorage.setItem("ops_workspace", workspace); }, [workspace]);
  useEffect(() => { localStorage.setItem("ops_view", opsView); }, [opsView]);
  useEffect(() => { localStorage.setItem("ops_dept", selectedDepartment ?? ""); }, [selectedDepartment]);
  useEffect(() => { localStorage.setItem("ops_trade_view", tradeView); }, [tradeView]);

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

  // ── Auto-refresh ogni 30s ──────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
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
      <div className="flex items-center justify-center min-h-screen bg-[var(--ops-bg)]">
        <form
          onSubmit={handleLogin}
          className="bg-[var(--ops-surface)] border border-[var(--ops-border-subtle)] rounded-2xl p-8 w-full max-w-sm space-y-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
        >
          <div>
            <h2 className="text-lg font-semibold text-[var(--ops-fg)] font-serif">Operations Center</h2>
            <p className="text-sm text-[var(--ops-fg-muted)] mt-1">Inserisci le credenziali per accedere.</p>
          </div>
          <input
            type="text"
            value={authInput}
            onChange={(e) => setAuthInput(e.target.value)}
            placeholder="Nome Cognome, Ruolo"
            className="w-full px-4 py-3 bg-[var(--ops-bg)] border border-[rgba(255,255,255,0.08)] rounded-lg text-sm text-[var(--ops-fg)] placeholder-[var(--ops-muted)] outline-none focus:border-[var(--ops-accent)] focus:ring-2 focus:ring-[rgba(255,107,53,0.25)] transition-all"
            autoFocus
          />
          {authError && <p className="text-xs text-[var(--ops-error)]">{authError}</p>}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-2.5 bg-[var(--ops-accent)] hover:bg-[#FF8557] active:bg-[#E85A24] text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-40 shadow-[0_2px_8px_rgba(255,107,53,0.25)]"
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
          <div className="px-4 pt-6 pb-2">
            <div className="text-[11px] font-semibold text-[var(--ops-muted)] uppercase tracking-wider">
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
        <div className="py-4 px-4 space-y-4">
          <div className="text-[11px] font-semibold text-[var(--ops-muted)] uppercase tracking-wider">
            Stato sistema
          </div>
          <div className="space-y-1">
            {[
              { label: "Console Live", desc: "Log API real-time", color: "bg-[var(--ops-teal)]" },
              { label: "Tier & Agenti", desc: "Modelli e catene", color: "bg-[var(--ops-accent)]" },
              { label: "Environment", desc: "API keys attive", color: "bg-[var(--ops-cyan)]" },
              { label: "Costi API", desc: "Spesa ultime 24h", color: "bg-[#FFC832]" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3 px-3 py-2.5 text-[13px] text-[var(--ops-fg-muted)] rounded-lg hover:bg-[var(--ops-surface)]/50 transition-colors">
                <span className={`w-2 h-2 rounded-full ${item.color} shrink-0 mt-1`} />
                <div>
                  <div className="text-[var(--ops-fg)] font-medium">{item.label}</div>
                  <div className="text-[11px] text-[var(--ops-muted)]">{item.desc}</div>
                </div>
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
            <div className="h-full overflow-y-auto p-6 space-y-6">
              {/* Error banner */}
              {fetchError && (
                <div className="flex items-center gap-3 bg-red-950/50 border border-red-800/50 rounded-xl px-5 py-4">
                  <span className="text-red-400 text-sm font-medium flex-1">{fetchError}</span>
                  <button
                    onClick={fetchData}
                    className="text-red-300 hover:text-white text-sm underline"
                  >
                    Riprova
                  </button>
                </div>
              )}

              {/* Live Activity — cosa sta succedendo ADESSO */}
              {data && (() => {
                const inProgressTasks = data.board.recent?.filter((t: TaskItem) => t.status === "in_progress") ?? [];
                const reviewTasks = data.board.reviewPending ?? [];
                const hasActivity = inProgressTasks.length > 0 || reviewTasks.length > 0;

                if (!hasActivity) return null;

                return (
                  <div className="rounded-xl border border-[rgba(255,199,50,0.2)] bg-[rgba(255,199,50,0.04)] p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FFC832] animate-pulse" />
                      <h2 className="text-sm font-semibold text-[#FFC832]">Attivita in corso</h2>
                    </div>

                    {inProgressTasks.length > 0 && (
                      <div className="space-y-2">
                        {inProgressTasks.map((task: TaskItem) => (
                          <button
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className="w-full text-left flex items-center gap-3 px-4 py-3 bg-[var(--ops-surface)] rounded-lg border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,199,50,0.3)] transition-all"
                          >
                            <span className="w-2 h-2 rounded-full bg-[#FFC832] animate-pulse shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-[var(--ops-fg)] font-medium truncate">{task.title}</div>
                              <div className="text-xs text-[var(--ops-fg-muted)] mt-0.5">{task.department}</div>
                            </div>
                            <span className="text-[11px] text-[var(--ops-muted)] font-mono shrink-0">{task.priority}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {reviewTasks.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs text-[var(--ops-fg-muted)] font-medium uppercase tracking-wider">Da approvare</div>
                        {reviewTasks.map((task: TaskItem) => (
                          <button
                            key={task.id}
                            onClick={() => setSelectedTask(task)}
                            className="w-full text-left flex items-center gap-3 px-4 py-3 bg-[var(--ops-surface)] rounded-lg border border-[rgba(167,139,250,0.15)] hover:border-[rgba(167,139,250,0.3)] transition-all"
                          >
                            <span className="w-2 h-2 rounded-full bg-[#A78BFA] shrink-0" />
                            <div className="text-sm text-[var(--ops-fg)] truncate flex-1">{task.title}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Summary: focus + decisions + manual notes */}
              <OverviewSummaryPanel />
              {/* Quick stats row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
    <div className="h-screen overflow-hidden flex flex-col bg-[var(--ops-bg)]">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="h-14 flex-none flex items-center gap-5 px-6 border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface)]">
        <span className="text-base font-bold text-[var(--ops-fg)] whitespace-nowrap mr-4 tracking-tight font-serif">Ops Center</span>

        {/* Workspace tabs */}
        <nav className="flex items-center gap-1.5 flex-1">
          {WORKSPACES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchWorkspace(id)}
              className={`flex items-center gap-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                workspace === id
                  ? "bg-[var(--ops-accent)] text-white shadow-[0_2px_12px_rgba(255,107,53,0.3)]"
                  : "text-[var(--ops-fg-muted)] hover:text-[var(--ops-fg)] hover:bg-[var(--ops-surface-2)]"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </nav>

        {/* System health + pulse indicator */}
        {data && (() => {
          const inProgress = data.board.byStatus?.in_progress ?? 0;
          const blocked = data.board.byStatus?.blocked ?? 0;
          const open = data.board.byStatus?.open ?? 0;
          const isHealthy = blocked === 0 && (data.costs?.fallbackRate ?? 0) < 0.5;
          const hasWarning = blocked > 0 || (data.costs?.fallbackRate ?? 0) >= 0.3;

          return (
            <div className="flex items-center gap-3 text-xs font-mono text-[var(--ops-fg-muted)]">
              {/* Health dot */}
              <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                hasWarning
                  ? "bg-[rgba(229,141,120,0.08)] border-[rgba(229,141,120,0.2)]"
                  : "bg-[rgba(93,228,199,0.08)] border-[rgba(93,228,199,0.15)]"
              }`}>
                <span className={`w-2 h-2 rounded-full ${isHealthy ? "bg-[var(--ops-teal)]" : "bg-[var(--ops-error)] animate-pulse"}`} />
                <span className={`text-xs font-medium ${isHealthy ? "text-[var(--ops-teal)]" : "text-[var(--ops-error)]"}`}>
                  {isHealthy ? "Sistema OK" : `${blocked} bloccati`}
                </span>
              </span>

              {inProgress > 0 && (
                <span className="flex items-center gap-2 px-3 py-1.5 bg-[rgba(255,199,50,0.1)] rounded-lg border border-[rgba(255,199,50,0.2)]">
                  <span className="w-2 h-2 rounded-full bg-[#FFC832] animate-pulse" />
                  <span className="text-xs font-medium text-[#FFC832]">{inProgress} in corso</span>
                </span>
              )}
              <span className="text-xs text-[var(--ops-fg-muted)]">{open} open</span>
              <span className="text-xs text-[var(--ops-teal)]">{data.board.byStatus?.done ?? 0} done</span>
            </div>
          );
        })()}

        {/* Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 h-8 bg-[var(--ops-surface-2)] hover:bg-[var(--ops-border)] rounded-lg text-xs text-[var(--ops-fg-muted)] transition-all duration-150 disabled:opacity-40 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {timeSinceRefresh()}
        </button>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sidebar */}
        <aside className="w-56 flex-none border-r border-[var(--ops-border-subtle)] bg-[var(--ops-bg)] overflow-y-auto">
          {renderSidebar()}
        </aside>

        {/* Main — overflow-hidden so each workspace manages its own scroll */}
        <main className="flex-1 overflow-hidden bg-[var(--ops-bg)]">
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
