@AGENTS.md

# WCI OS — Architecture Spec

Construction management platform for **World Construction Inc**. Goal: Buildertrend
feature parity, then beyond it via an open API/webhook layer so the Jarvis multi-agent
system (Heather, Duke, Hank, Vince, Neil) can operate it directly instead of driving
Buildertrend's UI through browser automation. It replaces the Airtable Job Tracker and
becomes the system of record that syncs two-way with QuickBooks.

This file is the grounding document for every session. Read it before doing anything else.

---

## 1. Product scope

Job-centric system covering pre-construction/sales, project management, financials,
client portal, sub/vendor portal, reporting, mobile/field, and an agent-facing API.
Three deliberate departures from Buildertrend:

1. **Open API + OAuth + webhooks from day one.** Buildertrend has no public developer
   platform. This is the biggest gap to exploit — WCI OS should be automatable natively.
2. **QuickBooks as a true two-way sync**, not a one-way push with pull-backs bolted on.
3. **Built around WCI's actual cost code taxonomy and job vocabulary from day one**, not
   a generic construction template.

**Users:** Damien (owner/admin), PMs/office, Duke (purchasing agent, via API), Hank (PM
agent), Vince (sales agent), Neil (estimator agent), subs/vendors (portal, no seat cost),
clients/homeowners (portal, no seat cost).

**Not in scope for v1:** payroll processing itself (sync to Gusto/QuickBooks instead), a
third-party integration marketplace, DocuSign-grade e-signature infrastructure (build
simple native e-sign first, matching what Buildertrend actually does).

---

## 2. Architecture

### 2.1 Tech stack

Strong defaults — deviate only for a real constraint, and record it in section 7 when you do.

- **Framework:** Next.js (App Router) + TypeScript, full stack in one repo
- **Database:** PostgreSQL (Supabase or Neon)
- **ORM:** Prisma
- **API layer:** REST, versioned (`/api/v1/...`) for the public/agent-facing API — external
  consumers want a stable documented contract, not a GraphQL schema to introspect.
  Internal app-to-backend calls use Server Actions / route handlers directly.
- **Auth:** Clerk (or NextAuth/Auth.js) for human users, with org support and invite flows;
  **separate API-key/OAuth-client auth** for machine consumers. Do not reuse human session
  auth for the agent API.
- **Background jobs/queues:** Inngest or Trigger.dev (webhook delivery, QuickBooks sync,
  scheduled reminders, AI summarization). Do not roll your own cron+queue.
- **Real-time:** Postgres LISTEN/NOTIFY via Supabase Realtime, or Pusher/Ably otherwise.
- **File storage:** S3-compatible (Supabase Storage or Cloudflare R2).
- **Payments:** Stripe (ACH + card) — the "Buildertrend Payments" equivalent.
- **E-signature:** native minimal e-sign (signed hash + timestamp + IP stored alongside the
  document) for v1; leave a clean seam to swap in DocuSign later.
- **UI:** Tailwind + shadcn/ui.
- **Mobile/field:** installable PWA first (Phase 7). Only reach for React Native/Expo if
  offline-first camera/GPS proves the PWA insufficient. Design offline daily logs and time
  clock API-first so an offline-capable client can queue and sync them.
- **Hosting:** Vercel (app) + Supabase/Neon (db) + Supabase Storage or R2 (files).
- **Monorepo tool:** not needed at this scale. Add Turborepo only if mobile goes native.

### 2.2 System shape

```
                         ┌──────────────────────────┐
                         │   Web app (Next.js)      │  ← Damien, PMs, office
                         │   Client portal          │  ← homeowners
                         │   Sub/Vendor portal      │  ← subs/vendors
                         └────────────┬─────────────┘
                                      │
                         ┌────────────▼─────────────┐
                         │   Core API (REST, v1)    │
                         │   Server actions (internal)
                         └──┬───────┬───────┬───────┴─┐
                            │       │       │         │
                    ┌───────▼──┐ ┌──▼─────┐ ┌▼──────┐ ┌▼────────────┐
                    │ Postgres │ │ File   │ │ Queue/│ │ Webhook     │
                    │ (Prisma) │ │ storage│ │ jobs  │ │ dispatcher  │
                    └──────────┘ └────────┘ └───┬───┘ └──────┬──────┘
                                                │            │
                                   ┌────────────▼──┐  ┌──────▼────────────────┐
                                   │ QuickBooks sync│  │ Agent API consumers   │
                                   │ (2-way, queued)│  │ Jarvis / Heather /    │
                                   └────────────────┘  │ Duke / Hank / Vince / │
                                                       │ Neil (own API keys)   │
                                                       └───────────────────────┘
```

