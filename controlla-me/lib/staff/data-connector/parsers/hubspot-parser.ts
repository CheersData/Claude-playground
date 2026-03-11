/**
 * HubSpot Parser — Normalizes HubSpot CRM API v3 responses into flat HubSpotRecord format.
 *
 * Handles: Contact, Company, Deal, Ticket.
 * HubSpot stores all custom/standard fields in a nested `properties` object.
 * This parser flattens them into a uniform record structure.
 *
 * Compatible with HubSpot CRM API v3 (https://api.hubapi.com/crm/v3/objects/).
 */

// ─── HubSpot API response types ───

/** Raw HubSpot CRM object from API v3 */
export interface HubSpotApiObject {
  id: string;
  properties: Record<string, string | null>;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601
  archived: boolean;
}

/** HubSpot CRM list response (paginated) */
export interface HubSpotListResponse {
  results: HubSpotApiObject[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
}

/** HubSpot CRM search response (for delta sync) */
export interface HubSpotSearchResponse {
  total: number;
  results: HubSpotApiObject[];
  paging?: {
    next?: {
      after: string;
    };
  };
}

// ─── Output type ───

export type HubSpotObjectType = "contact" | "company" | "deal" | "ticket";

export interface HubSpotRecord {
  /** HubSpot object ID (numeric string, e.g. "12345") */
  externalId: string;
  /** Object type: contact | company | deal | ticket */
  objectType: HubSpotObjectType;
  /** ISO 8601 creation date */
  createdAt: string;
  /** ISO 8601 last modification date */
  updatedAt: string;
  /** Whether the record is archived in HubSpot */
  archived: boolean;

  // ─── Normalized fields (extracted from properties) ───

  /** Display name (varies by object type) */
  displayName: string | null;
  /** Email (contacts only) */
  email: string | null;
  /** Phone (contacts only) */
  phone: string | null;
  /** Company name (companies) or associated company (contacts) */
  companyName: string | null;
  /** Domain (companies only) */
  domain: string | null;
  /** Industry (companies only) */
  industry: string | null;
  /** Lifecycle stage (contacts) or pipeline stage (deals/tickets) */
  stage: string | null;
  /** Pipeline (deals/tickets only) */
  pipeline: string | null;
  /** Amount in decimal (deals only) */
  amount: number | null;
  /** Currency code (deals only, from deal properties) */
  currency: string | null;
  /** Close date ISO 8601 (deals only) */
  closeDate: string | null;
  /** Priority (tickets only) */
  priority: string | null;
  /** Content/description text */
  description: string | null;

  /** All original HubSpot properties (raw, unmodified) */
  rawProperties: Record<string, string | null>;
}

// ─── Properties requested per object type ───

export const PROPERTIES_BY_TYPE: Record<HubSpotObjectType, string[]> = {
  contact: ["email", "firstname", "lastname", "phone", "company", "lifecyclestage"],
  company: ["name", "domain", "industry", "numberofemployees", "city", "country"],
  deal: ["dealname", "amount", "dealstage", "pipeline", "closedate"],
  ticket: ["subject", "content", "hs_pipeline", "hs_pipeline_stage", "priority"],
};

// ─── Parser ───

/**
 * Parse a HubSpot CRM API v3 object into a normalized HubSpotRecord.
 */
export function parseHubSpotObject(
  objectType: HubSpotObjectType,
  obj: HubSpotApiObject
): HubSpotRecord {
  const props = obj.properties ?? {};

  const base: Pick<HubSpotRecord, "externalId" | "objectType" | "createdAt" | "updatedAt" | "archived" | "rawProperties"> = {
    externalId: obj.id,
    objectType,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    archived: obj.archived ?? false,
    rawProperties: props,
  };

  switch (objectType) {
    case "contact":
      return {
        ...base,
        displayName: buildContactName(props.firstname, props.lastname),
        email: props.email ?? null,
        phone: props.phone ?? null,
        companyName: props.company ?? null,
        domain: null,
        industry: null,
        stage: props.lifecyclestage ?? null,
        pipeline: null,
        amount: null,
        currency: null,
        closeDate: null,
        priority: null,
        description: null,
      };

    case "company":
      return {
        ...base,
        displayName: props.name ?? null,
        email: null,
        phone: null,
        companyName: props.name ?? null,
        domain: props.domain ?? null,
        industry: props.industry ?? null,
        stage: null,
        pipeline: null,
        amount: null,
        currency: null,
        closeDate: null,
        priority: null,
        description: props.numberofemployees
          ? `${props.numberofemployees} employees`
          : null,
      };

    case "deal":
      return {
        ...base,
        displayName: props.dealname ?? null,
        email: null,
        phone: null,
        companyName: null,
        domain: null,
        industry: null,
        stage: props.dealstage ?? null,
        pipeline: props.pipeline ?? null,
        amount: parseAmount(props.amount),
        currency: null, // HubSpot stores currency at portal level, not per-deal
        closeDate: props.closedate ?? null,
        priority: null,
        description: props.dealname ?? null,
      };

    case "ticket":
      return {
        ...base,
        displayName: props.subject ?? null,
        email: null,
        phone: null,
        companyName: null,
        domain: null,
        industry: null,
        stage: props.hs_pipeline_stage ?? null,
        pipeline: props.hs_pipeline ?? null,
        amount: null,
        currency: null,
        closeDate: null,
        priority: props.priority ?? null,
        description: props.content ?? null,
      };

    default:
      return {
        ...base,
        displayName: null,
        email: null,
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
      };
  }
}

// ─── Utilities ───

/** Build a display name from first/last name fields */
function buildContactName(
  first: string | null | undefined,
  last: string | null | undefined
): string | null {
  const parts = [first, last].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** Parse a string amount to a number (HubSpot stores amounts as strings) */
function parseAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}
