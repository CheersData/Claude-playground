/**
 * Tests: FattureStore — Writes FattureRecord[] to crm_records via Supabase.
 *
 * Covers:
 * - save() dry run mode
 * - save() with valid records (upsert)
 * - save() with invalid records (validation errors)
 * - save() with mixed valid/invalid records
 * - save() batch processing (splits at BATCH_SIZE=50)
 * - save() DB error handling
 * - toRow() mapping (connector_source, mapped_fields)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FattureRecord } from "@/lib/staff/data-connector/parsers/fatture-parser";

// ─── Mock Supabase ───

const mockSelect = vi.fn();
const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert });

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: mockFrom,
  })),
}));

import { FattureStore } from "@/lib/staff/data-connector/stores/fatture-store";

// ─── Fixtures ───

function makeRecord(overrides: Partial<FattureRecord> = {}): FattureRecord {
  return {
    externalId: "fic_issued_1",
    objectType: "issued_invoice",
    status: "paid",
    email: null,
    name: "Acme S.r.l.",
    amount: 1220,
    currency: "EUR",
    createdAt: "2026-01-15",
    updatedAt: "2026-01-15T14:00:00Z",
    invoiceNumber: "1/2026",
    invoiceDate: "2026-01-15",
    netAmount: 1000,
    vatAmount: 220,
    grossAmount: 1220,
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
      expect(row.data.netAmount).toBe(1000);
      expect(row.data.companyName).toBe("Acme S.r.l.");
      expect(row.data.rawExtra).toEqual({ fic_id: 1 });
    });

    it("maps mapped_fields JSONB with normalized keys", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      const row = upsertedRows[0];

      expect(row.mapped_fields.invoice_number).toBe("1/2026");
      expect(row.mapped_fields.net_amount).toBe(1000);
      expect(row.mapped_fields.gross_amount).toBe(1220);
      expect(row.mapped_fields.vat_number).toBe("IT12345678901");
      expect(row.mapped_fields.payment_status).toBe("paid");
      expect(row.mapped_fields.company_name).toBe("Acme S.r.l.");
    });

    it("uses system user ID for backend syncs", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      expect(upsertedRows[0].user_id).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("sets synced_at to current time", async () => {
      await store.save([makeRecord()]);

      const upsertedRows = mockUpsert.mock.calls[0][0];
      expect(upsertedRows[0].synced_at).toBeDefined();
      expect(typeof upsertedRows[0].synced_at).toBe("string");
    });
  });

  // ─── Validation Errors ───

  describe("save — invalid records", () => {
    it("rejects records with missing externalId", async () => {
      const result = await store.save([makeRecord({ externalId: "" })]);

      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].error).toContain("externalId");
      expect(mockFrom).not.toHaveBeenCalled();
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

      expect(result.inserted).toBe(1);
      expect(result.errors).toBe(1);
    });

    it("returns early when all records fail validation", async () => {
      const result = await store.save([
        makeRecord({ externalId: "" }),
        makeRecord({ objectType: "" }),
      ]);

      expect(result.inserted).toBe(0);
      expect(result.errors).toBe(2);
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });

  // ─── Batch Processing ───

  describe("save — batch processing", () => {
    it("processes records in batches of 50", async () => {
      const records = Array.from({ length: 75 }, (_, i) =>
        makeRecord({ externalId: `fic_issued_${i}` })
      );

      mockSelect.mockResolvedValue({
        data: records.slice(0, 50).map((_, i) => ({ id: `uuid-${i}` })),
        error: null,
      });

      await store.save(records);

      // Should call upsert twice (50 + 25)
      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(mockUpsert.mock.calls[0][0]).toHaveLength(50);
      expect(mockUpsert.mock.calls[1][0]).toHaveLength(25);
    });

    it("logs batch progress", async () => {
      const records = Array.from({ length: 60 }, (_, i) =>
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
      expect(mockFrom).not.toHaveBeenCalled();
    });
  });
});
