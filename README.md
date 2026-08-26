# WCI OS

Construction management platform for **World Construction Inc** — built to reach
Buildertrend feature parity and then exceed it with an open, agent-facing API.

**Current state: Phases 0-2 complete (except QuickBooks sync); Phases 3 (Client
Portal), 4 (Sub/Vendor Portal + Bidding), 5 (CRM/Sales), 6 (Specifications,
Submittals, Warranty, Surveys), and 7 (Mobile/Field PWA) landed.**
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

Phase 4 (Sub/Vendor Portal + Bidding) has landed, mirroring Phase 3's shape for
a different external party: a Vendor is its own auth path (`src/lib/
vendor-portal/`), sharing only the token crypto with Client/ApiKey auth.
Vendors get per-job visibility (`VendorJobAccess` — documents, purchase
orders, bills) and can e-sign/accept a Purchase Order from a portal session or
a headless one-time link, same no-login pattern as a client approving a
Change Order. Bid participation is deliberately **independent** of
`VendorJobAccess`: a vendor can be invited to bid on a job with zero job
access, and only gets real access once awarded work. The Bid Board supports
multi-vendor accept (a package can end with more than one ACCEPTED
submission — split scope across trades is normal, not a single-winner
auction), builder-edit-on-behalf (staff can submit/edit a vendor's bid, e.g.
a phone bid), and an explicit "push to Purchase Order" conversion once a
submission is accepted. Certification/insurance expiry tracking is in
(`GET /certifications/expiring`) — no reminder delivery yet, since there's no
email provider to send one with.

