"use client";

import { useEffect, useState } from "react";
import {
  X, User, Calendar, Tag, FileText, Loader2,
  CheckCheck, Play, AlertTriangle, RotateCcw,
  ThumbsUp, ThumbsDown, Building2, Terminal,
} from "lucide-react";

export interface TaskItem {
  id: string;
  title: string;
  department: string;
  status: string;
  priority: string;
  createdBy: string;
  assignedTo: string | null;
  createdAt: string;
  description?: string | null;
  resultSummary?: string | null;
  resultData?: Record<string, unknown> | null;
  labels?: string[] | null;
}

interface TaskModalProps {
  task: TaskItem;
  onClose: () => void;
  onUpdate?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  done: "bg-green-500/20 text-green-400 border-green-500/30",
  blocked: "bg-red-500/20 text-red-400 border-red-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-zinc-400",
};

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Ufficio Legale",
  "data-engineering": "Data Engineering",
  "quality-assurance": "Quality Assurance",
  architecture: "Architecture",
  finance: "Finance",
  operations: "Operations",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
};

const DEPT_ICONS: Record<string, string> = {
  "ufficio-legale": "⚖️",
  "data-engineering": "🔌",
  "quality-assurance": "🧪",
  architecture: "🏛️",
  finance: "💰",
  operations: "📡",
  security: "🛡️",
  strategy: "🎯",
  marketing: "📣",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Parse "Beneficio atteso:" line from description */
function parseBenefit(desc: string | null | undefined): { body: string; benefit: string | null } {
  if (!desc) return { body: "", benefit: null };
  const lines = desc.split("\n");
  const benefitIdx = lines.findIndex((l) => l.toLowerCase().startsWith("beneficio atteso:"));
  if (benefitIdx === -1) return { body: desc, benefit: null };
  const benefit = lines[benefitIdx].replace(/^beneficio atteso:\s*/i, "").trim();
  const body = lines.filter((_, i) => i !== benefitIdx).join("\n").trim();
  return { body, benefit: benefit || null };
}

type ActionMode = null | "claim" | "done" | "status";

export function TaskModal({ task: initialTask, onClose, onUpdate }: TaskModalProps) {
  // Auto-fetch full task data to ensure description/labels are loaded
  const [task, setTask] = useState<TaskItem>(initialTask);
  const [fetchingFull, setFetchingFull] = useState(false);

  useEffect(() => {
    setFetchingFull(true);
    fetch(`/api/company/tasks/${initialTask.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.task) setTask(json.task as TaskItem);
      })
      .catch(() => {/* keep initialTask */})
      .finally(() => setFetchingFull(false));
  }, [initialTask.id]);

  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [agentName, setAgentName] = useState(task.assignedTo ?? "");
  const [resultText, setResultText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDone = task.status === "done";
  const isReview = task.status === "review";

  // Architect review state (stored result from resultData, not live API)
  const storedReview = task.resultData?.architectReview as Record<string, string> | undefined;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (actionMode) setActionMode(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, actionMode]);

  async function patchTask(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/company/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onUpdate?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }

  function handleClaim() {
    if (!agentName.trim()) return;
    patchTask({ claim: true, agent: agentName.trim() });
  }
  function handleDone() {
    patchTask({ status: "done", resultSummary: resultText.trim() || null });
  }
  function handleStatusChange(newStatus: string) {
    patchTask({ status: newStatus });
  }
  function handleApprove() {
    const currentLabels: string[] = (task.labels ?? []).filter((l: string) => l !== "needs-approval");
    patchTask({ status: "open", labels: [...currentLabels, "approved"] });
  }
  function handleReject() {
    const currentLabels: string[] = (task.labels ?? []).filter((l: string) => l !== "needs-approval");
    patchTask({ status: "done", resultSummary: "Rifiutato in fase di approvazione.", labels: [...currentLabels, "rejected"] });
  }

  const { body: descBody, benefit } = parseBenefit(task.description);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (!actionMode && e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => { if (!actionMode) onClose(); }}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-base leading-none">{DEPT_ICONS[task.department] ?? "📋"}</span>
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                {DEPT_LABELS[task.department] ?? task.department}
              </span>
              {fetchingFull && <Loader2 className="w-3 h-3 text-zinc-600 animate-spin" />}
            </div>
            <h2 className="text-base font-semibold text-white leading-snug">{task.title}</h2>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Status + Priority row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[task.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
              {task.status.replace("_", " ")}
            </span>
            <span className={`text-xs font-semibold ${PRIORITY_COLORS[task.priority] ?? "text-zinc-400"}`}>
              ● {task.priority.toUpperCase()}
            </span>
            {task.labels && task.labels.length > 0 && task.labels.map((l) => (
              <span key={l} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                {l}
              </span>
            ))}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="text-xs text-zinc-400">
                <span className="text-zinc-600">Dipartimento</span>
                <span className="block text-zinc-300 font-medium">{DEPT_LABELS[task.department] ?? task.department}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="text-xs text-zinc-400">
                <span className="text-zinc-600">In carico a</span>
                <span className="block">
                  {task.assignedTo
                    ? <span className="text-zinc-200 font-medium">{task.assignedTo}</span>
                    : <span className="text-zinc-600 italic">non assegnato</span>
                  }
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="text-xs text-zinc-600">Creato da <span className="text-zinc-500">{task.createdBy}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-zinc-600 flex-shrink-0" />
              <span className="text-xs text-zinc-600">{formatDate(task.createdAt)}</span>
            </div>
          </div>

          {/* Description */}
          {descBody && (
            <div className="rounded-xl bg-zinc-800/50 border border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wide">Attività</span>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{descBody}</p>
            </div>
          )}

          {/* Expected benefit */}
          {benefit && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                <span className="text-[11px] text-blue-400/80 font-semibold uppercase tracking-wide">Beneficio atteso</span>
              </div>
              <p className="text-sm text-blue-200/80 leading-relaxed">{benefit}</p>
            </div>
          )}

          {/* Stored architect review (generated via CLI) */}
          {storedReview && (
            <div className="rounded-xl bg-zinc-800/60 border border-zinc-700 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">Parere Architetto</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  storedReview.recommendation === "approva" ? "bg-green-500/20 text-green-400" :
                  storedReview.recommendation === "rifiuta" ? "bg-red-500/20 text-red-400" :
                  "bg-yellow-500/20 text-yellow-400"
                }`}>{storedReview.recommendation?.toUpperCase()}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {storedReview.feasibility && (
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">
                    Fattibilità: <strong>{storedReview.feasibility}</strong>
                  </span>
                )}
                {storedReview.effort && (
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-300">
                    Effort: <strong>{storedReview.effort}</strong>
                  </span>
                )}
              </div>
              {storedReview.notes && <p className="text-xs text-zinc-400 leading-relaxed">{storedReview.notes}</p>}
            </div>
          )}

          {/* CLI hint for architect review (review tasks without stored review) */}
          {isReview && !storedReview && !actionMode && (
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-700 px-3 py-2.5 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
              <span className="text-[11px] text-zinc-500 font-mono">
                npx tsx scripts/architect-review.ts {task.id.slice(0, 8)}
              </span>
            </div>
          )}

          {/* Result summary */}
          {task.resultSummary && (
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                <span className="text-[11px] text-green-500/80 font-semibold uppercase tracking-wide">Risultato</span>
              </div>
              <p className="text-sm text-green-300/90 leading-relaxed whitespace-pre-wrap">{task.resultSummary}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* ── APPROVAL PANEL ── */}
          {isReview && !actionMode && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                <span className="text-xs text-amber-400 font-semibold uppercase tracking-wide">
                  In attesa di approvazione
                </span>
              </div>
              <div className="px-4 py-3 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleApprove(); }}
                  disabled={loading}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-700/80 hover:bg-green-700 disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                  Approva → open
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReject(); }}
                  disabled={loading}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-900/50 hover:bg-red-900/80 disabled:opacity-50 rounded-lg text-xs text-red-300 font-medium transition-colors"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  Rifiuta
                </button>
              </div>
            </div>
          )}

          {/* ACTION FORMS */}

          {actionMode === "claim" && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 px-4 py-4 space-y-3">
              <p className="text-xs text-blue-400 font-semibold uppercase tracking-wide">Claim task</p>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Nome agente (es. architect, test-runner...)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleClaim()}
              />
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleClaim(); }}
                  disabled={loading || !agentName.trim()}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Claim
                </button>
                <button onClick={() => setActionMode(null)} className="cursor-pointer px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-400 transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          )}

          {actionMode === "done" && (
            <div className="rounded-xl bg-green-500/5 border border-green-500/20 px-4 py-4 space-y-3">
              <p className="text-xs text-green-400 font-semibold uppercase tracking-wide">Mark as Done</p>
              <textarea
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="Riepilogo risultato (opzionale)..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDone(); }}
                  disabled={loading}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  Conferma Done
                </button>
                <button onClick={() => setActionMode(null)} className="cursor-pointer px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-400 transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          )}

          {actionMode === "status" && (
            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 px-4 py-4 space-y-3">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wide">Cambia stato</p>
              <div className="flex flex-wrap gap-2">
                {(["open", "in_progress", "review", "blocked"] as const)
                  .filter((s) => s !== task.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(s); }}
                      disabled={loading}
                      className={`cursor-pointer text-xs px-3 py-1.5 rounded-full font-medium border transition-colors disabled:opacity-50 ${STATUS_COLORS[s]}`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
              </div>
              <button onClick={() => setActionMode(null)} className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Annulla
              </button>
            </div>
          )}

          {/* Task ID */}
          <p className="text-[10px] text-zinc-700 font-mono pt-1">{task.id}</p>
        </div>

        {/* Footer — standard actions (not for review or done tasks) */}
        {!actionMode && !isDone && !isReview && (
          <div className="px-6 py-4 border-t border-zinc-800 flex flex-wrap gap-2 flex-shrink-0">
            {task.status === "open" && (
              <button
                onClick={(e) => { e.stopPropagation(); setActionMode("claim"); }}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-blue-600/80 hover:bg-blue-600 rounded-lg text-xs text-white font-medium transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Claim
              </button>
            )}
            {(task.status === "in_progress" || task.status === "review") && (
              <button
                onClick={(e) => { e.stopPropagation(); setActionMode("done"); }}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-green-700/80 hover:bg-green-700 rounded-lg text-xs text-white font-medium transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark Done
              </button>
            )}
            {(task.status === "in_progress" || task.status === "review" || task.status === "blocked") && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStatusChange("open"); }}
                disabled={loading}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 font-medium transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Reopen
              </button>
            )}
            {(task.status === "open" || task.status === "in_progress") && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStatusChange("blocked"); }}
                disabled={loading}
                className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-red-900/50 hover:bg-red-900/80 rounded-lg text-xs text-red-400 font-medium transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Block
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setActionMode("status"); }}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-400 font-medium transition-colors"
            >
              Cambia stato
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
