"use client";

/**
 * OpsPageClient v2 — Redesign basato su Brand Book v3 + Customer Journey
 *
 * Principi:
 *   1. 3-Second Rule: stato sistema comprensibile in 3 secondi
 *   2. Information Comes to You: activity feed cronologico
 *   3. Single Command Point: command bar sempre visibile
 *   4. Drill-Down Not Navigate: pannello laterale contestuale
 *   5. Palette Poimandres: zero deviazioni
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  HEADER — title + health pill + view icons + actions + stats │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  MAIN (scrollable)              │  DRILL PANEL (optional)    │
 *   │  Activity + Stats + TaskBoard   │  Dept / CME / Reports      │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  COMMAND BAR — always visible                                │
 *   └──────────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useMemo, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  LayoutDashboard,
  Terminal,
  Microscope,
  TrendingUp,
  Bot,
  FileText,
  Zap,
  X,
  Telescope,
  Archive,
  Activity,
  ChevronRight,
  AlertCircle,
  Maximize2,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ── Existing components ─────────────────────────────────────────────────────

import { TaskBoard } from "@/components/ops/TaskBoard";
import { TaskBoardFullscreen } from "@/components/ops/TaskBoardFullscreen";
import { CostSummary } from "@/components/ops/CostSummary";
import { AgentHealth } from "@/components/ops/AgentHealth";
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

// ── New components ──────────────────────────────────────────────────────────

import { ActivityFeed } from "@/components/ops/ActivityFeed";
import { CommandBar } from "@/components/ops/CommandBar";

// ─── Types ──────────────────────────────────────────────────────────────────

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
  agents: Record<
    string,
    { model: string; maxTokens: number; temperature: number; enabled?: boolean; chainPosition?: number }
  >;
}

type ActiveView = "dashboard" | "trading" | "testing" | "debug";
type DrillType = "department" | "cme" | "reports" | "vision" | "archive" | "daemon";
type TradeView = "dashboard" | "slope";

interface DrillState {
  type: DrillType;
  id?: string;
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function IconButton({
  icon: Icon,
  active,
  onClick,
  label,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
  label: string;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative flex items-center gap-2 px-3 h-8 rounded-lg text-[12px] font-medium
        transition-all duration-150 ${
          active
            ? accent
              ? "bg-[var(--ops-accent)] text-white shadow-[0_2px_8px_rgba(255,107,53,0.25)]"
              : "bg-[var(--ops-surface-2)] text-[var(--ops-fg)] border border-[rgba(255,255,255,0.08)]"
            : "text-[var(--ops-fg-muted)] hover:text-[var(--ops-fg)] hover:bg-[var(--ops-surface-2)]"
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-[var(--ops-muted)] uppercase tracking-wider">
      {children}
    </h2>
  );
}

function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Espandi a tutto schermo"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg
        bg-[var(--ops-surface-2)] border border-[var(--ops-border-subtle)]
        text-[var(--ops-fg-muted)] hover:text-[var(--ops-fg)]
        hover:border-[var(--ops-border)] hover:bg-[var(--ops-border)]
        transition-all duration-150"
    >
      <Maximize2 className="w-3.5 h-3.5" />
      <span className="text-xs font-medium hidden md:inline">Espandi</span>
    </button>
  );
}

function FullscreenOverlay({
  title,
  onClose,
  children,
  noPadding,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  noPadding?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-[var(--ops-bg)] flex flex-col"
    >
      <div className="h-12 flex-none flex items-center justify-between px-6 border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface)]">
        <span className="text-sm font-medium text-[var(--ops-fg)]">{title}</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-[var(--ops-surface-2)] transition-colors"
        >
          <X className="w-4 h-4 text-[var(--ops-fg-muted)]" />
        </button>
      </div>
      <div className={`flex-1 min-h-0 ${noPadding ? "" : "overflow-y-auto p-6"}`}>
        {children}
      </div>
    </motion.div>
  );
}

// ─── View & action definitions ──────────────────────────────────────────────

const VIEWS: { id: ActiveView; icon: ComponentType<{ className?: string }>; label: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "trading", icon: TrendingUp, label: "Trading" },
  { id: "testing", icon: Microscope, label: "Testing" },
  { id: "debug", icon: Terminal, label: "Debug" },
];

const ACTIONS: { type: DrillType; icon: ComponentType<{ className?: string }>; label: string }[] = [
  { type: "cme", icon: Bot, label: "CME" },
  { type: "reports", icon: FileText, label: "Reports" },
  { type: "vision", icon: Telescope, label: "Vision" },
  { type: "archive", icon: Archive, label: "Archivio" },
  { type: "daemon", icon: Zap, label: "Daemon" },
];

const DRILL_TITLES: Record<DrillType, string> = {
  department: "",
  cme: "CME",
  reports: "Reports",
  vision: "Vision",
  archive: "Archivio",
  daemon: "Daemon",
};

// ─── Main component ─────────────────────────────────────────────────────────

export default function OpsPageClient() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState("");

  // ── Data ────────────────────────────────────────────────────────────────────
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ops_view_v2") as ActiveView) ?? "dashboard";
    }
    return "dashboard";
  });
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [tradeView, setTradeView] = useState<TradeView>("dashboard");

  // ── Modals ──────────────────────────────────────────────────────────────────
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);

  // ── Persist view ────────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem("ops_view_v2", activeView);
  }, [activeView]);

  // ── Auth check ──────────────────────────────────────────────────────────────
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

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/company/status", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        setData(await res.json());
      } else if (res.status === 401) {
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

  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [authed, fetchData]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const activityEvents = useMemo(() => {
    if (!data) return [];
    const tasks = data.board.recent ?? [];
    const review = (data.board.reviewPending ?? []).map((t) => ({
      ...t,
      status: "review_pending" as const,
    }));
    const order: Record<string, number> = {
      in_progress: 0,
      blocked: 1,
      review_pending: 2,
      open: 3,
      done: 4,
    };
    return [...tasks, ...review].sort(
      (a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5)
    );
  }, [data]);

  const systemHealth = useMemo(() => {
    if (!data) return { healthy: true, label: "\u2014" };
    const blocked = data.board.byStatus?.blocked ?? 0;
    const fallback = data.costs?.fallbackRate ?? 0;
    const healthy = blocked === 0 && fallback < 0.5;
    const label = healthy
      ? "Sistema OK"
      : blocked > 0
        ? `${blocked} bloccati`
        : "Fallback alto";
    return { healthy, label };
  }, [data]);

  const timeSince = () => {
    const s = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  };

  // ── Command handler ─────────────────────────────────────────────────────────
  const handleCommand = (cmd: string) => {
    // Store command for CME to pick up, then open CME panel
    sessionStorage.setItem("ops_pending_command", cmd);
    setDrill({ type: "cme" });
  };

  // ── Login screen ────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--ops-bg)]">
        <form
          onSubmit={handleLogin}
          className="bg-[var(--ops-surface)] border border-[rgba(255,255,255,0.06)]
            rounded-2xl p-8 w-full max-w-sm space-y-5
            shadow-[0_24px_64px_rgba(0,0,0,0.5)]"
        >
          <div>
            <h2 className="text-lg font-semibold text-[var(--ops-fg)] font-serif">
              Operations Center
            </h2>
            <p className="text-sm text-[var(--ops-fg-muted)] mt-1">
              Inserisci le credenziali per accedere.
            </p>
          </div>
          <input
            type="text"
            value={authInput}
            onChange={(e) => setAuthInput(e.target.value)}
            placeholder="Nome Cognome, Ruolo"
            className="w-full px-4 py-3 bg-[var(--ops-bg)]
              border border-[rgba(255,255,255,0.08)] rounded-lg text-sm
              text-[var(--ops-fg)] placeholder-[var(--ops-muted)] outline-none
              focus:border-[var(--ops-accent)]
              focus:ring-2 focus:ring-[rgba(255,107,53,0.25)] transition-all"
            autoFocus
          />
          {authError && (
            <p className="text-xs text-[var(--ops-error)]">{authError}</p>
          )}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-2.5 bg-[var(--ops-accent)] hover:bg-[#FF8557]
              active:bg-[#E85A24] text-white rounded-lg text-sm font-semibold
              transition-all disabled:opacity-40
              shadow-[0_2px_8px_rgba(255,107,53,0.25)]"
          >
            Accedi
          </button>
        </form>
      </div>
    );
  }

  // ── Dashboard view ──────────────────────────────────────────────────────────

  const depts = data?.board.byDepartment ?? {};
  const deptEntries = Object.entries(depts).sort((a, b) => b[1].open - a[1].open);

  const renderDashboard = () => (
    <div className="p-6 space-y-6 max-w-[1440px] mx-auto">
      {/* Error banner */}
      {fetchError && (
        <div className="flex items-center gap-3 bg-[rgba(229,141,120,0.08)] border border-[rgba(229,141,120,0.2)] rounded-xl px-5 py-4">
          <AlertCircle className="w-4 h-4 text-[var(--ops-error)] shrink-0" />
          <span className="text-sm text-[var(--ops-error)] flex-1">{fetchError}</span>
          <button
            onClick={fetchData}
            className="text-[var(--ops-error)] hover:text-white text-sm underline"
          >
            Riprova
          </button>
        </div>
      )}

      {/* ── Activity Feed ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Attivit&agrave; recente</SectionLabel>
          <div className="flex items-center gap-2">
            {activityEvents.length > 10 && (
              <button
                onClick={() => setExpandedStatus("all")}
                className="text-xs text-[var(--ops-cyan)] hover:underline"
              >
                Vedi tutto
              </button>
            )}
            <ExpandButton onClick={() => setFullscreenPanel("activity")} />
          </div>
        </div>
        <div className="bg-[var(--ops-surface)] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
          <ActivityFeed
            events={activityEvents.map((t) => ({
              id: t.id,
              type: t.status,
              title: t.title,
              department: t.department,
              priority: t.priority,
            }))}
            onEventClick={(ev) => {
              const task = activityEvents.find((t) => t.id === ev.id);
              if (task) setSelectedTask(task);
            }}
          />
        </div>
      </section>

      {/* ── Quick Stats (3 columns) ────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Task summary */}
        <div className="bg-[var(--ops-surface)] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 space-y-3">
          <SectionLabel>Task</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Open", value: data?.board.byStatus?.open ?? 0, color: "text-[var(--ops-cyan)]" },
              { label: "In corso", value: data?.board.byStatus?.in_progress ?? 0, color: "text-[#FFC832]" },
              { label: "Review", value: data?.board.byStatus?.review_pending ?? 0, color: "text-[#A78BFA]" },
              { label: "Bloccati", value: data?.board.byStatus?.blocked ?? 0, color: "text-[var(--ops-error)]" },
            ].map((s) => (
              <div key={s.label} className="flex items-baseline gap-2">
                <span className={`text-xl font-semibold font-mono ${s.color}`}>
                  {s.value}
                </span>
                <span className="text-xs text-[var(--ops-fg-muted)]">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-[rgba(255,255,255,0.04)]">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-[var(--ops-teal)] font-mono">
                {data?.board.byStatus?.done ?? 0}
              </span>
              <span className="text-xs text-[var(--ops-fg-muted)]">completati</span>
            </div>
          </div>
        </div>

        {/* Department health */}
        <div className="bg-[var(--ops-surface)] border border-[rgba(255,255,255,0.06)] rounded-xl p-5 space-y-3">
          <SectionLabel>Dipartimenti</SectionLabel>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {deptEntries.map(([dept, info]) => (
              <button
                key={dept}
                onClick={() => setDrill({ type: "department", id: dept })}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg
                  hover:bg-[var(--ops-surface-2)] transition-colors text-left group"
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    info.open === 0
                      ? "bg-[var(--ops-teal)]"
                      : info.open <= 2
                        ? "bg-[var(--ops-cyan)]"
                        : "bg-[#FFC832]"
                  }`}
                />
                <span className="text-sm text-[var(--ops-fg)] flex-1 truncate">
                  {dept}
                </span>
                <span className="text-xs text-[var(--ops-muted)] font-mono">
                  {info.open > 0 ? `${info.open} open` : "\u2713"}
                </span>
                <ChevronRight className="w-3 h-3 text-[var(--ops-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
          </div>
        </div>

        {/* Costs */}
        <CostSummary costs={data?.costs ?? null} />
      </section>

      {/* ── Overview Summary ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Sintesi</SectionLabel>
          <ExpandButton onClick={() => setFullscreenPanel("overview")} />
        </div>
        <OverviewSummaryPanel />
      </section>

      {/* ── Task Board ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Task Board</SectionLabel>
          <ExpandButton onClick={() => setFullscreenPanel("taskboard")} />
        </div>
      </section>
      <TaskBoard
        board={data?.board ?? null}
        onSelectTask={setSelectedTask}
        onExpand={(status) => setExpandedStatus(status)}
      />

      {/* ── Health + Pipeline ──────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Health &amp; Pipeline</SectionLabel>
          <ExpandButton onClick={() => setFullscreenPanel("health")} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AgentHealth agents={data?.agents ?? null} />
          <PipelineStatus pipeline={data?.pipeline ?? []} />
        </div>
      </section>

      {/* ── QA Status ──────────────────────────────────────────────── */}
      <QAStatus board={data?.board ?? null} />
    </div>
  );

  // ── Trading view ────────────────────────────────────────────────────────────

  const renderTrading = () => (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--ops-border-subtle)]">
        <IconButton
          icon={LayoutDashboard}
          label="Portfolio"
          active={tradeView === "dashboard"}
          onClick={() => setTradeView("dashboard")}
        />
        <IconButton
          icon={Activity}
          label="Slope"
          active={tradeView === "slope"}
          onClick={() => setTradeView("slope")}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tradeView === "slope" ? <TradingSlopePanel /> : <TradingDashboard />}
      </div>
    </div>
  );

  // ── Content router ──────────────────────────────────────────────────────────

  const renderContent = () => {
    switch (activeView) {
      case "trading":
        return renderTrading();
      case "testing":
        return (
          <div className="h-full overflow-y-auto">
            <LegalQATestPanel />
          </div>
        );
      case "debug":
        return <DebugPanel />;
      default:
        return <div className="h-full overflow-y-auto">{renderDashboard()}</div>;
    }
  };

  // ── Drill panel content ─────────────────────────────────────────────────────

  const closeDrill = () => setDrill(null);

  const renderDrillContent = () => {
    if (!drill) return null;
    switch (drill.type) {
      case "department":
        return drill.id ? (
          <DepartmentDetailPanel
            department={drill.id as Department}
            onBack={closeDrill}
            onSelectTask={(task: Task) => setSelectedTask(task as TaskItem)}
          />
        ) : null;
      case "cme":
        return <CMEChatPanel onBack={closeDrill} />;
      case "reports":
        return <ReportsPanel onBack={closeDrill} />;
      case "vision":
        return <VisionMissionPanel />;
      case "archive":
        return <ArchivePanel onBack={closeDrill} />;
      case "daemon":
        return <DaemonControlPanel />;
      default:
        return null;
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-[var(--ops-bg)]">
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header className="h-14 flex-none flex items-center gap-4 px-6 border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface)]">
        {/* Title */}
        <h1 className="text-base font-bold text-[var(--ops-fg)] font-serif tracking-tight whitespace-nowrap">
          Ops Center
        </h1>

        {/* System health pill */}
        <span
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
            systemHealth.healthy
              ? "bg-[rgba(93,228,199,0.08)] border-[rgba(93,228,199,0.15)] text-[var(--ops-teal)]"
              : "bg-[rgba(229,141,120,0.08)] border-[rgba(229,141,120,0.2)] text-[var(--ops-error)]"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              systemHealth.healthy
                ? "bg-[var(--ops-teal)]"
                : "bg-[var(--ops-error)] animate-pulse"
            }`}
          />
          {systemHealth.label}
        </span>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--ops-border)]" />

        {/* View switcher */}
        <nav className="flex items-center gap-1">
          {VIEWS.map((v) => (
            <IconButton
              key={v.id}
              icon={v.icon}
              label={v.label}
              active={activeView === v.id}
              accent={activeView === v.id}
              onClick={() => {
                setActiveView(v.id);
                setDrill(null);
              }}
            />
          ))}
        </nav>

        {/* Separator */}
        <div className="w-px h-5 bg-[var(--ops-border)]" />

        {/* Quick actions */}
        <nav className="flex items-center gap-1">
          {ACTIONS.map((a) => (
            <IconButton
              key={a.type}
              icon={a.icon}
              label={a.label}
              active={drill?.type === a.type}
              onClick={() =>
                setDrill(drill?.type === a.type ? null : { type: a.type })
              }
            />
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats */}
        {data && (
          <div className="hidden md:flex items-center gap-3 text-xs text-[var(--ops-fg-muted)] font-mono">
            <span className="text-[var(--ops-teal)]">
              {data.board.byStatus?.done ?? 0} done
            </span>
            <span className="text-[var(--ops-muted)]">&middot;</span>
            <span>${(data.costs?.total ?? 0).toFixed(2)}</span>
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 h-8 bg-[var(--ops-surface-2)]
            hover:bg-[var(--ops-border)] rounded-lg text-xs text-[var(--ops-fg-muted)]
            transition-all duration-150 disabled:opacity-40 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {timeSince()}
        </button>
      </header>

      {/* ── BODY ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* Main */}
        <main className="flex-1 overflow-hidden">{renderContent()}</main>

        {/* Drill panel */}
        <AnimatePresence>
          {drill && (
            <motion.aside
              key="drill"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 480, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="flex-none border-l border-[var(--ops-border-subtle)]
                bg-[var(--ops-bg)] overflow-hidden"
            >
              <div className="w-[480px] h-full flex flex-col">
                {/* Drill header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--ops-border-subtle)]">
                  <span className="text-sm font-medium text-[var(--ops-fg)] capitalize">
                    {drill.type === "department"
                      ? drill.id ?? ""
                      : DRILL_TITLES[drill.type]}
                  </span>
                  <div className="flex items-center gap-1">
                    <ExpandButton onClick={() => {
                      const title = drill.type === "department"
                        ? drill.id ?? "Department"
                        : DRILL_TITLES[drill.type];
                      setFullscreenPanel(`drill:${drill.type}:${drill.id ?? ""}`);
                    }} />
                    <button
                      onClick={closeDrill}
                      className="p-1.5 rounded-md hover:bg-[var(--ops-surface)] transition-colors"
                    >
                      <X className="w-4 h-4 text-[var(--ops-fg-muted)]" />
                    </button>
                  </div>
                </div>
                {/* Drill content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {renderDrillContent()}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ── COMMAND BAR ────────────────────────────────────────────── */}
      <CommandBar onSubmit={handleCommand} />

      {/* ── Modals ─────────────────────────────────────────────────── */}
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

      {/* ── Fullscreen panel overlay ─────────────────────────────── */}
      <AnimatePresence>
        {fullscreenPanel && (
          <FullscreenOverlay
            title={
              fullscreenPanel === "activity" ? "Attività recente" :
              fullscreenPanel === "overview" ? "Sintesi" :
              fullscreenPanel === "taskboard" ? "Task Board" :
              fullscreenPanel === "health" ? "Health & Pipeline" :
              fullscreenPanel === "debug" ? "Debug" :
              fullscreenPanel?.startsWith("drill:") ? (() => {
                const parts = fullscreenPanel.split(":");
                const type = parts[1];
                const id = parts[2];
                return type === "department" ? (id || "Department") : (DRILL_TITLES[type as DrillType] ?? type);
              })() :
              fullscreenPanel ?? ""
            }
            onClose={() => setFullscreenPanel(null)}
            noPadding={fullscreenPanel === "debug" || fullscreenPanel?.startsWith("drill:")}
          >
            {fullscreenPanel === "activity" && (
              <div className="bg-[var(--ops-surface)] border border-[rgba(255,255,255,0.06)] rounded-xl overflow-hidden">
                <ActivityFeed
                  events={activityEvents.map((t) => ({
                    id: t.id,
                    type: t.status,
                    title: t.title,
                    department: t.department,
                    priority: t.priority,
                  }))}
                  maxItems={100}
                  onEventClick={(ev) => {
                    const task = activityEvents.find((t) => t.id === ev.id);
                    if (task) {
                      setFullscreenPanel(null);
                      setSelectedTask(task);
                    }
                  }}
                />
              </div>
            )}
            {fullscreenPanel === "overview" && <OverviewSummaryPanel />}
            {fullscreenPanel === "taskboard" && (
              <TaskBoard
                board={data?.board ?? null}
                onSelectTask={(task) => {
                  setFullscreenPanel(null);
                  setSelectedTask(task);
                }}
                onExpand={(status) => {
                  setFullscreenPanel(null);
                  setExpandedStatus(status);
                }}
              />
            )}
            {fullscreenPanel === "health" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AgentHealth agents={data?.agents ?? null} />
                <PipelineStatus pipeline={data?.pipeline ?? []} />
              </div>
            )}
            {fullscreenPanel === "debug" && <DebugPanel />}
            {fullscreenPanel?.startsWith("drill:") && (() => {
              const parts = fullscreenPanel.split(":");
              const type = parts[1] as DrillType;
              const id = parts[2] || undefined;
              switch (type) {
                case "department":
                  return id ? (
                    <DepartmentDetailPanel
                      department={id as Department}
                      onBack={() => setFullscreenPanel(null)}
                      onSelectTask={(task: Task) => {
                        setFullscreenPanel(null);
                        setSelectedTask(task as TaskItem);
                      }}
                    />
                  ) : null;
                case "cme":
                  return <CMEChatPanel onBack={() => setFullscreenPanel(null)} />;
                case "reports":
                  return <ReportsPanel onBack={() => setFullscreenPanel(null)} />;
                case "vision":
                  return <VisionMissionPanel />;
                case "archive":
                  return <ArchivePanel onBack={() => setFullscreenPanel(null)} />;
                case "daemon":
                  return <DaemonControlPanel />;
                default:
                  return null;
              }
            })()}
          </FullscreenOverlay>
        )}
      </AnimatePresence>
    </div>
  );
}
