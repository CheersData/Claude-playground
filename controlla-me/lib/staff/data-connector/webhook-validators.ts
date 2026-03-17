/**
 * Webhook Signature Validators — Per-provider webhook verification.
 *
 * Each provider sends webhooks with different signature schemes:
 *   - HubSpot: X-HubSpot-Signature-v3 (HMAC SHA-256 of requestMethod + requestUri + body + timestamp)
 *   - Fatture in Cloud: custom header X-FIC-Signature (HMAC SHA-256) or IP whitelist
 *   - Stripe: Stripe-Signature (handled separately by existing webhook route)
 *   - Google Drive: push notifications via X-Goog-Channel-Token (shared secret)
 *
 * All validators return { valid: boolean; reason?: string }.
 * On failure, the reason string is safe to log (no secrets).
 *
 * Security notes:
 * - Uses crypto.timingSafeEqual for all HMAC comparisons (constant-time)
 * - Timestamp validation prevents replay attacks (5 minute window)
 * - Webhook secrets are stored in the credential vault per-user or in env vars
 */

import { createHmac, timingSafeEqual } from "crypto";

// ─── Types ───

export interface WebhookValidationResult {
  valid: boolean;
  reason?: string;
}

export interface WebhookValidatorConfig {
  /** The raw request body (as string — must be read before parsing) */
  rawBody: string;
  /** All request headers */
  headers: Headers;
  /** Full request URL (for HubSpot v3 signature) */
  requestUrl: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** HMAC secret for signature validation (from vault or env) */
  secret: string;
}

// ─── HubSpot ───

/**
 * Validates HubSpot webhook signature v3.
 *
 * HubSpot v3 signature algorithm:
 *   1. Concatenate: requestMethod + requestUri + requestBody + timestamp
 *   2. HMAC SHA-256 with client secret
 *   3. Base64-encode the result
 *   4. Compare with X-HubSpot-Signature-v3 header
 *
 * Also validates X-HubSpot-Request-Timestamp to prevent replay attacks.
 *
 * @see https://developers.hubspot.com/docs/api/webhooks#signature-v3
 */
export function validateHubSpotWebhook(
  config: WebhookValidatorConfig
): WebhookValidationResult {
  const signature = config.headers.get("x-hubspot-signature-v3");
  const timestamp = config.headers.get("x-hubspot-request-timestamp");

  if (!signature) {
    return { valid: false, reason: "Missing X-HubSpot-Signature-v3 header" };
  }

  if (!timestamp) {
    return { valid: false, reason: "Missing X-HubSpot-Request-Timestamp header" };
  }

  // Replay attack prevention: reject timestamps older than 5 minutes
  const timestampMs = parseInt(timestamp, 10);
  if (isNaN(timestampMs)) {
    return { valid: false, reason: "Invalid timestamp format" };
  }

  const now = Date.now();
  const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
  if (Math.abs(now - timestampMs) > MAX_AGE_MS) {
    return { valid: false, reason: "Timestamp outside acceptable range (replay protection)" };
  }

  // Build the source string: METHOD + URI + BODY + TIMESTAMP
  const sourceString =
    config.method.toUpperCase() + config.requestUrl + config.rawBody + timestamp;

  const expectedSignature = createHmac("sha256", config.secret)
    .update(sourceString)
    .digest("base64");

  // Constant-time comparison
  try {
    const sigBuffer = Buffer.from(signature, "base64");
    const expectedBuffer = Buffer.from(expectedSignature, "base64");

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: "Signature verification failed" };
    }
  } catch {
    return { valid: false, reason: "Signature comparison error" };
  }

  return { valid: true };
}

// ─── Fatture in Cloud ───

/**
 * Validates Fatture in Cloud webhook signature.
 *
 * Fatture in Cloud uses a custom HMAC-SHA256 signature in X-FIC-Signature header.
 * The signature is computed over the raw request body using the webhook secret
 * configured in the Fatture in Cloud dashboard.
 *
 * Fallback: If no signature header is present, validates against IP whitelist.
 * Fatture in Cloud sends webhooks from known IP ranges.
 *
 * @see https://developers.fattureincloud.it/docs/webhooks
 */
export function validateFattureInCloudWebhook(
  config: WebhookValidatorConfig
): WebhookValidationResult {
  const signature = config.headers.get("x-fic-signature");

  if (signature) {
    // HMAC-SHA256 verification
    const expectedSignature = createHmac("sha256", config.secret)
      .update(config.rawBody)
      .digest("hex");

    try {
      const sigBuffer = Buffer.from(signature, "hex");
      const expectedBuffer = Buffer.from(expectedSignature, "hex");

      if (sigBuffer.length !== expectedBuffer.length) {
        return { valid: false, reason: "Signature length mismatch" };
      }

      if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, reason: "Signature verification failed" };
      }
    } catch {
      return { valid: false, reason: "Signature comparison error" };
    }

    return { valid: true };
  }

  // Fallback: IP whitelist
  // Fatture in Cloud sends webhooks from these known IP ranges
  const FATTURE_WEBHOOK_IPS = new Set([
    "52.30.88.144",
    "52.48.176.224",
    "34.249.42.139",
    "52.213.165.136",
  ]);

  const clientIp =
    config.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    config.headers.get("x-real-ip") ||
    "";

  if (FATTURE_WEBHOOK_IPS.has(clientIp)) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: "No X-FIC-Signature header and IP not in whitelist",
  };
}

