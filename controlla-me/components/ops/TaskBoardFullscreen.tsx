"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  X, Search, Loader2, ChevronDown,
  Scale, Database, CheckCircle, Building2, DollarSign, Monitor, Shield, Target, Megaphone, TrendingUp, ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { TaskModal, TagBadge, type TaskItem } from "@/components/ops/TaskModal";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

interface TaskBoardFullscreenProps {
  initialStatus?: string; // "all" | "open" | "in_progress" | "done" | ...
  onClose: () => void;
}

const STATUS_TABS = [
  { key: "all", label: "Tutti" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In corso" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
  { key: "blocked", label: "Blocked" },
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  review: "bg-purple-500/20 text-purple-400",
  done: "bg-green-500/20 text-green-400",
  blocked: "bg-red-500/20 text-red-400",
};

const PRIORITY_DOTS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-[var(--ops-muted)]",
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
  "ux-ui": "UX/UI",
};

export function TaskBoardFullscreen({ initialStatus = "all", onClose }: TaskBoardFullscreenProps) {
  const [activeStatus, setActiveStatus] = useState(initialStatus);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  // Archive filters (only visible when activeStatus === "done")
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);

  const fetchTasks = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/company/tasks?${params}`, {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setTasks(json.tasks ?? []);
      }
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks(activeStatus);
    // Reset archive filters when switching tabs
    setSelectedTags([]);
    setSelectedDept("all");
    setSearch("");
  }, [activeStatus, fetchTasks]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedTask) {
        if (tagDropdownOpen) { setTagDropdownOpen(false); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, selectedTask, tagDropdownOpen]);

  // Collect all unique tags present in current task list
  const allTags = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => (t.tags ?? []).forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [tasks]);

  // Collect all departments present
  const allDepts = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => set.add(t.department));
    return Array.from(set).sort();
  }, [tasks]);

  const isArchive = activeStatus === "done";

  const filtered = tasks.filter((t) => {
    const matchSearch =
      search.trim() === "" ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.department.toLowerCase().includes(search.toLowerCase()) ||
      (t.assignedTo ?? "").toLowerCase().includes(search.toLowerCase());

    const matchDept = !isArchive || selectedDept === "all" || t.department === selectedDept;

    const matchTags =
      !isArchive ||
      selectedTags.length === 0 ||
      selectedTags.every((tag) => (t.tags ?? []).includes(tag));

    return matchSearch && matchDept && matchTags;
  });

  function toggleTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-4xl h-[90vh] bg-[var(--ops-bg)] border border-[var(--ops-border-subtle)] rounded-2xl shadow-2xl flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--ops-border-subtle)] flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Task Board</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-[var(--ops-muted)] hover:text-white hover:bg-[var(--ops-surface-2)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs + Search */}
          <div className="px-6 py-3 border-b border-[var(--ops-border-subtle)] flex items-center gap-4 flex-shrink-0 flex-wrap">
            <div className="flex gap-1 flex-wrap">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveStatus(tab.key)}
                  className={`text-xs px-3 py-2 rounded-full font-medium transition-colors ${
                    activeStatus === tab.key
                      ? "bg-[#FF6B35] text-white"
                      : "bg-[var(--ops-surface-2)] text-[var(--ops-fg-muted)] hover:text-white hover:bg-[var(--ops-hover)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="ml-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--ops-muted)]" />
              <input
                type="text"
                placeholder="Cerca task..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-[var(--ops-surface-2)] border border-[var(--ops-border)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[var(--ops-muted)] focus:outline-none focus:border-[var(--ops-border)] w-52"
              />
            </div>
          </div>

          {/* Archive filters — visible only on "done" tab */}
          {isArchive && (
            <div className="px-6 py-3 border-b border-[var(--ops-border-subtle)] flex items-center gap-3 flex-shrink-0 flex-wrap bg-[var(--ops-bg)]/60">
              <span className="text-xs text-[var(--ops-muted)] font-semibold uppercase tracking-wide flex-shrink-0">
                Archivio
              </span>

              {/* Department filter */}
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-[var(--ops-surface-2)] border border-[var(--ops-border)] rounded-lg text-xs text-[var(--ops-fg-muted)] px-2 py-2 focus:outline-none focus:border-[var(--ops-border)] cursor-pointer"
              >
                <option value="all">Tutti i dipartimenti</option>
                {allDepts.map((dept) => (
                  <option key={dept} value={dept}>
                    {DEPT_LABELS[dept] ?? dept}
                  </option>
                ))}
              </select>

              {/* Tag multi-select dropdown */}
              {allTags.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setTagDropdownOpen((o) => !o)}
                    className="flex items-center gap-2 bg-[var(--ops-surface-2)] border border-[var(--ops-border)] rounded-lg text-xs text-[var(--ops-fg-muted)] px-3 py-2 hover:bg-[var(--ops-hover)] transition-colors cursor-pointer"
                  >
                    {selectedTags.length === 0
                      ? "Tutti i tag"
                      : `${selectedTags.length} tag selezionat${selectedTags.length === 1 ? "o" : "i"}`}
                    <ChevronDown className={`w-3 h-3 transition-transform ${tagDropdownOpen ? "rotate-180" : ""}`} />
                  </button>
                  {tagDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-[var(--ops-surface)] border border-[var(--ops-border)] rounded-xl shadow-xl py-2 min-w-[180px] max-h-60 overflow-y-auto">
                      {allTags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--ops-surface-2)] ${
                              active ? "text-white" : "text-[var(--ops-fg-muted)]"
                            }`}
                          >
                            <span className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                              active ? "bg-[#FF6B35] border-[#FF6B35]" : "border-[var(--ops-border)]"
                            }`}>
                              {active && (
                                <svg viewBox="0 0 8 8" className="w-2 h-2 text-white fill-current">
                                  <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" />
                                </svg>
                              )}
                            </span>
                            <TagBadge tag={tag} size="xs" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Active filter chips */}
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1 items-center">
                  {selectedTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      className="flex items-center gap-1 cursor-pointer group"
                      title={`Rimuovi filtro "${tag}"`}
                    >
                      <TagBadge tag={tag} size="xs" />
                      <X className="w-2.5 h-2.5 text-[var(--ops-muted)] group-hover:text-[var(--ops-fg-muted)] -ml-0.5" />
                    </button>
                  ))}
                  <button
                    onClick={() => setSelectedTags([])}
                    className="text-xs text-[var(--ops-muted)] hover:text-[var(--ops-fg-muted)] transition-colors cursor-pointer underline"
                  >
                    Pulisci
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Count */}
          <div className="px-6 py-2 flex-shrink-0">
            <span className="text-xs text-[var(--ops-muted)]">
              {loading ? "Caricamento..." : `${filtered.length} task`}
            </span>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 text-[var(--ops-muted)] animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-[var(--ops-muted)] text-sm text-center py-12">Nessun task trovato.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((task) => (
                  <FullscreenTaskRow
                    key={task.id}
                    task={task}
                    onClick={() => setSelectedTask(task)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { setSelectedTask(null); fetchTasks(activeStatus); }}
        />
      )}
    </>
  );
}

