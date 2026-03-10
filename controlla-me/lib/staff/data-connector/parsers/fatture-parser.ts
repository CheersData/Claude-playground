/**
 * Fatture in Cloud Parser — Normalizes Fatture in Cloud API v2 objects
 * into a flat FattureRecord format for the crm_records table.
 *
 * Handles: issued invoices, received invoices, clients.
 * Normalizes amounts, dates, entity info, and payment status.
 *
 * Compatible with Fatture in Cloud API v2 (2026).
 */

// ─── Raw API types ───

/**
 * Fattura (invoice) from Fatture in Cloud API v2.
 * Both issued (fatture emesse) and received (fatture ricevute) share this shape.
 */
export interface FattureInCloudInvoice {
  id: number;
  type: "invoice" | "receipt" | "credit_note" | "proforma" | "delivery_note";
  number: number;
  numeration: string;
  date: string;
  year: number;
  subject: string;
  visible_subject: string;
  currency: {
    id: string;
    symbol: string;
    exchange_rate: string;
  };
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
  amount_due_discount: number;
  entity: {
    id: number;
    name: string;
    vat_number: string;
    tax_code: string;
    address_street: string;
    address_city: string;
    address_province: string;
    address_postal_code: string;
    country: string;
  };
  items_list: Array<{
    id: number;
    product_id: number;
    code: string;
    name: string;
    net_price: number;
    gross_price: number;
    vat: {
      id: number;
      value: number;
      description: string;
    };
    qty: number;
    discount: number;
  }>;
  payment_method: {
    id: number;
    name: string;
  };
  status: "not_paid" | "paid" | "reversed";
  e_invoice: boolean;
  ei_status: string;
  /** Additional fields from the API that we capture in rawExtra */
  created_at?: string;
  updated_at?: string;
  notes?: string;
  rivalsa?: number;
  cassa?: number;
  withholding_tax?: number;
  withholding_tax_taxable?: number;
  payment_account?: {
    id: number;
    name: string;
    type: string;
  };
}

/**
 * Client entity from Fatture in Cloud API v2.
 */
export interface FattureInCloudClient {
  id: number;
  code: string;
  name: string;
  type: "person" | "company";
  first_name: string;
  last_name: string;
  contact_person: string;
  vat_number: string;
  tax_code: string;
  address_street: string;
  address_postal_code: string;
  address_city: string;
  address_province: string;
  address_extra: string;
  country: string;
  email: string;
  certified_email: string;
  phone: string;
  fax: string;
  notes: string;
  default_vats: Array<{
    id: number;
    value: number;
    description: string;
  }>;
  bank_name: string;
  bank_iban: string;
  bank_swift_code: string;
  created_at?: string;
  updated_at?: string;
  ei_code?: string;
}

/**
 * Company info from Fatture in Cloud API v2.
 */
export interface FattureInCloudCompany {
  id: number;
  name: string;
  email: string;
  type: "company" | "person";
  access_info?: {
    role: string;
    permissions: Record<string, string>;
    through_accountant: boolean;
  };
  plan_info?: {
    limits: Record<string, unknown>;
    functions: Record<string, boolean>;
    functions_status: Record<string, unknown>;
  };
  accountant_id?: number;
  is_accountant?: boolean;
  vat_number?: string;
  tax_code?: string;
}

// ─── Normalized output type ───

/**
 * Normalized record for the crm_records table.
 * Common shape for both invoices and clients from Fatture in Cloud.
 */
export interface FattureRecord {
  /** Fatture in Cloud object ID (e.g. "fic_inv_123", "fic_cli_456") */
  externalId: string;
  /** Object type: issued_invoice | received_invoice | client */
  objectType: string;
  /** Status for invoices (paid/not_paid/reversed), null for clients */
  status: string | null;
  /** Contact email (for clients) */
  email: string | null;
  /** Entity/client name */
  name: string | null;
  /** Gross amount in decimal (for invoices). Null for clients. */
  amount: number | null;
  /** ISO 4217 currency code. Null for clients. */
  currency: string | null;
  /** Invoice date or client creation date */
  createdAt: string;
  /** Last update date (when available) */
  updatedAt: string | null;

