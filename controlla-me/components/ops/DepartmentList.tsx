"use client";

import { useState } from "react";
import {
  Building2, ChevronRight, Loader2, Play,
} from "lucide-react";
import { DEPT_ICONS } from "@/lib/company/dept-icons";
import { getConsoleAuthHeaders } from "@/lib/utils/console-client";

interface TaskItem {
  id: string;
  title: string;
  department: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  createdBy: string;
  createdAt: string;
  description?: string | null;
  resultSummary?: string | null;
}

interface DepartmentListProps {
  departments: Record<string, { total: number; open: number; done: number }>;
  onSelectTask?: (task: TaskItem) => void;
  onSelectDepartment?: (dept: string) => void;
  selectedDepartment?: string | null;
}

const DEPT_LABELS: Record<string, string> = {
  "ufficio-legale": "Uff. Legale",
  "data-engineering": "Data Eng.",
  "quality-assurance": "QA",
  architecture: "Architecture",
  finance: "Finance",
  operations: "Operations",
  security: "Security",
  strategy: "Strategy",
  marketing: "Marketing",
  trading: "Trading",
  "ux-ui": "UX/UI",
};

const ALL_DEPTS = [
  "ufficio-legale",
  "data-engineering",
  "quality-assurance",
  "architecture",
  "security",
  "finance",
  "operations",
  "strategy",
  "marketing",
  "ux-ui",
  "trading",
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-[var(--ops-cyan)]/20 text-[var(--ops-cyan)]",
  in_progress: "bg-[var(--ops-id-cost)]/20 text-[var(--ops-id-cost)]",
  review: "bg-[var(--ops-id-health)]/20 text-[var(--ops-id-health)]",
  done: "bg-[var(--ops-teal)]/20 text-[var(--ops-teal)]",
  blocked: "bg-[var(--ops-error)]/20 text-[var(--ops-error)]",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-[var(--ops-error)]",
  high: "bg-[var(--ops-accent)]",
  medium: "bg-[var(--ops-id-cost)]",
  low: "bg-[var(--ops-muted)]",
};

export function DepartmentList({
  departments,
  onSelectTask,
  onSelectDepartment,
  selectedDepartment,
}: DepartmentListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Record<string, TaskItem[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const toggle = async (dept: string) => {
    if (expanded === dept) {
      setExpanded(null);
      return;
    }
    setExpanded(dept);
    if (tasks[dept]) return; // already fetched

    setLoading(dept);
    try {
      const res = await fetch(`/api/company/tasks?dept=${dept}&limit=20`, {
        headers: getConsoleAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        const enriched = (json.tasks ?? []).map((t: TaskItem) => ({
          ...t,
          department: t.department ?? dept,
        }));
        setTasks((prev) => ({ ...prev, [dept]: enriched }));
      }
    } catch {
      setTasks((prev) => ({ ...prev, [dept]: [] }));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-[var(--ops-surface)] rounded-xl border border-[var(--ops-border-subtle)] overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-[var(--ops-fg-muted)] flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          DEPARTMENTS
        </h3>
      </div>

      <div className="divide-y divide-[var(--ops-border)]/60">
        {ALL_DEPTS.map((dept) => {
          const info = departments[dept];
          const hasOpen = info && info.open > 0;
          const isExpanded = expanded === dept;
          const deptTasks = tasks[dept] ?? [];
          const isLoading = loading === dept;
          const inProgressCount = deptTasks.filter((t) => t.status === "in_progress").length;

          const isSelected = selectedDepartment === dept;

          return (
            <div
              key={dept}
              className={isSelected ? "border-l-2 border-[var(--ops-accent)]" : "border-l-2 border-transparent"}
            >
              {/* Row: split tra area cliccabile (→ seleziona) e chevron (→ espande) */}
              <div className="flex items-center">
                <button
                  onClick={() => onSelectDepartment?.(dept)}
                  className="flex-1 flex items-center gap-3 px-5 py-3 hover:bg-[var(--ops-surface-2)]/50 transition-colors text-left group cursor-pointer"
                >
                  {(() => { const Icon = DEPT_ICONS[dept]; return Icon ? <Icon className="w-4 h-4 text-[var(--ops-fg-muted)] flex-shrink-0" /> : null; })()}

                  <span
                    className={`text-sm flex-1 transition-colors group-hover:text-white ${
                      isSelected ? "text-[var(--ops-accent)] font-medium" : "text-[var(--ops-fg)]"
                    }`}
                  >
                    {DEPT_LABELS[dept] ?? dept}
                  </span>

                  {/* Status badges */}
                  <div className="flex items-center gap-2">
                    {hasOpen && (
                      <span className="text-xs bg-[var(--ops-id-cost)]/20 text-[var(--ops-id-cost)] px-2 py-0.5 rounded-full">
                        {info.open}
                      </span>
                    )}
                    {info && inProgressCount > 0 && isExpanded && (
                      <span className="inline-flex items-center gap-1 text-xs bg-[var(--ops-id-cost)]/30 text-[var(--ops-id-cost)] px-2 py-0.5 rounded-full animate-pulse">
                        <Play className="w-2 h-2 fill-current" /> {inProgressCount}
                      </span>
                    )}
                    {!info && (
                      <span className="text-xs text-[var(--ops-muted)]">-</span>
                    )}
                    {info && !hasOpen && (
                      <span className="text-xs text-[var(--ops-teal)]">ok</span>
                    )}
                  </div>
                </button>

                {/* Chevron separato: solo espansione task list */}
                <button
                  onClick={() => toggle(dept)}
                  className="px-3 py-3 text-[var(--ops-muted)] hover:text-[var(--ops-fg-muted)] transition-colors"
                  title="Mostra task"
                >
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>
              </div>

              {/* Expanded task list */}
              {isExpanded && (
                <div className="bg-[var(--ops-bg)]/60 border-t border-[var(--ops-border-subtle)]/40">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4 gap-2 text-[var(--ops-muted)] text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Caricamento...
                    </div>
                  ) : deptTasks.length === 0 ? (
                    <p className="text-xs text-[var(--ops-muted)] px-5 py-3">Nessun task.</p>
                  ) : (
                    <div className="py-1">
                      {deptTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onSelectTask?.(task)}
                          className="w-full flex items-start gap-3 px-5 py-3 hover:bg-[var(--ops-surface-2)]/50 transition-colors text-left group/task"
                        >
                          <span
                            className={`mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-[var(--ops-muted)]"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-[var(--ops-fg)] truncate group-hover/task:text-white transition-colors">
                              {task.title}
                            </p>
                            {task.assignedTo && (
                              <p className="text-xs text-[var(--ops-muted)] mt-0.5">
                                → {task.assignedTo}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? "bg-[var(--ops-surface-2)] text-[var(--ops-fg-muted)]"}`}
                          >
                            {task.status.replace("_", " ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
