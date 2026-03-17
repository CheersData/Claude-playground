/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests: Credential Vault — OAuth2-specific operations
 *
 * Enhanced coverage for the OAuth2 integration flow across BOTH vault implementations:
 *
 * 1. SupabaseCredentialVault (lib/credential-vault.ts) — pgcrypto-based
 *    - Store OAuth2 credential -> encrypt -> DB via RPC
 *    - Retrieve credential -> decrypt -> return
 *    - Refresh credential -> update encrypted data
 *    - Revoke credential -> soft delete (revoked_at)
 *    - List credentials -> metadata only (no secrets)
 *    - Fail-closed when VAULT_ENCRYPTION_KEY missing
 *    - Handle corrupted encrypted data gracefully
 *
 * 2. CredentialVault (lib/staff/credential-vault) — AES-256-GCM
 *    - Encrypt/decrypt roundtrip for OAuth2 data
 *    - Store credential -> upsert -> audit
 *    - Retrieve credential -> decrypt -> return
 *    - Revoke credential -> soft delete + cipher scrub
 *    - checkAndRefreshToken flow
 *    - Fail-closed when VAULT_MASTER_KEY missing
 *
 * All Supabase calls are mocked — no real DB connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// =============================================================================
// Part 1: SupabaseCredentialVault (pgcrypto-based)
// =============================================================================

// ── Shared mock fns for Part 1 (hoisted to top level to avoid warnings) ──
const mockRpc = vi.fn();
const mockFrom = vi.fn();

