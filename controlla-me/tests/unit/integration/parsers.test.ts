/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Parsers — Stripe, HubSpot, Google Drive, Salesforce
 *
 * Covers:
 * - Stripe: parseStripeObject for customer, subscription, invoice, payment_intent
 * - HubSpot: parseHubSpotObject for contact, company, deal, ticket
 * - Google Drive: parseDriveFile, mimeToObjectType, isGoogleWorkspaceFormat, isExportableAsText, getExportMimeType
 * - Salesforce: parseSalesforceRecord for Account, Contact, Opportunity, Lead, Case
 */

import { describe, it, expect } from "vitest";

import { parseStripeObject } from "@/lib/staff/data-connector/parsers/stripe-parser";
import { parseHubSpotObject, type HubSpotApiObject } from "@/lib/staff/data-connector/parsers/hubspot-parser";
import {
  parseDriveFile,
  mimeToObjectType,
  isGoogleWorkspaceFormat,
  isExportableAsText,
  getExportMimeType,
  type DriveFileRaw,
} from "@/lib/staff/data-connector/parsers/google-drive-parser";
import { parseSalesforceRecord, type SalesforceApiRecord } from "@/lib/staff/data-connector/parsers/salesforce-parser";

// =============================================================================
// Stripe Parser
// =============================================================================

describe("Stripe Parser", () => {
  describe("parseStripeObject — customer", () => {
    it("parses a customer with all fields", () => {
      const raw = {
        id: "cus_test123",
        object: "customer",
        email: "mario@example.com",
        name: "Mario Rossi",
        currency: "eur",
        created: 1700000000,
        description: "Premium customer",
        phone: "+39 123 456",
        delinquent: false,
        balance: 500,
        default_source: null,
        metadata: { plan: "pro" },
      };

      const result = parseStripeObject("customer", raw as any);

      expect(result.externalId).toBe("cus_test123");
      expect(result.objectType).toBe("customer");
      expect(result.status).toBe("active");
      expect(result.email).toBe("mario@example.com");
      expect(result.name).toBe("Mario Rossi");
      expect(result.amount).toBeNull();
      expect(result.currency).toBe("eur");
      expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString());
      expect(result.customerId).toBe("cus_test123");
      expect(result.subscriptionId).toBeNull();
      expect(result.description).toBe("Premium customer");
      expect(result.stripeMetadata).toEqual({ plan: "pro" });
    });

    it("handles customer with null email and name", () => {
      const raw = {
        id: "cus_null",
        object: "customer",
        email: null,
        name: null,
        currency: null,
        created: 1700000000,
        description: null,
        phone: null,
        delinquent: false,
        balance: 0,
        default_source: null,
        metadata: {},
      };

      const result = parseStripeObject("customer", raw as any);

      expect(result.email).toBeNull();
      expect(result.name).toBeNull();
      expect(result.currency).toBeNull();
    });
  });

  describe("parseStripeObject — subscription", () => {
    it("parses a subscription with plan info", () => {
      const raw = {
        id: "sub_test456",
        object: "subscription",
        status: "active",
        customer: "cus_test123",
        currency: "eur",
        created: 1700000000,
        description: "Pro plan",
        cancel_at_period_end: false,
        trial_start: null,
        trial_end: null,
        items: {
          data: [
            {
              plan: {
                amount: 499,
                currency: "eur",
                interval: "month",
                nickname: "Pro Monthly",
              },
              current_period_start: 1700000000,
              current_period_end: 1702592000,
            },
          ],
        },
        metadata: {},
      };

      const result = parseStripeObject("subscription", raw as any);

      expect(result.externalId).toBe("sub_test456");
      expect(result.objectType).toBe("subscription");
      expect(result.status).toBe("active");
      expect(result.amount).toBe(4.99); // 499 cents -> 4.99
      expect(result.currency).toBe("eur");
      expect(result.customerId).toBe("cus_test123");
      expect(result.subscriptionId).toBe("sub_test456");
      expect(result.interval).toBe("month");
    });
  });

  describe("parseStripeObject — invoice", () => {
    it("parses an invoice with amounts", () => {
      const raw = {
        id: "in_test789",
        object: "invoice",
        status: "paid",
        customer: "cus_test123",
        customer_email: "mario@example.com",
        customer_name: "Mario Rossi",
        currency: "eur",
        amount_due: 4999,
        amount_paid: 4999,
        amount_remaining: 0,
        created: 1700000000,
        description: null,
        number: "INV-001",
        attempted: true,
        hosted_invoice_url: "https://invoice.stripe.com/xxx",
        period_start: 1700000000,
        period_end: 1702592000,
        status_transitions: {
          paid_at: 1700100000,
        },
        parent: {
          subscription_details: {
            subscription: "sub_test456",
          },
        },
        metadata: {},
      };

      const result = parseStripeObject("invoice", raw as any);

      expect(result.externalId).toBe("in_test789");
      expect(result.objectType).toBe("invoice");
      expect(result.status).toBe("paid");
      expect(result.email).toBe("mario@example.com");
      expect(result.name).toBe("Mario Rossi");
      expect(result.amount).toBe(49.99); // 4999 cents -> 49.99
      expect(result.currency).toBe("eur");
      expect(result.subscriptionId).toBe("sub_test456");
    });
  });

  describe("parseStripeObject — payment_intent", () => {
    it("parses a payment intent", () => {
      const raw = {
        id: "pi_testABC",
        object: "payment_intent",
        status: "succeeded",
        customer: "cus_test123",
        amount: 9900,
        amount_received: 9900,
        currency: "eur",
        created: 1700000000,
        receipt_email: "mario@example.com",
        description: "One-time purchase",
        payment_method: "pm_card",
        payment_method_types: ["card"],
        cancellation_reason: null,
        latest_charge: "ch_xxx",
        metadata: {},
      };

      const result = parseStripeObject("payment_intent", raw as any);

      expect(result.externalId).toBe("pi_testABC");
      expect(result.objectType).toBe("payment_intent");
      expect(result.status).toBe("succeeded");
      expect(result.amount).toBe(99.0); // 9900 cents -> 99.00
      expect(result.currency).toBe("eur");
      expect(result.email).toBe("mario@example.com");
      expect(result.description).toBe("One-time purchase");
    });
  });

  describe("parseStripeObject — unknown type fallback", () => {
    it("returns a generic record for unknown type", () => {
      const raw = {
        id: "unknown_123",
        created: 1700000000,
        metadata: { foo: "bar" },
      };

      const result = parseStripeObject("unknown_custom_type", raw as any);

      expect(result.externalId).toBe("unknown_123");
      expect(result.objectType).toBe("unknown_custom_type");
      expect(result.status).toBeNull();
      expect(result.email).toBeNull();
    });
  });
});

