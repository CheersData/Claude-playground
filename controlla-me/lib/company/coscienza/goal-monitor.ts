/**
 * COSCIENZA Layer 3 — Goal Monitor
 *
 * CRUD operations for company goals, value tracking, goal checking,
 * and alert escalation. Used by the daemon to monitor OKR progress
 * and trigger actions when goals deviate.
 *
 * Pattern: same as lib/company/tasks.ts (createAdminClient, mapRow, fire-and-forget logging).
 * ADR: ADR-forma-mentis.md Layer 3
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CompanyGoal,
  GoalAction,
  GoalCheckResult,
  GoalStatus,
  GoalValueEntry,
  AlertEscalation,
  CreateGoalInput,
  UpdateGoalInput,
} from "./types";

// ─── CRUD ───

/**
 * Get all active goals, optionally filtered by department.
 */
export async function getActiveGoals(
  department?: string
): Promise<CompanyGoal[]> {
  const admin = createAdminClient();
  let query = admin
    .from("company_goals")
    .select("*")
    .in("status", ["active", "at_risk"])
    .order("created_at", { ascending: false });

  if (department) {
    query = query.eq("department", department);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[COSCIENZA] Error fetching goals:", error.message);
    return [];
  }
  return (data ?? []).map(mapGoalRow);
}

/**
 * Get a single goal by ID.
 */
export async function getGoal(goalId: string): Promise<CompanyGoal | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_goals")
    .select("*")
    .eq("id", goalId)
    .maybeSingle();

  if (error || !data) return null;
  return mapGoalRow(data);
}

/**
 * Create a new company goal.
 */
