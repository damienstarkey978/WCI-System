# WCI OS — Financials/Bills/POs UI-UX Audit vs. Buildertrend (Sept 7 2026)

Live re-audit, done by clicking through both apps side by side with real data: WCI OS at
`app.worldconstructionjax.com` (job "10841 Reading Rd - Mcmullin - Ins Fire") and the real
Buildertrend account at `buildertrend.net` (same job, which has 38 real POs and 110 real bills
in Buildertrend). This supersedes the Financial-module parts of
`buildertrend-parity-gap-analysis-and-ai-features-spec.md` (Aug 27) — that doc's Part A.4 called
Job Costing Budget "most likely already built" and didn't audit PO/Bills UI at all, because at
the time neither page existed yet. They exist now (nav-wise) but are placeholder stubs with no
real functionality and, in Bills' case, no data despite 5,226 bills already sitting exported on
Damien's Mac.

## What's already correct — don't rebuild these

- Top nav IA matches Buildertrend exactly: Sales / Jobs / Project Management / Files / Messaging
  / Financial / Reports, and the Financial dropdown already has the right 8 items in the right
  order (Bids, Estimate, Purchase Orders, Bills, Job Costing Budget, Cost Inbox, Invoices, Online
  Payment Report) — Cost Inbox is a WCI-only addition, not in Buildertrend's menu, and that's fine.
- Job-scoped shell, sidebar job list, Jarvis home dashboard with Daily Brief (overdue invoices,
  jobs over budget, unapproved timesheets, etc.) are live and good.
- Job Costing Budget already has the four-tab view switcher (Standard / Job Costing / Client
  Pricing / Profit) called for in the Aug 27 doc.
- Invoices list/detail, RFIs, Daily Logs, Schedule, Change Orders, Selections, Warranties, Time
  Clock, Plans and Specs, Submittals, Tasks, Reports module — all exist with real nav entries.

## Gap 1 — Purchase Orders: bare single-line form vs. a real subcontractor-agreement workflow

**WCI OS today** (`/jobs/[jobId]/purchase-orders`): one flat page. A "New purchase order" form
with PO#, Vendor (freetext), one line item (Cost code dropdown / Description / Qty / Unit cost),
"+ Add line item", "Create purchase order". Below it: a list that's either empty or (once
anything exists) presumably a flat table. That's the entire feature. No status, no approval, no
vendor e-signature, no scope-of-work text, no attachments, no linkage to Bills.

