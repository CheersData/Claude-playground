import { NextResponse } from "next/server";
import { auth, profiles } from "@/lib/db";
import { PLANS } from "@/lib/stripe";

export async function GET() {
  const user = await auth.getAuthenticatedUser();

  // Not logged in — anonymous users get free tier limits
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      plan: "free" as const,
      analysesUsed: 0,
      analysesLimit: PLANS.free.analysesPerMonth,
      canAnalyze: true,
    });
  }

  const profile = await profiles.getProfile(user.id);

  const plan = profile?.plan ?? "free";
  const analysesUsed = profile?.analysesCount ?? 0;
  const limit = plan === "pro" ? Infinity : PLANS.free.analysesPerMonth;
  const canAnalyze = plan === "pro" || analysesUsed < limit;

  return NextResponse.json({
    authenticated: true,
    plan,
    analysesUsed,
    analysesLimit: limit,
    canAnalyze,
  });
}
