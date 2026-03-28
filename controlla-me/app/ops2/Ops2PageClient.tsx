"use client";

/**
 * Ops2PageClient — 5-tab ops dashboard (preview)
 *
 * Tabs:
 *   Comando | Trading | Chat | Task Board | Sistema
 *
 * Design: dark theme, CSS variables, Framer Motion transitions,
 * sticky tab bar with icons + accent underline for active tab.
 */

import { useState, useEffect, useCallback, useMemo, useRef, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  RefreshCw,
  X,
  Command,
  TrendingUp,
  MessageSquare,
  ClipboardList,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  MemoryStick,
  Zap,
  Users,
  Plug,
  Microscope,
  Terminal,
  Bug,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ── Ops2-specific components ─────────────────────────────────────────────────

import { KPIHeader } from "@/components/ops2/KPIHeader";
import { DaemonBanner } from "@/components/ops2/DaemonBanner";
import { DepartmentGrid } from "@/components/ops2/DepartmentGrid";
import { SignalsList } from "@/components/ops2/SignalsList";
import { ChatSidebar } from "@/components/ops2/ChatSidebar";

// ── Reused ops components ─────────────────────────────────────────────────────

import { TaskBoardFullscreen } from "@/components/ops/TaskBoardFullscreen";
import { CostSummary } from "@/components/ops/CostSummary";
import { AgentHealth } from "@/components/ops/AgentHealth";
import { TaskModal, type TaskItem } from "@/components/ops/TaskModal";
import { DepartmentDetailPanel } from "@/components/ops/DepartmentDetailPanel";
import { LegalQATestPanel } from "@/components/ops/LegalQATestPanel";
import { DebugPanel } from "@/components/ops/DebugPanel";
import { QAResultsDashboard } from "@/components/ops/QAResultsDashboard";
import { TradingDashboard } from "@/components/ops/TradingDashboard";
import { TradingSlopePanel } from "@/components/ops/TradingSlopePanel";
import { DaemonControlPanel } from "@/components/ops/DaemonControlPanel";
import { IntegrationHealthPanel } from "@/components/ops/IntegrationHealthPanel";
import { ActivityFeed } from "@/components/ops/ActivityFeed";
import { TerminalMonitor } from "@/components/ops/TerminalMonitor";
import CompanyPanel from "@/components/console/CompanyPanel";
import type { Department, Task } from "@/lib/company/types";

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
  } | null;
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

interface DaemonData {
  lastReport?: {
    signals?: Array<{
      deptId: string;
      sourceId: string;
      title: string;
      description?: string;
      priority: "low" | "medium" | "high" | "critical";
      routing?: string;
      requiresHuman?: boolean;
    }>;
    board?: { open: number; inProgress: number };
  };
  goalChecks?: Array<{ status: string }>;
  cmeDirective?: {
    mode: "smaltimento" | "audit_in_progress" | "plenaria" | "misto";
    reason?: string;
    priority?: string[];
    tasks?: string[];
  };
}

interface SystemStats {
  cpu_percent: number;
  ram_percent: number;
  ram_used_mb: number;
  ram_total_mb: number;
}

type TabId = "comando" | "trading" | "chat" | "taskboard" | "sistema";

interface TabDef {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { id: "comando", label: "Comando", shortLabel: "Cmd", icon: Command },
  { id: "trading", label: "Trading", shortLabel: "Trade", icon: TrendingUp },
  { id: "chat", label: "Chat", shortLabel: "Chat", icon: MessageSquare },
  { id: "taskboard", label: "Task Board", shortLabel: "Tasks", icon: ClipboardList },
  { id: "sistema", label: "Sistema", shortLabel: "Sys", icon: Settings2 },
];

// ─── Sistema accordion sections ───────────────────────────────────────────────

const SISTEMA_SECTIONS = [
  { id: "daemon", label: "Daemon Control", icon: Zap },
  { id: "agents", label: "Agenti & Pipeline", icon: Users },
  { id: "integrations", label: "Integrazioni", icon: Plug },
  { id: "qa", label: "QA & Test", icon: Microscope },
  { id: "terminals", label: "Terminali", icon: Terminal },
  { id: "debug", label: "Debug", icon: Bug },
] as const;

type SistemaSection = (typeof SISTEMA_SECTIONS)[number]["id"];

// ─── Decode console token ────────────────────────────────────────────────────

