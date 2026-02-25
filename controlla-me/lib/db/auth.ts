/**
 * DAL — Auth
 *
 * Wraps Supabase auth. Server-side only (uses cookie-based session).
 */

import { createClient } from "../supabase/server";

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Get the authenticated user from the current request cookies.
 * Returns null if not authenticated (graceful degradation).
 */
export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) return null;

  return { id: user.id, email: user.email };
}
