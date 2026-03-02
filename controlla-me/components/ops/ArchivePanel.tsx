"use client";

import { useState, useEffect, useCallback } from "react";
import { Archive, Filter, X, Loader2 } from "lucide-react";
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

const DEPT_EMOJI: Record<string, string> = {
  "ufficio-legale": "⚖️",
  "data-engineering": "🔌",
  "quality-assurance": "🧪",
  architecture: "🏛️",
  finance: "💰",
  operations: "📡",
  security: "🛡️",
  strategy: "🎯",
  marketing: "📣",
  trading: "📈",
  "ux-ui": "🎨",
  protocols: "📋",
};

const BENEFIT_STATUS_COLORS: Record<string, string> = {
  achieved: "bg-green-500/15 text-green-400 border-green-500/30",
  partial:  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  missed:   "bg-red-500/15 text-red-400 border-red-500/30",
  pending:  "bg-zinc-700/60 text-zinc-400 border-zinc-600",
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
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col" style={{ minHeight: "400px" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-zinc-400" />
          <h2 className="text-base font-semibold text-white">Archivio Task</h2>
          <span className="text-xs text-zinc-500 font-normal">
            ({loading ? "…" : `${filtered.length}/${tasks.length}`} completati)
          </span>
        </div>
        <button
          onClick={onBack}
          className="cursor-pointer p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800/60 flex-shrink-0 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
        <select
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer"
        >
          <option value="">Tutti i dipartimenti</option>
          {allDepts.map((d) => (
            <option key={d} value={d}>{DEPT_LABELS[d] ?? d}</option>
          ))}
        </select>
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-zinc-500 cursor-pointer"
        >
          <option value="">Tutti i tag</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
        {(filterDept || filterTag) && (
          <button
            onClick={() => { setFilterDept(""); setFilterTag(""); }}
            className="cursor-pointer text-xs text-zinc-500 hover:text-white transition-colors"
          >
            Reset filtri
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-zinc-500 text-sm text-center py-12">
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
              className="cursor-pointer w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left bg-zinc-800/30 hover:bg-zinc-800/60 transition-colors group"
            >
              <span className="text-base leading-none mt-0.5 flex-shrink-0">
                {DEPT_EMOJI[task.department] ?? "📋"}
              </span>
              <span className="flex-1 min-w-0">
                <span className="text-sm text-zinc-300 group-hover:text-white transition-colors block truncate">
                  {task.seqNum ? <span className="text-zinc-600 mr-1">#{task.seqNum}</span> : null}
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
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${BENEFIT_STATUS_COLORS[task.benefitStatus] ?? ""}`}>
                    {BENEFIT_STATUS_LABELS[task.benefitStatus] ?? task.benefitStatus}
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">{formatDate(task.createdAt)}</span>
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
