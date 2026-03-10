/**
 * Tests: Field Alias Rules — L1 deterministic mapping rules.
 *
 * Covers:
 * - resolveByRule returns correct target for known aliases
 * - resolveByRule returns null for unknown fields
 * - connector-specific aliases override global
 * - case-insensitive matching (via normalization)
 * - all global aliases resolve correctly (sample)
 * - fatture_in_cloud specific aliases
 * - google_drive specific aliases
 * - hubspot specific aliases
 * - salesforce specific aliases
 * - stripe specific aliases
 * - resolveByRuleBatch
 *
 * Pure functions — no mocks needed.
 */

import { describe, it, expect } from "vitest";

import {
  resolveByRule,
  resolveByRuleBatch,
  FIELD_ALIASES,
} from "@/lib/staff/data-connector/mapping/rules";

// =============================================================================
// resolveByRule — global aliases
// =============================================================================

describe("resolveByRule — global aliases", () => {
  it("resolves 'first_name' to 'first_name'", () => {
    expect(resolveByRule("_unknown_connector", "first_name")).toBe("first_name");
  });

  it("resolves 'nome' (Italian) to 'first_name'", () => {
    expect(resolveByRule("_unknown_connector", "nome")).toBe("first_name");
  });

  it("resolves 'given_name' to 'first_name'", () => {
    expect(resolveByRule("_unknown_connector", "given_name")).toBe("first_name");
  });

  it("resolves 'cognome' (Italian) to 'last_name'", () => {
    expect(resolveByRule("_unknown_connector", "cognome")).toBe("last_name");
  });

  it("resolves 'email_address' to 'email'", () => {
    expect(resolveByRule("_unknown_connector", "email_address")).toBe("email");
  });

  it("resolves 'telefono' to 'phone'", () => {
    expect(resolveByRule("_unknown_connector", "telefono")).toBe("phone");
  });

  it("resolves 'ragione_sociale' to 'company_name'", () => {
    expect(resolveByRule("_unknown_connector", "ragione_sociale")).toBe("company_name");
  });

  it("resolves 'partita_iva' to 'vat_number'", () => {
    expect(resolveByRule("_unknown_connector", "partita_iva")).toBe("vat_number");
  });

  it("resolves 'codice_fiscale' to 'tax_code'", () => {
    expect(resolveByRule("_unknown_connector", "codice_fiscale")).toBe("tax_code");
  });

  it("resolves 'cap' to 'postal_code'", () => {
    expect(resolveByRule("_unknown_connector", "cap")).toBe("postal_code");
  });

  it("resolves 'importo' to 'amount'", () => {
    expect(resolveByRule("_unknown_connector", "importo")).toBe("amount");
  });

  it("resolves 'valuta' to 'currency'", () => {
    expect(resolveByRule("_unknown_connector", "valuta")).toBe("currency");
  });

  it("resolves 'id' to 'external_id'", () => {
    expect(resolveByRule("_unknown_connector", "id")).toBe("external_id");
  });

  it("resolves 'created_at' to 'created_at'", () => {
    expect(resolveByRule("_unknown_connector", "created_at")).toBe("created_at");
  });

  it("resolves 'last_modified' to 'updated_at'", () => {
    expect(resolveByRule("_unknown_connector", "last_modified")).toBe("updated_at");
  });
});

// =============================================================================
// resolveByRule — null for unknown fields
// =============================================================================

describe("resolveByRule — unknown fields", () => {
  it("returns null for completely unknown field", () => {
    expect(resolveByRule("hubspot", "zxy_nonexistent_field")).toBeNull();
  });

  it("returns null for random gibberish", () => {
    expect(resolveByRule("salesforce", "asdfghjkl")).toBeNull();
  });

  it("returns null for numeric-only field name", () => {
    expect(resolveByRule("stripe", "12345")).toBeNull();
  });
});

// =============================================================================
// resolveByRule — case-insensitive matching
// =============================================================================

