/**
 * COLLABORAZIONE Layer 5 -- Fan-Out / Fan-In Protocol
 *
 * Multi-department parallel task execution pattern.
 *
 * Usage:
 *   const { parentTaskId, subtaskIds } = await createFanOut({
 *     departments: ['architecture', 'quality-assurance', 'security'],
 *     templateTitle: 'Review ADR-forma-mentis',
 *     templateDesc: 'Review the architecture proposal and provide feedback.',
 *   });
 *
 *   // Later, check status:
 *   const result = await checkFanOutStatus(parentTaskId);
 *   if (result.allCompleted) {
 *     const aggregated = await aggregateFanOutResults(parentTaskId);
 *   }
 *
 * Creates REAL tasks in the company_tasks table via lib/company/tasks.ts.
 *
 * See ADR-forma-mentis.md Layer 5, Section 5.2 for design rationale.
 */

import { createTask, getTask, updateTask } from "../tasks";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Department, Task } from "../types";
import type { FanOutConfig, FanOutResult, FanOutSubtaskStatus } from "./types";

/**
 * Create a fan-out: parent task + N subtasks (one per department).
 *
 * Each subtask is independent and can be worked on concurrently.
 * Does NOT wait for completion -- use checkFanOutStatus() to poll.
 *
 * @returns parentTaskId and a map of department -> subtask ID
 */
export async function createFanOut(config: FanOutConfig): Promise<{
  parentTaskId: string;
  subtaskIds: Record<string, string>;
}> {
  const createdBy = config.createdBy ?? "cme";
  const priority = config.priority ?? "medium";

  // 1. Create or reuse parent task
  let parentTaskId: string;

  if (config.parentTaskId) {
    // Reuse existing task as parent
    const existing = await getTask(config.parentTaskId);
    if (!existing) {
      throw new Error(
        `[COLLABORAZIONE] Parent task ${config.parentTaskId} not found`
      );
    }
    parentTaskId = config.parentTaskId;
  } else {
    // Create a new parent task
    const sharedContextSummary = config.sharedContext
      ? `\n\nShared context:\n${JSON.stringify(config.sharedContext, null, 2)}`
      : "";

    const parentTask = await createTask({
      title: `[FAN-OUT] ${config.templateTitle}`,
      description:
        `${config.templateDesc}\n\nDepartments: ${config.departments.join(", ")}` +
        sharedContextSummary,
      department: "architecture", // Fan-out tasks are owned by architecture (CME logical owner)
      priority,
      createdBy,
      routing: config.routing,
      routingExempt: !config.routing,
      routingReason: config.routing
        ? undefined
        : "Fan-out parent task -- auto-created by collaborazione layer",
      labels: ["fan-out", "multi-dept"],
      tags: [...config.departments],
    });
    parentTaskId = parentTask.id;
  }

  // 2. Create subtasks for each department
  const subtaskIds: Record<string, string> = {};

  for (const dept of config.departments) {
    const sharedContextBlock = config.sharedContext
      ? `\n\nShared context:\n\`\`\`json\n${JSON.stringify(config.sharedContext, null, 2)}\n\`\`\``
      : "";

    const subtask = await createTask({
      title: `[REVIEW] ${config.templateTitle}`,
      description:
        `Fan-out review request from parent task.${sharedContextBlock}\n\n${config.templateDesc}`,
      department: dept,
      priority,
      createdBy,
      parentTaskId,
      routing: config.routing,
      routingExempt: !config.routing,
      routingReason: config.routing
        ? undefined
        : "Fan-out subtask -- auto-created by collaborazione layer",
      labels: ["fan-out-subtask"],
    });
    subtaskIds[dept] = subtask.id;
  }

  console.log(
    `[COLLABORAZIONE] Fan-out created: parent=${parentTaskId}, ` +
      `subtasks=${Object.entries(subtaskIds)
        .map(([d, id]) => `${d}:${id}`)
        .join(", ")}`
  );

  return { parentTaskId, subtaskIds };
}

/**
 * Check the status of all subtasks in a fan-out.
 *
 * Queries the company_tasks table for all tasks with parent_task_id = parentTaskId.
 */
