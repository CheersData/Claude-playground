"use client";

/**
 * TerminalPanel — Shows a list of active terminals (sessions) as cards.
 *
 * Each card displays: PID, department, current task, uptime, status indicator.
 * Cards are expandable to show agents running inside that terminal.
 * Each agent shows: name, current phase, status (running/done/error).
 * Kill button per terminal (red, with confirmation).
 * Kill button per agent (orange, with confirmation).
 * Color coding: green=active, amber=managed-from-ops, gray=external.
 *
 * ADR-005: Terminal/Agent Monitoring Architecture
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  XCircle,
  Eye,
  Activity,
  ChevronDown,
  ChevronRight,
  Bot,
  Monitor,
  Clock,
  Zap,
  AlertTriangle,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AgentInfo {
  id: string;
  department: string;
  status: "running" | "done" | "error";
  task?: string;
  timestamp: number;
}

interface SessionInfo {
  pid: number;
  type: "console" | "task-runner" | "daemon" | "interactive";
  target: string;
  department?: string;
  currentTask?: string;
  startedAt: string;
  status: "active" | "closing";
  agentCount: number;
  agents: AgentInfo[];
  sessionId?: string;
}

interface SessionsResponse {
  count: number;
  activeCount: number;
  totalAgents: number;
  sessions: SessionInfo[];
}

export interface TerminalPanelProps {
  /** Callback when a session is selected (to show output) */
  onSelectSession?: (session: SessionInfo) => void;
  /** Currently selected PID (for highlight) */
  selectedPid?: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEPT_COLORS: Record<string, string> = {
  "ufficio-legale": "#FF6B6B",
  trading: "#FFC832",
  architecture: "#4ECDC4",
  "data-engineering": "#A78BFA",
  "quality-assurance": "#60A5FA",
  operations: "#34D399",
  security: "#F87171",
  strategy: "#FBBF24",
  marketing: "#FB923C",
  protocols: "#818CF8",
  "ux-ui": "#F472B6",
  acceleration: "#2DD4BF",
  finance: "#A3E635",
  cme: "#FF6B35",
  interactive: "#38BDF8",
  integration: "#C084FC",
};

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Uff. Legale",
  trading: "Trading",
  architecture: "Architettura",
  "data-engineering": "Data Eng.",
  "quality-assurance": "QA",
  operations: "Operations",
  security: "Sicurezza",
  strategy: "Strategia",
  marketing: "Marketing",
  protocols: "Protocolli",
  "ux-ui": "UX/UI",
  acceleration: "Accelerazione",
  finance: "Finanza",
  cme: "CME",
  interactive: "Boss Terminal",
  integration: "Integrazione",
};

const TYPE_CONFIG: Record<
  SessionInfo["type"],
  { icon: typeof Terminal; label: string; color: string; bg: string }