### 2.3 Core data model

Every entity except Organization, User, and CostCode belongs to exactly one `Job`.
This mirrors Buildertrend's own architecture: **Job is the aggregate root.**

```
Organization
  └─ User (role: admin | pm | office | field | agent)
       - agent users carry an `agent_key` type distinguishing Jarvis/Heather/Duke/Hank/Vince/Neil

Job
  - contractType: FIXED_PRICE | OPEN_BOOK      ← branches markup/invoice/report logic system-wide
  - status: PRE_SALE | OPEN | WARRANTY | CLOSED ← lifecycle state machine gates module behavior
  - prefix, jobGroupId (nullable, for multi-family rollups)
  - address, sqft, permitNumber, lotInfo
  - projectedStart/End, actualStart/End, scheduleColor
  - customFields (jsonb)
  - isTemplate (bool) — jobs, like estimates/schedules/specs, are templatable

CostCode (org-level catalog)
  - code, name, defaultCostType: LABOR | MATERIAL | EQUIPMENT | SUBCONTRACTOR | OTHER | NONE
  - seed WCI's real codes here (see section 6)

Lead / Opportunity (pre-Job, CRM)
  - convertsTo Job on proposal acceptance (mirrors the Estimate→Budget "Send to Budget"
    pattern: an explicit action materializes a linked record, never an implicit background sync)

Estimate → EstimateLineItem (costCode, costType, unitCost, qty, markup|margin, taxable, internalNote)
  - "Send to Job Budget" action locks the estimate and creates/updates the Budget below

Budget (computed, per Job × CostCode) — the layered commitment funnel, computed not stored
where possible:
  originalBudgetCost → revisedBudgetCost (+ approved Selections/COs)
    → pendingCost (unapproved POs) → committedCost (approved POs + unapproved labor)
    → actualCost (accrual: open+paid bills; cash: paid bills only)
    → projectedCost (max of revised/committed/actual, per selectable projectionReference)
    → costToComplete (projected − actual)
  clientPricing: originalClientPrice, revisedClientPrice, amountInvoiced, remainingToInvoice
  profit: projectedProfit, projectedMarginPct

Schedule → ScheduleItem (dates, predecessors[], isCriticalPath, assignees[],
  nonWorkingDayOverrides, confirmationStatus, clientVisible, subVisible)

DailyLog (note, photos[], videos[], weather (auto from job address), authorId, visibility)

Todo (generic — this IS the punch-list entity too; do not build a separate PunchList model)
  - title, priority, dueDate, checklistItems[], assigneeId, visibility, category (freeform
    tag, e.g. "punch", "milestone" — used for filtering, not a schema split)

RFI (title, dueDate, assigneeId, question, attachments[], relatedItemRef)

ChangeOrder (mode: FLAT | ITEMIZED, lineItems[] if itemized, signatureRecord, status)
  - approval updates Budget.revisedBudgetCost + revisedClientPrice, and can spawn
    PO/Bid/Invoice/Schedule updates via the same "explicit conversion action" pattern

File (documents/photos/videos, per-job, per-role visibility)

Selection.Option (title, description, price, images[], status: PENDING|APPROVED|DECLINED)
Allowance (budget placeholder — created only via the Estimate worksheet, links to a
  Selection category)

Specification (richText or auto-generated-from-Estimate, bookView/listView, per-viewer
  permissions)

Submittal (materialSpec/shopDrawing, externalReviewers[] who need NO account, revisionHistory[])

WarrantyClaim (claimNumber, submittedBy, appointment, tradeAcceptance, clientAcceptance)

Survey + SurveyResponse (touchpoint: PRE_PROJECT|MID_PROJECT|POST_COMPLETION)

Bid.Package → Bid.LineItem, Bid.Submission (per invited vendor, status, editableBySubUntilLocked)

PurchaseOrder (sourceRef: nullable — from CO/Bid/Selection/Estimate/scratch, lineItems[],
  status, amendments[] with version history, vendorSignature)

Bill (sourceRef: nullable PO, ocrSource: nullable receipt scan, approvalStatus:
  IN_REVIEW|APPROVED|READY_FOR_PAYMENT|PAID, poSuffix)

Invoice (type: FLAT|LINE_ITEM|PROGRESS, drawScheduleRef nullable, scheduleOfValues if progress)
DrawSchedule → Draw (pctOfContract, linkedScheduleItemId nullable, autoGeneratesInvoiceOnDate)

Payment (method: STRIPE_CARD|STRIPE_ACH|QBO_SYNC|MANUAL, appliesTo: Invoice|Bill)

TimeClockEntry (userId, jobId, costCodeId, clockIn/Out, breaks[], gpsAtClockIn/Out,
  geofenceStatus, approvalStatus, sourceOfLaborRate)

Vendor/Sub (profile, tradeType, jobAccess[] — separate from portalInvited/activated status,
  certifications[] with expiry+reminders, notificationPrefs)

Client (per-job portal permissions — module-level visibility flags, not a single role)

Comment/Activity (polymorphic: featureType + featureId, authorId, body, mentions[],
  deliveredVia[]) — one unified table for comments across every module, not per-module tables

Notification (userId or externalEmail, channel: EMAIL|SMS|PUSH|IN_APP, payload, readAt)

Integration credentials (QuickBooksConnection, GustoConnection, GoogleCalendarConnection, ...)
ApiKey / OAuthClient (scoped to org, tagged to which agent/system it belongs to, rate-limited)
WebhookSubscription (org-owned, eventTypes[], targetUrl, secret) — this is what lets
  Jarvis/Heather/Duke/Hank/Vince/Neil react to events instead of polling
```

