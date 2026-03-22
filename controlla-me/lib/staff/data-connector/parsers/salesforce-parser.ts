/**
 * Salesforce Parser — Normalizes Salesforce REST API SOQL query responses
 * into flat SalesforceRecord format.
 *
 * Handles: Account, Contact, Opportunity, Lead, Case.
 * Salesforce returns records with an `attributes` object containing `type` and `url`,
 * plus flat fields at the top level of each record.
 *
 * Compatible with Salesforce REST API v62.0 SOQL query responses.
 */

// ─── Salesforce API response types ───

/** Raw Salesforce record from SOQL query response */
export interface SalesforceApiRecord {
  attributes: {
    type: string; // e.g. "Account", "Contact", "Opportunity", "Lead", "Case"
    url: string;  // e.g. "/services/data/v62.0/sobjects/Account/001..."
  };
  Id: string;
  LastModifiedDate?: string; // ISO 8601
  CreatedDate?: string;      // ISO 8601
  // Dynamic fields depending on object type
  [key: string]: unknown;
}

/** Salesforce SOQL query response (paginated) */
export interface SalesforceQueryResponse {
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string; // e.g. "/services/data/v62.0/query/01gxx000000Mz1CAAS-2000"
  records: SalesforceApiRecord[];
}

// ─── Output type ───

export type SalesforceObjectType =
  | "Account" | "Contact" | "Opportunity" | "Lead" | "Case"
  | "Task" | "Event" | "Campaign" | "Product2" | "Order" | "Quote" | "Contract";

export interface SalesforceRecord {
  /** Salesforce record ID (18-char alphanumeric, e.g. "001xx000003DGbYAAW") */
  externalId: string;
  /** Object type: Account | Contact | Opportunity | Lead | Case */
  objectType: SalesforceObjectType;
  /** ISO 8601 creation date */
  createdAt: string;
  /** ISO 8601 last modification date */
  updatedAt: string;

  // ─── Normalized fields (extracted from SOQL response) ───

  /** Display name (varies by object type) */
  displayName: string | null;
  /** Email (Contact, Lead) */
  email: string | null;
  /** Phone (Contact) */
  phone: string | null;
  /** Company/Account name */
  companyName: string | null;
  /** Industry (Account) */
  industry: string | null;
  /** Website (Account) */
  website: string | null;
  /** Stage name (Opportunity) or status (Lead, Case) */
  stage: string | null;
  /** Amount in decimal (Opportunity) or annual revenue (Account) */
  amount: number | null;
  /** Close date ISO 8601 (Opportunity) */
  closeDate: string | null;
  /** Priority (Case) */
  priority: string | null;
  /** Description/subject text */
  description: string | null;
  /** Title/department (Contact) */
  title: string | null;
  /** Lead source (Lead) */
  leadSource: string | null;
  /** Case origin (Case) */
  origin: string | null;
  /** Billing city (Account) */
  billingCity: string | null;
  /** Billing country (Account) */
  billingCountry: string | null;
  /** Number of employees (Account) */
  numberOfEmployees: number | null;
  /** Probability percentage (Opportunity) */
  probability: number | null;
  /** Associated Account ID (Contact, Opportunity, Case) */
  accountId: string | null;

  /** All original Salesforce fields (raw, unmodified) */
  rawProperties: Record<string, unknown>;
}

// ─── Fields requested per object type (SOQL SELECT) ───

export const FIELDS_BY_TYPE: Record<SalesforceObjectType, string[]> = {
  Account: [
    "Id", "Name", "Industry", "BillingCity", "BillingCountry",
    "Website", "NumberOfEmployees", "AnnualRevenue",
    "CreatedDate", "LastModifiedDate",
  ],
  Contact: [
    "Id", "FirstName", "LastName", "Email", "Phone",
    "AccountId", "Title", "Department",
    "CreatedDate", "LastModifiedDate",
  ],
  Opportunity: [
    "Id", "Name", "Amount", "StageName", "CloseDate",
    "Probability", "AccountId",
    "CreatedDate", "LastModifiedDate",
  ],
  Lead: [
    "Id", "FirstName", "LastName", "Email", "Company",
    "Status", "LeadSource",
    "CreatedDate", "LastModifiedDate",
  ],
  Case: [
    "Id", "Subject", "Description", "Status", "Priority",
    "Origin", "AccountId",
    "CreatedDate", "LastModifiedDate",
  ],
  Task: [
    "Id", "Subject", "Description", "Status", "Priority",
    "ActivityDate", "WhoId", "WhatId", "OwnerId",
    "CreatedDate", "LastModifiedDate",
  ],
  Event: [
    "Id", "Subject", "Description", "StartDateTime", "EndDateTime",
    "Location", "IsAllDayEvent", "WhoId", "WhatId", "OwnerId",
    "CreatedDate", "LastModifiedDate",
  ],
  Campaign: [
    "Id", "Name", "Type", "Status", "StartDate", "EndDate",
    "BudgetedCost", "ActualCost", "ExpectedRevenue",
    "NumberSent", "NumberOfResponses", "Description",
    "CreatedDate", "LastModifiedDate",
  ],
  Product2: [
    "Id", "Name", "Description", "ProductCode", "IsActive",
    "Family",
    "CreatedDate", "LastModifiedDate",
  ],
  Order: [
    "Id", "OrderNumber", "Status", "TotalAmount",
    "EffectiveDate", "AccountId", "Description",
    "CreatedDate", "LastModifiedDate",
  ],
  Quote: [
    "Id", "Name", "Status", "TotalPrice", "GrandTotal",
    "ExpirationDate", "OpportunityId", "AccountId",
    "Description",
    "CreatedDate", "LastModifiedDate",
  ],
  Contract: [
    "Id", "ContractNumber", "Status", "StartDate", "EndDate",
    "ContractTerm", "AccountId", "OwnerId", "Description",
    "CreatedDate", "LastModifiedDate",
  ],
};

