import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockCheckCsrf = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockSearchAll = vi.hoisted(() => vi.fn());
const mockSearchArticles = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/embeddings", () => ({
  isVectorDBEnabled: mockIsVectorDBEnabled,
}));

vi.mock("@/lib/vector-store", () => ({
  searchAll: mockSearchAll,
}));

vi.mock("@/lib/legal-corpus", () => ({
  searchArticles: mockSearchArticles,
  getCorpusStats: vi.fn().mockResolvedValue({ total: 5600 }),
}));

// Import AFTER all mocks are declared
import { POST } from "@/app/api/vector-search/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/vector-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const MOCK_AUTH_USER = { user: { id: "user-123", email: "test@test.com" } };

const MOCK_SEARCH_RESULTS = {
  documents: [
    {
      id: "doc-1",
      content: "Clausola di recesso...",
      source: "contract",
      similarity: 0.92,
    },
  ],
  knowledge: [
    {
      id: "kn-1",
      content: "Art. 1385 c.c. — caparra confirmatoria",
      source: "legal_knowledge",
      similarity: 0.87,
    },
  ],
};

const MOCK_ARTICLES = [
  {
    id: "art-1",
    codice_normativo: "CC",
    numero_articolo: "1385",
    titolo: "Caparra confirmatoria",
    testo: "Se al momento della conclusione del contratto...",
    fonte: "Codice Civile",
    similarity: 0.88,
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  // Defaults: no CSRF block, auth ok, no rate limit, vectorDB enabled, results ok
  mockCheckCsrf.mockReturnValue(null);
  mockRequireAuth.mockResolvedValue(MOCK_AUTH_USER);
  mockIsAuthError.mockReturnValue(false);
  mockCheckRateLimit.mockResolvedValue(null);
  mockIsVectorDBEnabled.mockReturnValue(true);
  mockSearchAll.mockResolvedValue(MOCK_SEARCH_RESULTS);
  mockSearchArticles.mockResolvedValue(MOCK_ARTICLES);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/vector-search", () => {
  describe("middleware guards", () => {
    it("returns 403 when CSRF check fails", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckCsrf.mockReturnValue(
        NextResponse.json({ error: "CSRF invalid" }, { status: 403 })
      );

      const req = makeRequest({ query: "caparra confirmatoria" });
      const res = await POST(req);

      expect(res.status).toBe(403);
    });

    it("returns 401 when auth fails", async () => {
      const { NextResponse } = await import("next/server");
      const authError = NextResponse.json(
        { error: "Non autenticato" },
        { status: 401 }
      );
      mockRequireAuth.mockResolvedValue(authError);
      mockIsAuthError.mockReturnValue(true);

      const req = makeRequest({ query: "vendita a corpo" });
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it("returns 429 when rate limit exceeded", async () => {
      const { NextResponse } = await import("next/server");
      mockCheckRateLimit.mockResolvedValue(
        NextResponse.json({ error: "Too many requests" }, { status: 429 })
      );

      const req = makeRequest({ query: "vendita a corpo" });
      const res = await POST(req);

      expect(res.status).toBe(429);
    });

    it("returns 503 when vector DB is not enabled", async () => {
      mockIsVectorDBEnabled.mockReturnValue(false);

      const req = makeRequest({ query: "vendita a corpo" });
      const res = await POST(req);

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("Vector DB");
    });
  });

  describe("input validation", () => {
    it("returns 400 when query is missing", async () => {
      const req = makeRequest({ type: "all" });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("troppo corta");
    });

    it("returns 400 when query is shorter than 3 chars", async () => {
      const req = makeRequest({ query: "ab" });
      const res = await POST(req);

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("troppo corta");
    });

    it("returns 400 when query is empty string", async () => {
      const req = makeRequest({ query: "" });
      const res = await POST(req);

      expect(res.status).toBe(400);
    });
  });

  describe("search type: all (default)", () => {
    it("returns documents, knowledge and articles when type is 'all'", async () => {
      const req = makeRequest({ query: "caparra confirmatoria vendita" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("documents");
      expect(body).toHaveProperty("knowledge");
      expect(body).toHaveProperty("articles");
    });

    it("calls searchAll and searchArticles when type is 'all'", async () => {
      const req = makeRequest({ query: "caparra confirmatoria vendita" });
      await POST(req);

      expect(mockSearchAll).toHaveBeenCalledOnce();
      expect(mockSearchAll).toHaveBeenCalledWith(
        "caparra confirmatoria vendita",
        expect.objectContaining({ limit: expect.any(Number) })
      );
      expect(mockSearchArticles).toHaveBeenCalledOnce();
    });
  });

  describe("search type: documents", () => {
    it("returns only documents when type is 'documents'", async () => {
      const req = makeRequest({ query: "clausola di recesso", type: "documents" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("documents");
      expect(body).not.toHaveProperty("articles");
    });
  });

  describe("search type: articles", () => {
    it("returns only articles when type is 'articles'", async () => {
      const req = makeRequest({ query: "diritto di recesso consumatore", type: "articles" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("articles");
      expect(body).not.toHaveProperty("documents");
      expect(body).not.toHaveProperty("knowledge");
      // searchAll should NOT be called for type=articles
      expect(mockSearchAll).not.toHaveBeenCalled();
    });
  });

  describe("search type: knowledge", () => {
    it("returns only knowledge when type is 'knowledge'", async () => {
      const req = makeRequest({ query: "caparra confirmatoria", type: "knowledge" });
      const res = await POST(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("knowledge");
      expect(body).not.toHaveProperty("articles");
    });
  });

  describe("limit parameter", () => {
    it("passes limit to searchAll", async () => {
      const req = makeRequest({
        query: "vendita a corpo",
        type: "all",
        limit: 3,
      });
      await POST(req);

      expect(mockSearchAll).toHaveBeenCalledWith(
        "vendita a corpo",
        expect.objectContaining({ limit: 3 })
      );
    });
  });

  describe("error handling", () => {
    it("returns 500 when searchAll throws", async () => {
      mockSearchAll.mockRejectedValue(new Error("Vector DB connection failed"));

      const req = makeRequest({ query: "caparra confirmatoria vendita" });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("Vector DB connection failed");
    });

    it("returns 500 when searchArticles throws", async () => {
      mockSearchArticles.mockRejectedValue(new Error("pgvector timeout"));

      const req = makeRequest({
        query: "caparra confirmatoria vendita",
        type: "articles",
      });
      const res = await POST(req);

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toContain("pgvector timeout");
    });
  });
});
