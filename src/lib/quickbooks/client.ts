/**
 * Low-level QuickBooks Online HTTP calls: the OAuth 2.0 authorization_code flow and
 * authenticated Accounting API requests. Fetch-based (no SDK dependency), same
 * convention as src/lib/payments/stripe.ts. Callers needing a *valid* access token for
 * an organization should go through connection-service.ts, not this file directly —
 * this file has no idea what an "organization" is, only Intuit's own credentials/hosts.
 */

import { isQuickBooksConfigured, quickBooksClientId, quickBooksClientSecret, quickBooksRedirectUri } from "@/lib/env";

import { accountingBaseUrl, QBO_AUTHORIZE_URL, QBO_REVOKE_URL, QBO_SCOPES, QBO_TOKEN_URL } from "./config";

export class QuickBooksNotConfiguredError extends Error {
  constructor() {
    super("QuickBooks is not configured (QBO_CLIENT_ID/QBO_CLIENT_SECRET are unset).");
    this.name = "QuickBooksNotConfiguredError";
  }
}

export class QuickBooksApiError extends Error {
  constructor(
    label: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${label} (HTTP ${status}): ${body}`);
    this.name = "QuickBooksApiError";
  }
}

export interface QuickBooksTokenResponse {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly x_refresh_token_expires_in: number;
  readonly token_type: string;
}

function requireConfigured(): void {
  if (!isQuickBooksConfigured()) throw new QuickBooksNotConfiguredError();
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${quickBooksClientId()}:${quickBooksClientSecret()}`).toString("base64")}`;
}

/** Step 1: the URL to send the browser to. `state` is caller-supplied — see connection-service.ts. */
export function buildAuthorizationUrl(state: string): string {
  requireConfigured();
  const params = new URLSearchParams({
    client_id: quickBooksClientId(),
    response_type: "code",
    scope: QBO_SCOPES,
    redirect_uri: quickBooksRedirectUri(),
    state,
  });
  return `${QBO_AUTHORIZE_URL}?${params.toString()}`;
}

async function postToken(body: URLSearchParams, label: string): Promise<QuickBooksTokenResponse> {
  requireConfigured();
  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new QuickBooksApiError(label, response.status, text);
  return JSON.parse(text) as QuickBooksTokenResponse;
}

/** Step 2: exchange an authorization code for tokens. */
export function exchangeCodeForTokens(code: string): Promise<QuickBooksTokenResponse> {
  return postToken(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: quickBooksRedirectUri() }),
    "QuickBooks token exchange failed",
  );
}

/**
 * Step 4: refresh an expired access token. Intuit's refresh tokens are single-use and
 * rotate on every call — the response's refresh_token is a NEW one the caller must
 * persist, or the next refresh fails with invalid_grant.
 */
export function refreshAccessToken(refreshToken: string): Promise<QuickBooksTokenResponse> {
  return postToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }), "QuickBooks token refresh failed");
}

/** Best-effort revoke on disconnect — Intuit accepts either an access or refresh token. */
export async function revokeToken(token: string): Promise<void> {
  requireConfigured();
  const response = await fetch(QBO_REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Non-fatal: disconnect already dropped our copy of the tokens locally either way.
    const text = await response.text();
    throw new QuickBooksApiError("QuickBooks token revoke failed", response.status, text);
  }
}

export interface AccountingRequestInput {
  readonly environment: "sandbox" | "production";
  readonly accessToken: string;
  readonly realmId: string;
  readonly method: "GET" | "POST";
  /** Path under /v3/company/{realmId}/, e.g. "customer", "query". */
  readonly path: string;
  readonly query?: Record<string, string>;
  readonly body?: unknown;
}

/** One authenticated call against the Accounting API. Callers handle 401 auto-refresh (connection-service.ts). */
export async function accountingRequest<T>(input: AccountingRequestInput): Promise<T> {
  const url = new URL(`${accountingBaseUrl(input.environment)}/v3/company/${input.realmId}/${input.path}`);
  url.searchParams.set("minorversion", "75");
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Accept: "application/json",
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const text = await response.text();
  if (!response.ok) throw new QuickBooksApiError(`QuickBooks Accounting API ${input.method} ${input.path} failed`, response.status, text);
  return text ? (JSON.parse(text) as T) : ({} as T);
}
