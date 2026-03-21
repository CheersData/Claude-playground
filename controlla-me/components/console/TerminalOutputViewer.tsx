"use client";

/**
 * TerminalOutputViewer — Connects to SSE endpoint for terminal output.
 *
 * Shows output lines in a terminal-like dark panel with auto-scroll.
 * Strips ANSI codes for clean display. Max 500 lines displayed.
 * Color-codes stderr lines with a red tint.
 *
 * SSE Protocol (from /api/company/sessions/[pid]/output):
 *
 *   Console sessions (output capture):
 *     event: replay     — initial burst of buffered lines
 *     event: line       — new line as it arrives
 *     event: closed     — session ended
 *     : heartbeat       — keep-alive comment (15s)
 *
 *   Non-console sessions (status dashboard fallback):
 *     event: status-dashboard — session metadata + initial agent snapshot
 *     event: agent-update     — periodic (3s) + real-time agent events
 *     event: closed           — session ended
 *     : heartbeat             — keep-alive comment (15s)
 *
 * ADR-005: Terminal/Agent Monitoring Architecture
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal,
  Activity,
  Send,
  MessageSquare,
  AlertCircle,
  ArrowDown,
  Pause,
  Info,
  Monitor,
  Bot,
  Clock,
  Cpu,
  WifiOff,
} from "lucide-react";
import { getConsoleJsonHeaders } from "@/lib/utils/console-client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TerminalOutputViewerProps {
  /** PID of the session to stream output from */
  pid: number | null;
  /** Session type — determines if output capture is available */
  sessionType?: "console" | "task-runner" | "daemon" | "interactive";
  /** Session target (e.g., "cme") for display */
  sessionTarget?: string;
  /** Max height CSS value (default: full flex) */
  maxHeight?: string;
  /** Whether to show the chat input (only for console sessions) */
  showChatInput?: boolean;
  /** Optional sessionId for sending messages to the right session */
  sessionId?: string;
}

interface OutputLine {
  text: string;
  stream: "stdout" | "stderr";
  index: number;
  timestamp?: number;
}

interface StatusDashboardData {
  pid: number;
  type: "console" | "task-runner" | "daemon" | "interactive";
  target: string;
  department: string;
  status: "active" | "closing";
  currentTask: string | null;
  startedAt: string;
  uptimeMs: number;
  agents: DashboardAgent[];
}

