import { describe, it, expect } from "vitest";
import {
  parseHubSpotObject,
  PROPERTIES_BY_TYPE,
  type HubSpotApiObject,
  type HubSpotObjectType,
} from "@/lib/staff/data-connector/parsers/hubspot-parser";

// ─── Helpers ───

function makeApiObject(
  id: string,
  props: Record<string, string | null> = {},
  overrides: Partial<HubSpotApiObject> = {}
): HubSpotApiObject {
  return {
    id,
    properties: props,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-15T10:30:00Z",
    archived: false,
    ...overrides,
  };
}

// ─── PROPERTIES_BY_TYPE ───

describe("PROPERTIES_BY_TYPE", () => {
  it("defines properties for all 4 object types", () => {
    expect(Object.keys(PROPERTIES_BY_TYPE)).toEqual(
      expect.arrayContaining(["contact", "company", "deal", "ticket"])
    );
  });

  it("contact includes expected fields", () => {
    expect(PROPERTIES_BY_TYPE.contact).toEqual(
      expect.arrayContaining(["email", "firstname", "lastname", "phone"])
    );
  });

  it("deal includes amount and pipeline", () => {
    expect(PROPERTIES_BY_TYPE.deal).toEqual(
      expect.arrayContaining(["amount", "pipeline", "dealstage"])
    );
  });

  it("ticket includes priority and content", () => {
    expect(PROPERTIES_BY_TYPE.ticket).toEqual(
      expect.arrayContaining(["priority", "content"])
    );
  });
});

// ─── parseHubSpotObject ───