export async function checkFanOutStatus(
  parentTaskId: string
): Promise<FanOutResult> {
  const parentTask = await getTask(parentTaskId);
  if (!parentTask) {
    throw new Error(
      `[COLLABORAZIONE] Parent task ${parentTaskId} not found`
    );
  }

  // Query subtasks by parent_task_id (not supported by getOpenTasks, use direct query)
  const subtasks = await getSubtasksByParent(parentTaskId);

  const subtaskStatuses: FanOutSubtaskStatus[] = subtasks.map((t) => ({
    department: t.department,
    taskId: t.id,
    status: t.status,
    resultSummary: t.resultSummary,
    resultData: t.resultData,
  }));

  const completedCount = subtasks.filter(
    (t) => t.status === "done" || t.status === "blocked"
  ).length;
  const pendingCount = subtasks.length - completedCount;

  const parentCreated = parentTask.createdAt
    ? new Date(parentTask.createdAt).getTime()
    : Date.now();
  const elapsedMs = Date.now() - parentCreated;

  return {
    parentTaskId,
    subtasks: subtaskStatuses,
    completedCount,
    pendingCount,
    allCompleted: pendingCount === 0 && subtasks.length > 0,
    elapsedMs,
  };
}

/**
 * Check if a fan-out is fully complete (all subtasks done or blocked).
 */
export async function isFanOutComplete(
  parentTaskId: string
): Promise<boolean> {
  const status = await checkFanOutStatus(parentTaskId);
  return status.allCompleted;
}

/**
 * Aggregate results from all completed fan-out subtasks into the parent task.
 *
 * Collects all subtask results into a single record and updates the parent task:
 * - Sets resultData with aggregated per-department results
 * - Sets resultSummary with a textual summary
 * - Sets parent task status to "done" if all subtasks are complete
 *
 * @returns The aggregated FanOutResult
 */
export async function aggregateFanOutResults(
  parentTaskId: string
): Promise<FanOutResult> {
  const status = await checkFanOutStatus(parentTaskId);

  // Build aggregated result data
  const aggregated: Record<string, unknown> = {};
  const summaryParts: string[] = [];

  for (const subtask of status.subtasks) {
    aggregated[subtask.department] = {
      taskId: subtask.taskId,
      status: subtask.status,
      result: subtask.resultData,
      summary: subtask.resultSummary,
    };

    const statusIcon =
      subtask.status === "done"
        ? "OK"
        : subtask.status === "blocked"
          ? "BLOCKED"
          : "PENDING";
    const summaryText = subtask.resultSummary ?? "(no result yet)";
    summaryParts.push(`[${statusIcon}] ${subtask.department}: ${summaryText}`);
  }

  // Update parent task with aggregated results
  const updatePayload: Parameters<typeof updateTask>[1] = {
    resultData: {
      fanOut: true,
      departments: status.subtasks.map((s) => s.department),
      completedCount: status.completedCount,
      pendingCount: status.pendingCount,
      results: aggregated,
    },
    resultSummary: `Fan-out ${status.completedCount}/${status.subtasks.length} complete.\n${summaryParts.join("\n")}`,
  };

  // Mark parent as done if all subtasks are complete
  if (status.allCompleted) {
    updatePayload.status = "done";
  }

  await updateTask(parentTaskId, updatePayload);

  console.log(
    `[COLLABORAZIONE] Fan-out aggregated: parent=${parentTaskId}, ` +
      `${status.completedCount}/${status.subtasks.length} complete`
  );

  return status;
}

// ────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────

/**
 * Query all subtasks that have a given parent_task_id.
 * Uses direct Supabase query since getOpenTasks doesn't support parentTaskId filter.
 */
async function getSubtasksByParent(parentTaskId: string): Promise<Task[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_tasks")
    .select("*")
    .eq("parent_task_id", parentTaskId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(
      `[COLLABORAZIONE] Error querying subtasks for ${parentTaskId}: ${error.message}`
    );
  }

  if (!data || data.length === 0) return [];

  // Map rows using the same pattern as tasks.ts mapRow
  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    department: row.department as Department,
    status: row.status as Task["status"],
    priority: row.priority as Task["priority"],
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
    routing: (row.routing as string) ?? null,
    routingExempt: (row.routing_exempt as boolean) ?? false,
    routingReason: (row.routing_reason as string) ?? null,
    seqNum: row.seq_num != null ? (row.seq_num as number) : undefined,
    tags: (row.tags as string[]) ?? [],
    expectedBenefit: (row.expected_benefit as string) ?? undefined,
    benefitStatus:
      (row.benefit_status as Task["benefitStatus"]) ?? "pending",
    benefitNotes: (row.benefit_notes as string) ?? undefined,
    suggestedNext: (row.suggested_next as string) ?? undefined,
    approvalLevel: (row.approval_level as Task["approvalLevel"]) ?? undefined,
    consultDepts: (row.consult_depts as string[]) ?? [],
  }));
}
