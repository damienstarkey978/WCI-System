/**
 * At-rest encryption for stored QuickBooks OAuth tokens (QuickBooksConnection.
 * encryptedAccessToken/encryptedRefreshToken). AES-256-GCM with a random 12-byte IV per
 * call — GCM's auth tag catches ciphertext tampering, which a plain CBC/CTR scheme
 * wouldn't. QBO_TOKEN_ENCRYPTION_KEY is a 32-byte key, base64-encoded (`openssl rand
 * -base64 32`); never derived from anything else, and never logged.
 *
 * Stored format is a single string: `<iv>.<authTag>.<ciphertext>`, each part base64url,
 * so it fits in one TEXT column without a JSON wrapper.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { quickBooksTokenEncryptionKey } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const key = Buffer.from(quickBooksTokenEncryptionKey(), "base64");
  if (key.length !== 32) {
    throw new Error(
      `QBO_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}). Generate one with \`openssl rand -base64 32\`.`,
    );
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64url")).join(".");
}

export function decryptToken(stored: string): string {
  const [ivPart, authTagPart, ciphertextPart] = stored.split(".");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted QuickBooks token.");
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]);
  return plaintext.toString("utf8");
}
