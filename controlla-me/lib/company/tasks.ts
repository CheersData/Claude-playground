/**
 * Company Tasks — CRUD per il task system della virtual company.
 * Pattern da lib/staff/data-connector/sync-log.ts.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Task,
  CreateTaskInput,
  UpdateTaskInput,
  TaskBoard,
  TaskStatus,
  Department,
} from "./types";

// ─── Create ───

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const admin = createAdminClient();

  // Se assignedTo è fornito, il task nasce direttamente in_progress
  const autoStart = !!input.assignedTo;
  const resolvedStatus = input.status ?? (autoStart ? "in_progress" : "open");

  const { data, error } = await admin
    .from("company_tasks")
    .insert({
      title: input.title,
      description: input.description ?? null,
      department: input.department,
      priority: input.priority ?? "medium",
      status: resolvedStatus,
      created_by: input.createdBy,
      assigned_to: input.assignedTo ?? null,
      started_at: autoStart ? new Date().toISOString() : null,
      parent_task_id: input.parentTaskId ?? null,
      blocked_by: input.blockedBy ?? [],
      labels: input.labels ?? [],
    })
    .select("*")
    .single();

  if (error) throw new Error(`[TASKS] Errore createTask: ${error.message}`);
  return mapRow(data);
}

// ─── Claim ───

export async function claimTask(
  taskId: string,
  agent: string
): Promise<Task> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_tasks")
    .update({
      status: "in_progress",
      assigned_to: agent,
      started_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) throw new Error(`[TASKS] Errore claimTask: ${error.message}`);
  return mapRow(data);
}

// ─── Update Status ───

export async function updateTask(
  taskId: string,
  update: UpdateTaskInput
): Promise<Task> {
  const admin = createAdminClient();

  const payload: Record<string, unknown> = {};
  if (update.status) {
    payload.status = update.status;
    if (update.status === "done") {
      payload.completed_at = new Date().toISOString();
    }
    if (update.status === "in_progress" ) {
      payload.started_at = new Date().toISOString();
    }
  }
  if (update.assignedTo !== undefined) payload.assigned_to = update.assignedTo;
  if (update.resultSummary !== undefined) payload.result_summary = update.resultSummary;
  if (update.resultData !== undefined) payload.result_data = update.resultData;
  if (update.labels !== undefined) payload.labels = update.labels;

  const { data, error } = await admin
    .from("company_tasks")
    .update(payload)
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) throw new Error(`[TASKS] Errore updateTask: ${error.message}`);
  return mapRow(data);
}

// ─── Query ───

export async function getTask(taskId: string): Promise<Task | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data);
}

export async function getOpenTasks(filters?: {
  department?: Department;
  status?: TaskStatus;
  createdBy?: string;
  limit?: number;
}): Promise<Task[]> {
  const admin = createAdminClient();
  let query = admin
    .from("company_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.department) query = query.eq("department", filters.department);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.createdBy) query = query.eq("created_by", filters.createdBy);
  query = query.limit(filters?.limit ?? 50);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapRow);
}

// ─── Board ───

export async function getTaskBoard(): Promise<TaskBoard> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return {
      total: 0,
      byStatus: { open: 0, in_progress: 0, review: 0, done: 0, blocked: 0 },
      byDepartment: {},
      recent: [],
      inProgress: [],
      reviewPending: [],
    };
  }

  const tasks = data.map(mapRow);

  const byStatus: Record<TaskStatus, number> = {
    open: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    blocked: 0,
  };

  const byDepartment: Record<string, { total: number; open: number; inProgress: number; done: number }> = {};

  for (const task of tasks) {
    byStatus[task.status]++;
    if (!byDepartment[task.department]) {
      byDepartment[task.department] = { total: 0, open: 0, inProgress: 0, done: 0 };
    }
    byDepartment[task.department].total++;
    if (task.status === "open") byDepartment[task.department].open++;
    if (task.status === "in_progress") byDepartment[task.department].inProgress++;
    if (task.status === "done") byDepartment[task.department].done++;
  }

  // All in-progress tasks, sorted by most recently started
  const inProgressTasks = tasks
    .filter((t) => t.status === "in_progress")
    .sort((a, b) => {
      const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return bTime - aTime;
    });

  // All tasks awaiting boss approval (review status) — always included, not limited to slice
  const reviewPendingTasks = tasks.filter((t) => t.status === "review");

  return {
    total: tasks.length,
    byStatus,
    byDepartment,
    recent: tasks.slice(0, 10),
    inProgress: inProgressTasks,
    reviewPending: reviewPendingTasks,
  };
}

// ─── Row Mapper ───

function mapRow(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    department: row.department as Department,
    status: row.status as TaskStatus,
    priority: row.priority as string as Task["priority"],
    createdBy: row.created_by as string,
    assignedTo: (row.assigned_to as string) ?? null,
    parentTaskId: (row.parent_task_id as string) ?? null,
    blockedBy: (row.blocked_by as string[]) ?? [],
    resultSummary: (row.result_summary as string) ?? null,
    resultData: (row.result_data as Record<string, unknown>) ?? null,
    labels: (row.labels as string[]) ?? [],
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string) ?? null,
    completedAt: (row.completed_at as string) ?? null,
  };
}
