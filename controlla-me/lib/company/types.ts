/**
 * Company Types — Tipi per il task system della virtual company.
 */

export type Department =
  | "ufficio-legale"
  | "data-engineering"
  | "quality-assurance"
  | "architecture"
  | "finance"
  | "operations"
  | "security"
  | "strategy"
  | "marketing";

export type TaskStatus = "open" | "in_progress" | "review" | "done" | "blocked";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  department: Department;
  status: TaskStatus;
  priority: TaskPriority;
  createdBy: string;
  assignedTo: string | null;
  parentTaskId: string | null;
  blockedBy: string[];
  resultSummary: string | null;
  resultData: Record<string, unknown> | null;
  labels: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  department: Department;
  priority?: TaskPriority;
  status?: TaskStatus;        // default "open"; usare "review" per task che richiedono approvazione boss
  createdBy: string;
  assignedTo?: string;        // Se fornito, il task nasce in_progress con started_at settato
  parentTaskId?: string;
  blockedBy?: string[];
  labels?: string[];
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  assignedTo?: string;
  resultSummary?: string;
  resultData?: Record<string, unknown>;
  labels?: string[];
}

export interface TaskBoard {
  total: number;
  byStatus: Record<TaskStatus, number>;
  byDepartment: Record<string, { total: number; open: number; inProgress: number; done: number }>;
  recent: Task[];
  /** All tasks currently in_progress, ordered by started_at DESC */
  inProgress: Task[];
  /** ALL tasks awaiting boss approval (status=review) — NOT limited to recent slice */
  reviewPending: Task[];
}
