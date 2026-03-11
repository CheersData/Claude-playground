"use client";

/**
 * DaemonControlPanel — Controllo CME Autorun Daemon da /ops.
 *
 * Mostra:
 *   - Toggle on/off daemon
 *   - Slider frequenza (5-120 min)
 *   - Stato corrente (running/idle/disabled)
 *   - Statistiche: ultimo run, durata, exit code, total runs
 *   - Ultimi log con link
 */

import { useState, useEffect, useCallback } from "react";
import {
  Power,
  Clock,
  Play,
  RefreshCw,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Timer,
  Zap,
} from "lucide-react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";

interface DaemonLog {
  name: string;
  date: string;
  size: number;
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
  logs: DaemonLog[];
}

export function DaemonControlPanel() {
  const [state, setState] = useState<DaemonState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);

  // ── Fetch stato daemon ──────────────────────────────────────────────────
  const fetchState = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/company/daemon", {
        headers: getConsoleAuthHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DaemonState = await res.json();
      setState(data);
      setPendingInterval(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    // Auto-refresh ogni 30 secondi
    const interval = setInterval(fetchState, 30_000);
    return () => clearInterval(interval);
  }, [fetchState]);

  // ── Toggle enabled ────────────────────────────────────────────────────
  const toggleEnabled = async () => {
    if (!state) return;
    setSaving(true);
    try {
      const res = await fetch("/api/company/daemon", {
        method: "PUT",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({ enabled: !state.enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setState((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  // ── Cambio intervallo ─────────────────────────────────────────────────
  const updateInterval = async (minutes: number) => {
    setSaving(true);
    try {
      const res = await fetch("/api/company/daemon", {
        method: "PUT",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({ intervalMinutes: minutes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setState((prev) => (prev ? { ...prev, ...updated } : prev));
      setPendingInterval(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore aggiornamento");
    } finally {
      setSaving(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────
  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
    return `${(ms / 60_000).toFixed(1)}min`;
  };

  const formatTimeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000) return "ora";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min fa`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h fa`;
    return `${Math.floor(diff / 86_400_000)}g fa`;
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="w-5 h-5 text-[var(--fg-invisible)] animate-spin" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-lg p-4">
        <p className="text-[var(--error)] text-xs">{error || "Impossibile caricare stato daemon"}</p>
        <button onClick={fetchState} className="text-[var(--error)] hover:text-[var(--fg-primary)] text-xs underline mt-2">
          Riprova
        </button>
      </div>
    );
  }

  const displayInterval = pendingInterval ?? state.intervalMinutes;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="w-4 h-4 text-[var(--accent)]" />
          <h2 className="text-sm font-semibold text-[var(--fg-primary)]">CME Daemon</h2>
        </div>
        <button
          onClick={fetchState}
          className="text-[var(--fg-invisible)] hover:text-[var(--fg-primary)] transition-colors p-1"
          title="Aggiorna"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Errore */}
      {error && (
        <div className="bg-[var(--error)]/10 border border-[var(--error)]/30 rounded-lg px-3 py-2 text-[var(--error)] text-xs">
          {error}
        </div>
      )}

      {/* Status card */}
      <div className="bg-[var(--bg-raised)]/80 border border-[var(--border-dark-subtle)] rounded-lg p-4 space-y-4">
        {/* Power toggle + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Status indicator */}
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                state.running
                  ? "bg-[var(--success)] shadow-[0_0_8px_rgba(93,228,199,0.5)] animate-pulse"
                  : state.enabled
                    ? "bg-[var(--identity-gold)] shadow-[0_0_8px_rgba(255,200,50,0.3)]"
                    : "bg-[var(--border-dark)]"
              }`}
            />
            <div>
              <p className="text-xs font-medium text-[var(--fg-primary)]">
                {state.running ? "In esecuzione" : state.enabled ? "Attivo — in attesa" : "Disabilitato"}
              </p>
              <p className="text-xs text-[var(--fg-invisible)]">
                {state.running
                  ? "Sessione Claude in corso..."
                  : state.enabled
                    ? `Prossimo run tra ~${state.intervalMinutes}min`
                    : "Il daemon non si avvia"}
              </p>
            </div>
          </div>

          {/* Power button */}
          <button
            onClick={toggleEnabled}
            disabled={saving}
            className={`relative w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
              state.enabled
                ? "bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30"
                : "bg-[var(--bg-overlay)] border border-[var(--border-dark)] text-[var(--fg-invisible)] hover:text-[var(--fg-primary)] hover:border-[var(--border-dark)]"
            } ${saving ? "opacity-50 cursor-wait" : ""}`}
            title={state.enabled ? "Disabilita daemon" : "Abilita daemon"}
          >
            <Power className="w-4 h-4" />
          </button>
        </div>

        {/* Interval slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-[var(--fg-invisible)]" />
              <span className="text-xs text-[var(--fg-invisible)] uppercase tracking-wider">Frequenza</span>
            </div>
            <span className="text-xs font-mono text-[var(--fg-primary)]">{displayInterval} min</span>
          </div>

          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={displayInterval}
            onChange={(e) => setPendingInterval(parseInt(e.target.value))}
            onMouseUp={() => {
              if (pendingInterval !== null && pendingInterval !== state.intervalMinutes) {
                updateInterval(pendingInterval);
              }
            }}
            onTouchEnd={() => {
              if (pendingInterval !== null && pendingInterval !== state.intervalMinutes) {
                updateInterval(pendingInterval);
              }
            }}
            disabled={saving}
            className="w-full h-1 bg-[var(--bg-overlay)] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--accent)] [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:hover:bg-[var(--accent)]"
          />

          <div className="flex justify-between text-xs text-[var(--fg-invisible)]">
            <span>5min</span>
            <span>30min</span>
            <span>60min</span>
            <span>120min</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Ultimo run */}
        <div className="bg-[var(--bg-raised)]/60 border border-[var(--border-dark-subtle)]/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="w-3 h-3 text-[var(--fg-invisible)]" />
            <span className="text-xs text-[var(--fg-invisible)] uppercase tracking-wider">Ultimo run</span>
          </div>
          <p className="text-xs font-mono text-[var(--fg-primary)]">
            {state.lastRun ? formatTimeAgo(state.lastRun) : "—"}
          </p>
        </div>

        {/* Durata */}
        <div className="bg-[var(--bg-raised)]/60 border border-[var(--border-dark-subtle)]/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3 h-3 text-[var(--fg-invisible)]" />
            <span className="text-xs text-[var(--fg-invisible)] uppercase tracking-wider">Durata</span>
          </div>
          <p className="text-xs font-mono text-[var(--fg-primary)]">
            {state.lastDurationMs !== null ? formatDuration(state.lastDurationMs) : "—"}
          </p>
        </div>

        {/* Exit code */}
        <div className="bg-[var(--bg-raised)]/60 border border-[var(--border-dark-subtle)]/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            {state.lastExitCode === 0 ? (
              <CheckCircle className="w-3 h-3 text-[var(--success)]" />
            ) : state.lastExitCode !== null ? (
              <XCircle className="w-3 h-3 text-[var(--error)]" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-[var(--fg-invisible)]" />
            )}
            <span className="text-xs text-[var(--fg-invisible)] uppercase tracking-wider">Exit code</span>
          </div>
          <p
            className={`text-xs font-mono ${
              state.lastExitCode === 0
                ? "text-[var(--success)]"
                : state.lastExitCode !== null
                  ? "text-[var(--error)]"
                  : "text-[var(--fg-primary)]"
            }`}
          >
            {state.lastExitCode !== null ? state.lastExitCode : "—"}
          </p>
        </div>

        {/* Total runs */}
        <div className="bg-[var(--bg-raised)]/60 border border-[var(--border-dark-subtle)]/60 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Play className="w-3 h-3 text-[var(--fg-invisible)]" />
            <span className="text-xs text-[var(--fg-invisible)] uppercase tracking-wider">Totale run</span>
          </div>
          <p className="text-xs font-mono text-[var(--fg-primary)]">{state.totalRuns}</p>
        </div>
      </div>

      {/* Log recenti */}
      {state.logs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-3 h-3 text-[var(--fg-invisible)]" />
            <span className="text-xs text-[var(--fg-invisible)] uppercase tracking-wider">Log recenti</span>
          </div>
          <div className="bg-[var(--bg-raised)]/60 border border-[var(--border-dark-subtle)]/60 rounded-lg divide-y divide-[var(--border-dark)]/60">
            {state.logs.slice(0, 5).map((log) => (
              <div key={log.name} className="px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-[var(--fg-invisible)]" />
                  <span className="text-xs text-[var(--fg-secondary)] font-mono">
                    {log.name.replace(".md", "")}
                  </span>
                </div>
                <span className="text-xs text-[var(--fg-invisible)]">
                  {(log.size / 1024).toFixed(1)}KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="text-xs text-[var(--fg-invisible)] text-center space-y-0.5">
        {state.updatedAt && (
          <p>
            Aggiornato {formatTimeAgo(state.updatedAt)} da {state.updatedBy}
          </p>
        )}
        <p>Bat: AVVIA_CME_CONTINUO.bat | Script: cme-autorun.ts</p>
      </div>
    </div>
  );
}
