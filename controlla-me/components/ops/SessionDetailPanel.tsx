"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Monitor, Bot, Clock, Info } from "lucide-react";

// ─── Types ───

interface SessionData {
  pid: number;
  type: "console" | "task-runner" | "daemon";
  target: string;
  taskId?: string;
  startedAt: string;
  status: "active" | "closing";
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
  unknown: "Sconosciuto",
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

// ─── Component ───

export function SessionDetailPanel({ session, onClose }: SessionDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus management: move focus into panel on mount (WCAG 2.4.3)
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Escape key + focus trap (WCAG 2.1.1, 2.4.3)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
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
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const cfg = TYPE_CONFIG[session.type];
  const Icon = cfg.icon;
  const isClosing = session.status === "closing";
  const deptLabel = DEPT_LABELS[session.target] ?? session.target;
  const isTerminalSession = !session.target || session.target === "unknown";
  const sessionLabel = session.type === "daemon"
    ? `daemon-${String(session.pid).slice(-6)}`
    : session.type === "task-runner"
      ? `task-${session.taskId?.slice(0, 8) ?? String(session.pid).slice(-6)}`
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
        className="relative w-[480px] max-w-full h-full flex flex-col shadow-2xl"
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
          className="px-6 pt-5 pb-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-dark-subtle)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg}`}>
              <Icon className={`w-4 h-4 ${cfg.color}`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                className="text-sm font-semibold truncate"
                style={{ color: "var(--fg-primary)" }}
              >
                Sessione: {sessionLabel}
              </h2>
              <p
                className="text-xs mt-0.5"
                style={{ color: "var(--fg-secondary)" }}
              >
                PID {session.pid}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Info rows */}
          <div className="space-y-3.5">
            <InfoRow label="Stato">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isClosing ? "bg-[#d4a843]" : "bg-emerald-400"
                  }`}
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

            <InfoRow label="Target">
              <span
                className="text-sm font-mono"
                style={{ color: "var(--fg-secondary)" }}
              >
                {session.target || "---"}
              </span>
            </InfoRow>

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

            <InfoRow label="PID">
              <span
                className="text-sm font-mono tabular-nums"
                style={{ color: "var(--fg-secondary)" }}
              >
                {session.pid}
              </span>
            </InfoRow>

            <InfoRow label="Avviata">
              <span
                className="text-sm"
                style={{ color: "var(--fg-primary)" }}
              >
                {formatDuration(session.startedAt)}
              </span>
              <span
                className="text-xs ml-2"
                style={{ color: "var(--fg-muted)" }}
              >
                ({formatTime(session.startedAt)})
              </span>
            </InfoRow>
          </div>

          {/* Terminal session info box */}
          {isTerminalSession && (
            <div
              className="flex gap-3 p-3.5 rounded-lg"
              style={{
                background: "rgba(93, 228, 199, 0.06)",
                border: "1px solid rgba(93, 228, 199, 0.12)",
              }}
            >
              <Info
                className="w-4 h-4 shrink-0 mt-0.5"
                style={{ color: "var(--fg-muted)" }}
                aria-hidden="true"
              />
              <div>
                <p
                  className="text-xs font-medium mb-1"
                  style={{ color: "var(--fg-secondary)" }}
                >
                  Sessione terminale
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Le sessioni aperte dal terminale non hanno target automatico.
                  Il dipartimento di destinazione non e determinabile.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 text-center"
          style={{ borderTop: "1px solid var(--border-dark-subtle)" }}
        >
          <p
            className="text-[10px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Dati aggiornati in tempo reale
          </p>
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
