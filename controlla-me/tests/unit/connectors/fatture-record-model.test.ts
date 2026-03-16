/**
 * Tests: FattureRecordModel + validateFattureRecord
 *
 * Covers:
 * - analyze() generates correct DataModelSpec
 * - describeTransform() returns human-readable string
 * - validateFattureRecord: valid records pass
 * - validateFattureRecord: missing required fields
 * - validateFattureRecord: invalid amounts
 * - validateFattureRecord: client must have name/vat/taxCode
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FattureRecord } from "@/lib/staff/data-connector/parsers/fatture-parser";

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: [{ id: "1" }], error: null }),
      }),
    }),
  }),
}));

import { FattureRecordModel, validateFattureRecord } from "@/lib/staff/data-connector/models/fatture-record-model";

// ─── Fixtures ───

function makeValidInvoiceRecord(overrides: Partial<FattureRecord> = {}): FattureRecord {
  return {
    externalId: "fic_issued_123",
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
    description: "Consulenza legale",
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
    rawExtra: { fic_id: 123, direction: "issued" },
    ...overrides,
  };
}

function makeValidClientRecord(overrides: Partial<FattureRecord> = {}): FattureRecord {
  return {
    externalId: "fic_cli_456",
    objectType: "client",
    status: null,
    email: "mario@rossi.it",
    name: "Mario Rossi S.r.l.",
    amount: null,
    currency: null,
    createdAt: "2025-06-01T08:00:00Z",
    updatedAt: "2026-01-10T12:00:00Z",
    invoiceNumber: null,
    invoiceDate: null,
    netAmount: null,
    vatAmount: null,
    grossAmount: null,
    vatRate: null,
    documentType: null,
    paymentStatus: null,
    paymentMethod: null,
    eInvoice: null,
    eInvoiceStatus: null,
    description: null,
    fiscalYear: null,
    companyName: "Mario Rossi S.r.l.",
    vatNumber: "IT98765432101",
    taxCode: "RSSMRA80A01H501Z",
    address: "Via Garibaldi 10",
    city: "Roma",
    province: "RM",
    postalCode: "00100",
    country: "IT",
    clientType: "company",
    certifiedEmail: "mario@pec.rossi.it",
    phone: "+39 06 1234567",
    sdiCode: "XXXXXXX",
    rawExtra: { fic_id: 456, code: "CLI-001" },
    ...overrides,
  };
}

// =============================================================================
// validateFattureRecord
// =============================================================================

describe("validateFattureRecord", () => {
  describe("valid records", () => {
    it("validates a complete invoice record", () => {
      const result = validateFattureRecord(makeValidInvoiceRecord());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates a complete client record", () => {
      const result = validateFattureRecord(makeValidClientRecord());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("validates invoice with zero amounts", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ netAmount: 0, vatAmount: 0, grossAmount: 0 })
      );
      expect(result.valid).toBe(true);
    });

    it("validates invoice with null amounts", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ netAmount: null, vatAmount: null, grossAmount: null })
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("missing required fields", () => {
    it("fails when externalId is missing", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ externalId: "" })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing externalId");
    });

    it("fails when objectType is missing", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ objectType: "" })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing objectType");
    });

    it("fails when createdAt is missing", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ createdAt: "" })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing createdAt");
    });

    it("reports multiple missing fields at once", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ externalId: "", objectType: "", createdAt: "" })
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe("invalid amounts", () => {
    it("fails when grossAmount is negative", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ grossAmount: -100 })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("grossAmount");
    });

    it("fails when netAmount is negative", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ netAmount: -50 })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("netAmount");
    });

    it("fails when vatAmount is negative", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ vatAmount: -10 })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("vatAmount");
    });

    it("fails when grossAmount is NaN", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ grossAmount: NaN })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("grossAmount");
    });
  });

  describe("client-specific validation", () => {
    it("fails when client has no name, vatNumber, or taxCode", () => {
      const result = validateFattureRecord(
        makeValidClientRecord({ name: null, vatNumber: null, taxCode: null })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Client must have at least one of");
    });

    it("passes when client has only name", () => {
      const result = validateFattureRecord(
        makeValidClientRecord({ vatNumber: null, taxCode: null })
      );
      expect(result.valid).toBe(true);
    });

    it("passes when client has only vatNumber", () => {
      const result = validateFattureRecord(
        makeValidClientRecord({ name: null, taxCode: null })
      );
      expect(result.valid).toBe(true);
    });

    it("passes when client has only taxCode", () => {
      const result = validateFattureRecord(
        makeValidClientRecord({ name: null, vatNumber: null })
      );
      expect(result.valid).toBe(true);
    });

    it("does not apply client validation to invoice records", () => {
      const result = validateFattureRecord(
        makeValidInvoiceRecord({ name: null, vatNumber: null, taxCode: null })
      );
      expect(result.valid).toBe(true);
    });
  });
});

// =============================================================================
// FattureRecordModel
// =============================================================================

describe("FattureRecordModel", () => {
  let model: FattureRecordModel;

  beforeEach(() => {
    model = new FattureRecordModel();
  });

  describe("analyze", () => {
    it("returns spec with crm_records table name", async () => {
      const spec = await model.analyze([makeValidInvoiceRecord()]);
      expect(spec.tableName).toBe("crm_records");
    });

    it("includes required columns", async () => {
      const spec = await model.analyze([makeValidInvoiceRecord()]);
      const colNames = spec.columns.map((c) => c.name);

      expect(colNames).toContain("user_id");
      expect(colNames).toContain("connector_source");
      expect(colNames).toContain("object_type");
      expect(colNames).toContain("external_id");
      expect(colNames).toContain("data");
      expect(colNames).toContain("mapped_fields");
      expect(colNames).toContain("synced_at");
    });

    it("includes indexes for upsert and queries", async () => {
      const spec = await model.analyze([makeValidInvoiceRecord()]);
      const indexNames = spec.indexes.map((i) => i.name);

      expect(indexNames).toContain("crm_records_user_connector_unique");
      expect(indexNames).toContain("idx_crm_records_user_connector");
      expect(indexNames).toContain("idx_crm_records_object_type");
    });

    it("detects object types from sample data", async () => {
      const spec = await model.analyze([
        makeValidInvoiceRecord(),
        makeValidClientRecord(),
      ]);

      const objectTypeCol = spec.columns.find((c) => c.name === "object_type");
      expect(objectTypeCol?.purpose).toContain("issued_invoice");
      expect(objectTypeCol?.purpose).toContain("client");
    });

    it("includes transform rules with confidence 1.0", async () => {
      const spec = await model.analyze([makeValidInvoiceRecord()]);

      expect(spec.transformRules.length).toBeGreaterThanOrEqual(4);
      for (const rule of spec.transformRules) {
        expect(rule.confidence).toBe(1.0);
        expect(rule.mappedBy).toBe("rule");
      }
    });
  });

  describe("checkSchema", () => {
    it("returns ready=true when table exists", async () => {
      const spec = await model.analyze([makeValidInvoiceRecord()]);
      const result = await model.checkSchema(spec);

      expect(result.ready).toBe(true);
      expect(result.message).toContain("exists");
    });
  });

  describe("describeTransform", () => {
    it("returns pipe-separated string of transform rules", async () => {
      const spec = await model.analyze([makeValidInvoiceRecord()]);
      const description = model.describeTransform(spec);

      expect(description).toContain("externalId -> external_id");
      expect(description).toContain("objectType -> object_type");
      expect(description).toContain("data");
      expect(description).toContain("mapped_fields");
      expect(description).toContain("|");
    });
  });
});
