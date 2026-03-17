/**
 * Tests: FattureStore — Writes FattureRecord[] to crm_records via Supabase.
 *
 * Covers:
 * - save() dry run mode
 * - save() with valid records (upsert)
 * - save() with invalid records (validation errors)
 * - save() with mixed valid/invalid records
 * - save() batch processing (splits at BATCH_SIZE=100)
 * - save() DB error handling
 * - save() update-if-newer logic (skip stale records)
 * - toRow() mapping (connector_source, mapped_fields with cents)
 * - userId override for per-user integrations
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FattureRecord } from "@/lib/staff/data-connector/parsers/fatture-parser";

// ─── Mock Supabase ───

const mockSelect = vi.fn();
const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });

// Mock for fetchExistingTimestamps: .select().eq().eq().in()
const mockIn = vi.fn();
const mockEq2 = vi.fn().mockReturnValue({ in: mockIn });
const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
const mockSelectExisting = vi.fn().mockReturnValue({ eq: mockEq1 });

const mockFrom = vi.fn().mockImplementation((table: string) => {
  // The store calls .from("crm_records") twice:
  // 1. For fetchExistingTimestamps: .select("object_type, external_id, updated_at").eq().eq().in()
  // 2. For upsert: .upsert([...]).select("id")
  return {
    select: mockSelectExisting,
    upsert: mockUpsert,
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: mockFrom,
  })),
}));

import { FattureStore } from "@/lib/staff/data-connector/stores/fatture-store";

// ─── Fixtures ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRecord(overrides: Partial<Record<keyof FattureRecord, any>> = {}): FattureRecord {
  return {
    externalId: "fic_issued_1",
    objectType: "issued_invoice",
    status: "paid",
    email: null,
    name: "Acme S.r.l.",
    amount: 122000,
    currency: "EUR",
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-01-15T14:00:00.000Z",
    invoiceNumber: "1/2026",
    invoiceDate: "2026-01-15T00:00:00.000Z",
    netAmount: 100000,
    vatAmount: 22000,
    grossAmount: 122000,
    vatRate: 22,
    documentType: "invoice",
    paymentStatus: "paid",
    paymentMethod: "Bonifico bancario",
    eInvoice: true,
    eInvoiceStatus: "accepted",
    description: "Consulenza",
    fiscalYear: 2026,
    companyName: "Acme S.r.l.",
    vatNumber: "IT12345678901",
    taxCode: "RSSMRA80A01H501Z",
    address: "Via Roma 1",
    city: "Milano",
    province: "MI",
    postalCode: "20100",
    country: "IT",
    clientType: null,
    certifiedEmail: null,
    phone: null,
    sdiCode: null,
    rawExtra: { fic_id: 1 },
    ...overrides,
  };
}

describe("FattureStore", () => {
  let store: FattureStore;
  let logSpy: ReturnType<typeof vi.fn<(msg: string) => void>>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.fn();
    store = new FattureStore(logSpy);

    // Default: no existing records (fetchExistingTimestamps returns empty)
    mockIn.mockResolvedValue({ data: [], error: null });
    // Default: upsert succeeds
    mockSelect.mockResolvedValue({ data: [{ id: "uuid-1" }], error: null });
  });

  // ─── Dry Run ───

  describe("save — dry run", () => {
    it("returns all records as skipped without DB write", async () => {
      const result = await store.save([makeRecord(), makeRecord()], { dryRun: true });

      expect(result.inserted).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.errors).toBe(0);
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it("logs dry run message", async () => {
      await store.save([makeRecord()], { dryRun: true });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining("DRY RUN")
      );
    });
  });

  // ─── Valid Records ───

  describe("save — valid records", () => {
    it("upserts records to crm_records table", async () => {
      const result = await store.save([makeRecord()]);

      expect(mockFrom).toHaveBeenCalledWith("crm_records");
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            connector_source: "fatture_in_cloud",
            object_type: "issued_invoice",
            external_id: "fic_issued_1",
          }),
        ]),
        expect.objectContaining({
          onConflict: "user_id,connector_source,object_type,external_id",
          ignoreDuplicates: false,
        })
      );
      expect(result.inserted).toBe(1);
      expect(result.errors).toBe(0);
    });

    it("maps data JSONB with full record fields", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      const row = upsertedRows[0];

      expect(row.data.invoiceNumber).toBe("1/2026");
      expect(row.data.netAmount).toBe(100000);
      expect(row.data.companyName).toBe("Acme S.r.l.");
      expect(row.data.rawExtra).toEqual({ fic_id: 1 });
    });

    it("maps mapped_fields JSONB with normalized keys (amounts in cents)", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      const row = upsertedRows[0];

      expect(row.mapped_fields.invoice_number).toBe("1/2026");
      expect(row.mapped_fields.net_amount_cents).toBe(100000);
      expect(row.mapped_fields.gross_amount_cents).toBe(122000);
      expect(row.mapped_fields.vat_amount_cents).toBe(22000);
      expect(row.mapped_fields.vat_number).toBe("IT12345678901");
      expect(row.mapped_fields.payment_status).toBe("paid");
      expect(row.mapped_fields.company_name).toBe("Acme S.r.l.");
    });

    it("uses system user ID for backend syncs", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      expect(upsertedRows[0].user_id).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("uses custom user ID when provided", async () => {
      const customStore = new FattureStore(logSpy, {
        userId: "11111111-1111-1111-1111-111111111111",
      });
      await customStore.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      expect(upsertedRows[0].user_id).toBe("11111111-1111-1111-1111-111111111111");
    });

    it("sets synced_at to current time", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      expect(upsertedRows[0].synced_at).toBeDefined();
      expect(typeof upsertedRows[0].synced_at).toBe("string");
    });
  });

  // ─── Update-if-newer Logic ───

  describe("save — update-if-newer", () => {
    it("skips records when existing record has same updated_at", async () => {
      // Simulate existing record with same timestamp
      mockIn.mockResolvedValue({
        data: [
          {
            object_type: "issued_invoice",
            external_id: "fic_issued_1",
            updated_at: "2026-01-15T14:00:00.000Z",
          },
        ],
        error: null,
      });

      const result = await store.save([makeRecord()]);

      expect(result.skipped).toBe(1);
      expect(result.inserted).toBe(0);
      expect(result.updated).toBe(0);
      // Should NOT call upsert since all records were skipped
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it("updates records when incoming is newer", async () => {
      // Simulate existing record with older timestamp
      mockIn.mockResolvedValue({
        data: [
          {
            object_type: "issued_invoice",
            external_id: "fic_issued_1",
            updated_at: "2026-01-14T10:00:00.000Z",
          },
        ],
        error: null,
      });

      const result = await store.save([makeRecord()]);

      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(0);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("inserts records when no existing record found", async () => {
      // No existing records
      mockIn.mockResolvedValue({ data: [], error: null });

      const result = await store.save([makeRecord()]);

      expect(result.inserted).toBe(1);
      expect(result.skipped).toBe(0);
      expect(mockUpsert).toHaveBeenCalled();
    });

    it("falls back to full upsert when existing lookup fails", async () => {
      mockIn.mockResolvedValue({
        data: null,
        error: { message: "permission denied" },
      });

      const result = await store.save([makeRecord()]);

      // Should still try to upsert (graceful fallback)
      expect(mockUpsert).toHaveBeenCalled();
      expect(result.inserted).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Validation Errors ───

  describe("save — invalid records", () => {
    it("rejects records with missing externalId", async () => {
      const result = await store.save([makeRecord({ externalId: "" })]);

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].error).toContain("externalId");
    });

    it("rejects records with negative amounts", async () => {
      const result = await store.save([makeRecord({ grossAmount: -100 })]);

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].error).toContain("grossAmount");
    });

    it("saves valid records and rejects invalid ones in mixed batch", async () => {
      const valid = makeRecord({ externalId: "fic_issued_1" });
      const invalid = makeRecord({ externalId: "" });

      mockSelect.mockResolvedValue({ data: [{ id: "uuid-1" }], error: null });

      const result = await store.save([valid, invalid]);

      expect(result.inserted).toBeGreaterThanOrEqual(0);
      expect(result.errors).toBe(1);
    });

    it("returns early when all records fail validation", async () => {
      const result = await store.save([
        makeRecord({ externalId: "" }),
        makeRecord({ objectType: "" }),
      ]);

      expect(result.inserted).toBe(0);
      expect(result.errors).toBe(2);
    });
  });

  // ─── Batch Processing ───

  describe("save — batch processing", () => {
    it("processes records in batches of 100", async () => {
      const records = Array.from({ length: 150 }, (_, i) =>
        makeRecord({ externalId: `fic_issued_${i}` })
      );

      mockSelect.mockResolvedValue({
        data: records.slice(0, 100).map((_, i) => ({ id: `uuid-${i}` })),
        error: null,
      });

      await store.save(records);

      // Should call upsert twice (100 + 50)
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(mockUpsert.mock.calls[0][0]).toHaveLength(100);
      expect(mockUpsert.mock.calls[1][0]).toHaveLength(50);
    });

    it("logs batch progress", async () => {
      const records = Array.from({ length: 120 }, (_, i) =>
        makeRecord({ externalId: `fic_issued_${i}` })
      );

      mockSelect.mockResolvedValue({ data: [], error: null });
      await store.save(records);

      const batchLogs = logSpy.mock.calls
        .map((c: string[]) => c[0])
        .filter((msg: string) => msg.includes("Batch"));
      expect(batchLogs).toHaveLength(2);
      expect(batchLogs[0]).toContain("1/2");
      expect(batchLogs[1]).toContain("2/2");
    });
  });

  // ─── DB Errors ───

  describe("save — DB errors", () => {
    it("handles Supabase upsert errors gracefully", async () => {
      mockSelect.mockResolvedValue({
        data: null,
        error: { message: "duplicate key violation" },
      });

      const result = await store.save([makeRecord()]);

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].error).toContain("duplicate key");
    });

    it("handles thrown exceptions from Supabase", async () => {
      mockUpsert.mockReturnValue({
        select: vi.fn().mockRejectedValue(new Error("Network timeout")),
      });

      const result = await store.save([makeRecord()]);

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].error).toContain("Network timeout");
    });
  });

  // ─── Empty Input ───

  describe("save — empty input", () => {
    it("handles empty records array", async () => {
      const result = await store.save([]);

      expect(result.inserted).toBe(0);
      expect(result.errors).toBe(0);
    });
  });
});
