"use client";

/**
 * SyncProgress — Real-time sync progress indicator with staged pipeline.
 *
 * Stages: Connecting -> Fetching -> Mapping -> Analyzing -> Done
 * Features:
 *   - Polls /api/integrations/[connectorId]/sync every 3 seconds during active sync
 *   - Stage-specific icons, colors and labels
 *   - Record counter (e.g. "142/500 records")
 *   - Estimated time remaining based on fetch rate
 *   - Cancel sync button
 *
 * Design: Poimandres dark theme, framer-motion for smooth transitions.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plug,
  Download,
  GitMerge,
  Brain,
  CheckCircle,
  Loader2,
  XCircle,
  X,
  Clock,
  Info,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ─── Types ───

export type SyncStage = "connecting" | "fetching" | "mapping" | "analyzing" | "done" | "error" | "cancelled";

export interface SyncProgressData {
  stage: SyncStage;
  progress: number; // 0-100
  recordsSynced: number;
  recordsTotal: number;
  message?: string;
  error?: string;
  startedAt?: string;
}

export interface SupervisorMessage {
  message: string;
  severity: "info" | "warning" | "error";
  suggestion?: string;
  timestamp: Date;
}

interface SyncProgressProps {
  connectorId: string;
  active: boolean;
  onComplete?: (data: SyncProgressData) => void;
  onCancel?: () => void;
  /** Optional initial data to show before first poll */
  initialData?: Partial<SyncProgressData>;
  /** Supervisor agent messages received via SSE */
  supervisorMessages?: SupervisorMessage[];
}

// ─── Stage config ───

interface StageConfig {
  label: string;
  description: string;
  Icon: LucideIcon;
  color: string;
  bg: string;
}

const STAGE_ORDER: SyncStage[] = ["connecting", "fetching", "mapping", "analyzing", "done"];

const STAGE_CONFIG: Record<SyncStage, StageConfig> = {
  connecting: {
    label: "Connessione",
    description: "Verifica credenziali e permessi...",
    Icon: Plug,
    color: "var(--info-bright)",
    bg: "rgba(137, 221, 255, 0.1)",
  },
  fetching: {
    label: "Recupero dati",
    description: "Download record dalla piattaforma...",
    Icon: Download,
    color: "var(--accent)",
    bg: "rgba(255, 107, 53, 0.1)",
  },
  mapping: {
    label: "Mappatura",
    description: "Normalizzazione e trasformazione campi...",
    Icon: GitMerge,
    color: "var(--caution)",
    bg: "rgba(255, 250, 194, 0.1)",
  },
  analyzing: {
    label: "Analisi AI",
    description: "Analisi legale dei documenti importati...",
    Icon: Brain,
    color: "#A78BFA",
    bg: "rgba(167, 139, 250, 0.1)",
  },
  done: {
    label: "Completata",
    description: "Sincronizzazione completata con successo",
    Icon: CheckCircle,
    color: "var(--success)",
    bg: "rgba(93, 228, 199, 0.1)",
  },
  error: {
    label: "Errore",
    description: "Sincronizzazione interrotta per errore",
    Icon: XCircle,
    color: "var(--error)",
    bg: "rgba(229, 141, 120, 0.1)",
  },
  cancelled: {
    label: "Annullata",
    description: "Sincronizzazione annullata dall'utente",
    Icon: X,
    color: "var(--fg-muted)",
    bg: "var(--bg-overlay)",
  },
};

const POLL_INTERVAL = 3000;

// ─── Helpers ───

function getStageIndex(stage: SyncStage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return idx >= 0 ? idx : 0;
}

function formatETA(seconds: number): string {
  if (seconds <= 0 || !isFinite(seconds)) return "--";
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `~${mins}m ${secs}s`;
}

// ─── Component ───

