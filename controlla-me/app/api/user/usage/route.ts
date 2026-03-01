import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

export async function GET(req: NextRequest) {
  // Rate limit per IP (route pubblica — anche anonimi possono chiamarla)
  const limited = await checkRateLimit(req);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, analyses_count")
    .eq("id", user.id)
    .single();

  const plan = (profile?.plan as "free" | "pro") || "free";
  const analysesUsed = profile?.analyses_count ?? 0;
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
