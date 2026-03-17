/**
 * API Route: GET /api/integrations/[connectorId]/records
 *
 * Returns paginated records from crm_records for a specific connector.
 * Query params: ?page=1&pageSize=50&objectType=contact&search=
 *
 * Response: { records, total, page, pageSize, breakdown }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  // Rate limit
  const rateLimited = await checkRateLimit(req);
  if (rateLimited) return rateLimited;

  // Auth
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const userId = authResult.user.id;
  const { connectorId } = await params;
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("pageSize") || "50"))
  );
  const objectType = url.searchParams.get("objectType") || null;
  const search = url.searchParams.get("search") || null;

  const admin = createAdminClient();
  const offset = (page - 1) * pageSize;

  // Build query
  let query = admin
    .from("crm_records")
    .select(
      "id, external_id, object_type, data, mapped_fields, synced_at",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .eq("connector_source", connectorId)
    .order("synced_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (objectType) {
    query = query.eq("object_type", objectType);
  }

  // INT-SEC-003: Sanitize search parameter before using in PostgREST filter.
  // The .or() filter is string-interpolated — special PostgREST characters
  // (%, ., commas) in the user input could alter the filter semantics.
  if (search) {
    // Strip characters that have special meaning in PostgREST filter syntax
    const sanitizedSearch = search
      .replace(/[%_.,()"'\\]/g, "")
      .trim()
      .slice(0, 100);

    if (sanitizedSearch.length > 0) {
      query = query.or(
        `data->>displayName.ilike.%${sanitizedSearch}%,data->>email.ilike.%${sanitizedSearch}%,data->>companyName.ilike.%${sanitizedSearch}%`
      );
    }
  }

  const { data: records, count, error } = await query;

  if (error) {
    console.error("[Records] Query error:", error.message);
    return NextResponse.json(
      { error: "Errore nel recupero dei record" },
      { status: 500 }
    );
  }

  // Entity breakdown (always unfiltered for full picture)
  const { data: breakdownData } = await admin
    .from("crm_records")
    .select("object_type")
    .eq("user_id", userId)
    .eq("connector_source", connectorId);

  const breakdown: Record<string, number> = {};
  if (breakdownData) {
    for (const row of breakdownData) {
      const t = row.object_type as string;
      breakdown[t] = (breakdown[t] || 0) + 1;
    }
  }

  return NextResponse.json({
    records: records || [],
    total: count || 0,
    page,
    pageSize,
    breakdown,
  });
}
