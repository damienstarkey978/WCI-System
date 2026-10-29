/**
 * Scopes for the machine-facing API (CLAUDE.md 2.4, 2.5).
 *
 * Historical design scoped each agent to its domain (Duke = purchasing, Heather =
 * office ops, Jarvis = read-heavy). Damien 2026-10-29: every bot needs direct API
 * access to every data point (files/photos/docs/financials/logs/schedule/…) — so
 * `AGENT_DEFAULT_SCOPES` now grants `*` for the whole roster. Narrow module lists
 * remain available via explicit `--scopes` on `issue-api-key` when a key must stay
 * constrained. Scopes named here for later phases are still the contract those
 * phases implement against.
 */

export const SCOPES = [
  // Phase 0
  "jobs:read",
  "jobs:write",
  "cost-codes:read",
  "cost-codes:write",
  // Phase 1 — financial core
  "estimates:read",
  "estimates:write",
  "budgets:read",
  "purchase-orders:read",
  "purchase-orders:write",
  "bills:read",
  "bills:write",
  "invoices:read",
  "invoices:write",
  "time-clock:read",
  "time-clock:write",
  "reports:read",
  "webhooks:read",
  "webhooks:write",
  // Phase 2 — project management
  "daily-logs:read",
  "daily-logs:write",
  "files:read",
  "files:write",
  "schedule:read",
  "schedule:write",
  "todos:read",
  "todos:write",
  "rfis:read",
  "rfis:write",
  "change-orders:read",
  "change-orders:write",
  "comments:read",
  "comments:write",
  "notifications:read",
  "notifications:write",
  "events:write",
  // Permitting (first-class module — Heather / Atlas / field ops)
  "permits:read",
  "permits:write",
  // Phase 3 — client portal
  "clients:read",
  "clients:write",
  // Phase 3 continued
  "selections:read",
  "selections:write",
  // Phase 4 — sub/vendor portal + bidding
  "vendors:read",
  "vendors:write",
  "bids:read",
  "bids:write",
  // Phase 5 — CRM
  "leads:read",
  "leads:write",
  "proposals:read",
  "proposals:write",
  // Phase 6 — warranty, submittals, surveys, specifications
  "specifications:read",
  "specifications:write",
  "submittals:read",
  "submittals:write",
  "warranty:read",
  "warranty:write",
  "surveys:read",
  "surveys:write",
  // Phase 8 — AI layer
  "weekly-summaries:read",
  "weekly-summaries:write",
  // AI takeoffs → Duke purchasing queue
  "takeoffs:read",
  "takeoffs:write",
  // Historical data migration (Buildertrend cutover) — bypasses live workflow state
  // machines to backfill already-settled records; see src/lib/migration/service.ts.
  "migration:write",
] as const;

export type Scope = (typeof SCOPES)[number];

const SCOPE_SET: ReadonlySet<string> = new Set(SCOPES);

export function isScope(value: string): value is Scope {
  return SCOPE_SET.has(value);
}

/**
 * Wildcards are supported on the resource half only: "bills:*" grants every bill scope,
 * and "*" grants everything. A wildcard is never inferred — it must be granted explicitly.
 */
export function grantsScope(granted: readonly string[], required: Scope): boolean {
  if (granted.includes("*") || granted.includes(required)) {
    return true;
  }
  const [resource] = required.split(":");
  return granted.includes(`${resource}:*`);
}

export function grantsAllScopes(granted: readonly string[], required: readonly Scope[]): boolean {
  return required.every((scope) => grantsScope(granted, scope));
}

export function missingScopes(granted: readonly string[], required: readonly Scope[]): readonly Scope[] {
  return required.filter((scope) => !grantsScope(granted, scope));
}

/**
 * Full-catalog grant for agent keys (`*` → every Scope via grantsScope).
 * Kept as a shared constant so issue-api-key / OpenAPI / tests stay in sync.
 */
export const AGENT_FULL_ACCESS_SCOPES: readonly string[] = ["*"];

/**
 * The default scope set for each agent in the roster (CLAUDE.md section 6).
 * Used by `npm run issue-api-key` so a key's scopes match the documented intent.
 *
 * 2026-10-29: every roster agent defaults to `*` (full `/api/v1` catalog including
 * files/photos/docs). Pass `--scopes` explicitly to mint a narrower key.
 */
export const AGENT_DEFAULT_SCOPES: Readonly<Record<string, readonly string[]>> = {
  jarvis: AGENT_FULL_ACCESS_SCOPES,
  duke: AGENT_FULL_ACCESS_SCOPES,
  heather: AGENT_FULL_ACCESS_SCOPES,
  atlas: AGENT_FULL_ACCESS_SCOPES,
  roy: AGENT_FULL_ACCESS_SCOPES,
  hank: AGENT_FULL_ACCESS_SCOPES,
  vince: AGENT_FULL_ACCESS_SCOPES,
  neil: AGENT_FULL_ACCESS_SCOPES,
};
