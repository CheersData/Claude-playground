/**
 * Credential Vault Crypto — Pure AES-256-GCM encryption functions.
 *
 * Uses Node.js `crypto` module exclusively (no pgcrypto, no external libs).
 *
 * AES-256-GCM provides:
 * - Confidentiality (256-bit key, 2^256 keyspace)
 * - Integrity (128-bit authentication tag)
 * - Authentication (GCM mode, AEAD)
 *
 * Implementation follows NIST SP 800-38D recommendations:
 * - 96-bit (12-byte) random IV per encryption
 * - 128-bit (16-byte) authentication tag
 * - Unique IV for every encryption operation (randomBytes)
 *
 * @see ADR-3: Credential Vault (company/architecture/adr/adr-credential-vault.md)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import type { EncryptedPayload } from "./types";

// ---- Constants ----

/** AES-256-GCM algorithm identifier */
const ALGORITHM = "aes-256-gcm" as const;

/** IV length: 96 bits (12 bytes), recommended for GCM */
const IV_LENGTH = 12;

/** Authentication tag length: 128 bits (16 bytes) */
const AUTH_TAG_LENGTH = 16;

/** Expected master key length: 256 bits (32 bytes) */
export const MASTER_KEY_LENGTH = 32;

// ---- Encryption ----

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * @param plaintext - The string to encrypt (typically JSON-serialized credential data)
 * @param key - 256-bit (32-byte) master key
 * @returns Encrypted payload with ciphertext, IV, and auth tag (all base64)
 *
 * @throws {Error} If key is not exactly 32 bytes
 *
 * Security notes:
 * - A new random IV is generated for every call (never reused)
 * - The auth tag ensures tamper detection on decryption
 * - The caller MUST store IV and authTag alongside the ciphertext
 */
export function encryptAES256GCM(
  plaintext: string,
  key: Buffer
): EncryptedPayload {
  if (key.length !== MASTER_KEY_LENGTH) {
    throw new Error(
      `[VAULT-CRYPTO] Key must be ${MASTER_KEY_LENGTH} bytes (256 bits), ` +
        `received ${key.length} bytes`
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

// ---- Decryption ----

/**
 * Decrypt ciphertext using AES-256-GCM.
 *
 * @param encrypted - Base64-encoded ciphertext
 * @param iv - Base64-encoded initialization vector (12 bytes)
 * @param authTag - Base64-encoded authentication tag (16 bytes)
 * @param key - 256-bit (32-byte) master key (same key used for encryption)
 * @returns Decrypted plaintext string
 *
 * @throws {Error} If key is not exactly 32 bytes
 * @throws {Error} If authentication tag verification fails (tampered data)
 * @throws {Error} If IV or ciphertext is corrupted
 *
 * Security notes:
 * - GCM mode uses constant-time comparison for the auth tag (safe against timing attacks)
 * - If the auth tag does not match, Node.js crypto throws "Unsupported state or unable
 *   to authenticate data" — this indicates either data corruption or tampering
 */
export function decryptAES256GCM(
  encrypted: string,
  iv: string,
  authTag: string,
  key: Buffer
): string {
  if (key.length !== MASTER_KEY_LENGTH) {
    throw new Error(
      `[VAULT-CRYPTO] Key must be ${MASTER_KEY_LENGTH} bytes (256 bits), ` +
        `received ${key.length} bytes`
    );
  }

  const ivBuffer = Buffer.from(iv, "base64");
  const authTagBuffer = Buffer.from(authTag, "base64");

  if (ivBuffer.length !== IV_LENGTH) {
    throw new Error(
      `[VAULT-CRYPTO] IV must be ${IV_LENGTH} bytes, received ${ivBuffer.length} bytes`
    );
  }

  if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
    throw new Error(
      `[VAULT-CRYPTO] Auth tag must be ${AUTH_TAG_LENGTH} bytes, received ${authTagBuffer.length} bytes`
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTagBuffer);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
