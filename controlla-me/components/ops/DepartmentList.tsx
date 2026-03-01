"use client";

import { useState } from "react";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
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
];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400",
  in_progress: "bg-yellow-500/20 text-yellow-400",
  review: "bg-purple-500/20 text-purple-400",
  done: "bg-green-500/20 text-green-400",
  blocked: "bg-red-500/20 text-red-400",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-zinc-500",
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
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          DEPARTMENTS
        </h3>
      </div>

      <div className="divide-y divide-zinc-800/60">
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
              className={isSelected ? "border-l-2 border-[#FF6B35]" : "border-l-2 border-transparent"}
            >
              {/* Row: split tra area cliccabile (→ seleziona) e chevron (→ espande) */}
              <div className="flex items-center">
                <button
                  onClick={() => onSelectDepartment?.(dept)}
                  className="flex-1 flex items-center gap-3 px-5 py-3 hover:bg-zinc-800/50 transition-colors text-left group cursor-pointer"
                >
                  <span className="text-base leading-none">{DEPT_ICONS[dept]}</span>

                  <span
                    className={`text-sm flex-1 transition-colors group-hover:text-white ${
                      isSelected ? "text-[#FF6B35] font-medium" : "text-zinc-300"
                    }`}
                  >
                    {DEPT_LABELS[dept] ?? dept}
                  </span>

                  {/* Status badges */}
                  <div className="flex items-center gap-2">
                    {hasOpen && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">
                        {info.open}
                      </span>
                    )}
                    {info && inProgressCount > 0 && isExpanded && (
                      <span className="text-xs bg-yellow-500/30 text-yellow-300 px-1.5 py-0.5 rounded-full animate-pulse">
                        ▶ {inProgressCount}
                      </span>
                    )}
                    {!info && (
                      <span className="text-xs text-zinc-600">-</span>
                    )}
                    {info && !hasOpen && (
                      <span className="text-xs text-green-500">ok</span>
                    )}
                  </div>
                </button>

                {/* Chevron separato: solo espansione task list */}
                <button
                  onClick={() => toggle(dept)}
                  className="px-3 py-3 text-zinc-600 hover:text-zinc-400 transition-colors"
                  title="Mostra task"
                >
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>
              </div>

              {/* Expanded task list */}
              {isExpanded && (
                <div className="bg-zinc-950/60 border-t border-zinc-800/40">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-4 gap-2 text-zinc-500 text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Caricamento...
                    </div>
                  ) : deptTasks.length === 0 ? (
                    <p className="text-xs text-zinc-600 px-5 py-3">Nessun task.</p>
                  ) : (
                    <div className="py-1">
                      {deptTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => onSelectTask?.(task)}
                          className="w-full flex items-start gap-2.5 px-5 py-2.5 hover:bg-zinc-800/50 transition-colors text-left group/task"
                        >
                          <span
                            className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority] ?? "bg-zinc-500"}`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-300 truncate group-hover/task:text-white transition-colors">
                              {task.title}
                            </p>
                            {task.assignedTo && (
                              <p className="text-[10px] text-zinc-600 mt-0.5">
                                → {task.assignedTo}
                              </p>
                            )}
                          </div>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[task.status] ?? "bg-zinc-800 text-zinc-400"}`}
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
