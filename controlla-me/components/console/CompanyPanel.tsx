"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { X, Send, Square, RefreshCw, AlertCircle, Paperclip, WifiOff } from "lucide-react";
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

// ── Reconnect constants ──
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30_000;

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
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // debugEndRef removed — newest debug entries are at top, no auto-scroll
  const fullTextRef = useRef("");
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  // Track the last user message + target so we can reconnect the same request
  const lastRequestRef = useRef<{ message: string; target: TargetKey; isAuto: boolean } | null>(null);
  // Track whether a stream is actively running (not just "responding" state)
  const streamActiveRef = useRef(false);
  // Distinguish user-initiated abort from inactivity timeout abort
  const userAbortRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // ── Daemon directive auto-injection state ──
  const [autoDirective, setAutoDirective] = useState<string | null>(null);
  const lastDirectiveTsRef = useRef<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("daemon-directive-ts") : null
  );

  // Smart auto-scroll: only scroll to bottom if user is near the bottom (within 100px)
  const isNearBottomRef = useRef(true);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  const scrollToBottomIfNeeded = useCallback(() => {
    if (isNearBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Auto-scroll when messages or streaming content changes
  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [messages, streaming, responding, scrollToBottomIfNeeded]);

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

  // Track whether the page is hidden (screen locked / tab switched).
  // When hidden, blur the textarea to prevent iOS from sending spurious
  // keystrokes (e.g. "blocca") into the input field on screen lock.
  const pageHiddenRef = useRef(false);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        pageHiddenRef.current = true;
        inputRef.current?.blur();
      } else {
        // Short delay: some mobile browsers fire a brief focus + key event right
        // after screen unlock which can inject stale keyboard buffer characters.
        setTimeout(() => { pageHiddenRef.current = false; }, 300);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

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

  // ── Daemon directive: single fetch on mount (no polling) ──
  // The daemon only runs when the boss is NOT active, so continuous polling is wasteful.
  // We fetch once when the panel opens. The directive is shown as a static banner,
  // not auto-injected into the chat stream.
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
        // Deduplicate: only show if this is a NEW report (different timestamp)
        if (reportTs === lastDirectiveTsRef.current) return;
        lastDirectiveTsRef.current = reportTs;
        localStorage.setItem("daemon-directive-ts", reportTs);

        // Format directive as a readable message for the banner
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
        /* silently ignore */
      }
    };

    checkDirective(); // Single fetch on mount — no interval
  }, [open, embedded]);

  // ── Reconnect helpers ──
  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const attemptReconnect = useCallback((immediate = false) => {
    const lastReq = lastRequestRef.current;
    if (!lastReq) return;

    // If already actively streaming, no need to reconnect
    if (streamActiveRef.current) return;

    const attempt = reconnectAttemptRef.current;
    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      setReconnecting(false);
      setReconnectAttempt(attempt);
      return;
    }

    const delay = immediate
      ? 0
      : Math.min(
          INITIAL_RECONNECT_DELAY_MS * Math.pow(2, attempt),
          MAX_RECONNECT_DELAY_MS
        );

    reconnectAttemptRef.current = attempt + 1;
    setReconnectAttempt(attempt + 1);
    setReconnecting(true);

    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      // Re-start the session but preserve existing messages (isAuto=true avoids re-adding user message)
      startSession(lastReq.message, true, lastReq.target);
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearReconnectTimer]); // startSession is intentionally omitted — it's stable via hoisting

  // ── Visibility change + online: reconnect on mobile screen unlock ──
  // Track pending visibility/online timeouts so we can clean them up on unmount
  const visibilityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleReconnectTrigger = (reason: string) => {
      // Only reconnect if we had an active stream that died AND no data was received
      if (!lastRequestRef.current) return;
      // If currently actively streaming, no need to reconnect
      if (streamActiveRef.current) return;

      console.log(`[CompanyPanel] ${reason} — attempting reconnect`);

      // Cancel any in-flight backoff timer (it may have been ticking while screen was off)
      clearReconnectTimer();
      // Reset backoff counter — screen wake / network restore is a fresh start
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      attemptReconnect(true); // immediate
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        // Screen locked / tab hidden — cancel any pending visibility reconnect timeout
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current);
          visibilityTimeoutRef.current = null;
        }
        return;
      }
      // On mobile screen unlock, wait for network to stabilize before attempting reconnect.
      // Use a longer delay (1.5s) because mobile radios can take time to re-associate.
      // Cancel any previous pending timeout first (prevents double-fire if visibility toggles fast).
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
      }
      visibilityTimeoutRef.current = setTimeout(() => {
        visibilityTimeoutRef.current = null;
        // Double-check we're still visible (user might have locked screen again)
        if (document.visibilityState !== "visible") return;
        // Check if we're online before attempting reconnect
        if (!navigator.onLine) {
          console.log("[CompanyPanel] Screen unlocked but offline — waiting for online event");
          return;
        }
        handleReconnectTrigger("visibilitychange (screen unlock)");
      }, 1500);
    };

    const handleOnline = () => {
      // Cancel previous pending online timeout to prevent double-fire
      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
      }
      // Delay slightly to let the connection stabilize
      onlineTimeoutRef.current = setTimeout(() => {
        onlineTimeoutRef.current = null;
        // Only reconnect if tab is visible (avoid reconnecting while screen is locked)
        if (document.visibilityState !== "visible") return;
        handleReconnectTrigger("online event (network restored)");
      }, 500);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleOnline);
      // Clean up pending timeouts to prevent reconnect on unmounted component
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
        visibilityTimeoutRef.current = null;
      }
      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
        onlineTimeoutRef.current = null;
      }
    };
  }, [attemptReconnect, clearReconnectTimer]);

  // ── Pause reconnect attempts while tab is hidden (don't waste attempts when there's no network) ──
  useEffect(() => {
    const handleHidden = () => {
      if (document.visibilityState === "hidden" && reconnectTimerRef.current) {
        // Tab went hidden — cancel the pending reconnect timer.
        // Attempts will resume when the tab becomes visible again.
        clearReconnectTimer();
      }
    };
    document.addEventListener("visibilitychange", handleHidden);
    return () => document.removeEventListener("visibilitychange", handleHidden);
  }, [clearReconnectTimer]);

  // Cleanup reconnect timer on unmount
  useEffect(() => {
    return () => {
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  // ── Start a new interactive session ──
  const startSession = async (text: string, isAuto = false, overrideTarget?: TargetKey) => {
    // Kill existing session
    userAbortRef.current = true; // Mark as intentional abort (not inactivity)
    if (abortRef.current) abortRef.current.abort();
    userAbortRef.current = false; // Reset for the new session
    if (sessionId) {
      fetch("/api/console/company/stop", {
        method: "POST",
        headers: getConsoleJsonHeaders(),
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }

    // Detect if this is a reconnection attempt (isAuto + reconnecting state)
    const isReconnect = isAuto && !!lastRequestRef.current && reconnectAttemptRef.current > 0;

    if (!isAuto) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
    }
    setInput("");
    setSessionId(null);
    setResponding(true);
    setStreaming("");
    // Preserve debug log on reconnect so the user can see the reconnect history
    if (!isReconnect) {
      setDebugLog([]);
    } else {
      setDebugLog((prev) => [...prev, { type: "reconnect", msg: `Riconnessione tentativo #${reconnectAttemptRef.current}...`, ts: Date.now() }]);
    }
    setChildPid(null);
    fullTextRef.current = "";
    streamActiveRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    // Use overrideTarget if provided (avoids stale closure when called from setTimeout)
    const effectiveTarget = overrideTarget ?? target;

    // Track the request for potential reconnection
    lastRequestRef.current = { message: text, target: effectiveTarget, isAuto };

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

      // Connection succeeded — reset reconnect state
      reconnectAttemptRef.current = 0;
      setReconnectAttempt(0);
      setReconnecting(false);
      clearReconnectTimer();

      const decoder = new TextDecoder();
      let buffer = "";

      // Inactivity timeout: if no data arrives for 45s (3x server keepalive of 15s),
      // the connection is dead. Abort and let the reconnect logic handle it.
      // Mark streamActiveRef as false BEFORE aborting so the reconnect handler
      // sees the correct state immediately (avoids race condition).
      let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
      const INACTIVITY_TIMEOUT_MS = 45_000;
      const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          console.log("[CompanyPanel] Inactivity timeout — aborting stream");
          streamActiveRef.current = false;
          controller.abort();
        }, INACTIVITY_TIMEOUT_MS);
      };
      resetInactivityTimer();

      // This loop runs for the ENTIRE session (multiple turns)
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (inactivityTimer) clearTimeout(inactivityTimer);
          break;
        }
        resetInactivityTimer();

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
                  streamActiveRef.current = false;
                  lastRequestRef.current = null;
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
      streamActiveRef.current = false;
      lastRequestRef.current = null;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        const wasUserAbort = userAbortRef.current;
        userAbortRef.current = false;

        if (wasUserAbort) {
          // User clicked stop — finalize and don't reconnect
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
          streamActiveRef.current = false;
          lastRequestRef.current = null;
          return;
        }

        // Inactivity timeout abort — treat as network error, fall through to reconnect logic
        console.log("[CompanyPanel] Inactivity timeout — treating as network error");
      }
      const errMsg = err instanceof Error ? err.message : "Errore";
      console.error("[CompanyPanel] startSession error:", errMsg);

      // Auth errors are not retryable
      const isAuthError = errMsg.includes("Sessione scaduta") || errMsg.includes("401");
      if (isAuthError) {
        setDebugLog((prev) => [...prev, { type: "error", msg: `Chat: ${errMsg}`, ts: Date.now() }]);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Errore di comunicazione: ${errMsg}\n\nControlla che il server sia attivo e riprova.` },
        ]);
        setSessionId(null);
        setResponding(false);
        streamActiveRef.current = false;
        lastRequestRef.current = null;
        return;
      }

      // Network/stream error — handle based on whether we have partial content
      const partialContent = fullTextRef.current.trim();
      setStreaming("");
      setResponding(false);
      setSessionId(null);
      streamActiveRef.current = false;

      if (partialContent) {
        // We received partial response before disconnect.
        // The server subprocess may still be running or may have finished.
        // Save what we got and show a gentle notice — don't try to re-send.
        setDebugLog((prev) => [...prev, { type: "error", msg: `Connessione persa dopo ${partialContent.length} chars ricevuti. Risposta parziale salvata.`, ts: Date.now() }]);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: partialContent + "\n\n[Connessione interrotta — risposta parziale]" },
        ]);
        fullTextRef.current = "";
        lastRequestRef.current = null; // Don't reconnect — we have partial data
      } else {
        // No data received at all — transient network error before any response.
        // Safe to retry the request with backoff.
        setDebugLog((prev) => [...prev, { type: "error", msg: `Connessione persa: ${errMsg} — tentativo riconnessione...`, ts: Date.now() }]);
        fullTextRef.current = "";

        // If the tab is hidden (screen locked), don't start the backoff timer.
        // The visibilitychange handler will trigger reconnection when the user returns.
        if (document.visibilityState === "visible") {
          attemptReconnect();
        }
        // If hidden: lastRequestRef.current is still set, so visibilitychange/online will pick it up
      }
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
    // Stop any pending reconnect
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    setReconnecting(false);
    streamActiveRef.current = false;
    lastRequestRef.current = null;

    userAbortRef.current = true;
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
    // Clear reconnect state on target switch
    clearReconnectTimer();
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    setReconnecting(false);
    lastRequestRef.current = null;

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

          {/* Messages — chronological order, scrollable */}
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
            role="log"
            aria-label="Messaggi chat"
            aria-live="polite"
          >
              {/* Daemon directive banner — shown once, dismissible */}
              {autoDirective && (
                <div className="mb-3 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-lg px-4 py-3 relative">
                  <button
                    onClick={() => setAutoDirective(null)}
                    className="absolute top-2 right-2 text-[var(--fg-invisible)] hover:text-[var(--fg-primary)] transition-colors"
                    title="Chiudi direttiva"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <p className="text-[10px] font-semibold text-[var(--accent)] uppercase tracking-wider mb-1">Direttiva Daemon</p>
                  <pre className="text-xs text-[var(--fg-secondary)] whitespace-pre-wrap font-mono leading-relaxed">{autoDirective}</pre>
                </div>
              )}

              {/* Messages — chronological order (oldest first) */}
              {messages.map((msg, i) => (
                <ChatBubble
                  key={i}
                  msg={msg}
                  targetLabel={TARGETS.find((t) => t.key === target)?.label ?? "CME"}
                />
              ))}

              {/* Streaming text — current response, at bottom */}
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

              {/* Waiting indicator — at bottom after all messages */}
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

              {/* Reconnecting indicator */}
              {reconnecting && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-center"
                  role="status"
                  aria-label="Riconnessione in corso"
                >
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--bg-overlay)] border border-[var(--border-dark-subtle)]">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    >
                      <WifiOff className="w-3.5 h-3.5 text-[var(--identity-gold)]" aria-hidden="true" />
                    </motion.div>
                    <span className="text-xs text-[var(--fg-secondary)]">
                      Riconnessione in corso... ({reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS})
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Max reconnect attempts exhausted */}
              {!reconnecting && reconnectAttempt >= MAX_RECONNECT_ATTEMPTS && lastRequestRef.current && (
                <div className="flex justify-center">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.2)]">
                    <WifiOff className="w-3.5 h-3.5 text-[var(--error)]" aria-hidden="true" />
                    <span className="text-xs text-[var(--error)]">
                      Connessione persa.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        reconnectAttemptRef.current = 0;
                        setReconnectAttempt(0);
                        attemptReconnect(true); // immediate on manual retry
                      }}
                      className="text-xs text-[var(--accent)] hover:underline ml-1 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)]"
                    >
                      Riprova
                    </button>
                  </div>
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={messagesEndRef} />
          </div>

          {/* Input — sticky at BOTTOM, WhatsApp-style */}
          <div className="sticky bottom-0 border-t border-[var(--border-dark-subtle)] bg-[var(--bg-surface,#0a0a0a)] pb-[env(safe-area-inset-bottom)]">
            <form onSubmit={handleSubmit}>
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
              <div className="flex items-end gap-2 px-4 md:px-6 py-3 md:py-4">
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
                  className="p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg-secondary)] transition-colors shrink-0 focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] mb-0.5"
                  aria-label="Allega file o incolla immagine"
                  title="Allega file (o incolla immagine)"
                >
                  <Paperclip className="w-4 h-4" aria-hidden="true" />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  value={input}
                  onChange={(e) => {
                    // Ignore input while page is hidden (prevents OS-injected strings like "blocca" on iOS)
                    if (pageHiddenRef.current) return;
                    setInput(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (pageHiddenRef.current) { e.preventDefault(); return; }
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (input.trim() || file) {
                        handleSubmit(e as unknown as React.FormEvent);
                      }
                    }
                  }}
                  onFocus={() => {
                    // iOS Safari keyboard handling: scroll into view after keyboard appears
                    setTimeout(() => {
                      inputRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }, 300);
                  }}
                  placeholder={
                    responding
                      ? "Scrivi per interrompere o chiedere altro..."
                      : `Scrivi a ${TARGETS.find((t) => t.key === target)?.short ?? "CME"}...`
                  }
                  aria-label={`Messaggio per ${TARGETS.find((t) => t.key === target)?.label ?? "CME"}`}
                  className="flex-1 text-base text-[var(--fg-primary)] placeholder:text-[var(--fg-invisible)] bg-transparent outline-none min-w-0 min-h-[44px] max-h-[50vh] resize-none leading-relaxed py-2"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              {responding && (
                <button
                  type="button"
                  onClick={handleStop}
                  aria-label="Interrompi risposta in corso"
                  className="flex items-center gap-1.5 px-3 py-2 rounded bg-[var(--error)]/10 text-[var(--error)] hover:bg-[var(--error)]/20 transition-colors text-xs shrink-0 touch-manipulation focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] mb-0.5"
                >
                  <Square className="w-3 h-3 fill-current" aria-hidden="true" />
                  Stop
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() && !file}
                aria-label="Invia messaggio"
                className="p-2 -m-1 text-[var(--fg-muted)] hover:text-[var(--fg-primary)] transition-colors disabled:opacity-30 shrink-0 touch-manipulation focus:outline-2 focus:outline-offset-2 focus:outline-[var(--accent)] mb-0.5"
              >
                <Send className="w-5 h-5 md:w-4 md:h-4" aria-hidden="true" />
              </button>
              </div>
            </form>
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
