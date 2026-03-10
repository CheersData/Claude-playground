/**
 * Tests: Credential Vault Crypto — AES-256-GCM encrypt/decrypt
 *
 * Covers:
 * - encrypt returns base64 encoded data with iv and authTag
 * - decrypt recovers original plaintext
 * - different IVs for same plaintext (randomness)
 * - wrong key fails to decrypt
 * - wrong authTag fails (integrity check)
 * - empty string encryption/decryption
 * - Unicode/special characters
 * - key length validation (must be 32 bytes)
 *
 * Pure crypto functions — no Supabase, no mocks needed.
 */

import { describe, it, expect } from "vitest";
import { randomBytes } from "crypto";

import {
  encryptAES256GCM,
  decryptAES256GCM,
  MASTER_KEY_LENGTH,
} from "@/lib/staff/credential-vault/crypto";

// ─── Helpers ───

/** Generate a valid 32-byte key for testing */
function makeKey(): Buffer {
  return randomBytes(MASTER_KEY_LENGTH);
}

// =============================================================================
// encryptAES256GCM
// =============================================================================

describe("encryptAES256GCM", () => {
  it("returns an object with encrypted, iv, and authTag as base64 strings", () => {
    const key = makeKey();
    const result = encryptAES256GCM("hello world", key);

    expect(result).toHaveProperty("encrypted");
    expect(result).toHaveProperty("iv");
    expect(result).toHaveProperty("authTag");

    // All fields should be non-empty base64 strings
    expect(typeof result.encrypted).toBe("string");
    expect(typeof result.iv).toBe("string");
    expect(typeof result.authTag).toBe("string");
    expect(result.encrypted.length).toBeGreaterThan(0);
    expect(result.iv.length).toBeGreaterThan(0);
    expect(result.authTag.length).toBeGreaterThan(0);
  });

  it("produces valid base64 for all fields", () => {
    const key = makeKey();
    const result = encryptAES256GCM("test data", key);

    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    expect(result.encrypted).toMatch(base64Regex);
    expect(result.iv).toMatch(base64Regex);
    expect(result.authTag).toMatch(base64Regex);
  });

  it("generates IV of correct length (12 bytes = 16 base64 chars)", () => {
    const key = makeKey();
    const result = encryptAES256GCM("test", key);

    const ivBuffer = Buffer.from(result.iv, "base64");
    expect(ivBuffer.length).toBe(12);
  });

  it("generates authTag of correct length (16 bytes)", () => {
    const key = makeKey();
    const result = encryptAES256GCM("test", key);

    const authTagBuffer = Buffer.from(result.authTag, "base64");
    expect(authTagBuffer.length).toBe(16);
  });

  it("produces different IVs for the same plaintext (randomness)", () => {
    const key = makeKey();
    const result1 = encryptAES256GCM("same text", key);
    const result2 = encryptAES256GCM("same text", key);

    // IVs must differ (random)
    expect(result1.iv).not.toBe(result2.iv);
    // Ciphertext must also differ (different IV = different ciphertext)
    expect(result1.encrypted).not.toBe(result2.encrypted);
  });

  it("throws when key is shorter than 32 bytes", () => {
    const shortKey = randomBytes(16);

    expect(() => encryptAES256GCM("test", shortKey)).toThrow(
      "Key must be 32 bytes"
    );
  });

  it("throws when key is longer than 32 bytes", () => {
    const longKey = randomBytes(48);

    expect(() => encryptAES256GCM("test", longKey)).toThrow(
      "Key must be 32 bytes"
    );
  });

  it("throws when key is empty", () => {
    const emptyKey = Buffer.alloc(0);

    expect(() => encryptAES256GCM("test", emptyKey)).toThrow(
      "Key must be 32 bytes"
    );
  });
});

// =============================================================================
// decryptAES256GCM
// =============================================================================

