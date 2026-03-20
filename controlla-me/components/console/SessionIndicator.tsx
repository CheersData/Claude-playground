"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Bot, Clock, Terminal, X, AlertCircle } from "lucide-react";
import { SessionDetailPanel } from "@/components/ops/SessionDetailPanel";

// ─── Types ───

interface Session {
  pid: number;
  type: "console" | "task-runner" | "daemon" | "interactive";
  target: string;
  taskId?: string;
  startedAt: string;
  status: "active" | "closing";
}

interface SessionsData {
  count: number;
  sessions: Session[];
}

interface SessionIndicatorProps {
  onSessionsUpdate?: (sessions: Session[]) => void;
}

// ─── Constants ───

const TYPE_CONFIG: Record<Session["type"], { icon: typeof Monitor; label: string }> = {
  console:       { icon: Monitor,  label: "Console" },
  "task-runner": { icon: Bot,      label: "Task Runner" },
  daemon:        { icon: Clock,    label: "Daemon" },
  interactive:   { icon: Terminal, label: "Interactive" },
};

const DEPT_LABELS: Record<string, string> = {
  cme:                  "CME",
  "ufficio-legale":     "Uff. Legale",
  trading:              "Trading",
  integration:          "Integrazione",
  architecture:         "Architettura",
  "data-engineering":   "Data Eng.",
  "quality-assurance":  "QA",
  finance:              "Finanza",
  operations:           "Operations",
  security:             "Sicurezza",
  strategy:             "Strategia",
  marketing:            "Marketing",
  protocols:            "Protocolli",
  "ux-ui":              "UX/UI",
  acceleration:         "Accelerazione",
  interactive:          "Boss Terminal",
};

// ─── Helpers ───