interface DashboardAgent {
  id: string;
  department: string;
  status: "running" | "done" | "error";
  task?: string;
  timestamp: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LINES = 500;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  console: { label: "Console", color: "#34D399", bg: "rgba(52,211,153,0.12)" },
  "task-runner": { label: "Task Runner", color: "#A78BFA", bg: "rgba(167,139,250,0.12)" },
  daemon: { label: "Daemon", color: "#FFC832", bg: "rgba(255,200,50,0.12)" },
  interactive: { label: "Interactive", color: "#38BDF8", bg: "rgba(56,189,248,0.12)" },
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

/**
 * Strip ANSI escape codes for clean display.
 * Handles common SGR sequences (\x1b[...m), cursor moves, and OSC sequences.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b\[[\d;]*m/g, "");
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TerminalOutputViewer({
  pid,
  sessionType,
  sessionTarget,
  maxHeight,
  showChatInput = true,
  sessionId: initialSessionId,
}: TerminalOutputViewerProps) {
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [noCapture, setNoCapture] = useState(false);
  const [noCaptureReason, setNoCaptureReason] = useState("");
  const [sessionClosed, setSessionClosed] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [dashboard, setDashboard] = useState<StatusDashboardData | null>(null);
  const [dashboardAgents, setDashboardAgents] = useState<DashboardAgent[]>([]);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const outputRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | null>(initialSessionId ?? null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const sessionClosedRef = useRef(false);
  const pidRef = useRef<number | null>(null);

  // Auto-scroll to bottom when new lines arrive (if enabled)
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Detect user scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    setAutoScroll(atBottom);
  }, []);

  // ─── SSE connection with auto-reconnect ─────────────────────────────────

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectSSE = useCallback((targetPid: number, isReconnect: boolean) => {
    const token =
      typeof window !== "undefined"
        ? sessionStorage.getItem("lexmea-token")
        : null;
    if (!token) return;

    // Don't reconnect if session was explicitly closed by the server
    if (sessionClosedRef.current) return;

    // Close previous connection
    eventSourceRef.current?.close();

    if (!isReconnect) {
      // Full reset on new PID
      setLines([]);
      setNoCapture(false);
      setNoCaptureReason("");
      setSessionClosed(false);
      setAutoScroll(true);
      setDashboard(null);
      setDashboardAgents([]);
      sessionIdRef.current = initialSessionId ?? null;
      reconnectAttemptRef.current = 0;
      sessionClosedRef.current = false;
    }

    setConnected(false);

    const url = `/api/company/sessions/${targetPid}/output?t=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      setReconnectAttempt(0);
      reconnectAttemptRef.current = 0;
    };

    // Replay event: initial ring buffer dump (works on both first connect and reconnect)
    es.addEventListener("replay", (e) => {
      try {
        const data = JSON.parse(e.data);
        const replayLines: OutputLine[] = (data.lines as string[]).map((text: string, i: number) => ({
          text: stripAnsi(text),
          stream: text.startsWith("[STDERR]") ? "stderr" as const : "stdout" as const,
          index: i,
        }));
        // On reconnect, replace lines with fresh replay to avoid duplicates
        setLines(replayLines.slice(-MAX_LINES));
      } catch {
        // ignore parse errors
      }
    });

    // Live line event
    es.addEventListener("line", (e) => {
      try {
        const data = JSON.parse(e.data);
        const line: OutputLine = {
          text: stripAnsi(data.line ?? data.text ?? ""),
          stream: (data.stream as "stdout" | "stderr") ?? "stdout",
          index: data.index ?? 0,
          timestamp: data.timestamp ?? data.ts,
        };
        setLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      } catch {
        // ignore
      }
    });

    // No-capture event (legacy fallback for non-console sessions)
    es.addEventListener("no-capture", (e) => {
      try {
        const data = JSON.parse(e.data);
        setNoCapture(true);
        setNoCaptureReason(data.reason ?? "Output non disponibile per questo tipo di sessione");
      } catch {
        setNoCapture(true);
        setNoCaptureReason("Output non disponibile");
      }
    });

    // Status dashboard event (non-console sessions — replaces no-capture)
    es.addEventListener("status-dashboard", (e) => {
      try {
        const data: StatusDashboardData = JSON.parse(e.data);
        setDashboard(data);
        setDashboardAgents(data.agents ?? []);
      } catch {
        // ignore parse errors
      }
    });

    // Agent update event (periodic + real-time for non-console sessions)
    es.addEventListener("agent-update", (e) => {
      try {
        const data = JSON.parse(e.data);
        setDashboardAgents(data.agents ?? []);
      } catch {
        // ignore parse errors
      }
    });

    // Session closed event — do NOT reconnect after this
    es.addEventListener("closed", () => {
      sessionClosedRef.current = true;
      setSessionClosed(true);
      setConnected(false);
      setReconnecting(false);
      clearReconnectTimer();
    });

    // Session ID event (for sending messages)
    es.addEventListener("session_id", (e) => {
      try {
        const data = JSON.parse(e.data);
        sessionIdRef.current = data.sessionId;
      } catch {
        // ignore
      }
    });

    // Heartbeat (keep-alive, no action)
    es.addEventListener("heartbeat", () => {
      // no-op
    });

    es.onerror = () => {
      setConnected(false);

      // Don't reconnect if session was explicitly closed or PID changed
      if (sessionClosedRef.current || pidRef.current !== targetPid) return;

      // Close the failed EventSource
      es.close();
      eventSourceRef.current = null;

      // If tab is hidden (screen locked), don't start backoff timer.
      // The visibilitychange/online handler will trigger reconnection when the user returns.
      if (document.visibilityState === "hidden") {
        setReconnecting(true);
        return;
      }

      const attempt = reconnectAttemptRef.current;
      if (attempt >= MAX_RECONNECT_ATTEMPTS) {
        setReconnecting(false);
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
      const delay = Math.min(
        INITIAL_RECONNECT_DELAY_MS * Math.pow(2, attempt),
        MAX_RECONNECT_DELAY_MS
      );

      reconnectAttemptRef.current = attempt + 1;
      setReconnectAttempt(attempt + 1);
      setReconnecting(true);

      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        if (pidRef.current === targetPid && !sessionClosedRef.current) {
          connectSSE(targetPid, true);
        }
      }, delay);
    };
  }, [initialSessionId, clearReconnectTimer]);

  // Connect to SSE output stream when PID changes
  useEffect(() => {
    pidRef.current = pid;

    if (!pid) {
      setLines([]);
      setConnected(false);
      setNoCapture(false);
      setSessionClosed(false);
      setReconnecting(false);
      setReconnectAttempt(0);
      setDashboard(null);
      setDashboardAgents([]);
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      sessionClosedRef.current = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    connectSSE(pid, false);

    return () => {
      clearReconnectTimer();
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [pid, connectSSE, clearReconnectTimer]);

  // Reconnect on page visible (mobile screen unlock) + network restore
  useEffect(() => {
    const triggerReconnect = (reason: string) => {
      if (!pidRef.current || sessionClosedRef.current) return;

      // If we're already connected and the EventSource is open, do nothing
      const es = eventSourceRef.current;
      if (es && es.readyState === EventSource.OPEN) return;

      console.log(`[TerminalOutput] ${reason} — reconnecting to PID ${pidRef.current}`);

      // Cancel any in-flight backoff timer and reset counter
      clearReconnectTimer();
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      connectSSE(pidRef.current, true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab went hidden — cancel pending reconnect timer to avoid wasting attempts
        if (reconnectTimerRef.current) {
          clearReconnectTimer();
        }
        return;
      }
      // Small delay: on mobile, network may not be ready immediately when screen unlocks
      setTimeout(() => triggerReconnect("visibilitychange (screen unlock)"), 500);
    };

    const handleOnline = () => {
      triggerReconnect("online event (network restored)");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
    };
  }, [connectSSE, clearReconnectTimer]);

  // Send message to console session
  const handleSend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || !pid || sessionType !== "console") return;

      const text = chatInput.trim();
      setChatInput("");
      setSending(true);

      try {
        const sid = sessionIdRef.current;
        await fetch("/api/console/company/message", {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify({
            message: text,
            ...(sid ? { sessionId: sid } : {}),
          }),
        });
      } catch {
        // silently ignore
      } finally {
        setSending(false);
      }
    },
    [chatInput, pid, sessionType]
  );

  // ─── No session selected ───
  if (!pid) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-3 min-h-0"
        style={{ background: "#0d0d0d", ...(maxHeight ? { maxHeight } : {}) }}
      >
        <Terminal
          className="w-8 h-8 opacity-20"
          style={{ color: "var(--fg-muted)" }}
          aria-hidden="true"
        />
        <p className="text-xs text-center" style={{ color: "var(--fg-muted)" }}>
          Seleziona una sessione
          <br />
          per visualizzare l&apos;output
        </p>
      </div>
    );
  }

  // ─── Status Dashboard (non-console sessions) ───
  if (dashboard) {
    const typeConfig = TYPE_LABELS[dashboard.type] ?? TYPE_LABELS.interactive;
    const deptColor = DEPT_COLORS[dashboard.department] ?? "#555";
    const deptLabel = DEPT_LABELS[dashboard.department] ?? dashboard.department;
    const runningAgents = dashboardAgents.filter((a) => a.status === "running");
    const recentAgents = dashboardAgents
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 15);

    // Compute live uptime string
    const uptimeSec = Math.floor((Date.now() - new Date(dashboard.startedAt).getTime()) / 1000);
    const uptimeStr = uptimeSec < 60
      ? `${uptimeSec}s`
      : uptimeSec < 3600
        ? `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`
        : `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m`;

    // Type-specific explanation for the info box
    const typeExplanations: Record<string, string> = {
      interactive: "Sessione terminale interattiva (Boss Terminal). L'output non e catturabile perche il processo non e stato avviato dalla console /ops. Visibili: metadati, stato, agenti.",
      "task-runner": "Processo task-runner esterno. L'output va al terminale che lo ha lanciato. Visibili: metadati, stato, agenti associati.",
      daemon: "Processo daemon in background. Monitoriamo lo stato e gli agenti che lancia, ma l'output del processo non e catturabile dalla console.",
    };
    const explanationText = typeExplanations[dashboard.type]
      ?? "Sessione esterna \u2014 output non catturabile. Monitoraggio agenti attivo.";

    return (
      <div
        className="flex-1 flex flex-col min-h-0"
        style={maxHeight ? { maxHeight } : {}}
      >
        {/* Dashboard header */}
        <div
          className="flex-none flex items-center gap-2 px-3 py-2"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "#111",
          }}
        >
          <Activity
            className="w-3.5 h-3.5"
            style={{
              color: sessionClosed ? "#6b7280" : connected ? "#34D399" : "#EF4444",
            }}
            aria-hidden="true"
          />
          <span className="text-[10px] font-mono" style={{ color: "var(--fg-muted)" }}>
            PID {dashboard.pid}
            {sessionTarget ? ` \u2014 ${sessionTarget}` : ""}
          </span>
          <span className="text-[10px] tabular-nums font-mono" style={{ color: "var(--fg-invisible)" }}>
            {uptimeStr}
          </span>
          <div className="flex-1" />
          <span
            className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
              sessionClosed
                ? "bg-gray-500/15 text-gray-400"
                : connected
                ? "bg-emerald-500/15 text-emerald-400"
                : reconnecting
                ? "bg-yellow-500/15 text-yellow-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {sessionClosed
              ? "terminata"
              : connected
              ? "connesso"
              : reconnecting
              ? `riconnessione (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})...`
              : "disconnesso"}
          </span>
        </div>

        {/* Dashboard content */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{ background: "#0a0a0a" }}
          role="region"
          aria-label={`Dashboard sessione PID ${dashboard.pid}`}
        >
          {/* Session info card */}
          <div
            className="rounded-lg p-4 space-y-3"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {/* Type badge */}
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold"
                style={{ background: typeConfig.bg, color: typeConfig.color }}
              >
                {dashboard.type === "interactive" && (
                  <Terminal className="w-3 h-3" aria-hidden="true" />
                )}
                {dashboard.type === "task-runner" && (
                  <Bot className="w-3 h-3" aria-hidden="true" />
                )}
                {dashboard.type === "daemon" && (
                  <Clock className="w-3 h-3" aria-hidden="true" />
                )}
                {dashboard.type === "console" && (
                  <Monitor className="w-3 h-3" aria-hidden="true" />
                )}
                {typeConfig.label}
              </span>

              {/* Department badge */}
              <span
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium"
                style={{
                  background: `${deptColor}18`,
                  color: deptColor,
                }}
              >
                {deptLabel}
              </span>

              {/* Status badge */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${
                  dashboard.status === "active"
                    ? "bg-emerald-500/12 text-emerald-400"
                    : "bg-yellow-500/12 text-yellow-400"
                }`}
              >
                {dashboard.status === "active" ? "attivo" : "in chiusura"}
              </span>
            </div>

            {/* PID + start time + uptime */}
            <div className="flex items-center gap-4 text-[10px]" style={{ color: "var(--fg-muted)" }}>
              <span className="font-mono">PID {dashboard.pid}</span>
              <span>
                Avviato: {new Date(dashboard.startedAt).toLocaleTimeString("it-IT")}
              </span>
              <span className="tabular-nums font-mono">
                Uptime: {uptimeStr}
              </span>
            </div>

            {/* Current task */}
            {dashboard.currentTask && (
              <div className="mt-1">
                <span className="text-[9px] font-medium" style={{ color: "var(--fg-muted)" }}>
                  Task corrente:
                </span>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-secondary)" }}>
                  {dashboard.currentTask}
                </p>
              </div>
            )}

            {/* Type-specific explanatory message */}
            <div
              className="flex items-start gap-2 mt-2 px-3 py-2 rounded-md"
              style={{
                background: dashboard.type === "interactive"
                  ? "rgba(56,189,248,0.06)"
                  : dashboard.type === "daemon"
                    ? "rgba(255,200,50,0.06)"
                    : "rgba(167,139,250,0.06)",
                border: `1px solid ${
                  dashboard.type === "interactive"
                    ? "rgba(56,189,248,0.12)"
                    : dashboard.type === "daemon"
                      ? "rgba(255,200,50,0.12)"
                      : "rgba(167,139,250,0.12)"
                }`,
              }}
            >
              <Info
                className="w-3.5 h-3.5 shrink-0 mt-0.5"
                style={{
                  color: dashboard.type === "interactive"
                    ? "#38BDF8"
                    : dashboard.type === "daemon"
                      ? "#FFC832"
                      : "#A78BFA",
                }}
                aria-hidden="true"
              />
              <p
                className="text-[10px] leading-relaxed"
                style={{
                  color: dashboard.type === "interactive"
                    ? "#7dd3fc"
                    : dashboard.type === "daemon"
                      ? "#fde68a"
                      : "#c4b5fd",
                }}
              >
                {explanationText}
              </p>
            </div>
          </div>

          {/* Agent activity feed */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="w-3.5 h-3.5" style={{ color: "var(--fg-muted)" }} aria-hidden="true" />
              <span className="text-[11px] font-semibold" style={{ color: "var(--fg-secondary)" }}>
                Attivita agenti
              </span>
              {runningAgents.length > 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-[#FF6B35]/15 text-[#FF6B35]">
                  {runningAgents.length} attivi
                </span>
              )}
            </div>

            {recentAgents.length === 0 ? (
              <div className="flex items-center gap-2 pl-5 py-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                />
                <p className="text-[10px] italic" style={{ color: "var(--fg-muted)" }}>
                  Nessun agente rilevato &mdash; la sessione potrebbe essere in attesa di input o inattiva
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {recentAgents.map((agent) => {
                    const agentDeptColor = DEPT_COLORS[agent.department] ?? "#555";
                    const agentDeptLabel = DEPT_LABELS[agent.department] ?? agent.department;
                    const isRunning = agent.status === "running";
                    const isError = agent.status === "error";

                    return (
                      <motion.div
                        key={agent.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 6 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md"
                        style={{
                          background: isRunning
                            ? "rgba(255,255,255,0.02)"
                            : "transparent",
                        }}
                      >
                        {/* Status dot */}
                        <div className="relative shrink-0 w-2 h-2">
                          {isRunning && (
                            <motion.span
                              className="absolute inset-0 rounded-full"
                              style={{ backgroundColor: agentDeptColor }}
                              animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                            />
                          )}
                          <span
                            className="relative block w-2 h-2 rounded-full"
                            style={{
                              backgroundColor: isError
                                ? "#EF4444"
                                : isRunning
                                ? agentDeptColor
                                : "rgba(255,255,255,0.15)",
                            }}
                          />
                        </div>

                        {/* Agent info */}
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span
                            className="text-[10px] font-mono truncate"
                            style={{ color: "var(--fg-secondary)" }}
                          >
                            {agent.id.length > 28
                              ? agent.id.slice(0, 28) + "\u2026"
                              : agent.id}
                          </span>
                          <span
                            className="shrink-0 px-1 py-0.5 rounded text-[9px] font-medium"
                            style={{
                              background: `${agentDeptColor}20`,
                              color: agentDeptColor,
                            }}
                          >
                            {agentDeptLabel}
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

                        {/* Timestamp */}
                        <span
                          className="shrink-0 text-[9px] tabular-nums"
                          style={{ color: "var(--fg-invisible)" }}
                        >
                          {new Date(agent.timestamp).toLocaleTimeString("it-IT", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Task description from agents */}
          {runningAgents.length > 0 && runningAgents[0].task && (
            <div
              className="rounded-md px-3 py-2"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <span className="text-[9px] font-medium" style={{ color: "var(--fg-muted)" }}>
                In corso:
              </span>
              <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-secondary)" }}>
                {runningAgents[0].task}
              </p>
            </div>
          )}

          {/* Session closed banner */}
          <AnimatePresence>
            {sessionClosed && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-md"
                style={{
                  background: "rgba(107,114,128,0.1)",
                  border: "1px solid rgba(107,114,128,0.2)",
                }}
              >
                <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
                <span className="text-[11px] text-gray-400">
                  Sessione terminata
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ─── No capture available (legacy fallback) ───
  if (noCapture) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-3 p-6 min-h-0"
        style={{ background: "#0d0d0d", ...(maxHeight ? { maxHeight } : {}) }}
      >
        <Info
          className="w-6 h-6"
          style={{ color: "var(--fg-muted)" }}
          aria-hidden="true"
        />
        <p className="text-xs text-center max-w-[260px]" style={{ color: "var(--fg-muted)" }}>
          {noCaptureReason}
        </p>
        <p className="text-[10px] text-center" style={{ color: "var(--fg-invisible)" }}>
          Solo le sessioni console avviate da /ops supportano la cattura dell&apos;output.
        </p>
      </div>
    );
  }

  // ─── Output viewer ───
  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={maxHeight ? { maxHeight } : {}}
    >
      {/* Output header */}
      <div
        className="flex-none flex items-center gap-2 px-3 py-2"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "#111",
        }}
      >
        <Activity
          className="w-3.5 h-3.5"
          style={{ color: connected ? "#34D399" : sessionClosed ? "#6b7280" : "#EF4444" }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-mono" style={{ color: "var(--fg-muted)" }}>
          PID {pid}
          {sessionTarget ? ` \u2014 ${sessionTarget}` : ""}
        </span>
        <div className="flex-1" />

        {/* Connection status */}
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
            sessionClosed
              ? "bg-gray-500/15 text-gray-400"
              : connected
              ? "bg-emerald-500/15 text-emerald-400"
              : reconnecting
              ? "bg-yellow-500/15 text-yellow-400"
              : "bg-red-500/15 text-red-400"
          }`}
        >
          {sessionClosed
            ? "terminata"
            : connected
            ? "connesso"
            : reconnecting
            ? `riconnessione (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})...`
            : "disconnesso"}
        </span>

        {/* Line count */}
        <span
          className="text-[9px] tabular-nums"
          style={{ color: "var(--fg-muted)" }}
        >
          {lines.length}/{MAX_LINES}
        </span>

        {/* Auto-scroll indicator */}
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              if (outputRef.current) {
                outputRef.current.scrollTop = outputRef.current.scrollHeight;
              }
            }}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors bg-[#FF6B35]/15 text-[#FF6B35] hover:bg-[#FF6B35]/25"
            aria-label="Riattiva auto-scroll"
          >
            <ArrowDown className="w-2.5 h-2.5" aria-hidden="true" />
            Auto-scroll
          </button>
        )}
      </div>

      {/* Terminal output area */}
      <div
        ref={outputRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed select-text"
        style={{
          background: "#0a0a0a",
          color: "#e2e8f0",
          minHeight: 0,
        }}
        role="log"
        aria-label={`Output terminale PID ${pid}`}
        aria-live="polite"
        aria-atomic="false"
      >
        {lines.length === 0 ? (
          <p className="text-[#444] italic">
            {sessionClosed
              ? "Sessione terminata - nessun output catturato"
              : connected
              ? "In attesa di output..."
              : reconnecting
              ? `Riconnessione in corso... (${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS})`
              : "Connessione al processo..."}
          </p>
        ) : (
          lines.map((line, i) => (
            <div
              key={`${line.index}-${i}`}
              className="whitespace-pre-wrap break-all"
              style={{
                color: line.stream === "stderr" ? "#FCA5A5" : "#e2e8f0",
                backgroundColor: line.stream === "stderr" ? "rgba(239,68,68,0.05)" : "transparent",
              }}
            >
              {line.text || "\u00a0"}
            </div>
          ))
        )}

        {/* Reconnection banner */}
        <AnimatePresence>
          {reconnecting && !sessionClosed && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md"
              style={{
                background: "rgba(234,179,8,0.08)",
                border: "1px solid rgba(234,179,8,0.2)",
              }}
            >
              <WifiOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" aria-hidden="true" />
              <span className="text-[11px] text-yellow-400">
                Riconnessione in corso... (tentativo {reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS})
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reconnection failed banner */}
        <AnimatePresence>
          {!connected && !reconnecting && !sessionClosed && reconnectAttempt >= MAX_RECONNECT_ATTEMPTS && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              <WifiOff className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden="true" />
              <span className="text-[11px] text-red-400">
                Connessione persa. Ricarica la pagina per riprovare.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Session closed banner */}
        <AnimatePresence>
          {sessionClosed && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md"
              style={{
                background: "rgba(107,114,128,0.1)",
                border: "1px solid rgba(107,114,128,0.2)",
              }}
            >
              <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" aria-hidden="true" />
              <span className="text-[11px] text-gray-400">
                Sessione terminata
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll-paused indicator */}
      <AnimatePresence>
        {!autoScroll && !sessionClosed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-none flex items-center justify-center gap-1.5 py-1"
            style={{
              background: "rgba(255,107,53,0.08)",
              borderTop: "1px solid rgba(255,107,53,0.15)",
            }}
          >
            <Pause className="w-2.5 h-2.5 text-[#FF6B35]" aria-hidden="true" />
            <span className="text-[9px] text-[#FF6B35]">
              Auto-scroll in pausa
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat input (only for console sessions) */}
      {showChatInput && sessionType === "console" && !sessionClosed && (
        <form
          onSubmit={handleSend}
          className="flex-none flex items-center gap-2 px-3 py-2"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.06)",
            background: "#111",
          }}
        >
          <MessageSquare
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: "var(--fg-muted)" }}
            aria-hidden="true"
          />
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Invia messaggio alla sessione..."
            disabled={sending || !connected}
            className="flex-1 bg-transparent text-xs outline-none placeholder-[#444] disabled:opacity-50"
            style={{ color: "#e2e8f0" }}
            aria-label="Invia messaggio alla sessione console"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || sending || !connected}
            className="shrink-0 p-1 rounded transition-colors disabled:opacity-40 focus:outline-2 focus:outline-offset-1 focus:outline-[var(--accent)]"
            style={{ color: "var(--fg-muted)" }}
            onMouseEnter={(e) => {
              if (!sending && chatInput.trim())
                e.currentTarget.style.color = "#FF6B35";
            }}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = "var(--fg-muted)")
            }
            aria-label="Invia"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
