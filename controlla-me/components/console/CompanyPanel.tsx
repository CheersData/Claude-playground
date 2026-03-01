"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Square, RefreshCw, AlertCircle } from "lucide-react";
import { TaskModal, type TaskItem } from "@/components/ops/TaskModal";
import { TaskBoardFullscreen } from "@/components/ops/TaskBoardFullscreen";

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
  | "strategy";

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
}

// ── Constants ──

const TARGETS: { key: TargetKey; label: string; short: string }[] = [
  { key: "cme", label: "CME (CEO) — Sonnet", short: "CME" },
  { key: "ufficio-legale", label: "Ufficio Legale TL", short: "Legale" },
  { key: "data-engineering", label: "Data Engineering TL", short: "Data" },
  { key: "quality-assurance", label: "Quality Assurance TL", short: "QA" },
  { key: "architecture", label: "Architecture TL", short: "Arch" },
  { key: "finance", label: "Finance TL", short: "Finance" },
  { key: "operations", label: "Operations TL", short: "Ops" },
  { key: "security", label: "Security TL", short: "Security" },
  { key: "marketing", label: "Marketing TL", short: "Marketing" },
  { key: "strategy", label: "Strategy TL", short: "Strategy" },
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
};

// ── Component ──

export default function CompanyPanel({ open, onClose }: CompanyPanelProps) {
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
  const [childPid, setChildPid] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // debugEndRef removed — newest debug entries are at top, no auto-scroll
  const fullTextRef = useRef("");

  // No auto-scroll needed — newest messages and debug entries are always at top

  // Focus input when panel opens
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setDashLoading(true);
    try {
      const res = await fetch("/api/company/status");
      if (res.ok) setDashboard(await res.json());
    } catch {
      // Silent
    } finally {
      setDashLoading(false);
    }
  }, []);

  // Init on first open
  useEffect(() => {
    if (open && !initialized) {
      setInitialized(true);
      fetchDashboard();
      startSession("Buongiorno, qual è la situazione?", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-refresh dashboard every 30 seconds while open
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(fetchDashboard, 30_000);
    return () => clearInterval(interval);
  }, [open, fetchDashboard]);

  // ── Start a new interactive session ──
  const startSession = async (text: string, isAuto = false, overrideTarget?: TargetKey) => {
    // Kill existing session
    if (abortRef.current) abortRef.current.abort();
    if (childPid) {
      fetch("/api/console/company/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid: childPid }),
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
      const res = await fetch("/api/console/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, target: effectiveTarget }),
        signal: controller.signal,
      });

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
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Errore di comunicazione: ${errMsg}` },
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
        headers: { "Content-Type": "application/json" },
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
  const sendMessage = (text: string, isAuto = false) => {
    if (!text.trim()) return;

    if (sessionId && !isAuto) {
      // Follow-up to existing session
      sendFollowUp(text);
    } else {
      // New session
      startSession(text, isAuto);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleStop = async () => {
    if (abortRef.current) abortRef.current.abort();
    if (childPid) {
      try {
        await fetch("/api/console/company/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pid: childPid }),
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

  if (!open) return null;

  // In-progress tasks — dedicated array from API (all tasks, not just recent)
  const inProgressTasks = dashboard?.board?.inProgress ?? [];
  // Review tasks — all tasks awaiting boss approval
  const reviewTasks = dashboard?.board?.reviewPending ?? [];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-[#E5E5E5]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-[#1A1A1A]">Company</span>
          <span className="text-[10px] text-[#9B9B9B]">
            {TARGETS.find((t) => t.key === target)?.label}
          </span>
          {responding && (
            <span className="text-[10px] text-amber-500 animate-pulse">
              Claude Code in esecuzione...
            </span>
          )}
          {sessionId && !responding && (
            <span className="text-[10px] text-emerald-500">
              Sessione attiva
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: Dashboard sidebar ── */}
        <aside className="w-64 border-r border-[#E5E5E5] overflow-y-auto p-4 space-y-5 hidden md:block">
          {/* DA APPROVARE — review tasks awaiting boss approval */}
          {reviewTasks.length > 0 && (
            <DashboardSection title={`Da Approvare (${reviewTasks.length})`}>
              <div className="space-y-1.5">
                {reviewTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                    className="cursor-pointer w-full flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left"
                  >
                    <AlertCircle className="w-[10px] h-[10px] text-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[#1A1A1A] truncate font-medium">{task.title}</p>
                      <p className="text-[#9B9B9B] text-[10px]">
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
                    className="cursor-pointer w-full flex items-start gap-2 text-[11px] px-2 py-1.5 rounded-lg hover:bg-[#F5F5F5] transition-colors text-left"
                  >
                    <span className="w-[6px] h-[6px] rounded-full bg-blue-400 animate-pulse mt-1 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[#1A1A1A] truncate font-medium">{task.title}</p>
                      <p className="text-[#9B9B9B] text-[10px]">
                        {DEPT_NAMES[task.department] ?? task.department}
                        {task.assignedTo && <> · <span className="text-blue-400">{task.assignedTo}</span></>}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[10px] text-[#C0C0C0]">Nessun task attivo</span>
            )}
          </DashboardSection>

          <DashboardSection title="Task Board" loading={dashLoading}>
            {dashboard?.board ? (
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                <StatusBadge label="Open" count={dashboard.board.byStatus.open ?? 0} color="#1A1A1A" onClick={() => setExpandedStatus("open")} />
                <StatusBadge label="In Prog" count={dashboard.board.byStatus.in_progress ?? 0} color="#3B82F6" onClick={() => setExpandedStatus("in_progress")} />
                <StatusBadge label="Review" count={dashboard.board.byStatus.review ?? 0} color="#F59E0B" onClick={() => setExpandedStatus("review")} />
                <StatusBadge label="Done" count={dashboard.board.byStatus.done ?? 0} color="#22C55E" onClick={() => setExpandedStatus("done")} />
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
                  const dot = (
                    <span
                      className={`w-[6px] h-[6px] rounded-full shrink-0 ${
                        info.inProgress > 0
                          ? "bg-blue-400 animate-pulse"
                          : info.open > 0
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                    />
                  );
                  const counter = (
                    <span className={isActive ? "text-zinc-300" : "text-[#9B9B9B]"}>
                      {info.inProgress > 0 && (
                        <span className={`${isActive ? "text-blue-300" : "text-blue-400"} mr-1`}>{info.inProgress}&#9654;</span>
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
                        className={`w-full flex items-center justify-between text-[11px] px-1.5 py-1 rounded transition-colors cursor-pointer disabled:opacity-50 ${
                          isActive
                            ? "bg-[#1A1A1A] text-white"
                            : "hover:bg-[#F5F5F5]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {dot}
                          <span className={isActive ? "text-white font-medium" : "text-[#6B6B6B]"}>
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
                        <span className="text-[#9B9B9B]">{DEPT_NAMES[dept] ?? dept}</span>
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
                  <span className="text-[#6B6B6B]">Totale</span>
                  <span className="font-medium text-[#1A1A1A]">${dashboard.costs.total.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B6B6B]">Chiamate</span>
                  <span className="text-[#1A1A1A]">{dashboard.costs.calls}</span>
                </div>
                {Object.entries(dashboard.costs.byProvider).map(([prov, info]) => (
                  <div key={prov} className="flex justify-between text-[#9B9B9B]">
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
                  <span className="text-[#6B6B6B]">Fonti</span>
                  <span className="text-[#1A1A1A]">{dashboard.pipeline.length}</span>
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
                      <span className="text-[#6B6B6B]">Ultimo sync</span>
                      <span className="text-[#9B9B9B]">{timeAgo(last.lastSync.completedAt)}</span>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
              <NoData />
            )}
          </DashboardSection>

          {/* Target selector */}
          <div className="pt-2 border-t border-[#F0F0F0]">
            <span className="text-[10px] text-[#9B9B9B] uppercase tracking-wider mb-2 block">
              Parla con
            </span>
            <div className="flex flex-wrap gap-1">
              {TARGETS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => handleTargetChange(t.key)}
                  disabled={responding}
                  className={`text-[10px] px-2 py-1 rounded transition-colors disabled:opacity-50 ${
                    target === t.key
                      ? "bg-[#1A1A1A] text-white"
                      : "bg-[#F5F5F5] text-[#6B6B6B] hover:bg-[#EBEBEB]"
                  }`}
                >
                  {t.short}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={fetchDashboard}
            disabled={dashLoading}
            className="flex items-center gap-1.5 text-[10px] text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${dashLoading ? "animate-spin" : ""}`} />
            Aggiorna dati
          </button>
        </aside>

        {/* ── Center: Chat area ── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Mobile target selector */}
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-[#F0F0F0] overflow-x-auto md:hidden scrollbar-none">
            {TARGETS.map((t) => (
              <button
                key={t.key}
                onClick={() => handleTargetChange(t.key)}
                disabled={responding}
                className={`text-[11px] px-3 py-1.5 rounded-full whitespace-nowrap transition-colors touch-manipulation disabled:opacity-50 ${
                  target === t.key ? "bg-[#1A1A1A] text-white" : "bg-[#F5F5F5] text-[#6B6B6B]"
                }`}
              >
                {t.short}
              </button>
            ))}
          </div>

          {/* Input — at TOP, always visible without scrolling */}
          <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-[#E5E5E5]">
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
              className="flex-1 text-sm text-[#1A1A1A] placeholder:text-[#C0C0C0] bg-transparent outline-none min-w-0"
            />
            {responding && (
              <button
                type="button"
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors text-xs shrink-0 touch-manipulation"
              >
                <Square className="w-3 h-3 fill-current" />
                Stop
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim()}
              className="p-2 -m-1 text-[#9B9B9B] hover:text-[#1A1A1A] transition-colors disabled:opacity-30 shrink-0 touch-manipulation"
            >
              <Send className="w-5 h-5 md:w-4 md:h-4" />
            </button>
          </form>

          {/* Messages — newest first (reverse chronological) */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {/* Waiting indicator — most recent, always on top */}
              {responding && !streaming && (
                <div className="flex justify-start">
                  <div className="bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="w-[5px] h-[5px] rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] text-[#9B9B9B]">Claude Code in esecuzione...</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Streaming text — current response, on top */}
              {streaming && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed bg-[#F5F5F5] text-[#1A1A1A] border border-[#E5E5E5]">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-[5px] h-[5px] rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-[10px] font-medium text-[#6B6B6B]">
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
          <aside className="w-72 border-l border-[#E5E5E5] bg-[#FAFAFA] flex flex-col overflow-hidden hidden lg:flex">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#E5E5E5]">
              <span className="text-[10px] text-[#9B9B9B] uppercase tracking-wider">Debug</span>
              <button
                onClick={() => setShowDebug(false)}
                className="text-[#C0C0C0] hover:text-[#6B6B6B] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10px] space-y-0.5">
                {/* Waiting indicator — newest, always on top */}
                {responding && (
                  <div className="flex gap-1.5 text-amber-400 animate-pulse">
                    <span className="text-[#C0C0C0] w-10 text-right shrink-0">
                      {debugLog.length > 0
                        ? `+${((Date.now() - debugLog[0].ts) / 1000).toFixed(0)}s`
                        : "..."}
                    </span>
                    <span className="w-4 shrink-0 text-center">&#8987;</span>
                    <span>In attesa...</span>
                  </div>
                )}
                {/* Debug entries — reversed: newest first */}
                {[...debugLog].reverse().map((entry, i) => {
                  const origIdx = debugLog.length - 1 - i;
                  const elapsed = origIdx === 0 ? 0 : entry.ts - debugLog[0].ts;
                  const { color, icon } = debugStyle(entry.type);
                  return (
                    <div key={origIdx} className={`flex gap-1.5 ${color}`}>
                      <span className="text-[#C0C0C0] w-10 text-right shrink-0">
                        {elapsed > 0 ? `+${(elapsed / 1000).toFixed(1)}s` : "0.0s"}
                      </span>
                      <span className="w-4 shrink-0 text-center">{icon}</span>
                      <span className="break-all">{entry.msg}</span>
                    </div>
                  );
                })}
                {debugLog.length === 0 && !responding && (
                  <span className="text-[#C0C0C0]">Nessun evento.</span>
                )}
            </div>
          </aside>
        ) : (
          <button
            onClick={() => setShowDebug(true)}
            className="w-6 border-l border-[#E5E5E5] bg-[#FAFAFA] hover:bg-[#F0F0F0] transition-colors hidden lg:flex items-center justify-center"
            title="Mostra debug"
          >
            <span className="text-[10px] text-[#C0C0C0] [writing-mode:vertical-lr]">debug</span>
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
    case "spawn":       return { color: "text-[#9B9B9B]",   icon: ">" };
    case "pid":         return { color: "text-[#9B9B9B]",   icon: "#" };
    case "stdin":       return { color: "text-[#9B9B9B]",   icon: ">" };
    case "init":        return { color: "text-blue-400",     icon: "*" };
    case "thinking":    return { color: "text-purple-400",   icon: "~" };
    case "text":        return { color: "text-emerald-500",  icon: "+" };
    case "tool":        return { color: "text-amber-400",    icon: "$" };
    case "tool-result": return { color: "text-amber-300",    icon: "<" };
    case "result":      return { color: "text-emerald-400",  icon: "=" };
    case "rate-limit":  return { color: "text-orange-400",   icon: "!" };
    case "stderr":      return { color: "text-red-400",      icon: "x" };
    case "error":       return { color: "text-red-500",      icon: "X" };
    case "exit":        return { color: "text-blue-300",     icon: "." };
    default:            return { color: "text-[#9B9B9B]",   icon: " " };
  }
}

// ── Sub-components ──

function ChatBubble({ msg, targetLabel }: { msg: ChatMessage; targetLabel: string }) {
  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          msg.role === "user"
            ? "bg-[#1A1A1A] text-white"
            : "bg-[#F5F5F5] text-[#1A1A1A] border border-[#E5E5E5]"
        }`}
      >
        {msg.role === "assistant" && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-[#1A1A1A]" />
            <span className="text-[10px] font-medium text-[#6B6B6B]">{targetLabel}</span>
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
        <span className="text-[10px] text-[#9B9B9B] uppercase tracking-wider">{title}</span>
        {loading && <RefreshCw className="w-2.5 h-2.5 text-[#C0C0C0] animate-spin" />}
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
      className="cursor-pointer flex items-center justify-between px-2 py-1 rounded bg-[#FAFAFA] hover:bg-[#F0F0F0] transition-colors w-full text-left"
    >
      <span className="text-[#6B6B6B]">{label}</span>
      <span className="font-medium" style={{ color }}>
        {count}
      </span>
    </button>
  );
}

function NoData() {
  return <span className="text-[10px] text-[#C0C0C0]">Nessun dato</span>;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "< 1h fa";
  if (hours < 24) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}d fa`;
}
