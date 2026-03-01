import { describe, it, expect, vi, beforeEach } from "vitest";
import { isAuthError } from "@/lib/middleware/auth";
import { NextResponse } from "next/server";
import type { AuthResult } from "@/lib/middleware/auth";

/**
 * Test per le utility auth che NON richiedono Supabase.
 *
 * La funzione requireAuth() dipende dal client Supabase server-side,
 * che a sua volta richiede cookies/headers di Next.js.
 * Questi test coprono la logica pura e il type-guard isAuthError().
 *
 * I test di integrazione per requireAuth() vivono in tests/integration/.
 */

describe("isAuthError", () => {
  it("ritorna true per una NextResponse (errore auth)", () => {
    const response = NextResponse.json({ error: "non autorizzato" }, { status: 401 });
    expect(isAuthError(response)).toBe(true);
  });

  it("ritorna false per un AuthResult valido", () => {
    const authResult: AuthResult = {
      user: { id: "user-123", email: "marco@example.com" },
    };
    expect(isAuthError(authResult)).toBe(false);
  });

  it("ritorna false per un oggetto con user", () => {
    const obj = { user: { id: "x", email: "y" } };
    expect(isAuthError(obj as AuthResult)).toBe(false);
  });

  it("ritorna true per qualsiasi NextResponse (200, 403, 500)", () => {
    expect(isAuthError(NextResponse.json({}, { status: 200 }))).toBe(true);
    expect(isAuthError(NextResponse.json({}, { status: 403 }))).toBe(true);
    expect(isAuthError(NextResponse.json({}, { status: 500 }))).toBe(true);
  });
});

describe("AuthResult interface", () => {
  it("ha la struttura corretta", () => {
    const auth: AuthResult = {
      user: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        email: "test@controlla.me",
      },
    };
    expect(auth.user.id).toBeTruthy();
    expect(auth.user.email).toContain("@");
  });
});
