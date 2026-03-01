"use client";

import { ClipboardList, Maximize2, AlertCircle } from "lucide-react";
// Single source of truth for TaskItem
import type { TaskItem } from "@/components/ops/TaskModal";
export type { TaskItem };

interface TaskBoardProps {
  board: {
    total: number;
    byStatus: Record<string, number>;
    recent: TaskItem[];
    reviewPending?: TaskItem[];   // ALL review tasks, not limited to recent slice
  } | null;
  onSelectTask?: (task: TaskItem) => void;
  onExpand?: (status: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  review: "bg-amber-500/20 text-amber-400",
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

export function TaskBoard({ board, onSelectTask, onExpand }: TaskBoardProps) {
  if (!board) {
    return (
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#FF6B35]" />
          Task Board
        </h2>
        <p className="text-zinc-500 mt-4 text-sm">Caricamento...</p>
      </div>
    );
  }

  // Review tasks come from reviewPending (all of them), not from the recent slice
  const reviewTasks = board.reviewPending ?? board.recent.filter((t) => t.status === "review");
  const inProgressTasks = board.recent.filter((t) => t.status === "in_progress");
  // Other recent tasks: exclude review and in_progress (review shown above, in_progress highlighted)
  const otherTasks = board.recent.filter((t) => t.status !== "in_progress" && t.status !== "review");

  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[#FF6B35]" />
          Task Board
          <span className="text-sm text-zinc-500 font-normal">({board.total})</span>
        </h2>
        {onExpand && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpand("all"); }}
            title="Espandi a tutta pagina"
            className="cursor-pointer p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status summary — clickable counters */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {(["open", "in_progress", "review", "done", "blocked"] as const).map((status) => {
          const count = board.byStatus[status] ?? 0;
          const isReview = status === "review" && count > 0;
          const isInProg = status === "in_progress" && count > 0;
          return (
            <button
              key={status}
              onClick={(e) => { e.stopPropagation(); onExpand?.(status); }}
              className={`cursor-pointer rounded-lg p-3 text-center transition-all hover:scale-105 hover:brightness-110 ${
                isReview
                  ? "bg-amber-500/10 border border-amber-500/30"
                  : isInProg
                  ? "bg-yellow-500/10 border border-yellow-500/30"
                  : "bg-zinc-800/50 hover:bg-zinc-800"
              }`}
            >
              <div className={`text-2xl font-bold ${isReview ? "text-amber-400" : isInProg ? "text-yellow-400" : "text-white"}`}>
                {count}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                {status.replace("_", " ")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Review tasks — DA APPROVARE (uses reviewPending, always complete) */}
      {reviewTasks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-amber-500/90 font-semibold mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            DA APPROVARE ({reviewTasks.length})
          </p>
          <div className="space-y-1.5">
            {reviewTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => onSelectTask?.(task)}
                review
              />
            ))}
          </div>
        </div>
      )}

      {/* In-progress tasks */}
      {inProgressTasks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-yellow-500/80 font-medium mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse inline-block" />
            IN LAVORAZIONE
          </p>
          <div className="space-y-1.5">
            {inProgressTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onClick={() => onSelectTask?.(task)}
                highlighted
              />
            ))}
          </div>
        </div>
      )}

      {/* Other recent tasks */}
      {otherTasks.length > 0 && (
        <div className="space-y-1.5">
          {otherTasks.slice(0, 5).map((task) => (
            <TaskRow key={task.id} task={task} onClick={() => onSelectTask?.(task)} />
          ))}
        </div>
      )}

      {reviewTasks.length === 0 && inProgressTasks.length === 0 && otherTasks.length === 0 && (
        <p className="text-zinc-500 text-sm">Nessun task recente.</p>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onClick,
  highlighted = false,
  review = false,
}: {
  task: TaskItem;
  onClick: () => void;
  highlighted?: boolean;
  review?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`cursor-pointer w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors group ${
        review
          ? "bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20"
          : highlighted
          ? "bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/15"
          : "bg-zinc-800/30 hover:bg-zinc-800/60"
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOTS[task.priority] ?? "bg-zinc-500"}`} />
      <span className="text-sm flex-1 truncate">
        <span className="mr-1">{DEPT_EMOJI[task.department] ?? "📋"}</span>
        <span className={`${review ? "text-amber-100" : "text-zinc-300"} group-hover:text-white transition-colors`}>
          {task.title}
        </span>
      </span>
      {task.assignedTo && (
        <span className="text-xs text-zinc-500 hidden sm:block truncate max-w-[90px] flex-shrink-0">
          {task.assignedTo}
        </span>
      )}
      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? "bg-zinc-800 text-zinc-400"}`}>
        {task.status.replace("_", " ")}
      </span>
    </button>
  );
}