**Key modeling decisions — carry these deliberately:**

- **Contract Type is a system-wide branch**, not a display label. Fixed Price vs Open Book
  changes markup calculation, invoice generation, and which report columns render.
  Implement it as a strategy/policy object the Budget and Invoice modules both consult,
  **not** a scattered set of `if (contractType === ...)` statements.
- **The commitment funnel (original → revised → pending → committed → actual → projected →
  cost-to-complete) is the financial core.** Get it right before building anything
  downstream of it (invoicing, reporting) — everything else reads from it.
- **"Access granted" ≠ "invited/activated."** Every external party (sub, vendor, client)
  needs three independent states: has data access, has been sent an activation email, has
  actually logged in. Support **headless** actions — a sub approving a PO or a client
  approving a Change Order via a signed link in an email, with no login required.
- **Conversions are explicit actions that create linked, back-referenced records**
  (Estimate→Budget, Bid→PO, PO→Bill, CO→Invoice line), never silent background sync.
  Preserve the source reference so users and agents can always trace "why does this line exist."

### 2.4 Permission model

Two layers:

1. **Role** on the User (admin/pm/office/field/agent) — coarse capability boundary.
2. **(User × Job) grants** — who can see/act on *this* job, at what granularity (matches
   Buildertrend's Permission Wizard: schedule scope, document access, comms rights, CO
   visibility, pricing visibility). Client portal visibility is the same shape: a
   per-client, per-job set of module toggles.

Agent API keys get the second layer too — Duke's key is scoped to Financial module write
access across all jobs, not admin access to everything.

### 2.5 Integration layer — where WCI OS beats Buildertrend

**Public API** (`/api/v1/`): REST, OAuth2 client-credentials for machine consumers,
versioned, documented (OpenAPI spec generated from route handlers).

**Webhooks**: org-configurable subscriptions on domain events — `job.created`,
`bill.created`, `bill.ready_for_payment`, `po.approved`, `change_order.approved`,
`daily_log.created`, `time_clock.out_of_bounds`, `permit.milestone_reached` (a custom event
type emitted from Heather's permitting pipeline even before it's a native module).

**QuickBooks Online — build the full two-way table**, not a partial version:

