/**
 * Tests: GET /api/deep-search — Load conversations and messages.
 *
 * Coverage targets: lines 245-346 (GET handler) — previously 0% coverage.
 *
 * Cases:
 * - Auth guard
 * - Rate limit guard
 * - Load messages by conversationId (ownership check, success, error)
 * - Find conversation by analysisId + clauseTitle
 * - List conversations by analysisId
 * - Missing params returns 400
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCreateAdminClient = vi.hoisted(() => vi.fn());

// These mocks are needed but not exercised by GET
const mockCheckCsrf = vi.hoisted(() => vi.fn());
const mockSanitizeUserQuestion = vi.hoisted(() => vi.fn());
const mockRunDeepSearch = vi.hoisted(() => vi.fn());
const mockBroadcastConsoleAgent = vi.hoisted(() => vi.fn());
const mockRecordProfileEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: mockIsAuthError,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock("@/lib/middleware/csrf", () => ({
  checkCsrf: mockCheckCsrf,
}));

vi.mock("@/lib/middleware/sanitize", () => ({
  sanitizeUserQuestion: mockSanitizeUserQuestion,
}));

vi.mock("@/lib/agents/investigator", () => ({
  runDeepSearch: mockRunDeepSearch,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/agent-broadcast", () => ({
  broadcastConsoleAgent: mockBroadcastConsoleAgent,
}));

vi.mock("@/lib/cdp/profile-builder", () => ({
  recordProfileEvent: mockRecordProfileEvent,
}));

// Import AFTER all mocks
import { GET } from "@/app/api/deep-search/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost:3000/api/deep-search");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url, { method: "GET" });
}

const MOCK_AUTH_USER = { user: { id: "user-123", email: "test@test.com" } };

// Chainable mock for Supabase queries
function makeChain(resolveValue: { data: unknown; error: unknown } = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(resolveValue);
  return chain;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(MOCK_AUTH_USER);
  mockIsAuthError.mockReturnValue(false);
  mockCheckRateLimit.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/deep-search", () => {
  // ── Middleware guards ──────────────────────────────────────────────────

  describe("middleware guards", () => {
    it("returns 401 when auth fails", async () => {
      const { NextResponse } = await import("next/server");
      const authError = NextResponse.json({ error: "Non autenticato" }, { status: 401 });
      mockRequireAuth.mockResolvedValue(authError);
      mockIsAuthError.mockReturnValue(true);

      const req = makeGetRequest({ conversationId: "conv-1" });
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns 429 when rate limit exceeded", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckRateLimit.mockResolvedValue(
        NextResponse.json({ error: "Too many requests" }, { status: 429 })
      );

      const req = makeGetRequest({ conversationId: "conv-1" });
      const res = await GET(req);
      expect(res.status).toBe(429);
    });
  });

  // ── Case 1: Load messages by conversationId ───────────────────────────

  describe("load by conversationId", () => {
    it("returns 404 when conversation not found (ownership check fails)", async () => {
      const convChain = makeChain({ data: null, error: null });
      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(convChain) });

      const req = makeGetRequest({ conversationId: "conv-nonexistent" });
      const res = await GET(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("non trovata");
    });

    it("returns messages when conversation exists", async () => {
      const mockMessages = [
        { id: "msg-1", role: "user", content: "Domanda?", sources: null, metadata: {}, created_at: "2026-01-01" },
        { id: "msg-2", role: "assistant", content: "Risposta.", sources: [], metadata: {}, created_at: "2026-01-01" },
      ];

      // First call: ownership check on conversations → found
      const convChain = makeChain({ data: { id: "conv-1" }, error: null });
      // Second call: load messages
      const msgChain: Record<string, ReturnType<typeof vi.fn>> = {};
      msgChain.select = vi.fn().mockReturnValue(msgChain);
      msgChain.eq = vi.fn().mockReturnValue(msgChain);
      msgChain.order = vi.fn().mockResolvedValue({ data: mockMessages, error: null });

      const fromMock = vi.fn()
        .mockReturnValueOnce(convChain)  // conversations
        .mockReturnValueOnce(msgChain);  // messages

      mockCreateAdminClient.mockReturnValue({ from: fromMock });

      const req = makeGetRequest({ conversationId: "conv-1" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversationId).toBe("conv-1");
      expect(body.messages).toHaveLength(2);
    });

    it("returns 500 when messages query fails", async () => {
      // Ownership check succeeds
      const convChain = makeChain({ data: { id: "conv-1" }, error: null });
      // Messages query fails
      const msgChain: Record<string, ReturnType<typeof vi.fn>> = {};
      msgChain.select = vi.fn().mockReturnValue(msgChain);
      msgChain.eq = vi.fn().mockReturnValue(msgChain);
      msgChain.order = vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });

      const fromMock = vi.fn()
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain);

      mockCreateAdminClient.mockReturnValue({ from: fromMock });

      const req = makeGetRequest({ conversationId: "conv-1" });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Errore");
    });
  });

  // ── Case 2: Find conversation by analysisId + clauseTitle ─────────────

  describe("find by analysisId + clauseTitle", () => {
    it("returns null conversation when not found", async () => {
      const chain = makeChain({ data: null, error: null });
      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

      const req = makeGetRequest({ analysisId: "analysis-1", clauseTitle: "Clausola penale" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversation).toBeNull();
      expect(body.messages).toEqual([]);
    });

    it("returns conversation and messages when found", async () => {
      const convData = {
        id: "conv-abc",
        clause_title: "Clausola penale",
        message_count: 4,
        created_at: "2026-01-01",
        updated_at: "2026-01-02",
      };

      // First call: find conversation
      const convChain = makeChain({ data: convData, error: null });
      // We need limit to return chain, and single to resolve
      convChain.limit = vi.fn().mockReturnValue(convChain);

      // Second call: load messages
      const msgChain: Record<string, ReturnType<typeof vi.fn>> = {};
      msgChain.select = vi.fn().mockReturnValue(msgChain);
      msgChain.eq = vi.fn().mockReturnValue(msgChain);
      msgChain.order = vi.fn().mockResolvedValue({
        data: [{ id: "msg-1", role: "user", content: "Q?", sources: null, metadata: {}, created_at: "2026-01-01" }],
        error: null,
      });

      const fromMock = vi.fn()
        .mockReturnValueOnce(convChain)
        .mockReturnValueOnce(msgChain);

      mockCreateAdminClient.mockReturnValue({ from: fromMock });

      const req = makeGetRequest({ analysisId: "analysis-1", clauseTitle: "Clausola penale" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversationId).toBe("conv-abc");
      expect(body.conversation).toMatchObject({ id: "conv-abc" });
      expect(body.messages).toHaveLength(1);
    });
  });

  // ── Case 3: List conversations by analysisId ──────────────────────────

  describe("list by analysisId", () => {
    it("returns conversations list", async () => {
      const conversations = [
        { id: "conv-1", clause_title: "Clausola A", message_count: 3, created_at: "2026-01-01", updated_at: "2026-01-02" },
        { id: "conv-2", clause_title: "Clausola B", message_count: 1, created_at: "2026-01-01", updated_at: "2026-01-01" },
      ];

      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockResolvedValue({ data: conversations, error: null });

      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

      const req = makeGetRequest({ analysisId: "analysis-1" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.analysisId).toBe("analysis-1");
      expect(body.conversations).toHaveLength(2);
    });

    it("returns 500 when conversations query fails", async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });

      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

      const req = makeGetRequest({ analysisId: "analysis-1" });
      const res = await GET(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Errore");
    });

    it("returns empty conversations array on no results", async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockResolvedValue({ data: [], error: null });

      mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(chain) });

      const req = makeGetRequest({ analysisId: "analysis-1" });
      const res = await GET(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.conversations).toEqual([]);
    });
  });

  // ── Case 4: Missing params ────────────────────────────────────────────

  describe("missing params", () => {
    it("returns 400 when no query params are provided", async () => {
      mockCreateAdminClient.mockReturnValue({ from: vi.fn() });

      const req = makeGetRequest({});
      const res = await GET(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Specificare");
    });
  });
});