describe("decryptAES256GCM", () => {
  it("recovers original plaintext from encrypted data", () => {
    const key = makeKey();
    const plaintext = "hello world";
    const { encrypted, iv, authTag } = encryptAES256GCM(plaintext, key);

    const decrypted = decryptAES256GCM(encrypted, iv, authTag, key);
    expect(decrypted).toBe(plaintext);
  });

  it("handles empty string encryption/decryption", () => {
    const key = makeKey();
    const plaintext = "";
    const { encrypted, iv, authTag } = encryptAES256GCM(plaintext, key);

    const decrypted = decryptAES256GCM(encrypted, iv, authTag, key);
    expect(decrypted).toBe("");
  });

  it("handles Unicode/special characters", () => {
    const key = makeKey();
    const plaintext = "Ciao mondo! 🌍 Testo con àccènti e simboli: €£¥ — «»";
    const { encrypted, iv, authTag } = encryptAES256GCM(plaintext, key);

    const decrypted = decryptAES256GCM(encrypted, iv, authTag, key);
    expect(decrypted).toBe(plaintext);
  });

  it("handles JSON-serialized data (typical credential usage)", () => {
    const key = makeKey();
    const data = {
      access_token: "sk-test-abc123",
      refresh_token: "ref-xyz789",
      expires_at: "2025-12-31T23:59:59Z",
    };
    const plaintext = JSON.stringify(data);
    const { encrypted, iv, authTag } = encryptAES256GCM(plaintext, key);

    const decrypted = decryptAES256GCM(encrypted, iv, authTag, key);
    expect(JSON.parse(decrypted)).toEqual(data);
  });

  it("handles long strings", () => {
    const key = makeKey();
    const plaintext = "A".repeat(100_000);
    const { encrypted, iv, authTag } = encryptAES256GCM(plaintext, key);

    const decrypted = decryptAES256GCM(encrypted, iv, authTag, key);
    expect(decrypted).toBe(plaintext);
  });

  it("fails with wrong key (different 32-byte key)", () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const { encrypted, iv, authTag } = encryptAES256GCM("secret data", key1);

    expect(() => decryptAES256GCM(encrypted, iv, authTag, key2)).toThrow();
  });

  it("fails with tampered authTag (integrity check)", () => {
    const key = makeKey();
    const { encrypted, iv, authTag } = encryptAES256GCM("secret data", key);

    // Tamper with the auth tag: flip a byte
    const tamperedTagBuffer = Buffer.from(authTag, "base64");
    tamperedTagBuffer[0] ^= 0xff;
    const tamperedTag = tamperedTagBuffer.toString("base64");

    expect(() =>
      decryptAES256GCM(encrypted, iv, tamperedTag, key)
    ).toThrow();
  });

  it("fails with tampered ciphertext", () => {
    const key = makeKey();
    const { encrypted, iv, authTag } = encryptAES256GCM("secret data", key);

    // Tamper with the ciphertext
    const tamperedBuffer = Buffer.from(encrypted, "base64");
    if (tamperedBuffer.length > 0) {
      tamperedBuffer[0] ^= 0xff;
    }
    const tamperedEncrypted = tamperedBuffer.toString("base64");

    expect(() =>
      decryptAES256GCM(tamperedEncrypted, iv, authTag, key)
    ).toThrow();
  });

  it("throws when key is wrong length for decryption", () => {
    const shortKey = randomBytes(16);

    expect(() =>
      decryptAES256GCM("dummydata", "dummyiv", "dummytag", shortKey)
    ).toThrow("Key must be 32 bytes");
  });

  it("throws when IV is wrong length", () => {
    const key = makeKey();
    // 8 bytes instead of 12
    const badIv = randomBytes(8).toString("base64");
    const goodAuthTag = randomBytes(16).toString("base64");

    expect(() =>
      decryptAES256GCM("encrypted", badIv, goodAuthTag, key)
    ).toThrow("IV must be 12 bytes");
  });

  it("throws when authTag is wrong length", () => {
    const key = makeKey();
    const goodIv = randomBytes(12).toString("base64");
    // 8 bytes instead of 16
    const badAuthTag = randomBytes(8).toString("base64");

    expect(() =>
      decryptAES256GCM("encrypted", goodIv, badAuthTag, key)
    ).toThrow("Auth tag must be 16 bytes");
  });
});

// =============================================================================
// MASTER_KEY_LENGTH constant
// =============================================================================

describe("MASTER_KEY_LENGTH", () => {
  it("is 32 (256 bits)", () => {
    expect(MASTER_KEY_LENGTH).toBe(32);
  });
});

// =============================================================================
// Roundtrip tests
// =============================================================================

describe("encrypt/decrypt roundtrip", () => {
  it("roundtrips multiple different plaintexts with the same key", () => {
    const key = makeKey();
    const plaintexts = [
      "short",
      "medium length string with spaces",
      '{"json": true, "nested": {"key": "value"}}',
      "àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ",
      "\t\n\r special\0chars",
    ];

    for (const plaintext of plaintexts) {
      const { encrypted, iv, authTag } = encryptAES256GCM(plaintext, key);
      const decrypted = decryptAES256GCM(encrypted, iv, authTag, key);
      expect(decrypted).toBe(plaintext);
    }
  });

  it("different keys encrypt the same plaintext to different ciphertexts", () => {
    const key1 = makeKey();
    const key2 = makeKey();
    const plaintext = "same input, different keys";

    const result1 = encryptAES256GCM(plaintext, key1);
    const result2 = encryptAES256GCM(plaintext, key2);

    // IVs are random so ciphertexts will differ regardless,
    // but even if we could control IVs the ciphertext would differ
    expect(result1.encrypted).not.toBe(result2.encrypted);
  });
});
