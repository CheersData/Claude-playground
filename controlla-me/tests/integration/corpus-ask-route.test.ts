import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockSanitizeUserQuestion = vi.hoisted(() => vi.fn());
const mockAskCorpusAgent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/middleware/auth", () => ({
  requireAuth: mockRequireAuth,
  isAuthError: mockIsAuthError,
}));

vi.mock("@/lib/middleware/rate-limit", () => ({
  checkRateLimit: mockCheckRateLimit,
}));

vi.mock("@/lib/embeddings", () => ({
  isVectorDBEnabled: mockIsVectorDBEnabled,
}));

vi.mock("@/lib/middleware/sanitize", () => ({
  sanitizeUserQuestion: mockSanitizeUserQuestion,
}));

vi.mock("@/lib/agents/corpus-agent", () => ({
  askCorpusAgent: mockAskCorpusAgent,
}));

// Import AFTER all mocks are declared
import { POST } from "@/app/api/corpus/ask/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/corpus/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_AUTH_USER = { user: { id: "user-123", email: "test@test.com" } };

const MOCK_CORPUS_RESULT = {
  answer:
    "Secondo il Codice del Consumo (D.Lgs. 206/2005), il consumatore ha 14 giorni per recedere dal contratto.",
  citedArticles: [
    {
      id: "art-52",
      codice_normativo: "D.Lgs. 206/2005",
      numero_articolo: "52",
      titolo: "Diritto di recesso",
      testo: "Il consumatore dispone di un periodo di quattordici giorni...",
      fonte: "Codice del Consumo",
    },
  ],
  confidence: 0.91,
  followUpQuestions: [
    "Come si calcola il termine di 14 giorni?",
    "Ci sono eccezioni al diritto di recesso?",
  ],
  provider: "gemini",
  articlesRetrieved: 3,
  durationMs: 1850,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults: auth ok (but optional), no rate limit, vectorDB enabled
  mockRequireAuth.mockResolvedValue(MOCK_AUTH_USER);
  mockIsAuthError.mockReturnValue(false);
  mockCheckRateLimit.mockResolvedValue(null);
  mockIsVectorDBEnabled.mockReturnValue(true);
  // sanitize passthrough by default
  mockSanitizeUserQuestion.mockImplementation((q: string) => q);
  // corpus agent succeeds by default
  mockAskCorpusAgent.mockResolvedValue(MOCK_CORPUS_RESULT);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/corpus/ask", () => {
  describe("middleware guards", () => {
    it("returns 429 when rate limit exceeded (authenticated user)", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckRateLimit.mockResolvedValue(
        NextResponse.json({ error: "Too many requests" }, { status: 429 })
      );

      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(429);
    });

    it("returns 429 when rate limit exceeded (anonymous user)", async () => {
      const { NextResponse } = await import("next/server");
      // Anonymous: requireAuth returns error, isAuthError true
      mockIsAuthError.mockReturnValue(true);
      mockCheckRateLimit.mockResolvedValue(
        NextResponse.json({ error: "Too many requests" }, { status: 429 })
      );

      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(429);
    });

    it("allows anonymous users (auth is optional for corpus/ask)", async () => {
      // Anonymous: requireAuth returns error, isAuthError true, but route continues
      mockIsAuthError.mockReturnValue(true);
      mockCheckRateLimit.mockResolvedValue(null); // no block

      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("answer");
    });

    it("returns 503 when vector DB is not enabled", async () => {
      mockIsVectorDBEnabled.mockReturnValue(false);

      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("Vector DB");
    });
  });

  describe("input validation", () => {
    it("returns 400 when body is not valid JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/corpus/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid json {{{",
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("JSON");
    });

    it("returns 400 when question field is missing", async () => {
      const req = makeRequest({ config: { provider: "gemini" } });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("question");
    });

    it("returns 400 when question is not a string", async () => {
      const req = makeRequest({ question: 42 });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });

    it("returns 400 when sanitized question is shorter than 5 chars", async () => {
      mockSanitizeUserQuestion.mockReturnValue("ab");

      const req = makeRequest({ question: "ab" });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("5 caratteri");
    });

    it("returns 400 when question exceeds 2000 chars", async () => {
      const longQuestion = "a".repeat(2001);
      mockSanitizeUserQuestion.mockReturnValue(longQuestion);

      const req = makeRequest({ question: longQuestion });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("2000");
    });

    it("returns 400 when config.provider is invalid", async () => {
      const req = makeRequest({
        question: "Cosa prevede il diritto di recesso?",
        config: { provider: "openai" },
      });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Provider");
    });
  });

  describe("successful response", () => {
    it("returns 200 with corpus agent result", async () => {
      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("answer");
      expect(body).toHaveProperty("citedArticles");
      expect(body).toHaveProperty("confidence");
      expect(body).toHaveProperty("provider");
      expect(body).toHaveProperty("durationMs");
    });

    it("calls askCorpusAgent with sanitized question", async () => {
      mockSanitizeUserQuestion.mockReturnValue("diritto recesso consumatore");

      const req = makeRequest({ question: "posso restituire il prodotto?" });
      await POST(req);

      expect(mockAskCorpusAgent).toHaveBeenCalledWith(
        "diritto recesso consumatore",
        expect.any(Object)
      );
    });

    it("passes config to askCorpusAgent", async () => {
      const req = makeRequest({
        question: "Cosa prevede il diritto di recesso?",
        config: { provider: "haiku" },
      });
      await POST(req);

      expect(mockAskCorpusAgent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ provider: "haiku" })
      );
    });

    it("accepts valid providers: auto, gemini, haiku", async () => {
      for (const provider of ["auto", "gemini", "haiku"]) {
        const req = makeRequest({
          question: "Cosa prevede il diritto di recesso?",
          config: { provider },
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }
    });

    it("works without config (uses default)", async () => {
      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      expect(mockAskCorpusAgent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({})
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when askCorpusAgent throws", async () => {
      mockAskCorpusAgent.mockRejectedValue(
        new Error("Gemini API unreachable")
      );

      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Gemini API unreachable");
    });

    it("returns 500 with generic error when non-Error is thrown", async () => {
      mockAskCorpusAgent.mockRejectedValue("unexpected failure");

      const req = makeRequest({ question: "Cosa prevede il diritto di recesso?" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });
  });
});
