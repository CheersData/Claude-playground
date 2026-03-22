"use client";

/**
 * MobileOpsView — Mobile Operations Center (v2)
 *
 * Chat-first design. CME chat is the dominant element.
 * Bottom tab bar: Chat | Task | Terminale | Integrazioni
 *
 * Beauty first. Zero clutter.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  CheckCircle2,
  CircleDot,
  ChevronDown,
  ChevronUp,
  Loader2,
  XCircle,
  Eye,
  MessageSquare,
  ListTodo,
  Terminal,
  Plug,
  Power,
  Clock,
  Activity,
  Zap,
} from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";
import dynamic from "next/dynamic";

const CompanyPanel = dynamic(() => import("@/components/console/CompanyPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 text-[#FF6B35] animate-spin" />
    </div>
  ),
});

// ── Types ──────────────────────────────────────────────────────────────────

interface TaskItem {
  id: string;
  title: string;
  department: string;
  status: string;
  priority: string;
  createdBy: string;
  assignedTo: string | null;
  createdAt: string;
  description?: string | null;
  resultSummary?: string | null;
  seqNum?: number | null;
  tags?: string[] | null;
}

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
  timestamp?: string;
}

interface DaemonState {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  lastDurationMs: number | null;
  lastExitCode: number | null;
  lastTasksExecuted: number;
  totalRuns: number;
  updatedAt: string | null;
  updatedBy: string;
  running: boolean;
  logs: Array<{ name: string; date: string; size: number }>;
}

type TabId = "chat" | "tasks" | "terminal" | "integrations";

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof CircleDot }> = {
  in_progress: {
    label: "In corso",
    color: "#add7ff",
    bg: "rgba(173,215,255,0.08)",
    border: "rgba(173,215,255,0.2)",
    icon: Loader2,
  },
  open: {
    label: "Aperto",
    color: "#5de4c7",
    bg: "rgba(93,228,199,0.08)",
    border: "rgba(93,228,199,0.2)",
    icon: CircleDot,
  },
  review: {
    label: "Review",
    color: "#d0679d",
    bg: "rgba(208,103,157,0.08)",
    border: "rgba(208,103,157,0.2)",
    icon: Eye,
  },
  review_pending: {
    label: "Review",
    color: "#d0679d",
    bg: "rgba(208,103,157,0.08)",
    border: "rgba(208,103,157,0.2)",
    icon: Eye,
  },
  blocked: {
    label: "Bloccato",
    color: "#e58d78",
    bg: "rgba(229,141,120,0.08)",
    border: "rgba(229,141,120,0.2)",
    icon: XCircle,
  },
  done: {
    label: "Fatto",
    color: "#5de4c7",
    bg: "rgba(93,228,199,0.06)",
    border: "rgba(93,228,199,0.15)",
    icon: CheckCircle2,
  },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#e58d78",
  high: "#d0679d",
  medium: "#add7ff",
  low: "#767c9d",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

function deptLabel(dept: string): string {
  const map: Record<string, string> = {
    "ufficio-legale": "Legale",
    trading: "Trading",
    architecture: "Arch",
    "data-engineering": "Data",
    "quality-assurance": "QA",
    finance: "Finance",
    operations: "Ops",
    security: "Security",
    strategy: "Strategy",
    marketing: "Marketing",
    protocols: "Proto",
    "ux-ui": "UX",
    acceleration: "Accel",
    integration: "Integr",
  };
  return map[dept] ?? dept;
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return `${Math.floor(diff / 86_400_000)}g fa`;
}

// ── Tab config ─────────────────────────────────────────────────────────────

const TABS: Array<{ id: TabId; label: string; icon: typeof MessageSquare }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "tasks", label: "Task", icon: ListTodo },
  { id: "terminal", label: "Terminale", icon: Terminal },
  { id: "integrations", label: "Integr.", icon: Plug },
];

// ── Main Component ─────────────────────────────────────────────────────────

export default function MobileOpsView() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState("");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("chat");
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);

  // ── Daemon state ─────────────────────────────────────────────────────────
  const [daemonState, setDaemonState] = useState<DaemonState | null>(null);
  const [daemonAction, setDaemonAction] = useState<string | null>(null);
  const [daemonBanner, setDaemonBanner] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && sessionStorage.getItem("lexmea-token")) {
        setAuthed(true);
      }
    } catch {
      console.warn("[Auth] sessionStorage unavailable");
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
      const json = await res.json().catch(() => null);
      if (json?.authorized && json?.token) {
        try { sessionStorage.setItem("lexmea-token", json.token); } catch { /* ignore */ }
        setAuthed(true);
      } else {
        setAuthError(json?.message ?? "Accesso negato");
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
        const json = await res.json().catch(() => null);
        if (json) setData(json);
        else setFetchError("Risposta non valida");
      } else if (res.status === 401) {
        try { sessionStorage.removeItem("lexmea-token"); } catch { /* ignore */ }
        setAuthed(false);
        setData(null);
      } else {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setFetchError(body?.error ?? `Errore ${res.status}`);
      }
    } catch {
      setFetchError("Errore di connessione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(fetchData, 60_000);
    return () => clearInterval(iv);
  }, [authed, fetchData]);

  // ── Daemon fetch ────────────────────────────────────────────────────────
  const fetchDaemon = useCallback(async () => {
    try {
      const res = await fetch("/api/company/daemon", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) setDaemonState(json);
      }
    } catch { /* silent */ }
  }, []);

  const toggleDaemon = useCallback(async () => {
    if (!daemonState) return;
    setDaemonAction("toggle");
    try {
      const res = await fetch("/api/company/daemon", {
        method: "PUT",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({ enabled: !daemonState.enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDaemonState((prev) => (prev ? { ...prev, ...updated } : prev));
        showBanner(updated.enabled ? "Daemon attivato" : "Daemon disattivato", "success");
      } else {
        showBanner("Errore nel toggle", "error");
      }
    } catch {
      showBanner("Connessione fallita", "error");
    } finally {
      setDaemonAction(null);
    }
  }, [daemonState]);

  const showBanner = (message: string, type: "success" | "error") => {
    setDaemonBanner({ message, type });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setDaemonBanner(null), 3000);
  };

  useEffect(() => {
    if (authed) fetchDaemon();
  }, [authed, fetchDaemon]);

  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(fetchDaemon, 30_000);
    return () => clearInterval(iv);
  }, [authed, fetchDaemon]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const allTasks = useMemo(() => {
    if (!data) return [];
    const tasks = data.board.recent ?? [];
    const review = (data.board.reviewPending ?? []).map((t) => ({ ...t, status: "review_pending" }));
    return [...tasks, ...review];
  }, [data]);

  const activeTasks = useMemo(() => {
    const order: Record<string, number> = { blocked: 0, in_progress: 1, review_pending: 2, open: 3 };
    return allTasks
      .filter((t) => t.status !== "done")
      .sort((a, b) => {
        const statusDiff = (order[a.status] ?? 5) - (order[b.status] ?? 5);
        if (statusDiff !== 0) return statusDiff;
        const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4);
      });
  }, [allTasks]);

  const doneTasks = useMemo(() => {
    return allTasks.filter((t) => t.status === "done").slice(0, 10);
  }, [allTasks]);

  // Task count badge
  const activeCount = activeTasks.length;

  // Integration pipelines with recent syncs
  const integrationSyncs = useMemo(() => {
    if (!data?.pipeline) return [];
    return data.pipeline.filter((p) => p.lastSync?.completedAt);
  }, [data]);

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen px-6 bg-[#1b1e28]">
        <motion.form
          onSubmit={handleLogin}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="rounded-2xl p-8 w-full max-w-sm space-y-6 bg-[#252837]/80 backdrop-blur-xl border border-[#383b4d]/60"
          style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.6)" }}
        >
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#FF6B35]/10 border border-[#FF6B35]/20 mb-4">
              <MessageSquare className="w-5 h-5 text-[#FF6B35]" />
            </div>
            <h2 className="text-xl font-semibold font-serif text-[#e4f0fb]">
              Controlla.me
            </h2>
            <p className="text-sm mt-1.5 text-[#767c9d]">
              Ops Mobile
            </p>
          </div>
          <input
            type="text"
            value={authInput}
            onChange={(e) => setAuthInput(e.target.value)}
            placeholder="Nome Cognome, Ruolo"
            className="w-full px-4 py-3.5 rounded-xl outline-none bg-[#1b1e28]/80 border border-[#383b4d] text-[#e4f0fb] placeholder:text-[#767c9d] focus:border-[#FF6B35]/60 focus:ring-2 focus:ring-[#FF6B35]/20 transition-all min-h-[48px]"
            style={{ fontSize: "16px" }}
            autoFocus
          />
          {authError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#e58d78]/8 border border-[#e58d78]/15"
            >
              <XCircle className="w-4 h-4 shrink-0 text-[#e58d78]" />
              <p className="text-sm text-[#e58d78]">{authError}</p>
            </motion.div>
          )}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-3.5 text-white rounded-xl text-base font-semibold bg-[#FF6B35] transition-all disabled:opacity-30 active:scale-[0.97] min-h-[48px]"
            style={{ boxShadow: "0 4px 20px rgba(255,107,53,0.3)" }}
          >
            Accedi
          </button>
        </motion.form>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1b1e28] gap-3">
        <Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" />
        <p className="text-sm text-[#767c9d]">Caricamento...</p>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] flex flex-col bg-[#1b1e28] overflow-hidden">
      {/* ── Minimal Header ─────────────────────────────────────────── */}
      <header className="flex-none bg-[#252837]/90 backdrop-blur-xl border-b border-[#383b4d]/60">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold font-serif text-[#e4f0fb]">
              Ops
            </span>
            {data && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  background: "rgba(93,228,199,0.08)",
                  border: "1px solid rgba(93,228,199,0.15)",
                  color: "#5de4c7",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#5de4c7]" />
                {data.board.total}
              </motion.span>
            )}
          </div>

          {fetchError && (
            <span className="text-xs text-[#e58d78] truncate max-w-[40%]">{fetchError}</span>
          )}
        </div>
      </header>

      {/* ── Tab Content ────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              <CompanyPanel open={true} onClose={() => {}} embedded />
            </motion.div>
          )}

          {activeTab === "tasks" && (
            <motion.div
              key="tasks"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full overflow-y-auto"
            >
              <TasksTab
                activeTasks={activeTasks}
                doneTasks={doneTasks}
                expandedTask={expandedTask}
                setExpandedTask={setExpandedTask}
                showDoneTasks={showDoneTasks}
                setShowDoneTasks={setShowDoneTasks}
                onRefresh={fetchData}
              />
            </motion.div>
          )}

          {activeTab === "terminal" && (
            <motion.div
              key="terminal"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full overflow-y-auto"
            >
              <TerminalTab
                daemonState={daemonState}
                daemonAction={daemonAction}
                daemonBanner={daemonBanner}
                onToggle={toggleDaemon}
                costs={data?.costs ?? null}
                agents={data?.agents ?? null}
              />
            </motion.div>
          )}

          {activeTab === "integrations" && (
            <motion.div
              key="integrations"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full overflow-y-auto"
            >
              <IntegrationsTab syncs={integrationSyncs} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Bottom Tab Bar ─────────────────────────────────────────── */}
      <nav className="flex-none bg-[#252837]/95 backdrop-blur-xl border-t border-[#383b4d]/60 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            const badge = tab.id === "tasks" && activeCount > 0 ? activeCount : null;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 pt-3 relative transition-colors active:bg-[#303348]/30 min-h-[56px]"
              >
                {/* Active indicator line */}
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute top-0 left-[20%] right-[20%] h-[2px] rounded-full bg-[#FF6B35]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}

                <div className="relative">
                  <Icon
                    className="w-5 h-5 transition-colors"
                    style={{ color: isActive ? "#FF6B35" : "#767c9d" }}
                  />
                  {badge !== null && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[10px] font-bold bg-[#e58d78] text-white px-1">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider transition-colors"
                  style={{ color: isActive ? "#FF6B35" : "#767c9d" }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Tab: Tasks ────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function TasksTab({
  activeTasks,
  doneTasks,
  expandedTask,
  setExpandedTask,
  showDoneTasks,
  setShowDoneTasks,
  onRefresh,
}: {
  activeTasks: TaskItem[];
  doneTasks: TaskItem[];
  expandedTask: string | null;
  setExpandedTask: (id: string | null) => void;
  showDoneTasks: boolean;
  setShowDoneTasks: (v: boolean) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="px-4 py-5 space-y-3 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-[#767c9d]" />
          Task attivi
          {activeTasks.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-[#303348] text-[#a6accd]">
              {activeTasks.length}
            </span>
          )}
        </h2>
        <button
          onClick={onRefresh}
          className="p-2.5 rounded-xl text-[#767c9d] active:scale-90 transition-transform min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Active tasks */}
      {activeTasks.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#5de4c7]/8 border border-[#5de4c7]/15 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-[#5de4c7]" />
          </div>
          <p className="text-sm text-[#767c9d]">Nessun task attivo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              expanded={expandedTask === task.id}
              onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
            />
          ))}
        </div>
      )}

      {/* Done tasks toggle */}
      {doneTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowDoneTasks(!showDoneTasks)}
            className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-medium text-[#767c9d] bg-[#252837]/60 border border-[#383b4d]/60 active:scale-[0.99] transition-transform min-h-[44px]"
          >
            <CheckCircle2 className="w-4 h-4 text-[#5de4c7]/60" />
            <span>{doneTasks.length} completati</span>
            <span className="ml-auto">
              {showDoneTasks ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>
          <AnimatePresence>
            {showDoneTasks && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-2 mt-2">
                  {doneTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      expanded={expandedTask === task.id}
                      onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Tab: Terminal ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function TerminalTab({
  daemonState,
  daemonAction,
  daemonBanner,
  onToggle,
  costs,
  agents,
}: {
  daemonState: DaemonState | null;
  daemonAction: string | null;
  daemonBanner: { message: string; type: "success" | "error" } | null;
  onToggle: () => void;
  costs: OpsData["costs"] | null;
  agents: OpsData["agents"] | null;
}) {
  return (
    <div className="px-4 py-5 space-y-4 pb-8">
      {/* Daemon Control */}
      <section>
        <h2 className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-[#767c9d]" />
          CME Daemon
        </h2>

        <div className="rounded-xl bg-[#252837]/80 border border-[#383b4d]/60 p-4 space-y-4">
          {/* Banner */}
          <AnimatePresence>
            {daemonBanner && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="px-3 py-2 rounded-lg text-xs font-medium"
                style={{
                  background: daemonBanner.type === "success" ? "rgba(93,228,199,0.1)" : "rgba(229,141,120,0.1)",
                  border: `1px solid ${daemonBanner.type === "success" ? "rgba(93,228,199,0.25)" : "rgba(229,141,120,0.25)"}`,
                  color: daemonBanner.type === "success" ? "#5de4c7" : "#e58d78",
                }}
              >
                {daemonBanner.message}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status + Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DaemonStatusDot state={daemonState} />
              <div>
                <p className="text-sm font-medium text-[#e4f0fb]">
                  {daemonState?.running
                    ? "In esecuzione"
                    : daemonState?.enabled
                      ? "Attivo"
                      : daemonState
                        ? "Inattivo"
                        : "---"}
                </p>
                <p className="text-xs text-[#767c9d]">
                  {daemonState?.enabled
                    ? `Ogni ${daemonState.intervalMinutes}min`
                    : daemonState
                      ? "Spento"
                      : "Caricamento..."}
                </p>
              </div>
            </div>

            <button
              onClick={onToggle}
              disabled={!daemonState || daemonAction === "toggle"}
              className="w-12 h-12 rounded-xl flex items-center justify-center transition-all min-h-[44px] min-w-[44px] active:scale-90"
              style={{
                background: daemonState?.enabled ? "rgba(255,107,53,0.12)" : "rgba(56,59,77,0.4)",
                border: `1px solid ${daemonState?.enabled ? "rgba(255,107,53,0.25)" : "#383b4d"}`,
              }}
            >
              {daemonAction === "toggle" ? (
                <Loader2 className="w-5 h-5 text-[#767c9d] animate-spin" />
              ) : (
                <Power
                  className="w-5 h-5"
                  style={{ color: daemonState?.enabled ? "#FF6B35" : "#767c9d" }}
                />
              )}
            </button>
          </div>

          {/* Stats */}
          {daemonState && (
            <div className="grid grid-cols-3 gap-2">
              <MiniStat
                icon={<Clock className="w-3.5 h-3.5 text-[#767c9d]" />}
                value={daemonState.lastRun ? formatTimeAgo(daemonState.lastRun) : "---"}
                label="Ultimo"
              />
              <MiniStat
                icon={<Activity className="w-3.5 h-3.5 text-[#767c9d]" />}
                value={String(daemonState.totalRuns)}
                label="Totali"
              />
              <MiniStat
                icon={
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background:
                        daemonState.lastExitCode === null
                          ? "#767c9d"
                          : daemonState.lastExitCode === 0
                            ? "#5de4c7"
                            : "#e58d78",
                    }}
                  />
                }
                value={daemonState.lastExitCode !== null ? `exit ${daemonState.lastExitCode}` : "---"}
                label="Exit"
                valueColor={
                  daemonState.lastExitCode === null
                    ? "#e4f0fb"
                    : daemonState.lastExitCode === 0
                      ? "#5de4c7"
                      : "#e58d78"
                }
              />
            </div>
          )}
        </div>
      </section>

      {/* Costs summary */}
      {costs && (
        <section>
          <h2 className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider flex items-center gap-2 mb-3">
            <span className="text-[#767c9d] text-xs">$</span>
            Costi 7gg
          </h2>
          <div className="rounded-xl bg-[#252837]/80 border border-[#383b4d]/60 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-[#e4f0fb]">
                ${costs.total.toFixed(2)}
              </span>
              <span className="text-xs text-[#767c9d]">
                {costs.calls} chiamate
              </span>
            </div>
            {Object.entries(costs.byProvider)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .slice(0, 4)
              .map(([provider, info]) => (
                <div key={provider} className="flex items-center justify-between text-xs">
                  <span className="text-[#a6accd]">{provider}</span>
                  <span className="font-mono text-[#767c9d]">
                    ${info.cost.toFixed(3)} · {info.calls}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Agents compact */}
      {agents && (
        <section>
          <h2 className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-[#767c9d]" />
            Agenti
          </h2>
          <div className="rounded-xl bg-[#252837]/80 border border-[#383b4d]/60 divide-y divide-[#383b4d]/40">
            {Object.entries(agents).map(([name, agent]) => (
              <div key={name} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: agent.enabled ? "#5de4c7" : "#767c9d" }}
                  />
                  <span className="text-xs text-[#e4f0fb]">{name}</span>
                </div>
                <span className="text-[10px] text-[#767c9d] font-mono">{agent.model}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Tab: Integrations ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function IntegrationsTab({
  syncs,
}: {
  syncs: Array<{
    sourceId: string;
    lastSync: { completedAt: string | null; status: string; itemsFetched: number } | null;
    totalSyncs: number;
  }>;
}) {
  return (
    <div className="px-4 py-5 space-y-3 pb-8">
      <h2 className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider flex items-center gap-2">
        <Plug className="w-4 h-4 text-[#767c9d]" />
        Integrazioni
      </h2>

      {syncs.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#add7ff]/8 border border-[#add7ff]/15 flex items-center justify-center">
            <Plug className="w-5 h-5 text-[#add7ff]/60" />
          </div>
          <p className="text-sm text-[#767c9d]">Nessuna integrazione attiva</p>
          <p className="text-xs text-[#767c9d]/60 text-center max-w-[240px]">
            I connettori appariranno qui quando saranno configurati e attivi
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {syncs.map((sync) => (
            <div
              key={sync.sourceId}
              className="rounded-xl bg-[#252837]/80 border border-[#383b4d]/60 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: sync.lastSync?.status === "completed" ? "#5de4c7" : "#e58d78",
                    }}
                  />
                  <span className="text-sm text-[#e4f0fb] font-medium">{sync.sourceId}</span>
                </div>
                <span className="text-xs font-mono text-[#767c9d]">
                  {sync.totalSyncs} sync
                </span>
              </div>
              {sync.lastSync && (
                <div className="flex items-center justify-between mt-2 text-xs text-[#767c9d]">
                  <span>{sync.lastSync.itemsFetched} items</span>
                  <span>{sync.lastSync.completedAt ? timeAgo(sync.lastSync.completedAt) : "---"}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ── Sub-components ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function TaskCard({
  task,
  expanded,
  onToggle,
}: {
  task: TaskItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusConf = STATUS_CONFIG[task.status] ?? STATUS_CONFIG.open;
  const StatusIcon = statusConf.icon;
  const priorityColor = PRIORITY_COLORS[task.priority] ?? "#767c9d";

  return (
    <motion.div
      layout
      className="rounded-xl overflow-hidden bg-[#252837]/80 border border-[#383b4d]/60"
    >
      <button
        onClick={onToggle}
        className="flex items-start gap-3 w-full px-4 py-3 text-left active:bg-[#303348]/30 transition-colors min-h-[44px]"
      >
        <StatusIcon
          className={`w-4 h-4 mt-0.5 shrink-0 ${task.status === "in_progress" ? "animate-spin" : ""}`}
          style={{ color: statusConf.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-[#e4f0fb] leading-snug">
              {task.seqNum ? `#${task.seqNum} ` : ""}
              {task.title}
            </p>
            {expanded ? (
              <ChevronUp className="w-4 h-4 shrink-0 text-[#767c9d] mt-0.5" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 text-[#767c9d] mt-0.5" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase"
              style={{
                background: statusConf.bg,
                border: `1px solid ${statusConf.border}`,
                color: statusConf.color,
              }}
            >
              {statusConf.label}
            </span>
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase"
              style={{
                background: `${priorityColor}10`,
                border: `1px solid ${priorityColor}25`,
                color: priorityColor,
              }}
            >
              {task.priority}
            </span>
            <span className="text-[10px] text-[#767c9d]">
              {deptLabel(task.department)}
            </span>
            <span className="text-[10px] text-[#767c9d]">
              {timeAgo(task.createdAt)}
            </span>
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-[#383b4d]/40 pt-3">
              {task.description && (
                <p className="text-xs text-[#a6accd] leading-relaxed">{task.description}</p>
              )}
              {task.assignedTo && (
                <p className="text-xs text-[#767c9d]">
                  Assegnato: <span className="text-[#a6accd]">{task.assignedTo}</span>
                </p>
              )}
              {task.resultSummary && (
                <div className="rounded-lg bg-[#1b1e28]/60 px-3 py-2">
                  <p className="text-xs text-[#a6accd] leading-relaxed">{task.resultSummary}</p>
                </div>
              )}
              {task.tags && task.tags.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#303348]/60 text-[#767c9d]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MiniStat({
  icon,
  value,
  label,
  valueColor = "#e4f0fb",
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  valueColor?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-[#1b1e28]/60 border border-[#383b4d]/40">
      {icon}
      <span className="text-xs font-mono" style={{ color: valueColor }}>
        {value}
      </span>
      <span className="text-[10px] text-[#767c9d] uppercase">{label}</span>
    </div>
  );
}

function DaemonStatusDot({ state }: { state: DaemonState | null }) {
  const color = state
    ? state.running
      ? "#5de4c7"
      : state.enabled
        ? "#5de4c7"
        : "#e58d78"
    : "#767c9d";

  const pulse = state?.running ?? false;

  return (
    <span
      className={`w-3 h-3 rounded-full ${pulse ? "animate-pulse" : ""}`}
      style={{
        background: color,
        boxShadow: pulse ? `0 0 8px ${color}40` : undefined,
      }}
    />
  );
}
