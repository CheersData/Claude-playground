import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { requireAuth, isAuthError, type AuthResult } from "@/lib/middleware/auth";

export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe non configurato" },
      { status: 500 }
    );
  }

  // Auth centralizzato (SEC-002)
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult as NextResponse;
  const { user } = authResult as AuthResult;

  // Rate limit anti-abuse pagamenti (SEC-003)
  const limited = checkRateLimit(req, user.id);
  if (limited) return limited;

  // Get the user's stripe_customer_id from their profile
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "Nessun abbonamento attivo" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/pricing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
