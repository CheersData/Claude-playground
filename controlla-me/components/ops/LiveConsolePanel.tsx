"use client";

/**
 * LiveConsolePanel — Timeline SSE ispirata a screen7 (Claude Code inspector).
 *
 * - Timestamp RELATIVO da quando la connessione è aperta (+Xs)
 * - Dettagli AI sempre visibili: agent | model | tokens | cost | duration
 * - Trading events con simboli e azioni chiari
 * - Monospace, leggibile, niente tabelle dense
 * - Click-to-expand su ogni riga per dettaglio meta completo
 * - Filter bar: Tutti | AI | Trading
 * - Timestamp assoluto sempre visibile a destra
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Terminal, Wifi, WifiOff, Loader2, Trash2,
  Bot, TrendingUp, AlertTriangle, Activity,
  ChevronDown, ChevronRight, ClipboardList,
  Layers, Shield, XOctagon,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogLineMeta {
  agent?: string;
  model?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  durationMs?: number;
  fallback?: boolean;
  sessionType?: string;
  signalType?: string;
  approved?: number;
  total?: number;
  killSwitch?: boolean;
  // Task fields
  taskId?: string;
  taskStatus?: string;
  department?: string;
  priority?: string;
  assignedTo?: string;
  // Pipeline fields
  phase?: string;
  pipelineStatus?: string;
  // Rate limit fields
  endpoint?: string;
  remaining?: number;
  limit?: number;
  // Error fields
  errorType?: string;
  route?: string;
}

interface LogLine {
  id: string;
  timestamp: string;   // HH:MM:SS assoluto
  level: "INFO" | "DEBUG" | "WARN" | "ERROR";
  source: "trading" | "ai" | "system" | "task" | "pipeline" | "ratelimit" | "error";
  message: string;
  meta?: LogLineMeta;
  _receivedAt?: number; // ms epoch, aggiunto client-side
}

type ConnStatus = "connecting" | "connected" | "disconnected";
type SourceFilter = "all" | "ai" | "trading" | "task" | "pipeline" | "ratelimit" | "error";

const MAX_LINES = 500;

// ─── Relative time ───────────────────────────────────────────────────────────

function useRelativeTime(connectedAt: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!connectedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [connectedAt]);

  return (receivedAt: number) => {
    if (!connectedAt) return "+0s";
    const diff = (receivedAt - connectedAt) / 1000;
    if (diff < 60) return `+${diff.toFixed(1)}s`;
    const m = Math.floor(diff / 60);
    const s = Math.floor(diff % 60);
    return `+${m}m${s}s`;
  };
}

// ─── Expand detail panel ─────────────────────────────────────────────────────

function ExpandDetail({ line }: { line: LogLine }) {
  return (
    <div className="px-3 pb-3 pt-1 bg-[var(--ops-surface)] border-b border-[var(--ops-border-subtle)]">
      <div className="text-[10px] font-mono space-y-1">
        {Object.entries(line.meta ?? {}).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="shrink-0 w-24" style={{ color: 'var(--ops-muted)' }}>{k}</span>
            <span style={{ color: 'var(--ops-fg-muted)' }}>{String(v)}</span>
          </div>
        ))}
        <div className="flex gap-2 mt-1">
          <span className="shrink-0 w-24" style={{ color: 'var(--ops-muted)' }}>level</span>
          <span style={{ color: 'var(--ops-fg-muted)' }}>{line.level}</span>
        </div>
        <div className="flex gap-2">
          <span className="shrink-0 w-24" style={{ color: 'var(--ops-muted)' }}>timestamp</span>
          <span style={{ color: 'var(--ops-fg-muted)' }}>{line.timestamp}</span>
        </div>
        <div className="flex gap-2 mt-2 pt-2 border-t" style={{ borderTopColor: 'var(--ops-border)' }}>
          <span className="shrink-0 w-24" style={{ color: 'var(--ops-muted)' }}>message</span>
          <span className="break-all" style={{ color: 'var(--ops-fg)' }}>{line.message}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Row components ───────────────────────────────────────────────────────────

function AiRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const m = line.meta ?? {};
  const totalTokens = (m.inputTokens ?? 0) + (m.outputTokens ?? 0);
  const durationSec = m.durationMs ? `${(m.durationMs / 1000).toFixed(1)}s` : null;
  const cost = m.costUsd != null ? `$${m.costUsd.toFixed(4)}` : null;
  const modelShort = (m.model ?? "").replace("claude-", "").replace("-latest", "").replace("-4-5", " 4.5").replace("-4", " 4");

  return (
    <>
      <div
        className="flex items-start gap-3 px-3 py-2 border-b border-[var(--ops-border-subtle)] hover:bg-[var(--ops-surface)]/30 cursor-pointer"
        style={{
          backgroundColor: line.level === "ERROR" ? 'rgba(229, 141, 120, 0.08)' :
                           m.fallback ? 'rgba(255, 107, 53, 0.04)' : undefined
        }}
        onClick={onToggle}
      >
        {/* Expand chevron */}
        <span className="shrink-0 mt-0.5" style={{ color: 'var(--ops-border)' }}>
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>

        {/* Relative timestamp */}
        <span className="font-mono text-xs shrink-0 w-14 pt-0.5 tabular-nums" style={{ color: 'var(--ops-rose)' }}>
          {relTime}
        </span>

        {/* Icon */}
        <Bot className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--ops-rose)' }} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* First line: agent + model */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--ops-rose)' }}>
              {m.agent ?? "agent"}
            </span>
            <span className="font-mono text-xs" style={{ color: 'var(--ops-muted)' }}>
              {modelShort || m.model}
            </span>
            {m.provider && (
              <span className="text-[10px] px-1.5 py-0 rounded border" style={{ backgroundColor: 'var(--ops-surface)', color: 'var(--ops-muted)', borderColor: 'var(--ops-border)' }}>
                {m.provider}
              </span>
            )}
            {m.sessionType && (
              <span className="text-[10px]" style={{ color: 'var(--ops-muted)' }}>{`{${m.sessionType}}`}</span>
            )}
            {m.fallback && (
              <span className="text-[10px] px-1.5 py-0 rounded border" style={{ backgroundColor: 'rgba(255, 107, 53, 0.15)', color: 'var(--ops-accent)', borderColor: 'rgba(255, 107, 53, 0.3)' }}>
                fallback
              </span>
            )}
          </div>
          {/* Second line: metrics */}
          <div className="flex items-center gap-3 mt-0.5 font-mono text-xs">
            {m.inputTokens != null && (
              <span style={{ color: 'var(--ops-muted)' }}>
                <span style={{ color: 'var(--ops-cyan)' }}>{"↑in "}{m.inputTokens.toLocaleString()}</span>
                <span style={{ color: 'var(--ops-muted)' }}> </span>
                <span style={{ color: 'var(--ops-rose)' }}>{"↓out "}{m.outputTokens?.toLocaleString()}</span>
                <span style={{ color: 'var(--ops-muted)' }}> ({totalTokens.toLocaleString()} tok)</span>
              </span>
            )}
            {cost && <span className="font-semibold" style={{ color: 'var(--ops-accent)' }}>{cost}</span>}
            {durationSec && <span style={{ color: 'var(--ops-muted)' }}>{durationSec}</span>}
          </div>
        </div>

        {/* Absolute timestamp — always visible */}
        <span className="font-mono text-[10px] shrink-0 mt-0.5" style={{ color: 'var(--ops-muted)' }}>
          {line.timestamp}
        </span>
      </div>

      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

function TradeRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isKillSwitch = line.level === "ERROR";
  const isWarn = line.level === "WARN";

  return (
    <>
      <div
        className="flex items-start gap-3 px-3 py-2 border-b border-[var(--ops-border-subtle)] hover:bg-[var(--ops-surface)]/30 cursor-pointer"
        style={{
          backgroundColor: isKillSwitch ? 'rgba(229, 141, 120, 0.12)' :
                           isWarn ? 'rgba(255, 107, 53, 0.04)' : undefined,
          borderBottomColor: isKillSwitch ? 'var(--ops-error)' : undefined
        }}
        onClick={onToggle}
      >
        {/* Expand chevron */}
        <span className="shrink-0 mt-0.5" style={{ color: 'var(--ops-border)' }}>
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>

        {/* Relative timestamp */}
        <span className="font-mono text-xs shrink-0 w-14 pt-0.5 tabular-nums" style={{ color: 'var(--ops-teal)' }}>
          {relTime}
        </span>

        {/* Icon */}
        {isKillSwitch
          ? <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--ops-error)' }} />
          : <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--ops-teal)' }} />
        }

        {/* Message */}
        <span
          className={`font-mono text-xs flex-1 leading-snug pt-0.5 ${isKillSwitch ? "font-semibold" : ""}`}
          style={{
            color: isKillSwitch ? 'var(--ops-error)' :
                   isWarn ? 'var(--ops-accent)' :
                   line.level === "INFO" ? 'var(--ops-teal)' : 'var(--ops-muted)'
          }}
        >
          {line.message}
        </span>

        {/* Absolute timestamp — always visible */}
        <span className="font-mono text-[10px] shrink-0 mt-0.5" style={{ color: 'var(--ops-muted)' }}>
          {line.timestamp}
        </span>
      </div>

      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

function SystemRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--ops-border-subtle)] cursor-pointer hover:bg-[var(--ops-surface)]/30"
        onClick={onToggle}
      >
        <span className="shrink-0" style={{ color: 'var(--ops-border)' }}>
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>
        <span className="font-mono text-xs shrink-0 w-14 tabular-nums" style={{ color: 'var(--ops-border)' }}>{relTime}</span>
        <Activity className="w-3 h-3 shrink-0" style={{ color: 'var(--ops-muted)' }} />
        <span className="font-mono text-xs flex-1" style={{ color: 'var(--ops-muted)' }}>{line.message}</span>
        <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--ops-border)' }}>{line.timestamp}</span>
      </div>

      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

function TaskRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const m = line.meta ?? {};
  const statusColors: Record<string, string> = {
    open: "var(--ops-cyan)",
    in_progress: "var(--ops-accent)",
    done: "var(--ops-teal)",
    blocked: "var(--ops-error)",
    review: "#FFC832",
  };
  const color = statusColors[m.taskStatus ?? ""] ?? "var(--ops-muted)";
  const priorityBadge = m.priority === "high" || m.priority === "critical";

  return (
    <>
      <div
        className="flex items-start gap-3 px-3 py-2 border-b border-[var(--ops-border-subtle)] hover:bg-[var(--ops-surface)]/30 cursor-pointer"
        style={{
          backgroundColor: m.taskStatus === "blocked" ? "rgba(229, 141, 120, 0.06)" : undefined,
        }}
        onClick={onToggle}
      >
        <span className="shrink-0 mt-0.5" style={{ color: "var(--ops-border)" }}>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="font-mono text-xs shrink-0 w-14 pt-0.5 tabular-nums" style={{ color }}>
          {relTime}
        </span>
        <ClipboardList className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold" style={{ color }}>
              {m.taskStatus?.toUpperCase() ?? "TASK"}
            </span>
            {m.department && (
              <span className="text-[10px] px-1.5 py-0 rounded border" style={{ backgroundColor: "var(--ops-surface)", color: "var(--ops-muted)", borderColor: "var(--ops-border)" }}>
                {m.department}
              </span>
            )}
            {priorityBadge && (
              <span className="text-[10px] px-1.5 py-0 rounded border" style={{ backgroundColor: "rgba(229, 141, 120, 0.15)", color: "var(--ops-error)", borderColor: "rgba(229, 141, 120, 0.3)" }}>
                {m.priority}
              </span>
            )}
          </div>
          <div className="font-mono text-xs mt-0.5" style={{ color: "var(--ops-fg-muted)" }}>
            {line.message.replace(/^\[.*?\]\s*/, "")}
          </div>
        </div>
        <span className="font-mono text-[10px] shrink-0 mt-0.5" style={{ color: "var(--ops-muted)" }}>
          {line.timestamp}
        </span>
      </div>
      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

function PipelineRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const m = line.meta ?? {};
  const phaseColors: Record<string, string> = {
    classifier: "#4ECDC4",
    analyzer: "#FF6B6B",
    investigator: "#A78BFA",
    advisor: "#FFC832",
  };
  const color = phaseColors[m.phase ?? ""] ?? "var(--ops-cyan)";
  const durationSec = m.durationMs ? `${(m.durationMs / 1000).toFixed(1)}s` : null;
  const cost = m.costUsd != null ? `$${m.costUsd.toFixed(4)}` : null;

  return (
    <>
      <div
        className="flex items-start gap-3 px-3 py-2 border-b border-[var(--ops-border-subtle)] hover:bg-[var(--ops-surface)]/30 cursor-pointer"
        style={{
          backgroundColor: m.fallback ? "rgba(255, 107, 53, 0.04)" : undefined,
        }}
        onClick={onToggle}
      >
        <span className="shrink-0 mt-0.5" style={{ color: "var(--ops-border)" }}>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="font-mono text-xs shrink-0 w-14 pt-0.5 tabular-nums" style={{ color }}>
          {relTime}
        </span>
        <Layers className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold" style={{ color }}>
              {m.phase ?? "phase"}
            </span>
            {m.model && (
              <span className="font-mono text-xs" style={{ color: "var(--ops-muted)" }}>
                {m.model}
              </span>
            )}
            {m.fallback && (
              <span className="text-[10px] px-1.5 py-0 rounded border" style={{ backgroundColor: "rgba(255, 107, 53, 0.15)", color: "var(--ops-accent)", borderColor: "rgba(255, 107, 53, 0.3)" }}>
                fallback
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 font-mono text-xs">
            {cost && <span className="font-semibold" style={{ color: "var(--ops-accent)" }}>{cost}</span>}
            {durationSec && <span style={{ color: "var(--ops-muted)" }}>{durationSec}</span>}
            {m.provider && <span style={{ color: "var(--ops-muted)" }}>{m.provider}</span>}
          </div>
        </div>
        <span className="font-mono text-[10px] shrink-0 mt-0.5" style={{ color: "var(--ops-muted)" }}>
          {line.timestamp}
        </span>
      </div>
      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

function RateLimitRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        className="flex items-start gap-3 px-3 py-2 border-b border-[var(--ops-border-subtle)] hover:bg-[var(--ops-surface)]/30 cursor-pointer"
        style={{ backgroundColor: "rgba(255, 107, 53, 0.06)" }}
        onClick={onToggle}
      >
        <span className="shrink-0 mt-0.5" style={{ color: "var(--ops-border)" }}>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="font-mono text-xs shrink-0 w-14 pt-0.5 tabular-nums" style={{ color: "#FFC832" }}>
          {relTime}
        </span>
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "#FFC832" }} />
        <span className="font-mono text-xs flex-1 leading-snug pt-0.5" style={{ color: "var(--ops-accent)" }}>
          {line.message}
        </span>
        <span className="font-mono text-[10px] shrink-0 mt-0.5" style={{ color: "var(--ops-muted)" }}>
          {line.timestamp}
        </span>
      </div>
      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

function ErrorRow({
  line, relTime, expanded, onToggle,
}: {
  line: LogLine;
  relTime: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <div
        className="flex items-start gap-3 px-3 py-2 border-b border-[var(--ops-border-subtle)] hover:bg-[var(--ops-surface)]/30 cursor-pointer"
        style={{ backgroundColor: "rgba(229, 141, 120, 0.08)", borderBottomColor: "var(--ops-error)" }}
        onClick={onToggle}
      >
        <span className="shrink-0 mt-0.5" style={{ color: "var(--ops-border)" }}>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
        <span className="font-mono text-xs shrink-0 w-14 pt-0.5 tabular-nums" style={{ color: "var(--ops-error)" }}>
          {relTime}
        </span>
        <XOctagon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "var(--ops-error)" }} />
        <span className="font-mono text-xs flex-1 leading-snug pt-0.5 font-semibold" style={{ color: "var(--ops-error)" }}>
          {line.message}
        </span>
        <span className="font-mono text-[10px] shrink-0 mt-0.5" style={{ color: "var(--ops-muted)" }}>
          {line.timestamp}
        </span>
      </div>
      {expanded && <ExpandDetail line={line} />}
    </>
  );
}

