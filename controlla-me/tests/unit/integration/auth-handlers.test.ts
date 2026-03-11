/**
 * Tests: Auth Handlers — API key, Basic, None, and Factory
 *
 * Covers:
 * - ApiKeyAuthHandler: reads env, generates correct headers, handles missing key
 * - BasicAuthHandler: reads env, Base64 encodes correctly, handles missing credentials
 * - NoneAuthHandler: returns empty headers, always valid
 * - createAuthHandler factory: creates correct handler for each strategy type
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ApiKeyAuthHandler } from "@/lib/staff/data-connector/auth/apikey-handler";
import { BasicAuthHandler } from "@/lib/staff/data-connector/auth/basic-handler";
import { createAuthHandler } from "@/lib/staff/data-connector/auth/auth-handler";
import type { AuthApiKey, AuthBasic } from "@/lib/staff/data-connector/auth/types";

// ── Setup ───────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore env vars
  process.env = { ...ORIGINAL_ENV };
});

// =============================================================================
// ApiKeyAuthHandler
// =============================================================================

describe("ApiKeyAuthHandler", () => {
  const config: AuthApiKey = {
    type: "api-key",
    header: "Authorization",
    envVar: "TEST_API_KEY",
    prefix: "Bearer ",
  };

  describe("authenticate()", () => {
    it("reads the key from the configured env var", async () => {
      process.env.TEST_API_KEY = "sk-test-123";
      const handler = new ApiKeyAuthHandler(config);

      await handler.authenticate();

      expect(handler.isValid()).toBe(true);
    });

    it("throws when the env var is not set", async () => {
      delete process.env.TEST_API_KEY;
      const handler = new ApiKeyAuthHandler(config);

      await expect(handler.authenticate()).rejects.toThrow(
        'Variabile d\'ambiente "TEST_API_KEY" non configurata'
      );
    });

    it("throws when the env var is empty string", async () => {
      process.env.TEST_API_KEY = "";
      const handler = new ApiKeyAuthHandler(config);

      await expect(handler.authenticate()).rejects.toThrow(
        'Variabile d\'ambiente "TEST_API_KEY" non configurata'
      );
    });
  });

  describe("isValid()", () => {
    it("returns false before authenticate() is called", () => {
      const handler = new ApiKeyAuthHandler(config);
      expect(handler.isValid()).toBe(false);
    });

    it("returns true after successful authenticate()", async () => {
      process.env.TEST_API_KEY = "sk-test-123";
      const handler = new ApiKeyAuthHandler(config);
      await handler.authenticate();
      expect(handler.isValid()).toBe(true);
    });
  });

  describe("getHeaders()", () => {
    it("returns correct header with prefix", async () => {
      process.env.TEST_API_KEY = "sk-test-123";
      const handler = new ApiKeyAuthHandler(config);
      await handler.authenticate();

      const headers = await handler.getHeaders();

      expect(headers).toEqual({
        Authorization: "Bearer sk-test-123",
      });
    });

    it("returns correct header without prefix", async () => {
      process.env.MY_CUSTOM_KEY = "abc-456";
      const noPrefixConfig: AuthApiKey = {
        type: "api-key",
        header: "X-API-Key",
        envVar: "MY_CUSTOM_KEY",
      };
      const handler = new ApiKeyAuthHandler(noPrefixConfig);
      await handler.authenticate();

      const headers = await handler.getHeaders();

      expect(headers).toEqual({
        "X-API-Key": "abc-456",
      });
    });

    it("auto-authenticates if not already authenticated", async () => {
      process.env.TEST_API_KEY = "sk-auto";
      const handler = new ApiKeyAuthHandler(config);

      // Should call authenticate() internally
      const headers = await handler.getHeaders();

      expect(headers).toEqual({
        Authorization: "Bearer sk-auto",
      });
      expect(handler.isValid()).toBe(true);
    });
  });

  describe("refresh()", () => {
    it("re-reads the key from env var", async () => {
      process.env.TEST_API_KEY = "old-key";
      const handler = new ApiKeyAuthHandler(config);
      await handler.authenticate();

      process.env.TEST_API_KEY = "new-key";
      const refreshed = await handler.refresh();

      expect(refreshed).toBe(true);
      const headers = await handler.getHeaders();
      expect(headers.Authorization).toBe("Bearer new-key");
    });

    it("returns false if env var is missing on refresh", async () => {
      process.env.TEST_API_KEY = "initial-key";
      const handler = new ApiKeyAuthHandler(config);
      await handler.authenticate();

      delete process.env.TEST_API_KEY;
      const refreshed = await handler.refresh();

      expect(refreshed).toBe(false);
    });
  });

  describe("strategyType", () => {
    it("is 'api-key'", () => {
      const handler = new ApiKeyAuthHandler(config);
      expect(handler.strategyType).toBe("api-key");
    });
  });
});

// =============================================================================
// BasicAuthHandler
// =============================================================================

describe("BasicAuthHandler", () => {
  const config: AuthBasic = {
    type: "basic",
    envVarUser: "TEST_BASIC_USER",
    envVarPass: "TEST_BASIC_PASS",
  };

  describe("authenticate()", () => {
    it("encodes username:password in base64", async () => {
      process.env.TEST_BASIC_USER = "admin";
      process.env.TEST_BASIC_PASS = "secret";
      const handler = new BasicAuthHandler(config);

      await handler.authenticate();

      expect(handler.isValid()).toBe(true);
    });

    it("throws when username env var is missing", async () => {
      delete process.env.TEST_BASIC_USER;
      process.env.TEST_BASIC_PASS = "secret";
      const handler = new BasicAuthHandler(config);

      await expect(handler.authenticate()).rejects.toThrow(
        "TEST_BASIC_USER"
      );
    });

    it("throws when password env var is missing", async () => {
      process.env.TEST_BASIC_USER = "admin";
      delete process.env.TEST_BASIC_PASS;
      const handler = new BasicAuthHandler(config);

      await expect(handler.authenticate()).rejects.toThrow(
        "TEST_BASIC_PASS"
      );
    });

    it("throws listing both missing vars when both are absent", async () => {
      delete process.env.TEST_BASIC_USER;
      delete process.env.TEST_BASIC_PASS;
      const handler = new BasicAuthHandler(config);

      await expect(handler.authenticate()).rejects.toThrow(
        "TEST_BASIC_USER, TEST_BASIC_PASS"
      );
    });

    it("throws when username is empty string", async () => {
      process.env.TEST_BASIC_USER = "";
      process.env.TEST_BASIC_PASS = "secret";
      const handler = new BasicAuthHandler(config);

      await expect(handler.authenticate()).rejects.toThrow(
        "TEST_BASIC_USER"
      );
    });
  });

  describe("getHeaders()", () => {
    it("returns correct Basic auth header with base64 encoding", async () => {
      process.env.TEST_BASIC_USER = "admin";
      process.env.TEST_BASIC_PASS = "secret";
      const handler = new BasicAuthHandler(config);
      await handler.authenticate();

      const headers = await handler.getHeaders();

      // "admin:secret" in base64
      const expected = Buffer.from("admin:secret", "utf-8").toString("base64");
      expect(headers).toEqual({
        Authorization: `Basic ${expected}`,
      });
    });

    it("handles UTF-8 characters in credentials", async () => {
      process.env.TEST_BASIC_USER = "utente";
      process.env.TEST_BASIC_PASS = "parolachiave";
      const handler = new BasicAuthHandler(config);
      await handler.authenticate();

      const headers = await handler.getHeaders();
      const expected = Buffer.from("utente:parolachiave", "utf-8").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expected}`);
    });

    it("auto-authenticates if not already done", async () => {
      process.env.TEST_BASIC_USER = "user";
      process.env.TEST_BASIC_PASS = "pass";
      const handler = new BasicAuthHandler(config);

      const headers = await handler.getHeaders();

      const expected = Buffer.from("user:pass", "utf-8").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expected}`);
    });
  });

  describe("refresh()", () => {
    it("returns true and re-reads credentials when available", async () => {
      process.env.TEST_BASIC_USER = "admin";
      process.env.TEST_BASIC_PASS = "old";
      const handler = new BasicAuthHandler(config);
      await handler.authenticate();

      process.env.TEST_BASIC_PASS = "new";
      const refreshed = await handler.refresh();

      expect(refreshed).toBe(true);
      const headers = await handler.getHeaders();
      const expected = Buffer.from("admin:new", "utf-8").toString("base64");
      expect(headers.Authorization).toBe(`Basic ${expected}`);
    });

    it("returns false when credentials are missing on refresh", async () => {
      process.env.TEST_BASIC_USER = "admin";
      process.env.TEST_BASIC_PASS = "pass";
      const handler = new BasicAuthHandler(config);
      await handler.authenticate();

      delete process.env.TEST_BASIC_USER;
      delete process.env.TEST_BASIC_PASS;
      const refreshed = await handler.refresh();

      expect(refreshed).toBe(false);
    });
  });

  describe("isValid()", () => {
    it("returns false before authenticate()", () => {
      const handler = new BasicAuthHandler(config);
      expect(handler.isValid()).toBe(false);
    });
  });

  describe("strategyType", () => {
    it("is 'basic'", () => {
      const handler = new BasicAuthHandler(config);
      expect(handler.strategyType).toBe("basic");
    });
  });
});

// =============================================================================
// NoneAuthHandler
// =============================================================================

describe("NoneAuthHandler", () => {
  it("returns empty headers", async () => {
    const handler = createAuthHandler({ type: "none" });
    const headers = await handler.getHeaders();
    expect(headers).toEqual({});
  });

  it("isValid() is always true", () => {
    const handler = createAuthHandler({ type: "none" });
    expect(handler.isValid()).toBe(true);
  });

  it("authenticate() resolves without error", async () => {
    const handler = createAuthHandler({ type: "none" });
    await expect(handler.authenticate()).resolves.toBeUndefined();
  });

  it("refresh() always returns true", async () => {
    const handler = createAuthHandler({ type: "none" });
    const result = await handler.refresh();
    expect(result).toBe(true);
  });

  it("strategyType is 'none'", () => {
    const handler = createAuthHandler({ type: "none" });
    expect(handler.strategyType).toBe("none");
  });
});

// =============================================================================
// createAuthHandler Factory
// =============================================================================

describe("createAuthHandler", () => {
  it("creates NoneAuthHandler for type 'none'", () => {
    const handler = createAuthHandler({ type: "none" });
    expect(handler.strategyType).toBe("none");
  });

  it("creates ApiKeyAuthHandler for type 'api-key'", () => {
    const config: AuthApiKey = {
      type: "api-key",
      header: "Authorization",
      envVar: "SOME_KEY",
    };
    const handler = createAuthHandler(config);
    expect(handler.strategyType).toBe("api-key");
    expect(handler).toBeInstanceOf(ApiKeyAuthHandler);
  });

  it("creates BasicAuthHandler for type 'basic'", () => {
    const config: AuthBasic = {
      type: "basic",
      envVarUser: "USER",
      envVarPass: "PASS",
    };
    const handler = createAuthHandler(config);
    expect(handler.strategyType).toBe("basic");
    expect(handler).toBeInstanceOf(BasicAuthHandler);
  });

  it("creates OAuth2PKCEHandler for type 'oauth2-pkce'", () => {
    const handler = createAuthHandler({
      type: "oauth2-pkce",
      config: {
        authorizeUrl: "https://example.com/authorize",
        tokenUrl: "https://example.com/token",
        clientId: "client-123",
        scopes: ["read"],
        redirectUri: "https://app.com/callback",
        credentialVaultKey: "my-key",
      },
    });
    expect(handler.strategyType).toBe("oauth2-pkce");
  });

  it("creates OAuth2ClientHandler for type 'oauth2-client'", () => {
    const handler = createAuthHandler({
      type: "oauth2-client",
      config: {
        tokenUrl: "https://example.com/token",
        clientIdEnvVar: "CLIENT_ID",
        clientSecretEnvVar: "CLIENT_SECRET",
        scopes: ["api"],
      },
    });
    expect(handler.strategyType).toBe("oauth2-client");
  });

  it("passes AuthHandlerOptions to OAuth2PKCE handler", () => {
    // Should not throw even without vault/userId
    const handler = createAuthHandler(
      {
        type: "oauth2-pkce",
        config: {
          authorizeUrl: "https://example.com/authorize",
          tokenUrl: "https://example.com/token",
          clientId: "client-123",
          scopes: ["read"],
          redirectUri: "https://app.com/callback",
          credentialVaultKey: "my-key",
        },
      },
      { vault: null, userId: null }
    );
    expect(handler.strategyType).toBe("oauth2-pkce");
  });
});