**Buildertrend has:**
- A **list view** with real columns: Job, PO #, Title, **PO Status** (Draft/Pending/**Approved**/
  Denied/**Recalled**), **Work Status** (Not Complete/**Work Complete**, separately tracked from
  PO approval), Performed By (vendor), Created Date, plus row actions (edit). Filterable, sortable,
  paginated (50/page), exportable (share icon), bulk-select checkboxes, a view-switcher
  ("Standard View" + a "..." menu for other saved views).
- A **detail view** (opens as a modal/panel, not a full page nav) with:
  - General Information: PO #, Title, **Assigned to** (real vendor picker, not freetext, shown
    with avatar), a **Materials Only** checkbox, Scheduled Completion date, Completion Date,
    **Total Cost** computed from line items.
  - **Scope of Work**: a rich-text field that can (and in WCI's real usage, does) carry a full
    subcontractor agreement — work schedule/hours, job-site cleanliness, safety/PPE requirements,
    workmanship standards, etc. — as boilerplate the vendor is agreeing to, not just a task
    description.
  - **Approvals panel**: shows who approved it (vendor name + avatar), the approval date, status
    pill, and a **"View agreement"** link — this is a real e-signature/acceptance flow the vendor
    completes in their own sub portal, not just an internal toggle.
  - **Work Status panel**: separate from approval status — a "Mark Work Complete" button tracks
    whether the physical work is done, independently of whether the PO itself was ever paid.
  - **Purchase Order Status panel**: a payment progress bar (e.g. "100% — Outstanding: $1,200.00"
    or "No payments have been made or requested"), so a PO shows how much of it has been billed/
    paid against, not just its face value.
  - **Internal Only** section: Internal Notes, visible to staff only, hidden from the vendor.
  - Footer actions: edit, **Amend** (revise an already-approved PO, which presumably re-triggers
    vendor acceptance), **Recall** (void/withdraw a PO), and a "..." overflow menu.
  - A history icon and a comment/discussion icon in the header (audit trail + threaded comments
    scoped to that PO).

**Build this:**
1. Real `PurchaseOrder` status enum: `DRAFT | PENDING_APPROVAL | APPROVED | DENIED | RECALLED`,
   separate from a `workStatus` enum: `NOT_COMPLETE | WORK_COMPLETE`.
2. Vendor must be a real relation to a `Vendor`/`Sub` record (existing contacts), not a text
   field — same object Bills and the sub portal already need.
3. Scope of Work as a rich-text field, with an optional reusable "agreement template" (WCI is
   already pasting the same subcontractor-responsibilities boilerplate into every PO by hand —
   worth a `POAgreementTemplate` the office can pick from instead of retyping it).
4. An **approval/e-signature step**: when a PO is sent, the assigned vendor gets a portal
   notification and must explicitly accept it (captured as `approvedByVendorAt` + a rendered,
   timestamped "View agreement" snapshot of the exact scope-of-work text they agreed to — don't
   let the agreement text be mutable after acceptance without re-triggering approval).
5. `Mark Work Complete` action, separate from approval, staff-only.
6. A PO detail payment-progress computed from linked Bills (see Gap 2) — `committedAmount`,
   `billedAmount`, `outstandingAmount`.
7. Amend (creates a revision, presumably re-requiring vendor acceptance) and Recall (void) actions
   with their own status transitions and an audit trail.
8. List view: sortable/filterable table with PO Status, Work Status, Performed By, Created Date
   columns, bulk-select, CSV/Excel export, pagination — not just a flat unstyled list.
9. Internal Notes field, staff-only, never shown in the vendor's view of the PO.

## Gap 2 — Bills: literally no data, and the intake workflow doesn't exist

**WCI OS today** (`/jobs/[jobId]/bills`): identical bare form pattern to POs — Vendor, Bill #,
"Against PO" dropdown (good, this linkage concept already exists), one line item row, "Create
bill". List below says "No bills yet" for every job. The separate **Cost Inbox** page
(`/jobs/[jobId]/cost-inbox`) says "AI-scanned receipts and bills awaiting your review" but has
**no visible upload control at all** — no drag-and-drop zone, no "Browse" button, no
forward-to-email address. It's a dead end today: there is no way to actually get a bill into it.

**Buildertrend has:**
- The Bills page opens directly into an **AI Bill Capture inbox**, not a manual-entry form:
  "Drop bills & receipts anywhere on this page — AI Bill Capture will do the data entry,"
  supporting `.gif .png .jpg .jpeg .pdf .heic`, plus a full-page drop zone and a "Browse" button,
  **plus an "Email to Inbox" button** — every job (or company) gets a real forwarding email
  address so office staff can forward vendor bill emails directly and have them land here
  automatically.
- A **status pipeline** as tabs with live counts: **Inbox** (just arrived, unprocessed) →
  **In Review** (AI has extracted data, human confirming) → **Ready for Payment** (approved,
  awaiting payment) → **Paid** → **All Bills** (everything). This job alone has 110 bills, all
  in Paid.
- The **All Bills list**: Job, Created by (which staff member entered/forwarded it), Bill #,
  **Bill title** (often literally the receipt filename — `reading flooring.pdf`,
  `IMG_4963.jpg`, `The Home Depot receipt #...` — because most bills originate as a photographed
  or forwarded receipt, not typed from scratch), Pay to (vendor), Bill amount, Invoice date, and
  a **summed total row** at the bottom ($95,211.18 across 110 bills for this one job).
- The **Bill detail** (opens as a modal): Type, Title, Name (vendor), **Bill #**, **Linked
  Purchase Order** (a clickable chip back to the PO it was billed against — "Purchase Order:
  0036 - Install Shower Pan"), Invoice date, Due date, Date paid, **"Link schedule item"** (ties
  the bill to a schedule task), Description, a **Costs table** (Title / Cost code / Cost type
  [e.g. Subcontractor] / Unit / Unit cost / Quantity / Builder cost) with Total / Amount paid /
  Remaining balance, an **Approvers** panel (configurable multi-step bill approval, currently
  unset on this one but the feature exists), a **QuickBooks** section showing live sync status
  ("Paid," "Refresh Status" button, "View in QuickBooks" link) **per bill**, an **Attachments**
  section (Add / Create new doc — the original receipt image/PDF lives here), and an **"Add to
  Invoice"** button that lets a bill's cost flow straight into a client invoice (markup/rebill).
- A separate **Lien Waiver tab** on every bill: pick a waiver form (e.g. "Standard Lien Waiver"),
  Apply, track status (Unreleased/Released) — lien waivers are generated and tracked per vendor
  payment, a real compliance feature GCs need for every sub payment.

**Build this — this is the single biggest functional gap in the whole system:**
1. `Bill` status pipeline: `INBOX | IN_REVIEW | READY_FOR_PAYMENT | PAID`, with counts surfaced
   as tabs exactly like Buildertrend's, plus an "All Bills" unfiltered view.
2. **Ingestion**, two paths:
   - A real drag-and-drop / click-to-browse uploader on the Bills page (or a promoted Cost Inbox)
     that accepts image/PDF receipts, runs them through Claude's vision API (the build spec
     already scoped "Bill OCR" for Phase 8 — this is that feature, finally with a UI) to extract
     vendor, amount, date, and a best-guess cost-code line-item split, landing the result in
     `IN_REVIEW` for a human to confirm before it becomes a real committed cost. Never
     auto-post an AI-read bill straight to `READY_FOR_PAYMENT` without human confirmation.
   - A **per-organization (or per-job) forwarding email address** — e.g.
     `bills-{orgSlug}@inbox.worldconstructionjax.com` — that lands forwarded vendor emails/
     attachments into the same Inbox queue. This is the single highest-leverage feature for
     actually getting Damien's office to use it instead of Buildertrend, since it matches how
     bills already arrive today (email).
3. `Bill.linkedPurchaseOrderId` (nullable FK) — when set, show the chip back to the PO, and roll
   the bill's cost into that PO's `billedAmount`/`outstandingAmount` (Gap 1, item 6).
4. `Bill.linkedScheduleItemId` (nullable FK) — reuse whatever Schedule model already exists.
5. Line items: `Title, costCodeId, costType (Labor/Material/Subcontractor/Equipment/Other), unit,
   unitCost, quantity, builderCost` — same shape already used by BudgetLine's cost coding, so
   these lines can roll straight into Job Costing Budget's `committedCosts`/`actualCosts`
   columns, which today read $0 everywhere because there's no Bill data driving them.
6. `Approvers` — a configurable list of staff who must approve a bill before it can move to
   `READY_FOR_PAYMENT` (mirror whatever pattern is cleanest given the existing user/role model;
   doesn't need to be more elaborate than "N required approvers, any order" for v1).
7. Per-bill **QuickBooks sync status** display (status pill + "Refresh Status" + "View in
   QuickBooks" link) — WCI OS already has a QuickBooks integration for Invoices; extend the same
   pattern to Bills once QuickBooks AP sync is wired up. NOTE: I just live-tested the QuickBooks
   connector and it's actually connected right now (Company: World Construction Co Inc, industry
   238160) — the "expired token" note in deployment-status.md is stale. Verify AP/write scopes
   independently before assuming full read/write access, but don't treat OAuth reauth as a
   blocker anymore.
8. **Attachments** on every bill — the original receipt/invoice file, reusing the File-storage
   backend Phase 9a already built for job photos/documents.
9. **"Add to Invoice"** — lets office staff take a bill's cost (with markup) and push it onto a
   client invoice directly from the bill, instead of re-keying it into the Invoice builder.
10. **Lien Waiver tab** on the bill detail: a `LienWaiver` record per bill/vendor-payment, a
    template picker (start with one "Standard Lien Waiver" template, matching what's live today),
    status (`UNRELEASED | RELEASED`), and a generated PDF. This can be v1-simple (fill a static
    template with vendor/amount/job/date and mark it released when downloaded/sent) — the point
    is having the record and the compliance trail, not a legal-document generator.
11. List view needs the same table richness as Gap 1 item 8: sortable columns, summed total row,
    bulk actions, export.

## Gap 3 — Invoices: missing Payments/Credit Memos/Deposits, Payment Schedule, and client-facing tracking

**WCI OS today** (`/jobs/[jobId]/invoices`): a flat list (Invoice #, Status, Due, Amount, Paid,
Balance, Actions) plus a bare create form (Invoice #, Type, Due date, Amount). Detail view: Type/
Issued/Due/Paid dates, Amount/Paid/Balance, a Payments list (source of each payment, e.g.
"Manual — Ref Migrated from Buildertrend..."), QuickBooks status, and a generic Comments thread.
This part is functional and has real imported data (93 invoices across 29 of 31 jobs per
`financials-invoicing-migration-plan.md`), but it's missing real structure Buildertrend has:

**Buildertrend has, on the same page, as separate sub-tabs:** Invoices | **Payments** |
**Credit memos** | **Deposits** — plus a header KPI strip ("Job running total − Payments =
Remaining balance") and a **"Payment schedule"** button (construction draw-schedule / milestone
billing setup, separate from ad hoc invoices). The invoice detail itself has a **"Client
preview"** tab (exactly what the client will see when they view it in the portal), **"Client
last viewed: Never/[date]"** tracking, **Payment terms** (e.g. "Net 30"), a proper **line-item
table with markup** (Items / Cost type / Unit cost / Quantity / Unit / Builder cost / Markup % /
Unit Price / Client price, expandable rows), and a **"Resend"** action plus edit — not just a
flat Amount field.

**Build this:**
1. Add `Payments`, `Credit memos`, `Deposits` as real sub-views on the Invoices page (Payments
   already exists as data — `Payment` table — just needs its own filterable list view instead of
   only showing inline per-invoice; Credit Memos and Deposits are new entities).
2. Header KPI strip: job running total (sum of invoiced) − payments = remaining balance.
3. **Payment Schedule** — a separate construction-draw / milestone billing setup (e.g. "Draw 1 —
   Deposit — 10%," "Draw 2 — Framing Complete — 20%," ...) that can auto-generate invoices per
   milestone, distinct from one-off manual invoices. This is core to how GC billing actually
   works and is currently entirely absent.
4. Invoice detail: add `paymentTerms` (e.g. Net 30), `clientLastViewedAt` (set when the client
   portal actually opens the invoice — requires the client portal to exist/be wired up), a
   **Client preview** tab that renders the client-facing version, a proper line-item table with
   `unitCost/qty/unit/builderCost/markupPct/unitPrice/clientPrice` per line (not just one flat
   Amount), and **Resend**/Edit actions.
