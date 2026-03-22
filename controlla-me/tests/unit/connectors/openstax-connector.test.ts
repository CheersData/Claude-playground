import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock authenticated-base to break circular dependency (base.ts ↔ authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

import { OpenStaxConnector } from "@/lib/staff/data-connector/connectors/openstax";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "openstax_test",
    name: "OpenStax Anatomy",
    shortName: "OSTX",
    dataType: "medical-articles",
    vertical: "medical",
    connector: "openstax",
    config: { bookSlug: "anatomy-and-physiology-2e" },
    lifecycle: "planned",
    estimatedItems: 200,
    ...overrides,
  };
}

function mockFetchOk(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

function makeBooksResponse(slug: string, title: string, contentUrl: string) {
  return {
    items: [
      {
        id: "1",
        title,
        slug,
        book_state: "live",
        content_url: contentUrl,
      },
    ],
  };
}

function makeTOCResponse(sections: Array<{ id: string; title: string; slug?: string }>) {
  return {
    id: "book-uuid",
    title: "Test Book",
    tree: {
      id: "root",
      title: "Root",
      slug: "root",
      contents: [
        {
          id: "ch1",
          title: "Chapter 1",
          contents: sections.map((s) => ({
            id: s.id,
            title: s.title,
            slug: s.slug ?? s.id,
          })),
        },
      ],
    },
  };
}

function makePageResponse(id: string, title: string, content: string) {
  return {
    id,
    title,
    content,
    abstract: "Abstract text",
  };
}

describe("OpenStaxConnector", () => {
  let connector: OpenStaxConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    connector = new OpenStaxConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true when book is found", async () => {
      // CMS API
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse(
            "anatomy-and-physiology-2e",
            "Anatomy and Physiology 2e",
            "https://openstax.org/apps/archive/content/1234"
          )
        )
      );
      // TOC fetch
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeTOCResponse([
            { id: "s1", title: "Introduction" },
            { id: "s2", title: "Cell Structure" },
          ])
        )
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("Anatomy and Physiology 2e");
      expect(result.census.estimatedItems).toBe(2);
    });

    it("returns ok=false when book is not found", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk({ items: [] }));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("non trovato");
    });

    it("returns ok=false on connection error", async () => {
      fetchMock.mockRejectedValue(new Error("Timeout"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("Timeout");
    });

    it("uses correct CMS API URL with bookSlug", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk({ items: [] }));

      await connector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("openstax.org/apps/cms/api/v2");
      expect(url).toContain("slug=anatomy-and-physiology-2e");
    });

    it("handles TOC fetch failure gracefully", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse("anatomy-and-physiology-2e", "A&P 2e", "https://example.com/toc")
        )
      );
      fetchMock.mockRejectedValueOnce(new Error("TOC error"));

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("TOC fetch fallito"));
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches book sections via TOC", async () => {
      const archiveBase = "https://openstax.org/apps/archive/content";
      // CMS API
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse("anatomy-and-physiology-2e", "A&P 2e", `${archiveBase}/1234`)
        )
      );
      // TOC
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeTOCResponse([
            { id: "sec-1", title: "Introduction to Anatomy" },
            { id: "sec-2", title: "Chemical Level of Organization" },
          ])
        )
      );
      // Section pages
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makePageResponse(
            "sec-1",
            "Introduction to Anatomy",
            "<p>Anatomy is the science of body structures. This text covers the complete study of anatomy and physiology for students.</p>"
          )
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makePageResponse(
            "sec-2",
            "Chemical Level of Organization",
            "<p>Matter is composed of elements. Chemical reactions are essential for life processes in the human body.</p>"
          )
        )
      );

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].articleTitle).toBe("Introduction to Anatomy");
      expect(result.items[0].hierarchy).toHaveProperty("chapter");
      expect(result.metadata.bookTitle).toBe("A&P 2e");
    });

    it("strips HTML from content", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse("test", "Test", "https://example.com/content/1234")
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeTOCResponse([{ id: "s1", title: "Section 1" }]))
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makePageResponse(
            "s1",
            "Section 1",
            "<div><script>alert('xss')</script><p>Clean text content that is long enough to pass the minimum threshold check.</p></div>"
          )
        )
      );

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items[0].articleText).not.toContain("<");
      expect(result.items[0].articleText).not.toContain("alert");
      expect(result.items[0].articleText).toContain("Clean text content");
    });

    it("skips pages with too short content", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse("test", "Test", "https://example.com/content/1234")
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeTOCResponse([{ id: "s1", title: "Empty" }]))
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makePageResponse("s1", "Empty", "<p>Short</p>"))
      );

      const result = await connector.fetchAll({ limit: 10 });

      expect(result.items).toHaveLength(0); // < 50 chars
    });

    it("respects limit parameter", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse("test", "Test", "https://example.com/content/1234")
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeTOCResponse([
            { id: "s1", title: "Section 1" },
            { id: "s2", title: "Section 2" },
            { id: "s3", title: "Section 3" },
          ])
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makePageResponse("s1", "Section 1", "<p>Section one content text that is long enough to exceed the minimum character threshold for pages.</p>")
        )
      );

      const result = await connector.fetchAll({ limit: 1 });

      expect(result.items.length).toBeLessThanOrEqual(1);
    });

    it("throws when book not found in fetchAll", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk({ items: [] }));

      await expect(connector.fetchAll()).rejects.toThrow("non trovato");
    });

    it("throws when content_url is missing", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({
          items: [{ id: "1", title: "Test", slug: "test", book_state: "live", content_url: "" }],
        })
      );

      await expect(connector.fetchAll()).rejects.toThrow("content_url");
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("delegates to fetchAll (books are versioned)", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeBooksResponse("test", "Test", "https://example.com/content/1234")
        )
      );
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeTOCResponse([]))
      );

      const result = await connector.fetchDelta("2026-03-01T00:00:00Z");

      expect(result.items).toHaveLength(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Delta non supportato"));
    });
  });

  // ─── Slug inference ───

  describe("slug inference", () => {
    it("uses bookSlug from config when provided", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk({ items: [] }));

      await connector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("anatomy-and-physiology-2e");
    });

    it("infers slug from source name", async () => {
      const microConnector = new OpenStaxConnector(
        makeSource({ name: "OpenStax Microbiology", config: {} }),
        logSpy
      );
      fetchMock.mockResolvedValueOnce(mockFetchOk({ items: [] }));

      await microConnector.connect();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("microbiology");
    });
  });
});