function FullscreenTaskRow({ task, onClick }: { task: TaskItem; onClick: () => void }) {
  const visibleTags = (task.tags ?? []).slice(0, 3);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left bg-[var(--ops-surface)] hover:bg-[var(--ops-surface-2)] transition-colors group border border-[var(--ops-border-subtle)]/50 hover:border-[var(--ops-border)]"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${PRIORITY_DOTS[task.priority] ?? "bg-[var(--ops-muted)]"}`} />

      {(() => { const Icon = DEPT_ICONS[task.department] ?? ClipboardList; return <Icon className="w-4 h-4 text-[var(--ops-muted)] flex-shrink-0 mt-0.5" />; })()}

      <span className="flex-1 min-w-0">
        <span className="text-sm text-[var(--ops-fg)] block truncate group-hover:text-white">
          {task.title}
        </span>
        {visibleTags.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1">
            {visibleTags.map((tag) => (
              <TagBadge key={tag} tag={tag} size="xs" />
            ))}
          </span>
        )}
      </span>

      <span className="text-xs text-[var(--ops-muted)] hidden md:block truncate max-w-[100px] flex-shrink-0 mt-0.5">
        {task.assignedTo ?? <span className="italic text-[var(--ops-muted)]">—</span>}
      </span>

      <span className="text-xs text-[var(--ops-muted)] hidden sm:block flex-shrink-0 mt-0.5">
        {DEPT_LABELS[task.department] ?? task.department}
      </span>

      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_COLORS[task.status] ?? "bg-[var(--ops-surface-2)] text-[var(--ops-fg-muted)]"}`}>
        {task.status.replace("_", " ")}
      </span>
    </button>
  );
}
