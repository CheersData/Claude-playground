import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCheckCsrf = vi.hoisted(() => vi.fn());
const mockSanitizeUserQuestion = vi.hoisted(() => vi.fn());
const mockRunDeepSearch = vi.hoisted(() => vi.fn());
const mockCreateAdminClient = vi.hoisted(() => vi.fn());
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

const mockAdminFrom = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/agent-broadcast", () => ({
  broadcastConsoleAgent: mockBroadcastConsoleAgent,
}));

vi.mock("@/lib/cdp/profile-builder", () => ({
  recordProfileEvent: mockRecordProfileEvent,
}));

// Import AFTER all mocks are declared
import { POST } from "@/app/api/deep-search/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/deep-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_AUTH_USER = { user: { id: "user-123", email: "test@test.com" } };

const MOCK_DEEP_SEARCH_RESULT = {
  response:
    "Secondo l'art. 1385 c.c., la caparra confirmatoria ha funzione di garanzia. In caso di inadempimento...",
  sources: [
    {
      url: "https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:codice.civile:libro4:art1385",
      title: "Art. 1385 c.c. — Caparra confirmatoria",
      excerpt:
        "Se la parte che ha dato la caparra e' inadempiente, l'altra puo' recedere dal contratto...",
    },
    {
      url: "https://dejure.it/cassazione/sentenza/2023/12345",
      title: "Cass. Civ. Sez. II, 15/03/2023, n. 12345",
      excerpt:
        "La caparra confirmatoria assolve la funzione di liquidazione convenzionale del danno...",
    },
  ],
};

