"use client";

/**
 * MobileOpsView — Mobile-optimized Operations Center
 *
 * Designed for the boss to check task status, costs, and system health
 * from mobile. All content visible, no hidden desktop-only sections.
 *
 * Sections:
 *   1. Quick Stats (open, in_progress, blocked, cost)
 *   2. Server Health (CPU, RAM, Disk gauges — live from /api/company/server)
 *   3. Daemon Control (status, start/stop/restart — via /api/company/daemon)
 *   4. Task Board (priority: open, in_progress, review, blocked)
 *   5. Cost Summary (7-day spend + provider breakdown)
 *   6. Active Alerts (critical issues)
 *   7. Quick Actions (refresh, link to desktop)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  CheckCircle2,
  CircleDot,
  ChevronDown,
  ChevronUp,
  Monitor,
  Cpu,
  HardDrive,
  MemoryStick,
  DollarSign,
  ListTodo,
  ShieldAlert,
  ArrowUpRight,
  Loader2,
  XCircle,
  Eye,
  Play,
  Square,
  RotateCcw,
  Activity,
  Server,
  Zap,
  Clock,
  Power,
} from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";
import dynamic from "next/dynamic";
import { MessageSquare } from "lucide-react";

const CompanyPanel = dynamic(() => import("@/components/console/CompanyPanel"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
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

// ── Server & Daemon types ──────────────────────────────────────────────────

interface ServerData {
  hostname: string;
  uptime: number;
  cpu: {
    model: string;
    cores: number;
    loadAvg: number[];
    usagePercent: number;
  };
  memory: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usagePercent: number;
    swapTotalGB: number;
    swapUsedGB: number;
  };
  disk: {
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usagePercent: number;
  };
  processes: {
    total: number;
    topByMemory: Array<{ name: string; pid: number; memMB: number; cpuPercent: number }>;
  };
  node: {
    version: string;
    memoryUsageMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
  };
  timestamp: string;
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
    label: "Aperti",
    color: "#5de4c7",
    bg: "rgba(93,228,199,0.08)",
    border: "rgba(93,228,199,0.2)",
    icon: CircleDot,
  },
  review: {
    label: "In review",
    color: "#d0679d",
    bg: "rgba(208,103,157,0.08)",
    border: "rgba(208,103,157,0.2)",
    icon: Eye,
  },
  review_pending: {
    label: "In review",
    color: "#d0679d",
    bg: "rgba(208,103,157,0.08)",
    border: "rgba(208,103,157,0.2)",
    icon: Eye,
  },
  blocked: {
    label: "Bloccati",
    color: "#e58d78",
    bg: "rgba(229,141,120,0.08)",
    border: "rgba(229,141,120,0.2)",
    icon: XCircle,
  },
  done: {
    label: "Completati",
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
  };
  return map[dept] ?? dept;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function MobileOpsView() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState("");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const [costExpanded, setCostExpanded] = useState(false);
  const [showCmeChat, setShowCmeChat] = useState(false);

  // ── Server health state ──────────────────────────────────────────────────
  const [serverData, setServerData] = useState<ServerData | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // ── Daemon state ─────────────────────────────────────────────────────────
  const [daemonState, setDaemonState] = useState<DaemonState | null>(null);
  const [daemonLoading, setDaemonLoading] = useState(false);
  const [daemonError, setDaemonError] = useState<string | null>(null);
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
      // sessionStorage can throw in some mobile private browsing contexts
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
  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
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
    } catch (err) {
      console.error("Failed to fetch ops data:", err);
      setFetchError("Errore di connessione");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => {
    if (authed) fetchData();
  }, [authed, fetchData]);

  // Auto-refresh every 60s (lighter for mobile)
  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(() => fetchData(), 60_000);
    return () => clearInterval(iv);
  }, [authed, fetchData]);

  // ── Server health fetch ─────────────────────────────────────────────────
  const fetchServer = useCallback(async () => {
    setServerLoading(true);
    setServerError(null);
    try {
      const res = await fetch("/api/company/server", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) setServerData(json);
        else setServerError("Risposta non valida");
      } else {
        setServerError(`HTTP ${res.status}`);
      }
    } catch {
      setServerError("Connessione fallita");
    } finally {
      setServerLoading(false);
    }
  }, []);

  // ── Daemon fetch ────────────────────────────────────────────────────────
  const fetchDaemon = useCallback(async () => {
    setDaemonLoading(true);
    setDaemonError(null);
    try {
      const res = await fetch("/api/company/daemon", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) setDaemonState(json);
        else setDaemonError("Risposta non valida");
      } else {
        setDaemonError(`HTTP ${res.status}`);
      }
    } catch {
      setDaemonError("Connessione fallita");
    } finally {
      setDaemonLoading(false);
    }
  }, []);

  // ── Daemon toggle (enable/disable) ─────────────────────────────────────
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
        showDaemonBanner(
          updated.enabled ? "Daemon attivato" : "Daemon disattivato",
          "success"
        );
      } else {
        showDaemonBanner("Errore nel toggle", "error");
      }
    } catch {
      showDaemonBanner("Connessione fallita", "error");
    } finally {
      setDaemonAction(null);
    }
  }, [daemonState]);

  const showDaemonBanner = (message: string, type: "success" | "error") => {
    setDaemonBanner({ message, type });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setDaemonBanner(null), 3000);
  };

  // Fetch server + daemon on auth
  useEffect(() => {
    if (authed) {
      fetchServer();
      fetchDaemon();
    }
  }, [authed, fetchServer, fetchDaemon]);

  // Auto-refresh server every 30s, daemon every 30s
  useEffect(() => {
    if (!authed) return;
    const serverIv = setInterval(fetchServer, 30_000);
    const daemonIv = setInterval(fetchDaemon, 30_000);
    return () => {
      clearInterval(serverIv);
      clearInterval(daemonIv);
    };
  }, [authed, fetchServer, fetchDaemon]);

  // ── Derived data ──────────────────────────────────────────────────────────

  const allTasks = useMemo(() => {
    if (!data) return [];
    const tasks = data.board.recent ?? [];
    const review = (data.board.reviewPending ?? []).map((t) => ({
      ...t,
      status: "review_pending",
    }));
    return [...tasks, ...review];
  }, [data]);

  const activeTasks = useMemo(() => {
    const order: Record<string, number> = {
      blocked: 0,
      in_progress: 1,
      review_pending: 2,
      open: 3,
    };
    return allTasks
      .filter((t) => t.status !== "done")
      .sort((a, b) => {
        const statusDiff = (order[a.status] ?? 5) - (order[b.status] ?? 5);
        if (statusDiff !== 0) return statusDiff;
        // Within same status, sort by priority
        const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (pOrder[a.priority] ?? 4) - (pOrder[b.priority] ?? 4);
      });
  }, [allTasks]);

  const doneTasks = useMemo(() => {
    return allTasks.filter((t) => t.status === "done").slice(0, 10);
  }, [allTasks]);

  const alerts = useMemo(() => {
    const items: Array<{ type: "error" | "warning"; message: string }> = [];
    if (!data) return items;

    const blocked = data.board.byStatus?.blocked ?? 0;
    if (blocked > 0) {
      items.push({ type: "error", message: `${blocked} task bloccati richiedono attenzione` });
    }

    const fallback = data.costs?.fallbackRate ?? 0;
    if (fallback > 0.3) {
      items.push({ type: "warning", message: `Fallback rate alto: ${(fallback * 100).toFixed(0)}%` });
    }

    // Check disabled agents
    if (data.agents) {
      const disabled = Object.entries(data.agents).filter(([, a]) => !a.enabled);
      if (disabled.length > 0) {
        items.push({
          type: "warning",
          message: `${disabled.length} agenti disabilitati: ${disabled.map(([n]) => n).join(", ")}`,
        });
      }
    }

    return items;
  }, [data]);

  const systemHealth = useMemo(() => {
    if (!data) return { healthy: true, label: "---" };
    const blocked = data.board.byStatus?.blocked ?? 0;
    const fallback = data.costs?.fallbackRate ?? 0;
    const healthy = blocked === 0 && fallback < 0.5;
    const label = healthy ? "OK" : blocked > 0 ? `${blocked} bloccati` : "Fallback alto";
    return { healthy, label };
  }, [data]);

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4 bg-[#1b1e28]">
        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-6 w-full max-w-sm space-y-5 bg-[#252837] border border-[#383b4d]"
          style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}
        >
          <div>
            <h2 className="text-lg font-semibold font-serif text-[#e4f0fb]">
              Ops Mobile
            </h2>
            <p className="text-sm mt-1 text-[#a6accd]">
              Inserisci le credenziali per accedere.
            </p>
          </div>
          <input
            type="text"
            value={authInput}
            onChange={(e) => setAuthInput(e.target.value)}
            placeholder="Nome Cognome, Ruolo"
            className="w-full px-4 py-3 rounded-xl outline-none bg-[#1b1e28] border border-[#383b4d] text-[#e4f0fb] placeholder:text-[#767c9d] focus:border-[#FF6B35] focus:ring-2 focus:ring-[#FF6B35]/25 transition-all min-h-[44px]"
            style={{ fontSize: "16px" }}
            autoFocus
          />
          {authError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#e58d78]/10 border border-[#e58d78]/20">
              <XCircle className="w-4 h-4 shrink-0 text-[#e58d78]" />
              <p className="text-sm text-[#e58d78]">{authError}</p>
            </div>
          )}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-3 text-white rounded-xl text-base font-semibold bg-[#FF6B35] transition-all disabled:opacity-40 active:scale-[0.98] min-h-[44px]"
            style={{ boxShadow: "0 2px 12px rgba(255,107,53,0.3)" }}
          >
            Accedi
          </button>
        </form>
      </div>
    );
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#1b1e28] gap-3">
        <Loader2 className="w-8 h-8 text-[#FF6B35] animate-spin" />
        <p className="text-sm text-[#a6accd]">Caricamento...</p>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1b1e28] pb-24">
      {/* ── Sticky Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#252837]/95 backdrop-blur-md border-b border-[#383b4d]">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold font-serif text-[#e4f0fb]">
              Ops Mobile
            </h1>
            <span
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: systemHealth.healthy ? "rgba(93,228,199,0.1)" : "rgba(229,141,120,0.1)",
                border: `1px solid ${systemHealth.healthy ? "rgba(93,228,199,0.2)" : "rgba(229,141,120,0.25)"}`,
                color: systemHealth.healthy ? "#5de4c7" : "#e58d78",
              }}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${!systemHealth.healthy ? "animate-pulse" : ""}`}
                style={{ background: systemHealth.healthy ? "#5de4c7" : "#e58d78" }}
              />
              {systemHealth.label}
            </span>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#303348] text-[#a6accd] active:scale-95 transition-transform min-h-[44px]"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {Math.floor((Date.now() - lastRefresh.getTime()) / 1000) < 60
              ? `${Math.floor((Date.now() - lastRefresh.getTime()) / 1000)}s`
              : `${Math.floor((Date.now() - lastRefresh.getTime()) / 60000)}m`}
          </button>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="px-4 pb-2">
            <div className="px-3 py-2 rounded-lg bg-[#e58d78]/10 border border-[#e58d78]/20 text-xs text-[#e58d78]">
              {fetchError}
            </div>
          </div>
        )}
      </header>

      <div className="px-4 pt-4 space-y-4">
        {/* ── Alerts ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {alerts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-2"
            >
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 px-4 py-3 rounded-xl"
                  style={{
                    background: alert.type === "error" ? "rgba(229,141,120,0.08)" : "rgba(208,103,157,0.08)",
                    border: `1px solid ${alert.type === "error" ? "rgba(229,141,120,0.2)" : "rgba(208,103,157,0.2)"}`,
                  }}
                >
                  <ShieldAlert
                    className="w-4 h-4 mt-0.5 shrink-0"
                    style={{ color: alert.type === "error" ? "#e58d78" : "#d0679d" }}
                  />
                  <p className="text-sm" style={{ color: alert.type === "error" ? "#e58d78" : "#d0679d" }}>
                    {alert.message}
                  </p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Quick Stats Row ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatPill
            label="Aperti"
            value={data?.board.byStatus?.open ?? 0}
            color="#5de4c7"
          />
          <StatPill
            label="In corso"
            value={data?.board.byStatus?.in_progress ?? 0}
            color="#add7ff"
          />
          <StatPill
            label="Bloccati"
            value={data?.board.byStatus?.blocked ?? 0}
            color="#e58d78"
          />
          <StatPill
            label="Costo 7g"
            value={`$${(data?.costs?.total ?? 0).toFixed(2)}`}
            color="#d0679d"
          />
        </div>

        {/* ── Server Health (live gauges) ─────────────────────────── */}
        <section>
          <SectionHeader icon={Server} title="Server Health" />
          <div className="mt-3 rounded-xl bg-[#252837] border border-[#383b4d] p-4 space-y-4">
            {serverError && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#e58d78]/10 border border-[#e58d78]/20 min-h-[44px]">
                <span className="text-xs text-[#e58d78]">{serverError}</span>
                <button
                  onClick={fetchServer}
                  className="text-xs text-[#e58d78] underline ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  Riprova
                </button>
              </div>
            )}

            {/* Hostname + Uptime */}
            {serverData && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#5de4c7]" />
                  <span className="text-xs font-mono text-[#e4f0fb]">
                    {serverData.hostname}
                  </span>
                </div>
                <span className="text-xs text-[#767c9d]">
                  up {formatUptime(serverData.uptime)}
                </span>
              </div>
            )}

            {/* 3 circular gauges */}
            <div className="grid grid-cols-3 gap-3">
              <CircularGauge
                label="CPU"
                percent={serverData?.cpu.usagePercent ?? null}
                detail={serverData ? `${serverData.cpu.cores} core` : undefined}
                loading={serverLoading && !serverData}
              />
              <CircularGauge
                label="RAM"
                percent={serverData?.memory.usagePercent ?? null}
                detail={serverData ? `${serverData.memory.usedGB} / ${serverData.memory.totalGB} GB` : undefined}
                loading={serverLoading && !serverData}
              />
              <CircularGauge
                label="Disco"
                percent={serverData?.disk.usagePercent ?? null}
                detail={serverData ? `${serverData.disk.usedGB} / ${serverData.disk.totalGB} GB` : undefined}
                loading={serverLoading && !serverData}
              />
            </div>

            {/* Top 3 processes by memory */}
            {serverData && serverData.processes.topByMemory.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs text-[#767c9d] uppercase tracking-wider">
                  Top processi (RAM)
                </p>
                {serverData.processes.topByMemory.slice(0, 3).map((proc, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[#a6accd] truncate max-w-[55%] font-mono">
                      {proc.name}
                    </span>
                    <div className="flex items-center gap-3 text-[#767c9d] font-mono">
                      <span>{proc.memMB} MB</span>
                      <span>{proc.cpuPercent}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load average */}
            {serverData && (
              <div className="flex items-center justify-between text-xs text-[#767c9d]">
                <span>Load avg</span>
                <span className="font-mono text-[#a6accd]">
                  {serverData.cpu.loadAvg.join("  ")}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Daemon Control ──────────────────────────────────────── */}
        <section>
          <SectionHeader icon={Zap} title="CME Daemon" />
          <div className="mt-3 rounded-xl bg-[#252837] border border-[#383b4d] p-4 space-y-4">
            {daemonError && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#e58d78]/10 border border-[#e58d78]/20 min-h-[44px]">
                <span className="text-xs text-[#e58d78]">{daemonError}</span>
                <button
                  onClick={fetchDaemon}
                  className="text-xs text-[#e58d78] underline ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  Riprova
                </button>
              </div>
            )}

            {/* Banner feedback */}
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

            {/* Status pill + power toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DaemonStatusPill state={daemonState} />
                <div>
                  <p className="text-xs font-medium text-[#e4f0fb]">
                    {daemonState?.running
                      ? "In esecuzione"
                      : daemonState?.enabled
                        ? "Attivo"
                        : daemonState
                          ? "Inattivo"
                          : "---"}
                  </p>
                  <p className="text-xs text-[#767c9d]">
                    {daemonState?.running
                      ? "Sessione Claude in corso..."
                      : daemonState?.enabled
                        ? `Ogni ${daemonState.intervalMinutes}min`
                        : daemonState
                          ? "Il daemon non si avvia"
                          : "Caricamento..."}
                  </p>
                </div>
              </div>

              {/* Power toggle button */}
              <button
                onClick={toggleDaemon}
                disabled={!daemonState || daemonAction === "toggle"}
                className="relative w-12 h-12 rounded-xl flex items-center justify-center transition-all min-h-[44px] min-w-[44px] active:scale-95"
                style={{
                  background: daemonState?.enabled
                    ? "rgba(255,107,53,0.15)"
                    : "rgba(56,59,77,0.5)",
                  border: `1px solid ${daemonState?.enabled ? "rgba(255,107,53,0.3)" : "#383b4d"}`,
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

            {/* Daemon stats row */}
            {daemonState && (
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-[#1b1e28] border border-[#383b4d]/50">
                  <Clock className="w-3.5 h-3.5 text-[#767c9d]" />
                  <span className="text-xs font-mono text-[#e4f0fb]">
                    {daemonState.lastRun ? formatTimeAgo(daemonState.lastRun) : "---"}
                  </span>
                  <span className="text-xs text-[#767c9d] uppercase">Ultimo run</span>
                </div>
                <div className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-[#1b1e28] border border-[#383b4d]/50">
                  <Activity className="w-3.5 h-3.5 text-[#767c9d]" />
                  <span className="text-xs font-mono text-[#e4f0fb]">
                    {daemonState.totalRuns}
                  </span>
                  <span className="text-xs text-[#767c9d] uppercase">Tot. run</span>
                </div>
                <div className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg bg-[#1b1e28] border border-[#383b4d]/50">
                  <span
                    className="w-2 h-2 rounded-full mt-0.5"
                    style={{
                      background:
                        daemonState.lastExitCode === null
                          ? "#767c9d"
                          : daemonState.lastExitCode === 0
                            ? "#5de4c7"
                            : "#e58d78",
                    }}
                  />
                  <span
                    className="text-xs font-mono"
                    style={{
                      color:
                        daemonState.lastExitCode === null
                          ? "#e4f0fb"
                          : daemonState.lastExitCode === 0
                            ? "#5de4c7"
                            : "#e58d78",
                    }}
                  >
                    {daemonState.lastExitCode !== null ? `exit ${daemonState.lastExitCode}` : "---"}
                  </span>
                  <span className="text-xs text-[#767c9d] uppercase">Exit</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Task Board ───────────────────────────────────────────── */}
        <section>
          <SectionHeader
            icon={ListTodo}
            title="Task Board"
            count={activeTasks.length}
          />
          <div className="space-y-2 mt-3">
            {activeTasks.length === 0 && (
              <div className="text-center py-8 text-sm text-[#767c9d]">
                Nessun task attivo
              </div>
            )}
            {activeTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                expanded={expandedTask === task.id}
                onToggle={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
              />
            ))}
          </div>

          {/* Done tasks toggle */}
          {doneTasks.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowDoneTasks(!showDoneTasks)}
                className="flex items-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-medium text-[#767c9d] bg-[#252837] border border-[#383b4d] active:scale-[0.99] transition-transform min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4 text-[#5de4c7]" />
                <span>{doneTasks.length} completati di recente</span>
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
        </section>

        {/* ── Costs ────────────────────────────────────────────────── */}
        <section>
          <SectionHeader icon={DollarSign} title="Costi (7 giorni)" />
          <div className="mt-3 rounded-xl bg-[#252837] border border-[#383b4d] overflow-hidden">
            {/* Summary row */}
            <button
              onClick={() => setCostExpanded(!costExpanded)}
              className="flex items-center justify-between w-full px-4 py-4 min-h-[44px] active:bg-[#303348]/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold font-mono text-[#e4f0fb]">
                  ${(data?.costs?.total ?? 0).toFixed(2)}
                </div>
                <div className="text-xs text-[#767c9d]">
                  {data?.costs?.calls ?? 0} chiamate
                </div>
              </div>
              {costExpanded ? (
                <ChevronUp className="w-5 h-5 text-[#767c9d]" />
              ) : (
                <ChevronDown className="w-5 h-5 text-[#767c9d]" />
              )}
            </button>

            {/* Provider breakdown */}
            <AnimatePresence>
              {costExpanded && data?.costs && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-3 border-t border-[#383b4d] pt-3">
                    <p className="text-xs font-medium text-[#767c9d] uppercase tracking-wider">
                      Per Provider
                    </p>
                    {Object.entries(data.costs.byProvider)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([provider, info]) => (
                        <div key={provider} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#a6accd]">{provider}</span>
                            <span className="text-xs text-[#767c9d]">{info.calls} call</span>
                          </div>
                          <span className="text-sm font-mono text-[#e4f0fb]">
                            ${info.cost.toFixed(3)}
                          </span>
                        </div>
                      ))}

                    {/* Fallback rate */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#383b4d]">
                      <span className="text-xs text-[#767c9d]">Fallback rate</span>
                      <span
                        className="text-sm font-mono"
                        style={{
                          color: (data.costs.fallbackRate ?? 0) > 0.3 ? "#e58d78" : "#5de4c7",
                        }}
                      >
                        {((data.costs.fallbackRate ?? 0) * 100).toFixed(1)}%
                      </span>
                    </div>

                    {/* Per Agent */}
                    <p className="text-xs font-medium text-[#767c9d] uppercase tracking-wider pt-2">
                      Per Agente
                    </p>
                    {Object.entries(data.costs.byAgent)
                      .sort(([, a], [, b]) => b.cost - a.cost)
                      .map(([agent, info]) => (
                        <div key={agent} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#a6accd]">{agent}</span>
                            <span className="text-xs text-[#767c9d]">{info.calls} call</span>
                          </div>
                          <span className="text-sm font-mono text-[#e4f0fb]">
                            ${info.cost.toFixed(3)}
                          </span>
                        </div>
                      ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── Agents Status ────────────────────────────────────────── */}
        {data?.agents && (
          <section>
            <SectionHeader icon={Monitor} title="Agenti AI" />
            <div className="mt-3 rounded-xl bg-[#252837] border border-[#383b4d] divide-y divide-[#383b4d]">
              {Object.entries(data.agents).map(([name, agent]) => (
                <div key={name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: agent.enabled ? "#5de4c7" : "#767c9d" }}
                    />
                    <span className="text-sm text-[#e4f0fb]">{name}</span>
                  </div>
                  <span className="text-xs text-[#767c9d] font-mono">{agent.model}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Department Summary ────────────────────────────────────── */}
        {data?.board.byDepartment && Object.keys(data.board.byDepartment).length > 0 && (
          <section>
            <SectionHeader icon={ListTodo} title="Per Dipartimento" />
            <div className="mt-3 rounded-xl bg-[#252837] border border-[#383b4d] divide-y divide-[#383b4d]">
              {Object.entries(data.board.byDepartment)
                .sort(([, a], [, b]) => b.open - a.open)
                .map(([dept, info]) => (
                  <div key={dept} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-[#e4f0fb]">{deptLabel(dept)}</span>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-[#5de4c7]">{info.open} aperti</span>
                      <span className="text-[#767c9d]">{info.done} fatti</span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* ── CME Chat ─────────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => setShowCmeChat(!showCmeChat)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#252837] border border-[#383b4d] active:scale-[0.98] transition-transform min-h-[48px]"
            style={{
              borderColor: showCmeChat ? "rgba(255,107,53,0.4)" : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-[#FF6B35]" />
              <span className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider">
                Chat CME
              </span>
            </div>
            {showCmeChat ? (
              <ChevronUp className="w-5 h-5 text-[#767c9d]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[#767c9d]" />
            )}
          </button>
          {showCmeChat && (
            <div
              className="mt-3 rounded-xl bg-[#1b1e28] border border-[#383b4d] overflow-hidden"
              style={{ height: "70vh", maxHeight: "600px" }}
            >
              <CompanyPanel open={true} onClose={() => setShowCmeChat(false)} embedded />
            </div>
          )}
        </section>

        {/* ── Quick Actions ────────────────────────────────────────── */}
        <section className="pb-8">
          <SectionHeader icon={ArrowUpRight} title="Azioni rapide" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a
              href="/ops"
              className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-[#252837] border border-[#383b4d] text-sm font-medium text-[#a6accd] active:scale-[0.97] transition-transform min-h-[44px]"
            >
              <Monitor className="w-4 h-4" />
              Ops Desktop
            </a>
            <button
              onClick={() => fetchData(true)}
              className="flex items-center justify-center gap-2 px-4 py-4 rounded-xl bg-[#252837] border border-[#383b4d] text-sm font-medium text-[#a6accd] active:scale-[0.97] transition-transform min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Aggiorna
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl"
      style={{
        background: `${color}08`,
        border: `1px solid ${color}20`,
      }}
    >
      <span className="text-lg font-bold font-mono" style={{ color }}>
        {value}
      </span>
      <span className="text-xs text-[#767c9d] uppercase tracking-wider">{label}</span>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
}: {
  icon: typeof CircleDot;
  title: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-[#767c9d]" />
      <h2 className="text-sm font-semibold text-[#e4f0fb] uppercase tracking-wider">{title}</h2>
      {count !== undefined && (
        <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-[#303348] text-[#a6accd]">
          {count}
        </span>
      )}
    </div>
  );
}

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
      className="rounded-xl overflow-hidden bg-[#252837] border border-[#383b4d]"
    >
      <button
        onClick={onToggle}
        className="flex items-start gap-3 w-full px-4 py-3 text-left active:bg-[#303348]/50 transition-colors min-h-[44px]"
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
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium uppercase"
              style={{
                background: statusConf.bg,
                border: `1px solid ${statusConf.border}`,
                color: statusConf.color,
              }}
            >
              {statusConf.label}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium uppercase"
              style={{
                background: `${priorityColor}10`,
                border: `1px solid ${priorityColor}25`,
                color: priorityColor,
              }}
            >
              {task.priority}
            </span>
            <span className="text-xs text-[#767c9d]">
              {deptLabel(task.department)}
            </span>
            <span className="text-xs text-[#767c9d]">
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
            <div className="px-4 pb-4 space-y-2 border-t border-[#383b4d] pt-3">
              {task.description && (
                <div>
                  <p className="text-xs text-[#767c9d] uppercase tracking-wider mb-1">Descrizione</p>
                  <p className="text-sm text-[#a6accd] leading-relaxed">{task.description}</p>
                </div>
              )}
              {task.assignedTo && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-[#767c9d] uppercase tracking-wider">Assegnato a</p>
                  <p className="text-sm text-[#a6accd]">{task.assignedTo}</p>
                </div>
              )}
              {task.resultSummary && (
                <div>
                  <p className="text-xs text-[#767c9d] uppercase tracking-wider mb-1">Risultato</p>
                  <p className="text-sm text-[#a6accd] leading-relaxed">{task.resultSummary}</p>
                </div>
              )}
              {task.tags && task.tags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {task.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-xs font-mono bg-[#303348] text-[#767c9d] border border-[#383b4d]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-[#767c9d] pt-1">
                <span>Creato da: {task.createdBy}</span>
                <span>ID: {task.id.slice(0, 8)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Circular Gauge (SVG) ─────────────────────────────────────────────────

const GAUGE_SIZE = 80;
const GAUGE_STROKE = 6;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function gaugeColor(percent: number | null): string {
  if (percent === null) return "#767c9d";
  if (percent > 80) return "#e58d78";
  if (percent > 60) return "#d0679d";
  return "#5de4c7";
}

function CircularGauge({
  label,
  percent,
  detail,
  loading,
}: {
  label: string;
  percent: number | null;
  detail?: string;
  loading?: boolean;
}) {
  const color = gaugeColor(percent);
  const dashOffset =
    percent !== null
      ? GAUGE_CIRCUMFERENCE - (percent / 100) * GAUGE_CIRCUMFERENCE
      : GAUGE_CIRCUMFERENCE;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: GAUGE_SIZE, height: GAUGE_SIZE }}>
        <svg
          width={GAUGE_SIZE}
          height={GAUGE_SIZE}
          viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
          className="transform -rotate-90"
        >
          {/* Background track */}
          <circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke="#383b4d"
            strokeWidth={GAUGE_STROKE}
          />
          {/* Animated progress arc */}
          <motion.circle
            cx={GAUGE_SIZE / 2}
            cy={GAUGE_SIZE / 2}
            r={GAUGE_RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            strokeDasharray={GAUGE_CIRCUMFERENCE}
            initial={{ strokeDashoffset: GAUGE_CIRCUMFERENCE }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <Loader2 className="w-4 h-4 text-[#767c9d] animate-spin" />
          ) : (
            <span className="text-sm font-bold font-mono" style={{ color }}>
              {percent !== null ? `${Math.round(percent)}%` : "---"}
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-[#e4f0fb] uppercase tracking-wider font-medium">
        {label}
      </span>
      {detail && (
        <span className="text-xs text-[#767c9d] font-mono leading-tight text-center">
          {detail}
        </span>
      )}
    </div>
  );
}

// ── Daemon Status Pill ───────────────────────────────────────────────────

function DaemonStatusPill({ state }: { state: DaemonState | null }) {
  const config = state
    ? state.running
      ? { label: "Running", color: "#5de4c7", bg: "rgba(93,228,199,0.1)", border: "rgba(93,228,199,0.25)", pulse: true }
      : state.enabled
        ? { label: "Attivo", color: "#5de4c7", bg: "rgba(93,228,199,0.08)", border: "rgba(93,228,199,0.2)", pulse: false }
        : { label: "Inattivo", color: "#e58d78", bg: "rgba(229,141,120,0.08)", border: "rgba(229,141,120,0.2)", pulse: false }
    : { label: "Sconosciuto", color: "#767c9d", bg: "rgba(118,124,157,0.08)", border: "rgba(118,124,157,0.2)", pulse: false };

  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.color,
      }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.pulse ? "animate-pulse" : ""}`}
        style={{ background: config.color }}
      />
      {config.label}
    </span>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}g`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(" ");
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ora";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m fa`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
  return `${Math.floor(diff / 86_400_000)}g fa`;
}
