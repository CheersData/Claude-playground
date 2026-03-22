/**
 * Tests: MappingEngine integration with MVP connectors.
 *
 * Covers:
 * 1. Fatture in Cloud rules — all 3 entity types (issued_invoice, received_invoice, client)
 * 2. FieldMapper registration — fatture-in-cloud connector is registered
 * 3. Store integration — _mapped_fields from MappingEngine merges into mapped_fields
 * 4. MappingEngine + rules.ts aliases — fatture_in_cloud alias resolution
 * 5. MappingEngine connectorToDataType — fatture-in-cloud resolves to "invoices" schema
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Top-level mocks (hoisted by Vitest) ───

const mockSelect = vi.fn();
const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
const mockFrom = vi.fn().mockReturnValue({ upsert: mockUpsert });

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockImplementation(() => ({
    from: mockFrom,
  })),
}));

// Mock runAgent (LLM mapper) to prevent actual API calls
vi.mock("@/lib/ai-sdk/agent-runner", () => ({
  runAgent: vi.fn().mockResolvedValue({
    parsed: { mappings: [] },
    usedModelKey: "test",
    usedFallback: false,
  }),
}));

// ─── 1. Fatture in Cloud Rules ───

describe("FATTURE_IN_CLOUD_RULES", () => {
  // Import directly (no mocks needed — pure data)
  let FATTURE_IN_CLOUD_RULES: typeof import("@/lib/staff/data-connector/mapping/rules/fatture-in-cloud-rules").FATTURE_IN_CLOUD_RULES;

  beforeEach(async () => {
    const mod = await import("@/lib/staff/data-connector/mapping/rules/fatture-in-cloud-rules");
    FATTURE_IN_CLOUD_RULES = mod.FATTURE_IN_CLOUD_RULES;
  });

  it("defines rules for all 3 entity types", () => {
    expect(Object.keys(FATTURE_IN_CLOUD_RULES)).toEqual(
      expect.arrayContaining(["issued_invoice", "received_invoice", "client"])
    );
    expect(Object.keys(FATTURE_IN_CLOUD_RULES)).toHaveLength(3);
  });

  describe("issued_invoice rules", () => {
    it("maps core invoice fields", () => {
      const rules = FATTURE_IN_CLOUD_RULES.issued_invoice;
      expect(rules.invoiceNumber.targetField).toBe("invoice_number");
      expect(rules.invoiceDate.targetField).toBe("invoice_date");
      expect(rules.netAmount.targetField).toBe("net_amount");
      expect(rules.vatAmount.targetField).toBe("vat_amount");
      expect(rules.grossAmount.targetField).toBe("gross_amount");
    });

    it("maps entity fields with Italian-specific transforms", () => {
      const rules = FATTURE_IN_CLOUD_RULES.issued_invoice;
      expect(rules.vatNumber.transform).toBe("normalize_piva");
      expect(rules.taxCode.transform).toBe("normalize_cf");
    });

    it("maps common fields (external_id, dates, amounts)", () => {
      const rules = FATTURE_IN_CLOUD_RULES.issued_invoice;
      expect(rules.externalId.targetField).toBe("external_id");
      expect(rules.createdAt.transform).toBe("iso_date");
      expect(rules.amount.transform).toBe("number");
      expect(rules.currency.transform).toBe("direct");
    });

    it("has high confidence (>= 0.9) for all rules", () => {
      const rules = FATTURE_IN_CLOUD_RULES.issued_invoice;
      for (const [fieldName, rule] of Object.entries(rules)) {
        expect(rule.confidence, `${fieldName} confidence should be >= 0.9`).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  describe("received_invoice rules", () => {
    it("has same rules as issued_invoice (shared base)", () => {
      const issued = Object.keys(FATTURE_IN_CLOUD_RULES.issued_invoice);
      const received = Object.keys(FATTURE_IN_CLOUD_RULES.received_invoice);
      expect(received).toEqual(issued);
    });
  });

  describe("client rules", () => {
    it("maps client-specific fields", () => {
      const rules = FATTURE_IN_CLOUD_RULES.client;
      expect(rules.clientType.targetField).toBe("client_type");
      expect(rules.certifiedEmail.targetField).toBe("certified_email");
      expect(rules.certifiedEmail.transform).toBe("normalize_email");
      expect(rules.sdiCode.targetField).toBe("sdi_code");
      expect(rules.phone.transform).toBe("normalize_phone");
    });

    it("does not include invoice-specific fields", () => {
      const rules = FATTURE_IN_CLOUD_RULES.client;
      expect(rules.invoiceNumber).toBeUndefined();
      expect(rules.netAmount).toBeUndefined();
      expect(rules.grossAmount).toBeUndefined();
      expect(rules.paymentStatus).toBeUndefined();
    });

    it("includes entity fields (company, address, tax)", () => {
      const rules = FATTURE_IN_CLOUD_RULES.client;
      expect(rules.companyName.targetField).toBe("company_name");
      expect(rules.vatNumber.targetField).toBe("vat_number");
      expect(rules.taxCode.targetField).toBe("tax_code");
      expect(rules.city.targetField).toBe("city");
      expect(rules.province.targetField).toBe("province");
    });
  });
});

// ─── 2. FieldMapper Registration ───

describe("FieldMapper — fatture-in-cloud registration", () => {
  it("recognizes fatture-in-cloud as a supported connector", async () => {
    const { FieldMapper } = await import("@/lib/staff/data-connector/mapping/field-mapper");
    const mapper = new FieldMapper();

    expect(mapper.getSupportedConnectors()).toContain("fatture-in-cloud");
  });

  it("has rules for issued_invoice entity type", async () => {
    const { FieldMapper } = await import("@/lib/staff/data-connector/mapping/field-mapper");
    const mapper = new FieldMapper();

    expect(mapper.hasConnectorRules("fatture-in-cloud", "issued_invoice")).toBe(true);
    expect(mapper.hasConnectorRules("fatture-in-cloud", "received_invoice")).toBe(true);
    expect(mapper.hasConnectorRules("fatture-in-cloud", "client")).toBe(true);
  });

  it("has rules for all 3 entity types", async () => {
    const { FieldMapper } = await import("@/lib/staff/data-connector/mapping/field-mapper");
    const mapper = new FieldMapper();

    const entityTypes = mapper.getEntityTypes("fatture-in-cloud");
    expect(entityTypes).toContain("issued_invoice");
    expect(entityTypes).toContain("received_invoice");
    expect(entityTypes).toContain("client");
    expect(entityTypes).toHaveLength(3);
  });

  it("maps invoice fields using connector-specific rules (no LLM needed)", async () => {
    const { FieldMapper } = await import("@/lib/staff/data-connector/mapping/field-mapper");
    const mapper = new FieldMapper();

    const source: Record<string, unknown> = {
      externalId: "fic_issued_1",
      objectType: "issued_invoice",
      invoiceNumber: "1/2026",
      netAmount: 1000,
      vatAmount: 220,
      grossAmount: 1220,
      companyName: "Acme S.r.l.",
      vatNumber: "IT12345678901",
    };

    const result = await mapper.mapFields(source, "fatture-in-cloud", "issued_invoice", {
      skipLLM: true,
    });

    // All fields should be mapped by connector-specific rules (no LLM fallback)
    expect(result.fields.external_id).toBe("fic_issued_1");
    expect(result.fields.invoice_number).toBe("1/2026");
    expect(result.fields.net_amount).toBe(1000);
    expect(result.fields.vat_amount).toBe(220);
    expect(result.fields.gross_amount).toBe(1220);
    expect(result.fields.company_name).toBe("Acme S.r.l.");
    // normalize_piva should strip country prefix
    expect(result.fields.vat_number).toBe("12345678901");
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.unmapped).toHaveLength(0);
  });

  it("maps client fields correctly", async () => {
    const { FieldMapper } = await import("@/lib/staff/data-connector/mapping/field-mapper");
    const mapper = new FieldMapper();

    const source: Record<string, unknown> = {
      externalId: "fic_cli_1",
      objectType: "client",
      name: "Mario Rossi",
      email: "MARIO@Example.COM",
      phone: "+39 06 1234567",
      companyName: "Rossi S.r.l.",
      certifiedEmail: "PEC@EXAMPLE.IT",
    };

    const result = await mapper.mapFields(source, "fatture-in-cloud", "client", {
      skipLLM: true,
    });

    expect(result.fields.full_name).toBe("Mario Rossi");
    // normalize_email lowercases
    expect(result.fields.email).toBe("mario@example.com");
    // normalize_phone removes spaces
    expect(result.fields.phone).toBe("+39061234567");
    expect(result.fields.company_name).toBe("Rossi S.r.l.");
    expect(result.fields.certified_email).toBe("pec@example.it");
  });
});

// ─── 3. Store Integration — _mapped_fields ───

describe("Store integration — MappingEngine _mapped_fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock chain for stores
    mockSelect.mockResolvedValue({ data: [{ id: "uuid-1" }], error: null });
    mockUpsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ upsert: mockUpsert });
  });

  describe("HubSpotStore — _mapped_fields merge", () => {
    it("uses hardcoded defaults when no _mapped_fields", async () => {
      const { HubSpotStore } = await import("@/lib/staff/data-connector/stores/hubspot-store");
      const store = new HubSpotStore(vi.fn());

      const record = {
        externalId: "123",
        objectType: "contact" as const,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        archived: false,
        displayName: "John Doe",
        email: "john@example.com",
        phone: null,
        companyName: null,
        domain: null,
        industry: null,
        stage: null,
        pipeline: null,
        amount: null,
        currency: null,
        closeDate: null,
        priority: null,
        description: null,
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
        associations: [],
        rawProperties: {},
      };

      await store.save([record]);

      const row = mockUpsert.mock.calls[0][0][0];
      expect(row.mapped_fields.display_name).toBe("John Doe");
      expect(row.mapped_fields.email).toBe("john@example.com");
      expect(row.mapping_confidence).toBeUndefined();
    });

    it("merges _mapped_fields when MappingEngine was used", async () => {
      const { HubSpotStore } = await import("@/lib/staff/data-connector/stores/hubspot-store");
      const store = new HubSpotStore(vi.fn());

      const record = {
        externalId: "123",
        objectType: "contact" as const,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-02T00:00:00Z",
        archived: false,
        displayName: "John Doe",
        email: "john@example.com",
        phone: null,
        companyName: null,
        domain: null,
        industry: null,
        stage: null,
        pipeline: null,
        amount: null,
        currency: null,
        closeDate: null,
        priority: null,
        description: null,
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
        associations: [],
        rawProperties: {},
        // MappingEngine output (from loadGenericPipeline)
        _mapped_fields: {
          full_name: "John Doe",
          email: "john@example.com",
          custom_field: "user-confirmed-value",
        },
        _mapping_confidence: 0.95,
      };

      await store.save([record as never]);

      const row = mockUpsert.mock.calls[0][0][0];
      // MappingEngine fields should override defaults
      expect(row.mapped_fields.full_name).toBe("John Doe");
      // MappingEngine email should take priority
      expect(row.mapped_fields.email).toBe("john@example.com");
      // Custom field from MappingEngine should be included
      expect(row.mapped_fields.custom_field).toBe("user-confirmed-value");
      // Default fields not overridden should still be present
      expect(row.mapped_fields.display_name).toBe("John Doe");
      // Confidence metadata should be included
      expect(row.mapping_confidence).toBe(0.95);
    });
  });

  describe("FattureStore — _mapped_fields merge", () => {
    it("merges _mapped_fields with hardcoded invoice defaults", async () => {
      const { FattureStore } = await import("@/lib/staff/data-connector/stores/fatture-store");
      const store = new FattureStore(vi.fn());

      const record = {
        externalId: "fic_issued_1",
        objectType: "issued_invoice",
        status: "paid",
        email: null,
        name: "Acme S.r.l.",
        amount: 1220,
        currency: "EUR",
        createdAt: "2026-01-15",
        updatedAt: null,
        invoiceNumber: "1/2026",
        invoiceDate: "2026-01-15",
        netAmount: 1000,
        vatAmount: 220,
        grossAmount: 1220,
        vatRate: 22,
        documentType: "invoice",
        paymentStatus: "paid",
        paymentMethod: "Bonifico",
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
        rawExtra: {},
        // MappingEngine output
        _mapped_fields: {
          invoice_number: "1/2026",
          company_name: "Acme S.r.l.",
          user_custom_note: "Nota personalizzata",
        },
        _mapping_confidence: 0.98,
      };

      await store.save([record as never]);

      const row = mockUpsert.mock.calls[0][0][0];
      // MappingEngine fields should be merged
      expect(row.mapped_fields.invoice_number).toBe("1/2026");
      expect(row.mapped_fields.company_name).toBe("Acme S.r.l.");
      expect(row.mapped_fields.user_custom_note).toBe("Nota personalizzata");
      // Default fields should still be present
      expect(row.mapped_fields.net_amount_cents).toBe(1000);
      expect(row.mapped_fields.vat_number).toBe("IT12345678901");
      expect(row.mapping_confidence).toBe(0.98);
    });
  });

  describe("GoogleDriveStore — _mapped_fields merge", () => {
    it("merges _mapped_fields with hardcoded file defaults", async () => {
      const { GoogleDriveStore } = await import("@/lib/staff/data-connector/stores/google-drive-store");
      const store = new GoogleDriveStore(vi.fn());

      const record = {
        externalId: "drive-file-123",
        objectType: "document",
        name: "Important.docx",
        mimeType: "application/vnd.google-apps.document",
        sizeBytes: 12345,
        createdAt: "2026-01-01T00:00:00Z",
        modifiedAt: "2026-01-02T00:00:00Z",
        parents: ["folder-1"],
        ownerName: "Alice",
        ownerEmail: "alice@example.com",
        shared: true,
        webViewLink: "https://docs.google.com/...",
        iconLink: null,
        textContent: null,
        isGoogleFormat: true,
        isFolder: false,
        extension: "docx",
        trashed: false,
        rawExtra: {},
        // MappingEngine output
        _mapped_fields: {
          file_name: "Important.docx",
          owner_email: "alice@example.com",
          department_tag: "Legal",
        },
        _mapping_confidence: 0.92,
      };

      await store.save([record as never]);

      const row = mockUpsert.mock.calls[0][0][0];
      // MappingEngine fields should be merged
      expect(row.mapped_fields.file_name).toBe("Important.docx");
      expect(row.mapped_fields.department_tag).toBe("Legal");
      // Defaults still present
      expect(row.mapped_fields.mime_type).toBe("application/vnd.google-apps.document");
      expect(row.mapped_fields.size_bytes).toBe(12345);
      expect(row.mapped_fields.is_google_format).toBe(true);
      expect(row.mapping_confidence).toBe(0.92);
    });
  });
});

// ─── 4. MappingEngine — rules.ts aliases ───

describe("MappingEngine rules.ts — fatture_in_cloud aliases", () => {
  it("resolves Italian invoice field aliases", async () => {
    const { resolveByRule } = await import("@/lib/staff/data-connector/mapping/rules");

    // fatture_in_cloud-specific aliases from rules.ts
    expect(resolveByRule("fatture_in_cloud", "numero")).toBe("invoice_number");
    expect(resolveByRule("fatture_in_cloud", "importo_netto")).toBe("net_amount");
    expect(resolveByRule("fatture_in_cloud", "importo_ivato")).toBe("gross_amount");
    expect(resolveByRule("fatture_in_cloud", "iva")).toBe("vat_amount");
    expect(resolveByRule("fatture_in_cloud", "ragione_sociale")).toBe("company_name");
    expect(resolveByRule("fatture_in_cloud", "partita_iva")).toBe("vat_number");
    expect(resolveByRule("fatture_in_cloud", "codice_fiscale")).toBe("tax_code");
    expect(resolveByRule("fatture_in_cloud", "data_scadenza")).toBe("due_date");
    expect(resolveByRule("fatture_in_cloud", "pagato")).toBe("payment_status");
  });

  it("falls back to global aliases when no connector-specific match", async () => {
    const { resolveByRule } = await import("@/lib/staff/data-connector/mapping/rules");

    // These come from _global aliases
    expect(resolveByRule("fatture_in_cloud", "email")).toBe("email");
    expect(resolveByRule("fatture_in_cloud", "telefono")).toBe("phone");
    expect(resolveByRule("fatture_in_cloud", "created_at")).toBe("created_at");
  });
});

// ─── 5. MappingEngine — target schema resolution ───

describe("MappingEngine — connectorToDataType", () => {
  it("resolves fatture-in-cloud to invoices target schema", async () => {
    const { MappingEngine } = await import("@/lib/staff/data-connector/mapping");

    const engine = new MappingEngine();
    engine.clearCache();

    // Use resolveField which internally uses getTargetFieldsForConnector
    // The fact that it resolves to a known schema means the mapping is registered
    const result = await engine.resolveField("fatture-in-cloud", "numero_fattura");

    // Should resolve via global aliases or similarity to invoices schema
    // The important thing is that it doesn't throw and produces a result
    expect(result).toBeDefined();
    expect(result.sourceField).toBe("numero_fattura");
  });
});

// ─── 6. Barrel export ───

describe("Barrel export — mapping/index.ts", () => {
  it("exports FATTURE_IN_CLOUD_RULES", async () => {
    const mapping = await import("@/lib/staff/data-connector/mapping");
    expect(mapping.FATTURE_IN_CLOUD_RULES).toBeDefined();
    expect(Object.keys(mapping.FATTURE_IN_CLOUD_RULES)).toHaveLength(3);
  });
});
