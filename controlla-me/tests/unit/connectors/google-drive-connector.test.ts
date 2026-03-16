import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DataSource } from "@/lib/staff/data-connector/types";

// Mock authenticated-base to break circular dependency (base.ts ↔ authenticated-base.ts)
vi.mock("@/lib/staff/data-connector/connectors/authenticated-base", () => ({
  AuthenticatedBaseConnector: class {},
}));

// Mock google-drive-parser
vi.mock("@/lib/staff/data-connector/parsers/google-drive-parser", () => ({
  parseDriveFile: vi.fn().mockImplementation((file: { id: string; name: string; mimeType: string }, textContent?: string | null) => ({
    externalId: file.id,
    objectType: "document",
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: null,
    createdAt: "2026-01-01T00:00:00Z",
    modifiedAt: "2026-01-15T00:00:00Z",
    parents: [],
    ownerName: null,
    ownerEmail: null,
    shared: false,
    webViewLink: null,
    iconLink: null,
    textContent: textContent ?? null,
    isGoogleFormat: false,
    isFolder: false,
    extension: null,
    trashed: false,
    rawExtra: {},
  })),
  isExportableAsText: vi.fn().mockImplementation((mime: string) =>
    mime.startsWith("application/vnd.google-apps.")
  ),
  getExportMimeType: vi.fn().mockReturnValue("text/plain"),
}));

import { GoogleDriveConnector } from "@/lib/staff/data-connector/connectors/google-drive";

// ─── Helpers ───

function makeSource(overrides: Partial<DataSource> = {}): DataSource {
  return {
    id: "gdrive_test",
    name: "Google Drive Test",
    shortName: "GDRIVE",
    dataType: "crm-records",
    vertical: "legal",
    connector: "google-drive",
    config: { exportTextContent: true },
    lifecycle: "planned",
    estimatedItems: 100,
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

function mockFetchError(status: number, body = ""): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new Error("Not JSON")),
    headers: new Headers(),
  } as unknown as Response;
}

function makeDriveFile(id: string, name: string, mimeType = "application/pdf") {
  return {
    id,
    name,
    mimeType,
    size: "1024",
    createdTime: "2026-01-01T00:00:00Z",
    modifiedTime: "2026-01-15T00:00:00Z",
    parents: ["folder_1"],
    owners: [{ displayName: "Test User", emailAddress: "test@example.com" }],
    shared: false,
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    trashed: false,
  };
}

function makeListResponse(files: unknown[], nextPageToken?: string) {
  return {
    files,
    nextPageToken,
    incompleteSearch: false,
  };
}

describe("GoogleDriveConnector", () => {
  let connector: GoogleDriveConnector;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalApiKey = process.env.GOOGLE_API_KEY;
  const originalSaKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  beforeEach(() => {
    vi.useFakeTimers();
    logSpy = vi.fn();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // Use API key mode for simplicity
    process.env.GOOGLE_API_KEY = "test-api-key-123";
    delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    connector = new GoogleDriveConnector(makeSource(), logSpy);
    vi.spyOn(connector as any, 'sleep').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalApiKey !== undefined) {
      process.env.GOOGLE_API_KEY = originalApiKey;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
    if (originalSaKey !== undefined) {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY = originalSaKey;
    } else {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    }
  });

  // ─── connect() ───

  describe("connect", () => {
    it("returns ok=true when API responds", async () => {
      // about endpoint
      fetchMock.mockResolvedValueOnce(
        mockFetchOk({ user: { displayName: "Test User", emailAddress: "test@gmail.com" } })
      );
      // files list (census)
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeDriveFile("f1", "test.pdf")], "next_token"))
      );
      // sample files
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeDriveFile("f1", "test.pdf")]))
      );

      const result = await connector.connect();

      expect(result.ok).toBe(true);
      expect(result.message).toContain("api-key");
      expect(result.census.estimatedItems).toBe(1000); // has nextPageToken → estimate 1000
    });

    it("returns ok=false when no auth configured", async () => {
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const noAuthConnector = new GoogleDriveConnector(makeSource(), logSpy);

      const result = await noAuthConnector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("No Google auth configured");
    });

    it("returns ok=false when API returns error", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchError(403, "Forbidden"));

      const result = await connector.connect();

      expect(result.ok).toBe(false);
      expect(result.message).toContain("403");
    });

    it("appends API key to URLs in api-key mode", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk({ user: {} }));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      await connector.connect();

      const aboutUrl = fetchMock.mock.calls[0][0] as string;
      expect(aboutUrl).toContain("key=test-api-key-123");
    });
  });

  // ─── fetchAll() ───

  describe("fetchAll", () => {
    it("fetches files with pagination", async () => {
      // Page 1
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeDriveFile("f1", "doc1.pdf")], "page2_token"))
      );
      // Page 2
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeDriveFile("f2", "doc2.pdf")]))
      );

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(2);
      expect(result.sourceId).toBe("gdrive_test");
    });

    it("respects limit", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(
          makeListResponse([
            makeDriveFile("f1", "doc1.pdf"),
            makeDriveFile("f2", "doc2.pdf"),
          ])
        )
      );

      const result = await connector.fetchAll({ limit: 1 });

      expect(result.items).toHaveLength(1);
    });

    it("exports text content for Google Docs", async () => {
      const googleDoc = makeDriveFile("f1", "My Doc", "application/vnd.google-apps.document");

      fetchMock
        .mockResolvedValueOnce(mockFetchOk(makeListResponse([googleDoc])))
        // Export call
        .mockResolvedValueOnce(mockFetchOk("Exported text content"));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(1);
      // Export fetch was called
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const exportUrl = fetchMock.mock.calls[1][0] as string;
      expect(exportUrl).toContain("/export");
    });

    it("skips export when exportTextContent is false", async () => {
      const noExportConnector = new GoogleDriveConnector(
        makeSource({ config: { exportTextContent: false } }),
        logSpy
      );
      const googleDoc = makeDriveFile("f1", "My Doc", "application/vnd.google-apps.document");

      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([googleDoc])));

      const result = await noExportConnector.fetchAll();

      expect(result.items).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(1); // No export call
    });

    it("handles empty Drive gracefully", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchAll();

      expect(result.items).toHaveLength(0);
    });
  });

  // ─── fetchDelta() ───

  describe("fetchDelta", () => {
    it("filters by modifiedTime in Drive query", async () => {
      fetchMock.mockResolvedValueOnce(
        mockFetchOk(makeListResponse([makeDriveFile("f1", "updated.pdf")]))
      );

      const result = await connector.fetchDelta("2026-03-01T00:00:00Z");

      expect(result.items).toHaveLength(1);
      expect(result.metadata.since).toBe("2026-03-01T00:00:00Z");

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("modifiedTime");
    });

    it("returns empty when no files modified", async () => {
      fetchMock.mockResolvedValueOnce(mockFetchOk(makeListResponse([])));

      const result = await connector.fetchDelta("2026-03-14T00:00:00Z");

      expect(result.items).toHaveLength(0);
    });
  });
});
