"use client";

/**
 * OpsPageClient v5 — Tab-based navigation
 *
 * Restored full tab navigation with all functional sections:
 * Dashboard, Trading, CME Chat, Vision, Reports, Archivio, Daemon, Agenti, QA/Testing
 *
 * Layout:
 *   +---------------------------------------------------------------+
 *   | HEADER: Ops Center | Health | Stats | Refresh                  |
 *   +---------------------------------------------------------------+
 *   | TAB BAR: Dashboard | Trading | CME | Vision | Reports | ...   |
 *   +---------------------------------------------------------------+
 *   | CONTENT AREA (full height, scrollable per tab)                 |
 *   +---------------------------------------------------------------+
 */

import { useState, useEffect, useCallback, useMemo, useRef, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  X,
  LayoutDashboard,
  TrendingUp,
  MessageSquare,
  Telescope,
  FileText,
  Archive,
  Zap,
  Microscope,
  Users,
  Plug,
  Terminal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ── Ops-specific components ─────────────────────────────────────────────────

import { TaskBoard } from "@/components/ops/TaskBoard";
import { TaskBoardFullscreen } from "@/components/ops/TaskBoardFullscreen";
import { CostSummary } from "@/components/ops/CostSummary";
import { AgentHealth } from "@/components/ops/AgentHealth";
import { QAStatus } from "@/components/ops/QAStatus";
import { PipelineStatus } from "@/components/ops/PipelineStatus";
import { TaskModal, type TaskItem } from "@/components/ops/TaskModal";
import { DepartmentDetailPanel } from "@/components/ops/DepartmentDetailPanel";
import { ReportsPanel } from "@/components/ops/ReportsPanel";
import { LegalQATestPanel } from "@/components/ops/LegalQATestPanel";
import { StressTestResultsPanel as _StressTestResultsPanel } from "@/components/ops/StressTestResultsPanel";
import { ArchivePanel } from "@/components/ops/ArchivePanel";
import { VisionMissionPanel } from "@/components/ops/VisionMissionPanel";
import { DebugPanel } from "@/components/ops/DebugPanel";
import { QAResultsDashboard } from "@/components/ops/QAResultsDashboard";
import { OverviewSummaryPanel } from "@/components/ops/OverviewSummaryPanel";
import { TradingDashboard } from "@/components/ops/TradingDashboard";
import { TradingSlopePanel } from "@/components/ops/TradingSlopePanel";
import { DaemonControlPanel } from "@/components/ops/DaemonControlPanel";
import { IntegrationHealthPanel } from "@/components/ops/IntegrationHealthPanel";
import { ActivityFeed } from "@/components/ops/ActivityFeed";
import { AgentDots } from "@/components/ops/AgentDots";
import { TerminalMonitor } from "@/components/ops/TerminalMonitor";
import SessionIndicator from "@/components/console/SessionIndicator";
import { CapacityIndicator } from "@/components/ops/CapacityIndicator";
import { CompanyRoadmap } from "@/components/ops/CompanyRoadmap";
import type { Department, Task } from "@/lib/company/types";

// ── CompanyPanel (core CME interface — same as /console) ────────────────────

import CompanyPanel from "@/components/console/CompanyPanel";

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

type TabId =
  | "dashboard"
  | "trading"
  | "cme"
  | "vision"
  | "reports"
  | "archive"
  | "daemon"
  | "agents"
  | "integrations"
  | "testing"
  | "terminals";

interface TabDef {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dash", icon: LayoutDashboard },
  { id: "trading", label: "Trading", shortLabel: "Trade", icon: TrendingUp },
  { id: "cme", label: "CME", shortLabel: "CME", icon: MessageSquare },
  { id: "vision", label: "Vision", shortLabel: "Vision", icon: Telescope },
  { id: "reports", label: "Reports", shortLabel: "Rep.", icon: FileText },
  { id: "archive", label: "Archivio", shortLabel: "Arch.", icon: Archive },
  { id: "daemon", label: "Daemon", shortLabel: "Dmn", icon: Zap },
  { id: "agents", label: "Agenti", shortLabel: "Agenti", icon: Users },
  { id: "integrations", label: "Integrazioni", shortLabel: "Integ.", icon: Plug },
  { id: "testing", label: "QA & Test", shortLabel: "QA", icon: Microscope },
  { id: "terminals", label: "Terminali", shortLabel: "Term.", icon: Terminal },
];

// ─── Tab Bar with scroll indicators ─────────────────────────────────────────

function TabBarWithScrollIndicators({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      // Use captured `el` (not scrollRef.current) to guarantee cleanup
      // even if the ref becomes null before unmount
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  return (
    <div
      className="flex-none relative"
      style={{
        minHeight: "44px",
        borderBottom: "1px solid var(--border-dark-subtle)",
        background: "var(--bg-raised)",
      }}
    >
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 pr-2 transition-opacity"
          style={{
            background:
              "linear-gradient(to right, var(--bg-raised) 60%, transparent)",
          }}
          aria-label="Scorri tab a sinistra"
        >
          <ChevronLeft className="w-3.5 h-3.5" style={{ color: "var(--fg-secondary)" }} />
        </button>
      )}

      {/* Scrollable tabs */}
      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 px-2 md:px-4 overflow-x-auto h-full"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-dark) transparent",
        }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 min-h-[44px] min-w-[44px] justify-center
                rounded-md text-[11px] sm:text-xs font-medium whitespace-nowrap transition-all duration-150 shrink-0"
              style={{
                background: active ? "var(--bg-overlay)" : "transparent",
                color: active ? "var(--fg-primary)" : "var(--fg-secondary)",
                borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "var(--bg-overlay)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right fade + arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center pr-1 pl-2 transition-opacity"
          style={{
            background:
              "linear-gradient(to left, var(--bg-raised) 60%, transparent)",
          }}
          aria-label="Scorri tab a destra"
        >
          <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--fg-secondary)" }} />
        </button>
      )}
    </div>
  );
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

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
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      <div
        className="h-12 flex-none flex items-center justify-between px-6"
        style={{
          borderBottom: "1px solid var(--border-dark-subtle)",
          background: "var(--bg-raised)",
        }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--fg-primary)" }}>
          {title}
        </span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: "var(--fg-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className={`flex-1 min-h-0 ${noPadding ? "" : "overflow-y-auto p-6"}`}>
        {children}
      </div>
    </motion.div>
  );
}

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
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");

  // ── Modals / Fullscreen ────────────────────────────────────────────────────
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [fullscreenPanel, setFullscreenPanel] = useState<string | null>(null);
  const [showSlope, setShowSlope] = useState(false);

  // ── Live sessions from SessionIndicator (for AgentDots bridging) ──────────
  type LiveSessionEntry = {
    pid: number;
    type: "console" | "task-runner" | "daemon" | "interactive";
    target: string;
    taskId?: string;
    startedAt: string;
    status: "active" | "closing";
  };
  const [liveSessions, setLiveSessions] = useState<LiveSessionEntry[]>([]);
  const handleSessionsUpdate = useCallback((sessions: LiveSessionEntry[]) => {
    setLiveSessions(sessions);
  }, []);

  // ── Auth check ─────────────────────────────────────────────────────────────
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

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/company/status", { headers: getConsoleAuthHeaders() });
      if (res.ok) {
        const json = await res.json().catch(() => null);
        if (json) setData(json);
        else setFetchError("Risposta non valida dal server");
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

  // ── Derived data ───────────────────────────────────────────────────────────

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
      (a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5),
    );
  }, [data]);

  // ── Real-time agent activity via SSE ────────────────────────────────────────
  type AgentEntry = { department: string; task?: string; status: "running" | "done" | "error"; timestamp?: number };
  const [liveAgents, setLiveAgents] = useState<Map<string, AgentEntry>>(new Map());
  const liveAgentsRef = useRef(liveAgents);
  liveAgentsRef.current = liveAgents;

  useEffect(() => {
    if (!authed) return;

    let eventSource: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let retryCount = 0;
    const MAX_SSE_RETRIES = 10;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      if (retryCount >= MAX_SSE_RETRIES) {
        console.warn(`[SSE] Max retries (${MAX_SSE_RETRIES}) reached — SSE disabled`);
        return;
      }

      let token = "";
      try {
        token = sessionStorage.getItem("lexmea-token") ?? "";
      } catch {
        console.warn("[SSE] sessionStorage unavailable — SSE disabled");
        return;
      }

      const sseUrl = `/api/company/agents/live?t=${encodeURIComponent(token)}`;
      console.log("[SSE] Connecting to", sseUrl.slice(0, 60) + "...");

      try {
        eventSource = new EventSource(sseUrl);
      } catch (err) {
        console.warn("[SSE] EventSource constructor failed:", err);
        return;
      }

      eventSource.onopen = () => {
        console.log("[SSE] Connected — listening for agent events");
        retryCount = 0; // Reset on successful connection
      };

      eventSource.addEventListener("snapshot", (e) => {
        try {
          const events: Array<{ id: string; department: string; task?: string; status: "running" | "done" | "error"; timestamp: number }> = JSON.parse(e.data);
          console.log(`[SSE] snapshot: ${events.length} active agents`, events.map(ev => `${ev.department}:${ev.status}`));
          const map = new Map<string, AgentEntry>();
          for (const evt of events) {
            map.set(evt.id, { department: evt.department, task: evt.task, status: evt.status, timestamp: evt.timestamp });
          }
          setLiveAgents(map);
        } catch { /* ignore parse errors */ }
      });

      eventSource.addEventListener("agent", (e) => {
        try {
          const evt: { id: string; department: string; task?: string; status: "running" | "done" | "error"; timestamp: number } = JSON.parse(e.data);
          console.log(`[SSE] agent: ${evt.department} → ${evt.status} (${evt.task ?? evt.id})`);
          setLiveAgents((prev) => {
            const next = new Map(prev);
            next.set(evt.id, { department: evt.department, task: evt.task, status: evt.status, timestamp: evt.timestamp });
            return next;
          });

          // Auto-expire done/error events after 8 seconds
          if (evt.status === "done" || evt.status === "error") {
            setTimeout(() => {
              setLiveAgents((prev) => {
                const next = new Map(prev);
                const current = next.get(evt.id);
                // Only remove if the event hasn't been updated since
                if (current && current.timestamp === evt.timestamp) {
                  next.delete(evt.id);
                }
                return next;
              });
            }, 8_000);
          }
        } catch { /* ignore parse errors */ }
      });

      eventSource.onerror = (err) => {
        retryCount++;
        // Exponential backoff: 5s, 10s, 20s, 40s... capped at 60s
        const delay = Math.min(5_000 * Math.pow(2, retryCount - 1), 60_000);
        console.warn(`[SSE] Error (retry ${retryCount}/${MAX_SSE_RETRIES}) — reconnecting in ${delay / 1000}s`, err);
        eventSource?.close();
        if (!disposed && retryCount < MAX_SSE_RETRIES) {
          retryTimeout = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      eventSource?.close();
      clearTimeout(retryTimeout);
    };
  }, [authed]);

  // ── Agent activity data for AgentDots + CapacityIndicator ─────────────────
  // Merge: task board data + real-time SSE events (SSE takes priority for running)
  const activeAgentsMap = useMemo(() => {
    const map = new Map<string, { department: string; task?: string; status: "running" | "done" | "error" }>();
    if (!data) return map;

    // Layer 1: Derive from recent tasks (in_progress → running, blocked → error)
    const tasks = data.board.recent ?? [];
    for (const t of tasks) {
      if (t.status === "in_progress") {
        map.set(`task-${t.id}`, { department: t.department, task: t.title, status: "running" });
      } else if (t.status === "blocked") {
        map.set(`task-${t.id}`, { department: t.department, task: t.title, status: "error" });
      }
    }

    // Layer 2: Overlay real-time SSE events (these are actual agent executions)
    liveAgents.forEach((value, key) => {
      map.set(key, { department: value.department, task: value.task, status: value.status });
    });

    // Layer 3: Bridge live sessions (from SessionIndicator) into the map
    for (const s of liveSessions) {
      if (s.status !== "active") continue;
      if (!s.target || s.target === "unknown") continue;

      const key = `session-${s.pid}`;
      if (map.has(key)) continue;

      const dept = s.type === "interactive" ? "interactive" : s.target;
      map.set(key, {
        department: dept,
        task: s.taskId || s.type,
        status: "running",
      });
    }

    return map;
  }, [data, liveAgents, liveSessions]);

  const activeAgentCount = useMemo(() => {
    let count = 0;
    activeAgentsMap.forEach((v) => {
      // Count all running entries: both real-time SSE agents and board tasks (in_progress)
      if (v.status === "running") count++;
    });
    return count;
  }, [activeAgentsMap]);

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

  // ── Login screen ───────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "var(--bg-base)" }}
      >
        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-8 w-full max-w-sm space-y-5"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          <div>
            <h2
              className="text-lg font-semibold font-serif"
              style={{ color: "var(--fg-primary)" }}
            >
              Operations Center
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--fg-secondary)" }}>
              Inserisci le credenziali per accedere.
            </p>
          </div>
          <input
            type="text"
            value={authInput}
            onChange={(e) => setAuthInput(e.target.value)}
            placeholder="Nome Cognome, Ruolo"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none transition-all"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-dark-subtle)",
              color: "var(--fg-primary)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255,107,53,0.25)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border-dark-subtle)";
              e.currentTarget.style.boxShadow = "none";
            }}
            autoFocus
          />
          {authError && (
            <p className="text-xs" style={{ color: "var(--error)" }}>{authError}</p>
          )}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-2.5 text-white rounded-lg text-sm font-semibold
              transition-all disabled:opacity-40"
            style={{
              background: "var(--accent)",
              boxShadow: "0 2px 8px rgba(255,107,53,0.25)",
            }}
          >
            Accedi
          </button>
        </form>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <header
        className="h-12 flex-none flex items-center gap-3 px-4 md:px-6"
        style={{
          borderBottom: "1px solid var(--border-dark-subtle)",
          background: "var(--bg-raised)",
        }}
      >
        {/* Title */}
        <h1
          className="text-sm font-bold font-serif tracking-tight whitespace-nowrap"
          style={{ color: "var(--fg-primary)" }}
        >
          Ops Center
        </h1>

        {/* System health pill */}
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
          style={{
            background: systemHealth.healthy
              ? "rgba(93,228,199,0.08)"
              : "rgba(229,141,120,0.08)",
            border: `1px solid ${
              systemHealth.healthy
                ? "rgba(93,228,199,0.15)"
                : "rgba(229,141,120,0.2)"
            }`,
            color: systemHealth.healthy ? "var(--success)" : "var(--error)",
          }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${!systemHealth.healthy ? "animate-pulse" : ""}`}
            style={{
              background: systemHealth.healthy ? "var(--success)" : "var(--error)",
            }}
          />
          {systemHealth.label}
        </span>

        {/* Agent activity dots + test button */}
        {data && (
          <div className="flex items-center gap-1">
            <AgentDots activeAgents={activeAgentsMap} />
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/company/agents/test", {
                    method: "POST",
                    headers: getConsoleAuthHeaders(),
                  });
                  const json = await res.json();
                  console.log("[TEST PALLINI]", json);
                } catch (err) {
                  console.error("[TEST PALLINI] Error:", err);
                }
              }}
              className="ml-1 px-1.5 py-0.5 text-[9px] rounded border opacity-40 hover:opacity-100 transition-opacity"
              style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}
              title="Test: attiva 5 pallini per 4 secondi"
            >
              Test
            </button>
          </div>
        )}

        {/* Active sessions */}
        <SessionIndicator onSessionsUpdate={handleSessionsUpdate} />

        {/* Error indicator */}
        {fetchError && (
          <span
            className="text-[10px] truncate max-w-[200px]"
            style={{ color: "var(--error)" }}
          >
            {fetchError}
          </span>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats — compact on mobile, full on md+ */}
        {data && (
          <>
            {/* Mobile: compact single-line */}
            <div className="flex md:hidden items-center gap-1.5 text-[10px] font-mono"
              style={{ color: "var(--fg-secondary)" }}
            >
              <span style={{ color: "var(--success)" }}>
                {data.board.byStatus?.done ?? 0}d
              </span>
              <span style={{ color: "var(--fg-invisible)" }}>/</span>
              <span>{data.board.byStatus?.open ?? 0}o</span>
              <span style={{ color: "var(--fg-invisible)" }}>/</span>
              <span>${(data.costs?.total ?? 0).toFixed(2)}</span>
            </div>
            {/* Desktop: full labels */}
            <div className="hidden md:flex items-center gap-3 text-xs font-mono"
              style={{ color: "var(--fg-secondary)" }}
            >
              <span style={{ color: "var(--success)" }}>
                {data.board.byStatus?.done ?? 0} done
              </span>
              <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
              <span>{data.board.byStatus?.open ?? 0} open</span>
              <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
              <span>${(data.costs?.total ?? 0).toFixed(2)}</span>
            </div>
          </>
        )}

        {/* Capacity indicator — full on md+, compact dot on mobile */}
        {data && (
          <>
            <div className="hidden md:block">
              <CapacityIndicator activeCount={activeAgentCount} maxCapacity={10} />
            </div>
            {/* Mobile: compact capacity dot */}
            <div
              className="flex md:hidden items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono"
              style={{
                background: activeAgentCount > 0 ? "rgba(255,107,53,0.12)" : "rgba(255,255,255,0.04)",
                color: activeAgentCount > 0 ? "#FF6B35" : "var(--fg-muted)",
              }}
              aria-label={`${activeAgentCount} agenti attivi su 10`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${activeAgentCount > 0 ? "animate-pulse" : ""}`}
                style={{
                  background: activeAgentCount > 0 ? "#FF6B35" : "var(--fg-muted)",
                }}
              />
              {activeAgentCount}/{10}
            </div>
          </>
        )}

        {/* Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs
            transition-all duration-150 disabled:opacity-40 whitespace-nowrap"
          style={{
            background: "var(--bg-overlay)",
            color: "var(--fg-secondary)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border-dark)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {timeSince()}
        </button>
      </header>

      {/* ── TAB BAR ─────────────────────────────────────────────────── */}
      <TabBarWithScrollIndicators activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── CONTENT AREA ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Dashboard */}
        {activeTab === "dashboard" && (
          <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
            {/* Overview Summary */}
            <OverviewSummaryPanel />

            {/* Roadmap & Progressi */}
            <CompanyRoadmap />

            {/* Task Board + Activity in 2-column */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <SectionCard title="Task Board">
                  <TaskBoard
                    board={data?.board ?? null}
                    onSelectTask={(task) => setSelectedTask(task)}
                    onExpand={(status) => setExpandedStatus(status)}
                  />
                </SectionCard>
              </div>
              <div>
                <SectionCard title="Attività recente">
                  <ActivityFeed
                    events={activityEvents.map((t) => ({
                      id: t.id,
                      type: t.status as import("@/components/ops/ActivityFeed").ActivityEventType,
                      title: t.title,
                      department: t.department,
                      priority: t.priority as import("@/components/ops/ActivityFeed").ActivityEventPriority,
                    }))}
                    maxItems={15}
                    onEventClick={(ev) => {
                      const task = activityEvents.find((t) => t.id === ev.id);
                      if (task) setSelectedTask(task);
                    }}
                  />
                </SectionCard>
              </div>
            </div>

            {/* Costs + QA Status in 2-column */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SectionCard title="Costi (7 giorni)">
                <CostSummary costs={data?.costs ?? null} />
              </SectionCard>
              <SectionCard title="QA Status">
                <QAStatus board={data?.board ?? null} />
              </SectionCard>
            </div>

            {/* Salute Integrazioni */}
            <SectionCard title="Salute Integrazioni">
              <IntegrationHealthPanel />
            </SectionCard>
          </div>
        )}

        {/* Trading */}
        {activeTab === "trading" && (
          <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
            <TradingDashboard />
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setShowSlope((p) => !p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: showSlope ? "var(--accent)" : "var(--bg-overlay)",
                  color: showSlope ? "white" : "var(--fg-secondary)",
                }}
              >
                {showSlope ? "Nascondi Slope" : "Mostra Slope"}
              </button>
            </div>
            <AnimatePresence>
              {showSlope && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <TradingSlopePanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* CME Chat */}
        {activeTab === "cme" && (
          <div className="h-full flex flex-col">
            <CompanyPanel open={true} onClose={() => {}} embedded />
          </div>
        )}

        {/* Vision & Mission */}
        {activeTab === "vision" && (
          <div className="h-full overflow-y-auto p-4 md:p-6">
            <VisionMissionPanel />
          </div>
        )}

        {/* Reports */}
        {activeTab === "reports" && (
          <div className="h-full overflow-y-auto">
            <ReportsPanel onBack={() => setActiveTab("dashboard")} />
          </div>
        )}

        {/* Archivio */}
        {activeTab === "archive" && (
          <div className="h-full overflow-y-auto">
            <ArchivePanel onBack={() => setActiveTab("dashboard")} />
          </div>
        )}

        {/* Daemon */}
        {activeTab === "daemon" && (
          <div className="h-full overflow-y-auto">
            <DaemonControlPanel />
          </div>
        )}

        {/* Agenti attivi + Pipeline */}
        {activeTab === "agents" && (
          <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <SectionCard title="Agenti attivi">
                <AgentHealth agents={data?.agents ?? null} />
              </SectionCard>
              <SectionCard title="Data Pipeline">
                <PipelineStatus pipeline={data?.pipeline ?? []} />
              </SectionCard>
            </div>
          </div>
        )}

        {/* Integrazioni */}
        {activeTab === "integrations" && (
          <div className="h-full overflow-y-auto p-4 md:p-6">
            <IntegrationHealthPanel />
          </div>
        )}

        {/* QA & Testing */}
        {activeTab === "testing" && (
          <div className="h-full overflow-y-auto p-4 md:p-6 space-y-6">
            <SectionCard title="Risultati QA & Stress Test">
              <QAResultsDashboard />
            </SectionCard>
            <SectionCard title="Esecuzione Test Q&A">
              <LegalQATestPanel />
            </SectionCard>
            <SectionCard title="Debug">
              <DebugPanel />
            </SectionCard>
          </div>
        )}

        {/* Terminali */}
        {activeTab === "terminals" && (
          <div className="h-full overflow-hidden">
            <TerminalMonitor />
          </div>
        )}
      </div>

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

      {/* ── Fullscreen panel overlay (for dept detail drill-down) ─── */}
      <AnimatePresence>
        {fullscreenPanel && (
          <FullscreenOverlay
            title={
              fullscreenPanel?.startsWith("dept:")
                ? fullscreenPanel.slice(5)
                : fullscreenPanel ?? ""
            }
            onClose={() => setFullscreenPanel(null)}
            noPadding={fullscreenPanel?.startsWith("dept:")}
          >
            {fullscreenPanel?.startsWith("dept:") && (() => {
              const dept = fullscreenPanel.slice(5);
              return (
                <DepartmentDetailPanel
                  department={dept as Department}
                  onBack={() => setFullscreenPanel(null)}
                  onSelectTask={(task: Task) => {
                    setFullscreenPanel(null);
                    setSelectedTask(task as TaskItem);
                  }}
                />
              );
            })()}
          </FullscreenOverlay>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Section Card wrapper ────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      <div
        className="px-4 py-3 flex items-center"
        style={{
          borderBottom: "1px solid var(--border-dark-subtle)",
        }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--fg-secondary)" }}
        >
          {title}
        </h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
