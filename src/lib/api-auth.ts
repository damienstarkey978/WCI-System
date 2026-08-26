/**
 * Machine authentication for /api/v1/*.
 *
 * Deliberately separate from human session auth (CLAUDE.md 2.1): an agent never carries
 * a user session, and a browser session never authenticates an API call. The two paths
 * share no code beyond the database.
 *
 * Token format: `wci_<tokenId>_<secret>`
 *   - tokenId  — public, indexed, safe to display and log
 *   - secret   — shown exactly once at issue time; only its SHA-256 is stored
 */

import type { AgentKind } from "@/generated/prisma/enums";
import { grantsAllScopes, missingScopes, type Scope } from "@/lib/api-scopes";
import { db } from "@/lib/db";
import {
  generateSecureToken,
  hashSecret,
  parseSecureToken,
  secretMatches,
  type ParsedSecureToken,
} from "@/lib/secure-tokens";

export { hashSecret, secretMatches };

const TOKEN_PREFIX = "wci";

export interface GeneratedApiKeyToken {
  /** The full token. Shown to the operator once and never recoverable afterwards. */
  readonly token: string;
  readonly tokenId: string;
  readonly hashedSecret: string;
}

export function generateApiKeyToken(): GeneratedApiKeyToken {
  return generateSecureToken(TOKEN_PREFIX);
}

export type ParsedToken = ParsedSecureToken;

export function parseApiKeyToken(token: string): ParsedToken | null {
  return parseSecureToken(TOKEN_PREFIX, token);
}

/** Reads the token from an Authorization: Bearer header, or the legacy X-API-Key header. */
export function extractToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1].trim();
  }
  const apiKeyHeader = request.headers.get("x-api-key");
  return apiKeyHeader ? apiKeyHeader.trim() : null;
}

export interface ApiKeyContext {
  readonly apiKeyId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly agentKind: AgentKind | null;
  readonly scopes: readonly string[];
}

export type AuthFailureReason =
  | "MISSING_TOKEN"
  | "MALFORMED_TOKEN"
  | "UNKNOWN_TOKEN"
  | "BAD_SECRET"
  | "REVOKED"
  | "EXPIRED";

export type AuthResult =
  | { readonly ok: true; readonly context: ApiKeyContext }
  | { readonly ok: false; readonly reason: AuthFailureReason };

/**
 * Authenticate a request's API key. Every failure mode returns the same 401 to the
 * caller — the specific reason is for our logs, not for an attacker probing tokens.
 */
export async function authenticateApiKey(request: Request): Promise<AuthResult> {
  const token = extractToken(request);
  if (!token) return { ok: false, reason: "MISSING_TOKEN" };

  const parsed = parseApiKeyToken(token);
  if (!parsed) return { ok: false, reason: "MALFORMED_TOKEN" };

  const apiKey = await db.apiKey.findUnique({ where: { tokenId: parsed.tokenId } });
  if (!apiKey) return { ok: false, reason: "UNKNOWN_TOKEN" };

  if (!secretMatches(parsed.secret, apiKey.hashedSecret)) {
    return { ok: false, reason: "BAD_SECRET" };
  }
  if (apiKey.revokedAt !== null) return { ok: false, reason: "REVOKED" };
  if (apiKey.expiresAt !== null && apiKey.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "EXPIRED" };
  }

  // Best-effort usage tracking; a failure here must never fail the request.
  void db.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    ok: true,
    context: {
      apiKeyId: apiKey.id,
      organizationId: apiKey.organizationId,
      name: apiKey.name,
      agentKind: apiKey.agentKind,
      scopes: apiKey.scopes,
    },
  };
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErrorBody = { error: { code, message, ...(details === undefined ? {} : { details }) } };
  return Response.json(body, { status });
}

export function unauthorized(): Response {
  return Response.json(
    { error: { code: "unauthorized", message: "A valid API key is required." } } satisfies ApiErrorBody,
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="wci-os"' } },
  );
}

export function forbidden(missing: readonly Scope[]): Response {
  return apiError(
    403,
    "insufficient_scope",
    `This API key is missing required scope(s): ${missing.join(", ")}`,
    { missingScopes: missing },
  );
}

export type ApiHandler<Context = unknown> = (
  request: Request,
  auth: ApiKeyContext,
  context: Context,
) => Promise<Response> | Response;

/**
 * Wrap a route handler so it only runs for an authenticated key carrying every
 * required scope. Authorization is enforced here, in the route — never only in
 * src/proxy.ts, which is a coarse pre-filter and can be bypassed by matcher config.
 */
export function withApiAuth<Context = unknown>(
  requiredScopes: readonly Scope[],
  handler: ApiHandler<Context>,
): (request: Request, context: Context) => Promise<Response> {
  return async (request: Request, context: Context): Promise<Response> => {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) {
      return unauthorized();
    }
    if (!grantsAllScopes(auth.context.scopes, requiredScopes)) {
      return forbidden(missingScopes(auth.context.scopes, requiredScopes));
    }
    return handler(request, auth.context, context);
  };
}
