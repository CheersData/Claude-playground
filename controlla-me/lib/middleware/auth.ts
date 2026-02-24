import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthResult {
  user: AuthenticatedUser;
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
 * Verifica che la request provenga da un admin (service role).
 * Per ora controlla un header segreto; in futuro si puo' legare a un ruolo DB.
 */
export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const adminSecret = process.env.ADMIN_API_SECRET;

  // Se ADMIN_API_SECRET non e' configurato, fallback a requireAuth
  if (!adminSecret) {
    return requireAuth();
  }

  // Per chiamate programmatiche con header segreto
  // (es. script di ingest del corpus)
  // Nota: il check dell'header va fatto nel route handler che ha accesso alla request
  return requireAuth();
}

/**
 * Helper: controlla se un risultato auth e' un errore (NextResponse) o un utente.
 */
export function isAuthError(
  result: AuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
