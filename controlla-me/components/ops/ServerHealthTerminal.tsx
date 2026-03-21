"use client";

/**
 * ServerHealthTerminal — Visualizzazione server health in stile terminale.
 *
 * Mostra CPU, RAM, disco, processi top 5, Node.js runtime e uptime
 * in un pannello con estetica da terminale (sfondo scuro, font mono, prompt-style).
 *
 * Usato sia in /poimandres/server (pagina dedicata) sia nel tab Terminali di /ops.
 * Dati da GET /api/company/server.
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Server, Cpu, HardDrive, MemoryStick, Activity } from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ServerMetrics {
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
    topByMemory: Array<{
      name: string;
      pid: number;
      memMB: number;
      cpuPercent: number;
    }>;
  };
  node: {
    version: string;
    memoryUsageMB: number;
    heapUsedMB: number;
    heapTotalMB: number;
  };
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getBarColor(percent: number): string {
  if (percent < 60) return "#5de4c7";  // cyan — healthy
  if (percent < 80) return "#d0679d";  // magenta — warning
  return "#e58d78";                     // coral — critical
}

function TerminalBar({ percent, width = 30 }: { percent: number; width?: number }) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const color = getBarColor(percent);
  return (
    <span className="font-mono text-xs">
      <span style={{ color }}>{"█".repeat(filled)}</span>
      <span style={{ color: "#383b4d" }}>{"░".repeat(empty)}</span>
      <span style={{ color: "#767c9d" }}> {percent}%</span>
    </span>
  );
}

function TerminalLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="font-mono text-xs flex-none" style={{ color: "#767c9d", width: "120px" }}>
        {label}
      </span>
      <span className="font-mono text-xs" style={{ color: "#e4f0fb" }}>
        {children}
      </span>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ServerHealthTerminal({
  pollInterval = 30000,
  compact = false,
}: {
  pollInterval?: number;
  compact?: boolean;
}) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch("/api/company/server", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMetrics(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore connessione");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    const iv = setInterval(fetchMetrics, pollInterval);
    return () => clearInterval(iv);
  }, [fetchMetrics, pollInterval]);

  // ── Loading state ──
  if (loading && !metrics) {
    return (
      <div
        className="rounded-lg p-4 flex items-center gap-3"
        style={{ background: "#1a1b26", border: "1px solid #2a2b3d" }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <RefreshCw className="w-4 h-4" style={{ color: "#5de4c7" }} />
        </motion.div>
        <span className="font-mono text-xs" style={{ color: "#767c9d" }}>
          Connessione al server...
        </span>
      </div>
    );
  }

  // ── Error state ──
  if (error && !metrics) {
    return (
      <div
        className="rounded-lg p-4"
        style={{ background: "#1a1b26", border: "1px solid #e58d78" }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Server className="w-4 h-4" style={{ color: "#e58d78" }} />
          <span className="font-mono text-xs font-bold" style={{ color: "#e58d78" }}>
            ERRORE CONNESSIONE
          </span>
        </div>
        <span className="font-mono text-xs" style={{ color: "#767c9d" }}>
          {error}
        </span>
        <button
          onClick={fetchMetrics}
          className="mt-2 font-mono text-xs px-2 py-1 rounded"
          style={{ background: "#2a2b3d", color: "#5de4c7" }}
        >
          Riprova
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "#1a1b26", border: "1px solid #2a2b3d" }}
    >
      {/* ── Header ── */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ background: "#16171f", borderBottom: "1px solid #2a2b3d" }}
      >
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5" style={{ color: "#5de4c7" }} />
          <span className="font-mono text-xs font-bold" style={{ color: "#e4f0fb" }}>
            {metrics.hostname}
          </span>
          <span className="font-mono text-[10px]" style={{ color: "#767c9d" }}>
            up {formatUptime(metrics.uptime)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="font-mono text-[10px]" style={{ color: "#767c9d" }}>
              {lastRefresh.toLocaleTimeString("it-IT")}
            </span>
          )}
          <button
            onClick={fetchMetrics}
            className="p-1 rounded hover:bg-white/5 transition-colors"
            aria-label="Aggiorna metriche"
          >
            <RefreshCw className="w-3 h-3" style={{ color: "#767c9d" }} />
          </button>
        </div>
      </div>

      <div className={`p-4 ${compact ? "space-y-3" : "space-y-4"}`}>
        {/* ── CPU ── */}
        <Section icon={Cpu} title="CPU" color="#5de4c7">
          <TerminalLine label="Modello">
            {metrics.cpu.model.length > 40
              ? metrics.cpu.model.slice(0, 40) + "..."
              : metrics.cpu.model}
          </TerminalLine>
          <TerminalLine label="Core">{metrics.cpu.cores}</TerminalLine>
          <TerminalLine label="Utilizzo">
            <TerminalBar percent={metrics.cpu.usagePercent} />
          </TerminalLine>
          <TerminalLine label="Load Avg">
            {metrics.cpu.loadAvg.map((v) => v.toFixed(2)).join(" / ")}
          </TerminalLine>
        </Section>

        {/* ── Memory ── */}
        <Section icon={MemoryStick} title="MEMORIA" color="#add7ff">
          <TerminalLine label="RAM">
            <TerminalBar percent={metrics.memory.usagePercent} />
          </TerminalLine>
          <TerminalLine label="Dettaglio">
            {metrics.memory.usedGB}GB / {metrics.memory.totalGB}GB
            <span style={{ color: "#767c9d" }}> ({metrics.memory.freeGB}GB liberi)</span>
          </TerminalLine>
          {metrics.memory.swapTotalGB > 0 && (
            <TerminalLine label="Swap">
              {metrics.memory.swapUsedGB}GB / {metrics.memory.swapTotalGB}GB
            </TerminalLine>
          )}
        </Section>

        {/* ── Disk ── */}
        <Section icon={HardDrive} title="DISCO" color="#d0679d">
          <TerminalLine label="Utilizzo">
            <TerminalBar percent={metrics.disk.usagePercent} />
          </TerminalLine>
          <TerminalLine label="Dettaglio">
            {metrics.disk.usedGB}GB / {metrics.disk.totalGB}GB
            <span style={{ color: "#767c9d" }}> ({metrics.disk.freeGB}GB liberi)</span>
          </TerminalLine>
        </Section>

        {/* ── Node.js ── */}
        <Section icon={Activity} title="NODE.JS" color="#FFC832">
          <TerminalLine label="Versione">{metrics.node.version}</TerminalLine>
          <TerminalLine label="RSS">{metrics.node.memoryUsageMB} MB</TerminalLine>
          <TerminalLine label="Heap">
            {metrics.node.heapUsedMB} / {metrics.node.heapTotalMB} MB
          </TerminalLine>
        </Section>

        {/* ── Top processi ── */}
        {!compact && metrics.processes.topByMemory.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-mono text-[10px] font-bold tracking-wider" style={{ color: "#767c9d" }}>
                TOP PROCESSI ({metrics.processes.total} totali)
              </span>
            </div>
            <div
              className="rounded overflow-hidden"
              style={{ background: "#16171f", border: "1px solid #2a2b3d" }}
            >
              {/* Header */}
              <div
                className="grid grid-cols-[1fr_60px_60px_50px] gap-2 px-3 py-1"
                style={{ borderBottom: "1px solid #2a2b3d" }}
              >
                <span className="font-mono text-[10px]" style={{ color: "#767c9d" }}>NOME</span>
                <span className="font-mono text-[10px] text-right" style={{ color: "#767c9d" }}>PID</span>
                <span className="font-mono text-[10px] text-right" style={{ color: "#767c9d" }}>MEM</span>
                <span className="font-mono text-[10px] text-right" style={{ color: "#767c9d" }}>CPU%</span>
              </div>
              {metrics.processes.topByMemory.map((proc, i) => (
                <div
                  key={proc.pid}
                  className="grid grid-cols-[1fr_60px_60px_50px] gap-2 px-3 py-1"
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <span className="font-mono text-xs truncate" style={{ color: "#e4f0fb" }}>
                    {proc.name}
                  </span>
                  <span className="font-mono text-xs text-right" style={{ color: "#767c9d" }}>
                    {proc.pid}
                  </span>
                  <span className="font-mono text-xs text-right" style={{ color: "#add7ff" }}>
                    {proc.memMB}MB
                  </span>
                  <span
                    className="font-mono text-xs text-right"
                    style={{ color: proc.cpuPercent > 50 ? "#e58d78" : "#5de4c7" }}
                  >
                    {proc.cpuPercent}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section helper ─────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span
          className="font-mono text-[10px] font-bold tracking-wider"
          style={{ color }}
        >
          {title}
        </span>
      </div>
      <div className="pl-5">{children}</div>
    </div>
  );
}