// ─── Parser ───

/**
 * Parse a Salesforce SOQL record into a normalized SalesforceRecord.
 * Object type is detected from `attributes.type` or passed explicitly.
 */
export function parseSalesforceRecord(
  record: SalesforceApiRecord,
  objectTypeOverride?: SalesforceObjectType
): SalesforceRecord {
  const objectType = (objectTypeOverride ?? record.attributes?.type) as SalesforceObjectType;
  const id = String(record.Id ?? "");
  const createdAt = String(record.CreatedDate ?? new Date().toISOString());
  const updatedAt = String(record.LastModifiedDate ?? createdAt);

  // Build raw properties (exclude `attributes` metadata)
  const rawProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key !== "attributes") {
      rawProperties[key] = value;
    }
  }

  const base: Pick<
    SalesforceRecord,
    "externalId" | "objectType" | "createdAt" | "updatedAt" | "rawProperties"
  > = {
    externalId: id,
    objectType,
    createdAt,
    updatedAt,
    rawProperties,
  };

  switch (objectType) {
    case "Account":
      return {
        ...base,
        displayName: asString(record.Name),
        email: null,
        phone: null,
        companyName: asString(record.Name),
        industry: asString(record.Industry),
        website: asString(record.Website),
        stage: null,
        amount: asNumber(record.AnnualRevenue),
        closeDate: null,
        priority: null,
        description: record.NumberOfEmployees
          ? `${record.NumberOfEmployees} employees`
          : null,
        title: null,
        leadSource: null,
        origin: null,
        billingCity: asString(record.BillingCity),
        billingCountry: asString(record.BillingCountry),
        numberOfEmployees: asNumber(record.NumberOfEmployees),
        probability: null,
        accountId: null,
      };

    case "Contact":
      return {
        ...base,
        displayName: buildContactName(
          asString(record.FirstName),
          asString(record.LastName)
        ),
        email: asString(record.Email),
        phone: asString(record.Phone),
        companyName: null,
        industry: null,
        website: null,
        stage: null,
        amount: null,
        closeDate: null,
        priority: null,
        description: asString(record.Department),
        title: asString(record.Title),
        leadSource: null,
        origin: null,
        billingCity: null,
        billingCountry: null,
        numberOfEmployees: null,
        probability: null,
        accountId: asString(record.AccountId),
      };

    case "Opportunity":
      return {
        ...base,
        displayName: asString(record.Name),
        email: null,
        phone: null,
        companyName: null,
        industry: null,
        website: null,
        stage: asString(record.StageName),
        amount: asNumber(record.Amount),
        closeDate: asString(record.CloseDate),
        priority: null,
        description: asString(record.Name),
        title: null,
        leadSource: null,
        origin: null,
        billingCity: null,
        billingCountry: null,
        numberOfEmployees: null,
        probability: asNumber(record.Probability),
        accountId: asString(record.AccountId),
      };

    case "Lead":
      return {
        ...base,
        displayName: buildContactName(
          asString(record.FirstName),
          asString(record.LastName)
        ),
        email: asString(record.Email),
        phone: null,
        companyName: asString(record.Company),
        industry: null,
        website: null,
        stage: asString(record.Status),
        amount: null,
        closeDate: null,
        priority: null,
        description: null,
        title: null,
        leadSource: asString(record.LeadSource),
        origin: null,
        billingCity: null,
        billingCountry: null,
        numberOfEmployees: null,
        probability: null,
        accountId: null,
      };

    case "Case":
      return {
        ...base,
        displayName: asString(record.Subject),
        email: null,
        phone: null,
        companyName: null,
        industry: null,
        website: null,
        stage: asString(record.Status),
        amount: null,
        closeDate: null,
        priority: asString(record.Priority),
        description: asString(record.Description),
        title: null,
        leadSource: null,
        origin: asString(record.Origin),
        billingCity: null,
        billingCountry: null,
        numberOfEmployees: null,
        probability: null,
        accountId: asString(record.AccountId),
      };

    default:
      return {
        ...base,
        displayName: null,
        email: null,
        phone: null,
        companyName: null,
        industry: null,
        website: null,
        stage: null,
        amount: null,
        closeDate: null,
        priority: null,
        description: null,
        title: null,
        leadSource: null,
        origin: null,
        billingCity: null,
        billingCountry: null,
        numberOfEmployees: null,
        probability: null,
        accountId: null,
      };
  }
}

// ─── Utilities ───

/** Build a display name from first/last name fields */
function buildContactName(
  first: string | null,
  last: string | null
): string | null {
  const parts = [first, last].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Safely cast unknown to string | null */
function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/** Safely cast unknown to number | null */
function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}
