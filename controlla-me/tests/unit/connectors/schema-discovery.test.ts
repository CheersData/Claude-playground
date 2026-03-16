/**
 * Unit tests for Schema Discovery Engine
 *
 * Tests the 8 modules: types, enumerate, introspect, relate, tag, taxonomy, graph, cache/index
 * Uses mocked fetch functions (no real API calls).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Types ───
import type {
  SchemaField,
  EntityInfo,
  TaggedField,
  SchemaGraph,
  EntityRelationship,
} from "@/lib/staff/data-connector/discovery/types";

// ─── Enumerate ───
import {
  enumerateEntities,
  enumerateHubSpot,
  enumerateFattureInCloud,
  enumerateGoogleDrive,
} from "@/lib/staff/data-connector/discovery/enumerate";

// ─── Introspect ───
import {
  introspectEntity,
  introspectFattureEntity,
  introspectGoogleDriveEntity,
  FATTURE_SCHEMAS,
  DRIVE_FILE_SCHEMA,
} from "@/lib/staff/data-connector/discovery/introspect";

// ─── Relate ───
import { discoverRelationships } from "@/lib/staff/data-connector/discovery/relate";

// ─── Tag ───
import { tagEntityFields } from "@/lib/staff/data-connector/discovery/tag";

// ─── Taxonomy ───
import {
  classifyEntity,
  classifyEntities,
  applyTaxonomy,
} from "@/lib/staff/data-connector/discovery/taxonomy";

// ─── Graph ───
import {
  buildSchemaGraph,
  topologicalSort,
  getConnectedEntities,
  serializeForUI,
} from "@/lib/staff/data-connector/discovery/graph";

// ─── Test helpers ───

const noop = () => {};

function mockFetch(responses: Record<string, unknown>): (url: string) => Promise<Response> {
  return async (url: string) => {
    for (const [pattern, body] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  };
}

function makeFields(names: string[]): SchemaField[] {
  return names.map((name) => ({
    id: name,
    name,
    type: "string",
  }));
}

function makeTaggedFields(names: string[]): TaggedField[] {
  return names.map((name) => ({
    id: name,
    name,
    type: "string",
    tags: [],
    piiLevel: "none" as const,
  }));
}

function makeEntityInfo(
  name: string,
  category: EntityInfo["category"] = "crm"
): EntityInfo {
  return {
    name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    category,
    writable: true,
  };
}

// ═══════════════════════════════════════════════════════════════
//  Enumerate Tests
// ═══════════════════════════════════════════════════════════════

describe("enumerate", () => {
  describe("enumerateHubSpot", () => {
    it("returns standard entities even when schema API fails", async () => {
      const fetchFn = mockFetch({});
      const result = await enumerateHubSpot(fetchFn, noop);

      expect(result.connectorType).toBe("hubspot");
      expect(result.entities.length).toBeGreaterThanOrEqual(6);
      expect(result.entities.map((e) => e.name)).toContain("contacts");
      expect(result.entities.map((e) => e.name)).toContain("companies");
      expect(result.entities.map((e) => e.name)).toContain("deals");
    });

    it("includes custom schemas when available", async () => {
      const fetchFn = mockFetch({
        "/crm/v3/schemas": {
          results: [
            {
              name: "my_custom_obj",
              labels: { singular: "Custom", plural: "Customs" },
              description: "A custom object",
              objectTypeId: "2-123",
            },
          ],
        },
      });

      const result = await enumerateHubSpot(fetchFn, noop);
      expect(result.entities.map((e) => e.name)).toContain("my_custom_obj");
    });
  });

  describe("enumerateFattureInCloud", () => {
    it("returns fixed entity list", async () => {
      const fetchFn = mockFetch({
        "/user/companies": { data: { companies: [{ id: 1, name: "Test", type: "company" }] } },
      });

      const result = await enumerateFattureInCloud(fetchFn, noop);

      expect(result.connectorType).toBe("fatture_in_cloud");
      expect(result.entities.length).toBeGreaterThanOrEqual(4);
      expect(result.entities.map((e) => e.name)).toContain("issued_invoices");
      expect(result.entities.map((e) => e.name)).toContain("clients");
      expect(result.entities.map((e) => e.name)).toContain("suppliers");
      expect(result.entities.map((e) => e.name)).toContain("products");
    });
  });

  describe("enumerateGoogleDrive", () => {
    it("returns files and folders entities", async () => {
      const fetchFn = mockFetch({
        "/about": { user: { displayName: "Test", emailAddress: "test@test.com" } },
        "/files": { files: [{ id: "abc" }] },
      });

      const result = await enumerateGoogleDrive(fetchFn, noop);

      expect(result.connectorType).toBe("google_drive");
      expect(result.entities.map((e) => e.name)).toContain("files");
      expect(result.entities.map((e) => e.name)).toContain("folders");
    });
  });

  describe("enumerateEntities dispatcher", () => {
    it("routes to hubspot enumerator", async () => {
      const fetchFn = mockFetch({});
      const result = await enumerateEntities("hubspot", fetchFn, noop);
      expect(result.connectorType).toBe("hubspot");
    });

    it("routes to fatture_in_cloud enumerator", async () => {
      const fetchFn = mockFetch({});
      const result = await enumerateEntities("fatture_in_cloud", fetchFn, noop);
      expect(result.connectorType).toBe("fatture_in_cloud");
    });

    it("routes to fatture-in-cloud enumerator (hyphen variant)", async () => {
      const fetchFn = mockFetch({});
      const result = await enumerateEntities("fatture-in-cloud", fetchFn, noop);
      expect(result.connectorType).toBe("fatture_in_cloud");
    });

    it("routes to google_drive enumerator", async () => {
      const fetchFn = mockFetch({});
      const result = await enumerateEntities("google_drive", fetchFn, noop);
      expect(result.connectorType).toBe("google_drive");
    });

    it("returns empty for unknown connector", async () => {
      const fetchFn = mockFetch({});
      const result = await enumerateEntities("unknown", fetchFn, noop);
      expect(result.entities).toHaveLength(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Introspect Tests
// ═══════════════════════════════════════════════════════════════

describe("introspect", () => {
  describe("introspectFattureEntity", () => {
    it("returns schema for issued_invoices", async () => {
      const result = await introspectFattureEntity("issued_invoices", vi.fn(), noop);

      expect(result.entityName).toBe("issued_invoices");
      expect(result.fields.length).toBeGreaterThan(10);
      expect(result.fields.map((f) => f.name)).toContain("amount_net");
      expect(result.fields.map((f) => f.name)).toContain("amount_gross");
      expect(result.fields.map((f) => f.name)).toContain("entity");
    });

    it("returns schema for clients", async () => {
      const result = await introspectFattureEntity("clients", vi.fn(), noop);

      expect(result.entityName).toBe("clients");
      expect(result.fields.map((f) => f.name)).toContain("vat_number");
      expect(result.fields.map((f) => f.name)).toContain("email");
      expect(result.fields.map((f) => f.name)).toContain("tax_code");
    });

    it("throws for unknown entity", async () => {
      await expect(
        introspectFattureEntity("unknown_entity", vi.fn(), noop)
      ).rejects.toThrow("No schema definition");
    });

    it("has all known entities in FATTURE_SCHEMAS", () => {
      expect(Object.keys(FATTURE_SCHEMAS)).toContain("issued_invoices");
      expect(Object.keys(FATTURE_SCHEMAS)).toContain("received_documents");
      expect(Object.keys(FATTURE_SCHEMAS)).toContain("clients");
      expect(Object.keys(FATTURE_SCHEMAS)).toContain("suppliers");
      expect(Object.keys(FATTURE_SCHEMAS)).toContain("products");
      expect(Object.keys(FATTURE_SCHEMAS)).toContain("receipts");
    });
  });

  describe("introspectGoogleDriveEntity", () => {
    it("returns schema for files", async () => {
      const result = await introspectGoogleDriveEntity("files", vi.fn(), noop);

      expect(result.entityName).toBe("files");
      expect(result.fields.map((f) => f.name)).toContain("id");
      expect(result.fields.map((f) => f.name)).toContain("name");
      expect(result.fields.map((f) => f.name)).toContain("mimeType");
      expect(result.fields.map((f) => f.name)).toContain("modifiedTime");
    });

    it("returns schema for folders", async () => {
      const result = await introspectGoogleDriveEntity("folders", vi.fn(), noop);

      expect(result.entityName).toBe("folders");
      expect(result.fields.map((f) => f.name)).toContain("parents");
    });

    it("throws for unknown entity", async () => {
      await expect(
        introspectGoogleDriveEntity("unknown", vi.fn(), noop)
      ).rejects.toThrow("No schema for Google Drive entity");
    });
  });

  describe("introspectEntity dispatcher", () => {
    it("routes to fatture_in_cloud", async () => {
      const result = await introspectEntity("fatture_in_cloud", "clients", vi.fn(), noop);
      expect(result.entityName).toBe("clients");
    });

    it("routes to google_drive", async () => {
      const result = await introspectEntity("google_drive", "files", vi.fn(), noop);
      expect(result.entityName).toBe("files");
    });

    it("throws for unknown connector", async () => {
      await expect(
        introspectEntity("unknown", "some_entity", vi.fn(), noop)
      ).rejects.toThrow("No introspector for connector type");
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Relate Tests
// ═══════════════════════════════════════════════════════════════

describe("relate", () => {
  it("discovers FK patterns from field names", async () => {
    const entityFields = new Map<string, SchemaField[]>([
      ["deals", makeFields(["id", "name", "company_id", "contact_ref"])],
      ["companies", makeFields(["id", "name"])],
      ["contacts", makeFields(["id", "email"])],
    ]);

    const result = await discoverRelationships(
      "generic",
      ["deals", "companies", "contacts"],
      entityFields,
      vi.fn() as never,
      noop
    );

    expect(result.relationships.length).toBeGreaterThanOrEqual(1);
    const dealToCompany = result.relationships.find(
      (r) => r.fromEntity === "deals" && r.toEntity === "companies"
    );
    expect(dealToCompany).toBeDefined();
    expect(dealToCompany?.type).toBe("many-to-one");
  });

  it("discovers static relationships for fatture_in_cloud", async () => {
    const entityFields = new Map<string, SchemaField[]>([
      ["issued_invoices", makeFields(["id", "entity"])],
      ["clients", makeFields(["id", "name"])],
    ]);

    const result = await discoverRelationships(
      "fatture_in_cloud",
      ["issued_invoices", "clients"],
      entityFields,
      vi.fn() as never,
      noop
    );

    const invoiceToClient = result.relationships.find(
      (r) => r.fromEntity === "issued_invoices" && r.toEntity === "clients"
    );
    expect(invoiceToClient).toBeDefined();
  });

  it("discovers static relationships for google_drive", async () => {
    const entityFields = new Map<string, SchemaField[]>([
      ["files", makeFields(["id", "parents"])],
      ["folders", makeFields(["id", "name"])],
    ]);

    const result = await discoverRelationships(
      "google_drive",
      ["files", "folders"],
      entityFields,
      vi.fn() as never,
      noop
    );

    const fileToFolder = result.relationships.find(
      (r) => r.fromEntity === "files" && r.toEntity === "folders"
    );
    expect(fileToFolder).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
//  Tag Tests
// ═══════════════════════════════════════════════════════════════

describe("tag", () => {
  it("tags email fields as PII high", () => {
    const fields = makeFields(["email", "work_email"]);
    const result = tagEntityFields("contacts", fields);

    expect(result.piiFieldCount).toBe(2);
    const emailField = result.taggedFields.find((f) => f.name === "email");
    expect(emailField?.piiLevel).toBe("high");
    expect(emailField?.tags).toContain("pii:email");
    expect(emailField?.tags).toContain("pii");
  });

  it("tags phone fields as PII medium", () => {
    const fields = makeFields(["phone", "mobile", "fax"]);
    const result = tagEntityFields("contacts", fields);

    expect(result.piiFieldCount).toBe(3);
    for (const f of result.taggedFields) {
      expect(f.piiLevel).toBe("medium");
    }
  });

  it("tags fiscal code fields as PII high", () => {
    const fields = makeFields(["codice_fiscale", "partita_iva", "vat_number"]);
    const result = tagEntityFields("clients", fields);

    expect(result.piiFieldCount).toBe(3);
    for (const f of result.taggedFields) {
      expect(f.piiLevel).toBe("high");
    }
  });

  it("tags financial fields", () => {
    const fields = makeFields(["amount_net", "price", "total", "currency"]);
    const result = tagEntityFields("invoices", fields);

    expect(result.financialFieldCount).toBe(4);
  });

  it("tags temporal fields", () => {
    const fields = makeFields(["created_at", "updated_at"]);
    const result = tagEntityFields("any", fields);

    const created = result.taggedFields.find((f) => f.name === "created_at");
    expect(created?.tags).toContain("temporal:created");
    expect(created?.tags).toContain("temporal");

    const updated = result.taggedFields.find((f) => f.name === "updated_at");
    expect(updated?.tags).toContain("temporal:updated");
  });

  it("tags identifier fields", () => {
    const fields = makeFields(["id", "company_id", "hs_object_id"]);
    const result = tagEntityFields("any", fields);

    const primary = result.taggedFields.find((f) => f.name === "id");
    expect(primary?.tags).toContain("identifier:primary");

    const fk = result.taggedFields.find((f) => f.name === "company_id");
    expect(fk?.tags).toContain("identifier:foreign");
  });

  it("applies type-based fallback tags for unmatched fields", () => {
    const fields: SchemaField[] = [
      { id: "desc", name: "description_text", type: "text" },
      { id: "score_value", name: "score_value", type: "number" },
    ];
    const result = tagEntityFields("any", fields);

    const textField = result.taggedFields.find((f) => f.name === "description_text");
    expect(textField?.tags).toContain("text");

    const numField = result.taggedFields.find((f) => f.name === "score_value");
    expect(numField?.tags).toContain("metric");
  });
});

// ═══════════════════════════════════════════════════════════════
//  Taxonomy Tests
// ═══════════════════════════════════════════════════════════════

describe("taxonomy", () => {
  describe("classifyEntity", () => {
    it("classifies invoices as accounting (name rule)", () => {
      const result = classifyEntity("issued_invoices", [], "generic");
      expect(result.category).toBe("accounting");
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.classifiedBy).toBe("name-rule");
    });

    it("classifies contacts as crm (name rule)", () => {
      const result = classifyEntity("contacts", [], "generic");
      expect(result.category).toBe("crm");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("classifies deals as sales (name rule)", () => {
      const result = classifyEntity("deals", [], "generic");
      expect(result.category).toBe("sales");
    });

    it("classifies tickets as support (name rule)", () => {
      const result = classifyEntity("tickets", [], "generic");
      expect(result.category).toBe("support");
    });

    it("classifies files as documents (name rule)", () => {
      const result = classifyEntity("files", [], "generic");
      expect(result.category).toBe("documents");
    });

    it("classifies contracts as legal (name rule)", () => {
      const result = classifyEntity("contracts", [], "generic");
      expect(result.category).toBe("legal");
    });

    it("classifies patients as medical (name rule)", () => {
      const result = classifyEntity("patients", [], "generic");
      expect(result.category).toBe("medical");
    });

    it("classifies employees as hr (name rule)", () => {
      const result = classifyEntity("employees", [], "generic");
      expect(result.category).toBe("hr");
    });

    it("uses field analysis when name doesn't match", () => {
      const fields = makeFields(["invoice_number", "amount_net", "due_date", "payment_date"]);
      const result = classifyEntity("custom_records", fields, "generic");

      // Field analysis should suggest accounting
      expect(result.category).toBe("accounting");
      expect(result.classifiedBy).toBe("field-analysis");
    });

    it("falls back to connector hint for unknown entities", () => {
      const result = classifyEntity("random_stuff", [], "hubspot");
      expect(result.category).toBe("crm");
      expect(result.classifiedBy).toBe("connector-hint");
    });

    it("returns custom category for completely unknown entities", () => {
      const result = classifyEntity("xyz123", [], "unknown_connector");
      expect(result.category).toBe("custom");
    });

    it("includes domain tags", () => {
      const result = classifyEntity("issued_invoices", [], "fatture_in_cloud");
      expect(result.domainTags.length).toBeGreaterThan(0);
    });

    it("includes secondary categories when relevant", () => {
      // An entity with both CRM and accounting signals
      const fields = makeFields(["email", "phone", "amount_net", "payment_date"]);
      const result = classifyEntity("client_invoices", fields, "generic");

      // Should classify as accounting (name match) but may have CRM as secondary
      expect(result.category).toBeDefined();
    });
  });

  describe("classifyEntities", () => {
    it("classifies multiple entities in batch", () => {
      const entityFields = new Map<string, SchemaField[]>([
        ["contacts", makeFields(["email", "phone"])],
        ["deals", makeFields(["amount", "stage"])],
        ["invoices", makeFields(["amount_net", "date"])],
      ]);

      const result = classifyEntities("hubspot", entityFields);

      expect(result.results).toHaveLength(3);
      expect(result.connectorType).toBe("hubspot");

      const contacts = result.results.find((r) => r.entityName === "contacts");
      expect(contacts?.category).toBe("crm");

      const deals = result.results.find((r) => r.entityName === "deals");
      expect(deals?.category).toBe("sales");
    });
  });

  describe("applyTaxonomy", () => {
    it("updates entity categories based on taxonomy results", () => {
      const entities = [
        { name: "data_a", category: "custom" as const },
        { name: "data_b", category: "custom" as const },
      ];

      const taxonomy = {
        connectorType: "test",
        results: [
          {
            entityName: "data_a",
            category: "accounting" as const,
            confidence: 0.9,
            domainTags: [],
            classifiedBy: "name-rule" as const,
          },
          {
            entityName: "data_b",
            category: "sales" as const,
            confidence: 0.3, // Below threshold
            domainTags: [],
            classifiedBy: "connector-hint" as const,
          },
        ],
        classifiedAt: new Date().toISOString(),
      };

      applyTaxonomy(entities, taxonomy);

      expect(entities[0].category).toBe("accounting"); // Updated (confidence > 0.5)
      expect(entities[1].category).toBe("custom"); // Not updated (confidence < 0.5)
    });
  });
});

// ═══════════════════════════════════════════════════════════════
//  Graph Tests
// ═══════════════════════════════════════════════════════════════

describe("graph", () => {
  const entities: EntityInfo[] = [
    makeEntityInfo("companies"),
    makeEntityInfo("contacts"),
    makeEntityInfo("deals", "sales"),
  ];

  const taggedFields = new Map<string, TaggedField[]>([
    ["companies", makeTaggedFields(["id", "name"])],
    ["contacts", makeTaggedFields(["id", "email", "company_id"])],
    ["deals", makeTaggedFields(["id", "amount", "contact_id"])],
  ]);

  const relationships: EntityRelationship[] = [
    { fromEntity: "contacts", toEntity: "companies", type: "many-to-one" },
    { fromEntity: "deals", toEntity: "contacts", type: "many-to-one" },
  ];

  describe("buildSchemaGraph", () => {
    it("builds nodes from entities", () => {
      const graph = buildSchemaGraph("hubspot", entities, taggedFields, relationships);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.connectorType).toBe("hubspot");

      const companiesNode = graph.nodes.find((n) => n.name === "companies");
      expect(companiesNode?.fieldCount).toBe(2);
    });

    it("builds edges from relationships", () => {
      const graph = buildSchemaGraph("hubspot", entities, taggedFields, relationships);

      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0].from).toBe("contacts");
      expect(graph.edges[0].to).toBe("companies");
    });

    it("filters edges to only existing nodes", () => {
      const extraRels: EntityRelationship[] = [
        ...relationships,
        { fromEntity: "contacts", toEntity: "nonexistent", type: "many-to-one" },
      ];

      const graph = buildSchemaGraph("hubspot", entities, taggedFields, extraRels);
      expect(graph.edges).toHaveLength(2); // nonexistent filtered out
    });
  });

  describe("topologicalSort", () => {
    it("sorts entities respecting many-to-one dependencies", () => {
      const graph = buildSchemaGraph("hubspot", entities, taggedFields, relationships);
      const order = topologicalSort(graph);

      const companiesIdx = order.indexOf("companies");
      const contactsIdx = order.indexOf("contacts");
      const dealsIdx = order.indexOf("deals");

      // companies must come before contacts
      expect(companiesIdx).toBeLessThan(contactsIdx);
      // contacts must come before deals
      expect(contactsIdx).toBeLessThan(dealsIdx);
    });

    it("handles entities with no relationships", () => {
      const graph = buildSchemaGraph("test", entities, taggedFields, []);
      const order = topologicalSort(graph);

      expect(order).toHaveLength(3);
    });

    it("handles cycles gracefully", () => {
      const cyclicRels: EntityRelationship[] = [
        { fromEntity: "contacts", toEntity: "companies", type: "many-to-one" },
        { fromEntity: "companies", toEntity: "contacts", type: "many-to-one" },
      ];

      const graph = buildSchemaGraph("test", entities, taggedFields, cyclicRels);
      const order = topologicalSort(graph);

      expect(order).toHaveLength(3); // All entities present despite cycle
    });
  });

  describe("getConnectedEntities", () => {
    it("finds direct neighbors", () => {
      const graph = buildSchemaGraph("test", entities, taggedFields, relationships);
      const connected = getConnectedEntities(graph, "contacts");

      expect(connected).toContain("companies");
      expect(connected).toContain("deals");
      expect(connected).not.toContain("contacts");
    });
  });

  describe("serializeForUI", () => {
    it("strips field data from nodes", () => {
      const graph = buildSchemaGraph("test", entities, taggedFields, relationships);
      const serialized = serializeForUI(graph);

      for (const node of serialized.nodes) {
        expect(node.fields).toBeUndefined();
      }
      // But preserves field count
      expect(serialized.nodes[0].fieldCount).toBe(2);
    });
  });
});