function decodeTokenPayload(
  token: string,
): { role?: string; nome?: string; cognome?: string } | null {
  try {
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payloadB64 = token.slice(0, dotIdx);
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const ROLE_LEVELS: Record<string, number> = { user: 0, operator: 1, admin: 2, boss: 3 };

// ─── Tab bar ─────────────────────────────────────────────────────────────────

function TabBar({
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
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState]);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
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
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center pl-1 pr-2 min-w-[36px]"
          style={{
            background: "linear-gradient(to right, var(--bg-raised) 60%, transparent)",
          }}
          aria-label="Scorri tab a sinistra"
        >
          <ChevronLeft className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 px-2 md:px-4 overflow-x-auto h-full"
        style={{ scrollbarWidth: "none" }}
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 min-h-[44px] min-w-[44px] justify-center
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

      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center pr-1 pl-2 min-w-[36px]"
          style={{
            background: "linear-gradient(to left, var(--bg-raised) 60%, transparent)",
          }}
          aria-label="Scorri tab a destra"
        >
          <ChevronRight className="w-4 h-4" style={{ color: "var(--fg-secondary)" }} />
        </button>
      )}
    </div>
  );
}

// ─── Fullscreen overlay ───────────────────────────────────────────────────────

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

// ─── Section card wrapper ─────────────────────────────────────────────────────

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
        className="px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
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

// ─── Sistema accordion row ────────────────────────────────────────────────────