| Entity | Direction |
|---|---|
| Customers | WCI OS → QBO (auto-create) |
| Sub-customers/Projects | WCI OS → QBO |
| Vendors | WCI OS → QBO |
| Bills | WCI OS → QBO |
| Invoices/Progress Invoices | WCI OS → QBO |
| Credit Memos | WCI OS → QBO |
| Deposit Payments | WCI OS → QBO (Undeposited Funds) |
| Invoice Payments | QBO → WCI OS (marks invoice Paid) |
| Bill Payments | QBO → WCI OS (marks bill Paid) |
| Time Clock entries | WCI OS → QBO |
| Estimates | QBO → WCI OS (import) |
| QBO Expenses | QBO → WCI OS (into Budget, near-real-time) |

Sync via queued jobs, idempotent, with a sync-log table so a failed push is visible and
retryable rather than silently dropped — this matters once Duke reconciles Amex/Regions
transactions against it daily.

**Airtable Job Tracker migration**: one-time import script mapping the 28 fields across the
five views (Active Jobs, Awaiting Action, Money, Health Check, Grid) onto `Job` + related
entities. Keep the Airtable base read-only as an archive; run both in parallel for at least
one full job cycle before cutting over.

**Agent-specific hooks, designed in from Phase 1:**

- **Duke (purchasing):** endpoints for PO creation/matching, a `bill.unmatched_transaction`
  webhook Duke raises when an Amex/Regions transaction can't be auto-matched to a job, and
  PO-name-to-job matching logic (road name matching) exposed as an API helper so Duke
  doesn't reimplement it.
- **Heather (office manager):** endpoints for daily log creation, document upload, and a
  custom `permit.milestone_reached` event she can emit — Permit Rockstar / JAX EPICS /
  Simplifile stay external; WCI OS is the system of record permits get logged against.
- **Hank (PM), Vince (sales), Neil (estimator):** API keys scoped to Project Management,
  CRM/Proposals, and Estimating respectively as those agents come online.
- **Jarvis (orchestrator):** read-heavy cross-module key plus webhook subscriptions across
  everything — Jarvis coordinates the others rather than doing module-level work.

---

## 3. Module specifications (acceptance criteria per phase)

**Pre-Construction/Sales**: CRM pipeline (leads/opportunities, stage tracking), Proposal
builder with e-signature that converts to a Job on acceptance, Estimate builder (5 entry
methods: line-by-line, import, template, cost-catalog pick, bulk cost-code add; markup or
margin; grouping by room/assembly or cost-code hierarchy; lock-on-send; revision history),
Bid Board (package creation, sub invitation, submission, builder-edit-on-behalf,
multi-vendor accept), takeoff-lite (measurement entry against uploaded plans — full
CAD-style takeoff is a stretch goal, not v1).

**Project Management**: Scheduling (Gantt + calendar/list views, dependencies with
auto-shift, critical path, weather/holiday/personal-day non-working days, baseline
snapshots, Google/Outlook two-way sync, templates, selective sharing), Daily Logs
(notes+media+auto-weather+annotation), Todos (generic, covers punch lists), RFIs, Change
Orders (flat or itemized, e-sign, auto-updates Budget), Files, Selections & Allowances,
Specifications (manual or auto-generated from Estimate), Submittals (external reviewers
without accounts), Warranty (claims, appointments, dual acceptance), Surveys.

**Financial Tools**: Job Costing Budget (the full commitment-funnel model from 2.3, four
views: Standard/Job Costing/Client Pricing/Profit + custom, Job Group rollups), Purchase
Orders (multi-source generation, amend-in-place, e-sign), Bills/AP (from scratch/PO/OCR
receipt capture, approval routing, PO-suffix reconciliation), Time Tracking (clock in/out,
geofencing, supervisor bulk clock-in, cost-code-linked labor rates, daily+weekly OT, Gusto
sync), Invoicing (flat/line-item/progress with schedule-of-values, draw schedules),
Payments (Stripe card+ACH), the six standard reports (WIP, Budgeted vs Projected,
Profitability, Invoicing, Labor Actuals vs Budgeted, Cash Flow).

**Client Portal**: daily logs, schedule, messaging, budget (off by default),
invoices+payment, bills visibility, selections (view+e-sign), change orders
(view+approve), documents, granular per-project module visibility, AI weekly-summary
digest (Phase 8).

