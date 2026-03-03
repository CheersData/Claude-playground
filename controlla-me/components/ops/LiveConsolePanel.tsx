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
  ChevronDown, ChevronRight,
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
}

interface LogLine {
  id: string;
  timestamp: string;   // HH:MM:SS assoluto
  level: "INFO" | "DEBUG" | "WARN" | "ERROR";
  source: "trading" | "ai" | "system";
  message: string;
  meta?: LogLineMeta;
  _receivedAt?: number; // ms epoch, aggiunto client-side
}

type ConnStatus = "connecting" | "connected" | "disconnected";
type SourceFilter = "all" | "ai" | "trading";

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
    <div className="px-3 pb-3 pt-1 bg-zinc-900/80 border-b border-zinc-800">
      <div className="text-[10px] font-mono space-y-1">
        {Object.entries(line.meta ?? {}).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-zinc-600 shrink-0 w-24">{k}</span>
            <span className="text-zinc-300">{String(v)}</span>
          </div>
        ))}
        <div className="flex gap-2 mt-1">
          <span className="text-zinc-600 shrink-0 w-24">level</span>
          <span className="text-zinc-300">{line.level}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-zinc-600 shrink-0 w-24">timestamp</span>
          <span className="text-zinc-300">{line.timestamp}</span>
        </div>
        <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800">
          <span className="text-zinc-600 shrink-0 w-24">message</span>
          <span className="text-zinc-200 break-all">{line.message}</span>
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
        className={`flex items-start gap-3 px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900/40 cursor-pointer ${
          m.fallback ? "bg-amber-950/10" : ""
        } ${line.level === "ERROR" ? "bg-red-950/20" : ""}`}
        onClick={onToggle}
      >
        {/* Expand chevron */}
        <span className="text-zinc-700 shrink-0 mt-0.5">
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>

        {/* Relative timestamp */}
        <span className="font-mono text-xs text-violet-500 shrink-0 w-14 pt-0.5 tabular-nums">
          {relTime}
        </span>

        {/* Icon */}
        <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* First line: agent + model */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-violet-300">
              {m.agent ?? "agent"}
            </span>
            <span className="font-mono text-xs text-zinc-500">
              {modelShort || m.model}
            </span>
            {m.provider && (
              <span className="text-[10px] px-1.5 py-0 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                {m.provider}
              </span>
            )}
            {m.sessionType && (
              <span className="text-[10px] text-zinc-600">{`{${m.sessionType}}`}</span>
            )}
            {m.fallback && (
              <span className="text-[10px] px-1.5 py-0 rounded bg-amber-900/50 text-amber-300 border border-amber-700/40">
                fallback
              </span>
            )}
          </div>
          {/* Second line: metrics */}
          <div className="flex items-center gap-3 mt-0.5 font-mono text-xs">
            {m.inputTokens != null && (
              <span className="text-zinc-500">
                <span className="text-blue-400">{m.inputTokens.toLocaleString()}</span>
                <span className="text-zinc-600">↑ </span>
                <span className="text-purple-400">{m.outputTokens?.toLocaleString()}</span>
                <span className="text-zinc-600">↓ </span>
                <span className="text-zinc-600">({totalTokens.toLocaleString()} tok)</span>
              </span>
            )}
            {cost && <span className="text-yellow-400 font-semibold">{cost}</span>}
            {durationSec && <span className="text-zinc-500">{durationSec}</span>}
          </div>
        </div>

        {/* Absolute timestamp — always visible */}
        <span className="font-mono text-[10px] text-zinc-500 shrink-0 mt-0.5">
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
        className={`flex items-start gap-3 px-3 py-2 border-b border-zinc-900 hover:bg-zinc-900/40 cursor-pointer ${
          isKillSwitch ? "bg-red-950/30 border-red-900/40" :
          isWarn ? "bg-amber-950/10" : ""
        }`}
        onClick={onToggle}
      >
        {/* Expand chevron */}
        <span className="text-zinc-700 shrink-0 mt-0.5">
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>

        {/* Relative timestamp */}
        <span className="font-mono text-xs text-teal-600 shrink-0 w-14 pt-0.5 tabular-nums">
          {relTime}
        </span>

        {/* Icon */}
        {isKillSwitch
          ? <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          : <TrendingUp className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
        }

        {/* Message */}
        <span className={`font-mono text-xs flex-1 leading-snug pt-0.5 ${
          isKillSwitch ? "text-red-300 font-semibold" :
          isWarn ? "text-amber-300" :
          line.level === "INFO" ? "text-teal-200" : "text-zinc-500"
        }`}>
          {line.message}
        </span>

        {/* Absolute timestamp — always visible */}
        <span className="font-mono text-[10px] text-zinc-500 shrink-0 mt-0.5">
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
        className="flex items-center gap-3 px-3 py-1.5 border-b border-zinc-900/60 cursor-pointer hover:bg-zinc-900/20"
        onClick={onToggle}
      >
        <span className="text-zinc-700 shrink-0">
          {expanded
            ? <ChevronDown className="w-3 h-3" />
            : <ChevronRight className="w-3 h-3" />
          }
        </span>
        <span className="font-mono text-xs text-zinc-700 shrink-0 w-14 tabular-nums">{relTime}</span>
        <Activity className="w-3 h-3 text-zinc-600 shrink-0" />
        <span className="font-mono text-xs text-zinc-600 flex-1">{line.message}</span>
        <span className="font-mono text-[10px] text-zinc-700 shrink-0">{line.timestamp}</span>
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
      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-colors ${
        active
          ? "bg-zinc-700 border-zinc-600 text-zinc-200"
          : "bg-transparent border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400"
      }`}
    >
      {label}
      <span className={`${active ? "text-zinc-300" : "text-zinc-600"}`}>{count}</span>
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
  const totalCost = aiLines.reduce((s, l) => s + (l.meta?.costUsd ?? 0), 0);

  // Filtered lines
  const filteredLines = sourceFilter === "all"
    ? lines
    : lines.filter((l) => l.source === sourceFilter);

  return (
    <div className="flex flex-col h-full bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/80 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-300">Console Live</span>
          {/* Status */}
          <span className="flex items-center gap-1">
            {status === "connected" && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
            {status === "connecting" && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
            {status === "disconnected" && <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />}
            <span className={`text-[10px] ${
              status === "connected" ? "text-teal-400" :
              status === "connecting" ? "text-amber-400" : "text-zinc-500"
            }`}>{status}</span>
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-3 font-mono text-[10px]">
          {aiLines.length > 0 && (
            <span className="text-violet-400">
              <Bot className="w-3 h-3 inline mr-1" />
              {aiLines.length} calls
              {totalCost > 0 && <span className="text-yellow-400 ml-1">${totalCost.toFixed(4)}</span>}
            </span>
          )}
          {tradeLines.length > 0 && (
            <span className="text-teal-500">
              <TrendingUp className="w-3 h-3 inline mr-1" />
              {tradeLines.length}
            </span>
          )}
          <span className="text-zinc-700">{lines.length}</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={() => setLines([])} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-400" title="Clear">
            <Trash2 className="w-3 h-3" />
          </button>
          {status === "connected"
            ? <button onClick={disconnect} className="p-1 rounded hover:bg-zinc-800 text-teal-500 hover:text-red-400" title="Disconnect"><Wifi className="w-3 h-3" /></button>
            : <button onClick={connect} className="p-1 rounded hover:bg-zinc-800 text-zinc-600 hover:text-teal-400" title="Connect"><WifiOff className="w-3 h-3" /></button>
          }
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-zinc-800/60 bg-zinc-900/40 shrink-0">
        <FilterPill
          active={sourceFilter === "all"}
          label="Tutti"
          count={lines.length}
          onClick={() => setSourceFilter("all")}
        />
        <FilterPill
          active={sourceFilter === "ai"}
          label="🤖 AI"
          count={aiLines.length}
          onClick={() => setSourceFilter("ai")}
        />
        <FilterPill
          active={sourceFilter === "trading"}
          label="📈 Trading"
          count={tradeLines.length}
          onClick={() => setSourceFilter("trading")}
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
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-600">
            <Terminal className="w-6 h-6" />
            <span className="text-xs">
              {sourceFilter !== "all"
                ? `Nessun evento ${sourceFilter === "ai" ? "AI" : "Trading"}`
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
            if (line.source === "ai")      return <AiRow      key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            if (line.source === "trading") return <TradeRow   key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
            return                                <SystemRow  key={line.id} line={line} relTime={relTime} expanded={expanded} onToggle={toggle} />;
          })
        )}
      </div>

      {/* ── Scroll indicator ── */}
      {!autoScroll && filteredLines.length > 0 && (
        <div className="shrink-0 px-3 py-1.5 border-t border-zinc-800 bg-zinc-900/60">
          <button
            onClick={() => {
              setAutoScroll(true);
              if (containerRef.current) containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }}
            className="text-[10px] text-amber-400 hover:text-amber-300"
          >
            ↓ Scroll disabilitato — clicca per tornare in fondo
          </button>
        </div>
      )}
    </div>
  );
}
