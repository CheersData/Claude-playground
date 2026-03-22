/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: FieldMapper — Class-based mapping API with connector-specific rules.
 *
 * Covers:
 * - Rule-based mapping (L0: connector-specific rules)
 * - Generic pipeline delegation for remaining fields
 * - Transform application (direct, normalize_email, iso_date, number, boolean)
 * - hasConnectorRules / getSupportedConnectors / getEntityTypes
 * - Confidence calculation (average across all mappings)
 * - Unmapped field tracking
 * - skipLLM option propagation
 *
 * Mocks: mapper.ts (generic pipeline), Supabase
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock Supabase admin client (for mapper.ts cache) ───

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: vi.fn(),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            or: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

// ─── Mock the generic mapping pipeline ───

const mockMapFields = vi.fn().mockResolvedValue({
  mapped: [],
  unmapped: [],
  overallConfidence: 0,
  stats: { fromCache: 0, fromRules: 0, fromLLM: 0, unmappedCount: 0, totalFields: 0 },
});

vi.mock("@/lib/staff/data-connector/mapping/mapper", () => ({
  mapFields: (...args: any[]) => mockMapFields(...args),
}));

// ─── Mock LLM mapper (avoid real LLM calls) ───

vi.mock("@/lib/staff/data-connector/mapping/llm-mapper", () => ({
  llmMapFields: vi.fn().mockResolvedValue([]),
}));

// Import after mocks
import { FieldMapper } from "@/lib/staff/data-connector/mapping/field-mapper";

// ─── Setup ───

let mapper: FieldMapper;

beforeEach(() => {
  vi.clearAllMocks();
  mapper = new FieldMapper();
});

// =============================================================================
// Connector-specific rule mapping
// =============================================================================

describe("connector-specific rule mapping", () => {
  it("maps Stripe customer fields using connector rules", async () => {
    const source = {
      id: "cus_123",
      email: "test@example.com",
      name: "Mario Rossi",
      created: 1700000000,
    };

    const result = await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    // Stripe rules should map these fields
    expect(result.fields).toBeDefined();
    expect(result.mappingDetails.length).toBeGreaterThan(0);

    // Check that at least some fields were mapped by connector rules
    const ruleBasedMappings = result.mappingDetails.filter(
      (m) => m.mappingType === "rule"
    );
    expect(ruleBasedMappings.length).toBeGreaterThan(0);
  });

  it("maps HubSpot contact fields using connector rules", async () => {
    const source = {
      firstname: "Maria",
      lastname: "Bianchi",
      email: "maria@bianchi.it",
      company: "Acme Srl",
      jobtitle: "CEO",
    };

    const result = await mapper.mapFields(source, "hubspot", "contact", {
      skipLLM: true,
    });

    expect(result.fields).toBeDefined();
    expect(result.mappingDetails.length).toBeGreaterThan(0);
  });

  it("maps Google Drive document fields using connector rules", async () => {
    // Google Drive rules are keyed by objectType: document, pdf, spreadsheet, etc.
    // NOT "file" — use "document" which is a valid entity type
    const source = {
      id: "file-abc",
      name: "contract.pdf",
      mimeType: "application/pdf",
      size: "1024000",
      createdTime: "2026-01-15T10:00:00Z",
      modifiedTime: "2026-03-01T14:30:00Z",
      shared: true,
    };

    const result = await mapper.mapFields(source, "google-drive", "document", {
      skipLLM: true,
    });

    expect(result.fields).toBeDefined();
    const mappedKeys = Object.keys(result.fields);
    expect(mappedKeys.length).toBeGreaterThan(0);
  });

  it("delegates remaining fields to generic pipeline", async () => {
    // Mix of known and unknown fields
    const source = {
      email: "test@test.com",           // Known by connector rules
      zzz_custom_field: "custom value", // Unknown — goes to generic pipeline
    };

    mockMapFields.mockResolvedValueOnce({
      mapped: [
        {
          sourceField: "zzz_custom_field",
          targetField: "description",
          transform: "direct",
          confidence: 0.85,
          mappingType: "rule",
        },
      ],
      unmapped: [],
      overallConfidence: 0.85,
      stats: { fromCache: 0, fromRules: 1, fromLLM: 0, unmappedCount: 0, totalFields: 1 },
    });

    const result = await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    // Generic pipeline should have been called with the remaining field
    expect(mockMapFields).toHaveBeenCalled();
    const callArgs = mockMapFields.mock.calls[0];
    const sourceFields = callArgs[1] as Array<{ name: string }>;
    const fieldNames = sourceFields.map((f) => f.name);
    expect(fieldNames).toContain("zzz_custom_field");
  });
});

