import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { auth, profiles } from "@/lib/db";

export async function POST() {
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe non configurato" },
      { status: 500 }
    );
  }

  const user = await auth.getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Devi effettuare il login" },
      { status: 401 }
    );
  }

  const profile = await profiles.getProfile(user.id);

  if (!profile?.stripeCustomerId) {
    return NextResponse.json(
      { error: "Nessun abbonamento attivo" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${appUrl}/pricing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
