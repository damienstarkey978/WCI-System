# WCI OS

Construction management platform for **World Construction Inc** — built to reach
Buildertrend feature parity and then exceed it with an open, agent-facing API.

**Current state: Phases 0-2 complete (except QuickBooks sync); Phase 3 (Client
Portal) landed.**
Phase 1 landed the financial core: the Estimate builder, the commitment funnel,
Purchase Orders, Bills/AP with approval routing, Invoicing and draw schedules, Time
Tracking with geofencing and overtime, the six standard reports, the webhook
dispatcher, a published OpenAPI spec, and Duke's agent surface including
road-name job matching.

Phase 2 (project management core) has landed: Scheduling with real dependency
auto-shift and critical-path (CPM) computation, Change Orders wired into the
Budget, Daily Logs with optional auto-weather, Todos (the generic entity that also
covers punch lists), RFIs, Files, and the unified Comment/Activity layer with
Notifications. Heather's (office manager) agent surface — daily logs, files,
comments, and custom permit-milestone events — is live and scope-verified.

Phase 3 (Client Portal) has landed: a Client is its own auth path — never a
User, never a Clerk or API-key session — authenticated via a portal login link
or a single-use headless approval token, both signed the same way as an
ApiKey (`src/lib/secure-tokens.ts`, shared crypto only). Clients get per-job,
per-module read access (`ClientJobAccess` — daily logs, schedule, documents,
invoices, change orders, selections, bills visibility, budget off by default),
can approve a Change Order or a Selection option either from a logged-in
portal session or by clicking a signed one-time link with **no login
required**, and can pay an invoice via Stripe (optional integration — 503s
cleanly without a key, never a fabricated payment). Selections & Allowances
are new: an Allowance is a budget placeholder booked against a cost code, and
approving one of a Selection's Options posts the price variance onto the
Budget, the same explicit-conversion-action pattern as Change Orders.

Also added, pulled forward from the original Phase 8/5 schedule by explicit request:
an AI estimate-drafting assistant (`/admin/ai-estimate`, handoff.ai-style) that turns
rough field notes into a full line-item estimate against the org's real cost code
catalog — always created as a review-first draft, never auto-sent to budget.

Invoicing (flat/line-item/progress), draw schedules with auto-generated draft
invoices, and manual payment recording (with an overpayment guard) are also in.
So is Time Tracking: clock in/out with breaks, GPS geofencing, supervisor bulk
clock-in, cost-code-linked labor rates, an approval workflow, and weekly overtime
(daily-vs-weekly-rule, whichever is greater) computed across every job a worker
touched that week.

The six standard reports (WIP, Budgeted vs Projected, Profitability, Invoicing,
Labor Actuals vs Budgeted, Cash Flow) are also in — every one of them is a
transformation over the same per-job funnel the Budget screen reads, so no report
can disagree with another about a job's numbers.

A published OpenAPI 3.1 spec is also in — see below.

Still to come: the two-way QuickBooks sync (needs Intuit developer credentials
from Damien), a full admin UI for the Phase 2/3 modules, and Phase 4 onward
(Sub/Vendor Portal + Bidding, CRM/Sales, Warranty/Submittals/Surveys, Mobile PWA).

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

The AI estimate assistant is also optional — set `ANTHROPIC_API_KEY` in `.env` to
enable `/admin/ai-estimate` and `POST /api/v1/estimates/ai-draft`. Without it, both
return a clear "not configured" message rather than the app failing to build.