5. Taxes field (Buildertrend shows "Taxes: No Tax" explicitly on every invoice) — at minimum a
   per-invoice tax toggle/amount even if most invoices don't use it.

## Gap 4 — Job Costing Budget: no summary header, no grouping/collapse, and Committed/Actual are always $0

**WCI OS today**: a single flat table (all cost codes as sibling rows, no grouping), columns
Cost Code / Original Budget / Revised Budget / Committed Cost / Actual Cost / Projected Cost /
Original Price..., with **Committed Cost and Actual Cost showing $0 on every single row for
every job** — a direct, mechanical consequence of Gaps 1–2: there are no real POs/Bills to
compute those numbers from.

**Buildertrend has:**
- A **summary header** above the table: "Total revised price $202,808.61 / Revised price
  $202,808.61 − Projected cost $96,411.18 = Projected profit $106,397.43," with a "52% profit
  margin" badge and a "↑ Higher profit" indicator.
- **Grouped, collapsible cost categories** (e.g. "01 Pre Construction" as a parent row containing
  Architectural Plans / Sales Tax / Structural Plans as children, each category collapsible via a
  chevron), with a real **Totals row** at the bottom summing every column.
- Real, non-zero Committed Costs per cost code, computed from that code's linked POs/Bills (e.g.
  "05 Painting" shows $6,380 committed because real POs exist against it).

