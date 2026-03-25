/**
 * Admin API — Role Management
 *
 * GET  /api/admin/roles — List all users with roles (admin+ only)
 * PATCH /api/admin/roles — Update a user's role (admin+ only, with restrictions)
 *
 * Authorization rules:
 * - boss can promote anyone to any role (including admin)
 * - admin can promote users to operator, but NOT to admin or boss
 * - admin cannot change another admin's or boss's role
 * - nobody can modify their own role
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  isAuthError,
  ROLE_HIERARCHY,
  roleLevel,
} from "@/lib/middleware/auth";
import type { AppRole } from "@/lib/middleware/auth";
import { checkRateLimit } from "@/lib/middleware/rate-limit";
import { checkCsrf } from "@/lib/middleware/csrf";
import { listProfilesWithRoles, updateUserRole } from "@/lib/db/profiles";

export async function GET(req: NextRequest) {
  // Rate limit
  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  // Require admin+
  const auth = await requireRole("admin");
  if (isAuthError(auth)) return auth;

  const profiles = await listProfilesWithRoles();

  return NextResponse.json({ profiles });
}

export async function PATCH(req: NextRequest) {
  // CSRF protection
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  // Rate limit
  const rateLimitResult = await checkRateLimit(req);
  if (rateLimitResult) return rateLimitResult;

  // Require admin+
  const auth = await requireRole("admin");
  if (isAuthError(auth)) return auth;

  let body: { userId?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body JSON non valido" },
      { status: 400 }
    );
  }

  const { userId, role } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json(
      { error: "userId è obbligatorio" },
      { status: 400 }
    );
  }

  const validRoles = ROLE_HIERARCHY as readonly string[];
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json(
      { error: `Ruolo non valido. Valori ammessi: ${ROLE_HIERARCHY.join(", ")}` },
      { status: 400 }
    );
  }

  const targetRole = role as AppRole;
  const callerRole = auth.role;

  // Self-modification check
  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: "Non puoi modificare il tuo stesso ruolo" },
      { status: 403 }
    );
  }

  // Authorization rules based on caller's role
  if (callerRole === "admin") {
    // Admin can only set user or operator
    if (roleLevel(targetRole) >= roleLevel("admin")) {
      return NextResponse.json(
        { error: "Solo il boss può promuovere ad admin o boss" },
        { status: 403 }
      );
    }
  }

  // Only boss can set boss role
  if (targetRole === "boss" && callerRole !== "boss") {
    return NextResponse.json(
      { error: "Solo il boss può assegnare il ruolo boss" },
      { status: 403 }
    );
  }

  const result = await updateUserRole(userId, targetRole);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? "Errore aggiornamento ruolo" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    userId,
    role: targetRole,
  });
}
