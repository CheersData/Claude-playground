/**
 * Tests: GET /api/vector-search — Vector DB statistics endpoint.
 *
 * Coverage targets: lines 86-107 (GET handler) — previously 0% coverage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoisted mock references
// ---------------------------------------------------------------------------

const mockCheckRateLimit = vi.hoisted(() => vi.fn());
const mockIsVectorDBEnabled = vi.hoisted(() => vi.fn());
const mockGetCorpusStats = vi.hoisted(() => vi.fn());

// POST-only mocks (needed for module resolution)
const mockRequireAuth = vi.hoisted(() => vi.fn());
const mockIsAuthError = vi.hoisted(() => vi.fn());
const mockCheckCsrf = vi.hoisted(() => vi.fn());
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
  getCorpusStats: mockGetCorpusStats,
}));

// Import AFTER all mocks
import { GET } from "@/app/api/vector-search/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/vector-search", {
    method: "GET",
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(null);
  mockIsVectorDBEnabled.mockReturnValue(true);
  mockGetCorpusStats.mockResolvedValue({
    totalArticles: 5600,
    totalSources: 13,
    bySource: {},
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/vector-search", () => {
  it("returns 429 when rate limit exceeded", async () => {
    const { NextResponse } = await import("next/server");
    mockCheckRateLimit.mockResolvedValue(
      NextResponse.json({ error: "Too many requests" }, { status: 429 })
    );

    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(429);
  });

  it("returns enabled: false when vector DB is not configured", async () => {
    mockIsVectorDBEnabled.mockReturnValue(false);

    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.message).toContain("Vector DB");
  });

  it("returns enabled: true with corpus stats when vector DB is configured", async () => {
    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(true);
    expect(body.corpus).toEqual({
      totalArticles: 5600,
      totalSources: 13,
      bySource: {},
    });
  });

  it("returns 500 when getCorpusStats throws", async () => {
    mockGetCorpusStats.mockRejectedValue(new Error("Supabase connection failed"));

    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Supabase connection failed");
  });

  it("returns 500 with generic message on non-Error throw", async () => {
    mockGetCorpusStats.mockRejectedValue("unexpected");

    const req = makeGetRequest();
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Errore sconosciuto");
  });

  it("does not require auth (public endpoint with rate limit only)", async () => {
    const req = makeGetRequest();
    await GET(req);

    // requireAuth should NOT be called for GET
    expect(mockRequireAuth).not.toHaveBeenCalled();
  });
});
