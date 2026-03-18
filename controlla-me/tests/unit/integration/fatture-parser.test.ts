/**
 * Tests: Fatture in Cloud Parser — Normalizes Fatture in Cloud API v2 objects.
 *
 * Covers:
 * - parseFattureInvoice normalizes issued invoice
 * - parseFattureInvoice normalizes received invoice
 * - parseFattureClient normalizes client entity
 * - VAT rate calculation from items list
 * - missing/null fields handled gracefully
 * - invoice number formatting (numeration + number / year)
 *
 * Pure parser functions — no mocks needed.
 */

import { describe, it, expect } from "vitest";

import {
  parseFattureInvoice,
  parseFattureClient,
  type FattureInCloudInvoice,
  type FattureInCloudClient,
  type FattureRecord,
} from "@/lib/staff/data-connector/parsers/fatture-parser";

// ─── Fixtures ───

function makeInvoice(overrides: Partial<FattureInCloudInvoice> = {}): FattureInCloudInvoice {
  return {
    id: 12345,
    type: "invoice",
    number: 1,
    numeration: "",
    date: "2026-01-15",
    year: 2026,
    subject: "Consulenza legale",
    visible_subject: "Consulenza legale Q1 2026",
    currency: {
      id: "EUR",
      symbol: "€",
      exchange_rate: "1",
    },
    amount_net: 1000,
    amount_vat: 220,
    amount_gross: 1220,
    amount_due_discount: 0,
    entity: {
      id: 100,
      name: "Acme S.r.l.",
      vat_number: "IT12345678901",
      tax_code: "RSSMRA80A01H501Z",
      address_street: "Via Roma 1",
      address_city: "Milano",
      address_province: "MI",
      address_postal_code: "20100",
      country: "IT",
    },
    items_list: [
      {
        id: 1,
        product_id: 10,
        code: "SRV-001",
        name: "Consulenza",
        net_price: 500,
        gross_price: 610,
        vat: { id: 1, value: 22, description: "IVA 22%" },
        qty: 2,
        discount: 0,
      },
    ],
    payment_method: {
      id: 1,
      name: "Bonifico bancario",
    },
    status: "paid",
    e_invoice: true,
    ei_status: "accepted",
    created_at: "2026-01-10T10:00:00Z",
    updated_at: "2026-01-15T14:00:00Z",
    notes: "Pagamento ricevuto",
    ...overrides,
  };
}

function makeClient(overrides: Partial<FattureInCloudClient> = {}): FattureInCloudClient {
  return {
    id: 456,
    code: "CLI-001",
    name: "Mario Rossi S.r.l.",
    type: "company",
    first_name: "Mario",
    last_name: "Rossi",
    contact_person: "Mario Rossi",
    vat_number: "IT98765432101",
    tax_code: "RSSMRA80A01H501Z",
    address_street: "Via Garibaldi 10",
    address_postal_code: "00100",
    address_city: "Roma",
    address_province: "RM",
    address_extra: "",
    country: "IT",
    email: "mario@rossi.it",
    certified_email: "mario@pec.rossi.it",
    phone: "+39 06 1234567",
    fax: "+39 06 7654321",
    notes: "Cliente importante",
    default_vats: [
      { id: 1, value: 22, description: "IVA 22%" },
    ],
    bank_name: "Banca Intesa",
    bank_iban: "IT60X0542811101000000123456",
    bank_swift_code: "BCITITMM",
    created_at: "2025-06-01T08:00:00Z",
    updated_at: "2026-01-10T12:00:00Z",
    ei_code: "XXXXXXX",
    ...overrides,
  };
}

// =============================================================================
// parseFattureInvoice — issued invoice
// =============================================================================

