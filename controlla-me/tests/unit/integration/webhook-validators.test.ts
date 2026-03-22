/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Webhook Validators — Per-provider webhook signature verification.
 *
 * Covers:
 * - HubSpot v3 signature (valid, invalid, expired timestamp)
 * - Fatture in Cloud signature (HMAC, IP whitelist fallback)
 * - Google Drive channel token (valid, invalid, sync confirmation)
 * - Stripe signature (valid, invalid, expired timestamp)
 * - Replay attack prevention (timestamp > 5 min for HubSpot & Stripe)
 * - Validator registry (getWebhookValidator, listWebhookConnectors)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

import {
  validateHubSpotWebhook,
  validateFattureInCloudWebhook,
  validateGoogleDriveWebhook,
  validateStripeWebhook,
  getWebhookValidator,
  listWebhookConnectors,
  type WebhookValidatorConfig,
} from "@/lib/staff/data-connector/webhook-validators";

// ─── Helpers ───

function makeHeaders(headerMap: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(headerMap)) {
    h.set(k, v);
  }
  return h;
}

function makeConfig(overrides: Partial<WebhookValidatorConfig> = {}): WebhookValidatorConfig {
  return {
    rawBody: overrides.rawBody ?? '{"test": true}',
    headers: overrides.headers ?? new Headers(),
    requestUrl: overrides.requestUrl ?? "https://example.com/api/webhook/hubspot",
    method: overrides.method ?? "POST",
    secret: overrides.secret ?? "test-secret-key",
  };
}

// =============================================================================
// HubSpot v3 Signature
// =============================================================================

describe("validateHubSpotWebhook", () => {
  const secret = "hubspot-client-secret";
  const rawBody = '{"objectId": 123}';
  const requestUrl = "https://example.com/api/integrations/webhook/hubspot";
  const method = "POST";

  function buildValidHubSpotConfig(timestampOverride?: number): WebhookValidatorConfig {
    const timestamp = String(timestampOverride ?? Date.now());
    const sourceString = method.toUpperCase() + requestUrl + rawBody + timestamp;
    const signature = createHmac("sha256", secret)
      .update(sourceString)
      .digest("base64");

    return makeConfig({
      rawBody,
      requestUrl,
      method,
      secret,
      headers: makeHeaders({
        "x-hubspot-signature-v3": signature,
        "x-hubspot-request-timestamp": timestamp,
      }),
    });
  }

  it("validates a correct HubSpot v3 signature", () => {
    const config = buildValidHubSpotConfig();
    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects when X-HubSpot-Signature-v3 header is missing", () => {
    const config = makeConfig({
      rawBody,
      requestUrl,
      method,
      secret,
      headers: makeHeaders({
        "x-hubspot-request-timestamp": String(Date.now()),
      }),
    });

    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing X-HubSpot-Signature-v3");
  });

  it("rejects when timestamp header is missing", () => {
    const config = makeConfig({
      rawBody,
      requestUrl,
      method,
      secret,
      headers: makeHeaders({
        "x-hubspot-signature-v3": "some-signature",
      }),
    });

    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing X-HubSpot-Request-Timestamp");
  });

  it("rejects an invalid (tampered) signature", () => {
    const timestamp = String(Date.now());
    const config = makeConfig({
      rawBody,
      requestUrl,
      method,
      secret,
      headers: makeHeaders({
        "x-hubspot-signature-v3": Buffer.from("invalid-signature-data").toString("base64"),
        "x-hubspot-request-timestamp": timestamp,
      }),
    });

    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(false);
    // Could be "Signature length mismatch" or "Signature verification failed"
    expect(result.reason).toBeDefined();
  });

  it("rejects a timestamp older than 5 minutes (replay attack)", () => {
    const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
    const config = buildValidHubSpotConfig(oldTimestamp);
    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("replay");
  });

  it("rejects a timestamp in the future beyond 5 minutes", () => {
    const futureTimestamp = Date.now() + 6 * 60 * 1000; // 6 minutes in future
    const config = buildValidHubSpotConfig(futureTimestamp);
    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("replay");
  });

  it("accepts a timestamp just under 5 minutes (edge case)", () => {
    const recentTimestamp = Date.now() - 4 * 60 * 1000; // 4 minutes ago
    const config = buildValidHubSpotConfig(recentTimestamp);
    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(true);
  });

  it("rejects non-numeric timestamp", () => {
    const config = makeConfig({
      rawBody,
      requestUrl,
      method,
      secret,
      headers: makeHeaders({
        "x-hubspot-signature-v3": "dummy",
        "x-hubspot-request-timestamp": "not-a-number",
      }),
    });

    const result = validateHubSpotWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid timestamp");
  });
});

// =============================================================================
// Fatture in Cloud Signature
// =============================================================================