// ─── Google Drive ───

/**
 * Validates Google Drive push notification (webhook).
 *
 * Google Drive uses push notifications via the Changes API.
 * The X-Goog-Channel-Token header contains a shared secret that was
 * set when creating the watch channel.
 *
 * Also validates X-Goog-Resource-State to ensure it's a real change notification.
 *
 * @see https://developers.google.com/drive/api/guides/push
 */
export function validateGoogleDriveWebhook(
  config: WebhookValidatorConfig
): WebhookValidationResult {
  const channelToken = config.headers.get("x-goog-channel-token");
  const resourceState = config.headers.get("x-goog-resource-state");

  if (!channelToken) {
    return { valid: false, reason: "Missing X-Goog-Channel-Token header" };
  }

  // Constant-time comparison of the shared secret
  try {
    const tokenBuffer = Buffer.from(channelToken);
    const secretBuffer = Buffer.from(config.secret);

    if (tokenBuffer.length !== secretBuffer.length) {
      return { valid: false, reason: "Channel token length mismatch" };
    }

    if (!timingSafeEqual(tokenBuffer, secretBuffer)) {
      return { valid: false, reason: "Channel token verification failed" };
    }
  } catch {
    return { valid: false, reason: "Token comparison error" };
  }

  // Google sends a "sync" message when the channel is first created.
  // We should accept it but signal that no sync is needed.
  if (resourceState === "sync") {
    return { valid: true, reason: "Channel sync confirmation (no data change)" };
  }

  return { valid: true };
}

// ─── Stripe ───

/**
 * Validates Stripe webhook signature.
 *
 * NOTE: Stripe has an existing dedicated webhook handler at /api/webhook.
 * This validator is provided for completeness but the integration webhook
 * route should redirect Stripe webhooks to the existing handler.
 *
 * Stripe uses Stripe-Signature header with format: t=timestamp,v1=signature
 * The signature is HMAC-SHA256 of: timestamp + "." + payload
 *
 * @see https://stripe.com/docs/webhooks/signatures
 */
export function validateStripeWebhook(
  config: WebhookValidatorConfig
): WebhookValidationResult {
  const signatureHeader = config.headers.get("stripe-signature");

  if (!signatureHeader) {
    return { valid: false, reason: "Missing Stripe-Signature header" };
  }

  // Parse signature header: t=timestamp,v1=signature
  const elements = signatureHeader.split(",");
  const timestampStr = elements
    .find((e) => e.startsWith("t="))
    ?.substring(2);
  const signatureStr = elements
    .find((e) => e.startsWith("v1="))
    ?.substring(3);

  if (!timestampStr || !signatureStr) {
    return { valid: false, reason: "Malformed Stripe-Signature header" };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return { valid: false, reason: "Invalid timestamp in Stripe signature" };
  }

  // Replay attack prevention: reject timestamps older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const MAX_AGE_SEC = 5 * 60;
  if (Math.abs(now - timestamp) > MAX_AGE_SEC) {
    return { valid: false, reason: "Timestamp outside acceptable range" };
  }

  // Compute expected signature: HMAC-SHA256(secret, timestamp + "." + payload)
  const signedPayload = `${timestampStr}.${config.rawBody}`;
  const expectedSignature = createHmac("sha256", config.secret)
    .update(signedPayload)
    .digest("hex");

  try {
    const sigBuffer = Buffer.from(signatureStr, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: "Signature verification failed" };
    }
  } catch {
    return { valid: false, reason: "Signature comparison error" };
  }

  return { valid: true };
}

// ─── Validator Registry ───

export type WebhookValidator = (
  config: WebhookValidatorConfig
) => WebhookValidationResult;

const VALIDATOR_REGISTRY: Record<string, WebhookValidator> = {
  hubspot: validateHubSpotWebhook,
  "fatture-in-cloud": validateFattureInCloudWebhook,
  "google-drive": validateGoogleDriveWebhook,
  stripe: validateStripeWebhook,
};

/**
 * Get the webhook validator for a given connector ID.
 * Returns null if no validator is registered (connector doesn't support webhooks).
 */
export function getWebhookValidator(
  connectorId: string
): WebhookValidator | null {
  return VALIDATOR_REGISTRY[connectorId] ?? null;
}

/**
 * List all connector IDs that have webhook validation support.
 */
export function listWebhookConnectors(): string[] {
  return Object.keys(VALIDATOR_REGISTRY);
}