describe("parseFattureInvoice — issued invoice", () => {
  it("sets objectType to 'issued_invoice'", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.objectType).toBe("issued_invoice");
  });

  it("generates correct externalId with 'fic_issued_' prefix", () => {
    const result = parseFattureInvoice(makeInvoice({ id: 999 }), "issued");
    expect(result.externalId).toBe("fic_issued_999");
  });

  it("maps invoice amounts correctly", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");

    // Amounts are now stored in cents (euroToCents)
    expect(result.netAmount).toBe(100000);
    expect(result.vatAmount).toBe(22000);
    expect(result.grossAmount).toBe(122000);
    expect(result.amount).toBe(122000); // gross amount in cents
  });

  it("maps currency from currency.id", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.currency).toBe("EUR");
  });

  it("maps entity fields (company name, VAT, tax code, address)", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");

    expect(result.companyName).toBe("Acme S.r.l.");
    expect(result.vatNumber).toBe("IT12345678901");
    expect(result.taxCode).toBe("RSSMRA80A01H501Z");
    expect(result.address).toBe("Via Roma 1");
    expect(result.city).toBe("Milano");
    expect(result.province).toBe("MI");
    expect(result.postalCode).toBe("20100");
    expect(result.country).toBe("IT");
  });

  it("maps name from entity.name", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.name).toBe("Acme S.r.l.");
  });

  it("maps payment status 'paid' to 'paid'", () => {
    const result = parseFattureInvoice(makeInvoice({ status: "paid" }), "issued");
    expect(result.paymentStatus).toBe("paid");
    expect(result.status).toBe("paid");
  });

  it("maps payment status 'not_paid' to 'unpaid'", () => {
    const result = parseFattureInvoice(makeInvoice({ status: "not_paid" }), "issued");
    expect(result.paymentStatus).toBe("unpaid");
  });

  it("maps payment status 'reversed' to 'reversed'", () => {
    const result = parseFattureInvoice(makeInvoice({ status: "reversed" }), "issued");
    expect(result.paymentStatus).toBe("reversed");
  });

  it("maps payment method name", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.paymentMethod).toBe("Bonifico bancario");
  });

  it("maps e-invoice fields", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.eInvoice).toBe(true);
    expect(result.eInvoiceStatus).toBe("accepted");
  });

  it("maps description from subject or visible_subject", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.description).toBe("Consulenza legale");
  });

  it("falls back to visible_subject when subject is empty", () => {
    const result = parseFattureInvoice(
      makeInvoice({ subject: "", visible_subject: "Visible Subject" }),
      "issued"
    );
    expect(result.description).toBe("Visible Subject");
  });

  it("maps fiscal year", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.fiscalYear).toBe(2026);
  });

  it("maps createdAt from invoice date", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    // normalizeDate now uses .toISOString() which adds time component
    expect(result.createdAt).toBe("2026-01-15T00:00:00.000Z");
  });

  it("maps updatedAt from updated_at", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    // normalizeDate now uses .toISOString() which includes milliseconds
    expect(result.updatedAt).toBe("2026-01-15T14:00:00.000Z");
  });

  it("sets client-specific fields to null for invoices", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");
    expect(result.clientType).toBeNull();
    expect(result.certifiedEmail).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.sdiCode).toBeNull();
  });

  it("populates rawExtra with additional info", () => {
    const result = parseFattureInvoice(makeInvoice(), "issued");

    expect(result.rawExtra.fic_id).toBe(12345);
    expect(result.rawExtra.direction).toBe("issued");
    expect(result.rawExtra.items_count).toBe(1);
    expect(result.rawExtra.notes).toBe("Pagamento ricevuto");
  });
});

// =============================================================================
// parseFattureInvoice — received invoice
// =============================================================================

describe("parseFattureInvoice — received invoice", () => {
  it("sets objectType to 'received_invoice'", () => {
    const result = parseFattureInvoice(makeInvoice(), "received");
    expect(result.objectType).toBe("received_invoice");
  });

  it("generates externalId with 'fic_received_' prefix", () => {
    const result = parseFattureInvoice(makeInvoice({ id: 777 }), "received");
    expect(result.externalId).toBe("fic_received_777");
  });

  it("sets direction in rawExtra to 'received'", () => {
    const result = parseFattureInvoice(makeInvoice(), "received");
    expect(result.rawExtra.direction).toBe("received");
  });
});

// =============================================================================
// Invoice number formatting
// =============================================================================

describe("invoice number formatting", () => {
  it("formats as 'number/year' when numeration is empty", () => {
    const result = parseFattureInvoice(
      makeInvoice({ number: 42, numeration: "", year: 2026 }),
      "issued"
    );
    expect(result.invoiceNumber).toBe("42/2026");
  });

  it("formats as 'numeration + number/year' when numeration is set", () => {
    const result = parseFattureInvoice(
      makeInvoice({ number: 5, numeration: "FE-", year: 2026 }),
      "issued"
    );
    expect(result.invoiceNumber).toBe("FE-5/2026");
  });

  it("formats with numeration prefix 'A/'", () => {
    const result = parseFattureInvoice(
      makeInvoice({ number: 1, numeration: "A/", year: 2026 }),
      "issued"
    );
    expect(result.invoiceNumber).toBe("A/1/2026");
  });
});

// =============================================================================
// VAT rate calculation
// =============================================================================

