"use client";

/**
 * SessionDetailPanel — Slide-in panel showing session details, agents, output, and kill controls.
 *
 * Enhanced per ADR-005 to show:
 * - Session metadata (PID, type, target, department, currentTask, uptime)
 * - Agents list with per-agent status and soft-kill
 * - Embedded TerminalOutputViewer for output streaming
 * - Kill buttons for terminal and individual agents
 *
 * Color coding:
 * - Green indicator: console session (full I/O)
 * - Amber indicator: task-runner/daemon (read-only, external)
 * - Gray indicator: interactive/orphan (metadata + kill only)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Monitor,
  Bot,
  Clock,
  Terminal,
  Info,
  XCircle,
  ChevronDown,
  ChevronRight,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import { TerminalOutputViewer } from "@/components/console/TerminalOutputViewer";
import { getConsoleJsonHeaders } from "@/lib/utils/console-client";

// ─── Types ───

interface AgentInfo {
  id: string;
  department: string;
  status: "running" | "done" | "error";
  task?: string;
  timestamp: number;
}

interface SessionData {
  pid: number;
  type: "console" | "task-runner" | "daemon" | "interactive";
  target: string;
  taskId?: string;
  startedAt: string;
  status: "active" | "closing";
  currentTask?: string;
  department?: string;
  sessionId?: string;
  agents?: AgentInfo[];
  agentCount?: number;
}

interface SessionDetailPanelProps {
  session: SessionData;
  onClose: () => void;
}

// ─── Constants ───

const TYPE_CONFIG: Record<
  SessionData["type"],
  { icon: typeof Monitor; label: string; color: string; bg: string }
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

const DEPT_LABELS: Record<string, string> = {
  cme: "CME",
  "ufficio-legale": "Ufficio Legale",
  trading: "Trading",
  integration: "Integrazione",
  architecture: "Architettura",
  "data-engineering": "Data Engineering",
  "quality-assurance": "Quality Assurance",
  finance: "Finanza",
  operations: "Operations",
  security: "Sicurezza",
  strategy: "Strategia",
  marketing: "Marketing",
  protocols: "Protocolli",
  "ux-ui": "UX/UI",
  acceleration: "Accelerazione",
  "task-runner": "Task Runner",
  daemon: "Daemon",
  interactive: "Boss Terminal",
  unknown: "Sconosciuto",
};

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

// ─── Helpers ───

function formatDuration(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

function formatTime(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getDeptColor(dept?: string): string {
  if (!dept) return "#555";
  return DEPT_COLORS[dept] ?? "#555";
}

function getDeptLabel(dept?: string): string {
  if (!dept) return "Sconosciuto";
  return DEPT_LABELS[dept] ?? dept;
}

function getIndicatorColor(session: SessionData): string {
  if (session.status === "closing") return "#d4a843";
  if (session.type === "console") return "#34D399";
  if (session.type === "task-runner" || session.type === "daemon") return "#d4a843";
  return "#6b7280";
}

// ─── Kill Confirmation Mini-Dialog ───

function KillConfirmation({
  label,
  isAgent,
  onConfirm,
  onCancel,
}: {
  label: string;
  isAgent: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        background: isAgent ? "rgba(249,115,22,0.08)" : "rgba(239,68,68,0.08)",
        border: `1px solid ${isAgent ? "rgba(249,115,22,0.2)" : "rgba(239,68,68,0.2)"}`,
      }}
    >
      <AlertTriangle
        className="w-3.5 h-3.5 shrink-0"
        style={{ color: isAgent ? "#F97316" : "#EF4444" }}
        aria-hidden="true"
      />
      <span className="text-[11px] flex-1" style={{ color: "var(--fg-secondary)" }}>
        {label}
      </span>
      <button
        ref={cancelRef}
        onClick={onCancel}
        className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
        style={{ background: "var(--bg-overlay)", color: "var(--fg-secondary)" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border-dark)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
      >
        No
      </button>
      <button
        onClick={onConfirm}
        className="px-2 py-1 rounded text-[10px] font-semibold text-white transition-colors"
        style={{ background: isAgent ? "#F97316" : "#EF4444" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = isAgent ? "#EA580C" : "#DC2626")}
        onMouseLeave={(e) => (e.currentTarget.style.background = isAgent ? "#F97316" : "#EF4444")}
      >
        Si
      </button>
    </motion.div>
  );
}

// ─── Agent List Item ───

function AgentListItem({
  agent,
  onKill,
}: {
  agent: AgentInfo;
  onKill: (agentId: string) => void;
}) {
  const color = getDeptColor(agent.department);
  const isRunning = agent.status === "running";
  const isError = agent.status === "error";

  return (
    <div className="flex items-center gap-2 py-1.5 group">
      {/* Status dot */}
      <div className="relative shrink-0 w-[7px] h-[7px]">
        {isRunning && (
          <motion.span
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: color }}
            animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
            aria-hidden="true"
          />
        )}
        <span
          className="relative block w-[7px] h-[7px] rounded-full"
          style={{
            backgroundColor: isError
              ? "#EF4444"
              : isRunning
              ? color
              : "rgba(255,255,255,0.2)",
          }}
        />
      </div>

      {/* Agent info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-2.5 h-2.5 shrink-0" style={{ color: "var(--fg-muted)" }} aria-hidden="true" />
          <span
            className="text-[11px] font-mono truncate"
            style={{ color: "var(--fg-primary)" }}
          >
            {agent.id}
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

      {/* Department badge */}
      <span
        className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium"
        style={{
          background: `${color}20`,
          color,
        }}
      >
        {getDeptLabel(agent.department)}
      </span>

      {/* Status label */}
      <span
        className="shrink-0 text-[9px] font-medium tabular-nums"
        style={{
          color: isRunning ? "#34D399" : isError ? "#EF4444" : "var(--fg-muted)",
        }}
      >
        {isRunning ? "running" : isError ? "error" : "done"}
      </span>

      {/* Kill button (orange, only for running agents) */}
      {isRunning && (
        <button
          onClick={() => onKill(agent.id)}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded focus:outline-2 focus:outline-offset-1 focus:outline-orange-500 focus:opacity-100"
          aria-label={`Interrompi agente ${agent.id}`}
          title="Interrompi agente"
        >
          <XCircle className="w-3 h-3 text-orange-400 hover:text-orange-300" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ─── Component ───

export function SessionDetailPanel({ session, onClose }: SessionDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [showAgents, setShowAgents] = useState(true);
  const [showOutput, setShowOutput] = useState(true);
  const [killConfirm, setKillConfirm] = useState<{
    type: "terminal" | "agent";
    agentId?: string;
  } | null>(null);
  const [killing, setKilling] = useState(false);
  const [uptime, setUptime] = useState(formatDuration(session.startedAt));

  // Update uptime every second
  useEffect(() => {
    const interval = setInterval(() => {
      setUptime(formatDuration(session.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [session.startedAt]);

  // Focus management: move focus into panel on mount (WCAG 2.4.3)
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape key + focus trap (WCAG 2.1.1, 2.4.3)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (killConfirm) {
          setKillConfirm(null);
        } else {
          onClose();
        }
        return;
      }
      // Focus trap
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose, killConfirm]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Kill handler
  const handleKill = useCallback(
    async (agentId?: string) => {
      setKilling(true);
      try {
        await fetch(`/api/company/sessions/${session.pid}/kill`, {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify(agentId ? { agentId } : {}),
        });
        // If we killed the entire terminal, close the panel
        if (!agentId) {
          onClose();
        }
      } catch {
        // silently ignore
      } finally {
        setKilling(false);
        setKillConfirm(null);
      }
    },
    [session.pid, onClose]
  );

  const cfg = TYPE_CONFIG[session.type];
  const Icon = cfg.icon;
  const isClosing = session.status === "closing";
  const dept = session.department ?? session.target;
  const deptLabel = getDeptLabel(dept);
  const indicatorColor = getIndicatorColor(session);
  const agents = session.agents ?? [];
  const hasAgents = agents.length > 0;

  const sessionLabel = session.type === "daemon"
    ? `daemon-${String(session.pid).slice(-6)}`
    : session.type === "task-runner"
      ? `task-${session.taskId?.slice(0, 8) ?? String(session.pid).slice(-6)}`
      : session.type === "interactive"
        ? `interactive-${String(session.pid).slice(-6)}`
        : `console-${String(session.pid).slice(-6)}`;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" ref={panelRef}>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: "easeOut" }}
        className="relative w-[560px] max-w-full h-full flex flex-col shadow-2xl"
        style={{
          background: "var(--bg-raised)",
          borderLeft: "1px solid var(--border-dark-subtle)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Dettaglio sessione ${sessionLabel}`}
      >
        {/* Header */}
        <div
          className="px-5 pt-4 pb-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
              <Icon className={`w-4 h-4 ${cfg.color}`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--fg-primary)" }}
                >
                  {sessionLabel}
                </h2>
                <span
                  className="shrink-0 w-2 h-2 rounded-full"
                  style={{ backgroundColor: indicatorColor }}
                  aria-hidden="true"
                />
              </div>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--fg-secondary)" }}
              >
                PID {session.pid}
                {session.currentTask ? ` \u2014 ${session.currentTask}` : ""}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-md transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            style={{ color: "var(--fg-secondary)" }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--fg-primary)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--fg-secondary)")
            }
            aria-label="Chiudi dettaglio sessione"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {/* ── Metadata section ── */}
          <div className="px-5 py-4 space-y-3">
            <InfoRow label="Stato">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full`}
                  style={{ backgroundColor: indicatorColor }}
                />
                <span
                  className="text-sm font-medium"
                  style={{
                    color: isClosing ? "var(--fg-muted)" : "var(--fg-primary)",
                  }}
                >
                  {isClosing ? "In chiusura" : "Attiva"}
                </span>
              </span>
            </InfoRow>

            <InfoRow label="Tipo">
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${cfg.bg} ${cfg.color}`}
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {cfg.label}
              </span>
            </InfoRow>

            <InfoRow label="Dipartimento">
              <span
                className="text-sm font-medium"
                style={{ color: "var(--fg-primary)" }}
              >
                {deptLabel}
              </span>
            </InfoRow>

            {session.currentTask && (
              <InfoRow label="Task corrente">
                <span
                  className="text-sm"
                  style={{ color: "var(--fg-primary)" }}
                >
                  {session.currentTask}
                </span>
              </InfoRow>
            )}

            {session.taskId && (
              <InfoRow label="Task ID">
                <span
                  className="text-sm font-mono"
                  style={{ color: "var(--fg-secondary)" }}
                  title={session.taskId}
                >
                  {session.taskId.slice(0, 8)}
                </span>
              </InfoRow>
            )}

            <InfoRow label="Avviata">
              <span className="text-sm" style={{ color: "var(--fg-primary)" }}>
                {uptime}
              </span>
              <span className="text-xs ml-2" style={{ color: "var(--fg-muted)" }}>
                ({formatTime(session.startedAt)})
              </span>
            </InfoRow>
          </div>

          {/* ── Agents section ── */}
          <div
            style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
          >
            <button
              onClick={() => setShowAgents((p) => !p)}
              className="w-full flex items-center gap-2 px-5 py-2.5 transition-colors"
              style={{ color: "var(--fg-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-expanded={showAgents}
            >
              {showAgents ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider">
                Agenti
              </span>
              <span
                className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                style={{
                  background: hasAgents ? "rgba(255,107,53,0.15)" : "var(--bg-overlay)",
                  color: hasAgents ? "#FF6B35" : "var(--fg-muted)",
                }}
              >
                {agents.length}
              </span>
            </button>

            <AnimatePresence>
              {showAgents && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-3">
                    {!hasAgents ? (
                      <p className="text-[11px] py-2" style={{ color: "var(--fg-muted)" }}>
                        Nessun agente attivo in questa sessione
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {agents.map((agent) => (
                          <AgentListItem
                            key={agent.id}
                            agent={agent}
                            onKill={(agentId) =>
                              setKillConfirm({ type: "agent", agentId })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Output section ── */}
          <div
            style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
          >
            <button
              onClick={() => setShowOutput((p) => !p)}
              className="w-full flex items-center gap-2 px-5 py-2.5 transition-colors"
              style={{ color: "var(--fg-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-overlay)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-expanded={showOutput}
            >
              {showOutput ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="text-xs font-semibold uppercase tracking-wider">
                Output
              </span>
            </button>

            <AnimatePresence>
              {showOutput && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div style={{ height: "300px" }}>
                    <TerminalOutputViewer
                      pid={session.pid}
                      sessionType={session.type}
                      sessionTarget={session.target}
                      maxHeight="300px"
                      showChatInput={session.type === "console"}
                      sessionId={session.sessionId}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Info box for non-console sessions ── */}
          {session.type !== "console" && (
            <div className="px-5 py-3">
              <div
                className="flex gap-3 p-3.5 rounded-lg"
                style={{
                  background: session.type === "interactive"
                    ? "rgba(56, 189, 248, 0.06)"
                    : session.type === "daemon"
                      ? "rgba(255, 200, 50, 0.06)"
                      : "rgba(167, 139, 250, 0.06)",
                  border: `1px solid ${
                    session.type === "interactive"
                      ? "rgba(56, 189, 248, 0.12)"
                      : session.type === "daemon"
                        ? "rgba(255, 200, 50, 0.12)"
                        : "rgba(167, 139, 250, 0.12)"
                  }`,
                }}
              >
                <Info
                  className="w-4 h-4 shrink-0 mt-0.5"
                  style={{
                    color: session.type === "interactive"
                      ? "#38BDF8"
                      : session.type === "daemon"
                        ? "#FFC832"
                        : "#A78BFA",
                  }}
                  aria-hidden="true"
                />
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--fg-secondary)" }}>
                    {session.type === "interactive"
                      ? "Sessione terminale interattiva (Boss Terminal)"
                      : session.type === "daemon"
                        ? "Processo daemon in background"
                        : "Processo task-runner esterno"}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                    {session.type === "interactive"
                      ? "Questa e una sessione Claude Code avviata dal terminale del boss. L'output non e catturabile perche il processo non e gestito dalla console. Disponibili: metadati, stato, lista agenti e kill."
                      : session.type === "daemon"
                        ? "Processo automatico in background. L'output va al log del processo. Dalla console puoi monitorare agenti associati e terminare il processo."
                        : "Task-runner eseguito esternamente. L'output e visibile nel terminale che lo ha avviato. Qui puoi monitorare gli agenti e terminare il processo."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer with kill controls ── */}
        <div
          className="flex-none px-5 py-3 space-y-2"
          style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
        >
          {/* Kill confirmation area */}
          <AnimatePresence>
            {killConfirm && (
              <KillConfirmation
                label={
                  killConfirm.type === "agent"
                    ? `Interrompere l'agente ${killConfirm.agentId}?`
                    : `Terminare il processo PID ${session.pid}?`
                }
                isAgent={killConfirm.type === "agent"}
                onConfirm={() => handleKill(killConfirm.agentId)}
                onCancel={() => setKillConfirm(null)}
              />
            )}
          </AnimatePresence>

          {/* Kill buttons */}
          {!killConfirm && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setKillConfirm({ type: "terminal" })}
                disabled={killing || isClosing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-40 focus:outline-2 focus:outline-offset-2 focus:outline-red-500"
                style={{
                  background: "#EF4444",
                  boxShadow: "0 2px 8px rgba(239,68,68,0.3)",
                }}
                onMouseEnter={(e) => {
                  if (!killing) e.currentTarget.style.background = "#DC2626";
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#EF4444")
                }
              >
                <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                Termina processo
              </button>

              <div className="flex-1" />

              <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                Aggiornamento in tempo reale
              </p>
            </div>
          )}
        </div>
      </motion.aside>
    </div>
  );
}

// ─── Sub-components ───

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className="text-xs shrink-0"
        style={{ color: "var(--fg-muted)" }}
      >
        {label}
      </span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