describe("parseHubSpotObject", () => {
  // ─── Common fields ───

  describe("common fields", () => {
    it("maps externalId, createdAt, updatedAt, archived", () => {
      const obj = makeApiObject("42", {}, { archived: true });
      const result = parseHubSpotObject("contact", obj);

      expect(result.externalId).toBe("42");
      expect(result.objectType).toBe("contact");
      expect(result.createdAt).toBe("2026-01-01T00:00:00Z");
      expect(result.updatedAt).toBe("2026-01-15T10:30:00Z");
      expect(result.archived).toBe(true);
    });

    it("defaults archived to false when missing", () => {
      const obj = makeApiObject("1", {});
      // Simulate HubSpot response where archived might be undefined
      (obj as unknown as Record<string, unknown>).archived = undefined;
      const result = parseHubSpotObject("contact", obj);

      expect(result.archived).toBe(false);
    });

    it("preserves rawProperties", () => {
      const props = { email: "a@b.com", custom_field: "custom_value" };
      const result = parseHubSpotObject("contact", makeApiObject("1", props));

      expect(result.rawProperties).toEqual(props);
    });

    it("handles missing properties gracefully", () => {
      const obj = makeApiObject("1");
      (obj as unknown as Record<string, unknown>).properties = undefined;
      const result = parseHubSpotObject("contact", obj);

      expect(result.displayName).toBeNull();
      expect(result.email).toBeNull();
    });
  });

  // ─── Contact ───

  describe("contact", () => {
    it("maps email, phone, company, lifecyclestage", () => {
      const result = parseHubSpotObject(
        "contact",
        makeApiObject("1", {
          email: "john@example.com",
          phone: "+39 333 1234567",
          company: "Acme Srl",
          lifecyclestage: "customer",
          firstname: "John",
          lastname: "Doe",
        })
      );

      expect(result.email).toBe("john@example.com");
      expect(result.phone).toBe("+39 333 1234567");
      expect(result.companyName).toBe("Acme Srl");
      expect(result.stage).toBe("customer");
      expect(result.displayName).toBe("John Doe");
    });

    it("builds displayName from first name only", () => {
      const result = parseHubSpotObject(
        "contact",
        makeApiObject("1", { firstname: "Maria", lastname: null })
      );
      expect(result.displayName).toBe("Maria");
    });

    it("builds displayName from last name only", () => {
      const result = parseHubSpotObject(
        "contact",
        makeApiObject("1", { firstname: null, lastname: "Rossi" })
      );
      expect(result.displayName).toBe("Rossi");
    });

    it("returns null displayName when both names are null", () => {
      const result = parseHubSpotObject(
        "contact",
        makeApiObject("1", { firstname: null, lastname: null })
      );
      expect(result.displayName).toBeNull();
    });

    it("sets deal/ticket-specific fields to null", () => {
      const result = parseHubSpotObject("contact", makeApiObject("1", {}));

      expect(result.domain).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.pipeline).toBeNull();
      expect(result.amount).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.closeDate).toBeNull();
      expect(result.priority).toBeNull();
      expect(result.description).toBeNull();
    });
  });

  // ─── Company ───

  describe("company", () => {
    it("maps name, domain, industry", () => {
      const result = parseHubSpotObject(
        "company",
        makeApiObject("1", {
          name: "Tech Corp",
          domain: "techcorp.it",
          industry: "Software",
        })
      );

      expect(result.displayName).toBe("Tech Corp");
      expect(result.companyName).toBe("Tech Corp");
      expect(result.domain).toBe("techcorp.it");
      expect(result.industry).toBe("Software");
    });

    it("builds description from employee count", () => {
      const result = parseHubSpotObject(
        "company",
        makeApiObject("1", { name: "X", numberofemployees: "150" })
      );
      expect(result.description).toBe("150 employees");
    });

    it("returns null description when no employee count", () => {
      const result = parseHubSpotObject(
        "company",
        makeApiObject("1", { name: "X" })
      );
      expect(result.description).toBeNull();
    });

    it("sets contact/deal/ticket-specific fields to null", () => {
      const result = parseHubSpotObject("company", makeApiObject("1", {}));

      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.stage).toBeNull();
      expect(result.pipeline).toBeNull();
      expect(result.amount).toBeNull();
      expect(result.closeDate).toBeNull();
      expect(result.priority).toBeNull();
    });
  });

  // ─── Deal ───

  describe("deal", () => {
    it("maps dealname, stage, pipeline, amount, closedate", () => {
      const result = parseHubSpotObject(
        "deal",
        makeApiObject("1", {
          dealname: "Enterprise License",
          dealstage: "contractsent",
          pipeline: "default",
          amount: "50000.50",
          closedate: "2026-06-15T00:00:00Z",
        })
      );

      expect(result.displayName).toBe("Enterprise License");
      expect(result.stage).toBe("contractsent");
      expect(result.pipeline).toBe("default");
      expect(result.amount).toBe(50000.50);
      expect(result.closeDate).toBe("2026-06-15T00:00:00Z");
      expect(result.description).toBe("Enterprise License");
    });

    it("parses integer amount", () => {
      const result = parseHubSpotObject(
        "deal",
        makeApiObject("1", { amount: "1000" })
      );
      expect(result.amount).toBe(1000);
    });

    it("returns null for non-numeric amount", () => {
      const result = parseHubSpotObject(
        "deal",
        makeApiObject("1", { amount: "not-a-number" })
      );
      expect(result.amount).toBeNull();
    });

    it("returns null for null amount", () => {
      const result = parseHubSpotObject(
        "deal",
        makeApiObject("1", { amount: null })
      );
      expect(result.amount).toBeNull();
    });

    it("parses zero amount", () => {
      const result = parseHubSpotObject(
        "deal",
        makeApiObject("1", { amount: "0" })
      );
      expect(result.amount).toBe(0);
    });

    it("sets contact/company/ticket-specific fields to null", () => {
      const result = parseHubSpotObject("deal", makeApiObject("1", {}));

      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.companyName).toBeNull();
      expect(result.domain).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.priority).toBeNull();
    });
  });

  // ─── Ticket ───

  describe("ticket", () => {
    it("maps subject, content, pipeline, stage, priority", () => {
      const result = parseHubSpotObject(
        "ticket",
        makeApiObject("1", {
          subject: "Cannot login",
          content: "User reports login failure since yesterday",
          hs_pipeline: "support",
          hs_pipeline_stage: "open",
          priority: "HIGH",
        })
      );

      expect(result.displayName).toBe("Cannot login");
      expect(result.description).toBe("User reports login failure since yesterday");
      expect(result.pipeline).toBe("support");
      expect(result.stage).toBe("open");
      expect(result.priority).toBe("HIGH");
    });

    it("handles missing optional fields", () => {
      const result = parseHubSpotObject(
        "ticket",
        makeApiObject("1", { subject: "Quick question" })
      );

      expect(result.displayName).toBe("Quick question");
      expect(result.description).toBeNull();
      expect(result.pipeline).toBeNull();
      expect(result.stage).toBeNull();
      expect(result.priority).toBeNull();
    });

    it("sets contact/company/deal-specific fields to null", () => {
      const result = parseHubSpotObject("ticket", makeApiObject("1", {}));

      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.companyName).toBeNull();
      expect(result.domain).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.amount).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.closeDate).toBeNull();
    });
  });

  // ─── Default / unknown type ───

  describe("unknown object type", () => {
    it("returns all-null normalized fields", () => {
      const result = parseHubSpotObject(
        "unknown_type" as HubSpotObjectType,
        makeApiObject("1", { some_field: "value" })
      );

      expect(result.externalId).toBe("1");
      expect(result.objectType).toBe("unknown_type");
      expect(result.displayName).toBeNull();
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.companyName).toBeNull();
      expect(result.domain).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.stage).toBeNull();
      expect(result.pipeline).toBeNull();
      expect(result.amount).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.closeDate).toBeNull();
      expect(result.priority).toBeNull();
      expect(result.description).toBeNull();
      expect(result.rawProperties).toEqual({ some_field: "value" });
    });
  });
});