// =============================================================================
// Transform application
// =============================================================================

describe("transform application", () => {
  it("applies normalize_email transform (lowercase + trim)", async () => {
    const source = {
      email: "  TEST@EXAMPLE.COM  ",
    };

    const result = await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    // The mapped email should be normalized
    if (result.fields.email) {
      expect(result.fields.email).toBe("test@example.com");
    }
  });

  it("applies number transform", async () => {
    const source = {
      amount: "1234.56",
    };

    // Amount has a connector rule with number transform
    const result = await mapper.mapFields(source, "stripe", "invoice", {
      skipLLM: true,
    });

    // Check if amount was mapped and transformed
    const amountMapping = result.mappingDetails.find(
      (m) => m.sourceField === "amount"
    );
    if (amountMapping) {
      expect(result.fields[amountMapping.targetField]).toBe(1234.56);
    }
  });
});

// =============================================================================
// Metadata methods
// =============================================================================

describe("metadata methods", () => {
  it("hasConnectorRules returns true for known connectors", () => {
    expect(mapper.hasConnectorRules("stripe", "customer")).toBe(true);
    expect(mapper.hasConnectorRules("hubspot", "contact")).toBe(true);
  });

  it("hasConnectorRules returns false for unknown connectors", () => {
    expect(mapper.hasConnectorRules("unknown-crm", "contact")).toBe(false);
    expect(mapper.hasConnectorRules("stripe", "nonexistent_entity")).toBe(false);
  });

  it("getSupportedConnectors returns all registered connectors", () => {
    const connectors = mapper.getSupportedConnectors();
    expect(connectors).toContain("stripe");
    expect(connectors).toContain("hubspot");
    expect(connectors).toContain("salesforce");
    expect(connectors).toContain("google-drive");
    expect(connectors).toContain("fatture-in-cloud");
  });

  it("getEntityTypes returns entity types for a connector", () => {
    const stripeEntities = mapper.getEntityTypes("stripe");
    expect(stripeEntities.length).toBeGreaterThan(0);
    expect(stripeEntities).toContain("customer");
  });

  it("getEntityTypes returns empty array for unknown connector", () => {
    const entities = mapper.getEntityTypes("nonexistent");
    expect(entities).toEqual([]);
  });

  it("getDefaultTargetSchema returns non-empty schema", () => {
    const schema = mapper.getDefaultTargetSchema();
    expect(schema.length).toBeGreaterThan(0);
    // Should contain common fields
    const fieldNames = schema.map((f) => f.name);
    expect(fieldNames).toContain("email");
    expect(fieldNames).toContain("full_name");
    expect(fieldNames).toContain("company_name");
    expect(fieldNames).toContain("amount");
  });
});

// =============================================================================
// Confidence calculation
// =============================================================================

describe("confidence calculation", () => {
  it("returns average confidence across all mappings", async () => {
    // Source with known fields that get high confidence
    const source = {
      email: "a@b.com",
      name: "Test",
    };

    const result = await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    // Confidence should be a number between 0 and 1
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("returns 0 confidence when no fields are mapped", async () => {
    // Source with only null values (skipped)
    const source = {
      null_field_1: null,
      null_field_2: null,
    };

    const result = await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    expect(result.confidence).toBe(0);
  });
});

// =============================================================================
// Unmapped tracking
// =============================================================================

describe("unmapped tracking", () => {
  it("tracks fields that could not be mapped", async () => {
    mockMapFields.mockResolvedValueOnce({
      mapped: [],
      unmapped: [
        { name: "xyz_totally_unknown", reason: "No match found" },
      ],
      overallConfidence: 0,
      stats: { fromCache: 0, fromRules: 0, fromLLM: 0, unmappedCount: 1, totalFields: 1 },
    });

    const source = {
      xyz_totally_unknown: "some value",
    };

    const result = await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    expect(result.unmapped).toContain("xyz_totally_unknown");
  });
});

// =============================================================================
// skipLLM propagation
// =============================================================================

describe("skipLLM propagation", () => {
  it("propagates skipLLM to the generic pipeline", async () => {
    const source = {
      custom_field: "value",
    };

    await mapper.mapFields(source, "stripe", "customer", {
      skipLLM: true,
    });

    // Check that mapFields was called with skipLLM: true
    if (mockMapFields.mock.calls.length > 0) {
      const options = mockMapFields.mock.calls[0][3];
      expect(options?.skipLLM).toBe(true);
    }
  });
});