describe("validateFattureInCloudWebhook", () => {
  const secret = "fic-webhook-secret";
  const rawBody = '{"hookId": "abc", "event": "invoice.created"}';

  it("validates a correct HMAC-SHA256 signature", () => {
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "x-fic-signature": signature,
      }),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "x-fic-signature": "0".repeat(64), // Wrong hex signature
      }),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Signature verification failed");
  });

  it("accepts a whitelisted IP when no signature header", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "x-forwarded-for": "52.30.88.144",
      }),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(true);
  });

  it("accepts a whitelisted IP from x-real-ip", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "x-real-ip": "52.48.176.224",
      }),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(true);
  });

  it("rejects non-whitelisted IP when no signature", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "x-forwarded-for": "1.2.3.4",
      }),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("No X-FIC-Signature header and IP not in whitelist");
  });

  it("rejects when no signature and no IP headers", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: new Headers(),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(false);
  });

  it("handles x-forwarded-for with multiple IPs (takes first)", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "x-forwarded-for": "34.249.42.139, 10.0.0.1, 172.16.0.1",
      }),
    });

    const result = validateFattureInCloudWebhook(config);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Google Drive Channel Token
// =============================================================================

describe("validateGoogleDriveWebhook", () => {
  const secret = "gdrive-channel-secret-token";

  it("validates a correct channel token", () => {
    const config = makeConfig({
      secret,
      headers: makeHeaders({
        "x-goog-channel-token": secret,
        "x-goog-resource-state": "update",
      }),
    });

    const result = validateGoogleDriveWebhook(config);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects when X-Goog-Channel-Token is missing", () => {
    const config = makeConfig({
      secret,
      headers: makeHeaders({
        "x-goog-resource-state": "update",
      }),
    });

    const result = validateGoogleDriveWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing X-Goog-Channel-Token");
  });

  it("rejects an incorrect channel token", () => {
    const config = makeConfig({
      secret,
      headers: makeHeaders({
        "x-goog-channel-token": "wrong-token-value",
        "x-goog-resource-state": "update",
      }),
    });

    const result = validateGoogleDriveWebhook(config);
    expect(result.valid).toBe(false);
    // Could be length mismatch or verification failed
    expect(result.reason).toBeDefined();
  });

  it("accepts sync confirmation with reason annotation", () => {
    const config = makeConfig({
      secret,
      headers: makeHeaders({
        "x-goog-channel-token": secret,
        "x-goog-resource-state": "sync",
      }),
    });

    const result = validateGoogleDriveWebhook(config);
    expect(result.valid).toBe(true);
    expect(result.reason).toContain("sync confirmation");
  });

  it("accepts change notification (resource-state = change)", () => {
    const config = makeConfig({
      secret,
      headers: makeHeaders({
        "x-goog-channel-token": secret,
        "x-goog-resource-state": "change",
      }),
    });

    const result = validateGoogleDriveWebhook(config);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

// =============================================================================
// Stripe Signature
// =============================================================================

describe("validateStripeWebhook", () => {
  const secret = "whsec_test_secret_key";
  const rawBody = '{"id": "evt_123", "type": "invoice.paid"}';

  function buildValidStripeConfig(timestampOverride?: number): WebhookValidatorConfig {
    const timestamp = timestampOverride ?? Math.floor(Date.now() / 1000);
    const signedPayload = `${timestamp}.${rawBody}`;
    const signature = createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    return makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      }),
    });
  }

  it("validates a correct Stripe signature", () => {
    const config = buildValidStripeConfig();
    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(true);
  });

  it("rejects when Stripe-Signature header is missing", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: new Headers(),
    });

    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Missing Stripe-Signature");
  });

  it("rejects a malformed Stripe-Signature header", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "stripe-signature": "malformed_header_value",
      }),
    });

    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Malformed Stripe-Signature");
  });

  it("rejects a tampered signature", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "stripe-signature": `t=${timestamp},v1=${"a".repeat(64)}`,
      }),
    });

    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Signature verification failed");
  });

  it("rejects a timestamp older than 5 minutes (replay attack)", () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 6 * 60; // 6 minutes ago
    const config = buildValidStripeConfig(oldTimestamp);
    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Timestamp outside acceptable range");
  });

  it("accepts a timestamp just under 5 minutes", () => {
    const recentTimestamp = Math.floor(Date.now() / 1000) - 4 * 60; // 4 minutes ago
    const config = buildValidStripeConfig(recentTimestamp);
    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(true);
  });

  it("rejects non-numeric timestamp in signature", () => {
    const config = makeConfig({
      rawBody,
      secret,
      headers: makeHeaders({
        "stripe-signature": "t=not-a-number,v1=abc123",
      }),
    });

    const result = validateStripeWebhook(config);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Invalid timestamp");
  });
});

// =============================================================================
// Validator Registry
// =============================================================================

describe("Validator Registry", () => {
  it("getWebhookValidator returns correct validator for known connectors", () => {
    expect(getWebhookValidator("hubspot")).toBe(validateHubSpotWebhook);
    expect(getWebhookValidator("fatture-in-cloud")).toBe(validateFattureInCloudWebhook);
    expect(getWebhookValidator("google-drive")).toBe(validateGoogleDriveWebhook);
    expect(getWebhookValidator("stripe")).toBe(validateStripeWebhook);
  });

  it("getWebhookValidator returns null for unknown connector", () => {
    expect(getWebhookValidator("unknown-connector")).toBeNull();
    expect(getWebhookValidator("")).toBeNull();
  });

  it("listWebhookConnectors returns all registered connectors", () => {
    const connectors = listWebhookConnectors();
    expect(connectors).toContain("hubspot");
    expect(connectors).toContain("fatture-in-cloud");
    expect(connectors).toContain("google-drive");
    expect(connectors).toContain("stripe");
    expect(connectors.length).toBe(4);
  });
});
