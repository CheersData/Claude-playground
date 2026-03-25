/**
 * Admin API — Department Detail
 *
 * GET /api/admin/departments/[name] — Dettaglio singolo dipartimento per slug
 *
 * Authorization: requireCreatorAuth (role >= creator, active account)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCreatorAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  const auth = await requireCreatorAuth();
  if (isAuthError(auth)) return auth;

  const { name } = await params;

  if (!name || typeof name !== "string") {
    return NextResponse.json(
      { error: "Il parametro 'name' (slug) e obbligatorio" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_departments")
    .select("*")
    .eq("name", name)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: `Dipartimento '${name}' non trovato` },
      { status: 404 }
    );
  }

  return NextResponse.json({ department: data });
}
