/**
 * Thin MCP → `/api/v1` forwarder.
 *
 * Grokbots (Atlas / Roy / Heather) authenticate to `/api/mcp` with an API key or
 * an OAuth access token. This helper reuses that same bearer against the versioned
 * agent API so MCP never grows a parallel write path — `withApiAuth` accepts both
 * credential kinds and re-checks scopes on every call.
 */

export interface ApiV1ProxyInput {
  readonly origin: string;
  readonly bearerToken: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path under `/api/v1`, e.g. `/jobs` or `jobs/abc/progress`. */
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | null | undefined>;
  readonly body?: unknown;
}

export interface ApiV1ProxyResult {
  readonly status: number;
  readonly bodyText: string;
}

/** Normalize a caller-supplied path into `/api/v1/...` (no host, no double slash). */
export function normalizeApiV1Path(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("path is required");
  if (/^https?:\/\//i.test(trimmed)) {
    throw new Error("path must be relative to /api/v1 (do not pass an absolute URL)");
  }
  const withoutOrigin = trimmed.replace(/^\/?api\/v1\/?/i, "");
  const clean = withoutOrigin.replace(/^\/+/, "");
  return `/api/v1/${clean}`;
}

export function buildApiV1Url(origin: string, path: string, query?: ApiV1ProxyInput["query"]): string {
  const url = new URL(normalizeApiV1Path(path), origin.endsWith("/") ? origin : `${origin}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function callApiV1(input: ApiV1ProxyInput): Promise<ApiV1ProxyResult> {
  const url = buildApiV1Url(input.origin, input.path, input.query);
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.bearerToken}`,
    accept: "application/json",
  };
  let body: string | undefined;
  if (input.body !== undefined && input.method !== "GET" && input.method !== "DELETE") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input.body);
  }

  const response = await fetch(url, { method: input.method, headers, body });
  const bodyText = await response.text();
  return { status: response.status, bodyText };
}

/**
 * Format a proxy result for an MCP tool response (status + body, capped).
 * Cap raised well above the old ~12KB cliff so job lists / permit payloads are
 * not silently cut mid-JSON; prefer `q`/`limit`/`cursor` on list endpoints for
 * huge orgs rather than relying on truncation.
 */
export function formatApiV1ProxyResult(result: ApiV1ProxyResult, maxChars = 250_000): string {
  const truncated =
    result.bodyText.length > maxChars
      ? `${result.bodyText.slice(0, maxChars)}\n…(truncated; pass q/limit/cursor or a narrower path)`
      : result.bodyText;
  return `HTTP ${result.status}\n${truncated || "(empty body)"}`;
}