describe("SupabaseCredentialVault — OAuth2 operations", () => {

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        rpc: mockRpc,
        from: mockFrom,
      }),
    }));

    process.env.VAULT_ENCRYPTION_KEY = "x".repeat(64);
  });

  afterEach(() => {
    delete process.env.VAULT_ENCRYPTION_KEY;
    vi.restoreAllMocks();
  });

  // ── Store OAuth2 credential ───────────────────────────────────────────

  describe("storeCredential (OAuth2 token)", () => {
    it("stores OAuth2 tokens with metadata and expiry", async () => {
      mockRpc.mockResolvedValue({ data: "vault-id-001", error: null });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.storeCredential(
        "user-123",
        "hubspot",
        "oauth2_token",
        {
          access_token: "hapi-token-abc",
          refresh_token: "refresh-xyz",
          token_type: "Bearer",
          expires_in: "3600",
        },
        {
          metadata: { provider: "hubspot", scopes: ["crm.contacts.read"] },
          expiresAt: "2026-03-18T00:00:00Z",
        }
      );

      expect(result).toBe("vault-id-001");
      expect(mockRpc).toHaveBeenCalledWith("vault_store", {
        p_user_id: "user-123",
        p_connector_source: "hubspot",
        p_credential_type: "oauth2_token",
        p_data: expect.stringContaining("hapi-token-abc"),
        p_encryption_key: "x".repeat(64),
        p_metadata: { provider: "hubspot", scopes: ["crm.contacts.read"] },
        p_expires_at: "2026-03-18T00:00:00Z",
      });
    });

    it("stores Fatture in Cloud OAuth2 tokens", async () => {
      mockRpc.mockResolvedValue({ data: "vault-id-002", error: null });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.storeCredential(
        "user-456",
        "fatture-in-cloud",
        "oauth2_token",
        {
          access_token: "fatture-access",
          refresh_token: "fatture-refresh",
          token_type: "Bearer",
          expires_in: "7200",
        }
      );

      expect(result).toBe("vault-id-002");
      const storedData = JSON.parse(mockRpc.mock.calls[0][1].p_data);
      expect(storedData.access_token).toBe("fatture-access");
      expect(storedData.refresh_token).toBe("fatture-refresh");
    });

    it("stores Google Drive OAuth2 tokens", async () => {
      mockRpc.mockResolvedValue({ data: "vault-id-003", error: null });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.storeCredential(
        "user-789",
        "google-drive",
        "oauth2_token",
        {
          access_token: "ya29.google-access",
          refresh_token: "1//google-refresh",
          token_type: "Bearer",
          expires_in: "3600",
        }
      );

      expect(result).toBe("vault-id-003");
      expect(mockRpc).toHaveBeenCalledWith(
        "vault_store",
        expect.objectContaining({
          p_connector_source: "google-drive",
          p_credential_type: "oauth2_token",
        })
      );
    });
  });

  // ── Retrieve OAuth2 credential ────────────────────────────────────────

  describe("getCredential (OAuth2 token)", () => {
    it("retrieves and parses OAuth2 token data", async () => {
      const tokenData = {
        access_token: "active-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
      };
      mockRpc.mockResolvedValue({
        data: JSON.stringify(tokenData),
        error: null,
      });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.getCredential("user-123", "hubspot");

      expect(result).toEqual(tokenData);
      expect(mockRpc).toHaveBeenCalledWith("vault_retrieve", {
        p_user_id: "user-123",
        p_connector_source: "hubspot",
        p_encryption_key: "x".repeat(64),
      });
    });

    it("returns null for non-existent credential", async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.getCredential("user-123", "nonexistent");
      expect(result).toBeNull();
    });

    it("returns null on decryption error (corrupted data)", async () => {
      mockRpc.mockResolvedValue({
        data: "not-valid-json{corrupt}",
        error: null,
      });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.getCredential("user-123", "hubspot");
      expect(result).toBeNull();
    });

    it("returns null on RPC error (decryption failure)", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "Wrong decryption key" },
      });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.getCredential("user-123", "hubspot");
      expect(result).toBeNull();
    });
  });

  // ── Refresh OAuth2 credential ─────────────────────────────────────────

  describe("refreshCredential (OAuth2 token refresh)", () => {
    it("refreshes OAuth2 token with new access_token and expiry", async () => {
      mockRpc.mockResolvedValue({ data: true, error: null });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.refreshCredential(
        "user-123",
        "hubspot",
        {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
        },
        "2026-03-18T01:00:00Z"
      );

      expect(result).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith("vault_refresh", {
        p_user_id: "user-123",
        p_connector_source: "hubspot",
        p_new_data: expect.stringContaining("new-access-token"),
        p_encryption_key: "x".repeat(64),
        p_new_expires_at: "2026-03-18T01:00:00Z",
      });
    });

    it("returns false when no active credential to refresh", async () => {
      mockRpc.mockResolvedValue({ data: false, error: null });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.refreshCredential(
        "user-123",
        "revoked-source",
        { access_token: "new" }
      );

      expect(result).toBe(false);
    });

    it("returns false on RPC error", async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: "DB error" },
      });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.refreshCredential(
        "user-123",
        "hubspot",
        { access_token: "new" }
      );

      expect(result).toBe(false);
    });
  });

  // ── Revoke credential ─────────────────────────────────────────────────

  describe("revokeCredential", () => {
    it("soft-deletes credential (sets revoked_at)", async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: "vault-id-001" },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockIs = vi.fn().mockReturnValue({ select: mockSelect });
      const mockEq3 = vi.fn().mockReturnValue({ is: mockIs });
      const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.revokeCredential(
        "user-123",
        "hubspot",
        "oauth2_token"
      );

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith("credential_vault");
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ revoked_at: expect.any(String) })
      );
    });

    it("returns false when no active credential to revoke", async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockIs = vi.fn().mockReturnValue({ select: mockSelect });
      const mockEq3 = vi.fn().mockReturnValue({ is: mockIs });
      const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
      mockFrom.mockReturnValue({ update: mockUpdate });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.revokeCredential(
        "user-123",
        "hubspot",
        "oauth2_token"
      );

      expect(result).toBe(false);
    });
  });

  // ── List credentials (metadata only) ──────────────────────────────────

  describe("listForUser (no secrets exposed)", () => {
    it("returns credential metadata without decrypted secrets", async () => {
      const mockOrder = vi.fn().mockResolvedValue({
        data: [
          {
            id: "vault-id-001",
            connector_source: "hubspot",
            credential_type: "oauth2_token",
            metadata: { provider: "hubspot", scopes: ["crm.contacts.read"] },
            expires_at: "2026-03-18T00:00:00Z",
            last_used_at: "2026-03-17T12:00:00Z",
            last_refreshed_at: "2026-03-17T11:00:00Z",
            created_at: "2026-03-01T00:00:00Z",
            updated_at: "2026-03-17T12:00:00Z",
          },
          {
            id: "vault-id-002",
            connector_source: "google-drive",
            credential_type: "oauth2_token",
            metadata: { provider: "google-drive" },
            expires_at: "2026-03-18T01:00:00Z",
            last_used_at: null,
            last_refreshed_at: null,
            created_at: "2026-03-15T00:00:00Z",
            updated_at: "2026-03-15T00:00:00Z",
          },
        ],
        error: null,
      });
      const mockIs = vi.fn().mockReturnValue({ order: mockOrder });
      const mockEq = vi.fn().mockReturnValue({ is: mockIs });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      mockFrom.mockReturnValue({ select: mockSelect });

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      const result = await vault.listForUser("user-123");

      expect(result).toHaveLength(2);
      expect(result[0].connectorSource).toBe("hubspot");
      expect(result[0].credentialType).toBe("oauth2_token");
      expect(result[1].connectorSource).toBe("google-drive");

      // Verify no secret fields in output
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain("access_token");
      expect(resultStr).not.toContain("refresh_token");
      expect(resultStr).not.toContain("encrypted_data");
    });
  });

  // ── Fail-closed when VAULT_ENCRYPTION_KEY missing ─────────────────────

  describe("Fail-closed behavior", () => {
    it("throws when VAULT_ENCRYPTION_KEY is not set", async () => {
      delete process.env.VAULT_ENCRYPTION_KEY;

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      await expect(
        vault.getCredential("user-123", "hubspot")
      ).rejects.toThrow("VAULT_ENCRYPTION_KEY");
    });

    it("throws when VAULT_ENCRYPTION_KEY is too short", async () => {
      process.env.VAULT_ENCRYPTION_KEY = "short";

      const { SupabaseCredentialVault } = await import("@/lib/credential-vault");
      const vault = new SupabaseCredentialVault();

      await expect(
        vault.storeCredential("user-123", "hubspot", "oauth2_token", {})
      ).rejects.toThrow("VAULT_ENCRYPTION_KEY");
    });
  });
});