describe("VAT rate calculation from items", () => {
  it("returns the dominant VAT rate from items list", () => {
    const invoice = makeInvoice({
      items_list: [
        {
          id: 1, product_id: 1, code: "", name: "Item 1",
          net_price: 1000, gross_price: 1220,
          vat: { id: 1, value: 22, description: "IVA 22%" },
          qty: 1, discount: 0,
        },
        {
          id: 2, product_id: 2, code: "", name: "Item 2",
          net_price: 100, gross_price: 104,
          vat: { id: 2, value: 4, description: "IVA 4%" },
          qty: 1, discount: 0,
        },
      ],
    });

    const result = parseFattureInvoice(invoice, "issued");
    // 22% has higher total (1000 * 1 = 1000) than 4% (100 * 1 = 100)
    expect(result.vatRate).toBe(22);
  });

  it("returns correct VAT rate when multiple items have same rate", () => {
    const invoice = makeInvoice({
      items_list: [
        {
          id: 1, product_id: 1, code: "", name: "Item A",
          net_price: 500, gross_price: 610,
          vat: { id: 1, value: 22, description: "IVA 22%" },
          qty: 2, discount: 0,
        },
        {
          id: 2, product_id: 2, code: "", name: "Item B",
          net_price: 300, gross_price: 366,
          vat: { id: 1, value: 22, description: "IVA 22%" },
          qty: 1, discount: 0,
        },
      ],
    });

    const result = parseFattureInvoice(invoice, "issued");
    expect(result.vatRate).toBe(22);
  });

  it("returns null when items_list is empty", () => {
    const invoice = makeInvoice({ items_list: [] });
    const result = parseFattureInvoice(invoice, "issued");
    expect(result.vatRate).toBeNull();
  });

  it("returns null when items_list is undefined", () => {
    const invoice = makeInvoice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoice as any).items_list = undefined;
    const result = parseFattureInvoice(invoice, "issued");
    expect(result.vatRate).toBeNull();
  });

  it("handles items with zero quantity", () => {
    const invoice = makeInvoice({
      items_list: [
        {
          id: 1, product_id: 1, code: "", name: "Zero qty",
          net_price: 100, gross_price: 122,
          vat: { id: 1, value: 22, description: "IVA 22%" },
          qty: 0, discount: 0,
        },
        {
          id: 2, product_id: 2, code: "", name: "Normal",
          net_price: 200, gross_price: 208,
          vat: { id: 2, value: 4, description: "IVA 4%" },
          qty: 1, discount: 0,
        },
      ],
    });

    const result = parseFattureInvoice(invoice, "issued");
    // 4% has total 200 * 1 = 200; 22% has total 100 * 0 = 0
    expect(result.vatRate).toBe(4);
  });
});

// =============================================================================
// parseFattureClient
// =============================================================================

describe("parseFattureClient", () => {
  it("sets objectType to 'client'", () => {
    const result = parseFattureClient(makeClient());
    expect(result.objectType).toBe("client");
  });

  it("generates externalId with 'fic_cli_' prefix", () => {
    const result = parseFattureClient(makeClient({ id: 789 }));
    expect(result.externalId).toBe("fic_cli_789");
  });

  it("maps client name", () => {
    const result = parseFattureClient(makeClient());
    expect(result.name).toBe("Mario Rossi S.r.l.");
  });

  it("maps email", () => {
    const result = parseFattureClient(makeClient());
    expect(result.email).toBe("mario@rossi.it");
  });

  it("maps certified email (PEC)", () => {
    const result = parseFattureClient(makeClient());
    expect(result.certifiedEmail).toBe("mario@pec.rossi.it");
  });

  it("maps phone", () => {
    const result = parseFattureClient(makeClient());
    expect(result.phone).toBe("+39 06 1234567");
  });

  it("maps SDI code from ei_code", () => {
    const result = parseFattureClient(makeClient());
    expect(result.sdiCode).toBe("XXXXXXX");
  });

  it("maps client type", () => {
    const result = parseFattureClient(makeClient({ type: "company" }));
    expect(result.clientType).toBe("company");
  });

  it("maps companyName only for company type", () => {
    const companyResult = parseFattureClient(makeClient({ type: "company", name: "Acme Corp" }));
    expect(companyResult.companyName).toBe("Acme Corp");

    const personResult = parseFattureClient(makeClient({ type: "person", name: "Mario Rossi" }));
    expect(personResult.companyName).toBeNull();
  });

  it("maps entity address fields", () => {
    const result = parseFattureClient(makeClient());

    expect(result.vatNumber).toBe("IT98765432101");
    expect(result.taxCode).toBe("RSSMRA80A01H501Z");
    expect(result.address).toBe("Via Garibaldi 10");
    expect(result.city).toBe("Roma");
    expect(result.province).toBe("RM");
    expect(result.postalCode).toBe("00100");
    expect(result.country).toBe("IT");
  });

  it("maps description from notes", () => {
    const result = parseFattureClient(makeClient({ notes: "Important client" }));
    expect(result.description).toBe("Important client");
  });

  it("sets invoice-specific fields to null for clients", () => {
    const result = parseFattureClient(makeClient());

    expect(result.invoiceNumber).toBeNull();
    expect(result.invoiceDate).toBeNull();
    expect(result.netAmount).toBeNull();
    expect(result.vatAmount).toBeNull();
    expect(result.grossAmount).toBeNull();
    expect(result.vatRate).toBeNull();
    expect(result.documentType).toBeNull();
    expect(result.paymentStatus).toBeNull();
    expect(result.paymentMethod).toBeNull();
    expect(result.eInvoice).toBeNull();
    expect(result.eInvoiceStatus).toBeNull();
    expect(result.fiscalYear).toBeNull();
  });

  it("sets amount and currency to null for clients", () => {
    const result = parseFattureClient(makeClient());
    expect(result.amount).toBeNull();
    expect(result.currency).toBeNull();
  });

  it("sets status to null for clients", () => {
    const result = parseFattureClient(makeClient());
    expect(result.status).toBeNull();
  });

  it("maps createdAt from created_at", () => {
    const result = parseFattureClient(makeClient());
    // normalizeDate now uses .toISOString() which includes milliseconds
    expect(result.createdAt).toBe("2025-06-01T08:00:00.000Z");
  });

  it("maps updatedAt from updated_at", () => {
    const result = parseFattureClient(makeClient());
    // normalizeDate now uses .toISOString() which includes milliseconds
    expect(result.updatedAt).toBe("2026-01-10T12:00:00.000Z");
  });

  it("populates rawExtra with client details", () => {
    const result = parseFattureClient(makeClient());

    expect(result.rawExtra.fic_id).toBe(456);
    expect(result.rawExtra.code).toBe("CLI-001");
    expect(result.rawExtra.first_name).toBe("Mario");
    expect(result.rawExtra.last_name).toBe("Rossi");
    expect(result.rawExtra.bank_iban).toBe("IT60X0542811101000000123456");
  });
});