**Sub/Vendor Portal**: profile + bulk import, job access as a distinct state from
invitation/activation, Permission Wizard equivalent, certification/insurance expiry
tracking, docs/photos/videos hub, threaded comments across bids/COs/logs/files/bills/POs/
scheduling, PO acceptance+e-sign, bill/lien-waiver visibility+payment receipt, bid
submission, warranty appointment assignment.

**Reporting/Dashboards**: the six financial reports, a job-level Price Summary dashboard,
and a cross-project executive view.

**Mobile/Field**: PWA first, prioritizing offline daily logs and offline time-clock entry
with sync-on-reconnect.

**Agent/API layer**: everything in 2.5 — built alongside Phase 1's financial core, not as
an afterthought.

---

## 4. Build roadmap

Sequenced so financials (where the automation and Duke already live) land early, and each
phase is independently useful.

- **Phase 0 — Foundation.** Org/auth/roles, Job entity + lifecycle state machine + Contract
  Type branching, CostCode catalog seeded with WCI's real codes, base API scaffolding (auth
  for both humans and API keys), CLAUDE.md in place, CI + staging environment.
- **Phase 1 — Financial core + agent API + QuickBooks.** Estimate builder, Budget (full
  commitment funnel), Purchase Orders, Bills/AP, Invoicing, Time Clock, the six reports,
  the full two-way QuickBooks sync, webhook dispatcher, Duke's API surface.
- **Phase 2 — Project management core.** Scheduling, Daily Logs, Todos, RFIs, Change Orders
  (wired into Budget), Files, Comment/Activity layer, Notifications. Heather's API surface.
- **Phase 3 — Client Portal.** Read access to logs/schedule/documents, then
  Selections+approval, Change Order approval, Invoices+Stripe payments, Budget visibility
  (off by default).
- **Phase 4 — Sub/Vendor Portal + Bidding.** Sub profiles, Permission Wizard equivalent,
  Bid Board, PO acceptance/e-sign in portal, certifications/insurance tracking.
- **Phase 5 — CRM/Sales.** Leads/Opportunities, Proposal builder, Estimate↔Proposal
  linkage, Lead→Job conversion. Vince's and Neil's API surfaces.
- **Phase 6 — Warranty, Submittals, Surveys, Specifications.** Landed: dual-acceptance
  Warranty claims, numbered Submittal revisions + headless external review, auto-generated
  Specifications from an Estimate, Survey response links. Hank's API surface extended.
- **Phase 6b — Airtable migration + cutover, Job Group/multi-family rollup views.** Split
  out of the original Phase 6 bullet — needs Damien's Airtable export/schema, so it did not
  land alongside the rest of Phase 6.
- **Phase 7 — Mobile/field PWA hardening.** Offline daily logs + time clock.
- **Phase 8 — AI layer.** Weekly client-update summaries, receipt/bill OCR capture, agent-
  facing summarization — built as a read/write layer over the canonical entities (2.3), not
  a new subsystem.

**Between phases: actually use the feature on a real WCI job before moving on.** Don't
build Phase 4 on an unvalidated Phase 1.

---

## 5. Conventions

- `src/lib/` holds domain logic; keep it framework-agnostic and unit-testable.
- Contract-type behavior lives in `src/lib/contract-type/` as strategy objects. Adding an
  `if (job.contractType === ...)` outside that directory is a code smell.
- Job status transitions go through the guarded state machine in `src/lib/job-status.ts`.
  Never assign `job.status` directly.
- Public API routes live under `src/app/api/v1/` and authenticate via API-key middleware
  (`src/lib/api-auth.ts`), never via human session auth.
- Money is stored as integer **cents** (`Int`), never floats. Percentages are stored as
  basis points (`Int`), never binary floats. See `src/lib/money.ts`.
- Run `npm run check` (lint + typecheck + test) before every commit.
- This is Next.js 16 — its APIs differ from older training data. `AGENTS.md` (imported at
  the top of this file) points at the bundled docs in `node_modules/next/dist/docs/`.
  Read them rather than assuming Next 14/15 conventions.

---

## 6. Seed data

**WCI cost codes confirmed from the Buildertrend account** (seeded in Phase 0):