**Build this:**
1. Add the summary header strip (revised price / projected cost / projected profit / margin %)
   above the existing table — this is pure computation from data that already exists
   (`revisedBudgetCostCents` minus sum of actual+projected costs), no new schema needed.
2. Add parent/child grouping by cost category with collapse/expand and a real Totals row — the
   `CostCode` table already has the category/leaf hierarchy imported (102 rows, 23 category +
   68 leaf, per `deployment-status.md` item 13) so this is a rendering change, not new data.
3. Once Gaps 1–2 are built and real PO/Bill data exists, `committedCosts` and `actualCosts`
   should derive from `sum(PurchaseOrder.amount where status=APPROVED)` and
   `sum(Bill.builderCost where status IN (READY_FOR_PAYMENT, PAID))` respectively, scoped per
   cost code — verify this wiring explicitly once both exist, since right now those columns may
   be hardcoded to $0/empty rather than computed at all.

## Gap 5 — the WIP/Profitability/Cash Flow/Change Order Profit reports are all silently wrong

Not a UI gap by itself, but worth stating explicitly so Claude Code doesn't waste time chasing
report-rendering bugs: WCI OS's Reports module (`/reports`) already has the right report list
(WIP, Budgeted vs Projected, Profitability, Invoicing, Labor Actuals vs Budgeted, Cash Flow,
Change Order Profit, plus PM and Sales reports) and it renders correctly — but every job shows
**0.0% Complete, $0 Earned Revenue** even for jobs with real invoiced amounts, because "percent
complete" and "earned revenue" are computed from actual/committed costs (Gap 4), which are $0
until Gaps 1–2 are fixed. **Don't treat these reports as broken — treat them as correctly
reflecting missing upstream data.** Re-verify all five financial reports once Bills/POs are
real, rather than debugging the report queries themselves.