Client Portal payments are optional too — set `STRIPE_SECRET_KEY` (and
`STRIPE_WEBHOOK_SECRET` for the webhook receiver) to enable
`POST /api/v1/portal/invoices/{id}/pay`. Without them it returns a clean 503;
it never fabricates a payment.

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
| `POST` | `/api/v1/estimates/ai-draft` | `estimates:write` |
| `GET` `POST` | `/api/v1/invoices` | `invoices:read` / `invoices:write` |
| `POST` | `/api/v1/invoices/{id}/send` | `invoices:write` |
| `POST` | `/api/v1/invoices/{id}/payments` | `invoices:write` |
| `GET` `POST` | `/api/v1/draw-schedules` | `invoices:read` / `invoices:write` |
| `POST` | `/api/v1/draws/{id}/generate-invoice` | `invoices:write` |
| `GET` `POST` | `/api/v1/time-clock` | `time-clock:read` / `time-clock:write` |
| `POST` | `/api/v1/time-clock/bulk-clock-in` | `time-clock:write` |
| `POST` | `/api/v1/time-clock/{id}/clock-out` | `time-clock:write` |
| `POST` | `/api/v1/time-clock/{id}/breaks/start` \| `/end` | `time-clock:write` |
| `POST` | `/api/v1/time-clock/{id}/approve` \| `/reject` | `time-clock:write` |
| `GET` | `/api/v1/time-clock/overtime-summary` | `time-clock:read` |
| `GET` | `/api/v1/reports/wip` | `reports:read` |
| `GET` | `/api/v1/reports/budgeted-vs-projected` | `reports:read` |
| `GET` | `/api/v1/reports/profitability` | `reports:read` |
| `GET` | `/api/v1/reports/invoicing` | `reports:read` |
| `GET` | `/api/v1/reports/labor` | `reports:read` |
| `GET` | `/api/v1/reports/cash-flow` | `reports:read` |
| `GET` `POST` | `/api/v1/schedules` | `schedule:read` / `schedule:write` |
| `GET` | `/api/v1/schedules/{id}` | `schedule:read` |
| `POST` | `/api/v1/schedules/{id}/items` | `schedule:write` |
| `POST` | `/api/v1/schedules/{id}/baseline` | `schedule:write` |
| `POST` | `/api/v1/schedule-items/{id}` | `schedule:write` |
| `GET` `POST` | `/api/v1/non-working-days` | `schedule:read` / `schedule:write` |
| `GET` `POST` | `/api/v1/change-orders` | `change-orders:read` / `:write` |
| `POST` | `/api/v1/change-orders/{id}/approve` \| `/decline` | `change-orders:write` |
| `POST` | `/api/v1/change-orders/{id}/push-to-purchase-order` | `change-orders:write` |
| `GET` `POST` | `/api/v1/daily-logs` | `daily-logs:read` / `daily-logs:write` |
| `GET` `POST` | `/api/v1/todos` | `todos:read` / `todos:write` |
| `POST` | `/api/v1/todos/{id}/status` | `todos:write` |
| `POST` | `/api/v1/todos/checklist-items/{id}` | `todos:write` |
| `GET` `POST` | `/api/v1/rfis` | `rfis:read` / `rfis:write` |
| `POST` | `/api/v1/rfis/{id}/answer` \| `/close` | `rfis:write` |
| `GET` `POST` | `/api/v1/files` | `files:read` / `files:write` |
| `GET` `POST` | `/api/v1/comments` | `comments:read` / `comments:write` |
| `GET` | `/api/v1/notifications` | `notifications:read` |
| `POST` | `/api/v1/notifications/{id}/read` | `notifications:write` |
| `GET` `POST` | `/api/v1/clients` | `clients:read` / `clients:write` |
| `POST` | `/api/v1/clients/{id}/job-access` | `clients:write` |
| `POST` | `/api/v1/clients/{id}/portal-invite` | `clients:write` |
| `GET` `POST` | `/api/v1/allowances` | `selections:read` / `selections:write` |
| `GET` `POST` | `/api/v1/selections` | `selections:read` / `selections:write` |
| `POST` | `/api/v1/change-orders/{id}/approval-link` | `change-orders:write` |
| `POST` | `/api/v1/selections/{id}/options/{id}/approval-link` | `selections:write` |
| `POST` | `/api/v1/webhooks/stripe` | none (Stripe-Signature verified) |

