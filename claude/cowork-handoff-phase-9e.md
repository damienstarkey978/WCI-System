# Cowork handoff — Phase 9d/9e financials

Everything in this document needs a machine with normal network access. The repo
session cannot do any of it: it has no route to `app.worldconstructionjax.com`
(403 CONNECT from the egress proxy, an org network policy) and none to Supabase
over raw TCP (ETIMEDOUT). Both were tested directly rather than assumed.

The code is done, verified against a local Postgres, and on `main`. What is left
is deployment, verification against real data, and the CSV import.

Ordered by dependency — task 1 blocks 2, and 2 blocks 3.

---

## 1. Apply the pending migrations to the production database

**Read this whole section before running anything.** The obvious command is
wrong here and will fail loudly.

Every migration in this database's history was applied by hand through the
Supabase SQL editor, so the `_prisma_migrations` bookkeeping table **does not
exist**. A bare `npx prisma migrate deploy` therefore believes nothing has ever
been applied, tries to re-run every migration from the beginning, and fails on
the first `CREATE TABLE "Organization"`. The database has to be baselined first.

### 1a. Check whether one older migration is also pending

In the Supabase SQL editor:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Estimate' AND column_name = 'leadId';
```

- **A row comes back** → `20260902134055_lead_proposal_no_job_until_accepted` is
  already applied. Baseline through it (case A below).
- **No rows** → it is pending too. Baseline through
  `20260831000000_phase_21_migration_file_links` instead (case B below).

### 1b. Baseline, then deploy

On a machine with the repo checked out and the real `DATABASE_URL` in `.env`
(the Supabase pooler URL). `migrate resolve --applied` only writes bookkeeping
rows — it runs none of the SQL — so it is safe to run against a live database.

```bash
cd <repo>
git pull origin main
npm install

# Creates _prisma_migrations and records everything already applied.
for m in \
  20260826154504_phase_0_foundation \
  20260826160127_phase_1_financial_core \
  20260826162230_ai_estimate_drafting \
  20260826163052_invoicing_draw_schedules_payments \
  20260826164325_time_clock \
  20260826181807_phase_2_project_management \
  20260826192204_phase_3_client_portal \
  20260826195736_phase_4_vendor_portal_bidding \
  20260826203209_phase_5_crm_sales \
  20260826205839_phase_6_warranty_submittals_surveys_specs \
  20260826234039_phase_8_ai_layer_client_update_summary \
  20260828120000_phase_9b_lead_activities \
  20260828130000_phase_9c_proposal_builder_material_catalog \
  20260828140000_phase_10_jarvis_conversations \
  20260828150000_phase_10b_jarvis_pending_actions \
  20260828160000_phase_10h_staff_profile_fields \
  20260828170000_phase_10i_job_access_grant_backfill \
  20260828180000_phase_11_estimate_templates \
  20260829140000_phase_12_proposal_photos_and_confidence \
  20260829180000_phase_13_jarvis_launcher_context \
  20260829200000_phase_14_lead_opportunity_fields \
  20260829220000_phase_15_lead_title_and_contact_link \
  20260829223000_phase_16_proposal_multi_option_support \
  20260829230000_phase_17_quickbooks_sync \
  20260830020000_phase_18_vendor_qbo_sync \
  20260830030000_phase_19_job_qbo_subcustomer_sync \
  20260830040000_phase_20_bill_qbo_sync \
  20260831000000_phase_21_migration_file_links \
; do npx prisma migrate resolve --applied "$m"; done

# CASE A ONLY — skip this line if step 1a returned no rows.
npx prisma migrate resolve --applied 20260902134055_lead_proposal_no_job_until_accepted

# Now the real work. This applies only what is genuinely pending.
npx prisma migrate status
npx prisma migrate deploy
```

`migrate status` names exactly what is pending, and it is authoritative over
anything written here. As of this writing that is the `phase_9d_*`, `phase_9e_*`
and `phase_9f_*` migrations — everything dated 2026-09-10 — plus
`lead_proposal_no_job_until_accepted` in case B. Work continued after this doc
was written, so treat a longer list as normal and a *shorter* one as worth
asking about.

**If it wants to apply anything older than `20260902134055`, stop and say so —
do not let it run.** That means the baseline didn't take, and applying those
against a live database would corrupt real data.

### 1c. Confirm

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'Invoice' AND column_name IN ('taxCents','paymentTerms','clientLastViewedAt');
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('CreditMemo','Deposit','LienWaiver','BillApproval','PurchaseOrderEvent','POAgreementTemplate');
SELECT column_name FROM information_schema.columns
WHERE table_name = 'InvoiceLineItem' AND column_name = 'sourceBillId';
SELECT unnest(enum_range(NULL::"BidPackageStatus"));
```

First query: 3 rows. Second: 6 rows. Third: 1 row. Fourth includes `DRAFT`.

