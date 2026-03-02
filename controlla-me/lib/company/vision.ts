/**
 * Company Vision/Mission — CRUD via Supabase admin client.
 * Used by API routes (not scripts — see scripts/lib/company-vision.ts for CLI usage).
 */

import { createAdminClient } from "@/lib/supabase/admin";

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
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_vision")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[vision] Error reading vision:", error.message);
    return null;
  }
  return data as CompanyVision | null;
}

/**
 * Update (upsert) the company vision/mission.
 */
export async function upsertVision(
  updates: Partial<Pick<CompanyVision, "vision" | "mission" | "priorities">>,
  updatedBy = "boss"
): Promise<CompanyVision | null> {
  const admin = createAdminClient();
  const current = await getVision();

  if (current) {
    const { data, error } = await admin
      .from("company_vision")
      .update({ ...updates, updated_at: new Date().toISOString(), updated_by: updatedBy })
      .eq("id", current.id)
      .select()
      .single();
    if (error) { console.error("[vision] Update error:", error.message); return null; }
    return data as CompanyVision;
  } else {
    // First time: insert
    const { data, error } = await admin
      .from("company_vision")
      .insert({
        vision: updates.vision ?? "",
        mission: updates.mission ?? "",
        priorities: updates.priorities ?? [],
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .select()
      .single();
    if (error) { console.error("[vision] Insert error:", error.message); return null; }
    return data as CompanyVision;
  }
}

/**
 * Get the latest scheduler plan.
 */
export async function getLatestPlan(): Promise<SchedulerPlan | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduler_plans")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as SchedulerPlan;
}
