import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyToken } from "@/lib/middleware/console-token";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
}

/**
 * Role hierarchy — higher index = more privileges.
 * Used by requireRole() for "at least this role" checks.
 * creator sits between operator and admin (L1 creative access).
 */
export const ROLE_HIERARCHY = ["user", "operator", "creator", "admin", "boss"] as const;
export type AppRole = (typeof ROLE_HIERARCHY)[number];

/**
 * Returns the numeric level for a role (0=user, 3=boss).
 * Unknown roles default to 0 (user).
 */
export function roleLevel(role: string): number {
  const idx = ROLE_HIERARCHY.indexOf(role as AppRole);
  return idx >= 0 ? idx : 0;
}

/**
 * Verifica che la request provenga da un utente autenticato.
 * Restituisce l'utente oppure una NextResponse 401.
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Autenticazione richiesta" },
        { status: 401 }
      );
    }

    return {
      user: {
        id: user.id,
        email: user.email ?? "",
      },
    };
  } catch {
    return NextResponse.json(
      { error: "Errore di autenticazione" },
      { status: 401 }
    );
  }
}

/**
 * Verifica che la request provenga da un admin (role >= 'admin').
 * Uses the RBAC role system: checks profiles.role via getUserRole().
 * Returns AuthResult on success, 401/403 NextResponse on failure.
 */
export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const role = await getUserRole(authResult.user.id);
  if (roleLevel(role) >= roleLevel("admin")) {
    return authResult;
  }

  return NextResponse.json(
    { error: "Permessi di amministratore richiesti" },
    { status: 403 }
  );
}

/**
 * Helper: controlla se un risultato auth e' un errore (NextResponse) o un utente.
 */
export function isAuthError(
  result: AuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}

// ─── RBAC Utilities ───

/**
 * Fetches the user's role from the profiles table.
 * Returns 'user' as fallback if:
 * - the role column doesn't exist yet (pre-migration 044)
 * - the user has no profile row
 * - any DB error occurs
 *
 * Uses service_role client to bypass RLS for reliable reads.
 */
export async function getUserRole(userId: string): Promise<AppRole> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error || !data) return "user";

    const role = data.role as string;
    // Validate it's a known role
    if (ROLE_HIERARCHY.includes(role as AppRole)) {
      return role as AppRole;
    }
    return "user";
  } catch {
    // Column might not exist yet (pre-migration) — fallback gracefully
    return "user";
  }
}

/**
 * Fetches permissions for a given role from role_permissions table.
 * Returns empty array on error or if table doesn't exist (pre-migration).
 */
export async function getRolePermissions(role: AppRole): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("role_permissions")
      .select("permission")
      .eq("role", role);

    if (error || !data) return [];
    return data.map((row) => row.permission as string);
  } catch {
    return [];
  }
}

/**
 * Checks if a role has a specific permission.
 * Wildcard '*' grants all permissions.
 */
export function hasPermission(
  permissions: string[],
  required: string
): boolean {
  return permissions.includes("*") || permissions.includes(required);
}

/**
 * Middleware: requires the authenticated user to have at least `minRole`.
 * Uses role hierarchy: boss > admin > operator > user.
 *
 * Returns { user, role, permissions } on success, or a NextResponse 403 on failure.
 */
export async function requireRole(minRole: AppRole): Promise<
  | {
      user: AuthenticatedUser;
      role: AppRole;
      permissions: string[];
    }
  | NextResponse
> {
  // First, authenticate
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { user } = authResult;
  const role = await getUserRole(user.id);

  if (roleLevel(role) < roleLevel(minRole)) {
    return NextResponse.json(
      {
        error: "Permessi insufficienti",
        required: minRole,
        current: role,
      },
      { status: 403 }
    );
  }

  const permissions = await getRolePermissions(role);
  return { user, role, permissions };
}

/**
 * Middleware: requires the authenticated user to have a specific permission string.
 * Checks via role_permissions table. Wildcard '*' matches everything.
 *
 * Returns { user, role, permissions } on success, or a NextResponse 403 on failure.
 */
export async function requirePermission(permission: string): Promise<
  | {
      user: AuthenticatedUser;
      role: AppRole;
      permissions: string[];
    }
  | NextResponse
