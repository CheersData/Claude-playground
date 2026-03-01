import { NextRequest, NextResponse } from "next/server";
import { stripe, PLANS } from "@/lib/stripe";
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

  const { plan } = (await req.json()) as { plan: "pro" | "single" };

  const planConfig = plan === "pro" ? PLANS.pro : PLANS.single;
  const priceId = planConfig.stripePriceId;

  if (!priceId) {
    return NextResponse.json(
      { error: "Price ID non configurato per questo piano" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: plan === "pro" ? "subscription" : "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancel`,
    customer_email: user.email ?? undefined,
    metadata: {
      user_id: user.id,
      plan,
    },
    ...(plan === "pro" && {
      subscription_data: {
        metadata: { user_id: user.id },
      },
    }),
  });

  return NextResponse.json({ url: session.url });
}
