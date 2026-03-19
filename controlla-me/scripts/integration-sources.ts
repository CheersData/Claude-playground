/**
 * Integration Sources — Business data connector configurations.
 *
 * Separate from corpus-sources.ts (legal/medical articles).
 * These sources sync business data (CRM, payments, etc.) into crm_records.
 *
 * Usage:
 *   npx tsx scripts/data-connector.ts connect stripe_business
 *   npx tsx scripts/data-connector.ts load stripe_business --dry-run
 *   npx tsx scripts/data-connector.ts load stripe_business
 */

import type { DataSource } from "@/lib/staff/data-connector/types";

// ─── Stripe Sources ───

export const STRIPE_SOURCES: DataSource[] = [
  {
    id: "stripe_business",
    name: "Stripe Business Data",
    shortName: "Stripe",
    dataType: "crm-records",
    vertical: "business",
    connector: "stripe",
    config: {
      // Sync types — all Stripe object types available for sync
      // Core: customer, subscription, invoice, payment_intent
      // Extended: product, price, charge, refund, dispute, payout, balance_transaction, coupon, checkout_session, payment_method
      syncTypes: [
        "customer", "subscription", "invoice", "payment_intent",
        "product", "price", "charge", "refund", "dispute",
        "payout", "balance_transaction", "coupon", "checkout_session", "payment_method",
      ],
      // Uses STRIPE_SECRET_KEY from env (same key used by app runtime)
      // Works with both sk_test_ (test mode) and sk_live_ (live mode) keys
    },
    lifecycle: "api-tested",  // Connector fully implemented + registered in plugin-registry (2026-03-18)
    estimatedItems: 500, // Rough estimate for demo
    schedule: {
      deltaInterval: "daily",
    },
  },
];

// ─── HubSpot Sources ───

export const HUBSPOT_SOURCES: DataSource[] = [
  {
    id: "hubspot_crm",
    name: "HubSpot CRM",
    shortName: "HubSpot",
    dataType: "crm-records",
    vertical: "business",
    connector: "hubspot",
    config: {
      // Sync types — all HubSpot CRM object types available for sync
      // Core: company (first for association enrichment), contact, deal, ticket, engagement
      // Extended: product, line_item, quote, feedback_submission, call, email, meeting, note, task
      syncTypes: [
        "company", "contact", "deal", "ticket", "engagement",
        "product", "line_item", "quote", "feedback_submission",
        "call", "email", "meeting", "note", "task",
      ],
      // Auth modes:
      //   1. API Key (demo): set HUBSPOT_API_KEY env var (private app access token)
      //   2. OAuth2 PKCE (production): configure auth strategy below
      // HubSpot free developer sandbox provides full CRM API access
    },
    lifecycle: "api-tested",  // Connector fully implemented + registered in plugin-registry (2026-03-18)
    estimatedItems: 200, // Rough estimate for demo sandbox
    schedule: {
      deltaInterval: "daily",
    },
    // Demo mode: uses HUBSPOT_API_KEY as Bearer token (private app pattern)
    // Production: OAuth2 via /api/integrations/hubspot/authorize → callback → vault
    // Auth: uses HUBSPOT_API_KEY env var for demo mode (api-key strategy).
    // In production, the OAuth2 flow is handled by the authorize/callback API routes.
    // The connector reads tokens from the vault when created with vault+userId options.
    // BUG 1 FIX: Use api-key strategy for pipeline/CLI mode (reads HUBSPOT_API_KEY).
    // OAuth2 is handled at the API route level, not at the DataSource config level,
    // because OAuth2 PKCE requires user interaction (browser redirect).
    auth: {
      type: "api-key",
      header: "Authorization",
      envVar: "HUBSPOT_API_KEY",
      prefix: "Bearer ",
    },
    rateLimit: {
      requestsPerSecond: 5, // HubSpot: 100 req/10s, conservative limit
    },
  },
];

// ─── Google Drive Sources ───

export const GOOGLE_DRIVE_SOURCES: DataSource[] = [
  {
    id: "google_drive_files",
    name: "Google Drive Files",
    shortName: "GDrive",
    dataType: "crm-records",
    vertical: "business",
    connector: "google-drive",
    config: {
      // Auth: GOOGLE_API_KEY (read-only, demo) or GOOGLE_SERVICE_ACCOUNT_KEY (server-to-server)
      // Exports text content from Google Docs/Sheets/Slides (set to false to skip)
      exportTextContent: true,
      // Sync types — all Google Drive entity types available for sync
      // Core: files, folders, documents, spreadsheets, presentations
      // Extended: pdfs, images, videos, shared_drives, permissions, comments, revisions
      syncTypes: [
        "file", "folder", "document", "spreadsheet", "presentation",
        "pdf", "image", "video", "shared_drive", "permission", "comment", "revision",
      ],
    },
    lifecycle: "api-tested",  // Connector fully implemented + registered in plugin-registry (2026-03-18)
    estimatedItems: 1000, // Rough estimate for demo
    schedule: {
      deltaInterval: "daily",
    },
    auth: {
      type: "api-key",
      header: "Authorization",
      envVar: "GOOGLE_API_KEY",
      prefix: "Bearer ",
    },
    rateLimit: {
      requestsPerSecond: 10, // Google Drive API: 12,000 queries/min, conservative limit
    },
  },
];

