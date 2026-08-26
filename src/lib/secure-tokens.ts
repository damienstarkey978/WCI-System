/**
 * Shared crypto primitives for `<prefix>_<tokenId>_<secret>` bearer tokens.
 * Used by src/lib/api-auth.ts (ApiKey, machine auth) and
 * src/lib/client-portal/auth.ts (ClientSession/ClientActionToken, client-portal
 * auth) — only the crypto is shared here; each caller owns its own DB model,
 * scope/permission logic, and failure handling, so the two auth paths still
 * share no *authentication* code (CLAUDE.md 2.1).
 *
 * tokenId is public, indexed, and safe to display/log; secret is shown to the
 * caller exactly once at issue time and only its SHA-256 is ever stored.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface GeneratedSecureToken {
  readonly token: string;
  readonly tokenId: string;
  readonly hashedSecret: string;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function generateSecureToken(prefix: string): GeneratedSecureToken {
  const tokenId = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return {
    token: `${prefix}_${tokenId}_${secret}`,
    tokenId,
    hashedSecret: hashSecret(secret),
  };
}

export interface ParsedSecureToken {
  readonly tokenId: string;
  readonly secret: string;
}

/**
 * Parsed with a regex rather than split("_"): the secret is base64url, whose alphabet
 * includes "_", so splitting on the delimiter would reject every token whose secret
 * happens to contain one. The tokenId is hex, so anchoring on it is unambiguous.
 */
export function parseSecureToken(prefix: string, token: string): ParsedSecureToken | null {
  const pattern = new RegExp(`^${prefix}_([0-9a-f]+)_([A-Za-z0-9_-]+)$`);
  const match = pattern.exec(token.trim());
  if (!match) return null;
  return { tokenId: match[1], secret: match[2] };
}

/** Constant-time comparison of two hex digests of equal length. */
export function secretMatches(candidateSecret: string, storedHash: string): boolean {
  const candidateHash = hashSecret(candidateSecret);
  if (candidateHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(candidateHash, "utf8"), Buffer.from(storedHash, "utf8"));
}
