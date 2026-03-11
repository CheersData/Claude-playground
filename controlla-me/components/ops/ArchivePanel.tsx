"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Archive, Filter, X, Loader2,
  Scale, Database, CheckCircle, Building2, DollarSign, Monitor, Shield, Target, Megaphone, TrendingUp, Palette, GitBranch, ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";
import { TaskModal, TagBadge, type TaskItem } from "@/components/ops/TaskModal";

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Ufficio Legale",
  "data-engineering": "Data Engineering",
  "quality-assurance": "QA",
  architecture: "Architecture",
  finance: "Finance",
  operations: "Operations",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
  trading: "Trading",
  "ux-ui": "UX/UI",
  protocols: "Protocols",
};

const DEPT_ICONS: Record<string, LucideIcon> = {
  "ufficio-legale": Scale,
  "data-engineering": Database,
  "quality-assurance": CheckCircle,
  architecture: Building2,
  finance: DollarSign,
  operations: Monitor,
  security: Shield,
  strategy: Target,
  marketing: Megaphone,
  trading: TrendingUp,
  "ux-ui": Palette,
  protocols: GitBranch,
};

const BENEFIT_STATUS_COLORS: Record<string, string> = {
  achieved: "bg-green-500/15 text-green-400 border-green-500/30",
  partial:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  missed:   "bg-red-500/15 text-red-400 border-red-500/30",
  pending:  "bg-[var(--bg-hover)]/60 text-[var(--fg-secondary)] border-[var(--border-dark)]",
};

const BENEFIT_STATUS_LABELS: Record<string, string> = {
  achieved: "Raggiunto",
  partial:  "Parziale",
  missed:   "Mancato",
  pending:  "In attesa",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

interface ArchivePanelProps {
  onBack: () => void;
}

export function ArchivePanel({ onBack }: ArchivePanelProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [filterDept, setFilterDept] = useState("");
  const [filterTag, setFilterTag] = useState("");

  const fetchDone = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/company/tasks?status=done&limit=200", {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setTasks((json.tasks ?? []) as TaskItem[]);
      }
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDone(); }, [fetchDone]);

  const allTags  = Array.from(new Set(tasks.flatMap((t) => t.tags ?? []))).sort();
  const allDepts = Array.from(new Set(tasks.map((t) => t.department))).sort();

  const filtered = tasks.filter((t) => {
    if (filterDept && t.department !== filterDept) return false;
    if (filterTag  && !(t.tags ?? []).includes(filterTag))  return false;
    return true;
  });

  return (
    <div className="bg-[var(--bg-raised)] rounded-xl border border-[var(--border-dark-subtle)] flex flex-col" style={{ minHeight: "400px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-dark-subtle)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-[var(--fg-secondary)]" />
          <h2 className="text-base font-semibold text-white">Archivio Task</h2>
          <span className="text-xs text-[var(--fg-invisible)] font-normal">
            ({loading ? "…" : `${filtered.length}/${tasks.length}`} completati)
          </span>
        </div>
        <button
          onClick={onBack}
          className="cursor-pointer p-2 rounded-lg text-[var(--fg-invisible)] hover:text-white hover:bg-[var(--bg-overlay)] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border-dark-subtle)]/60 flex-shrink-0 flex-wrap">
        <Filter className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0" />
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="text-xs bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-2 text-[var(--fg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] cursor-pointer"
        >
          <option value="">Tutti i dipartimenti</option>
          {allDepts.map((d) => (
            <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>
          ))}
        </select>
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="text-xs bg-[var(--bg-overlay)] border border-[var(--border-dark)] rounded-lg px-3 py-2 text-[var(--fg-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg-base)] cursor-pointer"
        >
          <option value="">Tutti i tag</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        {(filterDept || filterTag) && (
          <button
            onClick={() => { setFilterDept(""); setFilterTag(""); }}
            className="cursor-pointer text-xs text-[var(--fg-invisible)] hover:text-white transition-colors"
          >
            Reset filtri
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--fg-invisible)]" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-[var(--fg-invisible)] text-sm text-center py-12">
            {tasks.length === 0
              ? "Nessun task completato."
              : "Nessun task corrisponde ai filtri."}
          </p>
        ) : (
          filtered.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedTask(task)}
              className="cursor-pointer w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left bg-[var(--bg-overlay)]/30 hover:bg-[var(--bg-overlay)]/60 transition-colors group"
            >
              {(() => { const Icon = DEPT_ICONS[task.department] ?? ClipboardList; return <Icon className="w-4 h-4 text-[var(--fg-invisible)] flex-shrink-0 mt-0.5" />; })()}
              <span className="flex-1 min-w-0">
                <span className="text-sm text-[var(--fg-secondary)] group-hover:text-white transition-colors block truncate">
                  {task.seqNum ? <span className="text-[var(--fg-invisible)] mr-1">#{task.seqNum}</span> : null}
                  {task.title}
                </span>
                {(task.tags ?? []).length > 0 && (
                  <span className="flex flex-wrap gap-1 mt-1">
                    {(task.tags ?? []).slice(0, 4).map((tag) => (
                      <TagBadge key={tag} tag={tag} size="xs" />
                    ))}
                  </span>
                )}
              </span>
              <span className="flex-shrink-0 flex flex-col items-end gap-1 ml-2">
                {task.benefitStatus && task.benefitStatus !== "pending" && (
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${BENEFIT_STATUS_COLORS[task.benefitStatus] ?? ""}`}>
                    {BENEFIT_STATUS_LABELS[task.benefitStatus] ?? task.benefitStatus}
                  </span>
                )}
                <span className="text-xs text-[var(--fg-invisible)]">{formatDate(task.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </div>

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); fetchDone(); }}
        />
      )}
    </div>
  );
}
