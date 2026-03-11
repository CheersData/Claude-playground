import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { profiles } from "@/lib/db";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { recordProfileEvent } from "@/lib/cdp/profile-builder";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  // Defense-in-depth: rate limit before heavy processing (Stripe signature is primary auth)
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const customerId = session.customer as string;
      const userId = session.metadata?.user_id;

      if (userId) {
        await profiles.updatePlan(userId, "pro", customerId);
        recordProfileEvent(userId, "plan_changed", { to_plan: "pro", trigger: "checkout" }).catch((err) =>
          console.error("[CDP] webhook checkout failed:", err)
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;
      await profiles.downgradeByStripeId(customerId);

      // Lookup userId from stripeCustomerId for CDP event
      const admin1 = createAdminClient();
      const { data: profile1 } = await admin1
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (profile1?.id) {
        recordProfileEvent(profile1.id, "plan_changed", { to_plan: "free", trigger: "subscription_deleted" }).catch((err) =>
          console.error("[CDP] webhook sub_deleted failed:", err)
        );
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;
      const isActive = ["active", "trialing"].includes(subscription.status);
      const newPlan = isActive ? "pro" : "free";
      await profiles.updatePlanByStripeId(customerId, newPlan);

      // Lookup userId from stripeCustomerId for CDP event
      const admin2 = createAdminClient();
      const { data: profile2 } = await admin2
        .from("profiles")
        .select("id")
        .eq("stripe_customer_id", customerId)
        .single();
      if (profile2?.id) {
        recordProfileEvent(profile2.id, "plan_changed", { to_plan: newPlan, trigger: "subscription_updated" }).catch((err) =>
          console.error("[CDP] webhook sub_updated failed:", err)
        );
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
