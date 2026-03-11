/**
 * DAL — Profiles
 *
 * All queries on the `profiles` table.
 * Uses server client (anon key + RLS) for user-scoped reads,
 * admin client (service_role) for webhook writes and RPC.
 */

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";

export interface Profile {
  plan: "free" | "pro";
  analysesCount: number;
  stripeCustomerId: string | null;
}

/**
 * Get a user's profile (plan, usage, stripe ID).
 * Uses the server client so RLS enforces user_id = auth.uid().
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("plan, analyses_count, stripe_customer_id")
    .eq("id", userId)
    .single();

  if (error || !data) return null;

  return {
    plan: (data.plan as "free" | "pro") || "free",
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
