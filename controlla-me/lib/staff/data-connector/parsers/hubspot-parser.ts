/**
 * HubSpot Parser — Normalizes HubSpot CRM API v3 responses into flat HubSpotRecord format.
 *
 * Handles 5 object types: Contact, Company, Deal, Ticket, Engagement.
 * HubSpot stores all custom/standard fields in a nested `properties` object.
 * This parser flattens them into a uniform record structure.
 *
 * Associations: HubSpot objects can be linked to each other (deal -> company -> contacts).
 * When fetched with `associations` query param, the API returns an `associations` field
 * with arrays of associated object IDs per type. We store these in the record for
 * downstream use (e.g. enriching a deal with its company name).
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
  /** Associations returned when ?associations=contacts,companies,deals is used */
  associations?: Record<string, {
    results: Array<{
      id: string;
      type: string;
    }>;
  }>;
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

export type HubSpotObjectType =
  | "contact" | "company" | "deal" | "ticket" | "engagement"
  | "product" | "line_item" | "quote" | "feedback_submission"
  | "call" | "email" | "meeting" | "note" | "task";

/** Parsed association: links this record to other HubSpot objects */
export interface HubSpotAssociation {
  /** Associated object's HubSpot ID */
  objectId: string;
  /** Type of the associated object (e.g. "contact", "company", "deal") */
  objectType: string;
  /** HubSpot association type label (e.g. "deal_to_company", "contact_to_company") */
  associationType: string;
}

export interface HubSpotRecord {
  /** HubSpot object ID (numeric string, e.g. "12345") */
  externalId: string;
  /** Object type: contact | company | deal | ticket | engagement */
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

  // ─── Engagement-specific fields ───

  /** Engagement type: NOTE, EMAIL, CALL, MEETING, TASK (engagements only) */
  engagementType: string | null;
  /** Engagement timestamp ISO 8601 (when the engagement occurred) */
  engagementTimestamp: string | null;
  /** Owner ID (HubSpot user who owns this engagement) */
  ownerId: string | null;

  // ─── Associations ───

  /** Associations to other HubSpot objects (populated when fetched with associations param) */
  associations: HubSpotAssociation[];

  /** All original HubSpot properties (raw, unmodified) */
  rawProperties: Record<string, string | null>;
}

// ─── Properties requested per object type ───

export const PROPERTIES_BY_TYPE: Record<HubSpotObjectType, string[]> = {
  contact: [
    "email", "firstname", "lastname", "phone", "company",
    "lifecyclestage", "lastmodifieddate",
  ],
  company: [
    "name", "domain", "industry", "numberofemployees",
    "city", "country", "lastmodifieddate",
  ],
  deal: [
    "dealname", "amount", "dealstage", "pipeline",
    "closedate", "lastmodifieddate",
  ],
  ticket: [
    "subject", "content", "hs_pipeline", "hs_pipeline_stage",
    "priority", "lastmodifieddate",
  ],
  engagement: [
    "hs_engagement_type", "hs_timestamp", "hs_body_preview",
    "hubspot_owner_id", "hs_activity_type",
    "hs_call_duration", "hs_call_disposition",
    "hs_meeting_title", "hs_meeting_start_time", "hs_meeting_end_time",
    "hs_task_subject", "hs_task_status", "hs_task_priority",
    "lastmodifieddate",
  ],
  product: [
    "name", "description", "price", "hs_sku", "hs_cost_of_goods_sold",
    "tax", "hs_recurring_billing_period",
    "lastmodifieddate",
  ],
  line_item: [
    "name", "quantity", "amount", "price", "discount",
    "hs_product_id", "hs_line_item_currency_code",
    "lastmodifieddate",
  ],
  quote: [
    "hs_title", "hs_status", "hs_expiration_date",
    "hs_quote_amount", "hs_currency",
    "hs_sender_firstname", "hs_sender_lastname",
    "lastmodifieddate",
  ],
  feedback_submission: [
    "hs_content", "hs_response_group", "hs_submission_timestamp",
    "hs_survey_channel", "hs_survey_type",
    "lastmodifieddate",
  ],
  call: [
    "hs_call_title", "hs_call_body", "hs_call_duration",
    "hs_call_disposition", "hs_call_direction",
    "hs_call_from_number", "hs_call_to_number",
    "hs_timestamp", "hubspot_owner_id",
    "lastmodifieddate",
  ],
  email: [
    "hs_email_subject", "hs_email_text", "hs_email_status",
    "hs_email_direction", "hs_email_sender_email",
    "hs_timestamp", "hubspot_owner_id",
    "lastmodifieddate",
  ],
  meeting: [
    "hs_meeting_title", "hs_meeting_body",
    "hs_meeting_start_time", "hs_meeting_end_time",
    "hs_meeting_location", "hs_meeting_outcome",
    "hs_timestamp", "hubspot_owner_id",
    "lastmodifieddate",
  ],
  note: [
    "hs_note_body", "hs_timestamp",
    "hubspot_owner_id",
    "lastmodifieddate",
  ],
  task: [
    "hs_task_subject", "hs_task_body", "hs_task_status",
    "hs_task_priority", "hs_task_type",
    "hs_timestamp", "hubspot_owner_id",
    "lastmodifieddate",
  ],
};

/**
 * Association types to request per object type.
 * Used to build the `associations` query parameter in list/search requests.
 * HubSpot API v3: ?associations=contacts,companies,deals
 */
