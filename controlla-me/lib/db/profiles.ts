/**
 * DAL — Profiles
 *
 * All queries on the `profiles` table.
 * Uses server client (anon key + RLS) for user-scoped reads,
 * admin client (service_role) for webhook writes and RPC.
 */

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import type { AppRole } from "../middleware/auth";

export interface Profile {
  plan: "free" | "pro";
  role: AppRole;
  analysesCount: number;
  stripeCustomerId: string | null;
}

/**
 * Get a user's profile (plan, role, usage, stripe ID).
 * Uses the server client so RLS enforces user_id = auth.uid().
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("plan, role, analyses_count, stripe_customer_id")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  return {
    plan: (data.plan as "free" | "pro") || "free",
    role: (data.role as AppRole) || "user",
    analysesCount: data.analyses_count ?? 0,
    stripeCustomerId: data.stripe_customer_id ?? null,
  };
}

/**
 * Update a user's plan and optionally set stripe_customer_id.
 * Uses admin client (called from Stripe webhook, no user session).
 */
export async function updatePlan(
  userId: string,
  plan: "free" | "pro",
  stripeCustomerId?: string
): Promise<void> {
  const admin = createAdminClient();
  const update: Record<string, unknown> = { plan };
  if (stripeCustomerId !== undefined) {
    update.stripe_customer_id = stripeCustomerId;
  }
  await admin.from("profiles").update(update).eq("id", userId);
}

/**
 * Downgrade a user to free by their Stripe customer ID.
 * Used when subscription is deleted or updated to inactive.
 */
export async function downgradeByStripeId(
  stripeCustomerId: string
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ plan: "free" })
    .eq("stripe_customer_id", stripeCustomerId);
}

/**
 * Update plan by Stripe customer ID (for subscription status changes).
 */
export async function updatePlanByStripeId(
  stripeCustomerId: string,
  plan: "free" | "pro"
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ plan })
    .eq("stripe_customer_id", stripeCustomerId);
}

/**
 * Increment the analyses count for a user.
 * Uses admin client (RPC bypasses RLS).
 */
export async function incrementAnalysesCount(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.rpc("increment_analyses_count", { uid: userId });
}

/**
 * Update a user's role.
 * Uses admin client (service_role) to bypass RLS.
 * Caller must verify authorization before invoking.
 */
export async function updateUserRole(
  userId: string,
  role: AppRole
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * List all profiles with roles (for admin panel).
 * Uses admin client to bypass RLS.
 */
export async function listProfilesWithRoles(): Promise<
  Array<{
    id: string;
    email: string;
    full_name: string;
    role: AppRole;
    plan: string;
    created_at: string;
  }>
> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, plan, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    email: row.email ?? "",
    full_name: row.full_name ?? "",
    role: (row.role as AppRole) || "user",
    plan: row.plan ?? "free",
    created_at: row.created_at,
  }));
}
