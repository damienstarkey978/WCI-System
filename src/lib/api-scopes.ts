/**
 * Scopes for the machine-facing API (CLAUDE.md 2.4, 2.5).
 *
 * Agent keys are scoped to their domain, not to admin-everything: Duke's key writes
 * purchase orders and bills, Heather's writes daily logs and files, Jarvis reads broadly.
 * Scopes named here for later phases are intentional — they are the contract those
 * phases will implement against, and issuing a key is a config change, not a code change.
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
  // Phase 3 — client portal
  "clients:read",
  "clients:write",
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

/** Read scopes for every resource — the basis of Jarvis's read-heavy orchestrator key. */
const ALL_READ_SCOPES: readonly Scope[] = SCOPES.filter((scope) => scope.endsWith(":read"));

/**
 * The default scope set for each agent in the roster (CLAUDE.md section 6).
 * Used by `npm run issue-api-key` so a key's scopes match the documented intent.
 */
export const AGENT_DEFAULT_SCOPES: Readonly<Record<string, readonly Scope[]>> = {
  jarvis: [...ALL_READ_SCOPES, "webhooks:write", "events:write"],
  duke: [
    "jobs:read",
    "cost-codes:read",
    "purchase-orders:read",
    "purchase-orders:write",
    "bills:read",
    "bills:write",
    "budgets:read",
    "webhooks:read",
    "events:write",
    "vendors:read",
    "vendors:write",
    "bids:read",
    "bids:write",
  ],
  heather: [
    "jobs:read",
    "daily-logs:read",
    "daily-logs:write",
    "files:read",
    "files:write",
    "comments:read",
    "comments:write",
    "clients:read",
    "clients:write",
    "events:write",
  ],
  hank: [
    "jobs:read",
    "jobs:write",
    "schedule:read",
    "schedule:write",
    "daily-logs:read",
    "daily-logs:write",
    "todos:read",
    "todos:write",
    "rfis:read",
    "rfis:write",
    "change-orders:read",
    "change-orders:write",
    "comments:read",
    "comments:write",
    "clients:read",
    "selections:read",
    "selections:write",
    "vendors:read",
    "bids:read",
  ],
  vince: ["jobs:read", "jobs:write", "leads:read", "leads:write", "proposals:read", "proposals:write"],
  neil: ["jobs:read", "cost-codes:read", "estimates:read", "estimates:write", "budgets:read"],
};
