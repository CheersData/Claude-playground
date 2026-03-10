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
      // Sync types: customer, subscription, invoice, payment_intent
      syncTypes: ["customer", "subscription", "invoice", "payment_intent"],
      // Uses STRIPE_SECRET_KEY from env (same key used by app runtime)
      // Works with both sk_test_ (test mode) and sk_live_ (live mode) keys
    },
    lifecycle: "planned",
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
      // Sync types: contact, company, deal, ticket
      syncTypes: ["contact", "company", "deal", "ticket"],
      // Auth modes:
      //   1. API Key (demo): set HUBSPOT_API_KEY env var (private app access token)
      //   2. OAuth2 PKCE (production): configure auth strategy below
      // HubSpot free developer sandbox provides full CRM API access
    },
    lifecycle: "planned",
    estimatedItems: 200, // Rough estimate for demo sandbox
    schedule: {
      deltaInterval: "daily",
    },
    // Demo mode: uses HUBSPOT_API_KEY as Bearer token (private app pattern)
    // Production: switch to oauth2-pkce strategy:
    // auth: {
    //   type: "oauth2-pkce",
    //   config: {
    //     authorizeUrl: "https://app.hubspot.com/oauth/authorize",
    //     tokenUrl: "https://api.hubapi.com/oauth/v1/token",
    //     clientId: "your-hubspot-client-id",
    //     scopes: ["crm.objects.contacts.read", "crm.objects.companies.read", "crm.objects.deals.read", "tickets"],
    //     redirectUri: "https://controlla.me/api/auth/connector-callback",
    //     credentialVaultKey: "hubspot",
    //   },
    // },
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
    },
    lifecycle: "planned",
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
      // Sync types: Account, Contact, Opportunity, Lead, Case
      syncTypes: ["Account", "Contact", "Opportunity", "Lead", "Case"],
      // Auth modes:
      //   1. Access Token (demo): set SALESFORCE_ACCESS_TOKEN env var
      //   2. OAuth2 PKCE (production): configure auth strategy below
      // Salesforce Developer Edition is free: developer.salesforce.com/signup
      // 15,000 API calls/day on free edition
    },
    lifecycle: "planned",
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

// ─── Aggregations ───

export const ALL_INTEGRATION_SOURCES: DataSource[] = [
  ...STRIPE_SOURCES,
  ...HUBSPOT_SOURCES,
  ...GOOGLE_DRIVE_SOURCES,
  ...SALESFORCE_SOURCES,
];

export function getIntegrationSourceById(id: string): DataSource | undefined {
  return ALL_INTEGRATION_SOURCES.find((s) => s.id === id);
}

export function getIntegrationSourcesByConnector(connector: string): DataSource[] {
  return ALL_INTEGRATION_SOURCES.filter((s) => s.connector === connector);
}
