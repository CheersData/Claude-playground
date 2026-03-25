/**
 * Tests: lib/middleware/vault-middleware.ts — Vault middleware helpers.
 *
 * Coverage targets: 116 lines, previously 0%.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockGetVault = vi.hoisted(() => vi.fn());
const mockCheckVaultHealth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: mockIsAuthError,
}));

vi.mock("@/lib/credential-vault", () => ({
  getVault: mockGetVault,
  checkVaultHealth: mockCheckVaultHealth,
}));

import { requireVault, withVaultAuth, isVaultError } from "@/lib/middleware/vault-middleware";

// ── Setup ────────────────────────────────────────────────────────────────────

const mockVaultInstance = { storeCredential: vi.fn(), getCredential: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetVault.mockReturnValue(mockVaultInstance);
  mockCheckVaultHealth.mockResolvedValue({ ok: true });
  mockRequireAuth.mockResolvedValue({ user: { id: "user-1", email: "test@test.com" } });
  mockIsAuthError.mockReturnValue(false);
});

// =============================================================================
// requireVault
// =============================================================================

describe("requireVault", () => {
  it("returns vault context when vault is healthy", async () => {
    const result = await requireVault();
    expect(result).not.toBeInstanceOf(NextResponse);
    expect((result as { vault: unknown }).vault).toBe(mockVaultInstance);
  });

  it("returns 503 when vault health check fails", async () => {
    mockCheckVaultHealth.mockResolvedValue({ ok: false, error: "migration missing" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requireVault();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(503);

    consoleSpy.mockRestore();
  });

  it("returns 503 when getVault throws (no VAULT_ENCRYPTION_KEY)", async () => {
    mockGetVault.mockImplementation(() => { throw new Error("VAULT_ENCRYPTION_KEY not set"); });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await requireVault();
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(503);

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// withVaultAuth
// =============================================================================

describe("withVaultAuth", () => {
  const dummyReq = new NextRequest("http://localhost:3000/api/test", { method: "POST" });

  it("returns user + vault when both auth and vault succeed", async () => {
    const result = await withVaultAuth(dummyReq);
    expect(result).not.toBeInstanceOf(NextResponse);
    const ctx = result as { user: { id: string }; vault: unknown };
    expect(ctx.user.id).toBe("user-1");
    expect(ctx.vault).toBe(mockVaultInstance);
  });

  it("returns 401 when auth fails", async () => {
    const authError = NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    mockRequireAuth.mockResolvedValue(authError);
    mockIsAuthError.mockReturnValue(true);

    const result = await withVaultAuth(dummyReq);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(401);
  });

  it("returns 503 when vault is unavailable (auth succeeds)", async () => {
    mockGetVault.mockImplementation(() => { throw new Error("no vault"); });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await withVaultAuth(dummyReq);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(503);

    consoleSpy.mockRestore();
  });

  it("checks auth before vault (auth error stops early)", async () => {
    const authError = NextResponse.json({ error: "Auth failed" }, { status: 401 });
    mockRequireAuth.mockResolvedValue(authError);
    mockIsAuthError.mockReturnValue(true);

    await withVaultAuth(dummyReq);
    // Vault should not be called when auth fails
    expect(mockGetVault).not.toHaveBeenCalled();
  });
});

// =============================================================================
// isVaultError
// =============================================================================

describe("isVaultError", () => {
  it("returns true for NextResponse", () => {
    const response = NextResponse.json({ error: "test" }, { status: 503 });
    expect(isVaultError(response)).toBe(true);
  });

  it("returns false for VaultAuthContext", () => {
    const ctx = { user: { id: "u1", email: "e" }, vault: mockVaultInstance } as any;
    expect(isVaultError(ctx)).toBe(false);
  });
});