// =============================================================================
// Missing/null fields handled gracefully
// =============================================================================

describe("graceful handling of missing/null fields", () => {
  it("handles invoice with null entity", () => {
    const invoice = makeInvoice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoice as any).entity = null;

    const result = parseFattureInvoice(invoice, "issued");

    expect(result.companyName).toBeNull();
    expect(result.vatNumber).toBeNull();
    expect(result.name).toBeNull();
  });

  it("handles invoice with null payment_method", () => {
    const invoice = makeInvoice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoice as any).payment_method = null;

    const result = parseFattureInvoice(invoice, "issued");
    expect(result.paymentMethod).toBeNull();
  });

  it("handles invoice with null currency", () => {
    const invoice = makeInvoice();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (invoice as any).currency = null;

    const result = parseFattureInvoice(invoice, "issued");
    expect(result.currency).toBe("EUR"); // Default fallback
  });

  it("handles client with empty strings", () => {
    const client = makeClient({
      email: "",
      certified_email: "",
      phone: "",
      notes: "",
      vat_number: "",
      tax_code: "",
      address_street: "",
      address_city: "",
    });

    const result = parseFattureClient(client);

    // Empty strings should be converted to null
    expect(result.email).toBeNull();
    expect(result.certifiedEmail).toBeNull();
    expect(result.phone).toBeNull();
    expect(result.description).toBeNull();
    expect(result.vatNumber).toBeNull();
    expect(result.taxCode).toBeNull();
    expect(result.address).toBeNull();
    expect(result.city).toBeNull();
  });

  it("handles client with missing created_at (uses current date)", () => {
    const client = makeClient();
    delete client.created_at;

    const result = parseFattureClient(client);

    // Should fall back to current date (ISO string)
    expect(result.createdAt).toBeDefined();
    expect(typeof result.createdAt).toBe("string");
  });

  it("handles client with missing updated_at", () => {
    const client = makeClient();
    delete client.updated_at;

    const result = parseFattureClient(client);
    expect(result.updatedAt).toBeNull();
  });

  it("handles invoice with missing notes and optional fields", () => {
    const invoice = makeInvoice();
    delete invoice.notes;
    delete invoice.rivalsa;
    delete invoice.cassa;
    delete invoice.withholding_tax;

    const result = parseFattureInvoice(invoice, "issued");

    expect(result.rawExtra.notes).toBeNull();
    expect(result.rawExtra.rivalsa).toBeNull();
    expect(result.rawExtra.cassa).toBeNull();
    expect(result.rawExtra.withholding_tax).toBeNull();
  });
});