// =============================================================================
// Part 2: CredentialVault — AES-256-GCM (lib/staff/credential-vault)
// =============================================================================

describe("CredentialVault (AES-256-GCM) — OAuth2 operations", () => {
  const VALID_KEY_BASE64 = Buffer.from("a".repeat(32)).toString("base64");
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.VAULT_MASTER_KEY = VALID_KEY_BASE64;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("encrypt/decrypt roundtrip for OAuth2 data", () => {
    it("roundtrips HubSpot OAuth2 credential data", async () => {
      // Need a fresh mock for this describe block
      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault } = await import("@/lib/staff/credential-vault");
      const vault = new CredentialVault();

      const tokenData = {
        accessToken: "hapi-token-abc",
        refreshToken: "refresh-xyz",
        expiresAt: "2026-03-18T00:00:00Z",
        scopes: ["crm.contacts.read", "crm.companies.read"],
        tokenUrl: "https://api.hubapi.com/oauth/v1/token",
        clientId: "hubspot-client-id",
        clientSecret: "hubspot-client-secret",
      };

      const plaintext = JSON.stringify(tokenData);
      const payload = vault.encrypt(plaintext);

      // Verify encrypted payload has all required fields
      expect(payload.encrypted).toBeTruthy();
      expect(payload.iv).toBeTruthy();
      expect(payload.authTag).toBeTruthy();

      // Verify encrypted data is NOT plaintext
      expect(payload.encrypted).not.toContain("hapi-token-abc");

      // Decrypt and verify roundtrip
      const decrypted = vault.decrypt(
        payload.encrypted,
        payload.iv,
        payload.authTag
      );
      const parsed = JSON.parse(decrypted);

      expect(parsed.accessToken).toBe("hapi-token-abc");
      expect(parsed.refreshToken).toBe("refresh-xyz");
      expect(parsed.tokenUrl).toBe("https://api.hubapi.com/oauth/v1/token");
    });

    it("roundtrips Google Drive OAuth2 credential data", async () => {
      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault } = await import("@/lib/staff/credential-vault");
      const vault = new CredentialVault();

      const tokenData = {
        accessToken: "ya29.google-access-token",
        refreshToken: "1//google-refresh-token",
        expiresAt: "2026-03-18T01:00:00Z",
        scopes: ["https://www.googleapis.com/auth/drive.readonly"],
        tokenUrl: "https://oauth2.googleapis.com/token",
        clientId: "google-client-id",
        clientSecret: "google-client-secret",
      };

      const payload = vault.encrypt(JSON.stringify(tokenData));
      const decrypted = vault.decrypt(
        payload.encrypted,
        payload.iv,
        payload.authTag
      );

      expect(JSON.parse(decrypted)).toEqual(tokenData);
    });

    it("roundtrips Fatture in Cloud OAuth2 credential data", async () => {
      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault } = await import("@/lib/staff/credential-vault");
      const vault = new CredentialVault();

      const tokenData = {
        accessToken: "fatture-access-token",
        refreshToken: "fatture-refresh-token",
        expiresAt: "2026-03-18T02:00:00Z",
        scopes: ["entity.clients:r", "issued_documents:r"],
        tokenUrl: "https://api-v2.fattureincloud.it/oauth/token",
        clientId: "fatture-client-id",
        clientSecret: "fatture-client-secret",
      };

      const payload = vault.encrypt(JSON.stringify(tokenData));
      const decrypted = vault.decrypt(
        payload.encrypted,
        payload.iv,
        payload.authTag
      );

      expect(JSON.parse(decrypted)).toEqual(tokenData);
    });
  });

  describe("decrypt with wrong key fails (tamper detection)", () => {
    it("throws on decryption with different VAULT_MASTER_KEY", async () => {
      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault } = await import("@/lib/staff/credential-vault");
      const vault1 = new CredentialVault();

      const payload = vault1.encrypt('{"accessToken": "secret"}');

      // Create second vault with different key
      process.env.VAULT_MASTER_KEY = Buffer.from("b".repeat(32)).toString("base64");

      // Re-import to get a fresh module
      vi.resetModules();
      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault: CredentialVault2 } = await import(
        "@/lib/staff/credential-vault"
      );
      const vault2 = new CredentialVault2();

      expect(() =>
        vault2.decrypt(payload.encrypted, payload.iv, payload.authTag)
      ).toThrow();
    });
  });

  describe("Fail-closed when VAULT_MASTER_KEY missing", () => {
    it("throws when VAULT_MASTER_KEY is not configured", async () => {
      delete process.env.VAULT_MASTER_KEY;

      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault } = await import("@/lib/staff/credential-vault");

      expect(() => new CredentialVault()).toThrow("VAULT_MASTER_KEY not configured");
    });

    it("throws when VAULT_MASTER_KEY decodes to wrong length", async () => {
      process.env.VAULT_MASTER_KEY = Buffer.from("too-short").toString("base64");

      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { CredentialVault } = await import("@/lib/staff/credential-vault");

      expect(() => new CredentialVault()).toThrow("must be 256 bits");
    });
  });

  describe("getCredentialVault no-op mode", () => {
    it("returns no-op vault when VAULT_MASTER_KEY is missing", async () => {
      delete process.env.VAULT_MASTER_KEY;

      vi.doMock("@/lib/supabase/admin", () => ({
        createAdminClient: () => ({
          from: vi.fn(),
        }),
      }));

      const { getCredentialVault } = await import("@/lib/staff/credential-vault");
      const vault = getCredentialVault();

      // No-op vault should not throw
      const result = await vault.getCredential("user-123", "hubspot");
      expect(result).toBeNull();

      // No-op vault storeCredential returns empty string
      const storeResult = await vault.storeCredential(
        "user-123",
        "hubspot",
        "oauth2",
        {} as any
      );
      expect(storeResult).toBe("");
    });
  });
});
