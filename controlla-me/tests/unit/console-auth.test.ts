/**
 * Tests: lib/console-auth.ts — Console authentication (RBAC + legacy whitelist).
 *
 * Coverage targets: 188 lines, previously 0%.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const mockSingle = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn().mockReturnValue({ single: mockSingle }));
const mockSelect = vi.hoisted(() => vi.fn().mockReturnValue({ eq: mockEq }));
const mockFrom = vi.hoisted(() => vi.fn().mockReturnValue({ select: mockSelect }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

import {
  authenticateUser,
  parseAuthInput,
  checkConsoleAccessByUserId,
  checkConsoleAccessByEmail,
  AUTHORIZED_USERS,
} from "@/lib/console-auth";

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({ select: mockSelect });
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ single: mockSingle });
  mockSingle.mockResolvedValue({ data: null, error: null });
});

// =============================================================================
// authenticateUser
// =============================================================================

describe("authenticateUser", () => {
  it("returns authorized: true for valid whitelist match", () => {
    const result = authenticateUser("Manuela", "Lo Buono", "Notaio");
    expect(result.authorized).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user!.nome).toBe("Manuela");
  });

  it("returns authorized: true for Boss", () => {
    const result = authenticateUser("Boss", "Boss", "Boss");
    expect(result.authorized).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = authenticateUser("manuela", "lo buono", "notaio");
    expect(result.authorized).toBe(true);
  });

  it("trims whitespace", () => {
    const result = authenticateUser("  Manuela  ", " Lo Buono ", " Notaio ");
    expect(result.authorized).toBe(true);
  });

  it("returns authorized: false for non-matching user", () => {
    const result = authenticateUser("Unknown", "Person", "Admin");
    expect(result.authorized).toBe(false);
    expect(result.user).toBeUndefined();
  });

  it("returns authorized: false for partial match (wrong role)", () => {
    const result = authenticateUser("Manuela", "Lo Buono", "Admin");
    expect(result.authorized).toBe(false);
  });

  it("returns authorized: false for partial match (wrong name)", () => {
    const result = authenticateUser("Marco", "Lo Buono", "Notaio");
    expect(result.authorized).toBe(false);
  });
});

// =============================================================================
// parseAuthInput
// =============================================================================

describe("parseAuthInput", () => {
  it("returns null for empty string", () => {
    expect(parseAuthInput("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(parseAuthInput("   ")).toBeNull();
  });

  it("parses comma-separated format: 'Nome Cognome, Ruolo'", () => {
    const result = parseAuthInput("Manuela Lo Buono, Notaio");
    expect(result).toEqual({
      nome: "Manuela",
      cognome: "Lo Buono",
      ruolo: "Notaio",
    });
  });

  it("parses role-first format: 'Notaio Manuela Lo Buono'", () => {
    const result = parseAuthInput("Notaio Manuela Lo Buono");
    expect(result).toEqual({
      ruolo: "Notaio",
      nome: "Manuela",
      cognome: "Lo Buono",
    });
  });

  it("parses role-last format: 'Manuela Lo Buono Notaio'", () => {
    const result = parseAuthInput("Manuela Lo Buono Notaio");
    expect(result).toEqual({
      nome: "Manuela",
      cognome: "Lo Buono",
      ruolo: "Notaio",
    });
  });

  it("falls back to first=nome, middle=cognome, last=ruolo for unknown roles", () => {
    const result = parseAuthInput("John Doe Manager");
    expect(result).toEqual({
      nome: "John",
      cognome: "Doe",
      ruolo: "Manager",
    });
  });

  it("handles 2-word input matching a whitelist user", () => {
    const result = parseAuthInput("Boss Boss");
    expect(result).toEqual({
      nome: "Boss",
      cognome: "Boss",
      ruolo: "Boss",
    });
  });

  it("returns null for 2-word input not matching whitelist", () => {
    const result = parseAuthInput("John Doe");
    expect(result).toBeNull();
  });

  it("returns null for single word input", () => {
    const result = parseAuthInput("Manuela");
    expect(result).toBeNull();
  });
});

// =============================================================================
// checkConsoleAccessByUserId
// =============================================================================

describe("checkConsoleAccessByUserId", () => {
  it("returns authorized: true for admin role", async () => {
    mockSingle.mockResolvedValue({ data: { role: "admin", active: true }, error: null });

    const result = await checkConsoleAccessByUserId("user-1");
    expect(result.authorized).toBe(true);
    expect(result.role).toBe("admin");
    expect(result.active).toBe(true);
  });

  it("returns authorized: true for operator role", async () => {
    mockSingle.mockResolvedValue({ data: { role: "operator", active: true }, error: null });

    const result = await checkConsoleAccessByUserId("user-1");
    expect(result.authorized).toBe(true);
    expect(result.role).toBe("operator");
  });

  it("returns authorized: false for user role", async () => {
    mockSingle.mockResolvedValue({ data: { role: "user", active: true }, error: null });

    const result = await checkConsoleAccessByUserId("user-1");
    expect(result.authorized).toBe(false);
    expect(result.role).toBe("user");
  });

  it("returns authorized: false when profile not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { message: "not found" } });

    const result = await checkConsoleAccessByUserId("user-missing");
    expect(result.authorized).toBe(false);
    expect(result.role).toBe("user");
  });

  it("returns authorized: false for deactivated admin", async () => {
    mockSingle.mockResolvedValue({ data: { role: "admin", active: false }, error: null });

    const result = await checkConsoleAccessByUserId("user-deactivated");
    expect(result.authorized).toBe(false);
    expect(result.active).toBe(false);
  });

  it("treats null active as active (backward compat)", async () => {
    mockSingle.mockResolvedValue({ data: { role: "admin", active: null }, error: null });

    const result = await checkConsoleAccessByUserId("user-1");
    expect(result.authorized).toBe(true);
    expect(result.active).toBe(true);
  });

  it("returns default on exception", async () => {
    mockSingle.mockRejectedValue(new Error("connection timeout"));

    const result = await checkConsoleAccessByUserId("user-1");
    expect(result.authorized).toBe(false);
    expect(result.role).toBe("user");
  });

  it("defaults to 'user' role when data.role is null", async () => {
    mockSingle.mockResolvedValue({ data: { role: null, active: true }, error: null });

    const result = await checkConsoleAccessByUserId("user-1");
    expect(result.authorized).toBe(false);
    expect(result.role).toBe("user");
  });
});

// =============================================================================
// checkConsoleAccessByEmail
// =============================================================================

describe("checkConsoleAccessByEmail", () => {
  it("returns authorized: true for admin with matching email", async () => {
    mockSingle.mockResolvedValue({ data: { role: "admin", active: true }, error: null });

    const result = await checkConsoleAccessByEmail("admin@test.com");
    expect(result.authorized).toBe(true);
    expect(result.role).toBe("admin");
  });

  it("returns authorized: false when email not found", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const result = await checkConsoleAccessByEmail("unknown@test.com");
    expect(result.authorized).toBe(false);
  });

  it("queries profiles by email field", async () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    await checkConsoleAccessByEmail("test@test.com");
    expect(mockEq).toHaveBeenCalledWith("email", "test@test.com");
  });

  it("returns default on exception", async () => {
    mockSingle.mockRejectedValue(new Error("DB error"));

    const result = await checkConsoleAccessByEmail("test@test.com");
    expect(result.authorized).toBe(false);
    expect(result.role).toBe("user");
  });

  it("returns authorized: false for deactivated operator", async () => {
    mockSingle.mockResolvedValue({ data: { role: "operator", active: false }, error: null });

    const result = await checkConsoleAccessByEmail("op@test.com");
    expect(result.authorized).toBe(false);
    expect(result.active).toBe(false);
  });
});

// =============================================================================
// AUTHORIZED_USERS constant
// =============================================================================

describe("AUTHORIZED_USERS", () => {
  it("contains at least 2 users", () => {
    expect(AUTHORIZED_USERS.length).toBeGreaterThanOrEqual(2);
  });

  it("each user has nome, cognome, and ruolo", () => {
    for (const user of AUTHORIZED_USERS) {
      expect(user.nome).toBeTruthy();
      expect(user.cognome).toBeTruthy();
      expect(user.ruolo).toBeTruthy();
    }
  });
});