  // ─── Invoice-specific fields ───

  /** Formatted invoice number (e.g. "1/2026") */
  invoiceNumber: string | null;
  /** Invoice date (YYYY-MM-DD) */
  invoiceDate: string | null;
  /** Net amount (before VAT) */
  netAmount: number | null;
  /** VAT amount */
  vatAmount: number | null;
  /** Gross amount (net + VAT) */
  grossAmount: number | null;
  /** Calculated VAT rate from items (e.g. 22) */
  vatRate: number | null;
  /** Invoice document type (invoice, receipt, credit_note, etc.) */
  documentType: string | null;
  /** Payment status: "paid" | "unpaid" | "reversed" */
  paymentStatus: string | null;
  /** Payment method name */
  paymentMethod: string | null;
  /** Whether this is an e-invoice (fattura elettronica) */
  eInvoice: boolean | null;
  /** E-invoice SDI status */
  eInvoiceStatus: string | null;
  /** Invoice subject/description */
  description: string | null;
  /** Invoice fiscal year */
  fiscalYear: number | null;

  // ─── Entity fields (shared by invoices and clients) ───

  /** Company/entity name */
  companyName: string | null;
  /** Partita IVA */
  vatNumber: string | null;
  /** Codice Fiscale */
  taxCode: string | null;
  /** Street address */
  address: string | null;
  /** City */
  city: string | null;
  /** Province */
  province: string | null;
  /** Postal code (CAP) */
  postalCode: string | null;
  /** Country */
  country: string | null;

  // ─── Client-specific fields ───

  /** Client type (person/company) */
  clientType: string | null;
  /** Certified email (PEC) */
  certifiedEmail: string | null;
  /** Phone number */
  phone: string | null;
  /** SDI code (codice destinatario) */
  sdiCode: string | null;

  /** Extra raw fields not in normalized schema */
  rawExtra: Record<string, unknown>;
}

// ─── Parsers ───

/**
 * Parse a Fatture in Cloud invoice into a normalized FattureRecord.
 *
 * @param raw - Raw invoice from the API
 * @param direction - "issued" (fattura emessa) or "received" (fattura ricevuta)
 */
export function parseFattureInvoice(
  raw: FattureInCloudInvoice,
  direction: "issued" | "received"
): FattureRecord {
  const objectType =
    direction === "issued" ? "issued_invoice" : "received_invoice";

  // Calculate dominant VAT rate from items
  const vatRate = calculateDominantVatRate(raw.items_list);

  // Format invoice number: numeration + number / year (e.g. "1/2026")
  const invoiceNumber = raw.numeration
    ? `${raw.numeration}${raw.number}/${raw.year}`
    : `${raw.number}/${raw.year}`;

  return {
    externalId: `fic_${direction}_${raw.id}`,
    objectType,
    status: raw.status,
    email: null,
    name: raw.entity?.name ?? null,
    amount: raw.amount_gross ?? null,
    currency: raw.currency?.id ?? "EUR",
    createdAt: raw.date ?? raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? null,

    // Invoice-specific
    invoiceNumber,
    invoiceDate: raw.date,
    netAmount: raw.amount_net,
    vatAmount: raw.amount_vat,
    grossAmount: raw.amount_gross,
    vatRate,
    documentType: raw.type,
    paymentStatus: mapPaymentStatus(raw.status),
    paymentMethod: raw.payment_method?.name ?? null,
    eInvoice: raw.e_invoice ?? null,
    eInvoiceStatus: raw.ei_status ?? null,
    description: raw.subject || raw.visible_subject || null,
    fiscalYear: raw.year,

    // Entity
    companyName: raw.entity?.name ?? null,
    vatNumber: raw.entity?.vat_number ?? null,
    taxCode: raw.entity?.tax_code ?? null,
    address: raw.entity?.address_street ?? null,
    city: raw.entity?.address_city ?? null,
    province: raw.entity?.address_province ?? null,
    postalCode: raw.entity?.address_postal_code ?? null,
    country: raw.entity?.country ?? null,

    // Client-specific (not applicable to invoices)
    clientType: null,
    certifiedEmail: null,
    phone: null,
    sdiCode: null,

    rawExtra: {
      fic_id: raw.id,
      direction,
      items_count: raw.items_list?.length ?? 0,
      amount_due_discount: raw.amount_due_discount,
      notes: raw.notes ?? null,
      rivalsa: raw.rivalsa ?? null,
      cassa: raw.cassa ?? null,
      withholding_tax: raw.withholding_tax ?? null,
      payment_account: raw.payment_account ?? null,
    },
  };
}