// ─── Salesforce Sources ───

export const SALESFORCE_SOURCES: DataSource[] = [
  {
    id: "salesforce_crm",
    name: "Salesforce CRM",
    shortName: "Salesforce",
    dataType: "crm-records",
    vertical: "business",
    connector: "salesforce",
    config: {
      // Sync types — all Salesforce CRM object types available for sync
      // Core: Account, Contact, Opportunity, Lead, Case
      // Extended: Task, Event, Campaign, Product2, Order, Quote, Contract
      syncTypes: [
        "Account", "Contact", "Opportunity", "Lead", "Case",
        "Task", "Event", "Campaign", "Product2", "Order", "Quote", "Contract",
      ],
      // Auth modes:
      //   1. Access Token (demo): set SALESFORCE_ACCESS_TOKEN env var
      //   2. OAuth2 PKCE (production): configure auth strategy below
      // Salesforce Developer Edition is free: developer.salesforce.com/signup
      // 15,000 API calls/day on free edition
    },
    lifecycle: "api-tested",  // Connector fully implemented + registered in plugin-registry (2026-03-18)
    estimatedItems: 500, // Rough estimate for demo org
    schedule: {
      deltaInterval: "daily",
    },
    // Demo mode: uses SALESFORCE_ACCESS_TOKEN as Bearer token
    // Also requires SALESFORCE_INSTANCE_URL (e.g. https://myorg.my.salesforce.com)
    // Production: switch to oauth2-pkce strategy:
    // auth: {
    //   type: "oauth2-pkce",
    //   config: {
    //     authorizeUrl: "https://login.salesforce.com/services/oauth2/authorize",
    //     tokenUrl: "https://login.salesforce.com/services/oauth2/token",
    //     clientId: "your-salesforce-connected-app-client-id",
    //     scopes: ["api", "refresh_token"],
    //     redirectUri: "https://controlla.me/api/auth/connector-callback",
    //     credentialVaultKey: "salesforce",
    //   },
    // },
    rateLimit: {
      requestsPerSecond: 6, // Salesforce: 15,000/day, conservative limit ~6 req/s
    },
  },
];

// ─── Fatture in Cloud Sources ───

export const FATTURE_SOURCES: DataSource[] = [
  {
    id: "fatture_in_cloud_business",
    name: "Fatture in Cloud",
    shortName: "Fatture",
    dataType: "crm-records",
    vertical: "business",
    connector: "fatture-in-cloud",
    config: {
      // companyId is set per-user via integration_connections.config
      // Sync types — all Fatture in Cloud entity types available for sync
      // Core: issued_invoice, received_invoice, client
      // Extended: supplier, product, quote, order, delivery_note, receipt, fiscal_receipt, credit_note, proforma, f24, cashbook, taxes
      syncTypes: [
        "issued_invoice", "received_invoice", "client",
        "supplier", "product", "quote", "order", "delivery_note",
        "receipt", "fiscal_receipt", "credit_note", "proforma", "f24",
        "cashbook", "taxes",
      ],
    },
    lifecycle: "api-tested",  // Connector fully implemented + registered in plugin-registry (2026-03-18)
    estimatedItems: 1000,
    schedule: {
      deltaInterval: "daily",
    },
    // Auth: OAuth2 per-user via credential vault (sync route handles token injection)
    rateLimit: {
      requestsPerSecond: 5, // Fatture in Cloud: 300 req/min, conservative limit
    },
  },
];

// ─── Aggregations ───

export const ALL_INTEGRATION_SOURCES: DataSource[] = [
  ...STRIPE_SOURCES,
  ...HUBSPOT_SOURCES,
  ...GOOGLE_DRIVE_SOURCES,
  ...SALESFORCE_SOURCES,
  ...FATTURE_SOURCES,
];

export function getIntegrationSourceById(id: string): DataSource | undefined {
  return ALL_INTEGRATION_SOURCES.find((s) => s.id === id);
}

export function getIntegrationSourcesByConnector(connector: string): DataSource[] {
  return ALL_INTEGRATION_SOURCES.filter((s) => s.connector === connector);
}