> = {
  console: {
    icon: Monitor,
    label: "Console",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  "task-runner": {
    icon: Bot,
    label: "Task Runner",
    color: "text-[#A78BFA]",
    bg: "bg-[#A78BFA]/15",
  },
  daemon: {
    icon: Clock,
    label: "Daemon",
    color: "text-[#FFC832]",
    bg: "bg-[#FFC832]/15",
  },
  interactive: {
    icon: Terminal,
    label: "Interactive",
    color: "text-sky-400",
    bg: "bg-sky-500/15",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUptime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function getDeptColor(dept?: string): string {
  if (!dept) return "#555";
  return DEPT_COLORS[dept] ?? "#555";
}

function getDeptLabel(dept?: string): string {
  if (!dept) return "Sconosciuto";
  return DEPT_LABELS[dept] ?? dept;
}

/**
 * Determine the color-coding class for a terminal session.
 * Green = active console session (managed from /ops or console)
 * Amber = active but managed externally (task-runner, daemon)
 * Gray = interactive (boss terminal) or orphan
 */
function getSessionIndicatorColor(session: SessionInfo): string {
  if (session.status === "closing") return "#d4a843"; // amber for closing
  if (session.type === "console") return "#34D399"; // green for console
  if (session.type === "task-runner" || session.type === "daemon") return "#d4a843"; // amber
  return "#6b7280"; // gray for interactive/external
}

// ─── Kill Confirmation Dialog ─────────────────────────────────────────────────

interface KillDialogProps {
  pid: number;
  type: string;
  target: string;
  agentId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function KillDialog({ pid, type, target, agentId, onConfirm, onCancel }: KillDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="kill-dialog-title"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 8 }}
        transition={{ type: "spring", damping: 20, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-xl p-5 w-full max-w-sm space-y-4"
        style={{
          background: "var(--bg-raised)",
          border: "1px solid rgba(239,68,68,0.3)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center mt-0.5">
            <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />
          </div>
          <div>
            <h3
              id="kill-dialog-title"
              className="text-sm font-semibold"
              style={{ color: "var(--fg-primary)" }}
            >
              {agentId ? "Interrompere l'agente?" : `Terminare il processo PID ${pid}?`}
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--fg-secondary)" }}>
              {agentId
                ? `Agente: ${agentId}`
                : `${type}: ${target || "sconosciuto"}`}
            </p>
            {!agentId && (
              <p className="text-[10px] mt-1.5" style={{ color: "var(--fg-muted)" }}>
                Tutti gli agenti del terminale verranno fermati.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-secondary)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--border-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--bg-overlay)")
            }
          >
            Annulla
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all focus:outline-2 focus:outline-offset-2 focus:outline-red-500"
            style={{
              background: agentId ? "#F97316" : "#EF4444",
              boxShadow: agentId
                ? "0 2px 8px rgba(249,115,22,0.3)"
                : "0 2px 8px rgba(239,68,68,0.3)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = agentId ? "#EA580C" : "#DC2626")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = agentId ? "#F97316" : "#EF4444")
            }
          >
            {agentId ? "Interrompi" : "Termina"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Agent Row ────────────────────────────────────────────────────────────────

interface AgentRowProps {
  agent: AgentInfo;
  onKill: (agentId: string) => void;
}

function AgentRow({ agent, onKill }: AgentRowProps) {
  const color = getDeptColor(agent.department);
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6, height: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 pl-8 pr-3 py-1.5 group"
    >
      {/* Status dot */}
      <div className="relative shrink-0 w-2 h-2">
        {isRunning && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color }}
            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className="relative block w-2 h-2 rounded-full"
          style={{
            backgroundColor: isError ? "#EF4444" : isRunning ? color : "rgba(255,255,255,0.2)",
          }}
        />
      </div>

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--fg-muted)" }} aria-hidden="true" />
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: "var(--fg-secondary)" }}
          >
            {agent.id.length > 24 ? agent.id.slice(0, 24) + "\u2026" : agent.id}
          </span>
          <span
            className="shrink-0 px-1 py-0.5 rounded text-[9px] font-medium"
            style={{
              background: `${color}20`,
              color,
            }}
          >
            {getDeptLabel(agent.department)}
          </span>
          <span
            className="shrink-0 text-[9px] font-medium"
            style={{
              color: isRunning
                ? "#34D399"
                : isError
                ? "#EF4444"
                : "var(--fg-muted)",
            }}
          >
            {isRunning ? "running" : isError ? "error" : "done"}
          </span>
        </div>
        {agent.task && (
          <p
            className="text-[10px] truncate mt-0.5 pl-4"
            style={{ color: "var(--fg-muted)" }}
          >
            {agent.task}
          </p>
        )}
      </div>

      {/* Kill button (only when running) */}
      {isRunning && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onKill(agent.id);
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded focus:outline-2 focus:outline-offset-1 focus:outline-orange-500 focus:opacity-100"
          aria-label={`Interrompi agente ${agent.id}`}
          title="Interrompi agente"
        >
          <XCircle className="w-3 h-3 text-orange-400 hover:text-orange-300" aria-hidden="true" />
        </button>
      )}
    </motion.div>
  );
}

// ─── Terminal Card ────────────────────────────────────────────────────────────

interface TerminalCardProps {
  session: SessionInfo;
  isSelected: boolean;
  onSelect: () => void;
  onKillSession: (pid: number) => void;
  onKillAgent: (pid: number, agentId: string) => void;
}

function TerminalCard({
  session,
  isSelected,
  onSelect,
  onKillSession,
  onKillAgent,
}: TerminalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [uptime, setUptime] = useState(formatUptime(session.startedAt));
  const cfg = TYPE_CONFIG[session.type];
  const Icon = cfg.icon;
  const dept = session.department ?? session.target;
  const deptColor = getDeptColor(dept);
  const deptLabel = getDeptLabel(dept);
  const isClosing = session.status === "closing";
  const indicatorColor = getSessionIndicatorColor(session);

  // Update uptime every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatUptime(session.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  return (
    <div
      className="rounded-lg overflow-hidden transition-all"
      style={{
        background: isSelected
          ? "rgba(255,107,53,0.06)"
          : "var(--bg-overlay)",
        border: `1px solid ${isSelected ? "rgba(255,107,53,0.25)" : "var(--border-dark-subtle)"}`,
      }}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none group"
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        aria-label={`Seleziona sessione PID ${session.pid} - ${deptLabel}`}
        aria-expanded={expanded}
      >
        {/* Status indicator (color-coded) */}
        <div className="relative shrink-0 w-2 h-2">
          {!isClosing && session.status === "active" && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: indicatorColor }}
              animate={{ scale: [1, 2], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              aria-hidden="true"
            />
          )}
          <span
            className="relative block w-2 h-2 rounded-full"
            style={{ backgroundColor: indicatorColor }}
            aria-hidden="true"
          />
        </div>

        {/* Type icon */}
        <div
          className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${cfg.bg}`}
        >
          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} aria-hidden="true" />
        </div>

        {/* PID + dept + task */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: "var(--fg-primary)" }}
            >
              PID {session.pid}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{
                background: `${deptColor}20`,
                color: deptColor,
              }}
            >
              {deptLabel}
            </span>
            {isClosing && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-yellow-500/15 text-yellow-400">
                in chiusura
              </span>
            )}
          </div>

          {session.currentTask && (
            <p
              className="text-[10px] truncate mt-0.5"
              style={{ color: "var(--fg-muted)" }}
              title={session.currentTask}
            >
              {session.currentTask}
            </p>
          )}
        </div>

        {/* Uptime */}
        <span
          className="shrink-0 text-[10px] tabular-nums font-mono"
          style={{ color: "var(--fg-muted)" }}
          title={`Avviato: ${new Date(session.startedAt).toLocaleTimeString("it-IT")}`}
        >
          {uptime}
        </span>

        {/* Agent count badge */}
        {session.agentCount > 0 && (
          <span
            className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[9px] font-semibold flex items-center justify-center bg-[#FF6B35]/15 text-[#FF6B35]"
            aria-label={`${session.agentCount} agent${session.agentCount !== 1 ? "i" : "e"}`}
          >
            {session.agentCount}
          </span>
        )}

        {/* Action buttons */}
        <div
          className="shrink-0 flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* View output */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="p-1 rounded transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            style={{ color: "var(--fg-muted)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--fg-secondary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--fg-muted)")
            }
            aria-label={`Visualizza output sessione ${session.pid}`}
            title="Visualizza output"
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {/* Expand/collapse agents */}
          {session.agents.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((p) => !p);
              }}
              className="p-1 rounded transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
              style={{ color: "var(--fg-muted)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--fg-secondary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--fg-muted)")
              }
              aria-label={`${expanded ? "Comprimi" : "Espandi"} lista agenti`}
              aria-expanded={expanded}
            >
              {expanded ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          )}

          {/* Kill session (red) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onKillSession(session.pid);
            }}
            className="p-1 rounded transition-colors focus:outline-2 focus:outline-offset-1 focus:outline-red-500"
            style={{ color: "var(--fg-muted)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "#EF4444")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--fg-muted)")
            }
            aria-label={`Termina sessione PID ${session.pid}`}
            title="Termina processo"
          >
            <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Agents list (expandable) */}
      <AnimatePresence>
        {expanded && session.agents.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
            style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
          >
            <div className="py-1">
              <AnimatePresence>
                {session.agents.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    onKill={(agentId) => onKillAgent(session.pid, agentId)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      {loading ? (
        <>
          <RefreshCw
            className="w-5 h-5 animate-spin"
            style={{ color: "var(--fg-muted)" }}
            aria-hidden="true"
          />
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Caricamento sessioni...
          </p>
        </>
      ) : (
        <>
          <Zap
            className="w-7 h-7 opacity-20"
            style={{ color: "var(--fg-muted)" }}
            aria-hidden="true"
          />
          <p
            className="text-sm font-medium text-center"
            style={{ color: "var(--fg-secondary)" }}
          >
            Nessuna sessione attiva
          </p>
          <p className="text-xs text-center max-w-[200px]" style={{ color: "var(--fg-muted)" }}>
            Le sessioni appariranno quando un processo viene avviato
          </p>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TerminalPanel({ onSelectSession, selectedPid }: TerminalPanelProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [stats, setStats] = useState({ count: 0, activeCount: 0, totalAgents: 0 });
  const [loading, setLoading] = useState(true);
  const [killTarget, setKillTarget] = useState<{
    pid: number;
    agentId?: string;
  } | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch sessions every 3 seconds
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/company/sessions?orphans=true", {
        headers: getConsoleAuthHeaders(),
      });
      if (res.status === 404) {
        setSessions([]);
        setStats({ count: 0, activeCount: 0, totalAgents: 0 });
        setError(null);
        return;
      }
      if (res.status === 401) {
        setError("Sessione scaduta");
        return;
      }
      if (!res.ok) {
        setError(`Errore ${res.status}`);
        return;
      }
      const json: SessionsResponse = await res.json();
      setSessions(json.sessions ?? []);
      setStats({
        count: json.count ?? 0,
        activeCount: json.activeCount ?? 0,
        totalAgents: json.totalAgents ?? 0,
      });
      setError(null);
    } catch {
      // Silently ignore — polling will retry
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll every 15 seconds (was 3s — caused server overload via wmic on Windows)
  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Kill a session or agent
  const handleKill = useCallback(
    async (pid: number, agentId?: string) => {
      setKillTarget(null);
      setKilling(pid);
      try {
        const res = await fetch(`/api/company/sessions/${pid}/kill`, {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify(agentId ? { agentId } : {}),
        });
        if (res.ok) {
          await fetchSessions();
        }
      } catch {
        // Silently ignore
      } finally {
        setKilling(null);
      }
    },
    [fetchSessions]
  );

  const killTargetSession = killTarget
    ? sessions.find((s) => s.pid === killTarget.pid)
    : null;

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Header stats */}
        <div
          className="flex-none flex items-center gap-4 px-4 py-2.5"
          style={{
            borderBottom: "1px solid var(--border-dark-subtle)",
            background: "var(--bg-raised)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Terminal
              className="w-3.5 h-3.5"
              style={{ color: "var(--fg-muted)" }}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>
              Terminali
            </span>
          </div>

          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--fg-muted)" }}>
            <span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: stats.activeCount > 0 ? "var(--success)" : "var(--fg-secondary)" }}
              >
                {stats.activeCount}
              </span>{" "}
              attivi
            </span>
            <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
            <span>
              <span className="font-semibold tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                {stats.totalAgents}
              </span>{" "}
              agenti
            </span>
          </div>

          {error && (
            <span className="text-[10px]" style={{ color: "var(--error)" }}>
              {error}
            </span>
          )}

          <div className="flex-1" />

          <button
            onClick={fetchSessions}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-all focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            style={{
              background: "var(--bg-overlay)",
              color: "var(--fg-muted)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--border-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--bg-overlay)")
            }
            aria-label="Aggiorna lista sessioni"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Aggiorna
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && sessions.length === 0 ? (
            <EmptyState loading={true} />
          ) : sessions.length === 0 ? (
            <EmptyState loading={false} />
          ) : (
            <div className="p-3 space-y-2">
              {/* Legend */}
              <div className="flex items-center gap-3 mb-2 text-[9px]" style={{ color: "var(--fg-muted)" }}>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#34D399" }} />
                  console
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#d4a843" }} />
                  esterno
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#6b7280" }} />
                  interattivo
                </span>
              </div>

              <AnimatePresence mode="popLayout">
                {sessions.map((session) => (
                  <motion.div
                    key={session.pid}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{
                      opacity: killing === session.pid ? 0.4 : 1,
                      y: 0,
                    }}
                    exit={{ opacity: 0, y: 4, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TerminalCard
                      session={session}
                      isSelected={selectedPid === session.pid}
                      onSelect={() => onSelectSession?.(session)}
                      onKillSession={(pid) => setKillTarget({ pid })}
                      onKillAgent={(pid, agentId) =>
                        setKillTarget({ pid, agentId })
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Kill confirmation dialog */}
      <AnimatePresence>
        {killTarget && killTargetSession && (
          <KillDialog
            pid={killTarget.pid}
            type={TYPE_CONFIG[killTargetSession.type].label}
            target={killTargetSession.target}
            agentId={killTarget.agentId}
            onConfirm={() => handleKill(killTarget.pid, killTarget.agentId)}
            onCancel={() => setKillTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