describe("resolveByRule — case-insensitive matching", () => {
  it("resolves camelCase 'firstName' via normalization", () => {
    // firstName -> first_name (camelCase normalization)
    expect(resolveByRule("_any", "firstName")).toBe("first_name");
  });

  it("resolves UPPERCASE 'EMAIL' via normalization", () => {
    expect(resolveByRule("_any", "EMAIL")).toBe("email");
  });

  it("resolves mixed case 'PhoneNumber' via normalization", () => {
    // PhoneNumber -> phone_number
    expect(resolveByRule("_any", "PhoneNumber")).toBe("phone");
  });

  it("resolves 'companyName' (camelCase) to 'company_name'", () => {
    expect(resolveByRule("_any", "companyName")).toBe("company_name");
  });

  it("resolves 'billingStreet' (camelCase) to 'address'", () => {
    // billingStreet -> billing_street -> address (global alias)
    expect(resolveByRule("_any", "billingStreet")).toBe("address");
  });
});

// =============================================================================
// resolveByRule — connector-specific aliases
// =============================================================================

describe("resolveByRule — fatture_in_cloud specific", () => {
  it("resolves 'numero' to 'invoice_number'", () => {
    expect(resolveByRule("fatture_in_cloud", "numero")).toBe("invoice_number");
  });

  it("resolves 'data' to 'invoice_date'", () => {
    expect(resolveByRule("fatture_in_cloud", "data")).toBe("invoice_date");
  });

  it("resolves 'importo_netto' to 'net_amount'", () => {
    expect(resolveByRule("fatture_in_cloud", "importo_netto")).toBe("net_amount");
  });

  it("resolves 'importo_ivato' to 'gross_amount'", () => {
    expect(resolveByRule("fatture_in_cloud", "importo_ivato")).toBe("gross_amount");
  });

  it("resolves 'aliquota_iva' to 'vat_rate'", () => {
    expect(resolveByRule("fatture_in_cloud", "aliquota_iva")).toBe("vat_rate");
  });

  it("resolves 'data_scadenza' to 'due_date'", () => {
    expect(resolveByRule("fatture_in_cloud", "data_scadenza")).toBe("due_date");
  });

  it("resolves 'pagato' to 'payment_status'", () => {
    expect(resolveByRule("fatture_in_cloud", "pagato")).toBe("payment_status");
  });

  it("resolves 'tipo_documento' to 'document_type'", () => {
    expect(resolveByRule("fatture_in_cloud", "tipo_documento")).toBe("document_type");
  });

  it("resolves 'anno' to 'fiscal_year'", () => {
    expect(resolveByRule("fatture_in_cloud", "anno")).toBe("fiscal_year");
  });
});

describe("resolveByRule — google_drive specific", () => {
  it("resolves 'mime_type' to 'file_type'", () => {
    expect(resolveByRule("google_drive", "mime_type")).toBe("file_type");
  });

  it("resolves 'modified_time' to 'modified_at'", () => {
    expect(resolveByRule("google_drive", "modified_time")).toBe("modified_at");
  });

  it("resolves 'web_view_link' to 'url'", () => {
    expect(resolveByRule("google_drive", "web_view_link")).toBe("url");
  });

  it("resolves 'name' to 'file_name' (overrides global 'name' -> 'full_name')", () => {
    expect(resolveByRule("google_drive", "name")).toBe("file_name");
  });

  it("resolves 'trashed' to 'is_trashed'", () => {
    expect(resolveByRule("google_drive", "trashed")).toBe("is_trashed");
  });
});

describe("resolveByRule — hubspot specific", () => {
  it("resolves 'jobtitle' to 'job_title'", () => {
    expect(resolveByRule("hubspot", "jobtitle")).toBe("job_title");
  });

  it("resolves 'dealname' to 'deal_name'", () => {
    expect(resolveByRule("hubspot", "dealname")).toBe("deal_name");
  });

  it("resolves 'dealstage' to 'deal_stage'", () => {
    expect(resolveByRule("hubspot", "dealstage")).toBe("deal_stage");
  });

  it("resolves 'hs_object_id' to 'external_id'", () => {
    expect(resolveByRule("hubspot", "hs_object_id")).toBe("external_id");
  });

  it("resolves 'annualrevenue' to 'annual_revenue'", () => {
    expect(resolveByRule("hubspot", "annualrevenue")).toBe("annual_revenue");
  });

  it("resolves 'domain' to 'website'", () => {
    expect(resolveByRule("hubspot", "domain")).toBe("website");
  });
});