export const ASSOCIATIONS_BY_TYPE: Record<HubSpotObjectType, string[]> = {
  contact: ["companies"],
  company: ["contacts", "deals"],
  deal: ["contacts", "companies"],
  ticket: ["contacts", "companies"],
  engagement: ["contacts", "companies", "deals", "tickets"],
  product: [],
  line_item: ["deals"],
  quote: ["contacts", "companies", "deals"],
  feedback_submission: ["contacts"],
  call: ["contacts", "companies", "deals"],
  email: ["contacts", "companies", "deals"],
  meeting: ["contacts", "companies", "deals"],
  note: ["contacts", "companies", "deals"],
  task: ["contacts", "companies", "deals"],
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
  const associations = parseAssociations(obj.associations);

  const base: Pick<
    HubSpotRecord,
    "externalId" | "objectType" | "createdAt" | "updatedAt" | "archived" | "rawProperties" | "associations"
  > = {
    externalId: obj.id,
    objectType,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    archived: obj.archived ?? false,
    rawProperties: props,
    associations,
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
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
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
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
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
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
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
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
      };

    case "engagement":
      return {
        ...base,
        displayName: buildEngagementDisplayName(props),
        email: null,
        phone: null,
        companyName: null,
        domain: null,
        industry: null,
        stage: props.hs_task_status ?? null,
        pipeline: null,
        amount: null,
        currency: null,
        closeDate: null,
        priority: props.hs_task_priority ?? null,
        description: props.hs_body_preview ?? null,
        engagementType: props.hs_engagement_type ?? props.hs_activity_type ?? null,
        engagementTimestamp: props.hs_timestamp
          ? timestampMsToISO(props.hs_timestamp)
          : null,
        ownerId: props.hubspot_owner_id ?? null,
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
        engagementType: null,
        engagementTimestamp: null,
        ownerId: null,
      };
  }
}

/**
 * Parse a batch of HubSpot API objects into normalized HubSpotRecords.
 * Convenience function for processing paginated results.
 */
export function parseHubSpotBatch(
  objectType: HubSpotObjectType,
  objects: HubSpotApiObject[]
): HubSpotRecord[] {
  return objects.map((obj) => parseHubSpotObject(objectType, obj));
}

/**
 * Enrich records with association data.
 * Given a map of HubSpot IDs to display names (e.g. company names),
 * populate the companyName field on deal/contact records that have
 * an association to that company.
 *
 * This is a post-processing step: fetch all types, then cross-reference.
 */
export function enrichRecordsWithAssociations(
  records: HubSpotRecord[],
  companyNames: Map<string, string>
): HubSpotRecord[] {
  return records.map((record) => {
    if (record.companyName) return record; // Already has a company name

    // Find first company association and resolve its display name
    const companyAssoc = record.associations.find(
      (a) => a.objectType === "companies" || a.objectType === "company"
    );
    if (companyAssoc && companyNames.has(companyAssoc.objectId)) {
      return {
        ...record,
        companyName: companyNames.get(companyAssoc.objectId) ?? null,
      };
    }

    return record;
  });
}

/**
 * Build a company name lookup map from parsed company records.
 * Used by enrichRecordsWithAssociations().
 */
export function buildCompanyNameMap(
  records: HubSpotRecord[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const record of records) {
    if (record.objectType === "company" && record.displayName) {
      map.set(record.externalId, record.displayName);
    }
  }
  return map;
}

// ─── Association parser ───

/**
 * Parse the raw associations object from a HubSpot API response into
 * a flat array of HubSpotAssociation.
 *
 * HubSpot API v3 returns associations like:
 * {
 *   "companies": { "results": [{ "id": "123", "type": "deal_to_company" }] },
 *   "contacts": { "results": [{ "id": "456", "type": "deal_to_contact" }] }
 * }
 */
function parseAssociations(
  raw: HubSpotApiObject["associations"]
): HubSpotAssociation[] {
  if (!raw) return [];

  const result: HubSpotAssociation[] = [];
  for (const [objectType, data] of Object.entries(raw)) {
    if (data?.results) {
      for (const assoc of data.results) {
        result.push({
          objectId: assoc.id,
          objectType,
          associationType: assoc.type,
        });
      }
    }
  }

  return result;
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

/** Build a display name for engagement objects */
function buildEngagementDisplayName(
  props: Record<string, string | null>
): string | null {
  const type = props.hs_engagement_type ?? props.hs_activity_type;
  if (!type) return props.hs_body_preview?.slice(0, 80) ?? null;

  switch (type.toUpperCase()) {
    case "NOTE":
      return props.hs_body_preview
        ? `Note: ${props.hs_body_preview.slice(0, 60)}`
        : "Note";
    case "EMAIL":
      return props.hs_body_preview
        ? `Email: ${props.hs_body_preview.slice(0, 60)}`
        : "Email";
    case "CALL":
      return props.hs_call_disposition
        ? `Call (${props.hs_call_disposition})`
        : "Call";
    case "MEETING":
      return props.hs_meeting_title ?? "Meeting";
    case "TASK":
      return props.hs_task_subject ?? "Task";
    default:
      return `${type}: ${props.hs_body_preview?.slice(0, 60) ?? ""}`.trim();
  }
}

/** Parse a string amount to a number (HubSpot stores amounts as strings) */
function parseAmount(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Convert HubSpot timestamp (milliseconds since epoch) to ISO 8601.
 * HubSpot's hs_timestamp property is in milliseconds.
 */
function timestampMsToISO(ms: string | null | undefined): string | null {
  if (!ms) return null;
  const num = parseInt(ms, 10);
  if (isNaN(num)) return null;
  return new Date(num).toISOString();
}