> {
  // First, authenticate
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const { user } = authResult;
  const role = await getUserRole(user.id);
  const permissions = await getRolePermissions(role);

  if (!hasPermission(permissions, permission)) {
    return NextResponse.json(
      {
        error: "Permesso non concesso",
        required: permission,
        role,
      },
      { status: 403 }
    );
  }

  return { user, role, permissions };
}

// ─── Creator & Resource Protection Utilities ───

/**
 * Fetches whether a user is active (not deactivated).
 * Returns true by default if the column doesn't exist yet (pre-migration 054).
 * Uses service_role client to bypass RLS.
 */
export async function isUserActive(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("active")
      .eq("id", userId)
      .single();

    if (error || !data) return true; // fallback: treat as active
    // If the column doesn't exist yet, data.active will be undefined -> treat as active
    return data.active !== false;
  } catch {
    return true;
  }
}

/**
 * Middleware: requires the authenticated user to have at least 'creator' role AND be active.
 * Creator accounts can be deactivated by boss — deactivated creators get 403.
 *
 * Returns { user, role, permissions } on success, or a NextResponse 401/403 on failure.
 */
export async function requireCreatorAuth(): Promise<
  | {
      user: AuthenticatedUser;
      role: AppRole;
      permissions: string[];
    }
  | NextResponse
> {
  // Path 1: Try Supabase session auth
  const authResult = await requireAuth();
  if (!isAuthError(authResult)) {
    const { user } = authResult;
    const role = await getUserRole(user.id);

    if (roleLevel(role) < roleLevel("creator")) {
      return NextResponse.json(
        {
          error: "Permessi di creator richiesti",
          required: "creator",
          current: role,
        },
        { status: 403 }
      );
    }

    const active = await isUserActive(user.id);
    if (!active) {
      return NextResponse.json(
        {
          error: "Account disattivato. Contattare un amministratore.",
          current: role,
        },
        { status: 403 }
      );
    }

    const permissions = await getRolePermissions(role);
    return { user, role, permissions };
  }

  // Path 2: Try HMAC console token (whitelist login — used by /creator)
  try {
    const hdrs = await headers();
    const auth = hdrs.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const payload = verifyToken(auth.slice(7));
      if (payload && roleLevel(payload.role) >= roleLevel("creator")) {
        const permissions = payload.permissions || [];
        return {
          user: {
            id: payload.sid || "console",
            email: "",
          },
          role: payload.role as AppRole,
          permissions,
        };
      }
    }
  } catch {
    // token invalid — fall through to 401
  }

  return NextResponse.json(
    { error: "Autenticazione richiesta" },
    { status: 401 }
  );
}

/**
 * Checks if a resource is protected (e.g., boss-owned departments, system resources).
 * A protected resource cannot be modified or deleted by creators.
 *
 * @param resourceId - The UUID of the resource to check
 * @param table - The table name to check (default: 'company_departments')
 * @returns true if the resource has protected=true
 */
export async function isResourceProtected(
  resourceId: string,
  table: string = "company_departments"
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from(table)
      .select("protected")
      .eq("id", resourceId)
      .single();

    if (error || !data) return false;
    return data.protected === true;
  } catch {
    return false;
  }
}

/**
 * Determines if a user can modify a resource based on ownership and protection status.
 *
 * Rules:
 * - Protected resources: only boss can modify
 * - Unprotected resources: owner can modify, OR boss/admin can modify
 *
 * @param userId - The ID of the user attempting the modification
 * @param userRole - The role of the user attempting the modification
 * @param resourceOwnerId - The ID of the resource owner (created_by)
 * @param isProtected - Whether the resource has the protected flag
 * @returns true if the user is allowed to modify the resource
 */
export function canModifyResource(
  userId: string,
  userRole: AppRole,
  resourceOwnerId: string | null,
  isProtected: boolean
): boolean {
  // Boss can modify anything
  if (userRole === "boss") return true;

  // Protected resources: only boss (already handled above)
  if (isProtected) return false;

  // Admin can modify any unprotected resource
  if (userRole === "admin") return true;

  // Creator/operator can only modify their own unprotected resources
  return resourceOwnerId !== null && userId === resourceOwnerId;
}
