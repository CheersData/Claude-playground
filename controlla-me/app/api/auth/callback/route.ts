import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { recordProfileEvent } from "@/lib/cdp/profile-builder";

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req);
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // CDP: record login event (fire-and-forget, non blocca redirect)
      supabase.auth.getUser().then(({ data }) => {
        if (data?.user?.id) {
          recordProfileEvent(data.user.id, "login", {}).catch((err) =>
            console.error("[CDP] login event failed:", err)
          );
        }
      }).catch(() => {});

      return NextResponse.redirect(new URL(next, req.url));
    }
  }

  return NextResponse.redirect(new URL("/", req.url));
}