Phase 5 (CRM/Sales) has landed: a `Lead` is the one entity that legitimately
predates a Job (CLAUDE.md 2.3). Converting a lead (`POST /leads/{id}/
convert-to-job`) creates a real Job in `PRE_SALE` — the exact status Phase 0's
`job-status.ts` already modeled for this ("Proposal accepted — job sold and
under construction") — so the existing Estimate builder works against it
unmodified. A `Proposal` is a thin e-sign wrapper around an Estimate (never
duplicates its pricing); accepting one, either via a Client Portal session or
a headless one-time link, chains three already-tested actions rather than a
bespoke fourth: e-sign the proposal, `transitionJobStatus(PRE_SALE -> OPEN)`,
and `sendEstimateToBudget()`. Vince (sales) got `jobs:write` added to his
default scopes for this, since converting a lead is fundamentally creating a
job.

Phase 6 (Specifications, Submittals, Warranty, Surveys) has landed. A
`Specification` can be built manually or auto-generated from an `Estimate`
(`POST /specifications/generate-from-estimate` groups line items by their
existing `groupLabel` into one `SpecificationSection` per group — no new
grouping concept invented); its visibility to a client reuses the existing
`ClientJobAccess.canViewDocuments` flag rather than adding a new per-entity
one. `Submittal` tracks numbered revisions and gets reviewed via a
`SubmittalReviewLink` — a standalone, no-account single-use token, since an
architect/engineer reviewer is neither a `Client` nor a `Vendor` and has no
standing relationship with the job at all. `WarrantyClaim` supports **dual
acceptance**: the assigned trade and the client each confirm independently
(trade headlessly via a `WARRANTY_TRADE_ACCEPTANCE` token, client via a portal
session or a `WARRANTY_CLIENT_ACCEPTANCE` token), and the claim only reaches
`COMPLETED` once both sides have signed off — reusing the existing Client/
Vendor Portal token machinery rather than building a fourth auth mechanism.
`Survey` mirrors the Submittal pattern for post-completion feedback: a
`SurveyResponseLink` is another standalone no-account token, since a survey
recipient may not even be a known Client. Airtable migration + cutover and
Job Group/multi-family rollup views — also originally scoped under "Phase 6"
— are deliberately not part of this: they need Damien's actual Airtable
export/schema, which isn't available yet.

Phase 7 (Mobile/Field PWA) has landed: an installable PWA at `/field` — a
mobile-first shell (`src/app/field/layout.tsx`) with a manifest
(`src/app/manifest.ts`, served at `/manifest.webmanifest`) and an app-shell
service worker (`public/sw.js`) so the app opens with zero connectivity, not
just flaky connectivity. It's a normal Clerk-authenticated part of the web
app, not a new API surface — `/field`'s Server Actions
(`src/app/field/actions.ts`) call the exact same `time-clock`/`daily-logs`
service functions the agent-facing routes call, just authenticated via the
signed-in staff session instead of an ApiKey (CLAUDE.md 2.1's two auth
worlds stay separate). The offline part is client-side: a small
localStorage-backed queue (`src/lib/field-offline-queue.ts`) holds a daily
log or time-clock action a worker submits with no signal, and
`FieldSyncManager` replays it the moment the browser reports being back
online. Daily logs queue freely (they're independent of each other); time
clock is deliberately limited to **one** outstanding offline action at a
time, since a queued clock-out/break references the entryId a clock-in
creates, and that id doesn't exist until the clock-in has actually reached
the server — the field UI blocks starting a second action until the first
syncs, rather than pretending to support conflict resolution it doesn't
have.

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
from Damien), a full admin UI for the Phase 2-6 modules, the Airtable
migration + cutover (needs Damien's Airtable export), Job Group/multi-family
rollup views, and Phase 8 (the AI layer — weekly client-update summaries,
receipt/bill OCR).

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

Phase 4 (Sub/Vendor Portal + Bidding) staff/agent-side routes:

| Method | Path | Scope |
|---|---|---|
| `GET` `POST` | `/api/v1/vendors` | `vendors:read` / `vendors:write` |
| `POST` | `/api/v1/vendors/{id}/job-access` | `vendors:write` |
| `POST` | `/api/v1/vendors/{id}/portal-invite` | `vendors:write` |
| `GET` `POST` | `/api/v1/vendors/{id}/certifications` | `vendors:read` / `vendors:write` |
| `GET` | `/api/v1/certifications/expiring` | `vendors:read` |
| `POST` | `/api/v1/purchase-orders/{id}/approval-link` | `purchase-orders:write` |
| `GET` `POST` | `/api/v1/bid-packages` | `bids:read` / `bids:write` |
| `POST` | `/api/v1/bid-packages/{id}/invite` \| `/close` | `bids:write` |
| `POST` | `/api/v1/bid-submissions/{id}/submit` \| `/lock` \| `/accept` \| `/decline` | `bids:write` |
| `POST` | `/api/v1/bid-submissions/{id}/push-to-purchase-order` | `bids:write`, `purchase-orders:write` |

**Vendor Portal** (`/api/v1/vendor-portal/*`) mirrors the Client Portal's auth shape
with its own token namespace (`VendorSession` / `VendorActionToken`):

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/v1/vendor-portal/login` | invite/login token (`Authorization: Bearer`) |
| `GET` | `/api/v1/vendor-portal/jobs` | portal session |
| `GET` | `/api/v1/vendor-portal/jobs/{id}/schedule` \| `/documents` \| `/purchase-orders` \| `/bills` | portal session, gated per-job by `VendorJobAccess` |
| `POST` | `/api/v1/vendor-portal/purchase-orders/{id}/accept` | portal session **or** a `PO_ACCEPTANCE` one-time token |
| `GET` | `/api/v1/vendor-portal/bid-packages` | portal session — packages this vendor is invited to, **not** gated by `VendorJobAccess` |
| `POST` | `/api/v1/vendor-portal/bid-submissions/{id}/submit` | portal session, must own the submission |

Phase 5 (CRM/Sales) routes:

| Method | Path | Scope |
|---|---|---|
| `GET` `POST` | `/api/v1/leads` | `leads:read` / `leads:write` |
| `POST` | `/api/v1/leads/{id}/stage` | `leads:write` |
| `POST` | `/api/v1/leads/{id}/convert-to-job` | `leads:write`, `jobs:write` |
| `GET` `POST` | `/api/v1/proposals` | `proposals:read` / `proposals:write` |
| `POST` | `/api/v1/proposals/{id}/send` \| `/decline` | `proposals:write` |
| `POST` | `/api/v1/proposals/{id}/approval-link` | `proposals:write` |
| `POST` | `/api/v1/portal/proposals/{id}/accept` | client portal session **or** a `PROPOSAL_ACCEPTANCE` one-time token |

Phase 6 (Specifications, Submittals, Warranty, Surveys) routes:

| Method | Path | Scope |
|---|---|---|
| `GET` `POST` | `/api/v1/specifications` | `specifications:read` / `specifications:write` |
| `POST` | `/api/v1/specifications/generate-from-estimate` | `specifications:write` |
| `GET` `POST` | `/api/v1/submittals` | `submittals:read` / `submittals:write` |
| `POST` | `/api/v1/submittals/{id}/revisions` | `submittals:write` |
| `POST` | `/api/v1/submittals/{id}/review-link` | `submittals:write` |
| `GET` `POST` | `/api/v1/warranty-claims` | `warranty:read` / `warranty:write` |
| `POST` | `/api/v1/warranty-claims/{id}/schedule` | `warranty:write` |
| `POST` | `/api/v1/warranty-claims/{id}/trade-approval-link` | `warranty:write` |
| `POST` | `/api/v1/warranty-claims/{id}/client-approval-link` | `warranty:write` |
| `POST` | `/api/v1/vendor-portal/warranty-claims/{id}/accept-trade` | vendor portal session **or** a `WARRANTY_TRADE_ACCEPTANCE` one-time token |
| `POST` | `/api/v1/portal/warranty-claims/{id}/accept-client` | client portal session **or** a `WARRANTY_CLIENT_ACCEPTANCE` one-time token |
| `GET` `POST` | `/api/v1/surveys` | `surveys:read` / `surveys:write` |
| `POST` | `/api/v1/surveys/{id}/response-link` | `surveys:write` |

`/api/v1/submittal-reviews` and `/api/v1/survey-responses` are fully public
routes with no scope at all — they authenticate with a standalone single-use
link token (`SubmittalReviewLink` / `SurveyResponseLink`), not an ApiKey or a
Client/Vendor Portal token, since the recipient (an external reviewer or
survey respondent) has no account or standing relationship with the job:

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/v1/submittal-reviews` | single-use review-link token (`Authorization: Bearer`) |
| `POST` | `/api/v1/survey-responses` | single-use response-link token (`Authorization: Bearer`) |

**Full API reference:** `GET /api/v1/openapi.json` — the one route under `/api/v1`
that needs no API key, so you can read the contract before you have credentials.
It's generated straight from the same Zod schemas the routes validate against
(`src/lib/openapi.ts`), not hand-written, so request bodies can't drift from what
the server actually accepts. Paste it into any OpenAPI viewer (Swagger UI,
Postman, Redocly) for a browsable reference.

## Field app

`/field` (Phase 7) is a normal part of the web app, not the agent API — it
authenticates with the same Clerk staff session `/admin` uses, gated on
`currentAppUser()`. Visit it, sign in as an invited staff member (`UserRole`
`FIELD`/`PM`/`ADMIN` all work — there's no role restriction on the field
tools themselves), and the browser will offer to install it as a PWA.

| Page | What it does |
|---|---|
| `/field` | Home: current clock status, links to the two tools |
| `/field/time-clock` | Clock in/out, start/end a break, GPS captured best-effort |
| `/field/daily-log` | Submit a daily log against any active job |

Both tools work with no signal: a submission made while offline is held in
a `localStorage` queue and synced automatically once the browser is back
online (`src/lib/field-offline-queue.ts`, `src/app/field/field-sync-
manager.tsx`) — no separate "sync" button, no data entered twice.

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
- **A Vendor is never a User**, same as Client — `src/lib/vendor-portal/auth.ts`
  is its own auth path sharing only the token crypto with Client/ApiKey auth.
- **Bid Board participation is independent of `VendorJobAccess`.** A vendor
  can be invited to bid — and see/submit against that one package — with zero
  job access; only being awarded work grants the broader per-job visibility
  (CLAUDE.md 3: "job access as a distinct state from invitation/activation").
- **A Bid Package can end with more than one ACCEPTED submission.** Awarding
  split scope across trades is normal — this is not a single-winner auction —
  so `closeBidPackage(..., "AWARDED")` only requires *at least one* accepted
  submission, not that every other one be declined.
- **`db` (`src/lib/db.ts`) caches its PrismaClient unconditionally, including
  in production.** An earlier version only cached outside production; since
  the exported `db` is a Proxy that calls the client-getter on every property
  access, that meant production created a brand-new PrismaClient — and its
  own connection pool — on every single query, leaking Postgres connections
  under any real load. Found via this phase's live verification when enough
  distinct routes got hit in quick succession to actually exhaust
  `max_connections`. Never reintroduce an environment-conditional branch here.
- **A Lead is the one entity that legitimately predates a Job.** Every other
  Phase 3-5 model still belongs to exactly one Job. Converting a Lead
  (`src/lib/crm/service.ts`) creates a real Job in `PRE_SALE` using the exact
  same shape as `POST /jobs` — a converted lead's job is not a special kind
  of job.
- **A Proposal never duplicates Estimate pricing.** It carries a reference to
  one Estimate and nothing else money-shaped — the same "one place computes
  the numbers" principle as the Budget.
- **Accepting a Proposal chains three existing actions, not a fourth bespoke
  one.** `acceptProposal()` e-signs the proposal, then calls
  `transitionJobStatus(PRE_SALE -> OPEN)` and `sendEstimateToBudget()` — both
  already independently tested. `transitionJobStatus`'s `actor` is optional
  for exactly this: a client's e-signature has no User or ApiKey to attribute
  it to, and forcing one through would misattribute the audit trail.
- **A `Specification` reuses `ClientJobAccess.canViewDocuments` rather than
  getting its own visibility flag.** Auto-generating one from an Estimate
  groups line items by the pre-existing `groupLabel` field — no new grouping
  concept was invented for this.
- **`SubmittalReviewLink` and `SurveyResponseLink` are standalone, no-account
  tables — not Client/Vendor Portal tokens.** An external reviewer or survey
  recipient may have zero standing relationship with the job (not even a
  `Client`/`Vendor` row), so these are a third token namespace sharing only
  `src/lib/secure-tokens.ts` crypto, redeemed directly rather than through
  `client-portal/auth.ts` or `vendor-portal/auth.ts`.
- **A `WarrantyClaim` only reaches `COMPLETED` once both the trade and the
  client have independently accepted.** Either acceptance alone moves it to
  `IN_PROGRESS` at most; `acceptTradeWork()`/`acceptClientSatisfaction()` each
  check the other side's acceptance timestamp before deciding the next
  status, rather than a single "who signed last" flag.
- **`/field`'s Server Actions authenticate with the Clerk staff session, never
  an ApiKey.** They call the exact same `time-clock`/`daily-logs` service
  functions the agent-facing `/api/v1` routes call — only the auth layer
  differs — so field behavior and agent behavior can never silently diverge.
- **At most one offline time-clock action is ever queued at a time.** A
  queued clock-out/break references the entryId its clock-in creates, and
  that id doesn't exist until the clock-in reaches the server — so the field
  UI blocks starting a second time-clock action until the first syncs.
  Offline daily logs have no such dependency and queue without limit.

## Stack

Next.js 16 (App Router) · TypeScript · Postgres via Prisma 7 · Clerk · Tailwind 4 · Vitest

Note: Next 16 renamed `middleware.ts` to `proxy.ts` and made `params`, `cookies()` and
`headers()` async. Read the bundled docs in `node_modules/next/dist/docs/` rather than
relying on Next 14/15 habits.
