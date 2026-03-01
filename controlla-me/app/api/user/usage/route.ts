import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/lib/stripe";
import { checkRateLimit } from "@/lib/middleware/rate-limit";

/** Conta le deep search eseguite dall'utente nel mese corrente. */
async function countDeepSearchesThisMonth(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("deep_searches")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonth.toISOString());

  return count ?? 0;
}

export async function GET(req: NextRequest) {
  // Rate limit per IP (route pubblica — anche anonimi possono chiamarla)
  const limited = await checkRateLimit(req);
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in — anonymous users: no deep search allowed (requires login)
  if (!user) {
    return NextResponse.json({
      authenticated: false,
      plan: "free" as const,
      analysesUsed: 0,
      analysesLimit: PLANS.free.analysesPerMonth,
      canAnalyze: true,
      deepSearchUsed: 0,
      deepSearchLimit: PLANS.free.deepSearchLimit,
      canDeepSearch: false,  // richede login
    });
  }

  const [profileRes, deepSearchUsed] = await Promise.all([
    supabase
      .from("profiles")
      .select("plan, analyses_count")
      .eq("id", user.id)
      .single(),
    countDeepSearchesThisMonth(supabase, user.id),
  ]);

  const plan = (profileRes.data?.plan as "free" | "pro") || "free";
  const analysesUsed = profileRes.data?.analyses_count ?? 0;
  const limit = plan === "pro" ? Infinity : PLANS.free.analysesPerMonth;
  const canAnalyze = plan === "pro" || analysesUsed < limit;

  const deepSearchLimit = plan === "pro" ? Infinity : PLANS.free.deepSearchLimit;
  const canDeepSearch = plan === "pro" || deepSearchUsed < deepSearchLimit;

  return NextResponse.json({
    authenticated: true,
    plan,
    analysesUsed,
    analysesLimit: limit,
    canAnalyze,
    deepSearchUsed,
    deepSearchLimit,
    canDeepSearch,
  });
}
