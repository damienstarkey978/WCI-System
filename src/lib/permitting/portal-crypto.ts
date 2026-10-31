/**
 * At-rest encryption for CityPortalCredential.encryptedPassword (JAX EPICS /
 * Duval Clerk). Same AES-256-GCM pattern as QuickBooks tokens
 * (src/lib/quickbooks/crypto.ts). Reuses QBO_TOKEN_ENCRYPTION_KEY until a
 * dedicated SECRETS_ENCRYPTION_KEY is provisioned — never log or return plaintext.
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

export function encryptPortalPassword(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64url")).join(".");
}

export function decryptPortalPassword(stored: string): string {
  const [ivPart, authTagPart, ciphertextPart] = stored.split(".");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted city portal password.");
  }
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