- Painting: "Int Paint Labor", "Int Paint Materials"
- Trim: "Finish Carpentry Labor", "Finish Carpentry Materials"
- Flooring: "LVP Flooring"
- Electrical, HVAC, Drywall — confirmed present, but the **exact code names still need to
  be pulled from the live Buildertrend account.** Export the full Buildertrend cost code
  list and replace the placeholder entries in `prisma/seed.ts` with the real taxonomy.

**Agent roster for API key provisioning:**

| Key name | Agent | Scope |
|---|---|---|
| jarvis | Orchestrator | Read-heavy, cross-module, all webhook subscriptions |
| heather | Office manager | Daily Logs, Files, custom permit-milestone events (Phase 2) |
| duke | Purchasing | Purchase Orders, Bills, unmatched-transaction webhook (Phase 1) |
| hank | PM | Project management module (Phase 2 onward); Specifications/Submittals/Warranty/Surveys (Phase 6) |
| vince | Sales | Leads/Opportunities/Proposals (Phase 5) |
| neil | Estimator | Estimates (Phase 5, though Estimate itself ships in Phase 1) |

**Migration source:** Airtable "WCI Job Tracker" — 28 fields, 5 views (Active Jobs,
Awaiting Action, Money, Health Check, Grid). Export before Phase 6.

---

## 7. Deviations from the original spec

Record every architectural decision that departs from the above, with the reason.

- **Auth (Phase 0):** Clerk chosen for internal staff. Portal users (clients, subs) will
  **not** get Clerk accounts — they authenticate via signed links backed by our own
  `Client`/`Vendor` records. Reason: Clerk bills per monthly active user, and the spec
  requires portal access at no seat cost for potentially hundreds of homeowners and subs;
  the spec also requires headless approvals (approve a CO from an email link with no
  login), so external parties largely don't need accounts at all. Clerk still earns its
  place for staff org management and invite flows.
- **Auth fallback (Phase 0):** when Clerk env vars are absent, `src/lib/auth.ts` falls back
  to a dev-only stub user so the app builds and CI runs without secrets. The stub refuses
  to activate when `NODE_ENV === "production"`.
- **AI estimate drafting pulled forward from Phase 8 (added by explicit request):** the
  original roadmap put AI features last, after every module had validated data to work
  with. Damien asked for handoff.ai-style AI-assisted estimating alongside Phase 1's
  financial core instead of waiting. Scoped narrowly to stay safe this early: it drafts
  an `Estimate` (always status `DRAFT`, `aiGenerated: true`) from field notes, constrained
  to the org's real `CostCode` catalog via a Zod enum built from the actual catalog (a
  hallucinated cost code cannot pass schema validation, not just "the prompt says not
  to"). It never locks the estimate and never calls "Send to Job Budget" itself — a human
  reviews it like any hand-entered estimate first. See `src/lib/ai/`. Optional integration,
  same pattern as Clerk: without `ANTHROPIC_API_KEY` it returns a clear 503 rather than
  breaking the build.
- **File storage (Phase 2):** no S3/R2 integration yet — needs storage credentials. The
  `File` model stores metadata plus a caller-supplied `url`; the caller uploads elsewhere
  (for now) and registers the resulting URL. Swapping in real presigned uploads later only
  touches `src/lib/files/service.ts`, not the schema.
- **Daily Log weather (Phase 2):** optional integration, same pattern as Clerk/Anthropic —
  without `WEATHER_API_KEY`, `DailyLog.weather` stays `null` rather than the app failing
  or fabricating a value. See `src/lib/daily-logs/weather.ts`.
- **Notifications (Phase 2):** `IN_APP` is "delivered" the moment the row exists — no
  transport step needed. `EMAIL`/`SMS`/`PUSH` have no provider configured yet (needs
  SendGrid/Twilio/APNs/FCM credentials); rows for those channels are still persisted so
  nothing is silently dropped, but `deliveredAt` stays null until a real provider exists.
  See `src/lib/notifications/service.ts`.
- **Client portal invites are issued, not emailed (Phase 3):** with no email provider
  configured yet (same gap as Notifications above), `POST /api/v1/clients/{id}/
  portal-invite` returns the raw one-time login token directly in the response —
  exactly like `ApiKey` issuance — rather than emailing it. The caller (Heather, or a
  staff member) is responsible for getting it to the client until a real provider
  exists. `client.invited` still fires as a webhook event so an email step can be
  wired in later without touching the issuance endpoint.