// =============================================================================
// HubSpot Parser
// =============================================================================

describe("HubSpot Parser", () => {
  function makeHubSpotObj(
    id: string,
    props: Record<string, string | null>
  ): HubSpotApiObject {
    return {
      id,
      properties: props,
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-06-20T15:30:00Z",
      archived: false,
    };
  }

  describe("parseHubSpotObject — contact", () => {
    it("parses a contact with name and email", () => {
      const obj = makeHubSpotObj("123", {
        email: "mario@example.com",
        firstname: "Mario",
        lastname: "Rossi",
        phone: "+39 123 456",
        company: "ACME Srl",
        lifecyclestage: "customer",
      });

      const result = parseHubSpotObject("contact", obj);

      expect(result.externalId).toBe("123");
      expect(result.objectType).toBe("contact");
      expect(result.displayName).toBe("Mario Rossi");
      expect(result.email).toBe("mario@example.com");
      expect(result.phone).toBe("+39 123 456");
      expect(result.companyName).toBe("ACME Srl");
      expect(result.stage).toBe("customer");
      expect(result.createdAt).toBe("2024-01-15T10:00:00Z");
      expect(result.updatedAt).toBe("2024-06-20T15:30:00Z");
      expect(result.archived).toBe(false);
    });

    it("handles contact with only first name", () => {
      const obj = makeHubSpotObj("456", {
        firstname: "Luigi",
        lastname: null,
        email: null,
        phone: null,
        company: null,
        lifecyclestage: null,
      });

      const result = parseHubSpotObject("contact", obj);
      expect(result.displayName).toBe("Luigi");
    });

    it("handles contact with no names", () => {
      const obj = makeHubSpotObj("789", {
        firstname: null,
        lastname: null,
        email: "anon@example.com",
        phone: null,
        company: null,
        lifecyclestage: null,
      });

      const result = parseHubSpotObject("contact", obj);
      expect(result.displayName).toBeNull();
      expect(result.email).toBe("anon@example.com");
    });
  });

  describe("parseHubSpotObject — company", () => {
    it("parses a company", () => {
      const obj = makeHubSpotObj("100", {
        name: "ACME Srl",
        domain: "acme.it",
        industry: "Technology",
        numberofemployees: "50",
        city: "Milano",
        country: "Italy",
      });

      const result = parseHubSpotObject("company", obj);

      expect(result.objectType).toBe("company");
      expect(result.displayName).toBe("ACME Srl");
      expect(result.companyName).toBe("ACME Srl");
      expect(result.domain).toBe("acme.it");
      expect(result.industry).toBe("Technology");
      expect(result.description).toBe("50 employees");
    });
  });

  describe("parseHubSpotObject — deal", () => {
    it("parses a deal with amount", () => {
      const obj = makeHubSpotObj("200", {
        dealname: "Enterprise License",
        amount: "50000",
        dealstage: "closedwon",
        pipeline: "default",
        closedate: "2024-12-31T00:00:00Z",
      });

      const result = parseHubSpotObject("deal", obj);

      expect(result.objectType).toBe("deal");
      expect(result.displayName).toBe("Enterprise License");
      expect(result.amount).toBe(50000);
      expect(result.stage).toBe("closedwon");
      expect(result.pipeline).toBe("default");
      expect(result.closeDate).toBe("2024-12-31T00:00:00Z");
    });

    it("handles deal with null amount", () => {
      const obj = makeHubSpotObj("201", {
        dealname: "Lead",
        amount: null,
        dealstage: "appointmentscheduled",
        pipeline: null,
        closedate: null,
      });

      const result = parseHubSpotObject("deal", obj);
      expect(result.amount).toBeNull();
    });

    it("handles deal with non-numeric amount", () => {
      const obj = makeHubSpotObj("202", {
        dealname: "Bad Amount",
        amount: "not-a-number",
        dealstage: "qualifiedtobuy",
        pipeline: null,
        closedate: null,
      });

      const result = parseHubSpotObject("deal", obj);
      expect(result.amount).toBeNull();
    });
  });

  describe("parseHubSpotObject — ticket", () => {
    it("parses a ticket", () => {
      const obj = makeHubSpotObj("300", {
        subject: "Login not working",
        content: "Cannot log in since yesterday",
        hs_pipeline: "support",
        hs_pipeline_stage: "1",
        priority: "HIGH",
      });

      const result = parseHubSpotObject("ticket", obj);

      expect(result.objectType).toBe("ticket");
      expect(result.displayName).toBe("Login not working");
      expect(result.description).toBe("Cannot log in since yesterday");
      expect(result.pipeline).toBe("support");
      expect(result.stage).toBe("1");
      expect(result.priority).toBe("HIGH");
    });
  });
});