function formatDuration(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h fa`;
}

function getBadgeColor(count: number): { bg: string; text: string; ring: string } {
  if (count === 0)  return { bg: "bg-[#3a3a5a]",     text: "text-[#7a7590]",   ring: "ring-[#3a3a5a]" };
  if (count <= 2)   return { bg: "bg-emerald-500/20", text: "text-emerald-400", ring: "ring-emerald-500/30" };
  return                    { bg: "bg-[#FF6B35]/20",  text: "text-[#FF6B35]",   ring: "ring-[#FF6B35]/30" };
}

// ─── Component ───

export default function SessionIndicator({ onSessionsUpdate }: SessionIndicatorProps) {
  const [data, setData] = useState<SessionsData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [durations, setDurations] = useState<Record<number, string>>({});
  const [authError, setAuthError] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // SEC-004: auth headers from sessionStorage
  const getAuthHeaders = useCallback((): HeadersInit => {
    let token: string | null = null;
    try { token = typeof window !== "undefined" ? sessionStorage.getItem("lexmea-token") : null; } catch { /* private browsing */ }
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  // Fetch sessions every 5s — with ?orphans=true for OS process discovery
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/company/sessions?orphans=true", {
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (!res.ok) return;
      setAuthError(false);
      const json: SessionsData = await res.json();
      setData(json);
      // Notify parent with session data for AgentDots bridging
      onSessionsUpdate?.(json.sessions);
    } catch {
      // silently ignore — polling will retry
    }
  }, [getAuthHeaders, onSessionsUpdate]);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 15_000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  // Update duration strings every second while expanded
  useEffect(() => {
    if (!expanded || !data?.sessions.length) return;
    const update = () => {
      const map: Record<number, string> = {};
      for (const s of data.sessions) {
        map[s.pid] = formatDuration(s.startedAt);
      }
      setDurations(map);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expanded, data]);

  // Close on Escape or click outside
  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setExpanded(false);
        buttonRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expanded]);

  const count = data?.count ?? 0;
  const colors = getBadgeColor(count);

  return (
    <>
      <div className="relative" ref={panelRef}>
        {/* Badge button */}
        <button
          ref={buttonRef}
          onClick={() => setExpanded(!expanded)}
          className={`relative flex items-center gap-1.5 px-1.5 py-0.5 rounded-full ring-1 transition-all focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${colors.bg} ${colors.ring}`}
          aria-label={`${count} session${count !== 1 ? "i" : "e"} attiv${count !== 1 ? "e" : "a"}. ${expanded ? "Chiudi" : "Apri"} pannello sessioni`}
          aria-expanded={expanded}
          aria-haspopup="true"
        >
          <Monitor className={`w-3 h-3 ${colors.text}`} aria-hidden="true" />
          <motion.span
            key={count}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`text-[11px] font-semibold tabular-nums leading-none ${colors.text}`}
          >
            {count}
          </motion.span>

          {/* Auth error indicator */}
          {authError && (
            <span
              className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500"
              title="Errore autenticazione sessioni (401)"
              aria-label="Errore autenticazione"
            />
          )}

          {/* Pulse ring when sessions > 0 */}
          {count > 0 && !authError && (
            <motion.span
              className={`absolute inset-0 rounded-full ring-1 ${colors.ring}`}
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden="true"
            />
          )}
        </button>

        {/* Dropdown panel */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-full mt-2 z-50 w-72 sm:w-80 rounded-xl border border-[var(--pb-border)] bg-[var(--pb-bg-panel)] shadow-2xl overflow-hidden"
              role="dialog"
              aria-modal="false"
              aria-label="Sessioni attive"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--pb-border)]">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-[var(--pb-text)]">
                    Sessioni attive
                  </h3>
                  <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${colors.bg} ${colors.text}`}>
                    {count}
                  </span>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="text-[var(--pb-text-dim)] hover:text-[var(--pb-text)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
                  aria-label="Chiudi pannello sessioni"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Auth error banner */}
              {authError && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" aria-hidden="true" />
                  <p className="text-[11px] text-red-400">
                    Autenticazione fallita (401)
                  </p>
                </div>
              )}

              {/* Session list */}
              <div className="max-h-64 overflow-y-auto">
                {(!data || data.sessions.length === 0) ? (
                  <div className="px-4 py-6 text-center">
                    <Monitor className="w-8 h-8 mx-auto mb-2 text-[var(--pb-text-dim)] opacity-50" aria-hidden="true" />
                    <p className="text-sm text-[var(--pb-text-dim)]">
                      Nessuna sessione attiva
                    </p>
                  </div>
                ) : (
                  <ul className="py-1" role="list" aria-label="Lista sessioni">
                    <AnimatePresence mode="popLayout">
                      {data.sessions.map((session, i) => {
                        const cfg = TYPE_CONFIG[session.type];
                        const Icon = cfg.icon;
                        const deptLabel = DEPT_LABELS[session.target] ?? session.target;
                        const isClosing = session.status === "closing";

                        return (
                          <motion.li
                            key={session.pid}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 8, height: 0 }}
                            transition={{ delay: i * 0.03, duration: 0.2 }}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer hover:bg-[var(--pb-border)]/30 ${
                              isClosing ? "opacity-50" : ""
                            }`}
                            role="listitem"
                            onClick={() => {
                              setSelectedSession(session);
                              setExpanded(false);
                            }}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedSession(session);
                                setExpanded(false);
                              }
                            }}
                            aria-label={`Sessione ${deptLabel} — ${cfg.label}. Clicca per dettagli.`}
                          >
                            {/* Type icon */}
                            <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                              session.type === "console"
                                ? "bg-emerald-500/15 text-emerald-400"
                                : session.type === "task-runner"
                                  ? "bg-[#A78BFA]/15 text-[#A78BFA]"
                                  : session.type === "interactive"
                                    ? "bg-sky-500/15 text-sky-400"
                                    : "bg-[#FFC832]/15 text-[#FFC832]"
                            }`}>
                              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-[var(--pb-text)] truncate">
                                  {deptLabel}
                                </span>
                                {isClosing && (
                                  <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--pb-amber)]/15 text-[var(--pb-amber)]">
                                    in chiusura
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] text-[var(--pb-text-dim)]">
                                  {cfg.label}
                                </span>
                                {session.taskId && (
                                  <>
                                    <span className="text-[var(--pb-text-dim)]" aria-hidden="true">&middot;</span>
                                    <span className="text-[10px] text-[var(--pb-text-dim)] font-mono truncate max-w-[80px]" title={session.taskId}>
                                      {session.taskId.slice(0, 8)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Duration */}
                            <span className="shrink-0 text-[10px] tabular-nums text-[var(--pb-text-dim)]">
                              {durations[session.pid] ?? formatDuration(session.startedAt)}
                            </span>

                            {/* Status dot */}
                            <motion.div
                              className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                                isClosing ? "bg-[var(--pb-amber)]" : "bg-emerald-400"
                              }`}
                              animate={
                                !isClosing
                                  ? { opacity: [1, 0.4, 1] }
                                  : { opacity: 1 }
                              }
                              transition={
                                !isClosing
                                  ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                                  : {}
                              }
                              aria-hidden="true"
                            />
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

              {/* Panel footer */}
              {data && data.sessions.length > 0 && (
                <div className="px-4 py-2 border-t border-[var(--pb-border)]">
                  <p className="text-[10px] text-[var(--pb-text-dim)] text-center">
                    Aggiornamento ogni 5 secondi &middot; Clicca una riga per dettagli
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Detail panel (slide-right overlay) */}
      <AnimatePresence>
        {selectedSession && (
          <SessionDetailPanel
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