## Data already sitting exported, ready to import once the schema/UI above exists

Per `deployment-status.md` item 14 and `financials-invoicing-migration-plan.md`, this exact data
gap was already identified and **the real Buildertrend data has already been exported** — this
is not new work, it's an unblocked backlog:

- `~/Documents/wci-migration/financials-invoicing/all-open-jobs-exports-20260831/` on Damien's
  Mac: `PurchaseOrders_all_open_jobs.csv` (1,542 rows), `Bills_all_open_jobs.csv` (5,226 rows),
  `Invoices_all_open_jobs.csv` (678 rows), `InvoicePayments_all_open_jobs.csv` (766 rows) —
  covering all 239 currently-Open Buildertrend jobs (minus one explicitly excluded job).
- A smaller, already-scoped 31-job Invoices/Payments pull also exists at
  `/tmp/Invoices_31jobs_full.csv` (93 rows) / `/tmp/InvoicePayments_31jobs_full.csv` (85 rows)
  from a prior session — dedup against the 39 invoices/29 payments already imported by matching
  Buildertrend's `InvoiceId`.
- **Blockers documented for this import, both still open:** (1) only 31 of 239 jobs have a `Job`
  row in WCI OS at all — the other ~208 need minimal `Job` rows created first (name + status=OPEN
  only, since Buildertrend's Open-jobs list doesn't include address/sqft). (2) the new CSVs
  reference cost codes not yet in the 102-row `CostCode` catalog (e.g. "Tile Labor," "Windows
  Labor") — extend the catalog before inserting BudgetLine/Bill/PO rows that reference them. See
  `buildertrend-export-shapes-and-costcodes.md` for the exact distinct list.
- **CRITICAL CORRECTIONS to the import plan — found by opening the actual CSVs, not previously
  documented anywhere:**
  1. All four CSVs reference jobs by **name string only** — there is no stable Buildertrend job
     id/GUID column in any of them. Names also have messy trailing whitespace baked in
     (e.g. `"10841 Reading Rd - Mcmullin - Ins Fire "` — trailing space is literal). Any import
     script MUST trim whitespace and do fuzzy/normalized name matching against the `Job` table,
     and should build one persistent job-name-to-id lookup table up front rather than re-deriving
     matches per row per CSV.
  2. **The Bills CSV has no PO-linking column at all** — no `PO #` field, nothing that references
     a purchase order id or number. `Bill.linkedPurchaseOrderId` CANNOT be resolved from this CSV
     export directly. If you need real PO-to-Bill linkage on import, you'll have to pull it from
     Buildertrend's grid API JSON instead (see `buildertrend-grid-api-findings.md` — the
     `/api/v1/bills/grid` response may carry a PO reference the CSV export drops) or accept
     unlinked bills for this batch and backfill links later. Don't assume the CSV has this field.
