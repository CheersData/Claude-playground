"use client";

/**
 * TerminalPanel — Unified Process Monitor inside Terminal.
 *
 * Shows all running processes in the system:
 *   - Sessions (console, task-runner, daemon, interactive) with nested agents
 *   - Company tasks stuck in_progress (with Reset action)
 *   - Trading scheduler status (with Kill action)
 *   - Data connector syncs (read-only)
 *
 * Data sources (G3: unified 5s poll for all):
 *   - /api/company/sessions?orphans=true (sessions + agents)
 *   - /api/company/processes (tasks, trading, data connector syncs)
 *
 * Features:
 *   - G1: Sub-agent heartbeat via file mtime
 *   - G2: Data connector sync visibility
 *   - G3: Single 5s polling interval (removed redundant 15s sessions poll)
 *   - G4: Expected duration hints with overdue warnings
 *   - G5: Daemon heartbeat reads
 *
 * ADR-005: Terminal/Agent Monitoring Architecture
 * Architecture Plan: company/architecture/plans/process-monitor.md
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
  ListTodo,
  TrendingUp,
  RotateCcw,
  Wifi,
  WifiOff,
  Database,
  Shield,
  ShieldAlert,
  Skull,
} from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";
import type { MonitoredProcess, ProcessSummary } from "@/lib/company/process-monitor";

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
  zombieSubAgents: number;
  sessions: SessionInfo[];
}

/** Response from GET /api/company/processes */
interface ProcessesResponse {
  processes: MonitoredProcess[];
  summary: ProcessSummary;
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

/** OS process category colors */
const OS_CATEGORY_COLORS: Record<string, string> = {
  self: "#4ade80",
  vscode: "#4ade80",
  "claude-code": "#38bdf8",
  "nextjs-dev": "#c084fc",
  daemon: "#d4a843",
  "task-runner": "#d4a843",
  worker: "#94a3b8",
  unknown: "#f87171",
};

/** OS process category Italian labels */
const OS_CATEGORY_LABELS: Record<string, string> = {
  self: "Questo processo",
  vscode: "VS Code",
  "claude-code": "Claude Code",
  "nextjs-dev": "Next.js Dev",
  daemon: "Daemon",
  "task-runner": "Task Runner",
  worker: "Worker",
  unknown: "Sconosciuto",
};

/** Group ordering for OS process categories */
const OS_CATEGORY_ORDER: string[] = [
  "self",
  "vscode",
  "claude-code",
  "nextjs-dev",
  "worker",
  "daemon",
  "task-runner",
  "unknown",
];

/** Task stale threshold: 1 hour */
const TASK_STALE_MS = 60 * 60 * 1000;

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

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
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

// ─── Unified Kill Confirmation Dialog ─────────────────────────────────────────

interface UnifiedKillDialogProps {
  /** Process ID (for display) */
  processId: string;
  /** Process type label */
  typeLabel: string;
  /** Process description */
  description: string;
  /** Button color: red for kill, amber for reset */
  variant: "kill" | "reset";
  /** Sub-text explaining consequences */
  consequence?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function UnifiedKillDialog({
  processId,
  typeLabel,
  description,
  variant,
  consequence,
  onConfirm,
  onCancel,
}: UnifiedKillDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const isReset = variant === "reset";
  const accentColor = isReset ? "#F59E0B" : "#EF4444";
  const accentColorHover = isReset ? "#D97706" : "#DC2626";
  const borderColor = isReset ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)";
  const shadowColor = isReset
    ? "0 2px 8px rgba(245,158,11,0.3)"
    : "0 2px 8px rgba(239,68,68,0.3)";

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
          border: `1px solid ${borderColor}`,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
            style={{ background: `${accentColor}20` }}
          >
            {isReset ? (
              <RotateCcw className="w-4 h-4" style={{ color: accentColor }} aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-4 h-4" style={{ color: accentColor }} aria-hidden="true" />
            )}
          </div>
          <div>
            <h3
              id="kill-dialog-title"
              className="text-sm font-semibold"
              style={{ color: "var(--fg-primary)" }}
            >
              {isReset ? "Resettare il task?" : `Terminare ${typeLabel}?`}
            </h3>
            <p className="text-xs mt-1" style={{ color: "var(--fg-secondary)" }}>
              {description}
            </p>
            {consequence && (
              <p className="text-[10px] mt-1.5" style={{ color: "var(--fg-muted)" }}>
                {consequence}
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
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all focus:outline-2 focus:outline-offset-2"
            style={{
              background: accentColor,
              boxShadow: shadowColor,
              outlineColor: accentColor,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = accentColorHover)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = accentColor)
            }
          >
            {isReset ? "Reset" : "Termina"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Legacy Kill Dialog (for sessions — keeps backward compat) ──────────────

interface KillDialogProps {
  pid: number;
  type: string;
  target: string;
  agentId?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function KillDialog({ pid, type, target, agentId, onConfirm, onCancel }: KillDialogProps) {
  return (
    <UnifiedKillDialog
      processId={agentId ?? `PID ${pid}`}
      typeLabel={agentId ? "agente" : `processo PID ${pid}`}
      description={agentId ? `Agente: ${agentId}` : `${type}: ${target || "sconosciuto"}`}
      variant={agentId ? "reset" : "kill"}
      consequence={!agentId ? "Tutti gli agenti del terminale verranno fermati." : undefined}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ─── Agent Row ────────────────────────────────────────────────────────────────

interface AgentRowProps {
  agent: AgentInfo;
  onKill: (agentId: string) => void;
}

/** Check if an agent has been running longer than the long-running threshold (10 minutes) */
function isAgentLongRunning(agent: AgentInfo): boolean {
  if (agent.status !== "running") return false;
  return Date.now() - agent.timestamp > 10 * 60 * 1000;
}

/** Check if an agent is a file-tracked sub-agent */
function isSubAgent(agent: AgentInfo): boolean {
  return agent.id.startsWith("subagent-");
}

function AgentRow({ agent, onKill }: AgentRowProps) {
  const color = getDeptColor(agent.department);
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";
  const longRunning = isAgentLongRunning(agent);
  const subAgent = isSubAgent(agent);

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
        {isRunning && !longRunning && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color }}
            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {longRunning && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: "#F97316" }}
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className="relative block w-2 h-2 rounded-full"
          style={{
            backgroundColor: longRunning ? "#F97316" : isError ? "#EF4444" : isRunning ? color : "rgba(255,255,255,0.2)",
          }}
        />
      </div>

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {subAgent ? (
            <Bot className="w-2.5 h-2.5 shrink-0" style={{ color: "#A78BFA" }} aria-hidden="true" />
          ) : (
            <Cpu className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--fg-muted)" }} aria-hidden="true" />
          )}
          <span
            className="text-[10px] font-mono truncate"
            style={{ color: subAgent ? "#A78BFA" : "var(--fg-secondary)" }}
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
          {longRunning && (
            <span
              className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold"
              style={{
                background: "rgba(249,115,22,0.15)",
                color: "#F97316",
              }}
            >
              long-running
            </span>
          )}
          {subAgent && !longRunning && (
            <span
              className="shrink-0 px-1 py-0.5 rounded text-[9px] font-medium"
              style={{
                background: "rgba(167,139,250,0.15)",
                color: "#A78BFA",
              }}
            >
              sub-agent
            </span>
          )}
          <span
            className="shrink-0 text-[9px] font-medium"
            style={{
              color: longRunning
                ? "#F97316"
                : isRunning
                ? "#34D399"
                : isError
                ? "#EF4444"
                : "var(--fg-muted)",
            }}
          >
            {longRunning ? "long-running" : isRunning ? "running" : isError ? "error" : "done"}
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
          title={longRunning ? "Termina agente long-running" : "Interrompi agente"}
        >
          <XCircle
            className={`w-3 h-3 ${longRunning ? "text-orange-500 hover:text-orange-400" : "text-orange-400 hover:text-orange-300"}`}
            aria-hidden="true"
          />
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

// ─── Task Row (Process Monitor) ──────────────────────────────────────────────

interface TaskRowProps {
  process: MonitoredProcess;
  onReset: (process: MonitoredProcess) => void;
}

function TaskRow({ process, onReset }: TaskRowProps) {
  const [elapsed, setElapsed] = useState(formatElapsed(process.elapsedMs));
  const isStale = process.status === "stale";
  const deptColor = getDeptColor(process.department);
  const assignedTo = process.meta?.assignedTo as string | undefined;
  const expectedMs = (process.meta?.expectedDurationMs as number) ?? 0;
  const isOverdue = expectedMs > 0 && process.elapsedMs > expectedMs * 2;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const startMs = new Date(process.startedAt).getTime();
      setElapsed(formatElapsed(now - startMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [process.startedAt]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6, height: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-3 py-2 group rounded-lg"
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Status dot */}
      <div className="relative shrink-0 w-2 h-2">
        {!isStale && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: "#F59E0B" }}
            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {isStale && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: "#F97316" }}
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className="relative block w-2 h-2 rounded-full"
          style={{ backgroundColor: isStale ? "#F97316" : "#F59E0B" }}
        />
      </div>

      {/* Task icon */}
      <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-amber-500/15">
        <ListTodo className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
      </div>

      {/* Task info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            {process.label}
          </span>
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{
              background: `${deptColor}20`,
              color: deptColor,
            }}
          >
            {getDeptLabel(process.department)}
          </span>
          {isStale && (
            <span
              className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold"
              style={{
                background: "rgba(249,115,22,0.15)",
                color: "#F97316",
              }}
            >
              long-running
            </span>
          )}
        </div>
        <p
          className="text-[10px] truncate mt-0.5"
          style={{ color: "var(--fg-muted)" }}
          title={process.description}
        >
          {process.description}
        </p>
        {assignedTo && assignedTo !== "unassigned" && (
          <p
            className="text-[9px] truncate mt-0.5"
            style={{ color: "var(--fg-muted)" }}
          >
            claimed by: {assignedTo}
          </p>
        )}
      </div>

      {/* Elapsed time */}
      <span
        className="shrink-0 text-[10px] tabular-nums font-mono"
        style={{ color: isStale || isOverdue ? "#F97316" : "var(--fg-muted)" }}
      >
        {elapsed}
      </span>

      {/* G4: Expected duration hint */}
      {expectedMs > 0 && (
        <span
          className="shrink-0 text-[9px]"
          style={{ color: isOverdue ? "#F97316" : "var(--fg-muted)" }}
          title={`Durata attesa: ~${formatElapsed(expectedMs)}`}
        >
          ~{formatElapsed(expectedMs)}
        </span>
      )}

      {/* Reset button */}
      {process.killable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReset(process);
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded focus:outline-2 focus:outline-offset-1 focus:outline-amber-500 focus:opacity-100"
          aria-label={`Reset task ${process.label}`}
          title="Reset task (riporta a open)"
        >
          <RotateCcw
            className="w-3.5 h-3.5 text-amber-400 hover:text-amber-300"
            aria-hidden="true"
          />
        </button>
      )}
    </motion.div>
  );
}

// ─── Trading Row (Process Monitor) ───────────────────────────────────────────

interface TradingRowProps {
  process: MonitoredProcess;
  onKill: (process: MonitoredProcess) => void;
}

function TradingRow({ process, onKill }: TradingRowProps) {
  const [elapsed, setElapsed] = useState(formatElapsed(process.elapsedMs));
  const isStale = process.status === "stale";
  const isRunning = process.status === "running";

  const currentJob = process.meta?.currentJob as string | undefined;
  const lastPipelineRun = process.meta?.lastPipelineRun as string | undefined;
  const lastPipelineStatus = process.meta?.lastPipelineStatus as string | undefined;
  const nextScheduledRun = process.meta?.nextScheduledRun as string | undefined;
  const expectedMs = (process.meta?.expectedDurationMs as number) ?? 0;
  const isOverdue = expectedMs > 0 && process.elapsedMs > expectedMs * 2;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const startMs = new Date(process.startedAt).getTime();
      setElapsed(formatElapsed(now - startMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [process.startedAt]);

  const StatusIcon = isStale ? WifiOff : isRunning ? Wifi : WifiOff;
  const statusColor = isStale ? "#F97316" : isRunning ? "#22D3EE" : "#6b7280";
  const statusLabel = isStale ? "stale" : isRunning ? "running" : "offline";

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6, height: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg overflow-hidden group"
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Status dot */}
        <div className="relative shrink-0 w-2 h-2">
          {isRunning && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: "#22D3EE" }}
              animate={{ scale: [1, 2], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          {isStale && (
            <motion.span
              className="absolute inset-0 rounded-full"
              style={{ backgroundColor: "#F97316" }}
              animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span
            className="relative block w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
        </div>

        {/* Icon */}
        <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-cyan-500/15">
          <TrendingUp className="w-3.5 h-3.5 text-cyan-400" aria-hidden="true" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: "var(--fg-primary)" }}
            >
              {process.label}
            </span>
            {process.pid && (
              <span
                className="text-[10px] font-mono"
                style={{ color: "var(--fg-muted)" }}
              >
                PID {process.pid}
              </span>
            )}
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{
                background: `${statusColor}20`,
                color: statusColor,
              }}
            >
              {statusLabel}
            </span>
            {isStale && (
              <span
                className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold"
                style={{
                  background: "rgba(249,115,22,0.15)",
                  color: "#F97316",
                }}
              >
                stale
              </span>
            )}
            {isOverdue && !isStale && (
              <span
                className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold"
                style={{
                  background: "rgba(249,115,22,0.15)",
                  color: "#F97316",
                }}
              >
                overdue
              </span>
            )}
          </div>
          <p
            className="text-[10px] truncate mt-0.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {process.description}
          </p>
        </div>

        {/* Uptime */}
        <span
          className="shrink-0 text-[10px] tabular-nums font-mono"
          style={{ color: isOverdue ? "#F97316" : "var(--fg-muted)" }}
        >
          {elapsed}
        </span>

        {/* G4: Expected duration hint */}
        {expectedMs > 0 && isRunning && (
          <span
            className="shrink-0 text-[9px]"
            style={{ color: isOverdue ? "#F97316" : "var(--fg-muted)" }}
            title={`Durata attesa: ~${formatElapsed(expectedMs)}`}
          >
            ~{formatElapsed(expectedMs)}
          </span>
        )}

        {/* Kill button */}
        {process.killable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onKill(process);
            }}
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded focus:outline-2 focus:outline-offset-1 focus:outline-red-500 focus:opacity-100"
            aria-label={`Termina ${process.label}`}
            title="Termina scheduler"
          >
            <XCircle
              className="w-3.5 h-3.5 text-red-400 hover:text-red-300"
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      {/* Meta details row */}
      {(currentJob || lastPipelineRun || nextScheduledRun) && (
        <div
          className="px-3 pb-2 pt-0 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px]"
          style={{ color: "var(--fg-muted)" }}
        >
          {currentJob && (
            <span>
              Job: <span style={{ color: "var(--fg-secondary)" }}>{currentJob}</span>
            </span>
          )}
          {lastPipelineRun && (
            <span>
              Ultimo run:{" "}
              <span style={{ color: lastPipelineStatus === "error" ? "#EF4444" : "var(--fg-secondary)" }}>
                {new Date(lastPipelineRun).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                {lastPipelineStatus ? ` (${lastPipelineStatus})` : ""}
              </span>
            </span>
          )}
          {nextScheduledRun && (
            <span>
              Prossimo:{" "}
              <span style={{ color: "var(--fg-secondary)" }}>
                {new Date(nextScheduledRun).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ─── Sync Row (Data Connector — G2) ─────────────────────────────────────────

interface SyncRowProps {
  process: MonitoredProcess;
}

function SyncRow({ process }: SyncRowProps) {
  const [elapsed, setElapsed] = useState(formatElapsed(process.elapsedMs));
  const recordsProcessed = (process.meta?.recordsProcessed as number) ?? 0;
  const itemsFetched = (process.meta?.itemsFetched as number) ?? 0;
  const syncErrors = (process.meta?.errors as number) ?? 0;
  const expectedMs = (process.meta?.expectedDurationMs as number) ?? 0;
  const isOverdue = expectedMs > 0 && process.elapsedMs > expectedMs * 2;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const startMs = new Date(process.startedAt).getTime();
      setElapsed(formatElapsed(now - startMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [process.startedAt]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6, height: 0 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Status dot — always running (we only query running syncs) */}
        <div className="relative shrink-0 w-2 h-2">
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: isOverdue ? "#F97316" : "#A78BFA" }}
            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
          <span
            className="relative block w-2 h-2 rounded-full"
            style={{ backgroundColor: isOverdue ? "#F97316" : "#A78BFA" }}
          />
        </div>

        {/* Icon */}
        <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-[#A78BFA]/15">
          <Database className="w-3.5 h-3.5 text-[#A78BFA]" aria-hidden="true" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-xs font-mono font-semibold"
              style={{ color: "var(--fg-primary)" }}
            >
              {process.label}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium"
              style={{
                background: "rgba(167,139,250,0.15)",
                color: "#A78BFA",
              }}
            >
              sync
            </span>
            {isOverdue && (
              <span
                className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold"
                style={{
                  background: "rgba(249,115,22,0.15)",
                  color: "#F97316",
                }}
              >
                overdue
              </span>
            )}
          </div>
          <p
            className="text-[10px] truncate mt-0.5"
            style={{ color: "var(--fg-muted)" }}
            title={process.description}
          >
            {process.description}
          </p>
        </div>

        {/* Records processed */}
        <div className="shrink-0 text-right">
          <span
            className="text-[10px] tabular-nums font-mono block"
            style={{ color: "var(--fg-secondary)" }}
          >
            {recordsProcessed}/{itemsFetched > 0 ? itemsFetched : "?"}
          </span>
          {syncErrors > 0 && (
            <span
              className="text-[9px] tabular-nums font-mono"
              style={{ color: "#EF4444" }}
            >
              {syncErrors} err
            </span>
          )}
        </div>

        {/* Elapsed time */}
        <span
          className="shrink-0 text-[10px] tabular-nums font-mono"
          style={{ color: isOverdue ? "#F97316" : "var(--fg-muted)" }}
        >
          {elapsed}
        </span>

        {/* Expected duration hint */}
        {expectedMs > 0 && (
          <span
            className="shrink-0 text-[9px]"
            style={{ color: "var(--fg-muted)" }}
            title={`Durata attesa: ~${formatElapsed(expectedMs)}`}
          >
            ~{formatElapsed(expectedMs)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─── OS Process Row (G6 — System Processes) ─────────────────────────────────

interface OSProcessRowProps {
  process: MonitoredProcess;
  onKill: (process: MonitoredProcess) => void;
}

function OSProcessRow({ process, onKill }: OSProcessRowProps) {
  const [elapsed, setElapsed] = useState(formatElapsed(process.elapsedMs));
  const isStale = process.status === "stale";

  const category = (process.meta?.osCategory as string) ?? "unknown";
  const memoryMB = (process.meta?.memoryMB as number) ?? 0;
  const commandLine = (process.meta?.commandLine as string) ?? "";
  const sacred = (process.meta?.sacred as boolean) ?? false;
  const categoryColor = OS_CATEGORY_COLORS[category] ?? "#f87171";
  const categoryLabel = OS_CATEGORY_LABELS[category] ?? category;

  // Determine protection level
  const isProtected = category === "claude-code" || category === "nextjs-dev";
  const protectionLevel = sacred ? "sacred" : isProtected ? "protected" : "killable";

  // Truncated command line for display
  const cmdTruncated = commandLine.length > 60
    ? commandLine.substring(0, 57) + "..."
    : commandLine;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const startMs = new Date(process.startedAt).getTime();
      setElapsed(formatElapsed(now - startMs));
    }, 1000);
    return () => clearInterval(interval);
  }, [process.startedAt]);

  // Protection badge config
  const protectionConfig = {
    sacred: { label: "SACRED", color: "#4ade80", icon: Shield },
    protected: { label: "PROTETTO", color: "#fbbf24", icon: ShieldAlert },
    killable: { label: "KILLABLE", color: "#f87171", icon: Skull },
  }[protectionLevel];

  const ProtectionIcon = protectionConfig.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 6, height: 0 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-2 px-3 py-2 group rounded-lg"
      style={{
        background: "var(--bg-overlay)",
        border: `1px solid var(--border-dark-subtle)`,
      }}
    >
      {/* Status dot */}
      <div className="relative shrink-0 w-2 h-2">
        {!isStale && process.status === "running" && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: categoryColor }}
            animate={{ scale: [1, 2], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {isStale && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: "#F97316" }}
            animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span
          className="relative block w-2 h-2 rounded-full"
          style={{ backgroundColor: isStale ? "#F97316" : categoryColor }}
        />
      </div>

      {/* Icon */}
      <div
        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center"
        style={{ background: `${categoryColor}20` }}
      >
        <Cpu className="w-3.5 h-3.5" style={{ color: categoryColor }} aria-hidden="true" />
      </div>

      {/* Process info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* PID */}
          <span
            className="text-xs font-mono font-semibold"
            style={{ color: "var(--fg-primary)" }}
          >
            PID {process.pid}
          </span>
          {/* Category badge */}
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-medium"
            style={{
              background: `${categoryColor}20`,
              color: categoryColor,
            }}
          >
            {categoryLabel}
          </span>
          {/* Protection badge */}
          <span
            className="shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold"
            style={{
              background: `${protectionConfig.color}15`,
              color: protectionConfig.color,
            }}
          >
            <ProtectionIcon className="w-2.5 h-2.5" aria-hidden="true" />
            {protectionConfig.label}
          </span>
          {/* Memory badge */}
          <span
            className="shrink-0 text-[9px] font-mono"
            style={{ color: "var(--fg-muted)" }}
          >
            {memoryMB.toFixed(1)} MB
          </span>
          {isStale && (
            <span
              className="shrink-0 px-1 py-0.5 rounded text-[9px] font-semibold"
              style={{
                background: "rgba(249,115,22,0.15)",
                color: "#F97316",
              }}
            >
              stale
            </span>
          )}
        </div>
        {/* Command line */}
        <p
          className="text-[10px] font-mono truncate mt-0.5"
          style={{ color: "var(--fg-muted)" }}
          title={commandLine}
        >
          {cmdTruncated}
        </p>
      </div>

      {/* Uptime */}
      <span
        className="shrink-0 text-[10px] tabular-nums font-mono"
        style={{ color: isStale ? "#F97316" : "var(--fg-muted)" }}
      >
        {elapsed}
      </span>

      {/* Kill button — only for killable processes (not sacred, not protected) */}
      {process.killable && protectionLevel === "killable" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onKill(process);
          }}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded focus:outline-2 focus:outline-offset-1 focus:outline-red-500 focus:opacity-100"
          aria-label={`Termina processo PID ${process.pid}`}
          title="Termina processo"
        >
          <XCircle
            className="w-3.5 h-3.5 text-red-400 hover:text-red-300"
            aria-hidden="true"
          />
        </button>
      )}
    </motion.div>
  );
}

// ─── Collapsible Section Header ──────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  /** Badge color for the count pill */
  countColor?: string;
  /** Extra badge (e.g., "2 stale") */
  badge?: { label: string; color: string };
}

function SectionHeader({
  icon,
  label,
  count,
  expanded,
  onToggle,
  countColor = "var(--fg-secondary)",
  badge,
}: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full px-1 py-1.5 text-left select-none group"
      aria-expanded={expanded}
    >
      <span style={{ color: "var(--fg-muted)" }}>
        {expanded ? (
          <ChevronDown className="w-3 h-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3 h-3" aria-hidden="true" />
        )}
      </span>
      {icon}
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
      </span>
      <span
        className="text-[10px] font-semibold tabular-nums"
        style={{ color: countColor }}
      >
        {count}
      </span>
      {badge && (
        <span
          className="px-1 py-0.5 rounded text-[8px] font-semibold"
          style={{
            background: `${badge.color}20`,
            color: badge.color,
          }}
        >
          {badge.label}
        </span>
      )}
    </button>
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
            Caricamento processi...
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
            Nessun processo attivo
          </p>
          <p className="text-xs text-center max-w-[200px]" style={{ color: "var(--fg-muted)" }}>
            Sessioni, task e trading appariranno qui quando vengono avviati
          </p>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TerminalPanel({ onSelectSession, selectedPid }: TerminalPanelProps) {
  // ── Existing session state ──
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [stats, setStats] = useState({ count: 0, activeCount: 0, totalAgents: 0, zombieSubAgents: 0 });
  const [loading, setLoading] = useState(true);
  const [killTarget, setKillTarget] = useState<{
    pid: number;
    agentId?: string;
  } | null>(null);
  const [killing, setKilling] = useState<number | null>(null);
  const [killingZombies, setKillingZombies] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Unified Process Monitor state ──
  const [taskProcesses, setTaskProcesses] = useState<MonitoredProcess[]>([]);
  const [tradingProcesses, setTradingProcesses] = useState<MonitoredProcess[]>([]);
  const [syncProcesses, setSyncProcesses] = useState<MonitoredProcess[]>([]);
  const [osProcesses, setOsProcesses] = useState<MonitoredProcess[]>([]);
  const [processSummary, setProcessSummary] = useState<ProcessSummary>({
    total: 0,
    running: 0,
    stale: 0,
    killable: 0,
  });
  const [processKillTarget, setProcessKillTarget] = useState<MonitoredProcess | null>(null);
  const [killingProcess, setKillingProcess] = useState<string | null>(null);

  // ── Section collapse state ──
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [tradingExpanded, setTradingExpanded] = useState(true);
  const [syncsExpanded, setSyncsExpanded] = useState(true);
  const [osExpanded, setOsExpanded] = useState(true);

  // ── Fetch sessions (called as part of the unified poll, not independently) ──
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/company/sessions?orphans=true", {
        headers: getConsoleAuthHeaders(),
      });
      if (res.status === 404) {
        setSessions([]);
        setStats({ count: 0, activeCount: 0, totalAgents: 0, zombieSubAgents: 0 });
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
        zombieSubAgents: json.zombieSubAgents ?? 0,
      });
      setError(null);
    } catch {
      // Silently ignore — polling will retry
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch unified processes + sessions together (every 5s — G3 optimization) ──
  const fetchProcesses = useCallback(async () => {
    try {
      const res = await fetch("/api/company/processes", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) return;
      const json: ProcessesResponse = await res.json();

      // Split processes by type
      const tasks: MonitoredProcess[] = [];
      const trading: MonitoredProcess[] = [];
      const syncs: MonitoredProcess[] = [];
      const osProcs: MonitoredProcess[] = [];

      for (const p of json.processes) {
        if (p.type === "task") {
          tasks.push(p);
        } else if (p.type === "trading-scheduler" || p.type === "trading-pipeline") {
          trading.push(p);
        } else if (p.type === "data-connector-sync") {
          syncs.push(p);
        } else if (p.type === "os-node-process") {
          osProcs.push(p);
        }
      }

      setTaskProcesses(tasks);
      setTradingProcesses(trading);
      setSyncProcesses(syncs);
      setOsProcesses(osProcs);
      setProcessSummary(json.summary);
    } catch {
      // Silently ignore — polling will retry
    }
  }, []);

  // G3: Single unified poll at 5s for both sessions and processes (removed redundant 15s sessions poll)
  useEffect(() => {
    // Initial fetch
    fetchSessions();
    fetchProcesses();
    // Unified poll: both sessions and processes every 5s
    const interval = setInterval(() => {
      fetchSessions();
      fetchProcesses();
    }, 5_000);
    return () => clearInterval(interval);
  }, [fetchSessions, fetchProcesses]);

  // ── Kill a session or agent (existing mechanism) ──
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

  // ── Kill all zombie sub-agents (existing mechanism) ──
  const handleKillZombies = useCallback(async () => {
    setKillingZombies(true);
    try {
      const res = await fetch("/api/company/sub-agents", {
        method: "DELETE",
        headers: getConsoleJsonHeaders(),
      });
      if (res.ok) {
        await fetchSessions();
      }
    } catch {
      // Silently ignore
    } finally {
      setKillingZombies(false);
    }
  }, [fetchSessions]);

  // ── Kill/Reset a unified process (new mechanism) ──
  const handleProcessKill = useCallback(
    async (process: MonitoredProcess) => {
      setProcessKillTarget(null);
      setKillingProcess(process.id);
      try {
        const res = await fetch("/api/company/processes", {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify({ id: process.id, action: "kill" }),
        });
        if (res.ok) {
          // Refresh both data sources
          await Promise.all([fetchSessions(), fetchProcesses()]);
        }
      } catch {
        // Silently ignore
      } finally {
        setKillingProcess(null);
      }
    },
    [fetchSessions, fetchProcesses]
  );

  const killTargetSession = killTarget
    ? sessions.find((s) => s.pid === killTarget.pid)
    : null;

  // ── Compute stale task count ──
  const staleTaskCount = taskProcesses.filter((t) => t.status === "stale").length;
  const staleTradingCount = tradingProcesses.filter((t) => t.status === "stale").length;
  const staleOsCount = osProcesses.filter((p) => p.status === "stale").length;

  // ── OS process summary stats ──
  const osTotalMemoryMB = osProcesses.reduce(
    (sum, p) => sum + ((p.meta?.memoryMB as number) ?? 0),
    0,
  );
  const osKillableCount = osProcesses.filter(
    (p) => p.killable && !((p.meta?.sacred as boolean) ?? false),
  ).length;

  // ── Group OS processes by category ──
  const osGrouped = OS_CATEGORY_ORDER.reduce<Record<string, MonitoredProcess[]>>(
    (acc, cat) => {
      const group = osProcesses.filter((p) => (p.meta?.osCategory as string) === cat);
      if (group.length > 0) acc[cat] = group;
      return acc;
    },
    {},
  );

  // ── Total active count across all sources ──
  const totalRunning = stats.activeCount + taskProcesses.length + tradingProcesses.filter((t) => t.status === "running").length + syncProcesses.length + osProcesses.filter((p) => p.status === "running").length;
  const totalStale = stats.zombieSubAgents + staleTaskCount + staleTradingCount + staleOsCount;
  const hasAnyContent = sessions.length > 0 || taskProcesses.length > 0 || tradingProcesses.length > 0 || syncProcesses.length > 0 || osProcesses.length > 0;

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* ── Header: unified summary bar ── */}
        <div
          className="flex-none flex items-center gap-4 px-4 py-2.5"
          style={{
            borderBottom: "1px solid var(--border-dark-subtle)",
            background: "var(--bg-raised)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <Activity
              className="w-3.5 h-3.5"
              style={{ color: "var(--fg-muted)" }}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold" style={{ color: "var(--fg-primary)" }}>
              Processi
            </span>
          </div>

          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--fg-muted)" }}>
            {/* Running count */}
            <span>
              <span
                className="font-semibold tabular-nums"
                style={{ color: totalRunning > 0 ? "var(--success)" : "var(--fg-secondary)" }}
              >
                {totalRunning}
              </span>{" "}
              attivi
            </span>
            <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
            {/* Agents count */}
            <span>
              <span className="font-semibold tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                {stats.totalAgents}
              </span>{" "}
              agenti
            </span>
            {/* Stale count */}
            {totalStale > 0 && (
              <>
                <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
                <span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: "#F97316" }}
                  >
                    {totalStale}
                  </span>{" "}
                  <span style={{ color: "#F97316" }}>stale</span>
                </span>
              </>
            )}
            {/* Tasks in-progress count */}
            {taskProcesses.length > 0 && (
              <>
                <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
                <span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: "#F59E0B" }}
                  >
                    {taskProcesses.length}
                  </span>{" "}
                  <span style={{ color: "#F59E0B" }}>task</span>
                </span>
              </>
            )}
            {/* Sync count */}
            {syncProcesses.length > 0 && (
              <>
                <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
                <span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: "#A78BFA" }}
                  >
                    {syncProcesses.length}
                  </span>{" "}
                  <span style={{ color: "#A78BFA" }}>sync</span>
                </span>
              </>
            )}
            {/* OS processes count */}
            {osProcesses.length > 0 && (
              <>
                <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
                <span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: "#94a3b8" }}
                  >
                    {osProcesses.length}
                  </span>{" "}
                  <span style={{ color: "#94a3b8" }}>OS</span>
                </span>
              </>
            )}
          </div>

          {error && (
            <span className="text-[10px]" style={{ color: "var(--error)" }}>
              {error}
            </span>
          )}

          <div className="flex-1" />

          {stats.zombieSubAgents > 0 && (
            <button
              onClick={handleKillZombies}
              disabled={killingZombies}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all focus:outline-2 focus:outline-offset-2 focus:outline-orange-500"
              style={{
                background: "rgba(249,115,22,0.12)",
                color: "#F97316",
                opacity: killingZombies ? 0.5 : 1,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(249,115,22,0.2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(249,115,22,0.12)")
              }
              aria-label="Termina tutti i sub-agenti long-running"
              title="Termina tutti i sub-agenti long-running (running > 10min)"
            >
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {killingZombies ? "..." : "Kill long-running"}
            </button>
          )}

          <button
            onClick={() => {
              fetchSessions();
              fetchProcesses();
            }}
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
            aria-label="Aggiorna tutti i processi"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" />
            Aggiorna
          </button>
        </div>

        {/* ── Content: sessions + tasks + trading ── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading && !hasAnyContent ? (
            <EmptyState loading={true} />
          ) : !hasAnyContent ? (
            <EmptyState loading={false} />
          ) : (
            <div className="p-3 space-y-1">
              {/* ── Legend ── */}
              <div className="flex items-center gap-3 mb-2 text-[9px] flex-wrap" style={{ color: "var(--fg-muted)" }}>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#34D399" }} />
                  console
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#d4a843" }} />
                  esterno
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#F59E0B" }} />
                  <span style={{ color: "#F59E0B" }}>task</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#22D3EE" }} />
                  <span style={{ color: "#22D3EE" }}>trading</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#A78BFA" }} />
                  <span style={{ color: "#A78BFA" }}>sync</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#94a3b8" }} />
                  <span style={{ color: "#94a3b8" }}>OS</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#F97316" }} />
                  <span style={{ color: "#F97316" }}>stale</span>
                </span>
              </div>

              {/* ══════════════ SESSIONS SECTION ══════════════ */}
              {sessions.length > 0 && (
                <div>
                  <SectionHeader
                    icon={<Terminal className="w-3 h-3" style={{ color: "#34D399" }} aria-hidden="true" />}
                    label="Sessioni"
                    count={sessions.length}
                    expanded={sessionsExpanded}
                    onToggle={() => setSessionsExpanded((p) => !p)}
                    countColor={stats.activeCount > 0 ? "#34D399" : "var(--fg-secondary)"}
                    badge={
                      stats.zombieSubAgents > 0
                        ? { label: `${stats.zombieSubAgents} long-running`, color: "#F97316" }
                        : undefined
                    }
                  />
                  <AnimatePresence>
                    {sessionsExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pb-2">
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ══════════════ TASKS SECTION ══════════════ */}
              {taskProcesses.length > 0 && (
                <div>
                  <SectionHeader
                    icon={<ListTodo className="w-3 h-3" style={{ color: "#F59E0B" }} aria-hidden="true" />}
                    label="Task in corso"
                    count={taskProcesses.length}
                    expanded={tasksExpanded}
                    onToggle={() => setTasksExpanded((p) => !p)}
                    countColor="#F59E0B"
                    badge={
                      staleTaskCount > 0
                        ? { label: `${staleTaskCount} long-running`, color: "#F97316" }
                        : undefined
                    }
                  />
                  <AnimatePresence>
                    {tasksExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1.5 pb-2">
                          <AnimatePresence mode="popLayout">
                            {taskProcesses.map((task) => (
                              <motion.div
                                key={task.id}
                                initial={{ opacity: 0, y: -4 }}
                                animate={{
                                  opacity: killingProcess === task.id ? 0.4 : 1,
                                  y: 0,
                                }}
                                exit={{ opacity: 0, y: 4, height: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <TaskRow
                                  process={task}
                                  onReset={(p) => setProcessKillTarget(p)}
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ══════════════ TRADING SECTION ══════════════ */}
              {tradingProcesses.length > 0 && (
                <div>
                  <SectionHeader
                    icon={<TrendingUp className="w-3 h-3" style={{ color: "#22D3EE" }} aria-hidden="true" />}
                    label="Trading"
                    count={tradingProcesses.length}
                    expanded={tradingExpanded}
                    onToggle={() => setTradingExpanded((p) => !p)}
                    countColor="#22D3EE"
                    badge={
                      staleTradingCount > 0
                        ? { label: `${staleTradingCount} stale`, color: "#F97316" }
                        : undefined
                    }
                  />
                  <AnimatePresence>
                    {tradingExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1.5 pb-2">
                          <AnimatePresence mode="popLayout">
                            {tradingProcesses.map((tp) => (
                              <motion.div
                                key={tp.id}
                                initial={{ opacity: 0, y: -4 }}
                                animate={{
                                  opacity: killingProcess === tp.id ? 0.4 : 1,
                                  y: 0,
                                }}
                                exit={{ opacity: 0, y: 4, height: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <TradingRow
                                  process={tp}
                                  onKill={(p) => setProcessKillTarget(p)}
                                />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ══════════════ DATA CONNECTOR SYNCS SECTION (G2) ══════════════ */}
              {syncProcesses.length > 0 && (
                <div>
                  <SectionHeader
                    icon={<Database className="w-3 h-3" style={{ color: "#A78BFA" }} aria-hidden="true" />}
                    label="Data Connector Syncs"
                    count={syncProcesses.length}
                    expanded={syncsExpanded}
                    onToggle={() => setSyncsExpanded((p) => !p)}
                    countColor="#A78BFA"
                  />
                  <AnimatePresence>
                    {syncsExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1.5 pb-2">
                          <AnimatePresence mode="popLayout">
                            {syncProcesses.map((sp) => (
                              <motion.div
                                key={sp.id}
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 4, height: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <SyncRow process={sp} />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ══════════════ OS PROCESSES SECTION (G6) ══════════════ */}
              {osProcesses.length > 0 && (
                <div>
                  <SectionHeader
                    icon={<Cpu className="w-3 h-3" style={{ color: "#94a3b8" }} aria-hidden="true" />}
                    label="Processi Sistema"
                    count={osProcesses.length}
                    expanded={osExpanded}
                    onToggle={() => setOsExpanded((p) => !p)}
                    countColor="#94a3b8"
                    badge={
                      staleOsCount > 0
                        ? { label: `${staleOsCount} stale`, color: "#F97316" }
                        : osKillableCount > 0
                        ? { label: `${osKillableCount} killabili`, color: "#f87171" }
                        : undefined
                    }
                  />
                  <AnimatePresence>
                    {osExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {/* Summary bar */}
                        <div
                          className="flex items-center gap-3 px-3 py-1.5 mb-1.5 rounded-lg text-[9px]"
                          style={{
                            background: "rgba(148,163,184,0.08)",
                            color: "var(--fg-muted)",
                          }}
                        >
                          <span>
                            <span className="font-semibold tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                              {osProcesses.length}
                            </span>{" "}
                            processi
                          </span>
                          <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
                          <span>
                            <span className="font-semibold tabular-nums" style={{ color: "var(--fg-secondary)" }}>
                              {osTotalMemoryMB.toFixed(0)}
                            </span>{" "}
                            MB totale
                          </span>
                          <span style={{ color: "var(--fg-invisible)" }}>&middot;</span>
                          <span>
                            <span
                              className="font-semibold tabular-nums"
                              style={{ color: osKillableCount > 0 ? "#f87171" : "var(--fg-secondary)" }}
                            >
                              {osKillableCount}
                            </span>{" "}
                            killabili
                          </span>
                        </div>

                        {/* Grouped by category */}
                        <div className="space-y-1.5 pb-2">
                          {Object.entries(osGrouped).map(([category, procs]) => (
                            <div key={category}>
                              {/* Category sub-header */}
                              <div
                                className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider"
                                style={{ color: OS_CATEGORY_COLORS[category] ?? "#94a3b8" }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ background: OS_CATEGORY_COLORS[category] ?? "#94a3b8" }}
                                />
                                {OS_CATEGORY_LABELS[category] ?? category}
                                <span
                                  className="text-[8px] font-normal"
                                  style={{ color: "var(--fg-muted)" }}
                                >
                                  ({procs.length})
                                </span>
                              </div>
                              <AnimatePresence mode="popLayout">
                                {procs.map((osp) => (
                                  <motion.div
                                    key={osp.id}
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{
                                      opacity: killingProcess === osp.id ? 0.4 : 1,
                                      y: 0,
                                    }}
                                    exit={{ opacity: 0, y: 4, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                  >
                                    <OSProcessRow
                                      process={osp}
                                      onKill={(p) => setProcessKillTarget(p)}
                                    />
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Kill confirmation: sessions (legacy) ── */}
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

      {/* ── Kill/Reset confirmation: unified processes ── */}
      <AnimatePresence>
        {processKillTarget && (
          <UnifiedKillDialog
            processId={processKillTarget.id}
            typeLabel={
              processKillTarget.type === "task"
                ? `task ${processKillTarget.label}`
                : processKillTarget.type === "os-node-process"
                ? `processo OS PID ${processKillTarget.pid}`
                : processKillTarget.label
            }
            description={processKillTarget.description}
            variant={processKillTarget.type === "task" ? "reset" : "kill"}
            consequence={
              processKillTarget.type === "task"
                ? "Il task verra riportato in stato open e potra essere ripreso."
                : processKillTarget.type === "trading-scheduler"
                ? "Lo scheduler trading verra terminato. Riavviare manualmente se necessario."
                : processKillTarget.type === "os-node-process"
                ? `Processo OS (${OS_CATEGORY_LABELS[(processKillTarget.meta?.osCategory as string) ?? "unknown"] ?? "sconosciuto"}) verra terminato con taskkill /F.`
                : undefined
            }
            onConfirm={() => handleProcessKill(processKillTarget)}
            onCancel={() => setProcessKillTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