describe("resolveByRule — salesforce specific", () => {
  it("resolves 'stage_name' to 'deal_stage'", () => {
    expect(resolveByRule("salesforce", "stage_name")).toBe("deal_stage");
  });

  it("resolves 'opportunity_name' to 'deal_name'", () => {
    expect(resolveByRule("salesforce", "opportunity_name")).toBe("deal_name");
  });

  it("resolves 'is_won' to 'is_won'", () => {
    expect(resolveByRule("salesforce", "is_won")).toBe("is_won");
  });

  it("resolves 'lead_source' to 'lead_source'", () => {
    expect(resolveByRule("salesforce", "lead_source")).toBe("lead_source");
  });
});

describe("resolveByRule — stripe specific", () => {
  it("resolves 'customer_email' to 'email'", () => {
    expect(resolveByRule("stripe", "customer_email")).toBe("email");
  });

  it("resolves 'customer_name' to 'full_name'", () => {
    expect(resolveByRule("stripe", "customer_name")).toBe("full_name");
  });

  it("resolves 'amount_paid' to 'amount'", () => {
    expect(resolveByRule("stripe", "amount_paid")).toBe("amount");
  });

  it("resolves 'subscription' to 'subscription_id'", () => {
    expect(resolveByRule("stripe", "subscription")).toBe("subscription_id");
  });

  it("resolves 'cancel_at_period_end' to 'cancel_at_period_end'", () => {
    expect(resolveByRule("stripe", "cancel_at_period_end")).toBe("cancel_at_period_end");
  });
});

// =============================================================================
// Connector-specific overrides global
// =============================================================================

describe("resolveByRule — connector-specific overrides global", () => {
  it("'name' resolves to 'file_name' for google_drive (not global 'full_name')", () => {
    // google_drive has 'name' -> 'file_name', global has 'name' -> 'full_name'
    expect(resolveByRule("google_drive", "name")).toBe("file_name");
  });

  it("'name' resolves to global 'full_name' for unknown connector", () => {
    expect(resolveByRule("_unknown", "name")).toBe("full_name");
  });
});

// =============================================================================
// resolveByRuleBatch
// =============================================================================

describe("resolveByRuleBatch", () => {
  it("resolves multiple fields in a single batch call", () => {
    const result = resolveByRuleBatch("hubspot", [
      "firstname",
      "lastname",
      "company",
      "jobtitle",
    ]);

    expect(result.size).toBe(4);
    expect(result.get("firstname")).toBe("first_name");
    expect(result.get("lastname")).toBe("last_name");
    expect(result.get("company")).toBe("company_name");
    expect(result.get("jobtitle")).toBe("job_title");
  });

  it("only includes resolved fields in the result", () => {
    const result = resolveByRuleBatch("hubspot", [
      "firstname",
      "unknown_field_xyz",
      "lastname",
    ]);

    expect(result.size).toBe(2);
    expect(result.has("firstname")).toBe(true);
    expect(result.has("unknown_field_xyz")).toBe(false);
    expect(result.has("lastname")).toBe(true);
  });

  it("returns empty map for all unknown fields", () => {
    const result = resolveByRuleBatch("_any", [
      "zzz_unknown_1",
      "zzz_unknown_2",
    ]);

    expect(result.size).toBe(0);
  });

  it("returns empty map for empty input", () => {
    const result = resolveByRuleBatch("hubspot", []);
    expect(result.size).toBe(0);
  });
});

// =============================================================================
// FIELD_ALIASES structure validation
// =============================================================================

describe("FIELD_ALIASES structure", () => {
  it("has _global section", () => {
    expect(FIELD_ALIASES).toHaveProperty("_global");
    expect(Object.keys(FIELD_ALIASES._global).length).toBeGreaterThan(0);
  });

  it("has fatture_in_cloud section", () => {
    expect(FIELD_ALIASES).toHaveProperty("fatture_in_cloud");
  });

  it("has google_drive section", () => {
    expect(FIELD_ALIASES).toHaveProperty("google_drive");
  });

  it("has hubspot section", () => {
    expect(FIELD_ALIASES).toHaveProperty("hubspot");
  });

  it("has salesforce section", () => {
    expect(FIELD_ALIASES).toHaveProperty("salesforce");
  });

  it("has stripe section", () => {
    expect(FIELD_ALIASES).toHaveProperty("stripe");
  });

  it("all alias values are non-empty strings", () => {
    for (const [section, aliases] of Object.entries(FIELD_ALIASES)) {
      for (const [key, value] of Object.entries(aliases)) {
        expect(typeof value).toBe("string");
        expect(value.length, `alias "${key}" in "${section}" is empty`).toBeGreaterThan(0);
      }
    }
  });
});