// =============================================================================
// Google Drive Parser
// =============================================================================

describe("Google Drive Parser", () => {
  describe("mimeToObjectType", () => {
    it("returns 'folder' for Google folder MIME", () => {
      expect(mimeToObjectType("application/vnd.google-apps.folder")).toBe("folder");
    });

    it("returns 'document' for Google Docs MIME", () => {
      expect(mimeToObjectType("application/vnd.google-apps.document")).toBe("document");
    });

    it("returns 'spreadsheet' for Google Sheets MIME", () => {
      expect(mimeToObjectType("application/vnd.google-apps.spreadsheet")).toBe("spreadsheet");
    });

    it("returns 'presentation' for Google Slides MIME", () => {
      expect(mimeToObjectType("application/vnd.google-apps.presentation")).toBe("presentation");
    });

    it("returns 'pdf' for PDF MIME", () => {
      expect(mimeToObjectType("application/pdf")).toBe("pdf");
    });

    it("returns 'image' for image MIME types", () => {
      expect(mimeToObjectType("image/png")).toBe("image");
      expect(mimeToObjectType("image/jpeg")).toBe("image");
    });

    it("returns 'video' for video MIME types", () => {
      expect(mimeToObjectType("video/mp4")).toBe("video");
    });

    it("returns 'audio' for audio MIME types", () => {
      expect(mimeToObjectType("audio/mpeg")).toBe("audio");
    });

    it("returns 'document' for text/* MIME types", () => {
      expect(mimeToObjectType("text/plain")).toBe("document");
      expect(mimeToObjectType("text/html")).toBe("document");
    });

    it("returns 'document' for Word document MIME", () => {
      expect(
        mimeToObjectType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
      ).toBe("document");
    });

    it("returns 'document' for Excel MIME (contains 'document' substring — matches document branch first)", () => {
      // The mimeToObjectType checks for "document"/"word" before "spreadsheet"/"excel"
      // and the MIME "...officedocument.spreadsheetml..." matches "document" first.
      expect(
        mimeToObjectType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      ).toBe("document");
    });

    it("returns 'document' for PowerPoint MIME (contains 'document' substring — matches document branch first)", () => {
      // Same issue: "...officedocument.presentationml..." matches "document" before "presentation"
      expect(
        mimeToObjectType("application/vnd.openxmlformats-officedocument.presentationml.presentation")
      ).toBe("document");
    });

    it("returns 'spreadsheet' for pure Excel MIME (without officedocument prefix)", () => {
      expect(mimeToObjectType("application/vnd.ms-excel")).toBe("spreadsheet");
    });

    it("returns 'presentation' for pure PowerPoint MIME", () => {
      expect(mimeToObjectType("application/vnd.ms-powerpoint")).toBe("presentation");
    });

    it("returns 'other' for unknown MIME types", () => {
      expect(mimeToObjectType("application/octet-stream")).toBe("other");
      expect(mimeToObjectType("application/zip")).toBe("other");
    });
  });

  describe("isGoogleWorkspaceFormat", () => {
    it("returns true for Google Docs", () => {
      expect(isGoogleWorkspaceFormat("application/vnd.google-apps.document")).toBe(true);
    });

    it("returns true for Google Sheets", () => {
      expect(isGoogleWorkspaceFormat("application/vnd.google-apps.spreadsheet")).toBe(true);
    });

    it("returns true for Google Folder", () => {
      expect(isGoogleWorkspaceFormat("application/vnd.google-apps.folder")).toBe(true);
    });

    it("returns false for PDF", () => {
      expect(isGoogleWorkspaceFormat("application/pdf")).toBe(false);
    });

    it("returns false for plain text", () => {
      expect(isGoogleWorkspaceFormat("text/plain")).toBe(false);
    });
  });

  describe("isExportableAsText", () => {
    it("returns true for Docs, Sheets, Slides", () => {
      expect(isExportableAsText("application/vnd.google-apps.document")).toBe(true);
      expect(isExportableAsText("application/vnd.google-apps.spreadsheet")).toBe(true);
      expect(isExportableAsText("application/vnd.google-apps.presentation")).toBe(true);
    });

    it("returns false for folders", () => {
      expect(isExportableAsText("application/vnd.google-apps.folder")).toBe(false);
    });

    it("returns false for non-Google formats", () => {
      expect(isExportableAsText("application/pdf")).toBe(false);
    });
  });

  describe("getExportMimeType", () => {
    it("returns 'text/plain' for Google Docs", () => {
      expect(getExportMimeType("application/vnd.google-apps.document")).toBe("text/plain");
    });

    it("returns 'text/csv' for Google Sheets", () => {
      expect(getExportMimeType("application/vnd.google-apps.spreadsheet")).toBe("text/csv");
    });

    it("returns 'text/plain' for Google Slides", () => {
      expect(getExportMimeType("application/vnd.google-apps.presentation")).toBe("text/plain");
    });

    it("returns null for non-exportable types", () => {
      expect(getExportMimeType("application/pdf")).toBeNull();
      expect(getExportMimeType("application/vnd.google-apps.folder")).toBeNull();
    });
  });

  describe("parseDriveFile", () => {
    it("parses a Google Docs file", () => {
      const raw: DriveFileRaw = {
        id: "abc123",
        name: "My Document",
        mimeType: "application/vnd.google-apps.document",
        createdTime: "2024-01-15T10:00:00Z",
        modifiedTime: "2024-06-20T15:30:00Z",
        parents: ["parent-folder-id"],
        owners: [
          { displayName: "Mario Rossi", emailAddress: "mario@example.com" },
        ],
        shared: true,
        webViewLink: "https://docs.google.com/document/d/abc123",
        trashed: false,
      };

      const result = parseDriveFile(raw, "Some text content");

      expect(result.externalId).toBe("abc123");
      expect(result.objectType).toBe("document");
      expect(result.name).toBe("My Document");
      expect(result.isGoogleFormat).toBe(true);
      expect(result.isFolder).toBe(false);
      expect(result.sizeBytes).toBeNull(); // Google Docs have no size
      expect(result.ownerName).toBe("Mario Rossi");
      expect(result.ownerEmail).toBe("mario@example.com");
      expect(result.shared).toBe(true);
      expect(result.textContent).toBe("Some text content");
      expect(result.trashed).toBe(false);
      expect(result.parents).toEqual(["parent-folder-id"]);
    });

    it("parses a folder", () => {
      const raw: DriveFileRaw = {
        id: "folder123",
        name: "My Folder",
        mimeType: "application/vnd.google-apps.folder",
      };

      const result = parseDriveFile(raw);

      expect(result.objectType).toBe("folder");
      expect(result.isFolder).toBe(true);
      expect(result.isGoogleFormat).toBe(true);
      expect(result.sizeBytes).toBeNull();
    });

    it("parses a PDF with size", () => {
      const raw: DriveFileRaw = {
        id: "pdf123",
        name: "Contract.pdf",
        mimeType: "application/pdf",
        size: "1024000",
        fileExtension: "pdf",
      };

      const result = parseDriveFile(raw);

      expect(result.objectType).toBe("pdf");
      expect(result.sizeBytes).toBe(1024000);
      expect(result.isGoogleFormat).toBe(false);
      expect(result.extension).toBe("pdf");
    });

    it("extracts extension from file name when not in metadata", () => {
      const raw: DriveFileRaw = {
        id: "img123",
        name: "photo.JPG",
        mimeType: "image/jpeg",
      };

      const result = parseDriveFile(raw);

      expect(result.extension).toBe("jpg");
    });

    it("returns null extension for files without extension", () => {
      const raw: DriveFileRaw = {
        id: "noext",
        name: "README",
        mimeType: "text/plain",
      };

      const result = parseDriveFile(raw);

      expect(result.extension).toBeNull();
    });

    it("defaults shared to false and trashed to false", () => {
      const raw: DriveFileRaw = {
        id: "min123",
        name: "Minimal",
        mimeType: "text/plain",
      };

      const result = parseDriveFile(raw);

      expect(result.shared).toBe(false);
      expect(result.trashed).toBe(false);
    });
  });
});