// ─── Filter pill button ───────────────────────────────────────────────────────

function FilterPill({
  active, label, count, onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all duration-150 ${
        active
          ? "bg-[var(--ops-surface-2)] border-[var(--ops-border)] text-[var(--ops-fg)]"
          : "bg-transparent border-[var(--ops-border-subtle)] text-[var(--ops-muted)] hover:border-[var(--ops-border)] hover:text-[var(--ops-fg-muted)]"
      }`}
    >
      {label}
      <span className={`${active ? "text-[var(--ops-fg-muted)]" : "text-[var(--ops-muted)]"}`}>{count}</span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LiveConsolePanel() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<ConnStatus>("disconnected");
  const [autoScroll, setAutoScroll] = useState(true);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const containerRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const bufferRef = useRef("");

  const getRelTime = useRelativeTime(connectedAt);

  const connect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setStatus("connecting");

    const headers = getConsoleAuthHeaders() as Record<string, string>;
    const token = headers["x-console-token"] ?? "";
    const url = `/api/debug/stream?t=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      setConnectedAt(Date.now());
    };

    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(":")) return;
      bufferRef.current += e.data;
      try {
        const raw = JSON.parse(bufferRef.current) as LogLine;
        bufferRef.current = "";
        const line = { ...raw, _receivedAt: Date.now() };
        setLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      } catch {
        // partial — keep buffering
      }
    };

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
      esRef.current = null;
    };
  }, []);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setStatus("disconnected");
  }, []);

  // connect() calls setStatus internally — this is valid for SSE lifecycle management.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    connect();
    return () => { esRef.current?.close(); };
  }, [connect]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  }, []);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Stats
  const aiLines = lines.filter((l) => l.source === "ai");
  const tradeLines = lines.filter((l) => l.source === "trading");
  const taskLines = lines.filter((l) => l.source === "task");
  const pipelineLines = lines.filter((l) => l.source === "pipeline");
  const rateLimitLines = lines.filter((l) => l.source === "ratelimit");
  const errorLines = lines.filter((l) => l.source === "error");
  const totalCost = aiLines.reduce((s, l) => s + (l.meta?.costUsd ?? 0), 0);

  // Filtered lines
  const filteredLines = sourceFilter === "all"
    ? lines
    : lines.filter((l) => l.source === sourceFilter);

  return (
    <div className="flex flex-col h-full bg-[var(--ops-bg)] border border-[var(--ops-border-subtle)] rounded-xl overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface)] shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-[var(--ops-fg-muted)]" />
          <span className="text-xs font-semibold text-[var(--ops-fg)]">Console Live</span>
          {/* Status */}
          <span className="flex items-center gap-1">
            {status === "connected" && <span className="w-1.5 h-1.5 rounded-full bg-[var(--ops-teal)] animate-pulse" />}
            {status === "connecting" && <Loader2 className="w-3 h-3 text-[#FFC832] animate-spin" />}
            {status === "disconnected" && <span className="w-1.5 h-1.5 rounded-full bg-[var(--ops-muted)]" />}
            <span className={`text-[10px] ${
              status === "connected" ? "text-[var(--ops-teal)]" :
              status === "connecting" ? "text-[#FFC832]" : "text-[var(--ops-muted)]"
            }`}>{status}</span>
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 font-mono text-[10px]">
          {aiLines.length > 0 && (
            <span style={{ color: 'var(--ops-rose)' }}>
              <Bot className="w-3 h-3 inline mr-1" />
              {aiLines.length}
              {totalCost > 0 && <span className="ml-1" style={{ color: 'var(--ops-accent)' }}>${totalCost.toFixed(4)}</span>}
            </span>
          )}
          {pipelineLines.length > 0 && (
            <span style={{ color: 'var(--ops-cyan)' }}>
              <Layers className="w-3 h-3 inline mr-1" />
              {pipelineLines.length}
            </span>
          )}
          {(rateLimitLines.length > 0 || errorLines.length > 0) && (
            <span style={{ color: 'var(--ops-error)' }}>
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {rateLimitLines.length + errorLines.length}
            </span>
          )}
          <span className="text-[var(--ops-muted)]">{lines.length}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={() => setLines([])} className="p-1 rounded-md hover:bg-[var(--ops-surface-2)] text-[var(--ops-muted)] hover:text-[var(--ops-fg-muted)] transition-colors" title="Clear">
            <Trash2 className="w-3 h-3" />
          </button>
          {status === "connected"
            ? <button onClick={disconnect} className="p-1 rounded-md hover:bg-[var(--ops-surface-2)] text-[var(--ops-teal)] hover:text-[var(--ops-error)] transition-colors" title="Disconnect"><Wifi className="w-3 h-3" /></button>
            : <button onClick={connect} className="p-1 rounded-md hover:bg-[var(--ops-surface-2)] text-[var(--ops-muted)] hover:text-[var(--ops-teal)] transition-colors" title="Connect"><WifiOff className="w-3 h-3" /></button>
          }
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--ops-border-subtle)] bg-[var(--ops-surface)]/40 shrink-0 flex-wrap">
        <FilterPill
          active={sourceFilter === "all"}
          label="Tutti"
          count={lines.length}
          onClick={() => setSourceFilter("all")}
        />
        <FilterPill
          active={sourceFilter === "ai"}
          label="AI"
          count={aiLines.length}
          onClick={() => setSourceFilter("ai")}
        />
        <FilterPill
          active={sourceFilter === "pipeline"}
          label="Pipeline"
          count={pipelineLines.length}
          onClick={() => setSourceFilter("pipeline")}
        />
        <FilterPill
          active={sourceFilter === "task"}
          label="Task"
          count={taskLines.length}
          onClick={() => setSourceFilter("task")}
        />
        <FilterPill
          active={sourceFilter === "trading"}
          label="Trading"
          count={tradeLines.length}
          onClick={() => setSourceFilter("trading")}
        />
        <FilterPill
          active={sourceFilter === "ratelimit"}
          label="Rate Limit"
          count={rateLimitLines.length}
          onClick={() => setSourceFilter("ratelimit")}
        />
        <FilterPill
          active={sourceFilter === "error"}
          label="Errori"
          count={errorLines.length}
          onClick={() => setSourceFilter("error")}
        />
      </div>

      {/* ── Timeline ── */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}
      >
        {filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--ops-muted)]">
            <Terminal className="w-6 h-6" />
            <span className="text-xs">
              {sourceFilter !== "all"
                ? `Nessun evento ${
                    sourceFilter === "ai" ? "AI" :
                    sourceFilter === "pipeline" ? "Pipeline" :
                    sourceFilter === "task" ? "Task" :
                    sourceFilter === "trading" ? "Trading" :
                    sourceFilter === "ratelimit" ? "Rate Limit" :
                    sourceFilter === "error" ? "Errori" :
                    sourceFilter
                  }`
                : status === "connecting" ? "Connessione in corso..." :
                  status === "connected"  ? "In attesa di eventi..." :
                  "Disconnesso — connetti per vedere i log"}
            </span>
          </div>
        ) : (
          filteredLines.map((line) => {
            const relTime = line._receivedAt ? getRelTime(line._receivedAt) : "+?s";
            const expanded = expandedId === line.id;
            const toggle = () => handleToggle(line.id);
            if (line.source === "ai")        return <AiRow        key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            if (line.source === "trading")   return <TradeRow     key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            if (line.source === "task")      return <TaskRow      key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            if (line.source === "pipeline")  return <PipelineRow  key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            if (line.source === "ratelimit") return <RateLimitRow key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            if (line.source === "error")     return <ErrorRow     key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            return                                  <SystemRow    key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
          })
        )}
      </div>

      {/* ── Scroll indicator ── */}
      {!autoScroll && filteredLines.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 border-t border-[var(--ops-border-subtle)] bg-[var(--ops-surface)]">
          <button
            onClick={() => {
              setAutoScroll(true);
              if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }}
            className="text-[10px] text-[#FFC832] hover:text-[var(--ops-fg)] transition-colors"
          >
            {"\u2193"} Scroll disabilitato — clicca per tornare in fondo
          </button>
        </div>
      )}
    </div>
  );
}