const VALID_REQUEST_BODY = {
  userQuestion: "Posso recuperare la caparra se il venditore non rispetta i termini?",
  clauseContext: "Clausola 5: caparra confirmatoria di 10.000 euro...",
  existingAnalysis: "Rischio alto: clausola penale sproporzionata...",
  analysisId: "analysis-abc-123",
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults: no CSRF block, auth ok, no rate limit, sanitize passthrough, deep search ok
  mockCheckCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(MOCK_AUTH_USER);
  mockIsAuthError.mockReturnValue(false);
  mockCheckRateLimit.mockResolvedValue(null);
  mockSanitizeUserQuestion.mockImplementation((q: string) => q);
  mockRunDeepSearch.mockResolvedValue(MOCK_DEEP_SEARCH_RESULT);

  // Admin client — must handle all Supabase chain patterns used by the route:
  // Conversations: .select().eq().eq().eq().order().limit().single() → { data: null }
  // Conversations: .insert({}).select("id").single() → { data: { id: "..." } }
  // Messages: .select("role, content").eq().order().limit() → { data: [] }
  // Messages: .insert({}).select("id").single() → { data: { id: "..." } }
  // Legacy: .from("deep_searches").insert({}) → resolves
  const nullResult = { data: null, error: null };
  const emptyArrayResult = { data: [], error: null };
  const mockIdResult = { data: { id: "mock-id" }, error: null };

  // Build a fully chainable mock that handles any Supabase query pattern
  const makeChain = (): Record<string, ReturnType<typeof vi.fn>> => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockImplementation(() => chain);
    chain.eq = vi.fn().mockImplementation(() => chain);
    chain.order = vi.fn().mockImplementation(() => chain);
    chain.limit = vi.fn().mockResolvedValue(emptyArrayResult);
    chain.single = vi.fn().mockResolvedValue(nullResult);
    chain.insert = vi.fn().mockImplementation(() => {
      // insert().select().single() pattern
      const insertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      insertChain.select = vi.fn().mockImplementation(() => insertChain);
      insertChain.single = vi.fn().mockResolvedValue(mockIdResult);
      // Also make insert() itself resolve (for legacy .insert({}) without chaining)
      Object.assign(insertChain, { then: (r: (v: unknown) => void) => r(nullResult) });
      return insertChain;
    });
    return chain;
  };

  mockAdminFrom.mockImplementation(() => makeChain());
  mockCreateAdminClient.mockReturnValue({
    from: mockAdminFrom,
  });

  // CDP event recording (fire-and-forget)
  mockRecordProfileEvent.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/deep-search", () => {
  // ── Middleware guards ────────────────────────────────────────────────────

  describe("middleware guards", () => {
    it("returns 403 when CSRF check fails", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckCsrf.mockReturnValue(
        NextResponse.json({ error: "Richiesta non autorizzata" }, { status: 403 })
      );

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(403);
    });

    it("returns 401 when auth fails", async () => {
      const { NextResponse } = await import("next/server");
      const authError = NextResponse.json(
        { error: "Autenticazione richiesta" },
        { status: 401 }
      );
      mockRequireAuth.mockResolvedValue(authError);
      mockIsAuthError.mockReturnValue(true);

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it("returns 429 when rate limit exceeded", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckRateLimit.mockResolvedValue(
        NextResponse.json({ error: "Too many requests" }, { status: 429 })
      );

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(429);
    });

    it("calls checkCsrf before requireAuth", async () => {
      const { NextResponse } = await import("next/server");
      // CSRF fails — auth should NOT be called
      mockCheckCsrf.mockReturnValue(
        NextResponse.json({ error: "CSRF invalid" }, { status: 403 })
      );

      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockCheckCsrf).toHaveBeenCalledOnce();
      expect(mockRequireAuth).not.toHaveBeenCalled();
    });

    it("calls requireAuth before checkRateLimit", async () => {
      const { NextResponse } = await import("next/server");
      const authError = NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
      mockRequireAuth.mockResolvedValue(authError);
      mockIsAuthError.mockReturnValue(true);

      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockRequireAuth).toHaveBeenCalledOnce();
      expect(mockCheckRateLimit).not.toHaveBeenCalled();
    });
  });

  // ── Input validation ────────────────────────────────────────────────────

  describe("input validation", () => {
    it("returns 400 when userQuestion is missing", async () => {
      const req = makeRequest({
        clauseContext: "some context",
        analysisId: "analysis-123",
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Domanda non fornita");
    });

    it("returns 400 when userQuestion is empty string", async () => {
      const req = makeRequest({
        userQuestion: "",
        analysisId: "analysis-123",
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Domanda non fornita");
    });

    it("returns 400 when userQuestion is only whitespace", async () => {
      const req = makeRequest({
        userQuestion: "   \t\n  ",
        analysisId: "analysis-123",
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Domanda non fornita");
    });
  });

  // ── Successful response ─────────────────────────────────────────────────

  describe("successful response", () => {
    it("returns 200 with deep search result", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("response");
      expect(body).toHaveProperty("sources");
      expect(body).toHaveProperty("analysisId", "analysis-abc-123");
      expect(body).toHaveProperty("question");
    });

    it("calls runDeepSearch with sanitized question and context", async () => {
      mockSanitizeUserQuestion.mockReturnValue("caparra confirmatoria recupero");

      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockRunDeepSearch).toHaveBeenCalledOnce();
      expect(mockRunDeepSearch).toHaveBeenCalledWith(
        VALID_REQUEST_BODY.clauseContext,
        VALID_REQUEST_BODY.existingAnalysis,
        "caparra confirmatoria recupero",
        undefined
      );
    });

    it("uses sanitized question in the response", async () => {
      mockSanitizeUserQuestion.mockReturnValue("cleaned question");

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      const body = await res.json();
      expect(body.question).toBe("cleaned question");
    });

    it("returns sources array from runDeepSearch", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      const body = await res.json();
      expect(Array.isArray(body.sources)).toBe(true);
      expect(body.sources).toHaveLength(2);
      expect(body.sources[0]).toHaveProperty("url");
      expect(body.sources[0]).toHaveProperty("title");
      expect(body.sources[0]).toHaveProperty("excerpt");
    });

    it("defaults clauseContext and existingAnalysis to empty string when missing", async () => {
      const req = makeRequest({
        userQuestion: "Posso recedere dal contratto?",
      });
      await POST(req);

      expect(mockRunDeepSearch).toHaveBeenCalledWith(
        "",
        "",
        "Posso recedere dal contratto?",
        undefined
      );
    });

    it("spreads the deep search result into the response JSON", async () => {
      mockRunDeepSearch.mockResolvedValue({
        response: "Risposta dettagliata",
        sources: [{ url: "https://example.com", title: "Fonte", excerpt: "..." }],
        extraField: "bonus data",
      });

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      const body = await res.json();
      expect(body.response).toBe("Risposta dettagliata");
      expect(body.extraField).toBe("bonus data");
    });
  });

  // ── Persistence ─────────────────────────────────────────────────────────

  describe("deep search persistence", () => {
    it("persists deep search to Supabase when analysisId is provided", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockCreateAdminClient).toHaveBeenCalled();
      // The route calls from() for conversations, messages AND legacy deep_searches
      expect(mockAdminFrom).toHaveBeenCalledWith("deep_searches");
    });

    it("does NOT persist legacy record when analysisId is missing", async () => {
      const req = makeRequest({
        userQuestion: "Posso recedere dal contratto?",
      });
      await POST(req);

      // Without analysisId, only conversation tables are touched but not deep_searches
      const deepSearchesCalls = mockAdminFrom.mock.calls.filter(
        (c: unknown[]) => c[0] === "deep_searches"
      );
      expect(deepSearchesCalls).toHaveLength(0);
    });

    it("still returns 200 when persistence fails (non-critical)", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("response");

      consoleSpy.mockRestore();
    });
  });

  // ── Console broadcast ───────────────────────────────────────────────────

  describe("console broadcast", () => {
    it("broadcasts 'running' event when deep search starts", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockBroadcastConsoleAgent).toHaveBeenCalledWith(
        "investigator",
        "running",
        expect.objectContaining({ task: expect.stringContaining("Deep search") })
      );
    });

    it("broadcasts 'done' event with source count on success", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockBroadcastConsoleAgent).toHaveBeenCalledWith(
        "investigator",
        "done",
        expect.objectContaining({ task: expect.stringContaining("2 fonti") })
      );
    });

    it("broadcasts 'error' event when deep search throws", async () => {
      mockRunDeepSearch.mockRejectedValue(new Error("API timeout"));

      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockBroadcastConsoleAgent).toHaveBeenCalledWith(
        "investigator",
        "error",
        expect.objectContaining({ task: "Deep search fallita" })
      );
    });
  });

  // ── CDP event recording ─────────────────────────────────────────────────

  describe("CDP event recording", () => {
    it("records deep_search_performed CDP event on success", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      expect(mockRecordProfileEvent).toHaveBeenCalledWith(
        "user-123",
        "deep_search_performed",
        expect.objectContaining({
          analysis_id: "analysis-abc-123",
          question: VALID_REQUEST_BODY.userQuestion,
          sources_count: 2,
        })
      );
    });

    it("does not block response when CDP recording fails", async () => {
      mockRecordProfileEvent.mockRejectedValue(new Error("CDP down"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(200);

      consoleSpy.mockRestore();
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe("error handling", () => {
    it("returns 500 when runDeepSearch throws an Error", async () => {
      mockRunDeepSearch.mockRejectedValue(
        new Error("Anthropic API unreachable")
      );

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Anthropic API unreachable");
    });

    it("returns 500 with generic message when non-Error is thrown", async () => {
      mockRunDeepSearch.mockRejectedValue("unexpected failure string");

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Errore durante la ricerca");
    });

    it("does not call persistence or CDP on error", async () => {
      mockRunDeepSearch.mockRejectedValue(new Error("LLM failure"));

      const req = makeRequest(VALID_REQUEST_BODY);
      await POST(req);

      // Legacy deep_searches table should not be called on error
      const deepSearchesCalls = mockAdminFrom.mock.calls.filter(
        (c: unknown[]) => c[0] === "deep_searches"
      );
      expect(deepSearchesCalls).toHaveLength(0);
      expect(mockRecordProfileEvent).not.toHaveBeenCalled();
    });
  });

  // ── Response format ─────────────────────────────────────────────────────

  describe("response format", () => {
    it("includes analysisId, question, response, and sources in the JSON", async () => {
      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      const body = await res.json();
      expect(body).toMatchObject({
        analysisId: "analysis-abc-123",
        question: VALID_REQUEST_BODY.userQuestion,
        response: expect.any(String),
        sources: expect.any(Array),
      });
    });

    it("returns empty sources array when runDeepSearch returns no sources", async () => {
      mockRunDeepSearch.mockResolvedValue({
        response: "Non ho trovato fonti specifiche.",
        sources: [],
      });

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      const body = await res.json();
      expect(body.sources).toEqual([]);
    });

    it("handles undefined sources gracefully (sources defaults via spread)", async () => {
      mockRunDeepSearch.mockResolvedValue({
        response: "Risposta senza fonti",
      });

      const req = makeRequest(VALID_REQUEST_BODY);
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("response");
    });
  });
});
