"use client";

import {
  ClipboardList, Maximize2, AlertCircle,
} from "lucide-react";
import { DEPT_ICONS } from "@/lib/company/dept-icons";
// Single source of truth for TaskItem
import type { TaskItem } from "@/components/ops/TaskModal";
import { TagBadge } from "@/components/ops/TaskModal";
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
  open: "bg-[rgba(173,215,255,0.15)] text-[var(--ops-cyan)]",
  in_progress: "bg-[rgba(255,200,50,0.15)] text-[var(--ops-id-cost)]",
  review: "bg-[rgba(255,107,53,0.15)] text-[var(--ops-accent)]",
  done: "bg-[rgba(93,228,199,0.15)] text-[var(--ops-teal)]",
  blocked: "bg-[rgba(229,141,120,0.15)] text-[var(--ops-error)]",
};

const PRIORITY_DOTS: Record<string, string> = {
  critical: "bg-[var(--ops-error)]",
  high: "bg-[var(--ops-accent)]",
  medium: "bg-[var(--ops-id-cost)]",
  low: "bg-[var(--ops-muted)]",
};


export function TaskBoard({ board, onSelectTask, onExpand }: TaskBoardProps) {
  if (!board) {
    return (
      <div className="bg-[var(--ops-surface)] rounded-xl p-6 border border-[var(--ops-border-subtle)]">
        <h2 className="text-lg font-semibold text-[var(--ops-fg)] flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[var(--ops-accent)]" />
          Task Board
        </h2>
        <p className="text-[var(--ops-muted)] mt-4 text-sm">Caricamento...</p>
      </div>
    );
  }

  // Review tasks come from reviewPending (all of them), not from the recent slice
  const reviewTasks = board.reviewPending ?? board.recent.filter((t) => t.status === "review");
  const inProgressTasks = board.recent.filter((t) => t.status === "in_progress");
  // Other recent tasks: exclude review and in_progress (review shown above, in_progress highlighted)
  const otherTasks = board.recent.filter((t) => t.status !== "in_progress" && t.status !== "review");

  return (
    <div className="bg-[var(--ops-surface)] rounded-xl p-6 border border-[var(--ops-border-subtle)]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--ops-fg)] flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-[var(--ops-accent)]" />
          Task Board
          <span className="text-sm text-[var(--ops-muted)] font-normal">({board.total})</span>
        </h2>
        {onExpand && (
          <button
            onClick={(e) => { e.stopPropagation(); onExpand("all"); }}
            title="Espandi a tutta pagina"
            className="cursor-pointer p-2 rounded-lg text-[var(--ops-muted)] hover:text-[var(--ops-fg)] hover:bg-[var(--ops-surface)] transition-colors"
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
                  ? "bg-[rgba(255,107,53,0.1)] border border-[rgba(255,107,53,0.3)]"
                  : isInProg
                  ? "bg-[rgba(255,200,50,0.1)] border border-[rgba(255,200,50,0.3)]"
                  : "bg-[var(--ops-surface-2)]/50 hover:bg-[var(--ops-surface-2)]"
              }`}
            >
              <div className={`text-2xl font-bold ${isReview ? "text-[var(--ops-accent)]" : isInProg ? "text-[var(--ops-id-cost)]" : "text-[var(--ops-fg)]"}`}>
                {count}
              </div>
              <div className="text-xs text-[var(--ops-fg-muted)] mt-1">
                {status.replace("_", " ")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Review tasks — DA APPROVARE (uses reviewPending, always complete) */}
      {reviewTasks.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-[var(--ops-accent)] font-semibold mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            DA APPROVARE ({reviewTasks.length})
          </p>
          <div className="space-y-2">
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
          <p className="text-xs text-[var(--ops-id-cost)] font-medium mb-2 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ops-id-cost)] animate-pulse inline-block" />
            IN LAVORAZIONE
          </p>
          <div className="space-y-2">
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
        <div className="space-y-2">
          {otherTasks.slice(0, 5).map((task) => (
            <TaskRow key={task.id} task={task} onClick={() => onSelectTask?.(task)} />
          ))}
        </div>
      )}

      {reviewTasks.length === 0 && inProgressTasks.length === 0 && otherTasks.length === 0 && (
        <p className="text-[var(--ops-muted)] text-sm">Nessun task recente.</p>
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
  const visibleTags = (task.tags ?? []).slice(0, 3);

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`cursor-pointer w-full flex items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors group ${
        review
          ? "bg-[rgba(255,107,53,0.1)] border border-[rgba(255,107,53,0.25)] hover:bg-[rgba(255,107,53,0.2)]"
          : highlighted
          ? "bg-[rgba(255,200,50,0.1)] border border-[rgba(255,200,50,0.2)] hover:bg-[rgba(255,200,50,0.15)]"
          : "bg-[var(--ops-surface)]/5 hover:bg-[var(--ops-surface-2)]/30"
      }`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${PRIORITY_DOTS[task.priority] ?? "bg-[var(--ops-muted)]"}`} />
      <span className="flex-1 min-w-0">
        <span className="text-sm flex items-center gap-2 truncate">
          {(() => { const Icon = DEPT_ICONS[task.department]; return Icon ? <Icon className="w-4 h-4 text-[var(--ops-muted)] flex-shrink-0" /> : <ClipboardList className="w-4 h-4 text-[var(--ops-muted)] flex-shrink-0" />; })()}
          <span className={`${review ? "text-[var(--ops-fg)]" : "text-[var(--ops-fg-muted)]"} group-hover:text-[var(--ops-fg)] transition-all duration-150 truncate`}>
            {task.title}
          </span>
        </span>
        {visibleTags.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1">
            {visibleTags.map((tag) => (
              <TagBadge key={tag} tag={tag} size="xs" />
            ))}
          </span>
        )}
      </span>
      {task.assignedTo && (
        <span className="text-xs text-[var(--ops-muted)] hidden sm:block truncate max-w-[90px] flex-shrink-0 mt-0.5">
          {task.assignedTo}
        </span>
      )}
      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${STATUS_COLORS[task.status] ?? "bg-[var(--ops-surface-2)] text-[var(--ops-fg-muted)]"}`}>
        {task.status.replace("_", " ")}
      </span>
    </button>
  );
}