- **Recommended import path** (updated given the two corrections above): once a real `/api/v1/*`
  API key exists, write a script that (a) creates the missing Job rows, (b) extends the CostCode
  catalog, (c) imports PurchaseOrders → the new `PurchaseOrder` model with correct vendor
  matching, (d) imports Bills → the new `Bill` model, pulling `linkedPurchaseOrderId` from the
  grid API JSON rather than the CSV (see correction 2), (e) imports the remaining 54 invoices/56
  payments for the 23 jobs not already covered, all with explicit dedup against already-imported
  rows by Buildertrend's own ids. Do this through the app's validated API, not raw SQL against
  production — the last session hit a safety-classifier block trying to hand-run SQL for exactly
  this reason.

## Still-open gaps carried forward from the Aug 27 audit (not re-verified this pass, still believed open)

These were already documented in `buildertrend-parity-gap-analysis-and-ai-features-spec.md` and
weren't the focus of this pass, but they're real and still worth Claude Code's attention after
Gaps 1–5 above:

- **Bid Board** (`/jobs/[jobId]/bids`): still a bare Title/Due date/Description form, same
  pattern as POs/Bills used to be. Needs: package cards, invited-sub tracking, "Save and Release"
  vs "Save Draft" as distinct actions, per-sub "View & Submit Bid" flow.
- **Estimate builder**: still likely missing the five explicit entry methods (line-by-line, Excel
  import, saved template, Cost Catalog pick, bulk Cost Code add) as toolbar actions, and
  **Estimate Templates has schema but no UI** (no nav entry, no browse/manage page, no
  save-as-template control) per `deployment-status.md` item 10.
- **Daily-log photo migration** was blocked by a React error (#441) on the Files page as of
  2026-08-31 — worth a quick re-check of whether that's been fixed before resuming the 205
  remaining photo uploads for job `job_8056d45cd8944c4e842aa075990ed0c2`.
- **AI Employees Hub / AI Estimating Platform** (Parts B/C of the Aug 27 doc) — not attempted in
  this pass; still aspirational per that doc's Phase 10/11 prompts.
