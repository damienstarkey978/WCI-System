/**
 * DB-backed QuickBooks connection lifecycle: one QuickBooksConnection row per
 * organization (CLAUDE.md 2.3). Owns the OAuth `state` round-trip (CSRF protection —
 * signed rather than session-stored, since the redirect lands on a plain GET route) and
 * "give me a currently-valid access token for this org," refreshing first if needed —
 * the DB equivalent of the standalone scaffold's tokenManager.js, but per-organization
 * instead of a single local file.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";
import { quickBooksEnvironment, quickBooksTokenEncryptionKey } from "@/lib/env";

import * as qboClient from "./client";
import { decryptToken, encryptToken } from "./crypto";

export class QuickBooksNotConnectedError extends Error {
  constructor(organizationId: string) {
    super(`Organization ${organizationId} has no active QuickBooks connection.`);
    this.name = "QuickBooksNotConnectedError";
  }
}

export class InvalidQuickBooksStateError extends Error {
  constructor() {
    super("Invalid or expired QuickBooks OAuth state.");
    this.name = "InvalidQuickBooksStateError";
  }
}

const STATE_TTL_MS = 15 * 60 * 1000;

interface StatePayload {
  readonly organizationId: string;
  readonly nonce: string;
  readonly iat: number;
}

function signState(payload: StatePayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", quickBooksTokenEncryptionKey()).update(payloadB64).digest("hex");
  return `${payloadB64}.${signature}`;
}

function verifyState(state: string): StatePayload {
  const [payloadB64, signature] = state.split(".");
  if (!payloadB64 || !signature) throw new InvalidQuickBooksStateError();

  const expected = createHmac("sha256", quickBooksTokenEncryptionKey()).update(payloadB64).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new InvalidQuickBooksStateError();
  }

  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as StatePayload;
  if (Date.now() - payload.iat > STATE_TTL_MS) throw new InvalidQuickBooksStateError();
  return payload;
}

/** Step 1: the URL to send an admin's browser to, for a given organization. */
export function buildConnectUrl(organizationId: string): string {
  const state = signState({ organizationId, nonce: randomBytes(16).toString("hex"), iat: Date.now() });
  return qboClient.buildAuthorizationUrl(state);
}

/**
 * Step 2: the callback route hands this the `code`/`realmId`/`state` query params
 * Intuit redirected back with. Validates state, exchanges the code, and upserts the
 * connection row — an org reconnecting (new company, or after a manual disconnect)
 * simply replaces its existing row rather than erroring on the unique organizationId.
 */
export async function completeConnection(state: string, code: string, realmId: string): Promise<{ organizationId: string }> {
  const { organizationId } = verifyState(state);
  const tokens = await qboClient.exchangeCodeForTokens(code);
  const now = Date.now();

  await db.quickBooksConnection.upsert({
    where: { organizationId },
    create: {
      organizationId,
      environment: quickBooksEnvironment() === "production" ? "PRODUCTION" : "SANDBOX",
      realmId,
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: encryptToken(tokens.refresh_token),
      accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + tokens.x_refresh_token_expires_in * 1000),
    },
    update: {
      environment: quickBooksEnvironment() === "production" ? "PRODUCTION" : "SANDBOX",
      realmId,
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: encryptToken(tokens.refresh_token),
      accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + tokens.x_refresh_token_expires_in * 1000),
      connectedAt: new Date(),
      disconnectedAt: null,
    },
  });

  return { organizationId };
}

/**
 * Best-effort revoke with Intuit, then mark the row disconnected. The row itself is
 * kept (not deleted) as connection history, same pattern as Client.activatedAt — see
 * the QuickBooksConnection model comment in prisma/schema.prisma.
 */
export async function disconnectConnection(organizationId: string): Promise<void> {
  const connection = await db.quickBooksConnection.findUnique({ where: { organizationId } });
  if (!connection || connection.disconnectedAt) return;

  try {
    await qboClient.revokeToken(decryptToken(connection.encryptedRefreshToken));
  } catch {
    // Revoke is best-effort — Intuit may have already expired/revoked it out-of-band.
    // Disconnecting locally must still succeed either way.
  }

  await db.quickBooksConnection.update({ where: { organizationId }, data: { disconnectedAt: new Date() } });
}

export interface ValidQuickBooksAccess {
  readonly accessToken: string;
  readonly realmId: string;
  readonly environment: "sandbox" | "production";
}

const EXPIRY_BUFFER_MS = 60 * 1000;

/** "Give me a currently-valid access token for this org," refreshing first if expired or about to expire. */
export async function getValidAccessToken(organizationId: string): Promise<ValidQuickBooksAccess> {
  const connection = await db.quickBooksConnection.findUnique({ where: { organizationId } });
  if (!connection || connection.disconnectedAt) throw new QuickBooksNotConnectedError(organizationId);

  const environment = connection.environment === "PRODUCTION" ? "production" : "sandbox";
  const isExpired = Date.now() >= connection.accessTokenExpiresAt.getTime() - EXPIRY_BUFFER_MS;
  if (!isExpired) {
    return { accessToken: decryptToken(connection.encryptedAccessToken), realmId: connection.realmId, environment };
  }

  const refreshed = await qboClient.refreshAccessToken(decryptToken(connection.encryptedRefreshToken));
  const now = Date.now();
  await db.quickBooksConnection.update({
    where: { organizationId },
    data: {
      encryptedAccessToken: encryptToken(refreshed.access_token),
      encryptedRefreshToken: encryptToken(refreshed.refresh_token),
      accessTokenExpiresAt: new Date(now + refreshed.expires_in * 1000),
      refreshTokenExpiresAt: new Date(now + refreshed.x_refresh_token_expires_in * 1000),
    },
  });

  return { accessToken: refreshed.access_token, realmId: connection.realmId, environment };
}