export async function createGoal(input: CreateGoalInput): Promise<CompanyGoal> {
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const initialHistory: GoalValueEntry[] =
    input.currentValue != null
      ? [{ value: input.currentValue, timestamp: now, source: "initial" }]
      : [];

  const { data, error } = await admin
    .from("company_goals")
    .insert({
      title: input.title,
      description: input.description ?? null,
      metric: input.metric,
      target_value: input.targetValue,
      current_value: input.currentValue ?? 0,
      unit: input.unit ?? "",
      department: input.department,
      owner_agent: input.ownerAgent ?? null,
      deadline: input.deadline ?? null,
      status: "active",
      actions_if_behind: input.actionsIfBehind ?? [],
      check_interval_minutes: input.checkIntervalMinutes ?? 60,
      value_history: initialHistory,
      parent_goal_id: input.parentGoalId ?? null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) throw new Error(`[COSCIENZA] Error creating goal: ${error.message}`);
  return mapGoalRow(data!);
}

/**
 * Update a goal's fields (not value — use updateGoalValue for value changes).
 */
export async function updateGoal(
  goalId: string,
  update: UpdateGoalInput
): Promise<CompanyGoal> {
  const admin = createAdminClient();

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (update.currentValue !== undefined) payload.current_value = update.currentValue;
  if (update.status !== undefined) payload.status = update.status;
  if (update.description !== undefined) payload.description = update.description;
  if (update.targetValue !== undefined) payload.target_value = update.targetValue;
  if (update.deadline !== undefined) payload.deadline = update.deadline;
  if (update.actionsIfBehind !== undefined) payload.actions_if_behind = update.actionsIfBehind;
  if (update.checkIntervalMinutes !== undefined) payload.check_interval_minutes = update.checkIntervalMinutes;
  if (update.tags !== undefined) payload.tags = update.tags;
  if (update.metadata !== undefined) payload.metadata = update.metadata;

  const { data, error } = await admin
    .from("company_goals")
    .update(payload)
    .eq("id", goalId)
    .select("*")
    .single();

  if (error) throw new Error(`[COSCIENZA] Error updating goal: ${error.message}`);
  return mapGoalRow(data!);
}

// ─── Value Tracking ───

/**
 * Update a goal's current value and append to value_history.
 * This is the primary way the daemon updates goal progress.
 *
 * Uses a read-then-write pattern to append to the JSONB array.
 * (Atomic RPC would be better but requires a dedicated migration function.)
 */
export async function updateGoalValue(
  goalId: string,
  value: number,
  source: string
): Promise<CompanyGoal | null> {
  const admin = createAdminClient();

  // Read current goal to get existing value_history
  const { data: current, error: readError } = await admin
    .from("company_goals")
    .select("value_history")
    .eq("id", goalId)
    .maybeSingle();

  if (readError || !current) {
    console.error(
      `[COSCIENZA] Error reading goal ${goalId} for value update:`,
      readError?.message ?? "not found"
    );
    return null;
  }

  const history = (current.value_history as GoalValueEntry[]) ?? [];
  const newEntry: GoalValueEntry = {
    value,
    timestamp: new Date().toISOString(),
    source,
  };

  // Append and cap history at 500 entries (prevent unbounded growth)
  const updatedHistory = [...history, newEntry].slice(-500);

  const { data, error } = await admin
    .from("company_goals")
    .update({
      current_value: value,
      value_history: updatedHistory,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", goalId)
    .select("*")
    .single();

  if (error) {
    console.error(`[COSCIENZA] Error updating goal value: ${error.message}`);
    return null;
  }

  return mapGoalRow(data!);
}

// ─── Goal Checking ───

/**
 * Check all active goals and return evaluation results.
 * This is the core function called by the daemon every cycle.
 *
 * For each active goal whose check interval has elapsed:
 *   1. Reads the current value (previous value from DB)
 *   2. Evaluates progress against target
 *   3. Determines if status should change
 *   4. Returns GoalCheckResult for each checked goal
 *
 * Note: this function does NOT resolve metric values from external sources.
 * The daemon should call updateGoalValue() with fresh metric data BEFORE
 * calling checkGoals(). This keeps the goal monitor decoupled from metric
 * resolution (which lives in the daemon or a separate metric-resolver).
 */
export async function checkGoals(): Promise<GoalCheckResult[]> {
  const admin = createAdminClient();
  const now = new Date();

  // Get all active/at_risk goals
  const { data, error } = await admin
    .from("company_goals")
    .select("*")
    .in("status", ["active", "at_risk"])
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[COSCIENZA] Error fetching goals for check:", error?.message);
    return [];
  }

  const results: GoalCheckResult[] = [];

  for (const row of data) {
    const goal = mapGoalRow(row);

    // Check if enough time has passed since last check
    if (goal.lastCheckedAt) {
      const lastCheck = new Date(goal.lastCheckedAt);
      const elapsedMinutes = (now.getTime() - lastCheck.getTime()) / 60_000;
      if (elapsedMinutes < goal.checkIntervalMinutes) {
        continue; // Not due for check yet
      }
    }

    const progressRatio =
      goal.targetValue !== 0 ? goal.currentValue / goal.targetValue : 0;

    // Determine new status based on progress and deadline
    const previousStatus = goal.status;
    let newStatus: GoalStatus = goal.status;
    let actionTaken: string | null = null;

    if (progressRatio >= 1.0) {
      newStatus = "achieved";
      actionTaken = "Goal achieved — target reached";
    } else if (goal.deadline) {
      const deadline = new Date(goal.deadline);
      const totalDuration = deadline.getTime() - new Date(goal.createdAt).getTime();
      const elapsed = now.getTime() - new Date(goal.createdAt).getTime();
      const timeRatio = totalDuration > 0 ? elapsed / totalDuration : 1;

      // If more time has passed (proportionally) than progress made, mark at_risk
      // E.g., 80% of time elapsed but only 40% of target reached
      if (timeRatio > 0.5 && progressRatio < timeRatio * 0.7) {
        newStatus = "at_risk";
      }

      // If past deadline and not achieved, mark as missed
      if (now > deadline && progressRatio < 1.0) {
        newStatus = "missed";
        actionTaken = "Goal missed — deadline passed without reaching target";
      }
    }

    // Check action triggers
    if (newStatus !== "achieved" && newStatus !== "missed") {
      for (const action of goal.actionsIfBehind) {
        if (progressRatio < action.triggerThreshold) {
          actionTaken = `Triggered action (${action.escalationLevel}): ${action.action}`;
          if (previousStatus === "active" && newStatus !== "at_risk") {
            newStatus = "at_risk";
          }
          break; // Take first matching action only
        }
      }
    }

    // Update status in DB if changed
    if (newStatus !== previousStatus) {
      await admin
        .from("company_goals")
        .update({
          status: newStatus,
          last_checked_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", goal.id);
    } else {
      // Just update last_checked_at
      await admin
        .from("company_goals")
        .update({ last_checked_at: now.toISOString() })
        .eq("id", goal.id);
    }

    results.push({
      goalId: goal.id,
      goalTitle: goal.title,
      department: goal.department,
      metric: goal.metric,
      previousValue: goal.currentValue, // value before any daemon metric update
      currentValue: goal.currentValue,
      targetValue: goal.targetValue,
      progressRatio,
      status: newStatus,
      previousStatus,
      actionTaken,
    });
  }

  return results;
}

// ─── Alert Escalation ───

/**
 * Create alerts based on goal check results.
 * Returns escalation records for actions taken.
 *
 * Escalation levels:
 *   L1 — Log warning + create task for owning department
 *   L2 — L1 + create high-priority task for CME
 *   L3 — L2 + send Telegram alert to boss
 */
export async function createGoalAlert(
  goal: CompanyGoal,
  checkResult: GoalCheckResult
): Promise<AlertEscalation | null> {
  // Only create alerts for goals that transitioned to at_risk or missed
  if (
    checkResult.status === checkResult.previousStatus &&
    checkResult.status !== "missed"
  ) {
    return null;
  }

  // Find the matching action for the current progress level
  let matchingAction: GoalAction | null = null;
  for (const action of goal.actionsIfBehind) {
    if (checkResult.progressRatio < action.triggerThreshold) {
      matchingAction = action;
      break;
    }
  }

  if (!matchingAction) {
    // No explicit action configured — use default L1
    matchingAction = {
      action: `Goal "${goal.title}" is ${checkResult.status}. Progress: ${Math.round(checkResult.progressRatio * 100)}%`,
      triggerThreshold: 1.0,
      escalationLevel: "L1",
    };
  }

  const escalation: AlertEscalation = {
    goalId: goal.id,
    goalTitle: goal.title,
    department: goal.department,
    level: matchingAction.escalationLevel,
    action: matchingAction.action,
    taskId: null,
    telegramSent: false,
    timestamp: new Date().toISOString(),
  };

  // L1: Create task for owning department
  if (["L1", "L2", "L3"].includes(matchingAction.escalationLevel)) {
    try {
      const admin = createAdminClient();
      const { data: task } = await admin
        .from("company_tasks")
        .insert({
          title: `Goal alert: ${goal.title} (${checkResult.status})`,
          description: [
            `Goal "${goal.title}" has transitioned to ${checkResult.status}.`,
            `Metric: ${goal.metric} | Current: ${checkResult.currentValue}${goal.unit} | Target: ${goal.targetValue}${goal.unit}`,
            `Progress: ${Math.round(checkResult.progressRatio * 100)}%`,
            goal.deadline ? `Deadline: ${goal.deadline}` : null,
            `Action required: ${matchingAction.action}`,
          ]
            .filter(Boolean)
            .join("\n"),
          department: goal.department,
          priority:
            matchingAction.escalationLevel === "L3"
              ? "critical"
              : matchingAction.escalationLevel === "L2"
                ? "high"
                : "medium",
          status: "open",
          created_by: "daemon-coscienza",
          labels: ["goal-alert", `escalation-${matchingAction.escalationLevel}`],
          tags: ["coscienza", "goal-alert"],
        })
        .select("id")
        .single();

      if (task) {
        escalation.taskId = task.id as string;
      }
    } catch (err) {
      console.error(
        "[COSCIENZA] Failed to create alert task:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // L2: Also create high-priority task for CME
  if (["L2", "L3"].includes(matchingAction.escalationLevel)) {
    try {
      const admin = createAdminClient();
      await admin.from("company_tasks").insert({
        title: `CME: Goal "${goal.title}" needs attention (${matchingAction.escalationLevel})`,
        description: [
          `Escalation ${matchingAction.escalationLevel} — goal "${goal.title}" (${goal.department}) is ${checkResult.status}.`,
          `Progress: ${Math.round(checkResult.progressRatio * 100)}% of target.`,
          `Action: ${matchingAction.action}`,
        ].join("\n"),
        department: goal.department,
        priority: "high",
        status: "open",
        created_by: "daemon-coscienza",
        labels: ["cme-escalation", `escalation-${matchingAction.escalationLevel}`],
        tags: ["coscienza", "escalation"],
      });
    } catch (err) {
      console.error(
        "[COSCIENZA] Failed to create CME escalation task:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // L3: Send Telegram alert to boss
  if (matchingAction.escalationLevel === "L3") {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (token && chatId) {
        const message = [
          `\u{1F6A8} *Goal Alert (${matchingAction.escalationLevel})*`,
          ``,
          `*${goal.title}*`,
          `Department: ${goal.department}`,
          `Status: ${checkResult.previousStatus} \u{2192} ${checkResult.status}`,
          `Progress: ${Math.round(checkResult.progressRatio * 100)}%`,
          `Target: ${goal.targetValue}${goal.unit}`,
          goal.deadline ? `Deadline: ${goal.deadline}` : "",
          ``,
          `Action: ${matchingAction.action}`,
        ]
          .filter(Boolean)
          .join("\n");

        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: "Markdown",
          }),
        });

        escalation.telegramSent = res.ok;
        if (!res.ok) {
          console.error(
            `[COSCIENZA] Telegram send failed: ${res.status} ${res.statusText}`
          );
        }
      } else {
        console.warn(
          "[COSCIENZA] L3 escalation requested but TELEGRAM_BOT_TOKEN/CHAT_ID not configured"
        );
      }
    } catch (err) {
      console.error(
        "[COSCIENZA] Telegram send error:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return escalation;
}

// ─── Seed from OKRs ───

/**
 * Create goals from the current OKRs in strategy/status.json.
 * Idempotent: skips goals that already exist (matched by title).
 *
 * @param okrData - The okr_q2 object from strategy/status.json
 * @returns Number of goals created
 */
export async function seedInitialGoals(
  okrData: Record<
    string,
    {
      title: string;
      rationale?: string;
      status?: string;
      kr: Array<{
        id: string;
        description: string;
        baseline: string;
        target: string;
        metric: string;
        owner: string;
        priority: string;
      }>;
    }
  >
): Promise<number> {
  const admin = createAdminClient();
  let created = 0;

  for (const [objectiveKey, objective] of Object.entries(okrData)) {
    // Check if parent objective goal already exists
    const { data: existingObjective } = await admin
      .from("company_goals")
      .select("id")
      .eq("title", objective.title)
      .maybeSingle();

    let parentGoalId: string | null = null;

    if (!existingObjective) {
      // Create the objective as a parent goal
      const { data: parentGoal, error: parentError } = await admin
        .from("company_goals")
        .insert({
          title: objective.title,
          description: objective.rationale ?? null,
          metric: `${objectiveKey}_completion`,
          target_value: 100,
          current_value: 0,
          unit: "%",
          department: "strategy",
          status: objective.status === "at_risk" ? "at_risk" : "active",
          check_interval_minutes: 60,
          value_history: [],
          tags: ["okr", objectiveKey],
          metadata: { source: "strategy/status.json" },
        })
        .select("id")
        .single();

      if (parentError) {
        console.error(
          `[COSCIENZA] Error seeding objective "${objective.title}":`,
          parentError.message
        );
        continue;
      }

      parentGoalId = parentGoal!.id as string;
      created++;
    } else {
      parentGoalId = existingObjective.id as string;
    }

    // Create KR goals under the objective
    for (const kr of objective.kr) {
      const krTitle = `${kr.id}: ${kr.description}`;

      const { data: existingKr } = await admin
        .from("company_goals")
        .select("id")
        .eq("title", krTitle)
        .maybeSingle();

      if (existingKr) continue; // Already seeded

      // Parse target value from metric string (best effort)
      const targetValue = parseTargetFromMetric(kr.target);

      const { error: krError } = await admin.from("company_goals").insert({
        title: krTitle,
        description: `${kr.description}\n\nBaseline: ${kr.baseline}\nTarget: ${kr.target}`,
        metric: kr.metric,
        target_value: targetValue,
        current_value: 0,
        unit: kr.target.includes("%") ? "%" : "count",
        department: kr.owner.split(" + ")[0], // Take first department if multi-owner
        owner_agent: kr.owner,
        status: "active",
        check_interval_minutes: 120, // Check KRs every 2 hours
        value_history: [],
        parent_goal_id: parentGoalId,
        tags: ["okr", objectiveKey, kr.id.toLowerCase(), kr.priority],
        metadata: {
          source: "strategy/status.json",
          krId: kr.id,
          priority: kr.priority,
          baseline: kr.baseline,
        },
        actions_if_behind: [
          {
            action: `Review progress on ${kr.id}: ${kr.description}`,
            triggerThreshold: 0.3,
            escalationLevel: "L1",
          },
          {
            action: `Escalate to CME: ${kr.id} significantly behind target`,
            triggerThreshold: 0.15,
            escalationLevel: "L2",
          },
        ],
      });

      if (krError) {
        console.error(
          `[COSCIENZA] Error seeding KR "${krTitle}":`,
          krError.message
        );
        continue;
      }

      created++;
    }
  }

  console.log(
    `[COSCIENZA] Seeded ${created} goals from OKR data (${Object.keys(okrData).length} objectives)`
  );
  return created;
}

// ─── Helpers ───

/**
 * Parse a numeric target from an OKR target string.
 * Best-effort extraction; returns 100 as default.
 *
 * Examples:
 *   ">= 80%" => 80
 *   ">= 400 articoli" => 400
 *   ">= 1 utente" => 1
 *   ">= 20 analisi" => 20
 *   ">= 4 articoli SEO" => 4
 */
function parseTargetFromMetric(target: string): number {
  const match = target.match(/(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 100;
}

function mapGoalRow(row: Record<string, unknown>): CompanyGoal {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) ?? null,
    metric: row.metric as string,
    targetValue: Number(row.target_value),
    currentValue: Number(row.current_value),
    unit: (row.unit as string) ?? "",
    department: row.department as string,
    ownerAgent: (row.owner_agent as string) ?? null,
    deadline: (row.deadline as string) ?? null,
    status: row.status as GoalStatus,
    actionsIfBehind: (row.actions_if_behind as GoalAction[]) ?? [],
    lastCheckedAt: (row.last_checked_at as string) ?? null,
    checkIntervalMinutes: (row.check_interval_minutes as number) ?? 60,
    valueHistory: (row.value_history as GoalValueEntry[]) ?? [],
    parentGoalId: (row.parent_goal_id as string) ?? null,
    tags: (row.tags as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
