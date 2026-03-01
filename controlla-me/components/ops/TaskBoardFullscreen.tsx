"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Search, Loader2 } from "lucide-react";
import { TaskModal, type TaskItem } from "@/components/ops/TaskModal";
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
  low: "bg-zinc-500",
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
};

export function TaskBoardFullscreen({ initialStatus = "all", onClose }: TaskBoardFullscreenProps) {
  const [activeStatus, setActiveStatus] = useState(initialStatus);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);

  const fetchTasks = useCallback(async (status: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
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
  }, [activeStatus, fetchTasks]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !selectedTask) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, selectedTask]);

  const filtered = tasks.filter((t) =>
    search.trim() === "" ||
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.department.toLowerCase().includes(search.toLowerCase()) ||
    (t.assignedTo ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-4xl h-[90vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
            <h2 className="text-lg font-semibold text-white">Task Board</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs + Search */}
          <div className="px-6 py-3 border-b border-zinc-800 flex items-center gap-4 flex-shrink-0">
            <div className="flex gap-1 flex-wrap">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveStatus(tab.key)}
                  className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                    activeStatus === tab.key
                      ? "bg-[#FF6B35] text-white"
                      : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="ml-auto relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Cerca task..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 w-52"
              />
            </div>
          </div>

          {/* Count */}
          <div className="px-6 py-2 flex-shrink-0">
            <span className="text-xs text-zinc-500">
              {loading ? "Caricamento..." : `${filtered.length} task`}
            </span>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-12">Nessun task trovato.</p>
            ) : (
              <div className="space-y-1.5">
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
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left bg-zinc-900 hover:bg-zinc-800 transition-colors group border border-zinc-800/50 hover:border-zinc-700"
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOTS[task.priority] ?? "bg-zinc-500"}`} />

      <span className="text-base flex-shrink-0">
        {DEPT_EMOJI[task.department] ?? "📋"}
      </span>

      <span className="text-sm text-zinc-200 flex-1 truncate group-hover:text-white">
        {task.title}
      </span>

      <span className="text-xs text-zinc-500 hidden md:block truncate max-w-[100px] flex-shrink-0">
        {task.assignedTo ?? <span className="italic text-zinc-700">—</span>}
      </span>

      <span className="text-xs text-zinc-500 hidden sm:block flex-shrink-0">
        {task.department}
      </span>

      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? "bg-zinc-800 text-zinc-400"}`}>
        {task.status.replace("_", " ")}
      </span>
    </button>
  );
}
