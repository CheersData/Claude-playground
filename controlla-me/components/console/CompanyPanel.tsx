"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { X, Send, Square, RefreshCw, AlertCircle, Paperclip } from "lucide-react";
import { TaskModal, type TaskItem } from "@/components/ops/TaskModal";
import { TaskBoardFullscreen } from "@/components/ops/TaskBoardFullscreen";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";

// ── Types ──

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type TargetKey =
  | "cme"
  | "ufficio-legale"
  | "data-engineering"
  | "quality-assurance"
  | "architecture"
  | "finance"
  | "operations"
  | "security"
  | "marketing"
  | "strategy"
  | "trading";

interface DashboardData {
  board: {
    total: number;
    byStatus: Record<string, number>;
    byDepartment: Record<string, { total: number; open: number; inProgress: number; done: number }>;
    recent: TaskItem[];
    inProgress: TaskItem[];
    reviewPending: TaskItem[];
  } | null;
  costs: {
    total: number;
    calls: number;
    avgPerCall: number;
    byProvider: Record<string, { cost: number; calls: number }>;
    fallbackRate: number;
  } | null;
  pipeline: Array<{
    sourceId: string;
    lastSync: { completedAt: string | null; status: string } | null;
    totalSyncs: number;
  }>;
}

interface CompanyPanelProps {
  open: boolean;
  onClose: () => void;
  /** When true: no top bar, always open, fills parent space */
  embedded?: boolean;
}

// ── Constants ──

const TARGETS: { key: TargetKey; label: string; short: string }[] = [
  { key: "cme", label: "CME (CEO) — Opus", short: "CME" },
  { key: "ufficio-legale", label: "Ufficio Legale TL", short: "Legale" },
  { key: "data-engineering", label: "Data Engineering TL", short: "Data" },
  { key: "quality-assurance", label: "Quality Assurance TL", short: "QA" },
  { key: "architecture", label: "Architecture TL", short: "Arch" },
  { key: "finance", label: "Finance TL", short: "Finance" },
  { key: "operations", label: "Operations TL", short: "Ops" },
  { key: "security", label: "Security TL", short: "Security" },
  { key: "marketing", label: "Marketing TL", short: "Marketing" },
  { key: "strategy", label: "Strategy TL", short: "Strategy" },
  { key: "trading", label: "Trading TL", short: "Trading" },
];

const DEPT_NAMES: Record<string, string> = {
  "ufficio-legale": "Uff. Legale",
  "data-engineering": "Data Eng.",
  "quality-assurance": "QA",
  architecture: "Architecture",
  finance: "Finance",
  operations: "Operations",
  security: "Security",
  marketing: "Marketing",
  strategy: "Strategy",
  trading: "Trading",
};

// ── Pulse dot (Framer Motion) ──
// Replaces Tailwind animate-pulse with a visible ring + breathing dot.

function PulseDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <motion.span
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color }}
        animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        className="relative block rounded-full"
        style={{ width: size, height: size, backgroundColor: color }}
        animate={{ scale: [1, 1.15, 1], opacity: [1, 0.85, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  );
}

// ── Component ──

export default function CompanyPanel({ open, onClose, embedded }: CompanyPanelProps) {
  const [target, setTarget] = useState<TargetKey>("cme");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [expandedStatus, setExpandedStatus] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<Array<{ type: string; msg: string; ts: number }>>([]);
  const [showDebug, setShowDebug] = useState(true);
  const [_childPid, setChildPid] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // debugEndRef removed — newest debug entries are at top, no auto-scroll
  const fullTextRef = useRef("");

  // ── Daemon directive auto-injection state ──
  const [autoDirective, setAutoDirective] = useState<string | null>(null);
  const lastDirectiveTsRef = useRef<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("daemon-directive-ts") : null
  );

  // No auto-scroll needed — newest messages and debug entries are always at top

  // Clipboard paste handler (images)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const imageFile = new File([blob], `screenshot-${Date.now()}.png`, { type: blob.type });
            setFile(imageFile);
            setFilePreview(URL.createObjectURL(imageFile));
          }
          break;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // File input change handler
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (selected.type.startsWith("image/")) {
        setFilePreview(URL.createObjectURL(selected));
      } else {
        setFilePreview(null);
      }
    }
    e.target.value = "";
  }, []);

  // Remove attached file
  const removeFile = useCallback(() => {
    setFile(null);
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
      setFilePreview(null);
    }
  }, [filePreview]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Fetch dashboard data — silent=true for auto-refresh (no error noise)
  const fetchDashboard = useCallback(async (silent = false) => {
    setDashLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("/api/company/status", {
        headers: getConsoleAuthHeaders(),
        signal: controller.signal,
      });
      if (res.ok) {
        setDashboard(await res.json());
      } else if (!silent) {
        setDebugLog((prev) => [...prev, { type: "error", msg: `Dashboard: HTTP ${res.status}`, ts: Date.now() }]);
      }
    } catch (err) {
      if (!silent) {
        const msg = err instanceof DOMException && err.name === "AbortError" ? "Dashboard timeout — riprova" : String(err);
        setDebugLog((prev) => [...prev, { type: "error", msg: `Dashboard: ${msg}`, ts: Date.now() }]);
      }
    } finally {
      clearTimeout(timeout);
      setDashLoading(false);
    }
  }, []);

  // Init on first open — fetch dashboard only, no auto-message
  useEffect(() => {
    if ((open || embedded) && !initialized) {
      setInitialized(true);
      fetchDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-refresh dashboard every 60 seconds while open (silent — no error noise)
  useEffect(() => {
    if (!open && !embedded) return;
    const interval = setInterval(() => fetchDashboard(true), 60_000);
    return () => clearInterval(interval);
  }, [open, embedded, fetchDashboard]);

  // ── Daemon directive polling (every 30s) ──
  // Detects new cmeDirective from daemon-report.json and auto-injects into chat.
  // This closes the autoalimentante loop: daemon → chat → CME → action → board changes → daemon updates.
  useEffect(() => {
    if (!open && !embedded) return;

    const checkDirective = async () => {
      try {
        const res = await fetch("/api/company/daemon", { headers: getConsoleAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const reportTs: string | undefined = data.lastReport?.timestamp;
        const directive = data.cmeDirective;
        if (!reportTs || !directive) return;
        // Deduplicate: only inject if this is a NEW report (different timestamp)
        if (reportTs === lastDirectiveTsRef.current) return;
        lastDirectiveTsRef.current = reportTs;
        localStorage.setItem("daemon-directive-ts", reportTs);

        // Format directive as a readable chat message
        const time = new Date(reportTs).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
        const lines: string[] = [
          `[DAEMON DIRECTIVE — ${time}]`,
          `Modo: ${String(directive.mode ?? "unknown").toUpperCase()}`,
          "",
          String(directive.instructions ?? ""),
        ];
        if (Array.isArray(directive.openTasksBatch) && directive.openTasksBatch.length > 0) {
          lines.push("", "Task batch:");
          for (const t of directive.openTasksBatch) lines.push(`  • ${String(t)}`);
        }
        if (Array.isArray(directive.inProgressToAudit) && directive.inProgressToAudit.length > 0) {
          lines.push("", "In-progress da auditare:");
          for (const t of directive.inProgressToAudit) lines.push(`  • ${String(t)}`);
        }
        setAutoDirective(lines.join("\n"));
      } catch {
        /* silently ignore — will retry next 30s cycle */
      }
    };

    checkDirective(); // Check immediately on mount
    const iv = setInterval(checkDirective, 30_000);
    return () => clearInterval(iv);
  }, [open, embedded]);

  // ── Process pending daemon directive ──
  // Fires when autoDirective is set AND CME is not currently responding.
  // Starts a new CME session with the directive as the message.
  useEffect(() => {
    if (!autoDirective) return;
    if (responding) return; // Don't interrupt CME while it's working
    const msg = autoDirective;
    setAutoDirective(null);
    // Start a new session targeting CME with the daemon directive
    startSession(msg, false, "cme");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDirective, responding]);

  // ── Start a new interactive session ──
  const startSession = async (text: string, isAuto = false, overrideTarget?: TargetKey) => {
    // Kill existing session
    if (abortRef.current) abortRef.current.abort();
    if (sessionId) {
      fetch("/api/console/company/stop", {
        method: "POST",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }

    if (!isAuto) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
    }
    setInput("");
    setSessionId(null);
    setResponding(true);
    setStreaming("");
    setDebugLog([]);
    setChildPid(null);
    fullTextRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    // Use overrideTarget if provided (avoids stale closure when called from setTimeout)
    const effectiveTarget = overrideTarget ?? target;

    try {
      const headers = getConsoleJsonHeaders();
      // Check token before calling — avoid 401
      if (!sessionStorage.getItem("lexmea-token")) {
        throw new Error("Sessione scaduta — ricarica la pagina e accedi di nuovo.");
      }

      // Include conversation history so CME has full context even on new subprocess
      const res = await fetch("/api/console/company", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          target: effectiveTarget,
          history: messages.slice(-20), // Last 20 messages to avoid token overflow
        }),
        signal: controller.signal,
      });

      if (res.status === 401) {
        throw new Error("Sessione scaduta — ricarica la pagina e accedi di nuovo.");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");

      const decoder = new TextDecoder();
      let buffer = "";

      // This loop runs for the ENTIRE session (multiple turns)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let eventType = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6));

              switch (eventType) {
                case "session":
                  if (data.sessionId) setSessionId(data.sessionId);
                  break;

                case "chunk":
                  if (data.text) {
                    fullTextRef.current += data.text;
                    setStreaming(fullTextRef.current);
                    // Re-set responding if Claude started a new automatic turn (tool calls)
                    setResponding(true);
                  }
                  break;

                case "turn-end": {
                  // Finalize current turn — move streaming to messages
                  const turnText = fullTextRef.current.trim();
                  if (turnText) {
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: turnText },
                    ]);
                    setDebugLog((prev) => [...prev, {
                      type: "turn-end",
                      msg: `Turno completato: ${turnText.length} chars | Sessione resta aperta per follow-up`,
                      ts: Date.now(),
                    }]);
                  } else if (data.result) {
                    // Fallback: use result text if no chunks were received
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: data.result },
                    ]);
                    setDebugLog((prev) => [...prev, {
                      type: "turn-end",
                      msg: `Turno completato (fallback result): ${String(data.result).length} chars`,
                      ts: Date.now(),
                    }]);
                  }
                  fullTextRef.current = "";
                  setStreaming("");
                  setResponding(false);
                  break;
                }

                case "debug":
                  setDebugLog((prev) => [...prev, { type: data.type, msg: data.msg, ts: data.ts }]);
                  if (data.type === "pid" && data.msg) {
                    const pidMatch = data.msg.match(/PID:\s*(\d+)/);
                    if (pidMatch) setChildPid(Number(pidMatch[1]));
                  }
                  // Re-activate responding indicator when Claude is working (tool calls, thinking)
                  if (data.type === "thinking" || data.type === "tool" || data.type === "init") {
                    setResponding(true);
                  }
                  break;

                case "error":
                  if (data.error) {
                    fullTextRef.current += `\n[Errore: ${data.error}]`;
                    setStreaming(fullTextRef.current);
                    setDebugLog((prev) => [...prev, { type: "error", msg: data.error, ts: Date.now() }]);
                  }
                  break;

                case "done":
                  // Session ended (child process exited)
                  if (fullTextRef.current.trim()) {
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: fullTextRef.current.trim() },
                    ]);
                  }
                  fullTextRef.current = "";
                  setStreaming("");
                  setResponding(false);
                  setSessionId(null);
                  break;
              }
            } catch {
              // skip malformed
            }
            eventType = "";
          }
        }
      }

      // Stream ended normally
      setSessionId(null);
      setResponding(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setDebugLog((prev) => [...prev, { type: "exit", msg: "Fermato dall'utente", ts: Date.now() }]);
        if (fullTextRef.current.trim()) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: fullTextRef.current.trim() + "\n\n[Interrotto]" },
          ]);
        }
        fullTextRef.current = "";
        setStreaming("");
        setResponding(false);
        setSessionId(null);
        setChildPid(null);
        return;
      }
      const errMsg = err instanceof Error ? err.message : "Errore";
      console.error("[CompanyPanel] startSession error:", errMsg);
      setDebugLog((prev) => [...prev, { type: "error", msg: `Chat: ${errMsg}`, ts: Date.now() }]);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Errore di comunicazione: ${errMsg}\n\nControlla che il server sia attivo e riprova.` },
      ]);
      setSessionId(null);
      setResponding(false);
    }
  };

  // ── Send follow-up to existing session ──
  const sendFollowUp = async (text: string) => {
    if (!sessionId) {
      setDebugLog((prev) => [...prev, { type: "error", msg: "No sessionId — avvio nuova sessione", ts: Date.now() }]);
      await startSession(text, false);
      return;
    }

    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setResponding(true);
    fullTextRef.current = "";
    setStreaming("");
    setDebugLog((prev) => [...prev, { type: "stdin", msg: `Follow-up inviato: "${text.slice(0, 80)}" → sessione ${sessionId.slice(-8)}`, ts: Date.now() }]);

    try {
      const res = await fetch("/api/console/company/message", {
        method: "POST",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({ sessionId, message: text }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        setDebugLog((prev) => [...prev, { type: "error", msg: `Sessione scaduta (${res.status}): ${errText.slice(0, 100)}. Nuova sessione...`, ts: Date.now() }]);
        // isAuto=true: il messaggio utente è già stato aggiunto a riga 334, non duplicare
        await startSession(text, true);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Errore rete";
      setDebugLog((prev) => [...prev, { type: "error", msg: `Follow-up fallito: ${errMsg}. Nuova sessione...`, ts: Date.now() }]);
      // isAuto=true: il messaggio utente è già stato aggiunto a riga 334, non duplicare
      await startSession(text, true);
    }
  };

  // ── Main send handler ──
  const sendMessage = async (text: string, isAuto = false) => {
    if (!text.trim() && !file) return;

    // Build message text with file info
    let messageText = text.trim();
    if (file) {
      if (file.type.startsWith("image/")) {
        messageText = `${messageText}${messageText ? " " : ""}[📎 Immagine allegata: ${file.name}]`;
      } else {
        try {
          const fileContent = await file.text();
          messageText = `${messageText}${messageText ? "\n\n" : ""}[📎 ${file.name}]\n${fileContent}`;
        } catch {
          messageText = `${messageText}${messageText ? " " : ""}[📎 ${file.name}]`;
        }
      }
      setFile(null);
      setFilePreview(null);
    }

    if (!messageText.trim()) return;

    if (sessionId && !isAuto) {
      // Follow-up to existing session
      sendFollowUp(messageText);
    } else {
      // New session
      startSession(messageText, isAuto);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Cancel any pending daemon directive — user takes control
    if (autoDirective) setAutoDirective(null);
    sendMessage(input);
  };

  const handleStop = async () => {
    if (abortRef.current) abortRef.current.abort();
    if (sessionId) {
      try {
        await fetch("/api/console/company/stop", {
          method: "POST",
          headers: getConsoleJsonHeaders(),
          body: JSON.stringify({ sessionId }),
        });
      } catch {
        // Best effort
      }
    }
  };

  const handleTargetChange = (newTarget: TargetKey) => {
    if (newTarget === target || responding) return;
    setTarget(newTarget);
    setMessages([]);
    setStreaming("");
    setSessionId(null);
    setTimeout(() => {
      startSession(
        newTarget === "cme"
          ? "Buongiorno, qual è la situazione?"
          : "Buongiorno, come sta il dipartimento?",
        true,
        newTarget  // passa esplicitamente per evitare closure stale su `target`
      );
    }, 100);
  };

  if (!open && !embedded) return null;

  // In-progress tasks — dedicated array from API (all tasks, not just recent)
  const inProgressTasks = dashboard?.board?.inProgress ?? [];
  // Review tasks — all tasks awaiting boss approval
  const reviewTasks = dashboard?.board?.reviewPending ?? [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Top bar — hidden when embedded */}
      {!embedded && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--border-dark-subtle)]">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[var(--fg-primary)]">Company</span>
            <span className="text-[10px] text-[var(--fg-muted)]">
              {TARGETS.find((t) => t.key === target)?.label}
            </span>
            {responding && (
              <motion.span
                className="text-[10px] text-[var(--identity-gold)]"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              >
                Claude Code in esecuzione...
              </motion.span>
            )}
            {sessionId && !responding && (
              <span className="text-[10px] text-[var(--success)]">
                Sessione attiva
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Chiudi pannello Company"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Dashboard sidebar ── */}
        <aside className="w-64 border-r border-[var(--border-dark-subtle)] overflow-y-auto p-4 space-y-5 hidden md:block" role="complementary" aria-label="Dashboard aziendale">
          {/* DA APPROVARE — review tasks awaiting boss approval */}
          {reviewTasks.length > 0 && (
            <DashboardSection title={`Da Approvare (${reviewTasks.length})`}>
              <div className="space-y-1.5">
                {reviewTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                    className="cursor-pointer w-full flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-[rgba(255,200,50,0.1)] border border-[rgba(255,200,50,0.2)] hover:bg-[rgba(255,200,50,0.15)] transition-colors text-left"
                  >
                    <AlertCircle className="w-[10px] h-[10px] text-[var(--identity-gold)] mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-[var(--fg-primary)] truncate font-medium">{task.title}</p>
                      <p className="text-[var(--fg-muted)] text-[10px]">
                        {DEPT_NAMES[task.department] ?? task.department}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </DashboardSection>
          )}

          {/* In Lavorazione — shows ALL in-progress tasks */}
          <DashboardSection title={`In Lavorazione (${inProgressTasks.length})`}>
            {inProgressTasks.length > 0 ? (
              <div className="space-y-1.5">
                {inProgressTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                    className="cursor-pointer w-full flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg hover:bg-[var(--bg-overlay)] transition-colors text-left"
                  >
                    <span className="mt-1"><PulseDot color="var(--info)" size={6} /></span>
                    <div className="min-w-0">
                      <p className="text-[var(--fg-primary)] truncate font-medium">{task.title}</p>
                      <p className="text-[var(--fg-muted)] text-[10px]">
                        {DEPT_NAMES[task.department] ?? task.department}
                        {task.assignedTo && <> · <span className="text-[var(--info)]">{task.assignedTo}</span></>}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-[var(--fg-muted)]">Nessun task attivo</span>
            )}
          </DashboardSection>

          <DashboardSection title="Task Board" loading={dashLoading}>
            {dashboard?.board ? (
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <StatusBadge label="Open" count={dashboard.board.byStatus.open ?? 0} color="var(--fg-primary)" onClick={() => setExpandedStatus("open")} />
                <StatusBadge label="In Prog" count={dashboard.board.byStatus.in_progress ?? 0} color="var(--info)" onClick={() => setExpandedStatus("in_progress")} />
                <StatusBadge label="Review" count={dashboard.board.byStatus.review ?? 0} color="var(--identity-gold)" onClick={() => setExpandedStatus("review")} />
                <StatusBadge label="Done" count={dashboard.board.byStatus.done ?? 0} color="var(--success)" onClick={() => setExpandedStatus("done")} />
              </div>
            ) : (
              <NoData />
            )}
          </DashboardSection>

          <DashboardSection title="Dipartimenti">
            {dashboard?.board?.byDepartment ? (
              <div className="space-y-0.5">
                {Object.entries(dashboard.board.byDepartment).map(([dept, info]) => {
                  const isTarget = TARGETS.some((t) => t.key === dept);
                  const isActive = target === dept;
                  const dot = info.inProgress > 0 ? (
                    <PulseDot color="var(--info)" size={6} />
                  ) : (
                    <span
                      className={`w-[6px] h-[6px] rounded-full shrink-0 ${
                        info.open > 0
                          ? "bg-[var(--identity-gold)]"
                          : "bg-[var(--success)]"
                      }`}
                    />
                  );
                  const counter = (
                    <span className={isActive ? "text-[var(--fg-secondary)]" : "text-[var(--fg-muted)]"}>
                      {info.inProgress > 0 && (
                        <span className={`${isActive ? "text-[var(--info-bright)]" : "text-[var(--info)]"} mr-1`}>{info.inProgress}&#9654;</span>
                      )}
                      {info.open}o/{info.done}d
                    </span>
                  );
                  if (isTarget) {
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => handleTargetChange(dept as TargetKey)}
                        disabled={responding}
                        aria-label={`Parla con ${DEPT_NAMES[dept] ?? dept} — ${info.open} aperti, ${info.inProgress} in corso, ${info.done} completati`}
                        aria-pressed={isActive}
                        className={`w-full flex items-center justify-between text-[11px] px-1.5 py-1 rounded transition-colors cursor-pointer disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
                          isActive
                            ? "bg-[var(--bg-active)] text-[var(--fg-primary)]"
                            : "hover:bg-[var(--bg-overlay)]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {dot}
                          <span className={isActive ? "text-white font-medium" : "text-[var(--fg-secondary)]"}>
                            {DEPT_NAMES[dept] ?? dept}
                          </span>
                        </div>
                        {counter}
                      </button>
                    );
                  }
                  return (
                    <div key={dept} className="flex items-center justify-between text-[11px] px-1.5 py-1">
                      <div className="flex items-center gap-1.5">
                        {dot}
                        <span className="text-[var(--fg-muted)]">{DEPT_NAMES[dept] ?? dept}</span>
                      </div>
                      {counter}
                    </div>
                  );
                })}
              </div>
            ) : (
              <NoData />
            )}
          </DashboardSection>

          <DashboardSection title="Costi (7 giorni)">
            {dashboard?.costs ? (
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[var(--fg-secondary)]">Totale</span>
                  <span className="font-medium text-[var(--fg-primary)]">${dashboard.costs.total.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--fg-secondary)]">Chiamate</span>
                  <span className="text-[var(--fg-primary)]">{dashboard.costs.calls}</span>
                </div>
                {Object.entries(dashboard.costs.byProvider).map(([prov, info]) => (
                  <div key={prov} className="flex justify-between text-[var(--fg-muted)]">
                    <span>{prov}</span>
                    <span>${info.cost.toFixed(4)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <NoData />
            )}
          </DashboardSection>

          <DashboardSection title="Pipeline">
            {dashboard?.pipeline && dashboard.pipeline.length > 0 ? (
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[var(--fg-secondary)]">Fonti</span>
                  <span className="text-[var(--fg-primary)]">{dashboard.pipeline.length}</span>
                </div>
                {(() => {
                  const last = dashboard.pipeline
                    .filter((p) => p.lastSync?.completedAt)
                    .sort(
                      (a, b) =>
                        new Date(b.lastSync!.completedAt!).getTime() -
                        new Date(a.lastSync!.completedAt!).getTime()
                    )[0];
                  return last?.lastSync?.completedAt ? (
                    <div className="flex justify-between">
                      <span className="text-[var(--fg-secondary)]">Ultimo sync</span>
                      <span className="text-[var(--fg-muted)]">{timeAgo(last.lastSync.completedAt)}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <NoData />
            )}
          </DashboardSection>

          {/* Target selector */}
          <div className="pt-2 border-t border-[var(--border-dark-subtle)]">
            <span className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider mb-2 block">
              Parla con
            </span>
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Seleziona destinatario">
              {TARGETS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleTargetChange(t.key)}
                  disabled={responding}
                  role="radio"
                  aria-checked={target === t.key}
                  aria-label={`Parla con ${t.label}`}
                  className={`text-[10px] px-2 py-1 rounded transition-colors disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
                    target === t.key
                      ? "bg-[var(--bg-active)] text-[var(--fg-primary)]"
                      : "bg-[var(--bg-overlay)] text-[var(--fg-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => fetchDashboard(false)}
            disabled={dashLoading}
            aria-label="Aggiorna dati dashboard"
            className="flex items-center gap-1.5 text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
          >
            <RefreshCw className={`w-3 h-3 ${dashLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            Aggiorna dati
          </button>
        </aside>

        {/* ── Center: Chat area ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Mobile target selector */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[var(--border-dark-subtle)] overflow-x-auto md:hidden scrollbar-none" role="radiogroup" aria-label="Seleziona destinatario">
            {TARGETS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTargetChange(t.key)}
                disabled={responding}
                role="radio"
                aria-checked={target === t.key}
                aria-label={`Parla con ${t.label}`}
                className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-colors touch-manipulation disabled:opacity-50 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] ${
                  target === t.key ? "bg-[var(--bg-active)] text-[var(--fg-primary)]" : "bg-[var(--bg-overlay)] text-[var(--fg-secondary)]"
                }`}
              >
                {t.short}
              </button>
            ))}
          </div>

          {/* Input — at TOP, always visible without scrolling */}
          <form onSubmit={handleSubmit} className="border-b border-[var(--border-dark-subtle)]">
            {/* File preview */}
            {file && (
              <div className="flex items-center gap-2 px-4 md:px-6 pt-3 pb-1">
                {filePreview ? (
                  <Image src={filePreview} alt={file.name} width={40} height={40} unoptimized className="rounded object-cover border border-[var(--border-dark-subtle)]" />
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)]">
                    <Paperclip className="w-3 h-3 text-[var(--fg-secondary)]" aria-hidden="true" />
                    <span className="text-xs text-[var(--fg-secondary)] max-w-[200px] truncate">{file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={removeFile}
                  aria-label={`Rimuovi file allegato: ${file?.name ?? "file"}`}
                  className="p-1 rounded hover:bg-[var(--bg-overlay)] text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 md:px-6 py-3 md:py-4">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,.pdf,.docx,.txt,.json,.csv"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] transition-colors shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
                aria-label="Allega file o incolla immagine"
                title="Allega file (o incolla immagine)"
              >
                <Paperclip className="w-4 h-4" aria-hidden="true" />
              </button>
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  responding
                    ? "Scrivi per interrompere o chiedere altro..."
                    : `Scrivi a ${TARGETS.find((t) => t.key === target)?.short ?? "CME"}...`
                }
                aria-label={`Messaggio per ${TARGETS.find((t) => t.key === target)?.label ?? "CME"}`}
                className="flex-1 text-sm text-[var(--fg-primary)] placeholder:text-[var(--fg-invisible)] bg-transparent outline-none min-w-0"
              />
            {responding && (
              <button
                type="button"
                onClick={handleStop}
                aria-label="Interrompi risposta in corso"
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors text-xs shrink-0 touch-manipulation focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
              >
                <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() && !file}
              aria-label="Invia messaggio"
              className="p-2 -m-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors disabled:opacity-30 shrink-0 touch-manipulation focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            >
              <Send className="w-5 h-5 md:w-4 md:h-4" aria-hidden="true" />
            </button>
            </div>
          </form>

          {/* Messages — newest first (reverse chronological) */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" role="log" aria-label="Messaggi chat" aria-live="polite">
              {/* Waiting indicator — most recent, always on top */}
              {responding && !streaming && (
                <div className="flex justify-start" role="status" aria-label="In attesa di risposta">
                  <div className="bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <PulseDot color="var(--identity-gold)" size={5} />
                      <span className="text-[10px] text-[var(--fg-muted)]">Claude Code in esecuzione...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Streaming text — current response, on top */}
              {streaming && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-[var(--bg-overlay)] text-[var(--fg-primary)] border border-[var(--border-dark-subtle)]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <PulseDot color="var(--identity-gold)" size={5} />
                      <span className="text-[10px] font-medium text-[var(--fg-secondary)]">
                        {TARGETS.find((t) => t.key === target)?.label}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{streaming}</p>
                  </div>
                </div>
              )}

              {/* Messages — reversed: newest first */}
              {[...messages].reverse().map((msg, i) => (
                <ChatBubble
                  key={messages.length - 1 - i}
                  msg={msg}
                  targetLabel={TARGETS.find((t) => t.key === target)?.label ?? "CME"}
                />
              ))}
          </div>
        </div>

        {/* ── Right: Debug Monitor ── */}
        {showDebug ? (
          <aside className="w-72 border-l border-[var(--border-dark-subtle)] bg-[var(--bg-raised)] flex flex-col overflow-hidden hidden lg:flex" role="complementary" aria-label="Monitor debug">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-dark-subtle)]">
              <span className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider">Debug</span>
              <button
                onClick={() => setShowDebug(false)}
                aria-label="Chiudi pannello debug"
                className="text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] transition-colors focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10px] space-y-0.5">
                {/* Waiting indicator — newest, always on top */}
                {responding && (
                  <motion.div
                    className="flex gap-1.5 text-[var(--identity-gold)]"
                    animate={{ opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <span className="text-[var(--fg-muted)] w-10 text-right shrink-0">
                      {debugLog.length > 0
                        ? `+${((Date.now() - debugLog[0].ts) / 1000).toFixed(0)}s`
                        : "..."}
                    </span>
                    <span className="w-4 shrink-0 text-center">&#8987;</span>
                    <span>In attesa...</span>
                  </motion.div>
                )}
                {/* Debug entries — reversed: newest first */}
                {[...debugLog].reverse().map((entry, i) => {
                  const origIdx = debugLog.length - 1 - i;
                  const elapsed = origIdx === 0 ? 0 : entry.ts - debugLog[0].ts;
                  const { color, icon } = debugStyle(entry.type);
                  return (
                    <div key={origIdx} className={`flex gap-1.5 ${color}`}>
                      <span className="text-[var(--fg-muted)] w-10 text-right shrink-0">
                        {elapsed > 0 ? `+${(elapsed / 1000).toFixed(1)}s` : "0.0s"}
                      </span>
                      <span className="w-4 shrink-0 text-center">{icon}</span>
                      <span className="break-all">{entry.msg}</span>
                    </div>
                  );
                })}
                {debugLog.length === 0 && !responding && (
                  <span className="text-[var(--fg-muted)]">Nessun evento.</span>
                )}
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setShowDebug(true)}
            className="w-6 border-l border-[var(--border-dark-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)] transition-colors hidden lg:flex items-center justify-center focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
            aria-label="Mostra pannello debug"
            title="Mostra debug"
          >
            <span className="text-[10px] text-[var(--fg-invisible)] [writing-mode:vertical-lr]" aria-hidden="true">debug</span>
          </button>
        )}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); fetchDashboard(); }}
        />
      )}

      {/* Task board fullscreen (status-filtered) */}
      {expandedStatus && (
        <TaskBoardFullscreen
          initialStatus={expandedStatus}
          onClose={() => setExpandedStatus(null)}
        />
      )}
    </div>
  );
}

// ── Helpers ──

function debugStyle(type: string): { color: string; icon: string } {
  switch (type) {
    case "spawn":       return { color: "text-[var(--fg-muted)]",   icon: ">" };
    case "pid":         return { color: "text-[var(--fg-muted)]",   icon: "#" };
    case "stdin":       return { color: "text-[var(--fg-muted)]",   icon: ">" };
    case "init":        return { color: "text-[var(--info)]",     icon: "*" };
    case "thinking":    return { color: "text-[var(--identity-violet)]", icon: "~" };
    case "text":        return { color: "text-[var(--success)]",         icon: "+" };
    case "tool":        return { color: "text-[var(--identity-gold)]",   icon: "$" };
    case "tool-result": return { color: "text-[var(--identity-gold)]",   icon: "<" };
    case "result":      return { color: "text-[var(--success)]",         icon: "=" };
    case "rate-limit":  return { color: "text-[var(--accent)]",          icon: "!" };
    case "stderr":      return { color: "text-[var(--error)]",           icon: "x" };
    case "error":       return { color: "text-[var(--error)]",           icon: "X" };
    case "exit":        return { color: "text-[var(--info-bright)]",     icon: "." };
    default:            return { color: "text-[var(--fg-muted)]",   icon: " " };
  }
}

// ── Sub-components ──

function ChatBubble({ msg, targetLabel }: { msg: ChatMessage; targetLabel: string }) {
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          msg.role === "user"
            ? "bg-[var(--bg-active)] text-[var(--fg-primary)]"
            : "bg-[var(--bg-overlay)] text-[var(--fg-primary)] border border-[var(--border-dark-subtle)]"
        }`}
      >
        {msg.role === "assistant" && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent)]" aria-hidden="true" />
            <span className="text-[10px] font-medium text-[var(--fg-secondary)]">{targetLabel}</span>
          </div>
        )}
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  loading,
  children,
}: {
  title: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider">{title}</span>
        {loading && (
          <span role="status" aria-label={`Caricamento ${title}`}>
            <RefreshCw className="w-2.5 h-2.5 text-[var(--fg-invisible)] animate-spin" aria-hidden="true" />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatusBadge({ label, count, color, onClick }: { label: string; count: number; color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      aria-label={`${label}: ${count} task. Clicca per vedere dettagli`}
      className="cursor-pointer flex items-center justify-between px-2 py-1 rounded bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)] transition-colors w-full text-left focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
    >
      <span className="text-[var(--fg-secondary)]">{label}</span>
      <span className="font-medium" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

function NoData() {
  return <span className="text-[10px] text-[var(--fg-muted)]">Nessun dato</span>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "< 1h fa";
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}d fa`;
}