// =============================================================================
// Salesforce Parser
// =============================================================================

describe("Salesforce Parser", () => {
  function makeSfRecord(
    type: string,
    fields: Record<string, unknown>
  ): SalesforceApiRecord {
    return {
      attributes: {
        type,
        url: `/services/data/v62.0/sobjects/${type}/${fields.Id ?? "001000000000000AAA"}`,
      },
      Id: "001000000000000AAA",
      CreatedDate: "2024-01-15T10:00:00.000+0000",
      LastModifiedDate: "2024-06-20T15:30:00.000+0000",
      ...fields,
    } as SalesforceApiRecord;
  }

  describe("parseSalesforceRecord — Account", () => {
    it("parses an Account with all fields", () => {
      const raw = makeSfRecord("Account", {
        Name: "ACME Corporation",
        Industry: "Technology",
        BillingCity: "Milano",
        BillingCountry: "Italy",
        Website: "https://acme.it",
        NumberOfEmployees: 100,
        AnnualRevenue: 5000000,
      });

      const result = parseSalesforceRecord(raw);

      expect(result.objectType).toBe("Account");
      expect(result.displayName).toBe("ACME Corporation");
      expect(result.companyName).toBe("ACME Corporation");
      expect(result.industry).toBe("Technology");
      expect(result.billingCity).toBe("Milano");
      expect(result.billingCountry).toBe("Italy");
      expect(result.website).toBe("https://acme.it");
      expect(result.numberOfEmployees).toBe(100);
      expect(result.amount).toBe(5000000);
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
    });
  });

  describe("parseSalesforceRecord — Contact", () => {
    it("parses a Contact with name and email", () => {
      const raw = makeSfRecord("Contact", {
        Id: "003000000000000AAA",
        FirstName: "Mario",
        LastName: "Rossi",
        Email: "mario@acme.it",
        Phone: "+39 02 1234567",
        AccountId: "001000000000000AAA",
        Title: "CTO",
        Department: "Engineering",
      });

      const result = parseSalesforceRecord(raw);

      expect(result.objectType).toBe("Contact");
      expect(result.displayName).toBe("Mario Rossi");
      expect(result.email).toBe("mario@acme.it");
      expect(result.phone).toBe("+39 02 1234567");
      expect(result.title).toBe("CTO");
      expect(result.description).toBe("Engineering");
      expect(result.accountId).toBe("001000000000000AAA");
    });

    it("handles Contact with only last name", () => {
      const raw = makeSfRecord("Contact", {
        FirstName: null,
        LastName: "Bianchi",
        Email: null,
        Phone: null,
        AccountId: null,
        Title: null,
        Department: null,
      });

      const result = parseSalesforceRecord(raw);
      expect(result.displayName).toBe("Bianchi");
    });
  });

  describe("parseSalesforceRecord — Opportunity", () => {
    it("parses an Opportunity", () => {
      const raw = makeSfRecord("Opportunity", {
        Id: "006000000000000AAA",
        Name: "Enterprise Deal Q4",
        Amount: 150000,
        StageName: "Closed Won",
        CloseDate: "2024-12-31",
        Probability: 100,
        AccountId: "001000000000000AAA",
      });

      const result = parseSalesforceRecord(raw);

      expect(result.objectType).toBe("Opportunity");
      expect(result.displayName).toBe("Enterprise Deal Q4");
      expect(result.amount).toBe(150000);
      expect(result.stage).toBe("Closed Won");
      expect(result.closeDate).toBe("2024-12-31");
      expect(result.probability).toBe(100);
      expect(result.accountId).toBe("001000000000000AAA");
    });

    it("handles Opportunity with null amount", () => {
      const raw = makeSfRecord("Opportunity", {
        Name: "Early Stage",
        Amount: null,
        StageName: "Prospecting",
        CloseDate: null,
        Probability: null,
        AccountId: null,
      });

      const result = parseSalesforceRecord(raw);
      expect(result.amount).toBeNull();
      expect(result.probability).toBeNull();
    });
  });

  describe("parseSalesforceRecord — Lead", () => {
    it("parses a Lead", () => {
      const raw = makeSfRecord("Lead", {
        Id: "00Q000000000000AAA",
        FirstName: "Luigi",
        LastName: "Verdi",
        Email: "luigi@startup.io",
        Company: "StartupIO",
        Status: "Open - Not Contacted",
        LeadSource: "Web",
      });

      const result = parseSalesforceRecord(raw);

      expect(result.objectType).toBe("Lead");
      expect(result.displayName).toBe("Luigi Verdi");
      expect(result.email).toBe("luigi@startup.io");
      expect(result.companyName).toBe("StartupIO");
      expect(result.stage).toBe("Open - Not Contacted");
      expect(result.leadSource).toBe("Web");
    });
  });

  describe("parseSalesforceRecord — Case", () => {
    it("parses a Case", () => {
      const raw = makeSfRecord("Case", {
        Id: "500000000000000AAA",
        Subject: "Login broken",
        Description: "Cannot access the portal since Monday",
        Status: "New",
        Priority: "High",
        Origin: "Email",
        AccountId: "001000000000000AAA",
      });

      const result = parseSalesforceRecord(raw);

      expect(result.objectType).toBe("Case");
      expect(result.displayName).toBe("Login broken");
      expect(result.description).toBe("Cannot access the portal since Monday");
      expect(result.stage).toBe("New");
      expect(result.priority).toBe("High");
      expect(result.origin).toBe("Email");
      expect(result.accountId).toBe("001000000000000AAA");
    });
  });

  describe("parseSalesforceRecord — ID format", () => {
    it("preserves the Salesforce 18-character ID", () => {
      const raw = makeSfRecord("Account", {
        Id: "001xx000003DGbYAAW",
        Name: "Test",
      });

      const result = parseSalesforceRecord(raw);
      expect(result.externalId).toBe("001xx000003DGbYAAW");
    });
  });

  describe("parseSalesforceRecord — objectType detection", () => {
    it("detects type from attributes.type", () => {
      const raw = makeSfRecord("Lead", {
        FirstName: "Test",
        LastName: "User",
      });

      const result = parseSalesforceRecord(raw);
      expect(result.objectType).toBe("Lead");
    });

    it("allows objectType override", () => {
      const raw = makeSfRecord("Lead", {
        FirstName: "Test",
        LastName: "User",
      });

      const result = parseSalesforceRecord(raw, "Contact");
      expect(result.objectType).toBe("Contact");
    });
  });

  describe("parseSalesforceRecord — rawProperties", () => {
    it("includes all fields except attributes in rawProperties", () => {
      const raw = makeSfRecord("Account", {
        Name: "Test Corp",
        CustomField__c: "custom value",
      });

      const result = parseSalesforceRecord(raw);

      expect(result.rawProperties.Name).toBe("Test Corp");
      expect(result.rawProperties.CustomField__c).toBe("custom value");
      expect(result.rawProperties.Id).toBeDefined();
      expect(result.rawProperties.attributes).toBeUndefined();
    });
  });
});
