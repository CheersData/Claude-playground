/**
 * Company Vision/Mission — read/write from Supabase.
 * Used by company-scheduler-daemon and daily-standup to generate vision-driven plans.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getClient() {
  return createClient(supabaseUrl, supabaseKey);
}

export interface CompanyVision {
  id: string;
  vision: string;
  mission: string;
  priorities: string[];
  updated_at: string;
  updated_by: string;
}

export interface SchedulerPlan {
  id: string;
  plan_date: string;
  plan_number: number;
  status: "pending" | "approved" | "modified" | "cancelled";
  plan_content: Record<string, unknown>;
  vision_snapshot: string | null;
  mission_snapshot: string | null;
  recommendations: string[];
  boss_feedback: string | null;
  approved_at: string | null;
  created_at: string;
}

/**
 * Get the current company vision/mission (singleton row).
 */
export async function getVision(): Promise<CompanyVision | null> {
  const sb = getClient();
  const { data, error } = await sb
    .from("company_vision")
    .select("*")
    .limit(1)
    .single();

  if (error) {
    console.error("[vision] Error reading vision:", error.message);
    return null;
  }
  return data as CompanyVision;
}

/**
 * Update the company vision/mission.
 */
export async function updateVision(
  updates: Partial<Pick<CompanyVision, "vision" | "mission" | "priorities">>,
  updatedBy = "boss"
): Promise<boolean> {
  const sb = getClient();
  const current = await getVision();
  if (!current) return false;

  const { error } = await sb
    .from("company_vision")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("id", current.id);

  if (error) {
    console.error("[vision] Error updating vision:", error.message);
    return false;
  }
  return true;
}

/**
 * Save a scheduler plan to the audit trail.
 */
export async function savePlan(plan: {
  plan_content: Record<string, unknown>;
  vision_snapshot?: string;
  mission_snapshot?: string;
  recommendations?: string[];
  plan_number?: number;
}): Promise<string | null> {
  const sb = getClient();
  const { data, error } = await sb
    .from("scheduler_plans")
    .insert({
      plan_content: plan.plan_content,
      vision_snapshot: plan.vision_snapshot ?? null,
      mission_snapshot: plan.mission_snapshot ?? null,
      recommendations: plan.recommendations ?? [],
      plan_number: plan.plan_number ?? 1,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[vision] Error saving plan:", error.message);
    return null;
  }
  return data.id;
}

/**
 * Update a plan's status (approve, modify, cancel).
 */
export async function updatePlanStatus(
  planId: string,
  status: "approved" | "modified" | "cancelled",
  feedback?: string
): Promise<boolean> {
  const sb = getClient();
  const updates: Record<string, unknown> = { status };
  if (status === "approved") {
    updates.approved_at = new Date().toISOString();
  }
  if (feedback) {
    updates.boss_feedback = feedback;
  }

  const { error } = await sb
    .from("scheduler_plans")
    .update(updates)
    .eq("id", planId);

  if (error) {
    console.error("[vision] Error updating plan:", error.message);
    return false;
  }
  return true;
}

/**
 * Get the latest approved plan's recommendations (for next plan generation).
 */
export async function getLatestRecommendations(): Promise<string[]> {
  const sb = getClient();
  const { data, error } = await sb
    .from("scheduler_plans")
    .select("recommendations")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return [];
  return (data.recommendations as string[]) || [];
}

/**
 * Log a protocol routing decision to the audit trail.
 */
export async function logDecision(decision: {
  task_id?: string;
  request_summary: string;
  decision_tree?: string;
  routing_type: "operativo" | "strategico" | "critico";
  approval_level: "L1" | "L2" | "L3" | "L4";
  departments_consulted?: string[];
  decision: string;
  decided_by?: string;
  rationale?: string;
}): Promise<boolean> {
  const sb = getClient();
  const { error } = await sb.from("decision_audit_log").insert({
    task_id: decision.task_id ?? null,
    request_summary: decision.request_summary,
    decision_tree: decision.decision_tree ?? null,
    routing_type: decision.routing_type,
    approval_level: decision.approval_level,
    departments_consulted: decision.departments_consulted ?? [],
    decision: decision.decision,
    decided_by: decision.decided_by ?? "cme",
    rationale: decision.rationale ?? null,
  });

  if (error) {
    console.error("[vision] Error logging decision:", error.message);
    return false;
  }
  return true;
}

/**
 * Build the vision context string for plan generation prompts.
 * Includes vision, mission, priorities, and last plan recommendations.
 */
export async function buildVisionContext(): Promise<string> {
  const vision = await getVision();
  const recommendations = await getLatestRecommendations();

  if (!vision) {
    return "⚠️ Vision/Mission non configurata. Usa /ops per impostarla.";
  }

  const parts = [
    `## Vision aziendale\n${vision.vision}`,
    `\n## Mission corrente\n${vision.mission}`,
  ];

  if (vision.priorities.length > 0) {
    parts.push(
      `\n## Priorità strategiche\n${vision.priorities.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
    );
  }

  if (recommendations.length > 0) {
    parts.push(
      `\n## Raccomandazioni dal piano precedente\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}`
    );
  }

  parts.push(`\n_Aggiornato: ${vision.updated_at} da ${vision.updated_by}_`);

  return parts.join("\n");
}
