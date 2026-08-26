# WCI OS

Construction management platform for **World Construction Inc** — built to reach
Buildertrend feature parity and then exceed it with an open, agent-facing API.

**Current state: Phase 1 in progress.** Phase 0 (foundation) is complete. Phase 1 has
landed the financial core: the Estimate builder, the commitment funnel, Purchase
Orders, Bills/AP with approval routing, the webhook dispatcher, and Duke's agent
surface including road-name job matching.

Still to come in Phase 1: Invoicing and draw schedules, the Time Clock, the six
standard reports, the two-way QuickBooks sync, and the published OpenAPI spec.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture spec and build roadmap.

## Getting started

```bash
npm install
cp .env.example .env          # set DATABASE_URL
npm run db:migrate            # create the schema
npm run db:seed               # WCI organization + cost codes
npm run dev
```

Then open <http://localhost:3000>.

Clerk is optional locally: with no Clerk keys set, the app signs you in as a local dev
admin. That fallback is disabled when `NODE_ENV=production`.

## Using the API

Machine consumers (Duke, Heather, Jarvis, …) authenticate with their own API keys —
never a user session.

```bash
npm run issue-api-key -- --name duke      # prints the token exactly once
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/jobs
```

Each agent's default scopes come from the roster in `src/lib/api-scopes.ts`, so a key
is limited to its domain: Duke writes purchase orders and bills but cannot touch
invoices; Jarvis reads broadly but writes nothing.

Phase 0 endpoints:

| Method | Path | Scope |
|---|---|---|
| `GET` | `/api/v1/jobs` | `jobs:read` |
| `POST` | `/api/v1/jobs` | `jobs:write` |
| `GET` | `/api/v1/jobs/{jobId}` | `jobs:read` |
| `POST` | `/api/v1/jobs/{jobId}/status` | `jobs:write` |
| `GET` | `/api/v1/cost-codes` | `cost-codes:read` |
| `POST` | `/api/v1/cost-codes` | `cost-codes:write` |
| `GET` `POST` | `/api/v1/estimates` | `estimates:read` / `estimates:write` |
| `POST` | `/api/v1/estimates/{id}/send-to-budget` | `estimates:write` |
| `GET` | `/api/v1/jobs/{jobId}/budget` | `budgets:read` |
| `GET` `POST` | `/api/v1/purchase-orders` | `purchase-orders:read` / `:write` |
| `POST` | `/api/v1/purchase-orders/{id}/approve` | `purchase-orders:write` |
| `POST` | `/api/v1/purchase-orders/match-by-road-name` | `jobs:read` |
| `GET` `POST` | `/api/v1/bills` | `bills:read` / `bills:write` |
| `POST` | `/api/v1/bills/{id}/status` | `bills:write` |
| `GET` `POST` | `/api/v1/webhooks` | `webhooks:read` / `webhooks:write` |
| `POST` | `/api/v1/events` | `events:write` |

A published OpenAPI spec lands with the rest of the public API in Phase 1.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm run check` | Lint + typecheck + tests — run before every commit |
| `npm run test` | Unit tests (Vitest) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations in CI/production |
| `npm run db:seed` | Seed the organization and cost codes (idempotent) |
| `npm run db:studio` | Prisma Studio |
| `npm run issue-api-key` | Issue an agent/integration API key |

## Key invariants

These are load-bearing. Breaking one is a bug even if the types still check.

- **Job status never gets assigned directly.** Transitions go through
  `src/lib/job-status.ts` (rules) and `src/lib/jobs.ts` (persistence + audit trail).
- **Contract Type is behavior, not a label.** Fixed Price vs Open Book logic lives in
  `src/lib/contract-type/`. An `if (job.contractType === ...)` anywhere else is a smell.
- **Money is integer cents; rates are integer basis points.** Never floats. See
  `src/lib/money.ts` — markup and margin are different operations and must not be conflated.
- **Human auth and machine auth never mix.** `/api/v1/*` authenticates by API key only;
  `src/proxy.ts` is a coarse pre-filter, and real authorization happens per-route via
  `withApiAuth`.
- **The funnel's layers overlap and must never be summed.** A PO that has been billed
  appears in both `committedCost` and `actualCost`. `projectedCost` is therefore a
  *max* across the layers, not a sum — summing them double-counts every job's cost.
  See `src/lib/budget/funnel.ts`.
- **Estimate lines are priced individually, then summed.** Lines under one cost code
  can carry different markups, so pricing the aggregated cost silently discards them.

## Stack

Next.js 16 (App Router) · TypeScript · Postgres via Prisma 7 · Clerk · Tailwind 4 · Vitest

Note: Next 16 renamed `middleware.ts` to `proxy.ts` and made `params`, `cookies()` and
`headers()` async. Read the bundled docs in `node_modules/next/dist/docs/` rather than
relying on Next 14/15 habits.