export default function SyncProgress({
  connectorId,
  active,
  onComplete,
  onCancel,
  initialData,
  supervisorMessages,
}: SyncProgressProps) {
  const supervisorLogRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<SyncProgressData>({
    stage: initialData?.stage ?? "connecting",
    progress: initialData?.progress ?? 0,
    recordsSynced: initialData?.recordsSynced ?? 0,
    recordsTotal: initialData?.recordsTotal ?? 0,
    message: initialData?.message,
    error: initialData?.error,
    startedAt: initialData?.startedAt ?? new Date().toISOString(),
  });

  const [eta, setEta] = useState<string>("--");
  const prevRecordsRef = useRef(0);
  const prevTimestampRef = useRef(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Poll for sync status ───

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations/${connectorId}/sync`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) return;

      const json = await res.json();

      // Map API response to SyncProgressData
      const newData: SyncProgressData = {
        stage: json.stage ?? json.status ?? "connecting",
        progress: json.progress ?? 0,
        recordsSynced: json.recordsSynced ?? json.itemCount ?? 0,
        recordsTotal: json.recordsTotal ?? json.totalItems ?? 0,
        message: json.message,
        error: json.error,
        startedAt: data.startedAt,
      };

      // Calculate ETA based on record fetch rate
      const now = Date.now();
      const recordDelta = newData.recordsSynced - prevRecordsRef.current;
      const timeDelta = (now - prevTimestampRef.current) / 1000; // seconds

      if (recordDelta > 0 && timeDelta > 0 && newData.recordsTotal > 0) {
        const rate = recordDelta / timeDelta; // records/second
        const remaining = newData.recordsTotal - newData.recordsSynced;
        setEta(formatETA(remaining / rate));
      }

      prevRecordsRef.current = newData.recordsSynced;
      prevTimestampRef.current = now;

      setData(newData);

      // Check terminal states
      if (newData.stage === "done" || newData.stage === "error" || newData.stage === "cancelled") {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        if (newData.stage === "done") {
          onComplete?.(newData);
        }
      }
    } catch {
      // Silently retry on next interval
    }
  }, [connectorId, data.startedAt, onComplete]);

  // Start/stop polling
  useEffect(() => {
    if (active && !pollRef.current) {
      pollStatus(); // Initial fetch
      pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
    }

    if (!active && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [active, pollStatus]);

  // ─── Cancel handler ───

  const handleCancel = useCallback(async () => {
    try {
      await fetch(`/api/integrations/${connectorId}/sync`, {
        method: "DELETE",
      });
      setData((prev) => ({ ...prev, stage: "cancelled" }));
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      onCancel?.();
    } catch {
      // Ignore
    }
  }, [connectorId, onCancel]);

  // ─── Render ───

  const currentConfig = STAGE_CONFIG[data.stage] ?? STAGE_CONFIG.connecting;
  const { Icon: CurrentIcon } = currentConfig;
  const currentStageIdx = getStageIndex(data.stage);
  const isTerminal = data.stage === "done" || data.stage === "error" || data.stage === "cancelled";
  const showRecords = data.recordsTotal > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-dark-subtle)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-lg"
            style={{ background: currentConfig.bg }}
          >
            <CurrentIcon
              className={`w-5 h-5 ${!isTerminal ? "animate-pulse" : ""}`}
              style={{ color: currentConfig.color }}
            />
          </div>
          <div>
            <h4 className="text-sm font-semibold" style={{ color: "var(--fg-primary)" }}>
              {currentConfig.label}
            </h4>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {data.message || currentConfig.description}
            </p>
          </div>
        </div>

        {/* ETA + Cancel */}
        <div className="flex items-center gap-3">
          {!isTerminal && eta !== "--" && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--fg-muted)" }}>
              <Clock className="w-3 h-3" />
              {eta}
            </div>
          )}

          {!isTerminal && onCancel && (
            <button
              onClick={handleCancel}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02]"
              style={{
                background: "rgba(229, 141, 120, 0.1)",
                color: "var(--error)",
                border: "1px solid rgba(229, 141, 120, 0.2)",
              }}
            >
              Annulla
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5">
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: "var(--bg-overlay)" }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: isTerminal && data.stage !== "done"
                ? currentConfig.color
                : `linear-gradient(to right, var(--accent), ${currentConfig.color})`,
            }}
            initial={false}
            animate={{ width: `${data.progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          {/* Shimmer effect on active progress */}
          {!isTerminal && (
            <motion.div
              className="absolute inset-y-0 rounded-full"
              style={{
                width: "30%",
                background:
                  "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)",
              }}
              animate={{ left: ["-30%", "130%"] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </div>

        {/* Record counter + percentage */}
        <div className="flex items-center justify-between mt-2 mb-4">
          {showRecords ? (
            <span className="text-xs font-mono" style={{ color: "var(--fg-muted)" }}>
              <span style={{ color: "var(--info-bright)" }}>
                {data.recordsSynced.toLocaleString("it-IT")}
              </span>
              /{data.recordsTotal.toLocaleString("it-IT")} record
            </span>
          ) : (
            <span className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {data.stage === "connecting" ? "Preparazione..." : "Elaborazione..."}
            </span>
          )}
          <span className="text-xs font-semibold" style={{ color: currentConfig.color }}>
            {data.progress}%
          </span>
        </div>
      </div>

      {/* Stage pipeline */}
      <div
        className="flex items-center gap-0 px-5 py-3"
        style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
      >
        {STAGE_ORDER.map((stage, i) => {
          const cfg = STAGE_CONFIG[stage];
          const StageIcon = cfg.Icon;
          const isActive = stage === data.stage;
          const isCompleted = i < currentStageIdx || data.stage === "done";
          const isFuture = i > currentStageIdx && data.stage !== "done";

          return (
            <div key={stage} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full transition-all ${
                    isActive && !isTerminal ? "ring-2 ring-offset-1" : ""
                  }`}
                  style={{
                    background: isCompleted
                      ? "rgba(93, 228, 199, 0.2)"
                      : isActive
                        ? cfg.bg
                        : "var(--bg-overlay)",
                    color: isCompleted
                      ? "var(--success)"
                      : isActive
                        ? cfg.color
                        : "var(--fg-invisible)",
                    ringColor: isActive ? cfg.color : undefined,
                    ringOffsetColor: "var(--bg-raised)",
                  } as React.CSSProperties}
                >
                  {isCompleted ? (
                    <CheckCircle className="w-3.5 h-3.5" />
                  ) : isActive && !isTerminal ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <StageIcon className="w-3.5 h-3.5" />
                  )}
                </div>
                <span
                  className="text-[10px] font-medium text-center hidden sm:block"
                  style={{
                    color: isCompleted
                      ? "var(--success)"
                      : isActive
                        ? cfg.color
                        : "var(--fg-invisible)",
                  }}
                >
                  {cfg.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STAGE_ORDER.length - 1 && (
                <div
                  className="flex-1 h-px mx-1"
                  style={{
                    background: isCompleted ? "var(--success)" : "var(--border-dark-subtle)",
                    opacity: isFuture ? 0.5 : 1,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Supervisor reasoning log */}
      <AnimatePresence>
        {supervisorMessages && supervisorMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <SupervisorLog messages={supervisorMessages} logRef={supervisorLogRef} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error details */}
      <AnimatePresence>
        {data.stage === "error" && data.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              className="mx-5 mb-4 px-4 py-3 rounded-lg text-sm"
              style={{
                background: "rgba(229, 141, 120, 0.08)",
                border: "1px solid rgba(229, 141, 120, 0.2)",
                color: "var(--error)",
              }}
            >
              {data.error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Supervisor Log Sub-component ───

const SEVERITY_CONFIG: Record<
  SupervisorMessage["severity"],
  { Icon: LucideIcon; color: string; bg: string; borderColor: string }
> = {
  info: {
    Icon: Info,
    color: "var(--info)",
    bg: "transparent",
    borderColor: "transparent",
  },
  warning: {
    Icon: AlertTriangle,
    color: "var(--caution)",
    bg: "rgba(255, 250, 194, 0.06)",
    borderColor: "rgba(255, 250, 194, 0.15)",
  },
  error: {
    Icon: XCircle,
    color: "var(--error)",
    bg: "rgba(229, 141, 120, 0.06)",
    borderColor: "rgba(229, 141, 120, 0.15)",
  },
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const supervisorMessageVariants = {
  hidden: { opacity: 0, y: 8, height: 0 } as const,
  visible: {
    opacity: 1,
    y: 0,
    height: "auto" as const,
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

function SupervisorLog({
  messages,
  logRef,
}: {
  messages: SupervisorMessage[];
  logRef: React.RefObject<HTMLDivElement | null>;
}) {
  // Auto-scroll to latest message
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, logRef]);

  return (
    <div
      className="mx-5 mb-4"
      style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
    >
      <div className="flex items-center gap-2 pt-3 pb-2">
        <Brain className="w-3.5 h-3.5" style={{ color: "#A78BFA" }} />
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--fg-muted)" }}
        >
          Ragionamento supervisore
        </span>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{
            background: "rgba(167, 139, 250, 0.1)",
            color: "#A78BFA",
          }}
        >
          {messages.length}
        </span>
      </div>

      <div
        ref={logRef}
        className="max-h-[200px] overflow-y-auto space-y-1.5 pr-1"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--border-dark) transparent",
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => {
            const cfg = SEVERITY_CONFIG[msg.severity];
            const SeverityIcon = cfg.Icon;

            return (
              <motion.div
                key={idx}
                variants={supervisorMessageVariants}
                initial="hidden"
                animate="visible"
                className="overflow-hidden"
              >
                {/* Main message */}
                <div
                  className="flex items-start gap-2 rounded-lg px-3 py-2"
                  style={{
                    background: cfg.bg,
                    border:
                      cfg.borderColor !== "transparent"
                        ? `1px solid ${cfg.borderColor}`
                        : "none",
                  }}
                >
                  <SeverityIcon
                    className="w-3.5 h-3.5 shrink-0 mt-0.5"
                    style={{ color: cfg.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: cfg.color }}
                    >
                      {msg.message}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-mono shrink-0 mt-0.5"
                    style={{ color: "var(--fg-invisible)" }}
                  >
                    {formatTime(msg.timestamp)}
                  </span>
                </div>

                {/* Suggestion tip box */}
                {msg.suggestion && (
                  <div
                    className="flex items-start gap-2 mt-1 ml-5 rounded-lg px-3 py-2"
                    style={{
                      background: "rgba(255, 107, 53, 0.05)",
                      border: "1px solid rgba(255, 107, 53, 0.12)",
                    }}
                  >
                    <Lightbulb
                      className="w-3.5 h-3.5 shrink-0 mt-0.5"
                      style={{ color: "var(--accent)" }}
                    />
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--accent)" }}
                    >
                      {msg.suggestion}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