function AccordionRow({
  id,
  label,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
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
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
        style={{ color: "var(--fg-primary)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--bg-overlay)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        aria-expanded={open}
        aria-controls={`sistema-section-${id}`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${open ? "text-[var(--accent)]" : "text-[var(--fg-secondary)]"}`}
        />
        <span className="text-xs font-semibold uppercase tracking-wider flex-1">
          {label}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ display: "flex" }}
        >
          <ChevronDown
            className="w-4 h-4"
            style={{ color: "var(--fg-secondary)" }}
          />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={`sistema-section-${id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Ops2PageClient() {
  const router = useRouter();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authed, setAuthed] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [userRole, setUserRole] = useState<string>("user");

  // ── Data ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<OpsData | null>(null);
  const [daemonData, setDaemonData] = useState<DaemonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── System stats (CPU/RAM) ────────────────────────────────────────────────
  const [sysStats, setSysStats] = useState<SystemStats | null>(null);

  const fetchSysStats = useCallback(async () => {
    try {
      const res = await fetch("/api/console/system-stats", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) return;
      setSysStats(await res.json());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchSysStats();
    const iv = setInterval(fetchSysStats, 5_000);
    return () => clearInterval(iv);
  }, [fetchSysStats]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>("comando");

  // ── Modals ────────────────────────────────────────────────────────────────
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [fullscreenDept, setFullscreenDept] = useState<string | null>(null);

  // ── Trading slope toggle ──────────────────────────────────────────────────
  const [showSlope, setShowSlope] = useState(false);

  // ── Sistema accordion ─────────────────────────────────────────────────────
  const [openSection, setOpenSection] = useState<SistemaSection | null>(null);

  const toggleSection = (id: SistemaSection) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  // ── Auth check on mount ───────────────────────────────────────────────────
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const token = sessionStorage.getItem("lexmea-token");
        if (token) {
          setAuthed(true);
          const payload = decodeTokenPayload(token);
          if (payload?.role) setUserRole(payload.role);
        }
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
        try {
          sessionStorage.setItem("lexmea-token", json.token);
        } catch {
          /* ignore */
        }
        const payload = decodeTokenPayload(json.token);
        if (payload?.role) setUserRole(payload.role);
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
      const headers = getConsoleAuthHeaders();
      const [statusRes, daemonRes] = await Promise.all([
        fetch("/api/company/status", { headers }),
        fetch("/api/company/daemon", { headers }),
      ]);

      if (statusRes.ok) {
        const json = await statusRes.json().catch(() => null);
        if (json) setData(json);
        else setFetchError("Risposta non valida dal server");
      } else if (statusRes.status === 401) {
        try {
          sessionStorage.removeItem("lexmea-token");
        } catch {
          /* ignore */
        }
        setAuthed(false);
        setData(null);
      } else {
        const body = await statusRes.json().catch(() => ({ error: `HTTP ${statusRes.status}` }));
        setFetchError(body?.error ?? `Errore ${statusRes.status}`);
      }

      if (daemonRes.ok) {
        const json = await daemonRes.json().catch(() => null);
        if (json) setDaemonData(json);
      }
    } catch (err) {
      console.error("Failed to fetch ops2 data:", err);
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

  // ── Boss heartbeat ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authed) return;

    const sendHeartbeat = () => {
      fetch("/api/company/sessions/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getConsoleAuthHeaders() },
        body: JSON.stringify({ target: "ops2-page" }),
      }).catch(() => {});
    };

    const clearHb = () => {
      fetch("/api/company/sessions/heartbeat", {
        method: "DELETE",
        headers: { ...getConsoleAuthHeaders() },
        keepalive: true,
      }).catch(() => {});
    };

    sendHeartbeat();
    const iv = setInterval(sendHeartbeat, 10_000);
    window.addEventListener("beforeunload", clearHb);

    return () => {
      clearInterval(iv);
      window.removeEventListener("beforeunload", clearHb);
      clearHb();
    };
  }, [authed]);

  // ── Derived values ─────────────────────────────────────────────────────────
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

  const daemonSignals = useMemo(
    () => daemonData?.lastReport?.signals ?? [],
    [daemonData],
  );

  const timeSince = () => {
    const s = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`;
  };

  // ── Login screen ─────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "var(--bg-base)" }}
      >
        <form
          onSubmit={handleLogin}
          className="rounded-2xl p-6 md:p-8 w-full max-w-sm space-y-5"
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
              Ops2 — Preview
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
            className="w-full px-4 py-3 rounded-lg text-base outline-none transition-all min-h-[44px]"
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
            <p className="text-xs" style={{ color: "var(--error)" }}>
              {authError}
            </p>
          )}
          <button
            type="submit"
            disabled={!authInput.trim()}
            className="w-full px-4 py-2.5 text-white rounded-lg text-sm font-semibold
              transition-all disabled:opacity-40 min-h-[44px]"
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

  // ── RBAC guard ────────────────────────────────────────────────────────────

  if ((ROLE_LEVELS[userRole] ?? 0) < ROLE_LEVELS["operator"]) {
    return (
      <div
        className="flex items-center justify-center min-h-screen"
        style={{ background: "var(--bg-base)" }}
      >
        <div
          className="rounded-2xl p-6 md:p-8 w-full max-w-sm space-y-4 text-center"
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-dark-subtle)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          <h2
            className="text-lg font-semibold font-serif"
            style={{ color: "var(--fg-primary)" }}
          >
            Accesso Negato
          </h2>
          <p className="text-sm" style={{ color: "var(--fg-secondary)" }}>
            Il tuo ruolo ({userRole}) non ha i permessi necessari. Ruolo minimo:{" "}
            <strong>operator</strong>.
          </p>
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem("lexmea-token");
              } catch {
                /* ignore */
              }
              setAuthed(false);
              setUserRole("user");
            }}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-primary)",
              border: "1px solid var(--border-dark-subtle)",
            }}
          >
            Disconnetti
          </button>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="h-screen overflow-hidden flex flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header
        className="min-h-[48px] flex-none flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 flex-wrap sm:flex-nowrap py-1 sm:py-0"
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
          Ops2
        </h1>

        {/* Preview badge */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: "rgba(255,107,53,0.12)",
            color: "var(--accent)",
            border: "1px solid rgba(255,107,53,0.2)",
          }}
        >
          Preview
        </span>

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

        {/* CPU/RAM widget */}
        {sysStats && (
          <div
            className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-lg text-xs"
            style={{
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-dark-subtle)",
            }}
            aria-label={`CPU ${sysStats.cpu_percent}%, RAM ${sysStats.ram_percent}%`}
          >
            <div className="flex items-center gap-1" title={`CPU: ${sysStats.cpu_percent}%`}>
              <Cpu
                className="w-3 h-3"
                style={{
                  color:
                    sysStats.cpu_percent >= 85
                      ? "var(--error)"
                      : sysStats.cpu_percent >= 70
                        ? "#f59e0b"
                        : "var(--success)",
                }}
              />
              <div
                className="w-8 h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--border-dark)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(sysStats.cpu_percent, 100)}%`,
                    background:
                      sysStats.cpu_percent >= 85
                        ? "var(--error)"
                        : sysStats.cpu_percent >= 70
                          ? "#f59e0b"
                          : "var(--success)",
                  }}
                />
              </div>
              <span
                className="tabular-nums text-[10px]"
                style={{
                  color:
                    sysStats.cpu_percent >= 85
                      ? "var(--error)"
                      : sysStats.cpu_percent >= 70
                        ? "#f59e0b"
                        : "var(--success)",
                }}
              >
                {sysStats.cpu_percent}%
              </span>
            </div>
            <div
              className="flex items-center gap-1"
              title={`RAM: ${sysStats.ram_used_mb}/${sysStats.ram_total_mb} MB (${sysStats.ram_percent}%)`}
            >
              <MemoryStick
                className="w-3 h-3"
                style={{
                  color:
                    sysStats.ram_percent >= 85
                      ? "var(--error)"
                      : sysStats.ram_percent >= 70
                        ? "#f59e0b"
                        : "var(--success)",
                }}
              />
              <div
                className="w-8 h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--border-dark)" }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(sysStats.ram_percent, 100)}%`,
                    background:
                      sysStats.ram_percent >= 85
                        ? "var(--error)"
                        : sysStats.ram_percent >= 70
                          ? "#f59e0b"
                          : "var(--success)",
                  }}
                />
              </div>
              <span
                className="tabular-nums text-[10px]"
                style={{
                  color:
                    sysStats.ram_percent >= 85
                      ? "var(--error)"
                      : sysStats.ram_percent >= 70
                        ? "#f59e0b"
                        : "var(--success)",
                }}
              >
                {sysStats.ram_percent}%
              </span>
            </div>
          </div>
        )}

        {/* Error indicator */}
        {fetchError && (
          <span
            className="text-[10px] truncate max-w-[120px] sm:max-w-[200px]"
            style={{ color: "var(--error)" }}
          >
            {fetchError}
          </span>
        )}

        <div className="flex-1" />

        {/* Stats */}
        {data && (
          <>
            <div className="flex md:hidden items-center gap-1.5 text-xs font-mono"
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

        {/* Refresh */}
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 min-h-[44px] h-auto rounded-lg text-xs
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

      {/* ── TAB BAR ────────────────────────────────────────────────────── */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── CONTENT AREA ───────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ── TAB 1: COMANDO ──────────────────────────────────────────── */}
          {activeTab === "comando" && (
            <motion.div
              key="comando"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full overflow-y-auto"
            >
              {/* KPI header bar */}
              <div
                className="px-4 md:px-6 pt-4"
                style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
              >
                <KPIHeader
                  data={data}
                  lastRefresh={lastRefresh}
                  daemonData={daemonData}
                />
              </div>

              {/* Daemon directive banner */}
              {daemonData?.cmeDirective && (
                <div className="px-4 md:px-6 pt-4">
                  <DaemonBanner directive={daemonData.cmeDirective} />
                </div>
              )}

              {/* Two-column layout: DepartmentGrid+ActivityFeed | SignalsList+CostSummary */}
              <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left column — wider */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                  <SectionCard title="Dipartimenti">
                    <DepartmentGrid
                      departments={data?.board.byDepartment ?? null}
                      onSelectDept={(dept) => setFullscreenDept(`dept:${dept}`)}
                    />
                  </SectionCard>
                  <SectionCard title="Attività recente">
                    <ActivityFeed
                      events={activityEvents.slice(0, 10).map((t) => ({
                        id: t.id,
                        type: t.status as import("@/components/ops/ActivityFeed").ActivityEventType,
                        title: t.title,
                        department: t.department,
                        priority: t.priority as import("@/components/ops/ActivityFeed").ActivityEventPriority,
                      }))}
                      maxItems={10}
                      onEventClick={(ev) => {
                        const task = activityEvents.find((t) => t.id === ev.id);
                        if (task) setSelectedTask(task);
                      }}
                    />
                  </SectionCard>
                </div>

                {/* Right column */}
                <div className="flex flex-col gap-6">
                  <SectionCard title="Segnali daemon">
                    <SignalsList signals={daemonSignals} />
                  </SectionCard>
                  <SectionCard title="Costi (7 giorni)">
                    <CostSummary costs={data?.costs ?? null} />
                  </SectionCard>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── TAB 2: TRADING ──────────────────────────────────────────── */}
          {activeTab === "trading" && (
            <motion.div
              key="trading"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full overflow-y-auto p-4 md:p-6 space-y-6"
            >
              <TradingDashboard />

              {/* Slope toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSlope((p) => !p)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={{
                    background: showSlope ? "var(--accent)" : "var(--bg-overlay)",
                    color: showSlope ? "white" : "var(--fg-secondary)",
                    border: showSlope
                      ? "1px solid transparent"
                      : "1px solid var(--border-dark-subtle)",
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
            </motion.div>
          )}

          {/* ── TAB 3: CHAT ─────────────────────────────────────────────── */}
          {activeTab === "chat" && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full flex"
            >
              {/* Sidebar — hidden on mobile */}
              <div
                className="hidden md:flex flex-col flex-none w-56"
                style={{
                  borderRight: "1px solid var(--border-dark-subtle)",
                  background: "var(--bg-raised)",
                  overflowY: "auto",
                }}
              >
                <ChatSidebar
                  data={data}
                  daemonData={daemonData}
                  onSelectTask={(task) => setSelectedTask(task)}
                />
              </div>

              {/* Main: CompanyPanel */}
              <div className="flex-1 min-w-0 h-full flex flex-col">
                <CompanyPanel open={true} onClose={() => {}} embedded />
              </div>
            </motion.div>
          )}

          {/* ── TAB 4: TASK BOARD ───────────────────────────────────────── */}
          {activeTab === "taskboard" && (
            <motion.div
              key="taskboard"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full overflow-hidden"
            >
              <TaskBoardFullscreen
                initialStatus={undefined}
                onClose={() => setActiveTab("comando")}
              />
            </motion.div>
          )}

          {/* ── TAB 5: SISTEMA ──────────────────────────────────────────── */}
          {activeTab === "sistema" && (
            <motion.div
              key="sistema"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="h-full overflow-y-auto p-4 md:p-6 space-y-3"
            >
              {/* Daemon Control */}
              <AccordionRow
                id="daemon"
                label="Daemon Control"
                icon={Zap}
                open={openSection === "daemon"}
                onToggle={() => toggleSection("daemon")}
              >
                <div className="p-4">
                  <DaemonControlPanel />
                </div>
              </AccordionRow>

              {/* Agenti & Pipeline */}
              <AccordionRow
                id="agents"
                label="Agenti & Pipeline"
                icon={Users}
                open={openSection === "agents"}
                onToggle={() => toggleSection("agents")}
              >
                <div className="p-4">
                  <AgentHealth agents={data?.agents ?? null} />
                </div>
              </AccordionRow>

              {/* Integrazioni */}
              <AccordionRow
                id="integrations"
                label="Integrazioni"
                icon={Plug}
                open={openSection === "integrations"}
                onToggle={() => toggleSection("integrations")}
              >
                <div className="p-4">
                  <IntegrationHealthPanel />
                </div>
              </AccordionRow>

              {/* QA & Test */}
              <AccordionRow
                id="qa"
                label="QA & Test"
                icon={Microscope}
                open={openSection === "qa"}
                onToggle={() => toggleSection("qa")}
              >
                <div className="p-4 space-y-6">
                  <QAResultsDashboard />
                  <LegalQATestPanel />
                </div>
              </AccordionRow>

              {/* Terminali */}
              <AccordionRow
                id="terminals"
                label="Terminali"
                icon={Terminal}
                open={openSection === "terminals"}
                onToggle={() => toggleSection("terminals")}
              >
                <div className="h-[420px] overflow-hidden">
                  <TerminalMonitor />
                </div>
              </AccordionRow>

              {/* Debug */}
              <AccordionRow
                id="debug"
                label="Debug"
                icon={Bug}
                open={openSection === "debug"}
                onToggle={() => toggleSection("debug")}
              >
                <div className="p-4">
                  <DebugPanel />
                </div>
              </AccordionRow>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
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

      {/* Department detail fullscreen overlay */}
      <AnimatePresence>
        {fullscreenDept && (
          <FullscreenOverlay
            title={
              fullscreenDept.startsWith("dept:")
                ? fullscreenDept.slice(5)
                : fullscreenDept
            }
            onClose={() => setFullscreenDept(null)}
            noPadding={fullscreenDept.startsWith("dept:")}
          >
            {fullscreenDept.startsWith("dept:") &&
              (() => {
                const dept = fullscreenDept.slice(5);
                return (
                  <DepartmentDetailPanel
                    department={dept as Department}
                    onBack={() => setFullscreenDept(null)}
                    onSelectTask={(task: Task) => {
                      setFullscreenDept(null);
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