- **Portal login tokens are single-use, so re-login means re-inviting (Phase 3):**
  `PORTAL_LOGIN` is a `ClientActionToken` purpose, and every action token is
  consumed on first use (same as the headless approval tokens). A `ClientSession`
  lasts 30 days, but once it expires (or is revoked) the client cannot exchange the
  same invite link again — staff/an agent must issue a fresh one. A real "log in
  again with your email" flow needs the email provider from the point above; this
  keeps the mechanism correct without inventing a password system to work around it.
- **The OpenAPI spec has a Phase 2 gap (found while adding Phase 3's entries):**
  `src/lib/openapi.ts`'s `ENDPOINTS` array is hand-transcribed per route, and Phase 2
  (scheduling, daily logs, todos, RFIs, files, comments, notifications, change orders)
  was never added to it — only Phase 0/1 and, as of this entry, Phase 3 are documented.
  The routes themselves are unaffected (this file only feeds `GET /api/v1/openapi.json`);
  backfilling Phase 2's ~20 entries is a clearly-scoped follow-up, deliberately not
  done in the same change as Phase 3 to keep that diff reviewable.
- **Stripe integration is minimal by design (Phase 3):** `src/lib/payments/stripe.ts`
  talks to Stripe's REST API directly via `fetch` (no SDK dependency) for exactly two
  calls — create a PaymentIntent, verify a webhook signature. The webhook receiver
  records every successful charge as `PaymentMethod.STRIPE_CARD`, even an ACH charge,
  since telling them apart needs a second API call this integration doesn't make yet.
  Optional integration, same pattern as Weather/Anthropic: without `STRIPE_SECRET_KEY`,
  `POST /api/v1/portal/invoices/{id}/pay` returns a clean 503, never a fabricated
  payment.
- **Production PrismaClient was leaking connections (found via Phase 4 live
  verification, fixed in this change):** `src/lib/db.ts` only cached its client
  on `globalThis` when `!isProduction`. The comment above it explained the cache
  as a *dev-mode hot-reload* concern, but `db` is exported as a Proxy that calls
  the client-getter on every property access — so in production the guard meant
  every single query created a brand-new `PrismaClient` (and its own `pg.Pool`),
  which never got torn down. Harmless at low request volume; under this phase's
  live-verification script (dozens of distinct routes hit back-to-back) it
  reliably exhausted Postgres's `max_connections` and requests started failing
  with "too many clients already." Fixed by caching unconditionally — there is
  no environment where NOT caching the client is correct. Filed as a fix, not a
  deviation-with-a-workaround, since the original behavior was simply wrong.
- **Vendor schedule visibility does not yet filter by `scheduleScope` (Phase 4):**
  `VendorJobAccess.scheduleScope` (`ASSIGNED_ONLY` | `ALL_ITEMS`) exists in the
  schema per CLAUDE.md 2.4's Permission Wizard, but `GET /vendor-portal/jobs/
  {jobId}/schedule` only filters on `ScheduleItem.subVisible` — every sub-visible
  item, regardless of scope. `ScheduleItem` assignment is by `assigneeUserIds`
  (`User` ids), and a `Vendor` is never a `User`, so there is no assignee match
  to filter `ASSIGNED_ONLY` against yet. Closing this needs either a
  vendor-assignment field on `ScheduleItem` or a join table, deliberately not
  added speculatively here.
- **Certification/insurance expiry has no reminder delivery (Phase 4):**
  `GET /api/v1/certifications/expiring` is query-only — the seam a scheduled job
  would poll once a queue exists (same gap as Notifications' non-`IN_APP`
  channels and QuickBooks sync: no scheduled-job infrastructure yet).
- **A vendor's PO acceptance can be re-signed with no guard (Phase 4):**
  `acceptPurchaseOrder()` only checks `status === APPROVED`, not whether
  `vendorSignedAt` is already set — accepting an already-accepted PO just
  re-signs it (a later signature overwrites an earlier one). Unlike Selection
  approval or Change Order approval, there is no terminal "already decided"
  state for PO acceptance to protect, so this was left permissive rather than
  adding a guard against a scenario (does re-signing ever matter?) the spec
  doesn't actually call out.
- **`transitionJobStatus`'s `actor` became optional (Phase 5):** Proposal
  acceptance can move a Job from `PRE_SALE` to `OPEN` off a client's
  e-signature — a Client is neither a `User` nor an `ApiKey`
  (src/lib/jobs.ts's `Actor` union), so there was no honest value to pass.
  Forcing a fake `apiKeyId` through would have corrupted `JobStatusEvent`'s
  audit trail (a foreign key to a row that doesn't represent what actually
  happened) or required a DB migration to add a third actor kind for a single
  call site. Making `actor` optional — both `JobStatusEvent` actor columns
  are already nullable — was the smaller, more honest change: `reason` alone
  ("Proposal {id} accepted") already explains the transition.
- **Lead/Proposal reuse existing subsystems rather than inventing CRM-specific
  ones (Phase 5):** `convertLeadToJob()` creates a Job exactly like `POST
  /jobs` (always `PRE_SALE`, writes the opening `JobStatusEvent`) instead of
  a parallel "lead job" concept. `Proposal` has no line items of its own — it
  references one `Estimate` — and `acceptProposal()` calls the existing
  `sendEstimateToBudget()` rather than re-deriving budget numbers. The
  `PRE_SALE -> OPEN` transition rule ("Proposal accepted — job sold and under
  construction") was already written in Phase 0's `job-status.ts`,
  anticipating this exact flow.
- **Proposal e-signature reuses the Client Portal's token mechanism (Phase
  5):** a new `ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE` value, not a
  fourth parallel auth path. `issueApprovalLink()` (Phase 3) does not
  validate that the `clientId` it's issuing for actually matches a given
  resource's expected client — for Change Orders/Selections there is no such
  expectation to check (neither model records one), but `Proposal.clientId`
  does, so `POST /portal/proposals/{id}/accept`'s headless branch checks the
  redeemed token's `clientId` against `Proposal.clientId` itself
  (`ProposalClientMismatchError`) rather than widening `issueApprovalLink()`
  with a check only one of its three callers needs.
- **Submittal review and survey-response links have no reminder/notification
  delivery (Phase 6):** `POST /submittals/{id}/review-link` and `POST
  /surveys/{id}/response-link` mint the token and return it — there is no
  outbound email/SMS to actually deliver the link, the same gap as
  certifications' expiry tracking (Phase 4) and Notifications' non-`IN_APP`
  channels (Phase 2): no scheduled-job/email-provider infrastructure yet, so
  an agent or staff member sends the link out-of-band for now.
- **`SubmittalReviewLink`/`SurveyResponseLink` are a third token namespace,
  not a repurposed Client/Vendor Portal one (Phase 6):** an external
  reviewer or survey recipient may have no `Client`/`Vendor` row at all — no
  standing relationship with the job — so `src/lib/submittals/service.ts`
  and `src/lib/surveys/service.ts` call `parseSecureToken`/`secretMatches`
  from `src/lib/secure-tokens.ts` directly rather than going through
  `client-portal/auth.ts` or `vendor-portal/auth.ts`, which both assume an
  underlying Client/Vendor record.
- **`WarrantyClaim` dual acceptance reuses Client/Vendor Portal tokens rather
  than a fourth auth mechanism (Phase 6):** `WARRANTY_CLIENT_ACCEPTANCE` and
  `WARRANTY_TRADE_ACCEPTANCE` are just two more purposes added to the
  existing `ClientActionToken`/`VendorActionToken` tables. Each acceptance
  path checks the *other* side's acceptance timestamp to decide whether the
  claim moves to `IN_PROGRESS` (one side accepted) or `COMPLETED` (both
  have) — there is no separate "who signed last" flag.
- **A `Specification` reuses `ClientJobAccess.canViewDocuments` (Phase 6):**
  no new per-entity visibility flag was added; a Specification is
  document-like enough that the existing documents flag already covers it.
  Auto-generation from an Estimate (`generateSpecificationFromEstimate`)
  groups line items by the pre-existing `EstimateLineItem.groupLabel` field
  rather than inventing a new grouping concept.