Then redeploy the app on Netlify so the running build matches the schema.

---

## 2. Verify the round trip on staging, with screenshots

Once the migrations are live, on any real job:

1. **Purchase order.** Create one, send it for approval, approve it as the
   vendor. Confirm the agreement text freezes at approval (edit the scope of
   work afterward — the snapshot on the approved PO should not change). Confirm
   the job's Job Costing page moves the PO's amount into **Committed cost**.
2. **Bill against that PO.** Create it, link it to the PO, assign yourself as an
   approver. Confirm **Ready for payment is refused** until you sign off — that
   refusal is the point of the test, so screenshot the error. Then sign and move
   it to Ready for payment. Confirm Job Costing moves the amount into **Actual
   cost**.
3. **Payment.** Mark the bill paid. Confirm the PO detail page's progress shows
   billed and paid against the committed amount.
4. **Bill it to the client.** On that bill, use **Bill to client** — 20% markup, a
   new draft invoice. Confirm the client's invoice keeps the bill's own line
   breakdown rather than one collapsed figure, and that trying it a second time is
   refused: the same vendor cost must not reach the client twice.
5. **Bid board.** Create a package with "Save draft", confirm subs *cannot* be
   invited to it, add a scope line, release it, then confirm they can. A package
   released with no scope should be refused.
6. **Invoice side.** Raise an invoice with one taxable and one non-taxable line,
   send it, record a partial payment. Confirm the invoice list shows the right
   balance and that Job Costing's **Amount invoiced excludes the sales tax** —
   tax is collected for the state, not earned against the contract, and this is
   the specific thing that used to make the reports disagree with the screen.

Screenshots worth having: the PO after vendor approval, the refused
"Ready for payment", the refused second "Add to invoice", the Job Costing page
with non-zero Committed and Actual, and the Invoices tab's summary strip.

**Also worth a quick look while you are there: the Files page.** The React error
#441 that blocked the photo migration on 2026-08-31 is fixed — the page was
signing every file's storage URL in one batch, so a single unreadable row took
the whole page down and hid every good file with it. It now renders unreadable
rows as "File unavailable" cards (with a working Delete, since those are usually
orphans left by failed uploads) and shows everything else normally. If the Files
page loads, the 205 remaining Daily-Logs photos for
`job_8056d45cd8944c4e842aa075990ed0c2` are unblocked.

If any step behaves differently from the above, that is a real bug — send the
screenshot and the exact steps rather than working around it.

---

## 3. Import the 8,212 rows of Buildertrend financial data

The four CSVs on Damien's Mac at
`~/Documents/wci-migration/financials-invoicing/all-open-jobs-exports-20260831/`
(1,542 POs, 5,226 bills, 678 invoices, 766 payments).

This has been blocked for a while on things that are now resolved or resolvable:

- **Use the `/api/v1` API, not raw SQL and not UI automation.** Both of those
  were blocked by the safety classifier in earlier attempts and there is no
  reason to fight that again — the API is the app's own validated write path.
  The cuid validation that previously rejected Buildertrend's ID format has been
  fixed. Damien has an API key already provisioned — ask him for it rather than
  minting a new one.
- **Two data-shape gotchas**, both documented in
  `claude/buildertrend-export-shapes-and-costcodes.md`: the bills CSV has **no
  column linking a bill to its PO**, and jobs are referenced **by name string
  only, with literal trailing whitespace** — trim before matching. Negative bill
  amounts are credits, and two junk cost codes (`Customer Payment`, `payment`)
  should be dropped rather than created.
- **Two prerequisites that still stand.** Only 31 of the 239 jobs exist in WCI
  OS, and the CSVs reference cost codes not in the 102-row catalog (e.g. "Tile
  Labor", "Windows Labor"). The full 92-code list is in that same doc. Both need
  creating first, or the import will silently skip rows.

Import order matters: cost codes → jobs → POs → bills → invoices → payments.
Dedupe on Buildertrend's own ID so a re-run is safe.

---

## 4. Two decisions only Damien can make

Neither blocks anything above.

- **QuickBooks AP write scopes.** The bills pipeline can push to QuickBooks, but
  nobody has confirmed the current connection actually has AP *write* scope
  rather than read-only. Worth checking in the Intuit developer console before
  someone finds out by having a sync fail.
- **Inbound email for bills.** The Bills screen advertises a forwarding address
  (`bills-<org-slug>@inbox.worldconstructionjax.com`) and the schema records
  where an emailed bill came from, but **nothing receives that mail yet** — the
  webhook handler is deliberately unwritten because it depends on the provider.
  Needs a choice (SendGrid Inbound Parse, Postmark, Mailgun Routes) and an MX
  record on `inbox.worldconstructionjax.com`. Until then, upload works and email
  does not; the address on screen is aspirational.