/**
 * Parse a Fatture in Cloud client into a normalized FattureRecord.
 */
export function parseFattureClient(
  raw: FattureInCloudClient
): FattureRecord {
  return {
    externalId: `fic_cli_${raw.id}`,
    objectType: "client",
    status: null,
    email: raw.email || null,
    name: raw.name || formatClientName(raw) || null,
    amount: null,
    currency: null,
    createdAt: raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updated_at ?? null,

    // Invoice-specific (not applicable to clients)
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
    description: raw.notes || null,
    fiscalYear: null,

    // Entity
    companyName: raw.type === "company" ? raw.name : null,
    vatNumber: raw.vat_number || null,
    taxCode: raw.tax_code || null,
    address: raw.address_street || null,
    city: raw.address_city || null,
    province: raw.address_province || null,
    postalCode: raw.address_postal_code || null,
    country: raw.country || null,

    // Client-specific
    clientType: raw.type,
    certifiedEmail: raw.certified_email || null,
    phone: raw.phone || null,
    sdiCode: raw.ei_code ?? null,

    rawExtra: {
      fic_id: raw.id,
      code: raw.code,
      first_name: raw.first_name || null,
      last_name: raw.last_name || null,
      contact_person: raw.contact_person || null,
      fax: raw.fax || null,
      bank_name: raw.bank_name || null,
      bank_iban: raw.bank_iban || null,
      bank_swift_code: raw.bank_swift_code || null,
      default_vats: raw.default_vats ?? [],
    },
  };
}

// ─── Utilities ───

/**
 * Calculate the dominant (most common) VAT rate from invoice items.
 * Returns null if no items or no VAT info.
 */
function calculateDominantVatRate(
  items: FattureInCloudInvoice["items_list"]
): number | null {
  if (!items || items.length === 0) return null;

  // Find the VAT rate with the highest total net amount
  const vatTotals = new Map<number, number>();
  for (const item of items) {
    if (item.vat?.value != null) {
      const current = vatTotals.get(item.vat.value) ?? 0;
      vatTotals.set(item.vat.value, current + item.net_price * item.qty);
    }
  }

  if (vatTotals.size === 0) return null;

  // Return the VAT rate with the highest total
  let maxRate = 0;
  let maxTotal = 0;
  for (const [rate, total] of vatTotals) {
    if (total > maxTotal) {
      maxRate = rate;
      maxTotal = total;
    }
  }

  return maxRate;
}

/**
 * Map Fatture in Cloud payment status to normalized status.
 */
function mapPaymentStatus(
  status: FattureInCloudInvoice["status"]
): string {
  switch (status) {
    case "paid":
      return "paid";
    case "not_paid":
      return "unpaid";
    case "reversed":
      return "reversed";
    default:
      return "unknown";
  }
}

/**
 * Format client full name from parts.
 */
function formatClientName(client: FattureInCloudClient): string | null {
  if (client.name) return client.name;
  const parts = [client.first_name, client.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}
