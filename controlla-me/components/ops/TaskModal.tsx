"use client";

import { useEffect, useState } from "react";
import { getConsoleAuthHeaders, getConsoleJsonHeaders } from "@/lib/utils/console-client";
import {
  X, User, Calendar, Tag, FileText, Loader2,
  CheckCheck, Play, AlertTriangle, RotateCcw,
  ThumbsUp, ThumbsDown, Building2, Terminal,
  Scale, DollarSign, Monitor, Shield, Target, Megaphone, TrendingUp, ClipboardList, FlaskConical, Plug,
  type LucideIcon,
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
  /** Numero sequenziale leggibile (migration 023) */
  seqNum?: number | null;
  /** Tag free-form (migration 023) */
  tags?: string[] | null;
  /** Beneficio atteso (migration 023) */
  expectedBenefit?: string | null;
  /** Stato valutazione beneficio (migration 023) */
  benefitStatus?: "pending" | "achieved" | "partial" | "missed" | null;
}

/** Badge colorato per tag free-form */
export function TagBadge({ tag, size = "sm" }: { tag: string; size?: "xs" | "sm" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-[var(--bg-overlay)] text-[var(--fg-secondary)] border border-[var(--border-dark)] font-mono ${
        size === "xs" ? "text-xs px-2 py-0.5" : "text-xs px-2 py-0.5"
      }`}
    >
      {tag}
    </span>
  );
}

interface TaskModalProps {
  task: TaskItem;
  onClose: () => void;
  onUpdate?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-[rgba(173,215,255,0.2)] text-[var(--info)] border-[rgba(173,215,255,0.3)]",
  in_progress: "bg-[rgba(255,200,50,0.2)] text-[var(--identity-gold)] border-[rgba(255,200,50,0.3)]",
  review: "bg-[rgba(255,107,53,0.2)] text-[var(--accent)] border-[rgba(255,107,53,0.3)]",
  done: "bg-[rgba(93,228,199,0.2)] text-[var(--success)] border-[rgba(93,228,199,0.3)]",
  blocked: "bg-[rgba(229,141,120,0.2)] text-[var(--error)] border-[rgba(229,141,120,0.3)]",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-[var(--error)]",
  high: "text-[var(--accent)]",
  medium: "text-[var(--identity-gold)]",
  low: "text-[var(--fg-secondary)]",
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
  trading: "Ufficio Trading",
};

const DEPT_ICONS: Record<string, LucideIcon> = {
  "ufficio-legale": Scale,
  "data-engineering": Plug,
  "quality-assurance": FlaskConical,
  architecture: Building2,
  finance: DollarSign,
  operations: Monitor,
  security: Shield,
  strategy: Target,
  marketing: Megaphone,
  trading: TrendingUp,
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
    fetch(`/api/company/tasks/${initialTask.id}`, { headers: getConsoleAuthHeaders() })
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
  const [benefitStatus, setBenefitStatus] = useState<string>("achieved");
  const [benefitNotes, setBenefitNotes] = useState("");
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
        headers: getConsoleJsonHeaders(),
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
    patchTask({
      status: "done",
      resultSummary: resultText.trim() || null,
      benefitStatus: task.expectedBenefit ? benefitStatus : null,
      benefitNotes: benefitNotes.trim() || null,
    });
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
        className="relative w-full max-w-xl bg-[var(--bg-raised)] border border-[var(--border-dark)] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[var(--border-dark-subtle)] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {(() => { const Icon = DEPT_ICONS[task.department] ?? ClipboardList; return <Icon className="w-4 h-4 text-[var(--fg-secondary)] flex-shrink-0" />; })()}
              <span className="text-xs font-semibold text-[var(--fg-secondary)] uppercase tracking-wide">
                {DEPT_LABELS[task.department] ?? task.department}
              </span>
              {fetchingFull && <Loader2 className="w-3 h-3 text-[var(--fg-invisible)] animate-spin" />}
            </div>
            <h2 className="text-base font-semibold text-white leading-snug">{task.title}</h2>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="flex-shrink-0 p-2 rounded-lg text-[var(--fg-invisible)] hover:text-white hover:bg-[var(--bg-overlay)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Status + Priority row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-3 py-1 rounded-full border font-medium ${STATUS_COLORS[task.status] ?? "bg-[var(--bg-overlay)] text-[var(--fg-secondary)] border-[var(--border-dark)]"}`}>
              {task.status.replace("_", " ")}
            </span>
            <span className={`text-xs font-semibold ${PRIORITY_COLORS[task.priority] ?? "text-[var(--fg-secondary)]"}`}>
              ● {task.priority.toUpperCase()}
            </span>
            {task.labels && task.labels.length > 0 && task.labels.map((l) => (
              <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] text-[var(--fg-secondary)] border border-[var(--border-dark)]">
                {l}
              </span>
            ))}
          </div>

          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0" />
              <span className="text-xs text-[var(--fg-secondary)]">
                <span className="text-[var(--fg-invisible)]">Dipartimento</span>
                <span className="block text-[var(--fg-primary)] font-medium">{DEPT_LABELS[task.department] ?? task.department}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0" />
              <span className="text-xs text-[var(--fg-secondary)]">
                <span className="text-[var(--fg-invisible)]">In carico a</span>
                <span className="block">
                  {task.assignedTo
                    ? <span className="text-[var(--fg-primary)] font-medium">{task.assignedTo}</span>
                    : <span className="text-[var(--fg-invisible)] italic">non assegnato</span>
                  }
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0" />
              <span className="text-xs text-[var(--fg-invisible)]">Creato da <span className="text-[var(--fg-invisible)]">{task.createdBy}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0" />
              <span className="text-xs text-[var(--fg-invisible)]">{formatDate(task.createdAt)}</span>
            </div>
          </div>

          {/* Description */}
          {descBody && (
            <div className="rounded-xl bg-[var(--bg-overlay)]/50 border border-[var(--border-dark-subtle)] px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-[var(--fg-invisible)]" />
                <span className="text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide">Attività</span>
              </div>
              <p className="text-sm text-[var(--fg-primary)] leading-relaxed whitespace-pre-wrap">{descBody}</p>
            </div>
          )}

          {/* Expected benefit */}
          {benefit && (
            <div className="rounded-xl bg-[rgba(173,215,255,0.05)] border border-[rgba(173,215,255,0.2)] px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--info)] inline-block" />
                <span className="text-xs text-[var(--info)]/80 font-semibold uppercase tracking-wide">Beneficio atteso</span>
              </div>
              <p className="text-sm text-[var(--fg-primary)]/80 leading-relaxed">{benefit}</p>
            </div>
          )}

          {/* Stored architect review (generated via CLI) */}
          {storedReview && (
            <div className="rounded-xl bg-[var(--bg-overlay)]/60 border border-[var(--border-dark)] px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--fg-secondary)] font-semibold uppercase tracking-wide">Parere Architetto</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  storedReview.recommendation === "approva" ? "bg-[rgba(93,228,199,0.2)] text-[var(--success)]" :
                  storedReview.recommendation === "rifiuta" ? "bg-[rgba(229,141,120,0.2)] text-[var(--error)]" :
                  "bg-[rgba(255,200,50,0.2)] text-[var(--identity-gold)]"
                }`}>{storedReview.recommendation?.toUpperCase()}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {storedReview.feasibility && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-overlay)] text-[var(--fg-primary)]">
                    Fattibilità: <strong>{storedReview.feasibility}</strong>
                  </span>
                )}
                {storedReview.effort && (
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-overlay)] text-[var(--fg-primary)]">
                    Effort: <strong>{storedReview.effort}</strong>
                  </span>
                )}
              </div>
              {storedReview.notes && <p className="text-xs text-[var(--fg-secondary)] leading-relaxed">{storedReview.notes}</p>}
            </div>
          )}

          {/* CLI hint for architect review (review tasks without stored review) */}
          {isReview && !storedReview && !actionMode && (
            <div className="rounded-lg bg-[var(--bg-overlay)]/40 border border-[var(--border-dark)] px-3 py-3 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0" />
              <span className="text-xs text-[var(--fg-invisible)] font-mono">
                npx tsx scripts/architect-review.ts {task.id.slice(0, 8)}
              </span>
            </div>
          )}

          {/* Result summary */}
          {task.resultSummary && (
            <div className="rounded-xl bg-[rgba(93,228,199,0.05)] border border-[rgba(93,228,199,0.2)] px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] inline-block" />
                <span className="text-xs text-[var(--success)]/80 font-semibold uppercase tracking-wide">Risultato</span>
              </div>
              <p className="text-sm text-[var(--success)]/90 leading-relaxed whitespace-pre-wrap">{task.resultSummary}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-[rgba(229,141,120,0.1)] border border-[rgba(229,141,120,0.3)] px-4 py-3 text-sm text-[var(--error)]">
              {error}
            </div>
          )}

          {/* ── APPROVAL PANEL ── */}
          {isReview && !actionMode && (
            <div className="rounded-xl border border-[rgba(255,107,53,0.3)] bg-[rgba(255,107,53,0.05)] overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,107,53,0.2)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse inline-block" />
                <span className="text-xs text-[var(--accent)] font-semibold uppercase tracking-wide">
                  In attesa di approvazione
                </span>
              </div>
              <div className="px-4 py-3 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleApprove(); }}
                  disabled={loading}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[rgba(93,228,199,0.3)] hover:bg-[rgba(93,228,199,0.4)] disabled:opacity-50 rounded-lg text-xs text-white font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                  Approva → open
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleReject(); }}
                  disabled={loading}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[rgba(229,141,120,0.2)] hover:bg-[rgba(229,141,120,0.35)] disabled:opacity-50 rounded-lg text-xs text-[var(--error)] font-medium transition-colors"
                >
                  <ThumbsDown className="w-4 h-4" />
                  Rifiuta
                </button>
              </div>
            </div>
          )}

          {/* ACTION FORMS */}

          {actionMode === "claim" && (
            <div className="rounded-xl bg-[rgba(173,215,255,0.05)] border border-[rgba(173,215,255,0.2)] px-4 py-4 space-y-3">
              <p className="text-xs text-[var(--info)] font-semibold uppercase tracking-wide">Claim task</p>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Nome agente (es. architect, test-runner...)"
                className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)]"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleClaim()}
              />
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleClaim(); }}
                  disabled={loading || !agentName.trim()}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent)]/90 disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  Claim
                </button>
                <button onClick={() => setActionMode(null)} className="cursor-pointer px-4 py-2 bg-[var(--bg-overlay)] hover:bg-[var(--bg-overlay)] rounded-lg text-sm text-[var(--fg-secondary)] transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          )}

          {actionMode === "done" && (
            <div className="rounded-xl bg-[rgba(93,228,199,0.05)] border border-[rgba(93,228,199,0.2)] px-4 py-4 space-y-3">
              <p className="text-xs text-[var(--success)] font-semibold uppercase tracking-wide">Mark as Done</p>
              <textarea
                value={resultText}
                onChange={(e) => setResultText(e.target.value)}
                placeholder="Riepilogo risultato (opzionale)..."
                rows={3}
                className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] resize-none"
                autoFocus
              />
              {task.expectedBenefit && (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--fg-invisible)] font-semibold uppercase tracking-wide">Beneficio raggiunto?</p>
                  <div className="flex gap-2">
                    {(["achieved", "partial", "missed"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setBenefitStatus(s)}
                        className={`flex-1 text-xs py-2 rounded-lg border font-medium transition-colors ${
                          benefitStatus === s
                            ? s === "achieved" ? "bg-[rgba(93,228,199,0.25)] text-[var(--success)] border-[rgba(93,228,199,0.5)]"
                            : s === "partial"  ? "bg-[rgba(255,200,50,0.25)] text-[var(--identity-gold)] border-[rgba(255,200,50,0.5)]"
                            : "bg-[rgba(229,141,120,0.25)] text-[var(--error)] border-[rgba(229,141,120,0.5)]"
                            : "bg-[var(--bg-overlay)] text-[var(--fg-invisible)] border-[var(--border-dark)] hover:border-[var(--border-dark)]"
                        }`}
                      >
                        {s === "achieved" ? "Raggiunto" : s === "partial" ? "Parziale" : "Mancato"}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={benefitNotes}
                    onChange={(e) => setBenefitNotes(e.target.value)}
                    placeholder="Note sul beneficio (opzionale)..."
                    rows={2}
                    className="w-full bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-2 text-sm text-white placeholder-[var(--fg-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] resize-none"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDone(); }}
                  disabled={loading}
                  className="cursor-pointer flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[rgba(93,228,199,0.3)] hover:bg-[rgba(93,228,199,0.4)] disabled:opacity-50 rounded-lg text-sm text-white font-medium transition-colors"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                  Conferma Done
                </button>
                <button onClick={() => setActionMode(null)} className="cursor-pointer px-4 py-2 bg-[var(--bg-overlay)] hover:bg-[var(--bg-overlay)] rounded-lg text-sm text-[var(--fg-secondary)] transition-colors">
                  Annulla
                </button>
              </div>
            </div>
          )}

          {actionMode === "status" && (
            <div className="rounded-xl bg-[var(--bg-overlay)]/50 border border-[var(--border-dark)] px-4 py-4 space-y-3">
              <p className="text-xs text-[var(--fg-secondary)] font-semibold uppercase tracking-wide">Cambia stato</p>
              <div className="flex flex-wrap gap-2">
                {(["open", "in_progress", "review", "blocked"] as const)
                  .filter((s) => s !== task.status)
                  .map((s) => (
                    <button
                      key={s}
                      onClick={(e) => { e.stopPropagation(); handleStatusChange(s); }}
                      disabled={loading}
                      className={`cursor-pointer text-xs px-3 py-2 rounded-full font-medium border transition-colors disabled:opacity-50 ${STATUS_COLORS[s]}`}
                    >
                      {s.replace("_", " ")}
                    </button>
                  ))}
              </div>
              <button onClick={() => setActionMode(null)} className="cursor-pointer text-xs text-[var(--fg-invisible)] hover:text-[var(--fg-primary)] transition-colors">
                Annulla
              </button>
            </div>
          )}

          {/* Task ID */}
          <p className="text-xs text-[var(--border-dark)] font-mono pt-1">{task.id}</p>
        </div>

        {/* Footer — standard actions (not for review or done tasks) */}
        {!actionMode && !isDone && !isReview && (
          <div className="px-6 py-4 border-t border-[var(--border-dark-subtle)] flex flex-wrap gap-2 flex-shrink-0">
            {task.status === "open" && (
              <button
                onClick={(e) => { e.stopPropagation(); setActionMode("claim"); }}
                className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-[var(--accent)]/80 hover:bg-[var(--accent)] rounded-lg text-xs text-white font-medium transition-colors"
              >
                <Play className="w-4 h-4" />
                Claim
              </button>
            )}
            {(task.status === "in_progress" || task.status === "review") && (
              <button
                onClick={(e) => { e.stopPropagation(); setActionMode("done"); }}
                className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-[rgba(93,228,199,0.3)] hover:bg-[rgba(93,228,199,0.4)] rounded-lg text-xs text-white font-medium transition-colors"
              >
                <CheckCheck className="w-4 h-4" />
                Mark Done
              </button>
            )}
            {(task.status === "in_progress" || task.status === "review" || task.status === "blocked") && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStatusChange("open"); }}
                disabled={loading}
                className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-[var(--bg-overlay)] hover:bg-[var(--bg-overlay)] rounded-lg text-xs text-[var(--fg-primary)] font-medium transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Reopen
              </button>
            )}
            {(task.status === "open" || task.status === "in_progress") && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStatusChange("blocked"); }}
                disabled={loading}
                className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-[rgba(229,141,120,0.2)] hover:bg-[rgba(229,141,120,0.35)] rounded-lg text-xs text-[var(--error)] font-medium transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="w-4 h-4" />
                Block
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setActionMode("status"); }}
              className="cursor-pointer flex items-center gap-2 px-3 py-2 bg-[var(--bg-overlay)] hover:bg-[var(--bg-overlay)] rounded-lg text-xs text-[var(--fg-secondary)] font-medium transition-colors"
            >
              Cambia stato
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