**Client Portal** (`/api/v1/portal/*`) is a separate auth path — a `ClientSession` or
single-use `ClientActionToken`, never an API key or Clerk session:

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/v1/portal/login` | invite/login token (`Authorization: Bearer`) |
| `GET` | `/api/v1/portal/jobs` | portal session |
| `GET` | `/api/v1/portal/jobs/{id}/daily-logs` \| `/schedule` \| `/documents` \| `/invoices` \| `/change-orders` \| `/selections` \| `/budget` | portal session, gated per-job by `ClientJobAccess` |
| `POST` | `/api/v1/portal/change-orders/{id}/approve` | portal session **or** a `CHANGE_ORDER_APPROVAL` one-time token |
| `POST` | `/api/v1/portal/selections/{id}/options/{id}/approve` | portal session **or** a `SELECTION_APPROVAL` one-time token |
| `POST` | `/api/v1/portal/invoices/{id}/pay` | portal session; 503 without `STRIPE_SECRET_KEY` |

The one-time-token paths are what makes an approval **headless**: a client can
approve a Change Order or a Selection straight from a signed link in an email,
no portal login required (CLAUDE.md 2.3).

**Full API reference:** `GET /api/v1/openapi.json` — the one route under `/api/v1`
that needs no API key, so you can read the contract before you have credentials.
It's generated straight from the same Zod schemas the routes validate against
(`src/lib/openapi.ts`), not hand-written, so request bodies can't drift from what
the server actually accepts. Paste it into any OpenAPI viewer (Swagger UI,
Postman, Redocly) for a browsable reference.

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
- **A payment can never overpay an invoice.** `src/lib/invoicing/calc.ts` rejects any
  payment that would exceed what's left, since a fat-fingered amount there would
  corrupt `amountInvoiced`/`remainingToInvoice` for the rest of the job's life.
- **A draw's invoice amount is frozen at generation time**, priced from the job's
  *current* revised client price. A later change order does not retroactively alter
  an already-generated draw invoice.
- **Overtime is a property of a worker's week, not of any one job.** It is computed
  across every job and cost code a worker touched that week
  (`src/lib/time-clock/overtime.ts`), and kept separate from per-job cost
  attribution — a per-entry labor cost booked to the funnel is base hours × base
  rate, with no OT premium mixed in. Daily-rule and weekly-rule overtime are both
  computed; whichever credits *more* overtime hours wins.
- **An approved timesheet counts as committed cost; a pending one does not.** Only
  once a supervisor has signed off does a time clock entry's cost enter the funnel's
  `committedCost` (CLAUDE.md 2.3's "approved POs + unapproved labor").
- **Schedule dates and critical path are computed, never stored** — the same
  principle as the Budget. A ScheduleItem persists only duration/predecessors/lag;
  `src/lib/scheduling/cpm.ts` recomputes start/end/float/critical-path from scratch
  on every read, so editing one item's duration or the holiday calendar immediately
  reflows everything downstream.
- **Approving a Change Order is the explicit conversion action that touches the
  Budget** — nothing about a CO affects cost or client price until then. A cost
  code with no prior budget line gets `originalBudgetCost` seeded at zero, so
  original vs. revised diverges by exactly the CO's amount rather than backfilling
  an original figure that never existed.
- **Every report reads from the same per-job funnel computation.** `src/lib/reports/
  service.ts` computes each active job's funnel once and every report is a pure
  transformation over that shared array (`src/lib/reports/calc.ts`) — there is
  exactly one place that computes projected cost, so no report can silently
  disagree with the Budget screen or with another report about a job's numbers.
- **A Client is never a User.** Portal auth (`src/lib/client-portal/auth.ts`)
  shares no authentication code with Clerk (staff) or ApiKey (machine) auth —
  only the token crypto (`src/lib/secure-tokens.ts`) is common.
- **"Access granted" ≠ "invited" ≠ "activated."** These are three separate,
  independently-observable states for a Client: a `ClientJobAccess` row
  existing, `Client.invitedAt` being set, and `Client.activatedAt` being set
  (on first successful login) — never conflated into one boolean.
- **The client-facing Budget view is structurally incapable of returning cost
  or profit.** `getClientBudgetView()` (`src/lib/client-portal/service.ts`)
  is its own function that only ever selects client-price fields off the
  funnel — not a parameter that toggles what `getJobBudget()` returns.
- **Approving a Selection Option is the explicit conversion action that
  touches the Budget**, exactly like a Change Order: the variance between the
  chosen option's price and its Allowance posts to `BudgetLine.revised*`, and
  nothing before approval touches the Budget at all.

## Stack

Next.js 16 (App Router) · TypeScript · Postgres via Prisma 7 · Clerk · Tailwind 4 · Vitest

Note: Next 16 renamed `middleware.ts` to `proxy.ts` and made `params`, `cookies()` and
`headers()` async. Read the bundled docs in `node_modules/next/dist/docs/` rather than
relying on Next 14/15 habits.
