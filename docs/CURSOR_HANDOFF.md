# WCI OS handoff for Cursor

Repo: damienstarkey978/WCI-System, branch main, live site app.worldconstructionjax.com.
Last commit from the previous session: 0be3e23. Everything is pushed; the working tree was clean.

Read CLAUDE.md and AGENTS.md first. This is Next.js 16, which differs from older training data, so read
node_modules/next/dist/docs/ before writing Next specific code. CLAUDE.md section 7 records every
architecture decision, including the ones made in this parity pass (Proposal Templates, etc).

## The goal

Make WCI OS match Buildertrend (BT) page for page: same page structure, toolbar, tabs, table columns, buttons,
forms and workflows. Layout and behavior only. Keep WCI OS's own colors, logo and theme (the --bt-* CSS tokens in
src/app/globals.css are WCI's, despite the name). Never copy BT colors, fonts or branding.

After parity is finished, two more projects, in this order:
1. Pull the cost instructions from Handoff (handoff.ai) for every cost code and put them into WCI OS proposals.
   Reference notes: claude/handoff-ai-analysis-and-jarvis-deep-integration-spec.md.
2. Turn Jarvis back on to build proposals the way Handoff does. Jarvis is hidden, not deleted: set
   NEXT_PUBLIC_JARVIS_UI_ENABLED=true to show it. Do NOT delete any Jarvis code, routes, API, workers, models,
   Netlify functions or the proposal draft pipeline.

## Hard rules (from the owner, Damien)

1. NEVER invite, email or message anyone. Never press Send, Invite, Email or Message buttons, in WCI OS or BT,
   not even against a local database.
2. No sub payment features.
3. In Buildertrend, LOOK ONLY. Never create, edit, delete or send anything there.
4. Money is integer cents, percentages are basis points. Contract type logic stays in src/lib/contract-type/.
5. Commit straight to main. Before every push run all of: npx tsc --noEmit, npx eslint . (exactly 12 known
   warnings, all in admin/diagnostics/actions.ts), npx vitest run (478 tests at handoff), npx next build, and
   npm run check.
6. Do not make up data. If an importer or API path does not exist, say what is missing.
7. Do not ask Damien to approve each step. Only stop for things needing his approval: sending something external,
   spending money, deleting data.
8. When writing to Damien: casual, short, no filler, no em dashes, en dashes or hyphens in prose.

## DANGER: production migrations

Pushing to main deploys to production (Netlify). `npm run build` runs `prisma migrate deploy` first, and a
migration that lands on main applies to the production database on deploy. So:
* Locally, build with `npx next build`, never `npm run build`, unless DATABASE_URL points at your local database.
* Only commit additive migrations (new tables, new nullable or defaulted columns, new enum values).
* After editing prisma/schema.prisma: write the migration SQL by hand in prisma/migrations/<timestamp>_<name>/,
  run `npx prisma migrate deploy`, then `npx prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --exit-code` and require "No difference detected", then `npx prisma generate`.
Migrations added in this parity pass that apply on next deploy: proposal templates, schedule item percent complete,
file folders, file category PLAN, file deletedAt (trash), schedule phases plus isOnline/isDraft, lead attachments,
message threads, job notes plus fundedByLoan plus custom field definitions, daily log title plus likes.

## Local setup

```
npm install                      # postinstall runs prisma generate
# Postgres 16 running locally. Example (Linux): service postgresql start
cp .env.example .env             # then set:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/wcios?schema=public
#   DEV_ORGANIZATION_SLUG=wci
#   DEV_USER_EMAIL=you@example.com
npx prisma migrate deploy
npm run db:seed                  # seeds the organization and cost codes (idempotent)
npx next typegen
npm run dev                      # http://localhost:3000
```

Auth: without Clerk env vars, src/lib/auth.ts uses a dev stub user (ADMIN of DEV_ORGANIZATION_SLUG), and
it refuses to activate in production mode. So `next dev` is signed in as an admin automatically, and `next start`
is NOT usable for auth testing. Staff pages need the stub; do not set Clerk keys locally.

To get realistic data locally, create scratch rows with a small tsx script that imports src/lib/db (put it in
the repo root, name it zz-something.mts, run it with `npx tsx`, and DELETE both the rows and the script after).
Look at how services create things (src/lib/*/service.ts) rather than writing raw inserts where a service exists.

Production data lives only in production. Do not point a local run at the production database.

## Verification recipe for every change

1. `rm -rf .next && npx next typegen` if tsc shows odd errors from .next/dev/types (stale generated types).
2. `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npx next build`.
3. Run the page against `next dev` with scratch data and look at it in the browser (compare to BT side by side).
4. Delete scratch data. Commit with a clear message. `git push origin main`.

## Pitfalls already hit (do not repeat)

* Server Components cannot pass functions (like DataGrid column render callbacks) to Client Components. Pattern:
  a server page.tsx shapes plain data rows, and a small "use client" file (e.g. estimates-grid.tsx) builds the
  columns. Follow any *-grid.tsx file.
* A Next page.tsx can only export the default component and route config. Put shared helpers in src/lib/.
* Forms cannot nest. A client component with its own <form> inside another form silently breaks. Use a button
  with formAction, or move it outside the form (see settings/job-status-control.tsx and job-details-form.tsx).
* Date only values (schedule dates, workday exceptions) are stored at UTC midnight. Use formatDateUtc from
  src/lib/format.ts, not formatDate, or they show a day early west of UTC.
* File reads must filter deletedAt: null (the trash feature). Every place that lists files already does; keep it so.
* Schedule visibility to clients, subs and weekly digests goes through isSchedulePublished() in
  src/lib/scheduling/publish.ts (online AND not draft).
* Prisma 7 with the PrismaPg adapter; Job requires contractType; Client requires email; ScheduleItem has no
  stored dates (computed, src/lib/scheduling/cpm.ts).
* Running `pkill -f "next dev"` inside a `&&` chain can kill the shell. Run it separately.

## Shared building blocks to reuse

* src/components/shell/DataGrid.tsx: sortable headers (really sort), selection, paging, totals row, Standard view
  column chooser (pass viewKey, remembered per browser in localStorage). Give sortValue to columns whose key is
  not a row field.
* src/components/shell/PageHeader.tsx (job name line, bold title, right action slot), CreateModal.tsx (button that
  opens a modal form), EmptyState.tsx.
* Underline tab pattern: see schedule/page.tsx, files/page.tsx, tasks/page.tsx.
* Job pages live in src/app/jobs/[jobId]/*, sales in src/app/leads/*, reports in src/app/reports/page.tsx,
  nav definitions in src/lib/buildertrend-nav.ts.

## What was built from a REAL Buildertrend screenshot (trust these)

* Job Info (Jobs, Job Info opens /jobs/{id}/settings): both columns, header, status control, contract price from
  the accepted proposal's selected option, notes, custom fields, property card, QuickBooks card.
  Not matched: Work days field, "Update actual dates based on Schedule", Type "Manage" link, zip required, state
  validation (BT showed "FI" and Zip marked required).
* Daily Logs (list and opened log).
* Schedule (Schedule, Baseline, Workday Exceptions tabs; Calendar/List/Gantt; Critical path; Phases; Draft mode;
  Schedule Online). Missing: Day/zoom control, Filter, More Actions menu, history icon, settings gear.
* Files (Documents folder table, + Folder, View trash, Attached Documents) and Plans and Specs (Plans/Specs tabs,
  Add a plan dropzone). Missing: nested folders, Global Documents folder, grid/list toggle, folder permissions UI.
* Lead detail (contact card, tab counts). Missing: attachments grid toggle and Download all, Create new doc,
  salespeople field, rich text notes editor, "+ Job" and Save dropdown menus.

## Built WITHOUT a BT reference (guessed layouts: verify each against BT in the browser)

Schedule item detail and New Schedule Item form, Tasks (My tasks/All tasks/Punch list), Change Orders,
Selections (cards, list, allowances), RFIs, Warranty, Submittals, Surveys, Time Clock (Shifts, Needs approval,
Map), Client Updates, Estimates list and the estimate worksheet, Purchase Orders, Bills, Invoices, Budget, Bids,
Cost Inbox, Payments, Jobs list, Lead Opportunities list, Lead Activities, Lead Proposals, Proposal Templates,
Messages (threads), Reports landing, Company Settings tiles, the top nav, Quick Add and Help menus, the left job
panel. For each: open BT's page and WCI's page side by side, list differences (columns, tabs, buttons, filters,
create forms, opened item), then fix.

## Open work, in priority order

1. The browser audit above, page by page. This is the main job.
2. Messaging: BT has folders and recipient pickers; WCI has subject threads only. Comments page unchanged.
3. Schedule: Day/zoom, Filter panel, item detail drawer and New Schedule Item form to match BT.
4. Daily Logs: reactions beyond a heart, annotation, the gear and info icons.
5. Selections hierarchy view, Activity Templates page (Sales), Lead list column chooser fields, Import Leads
   mapping against a real BT export.
6. Data parity (needs production access, look only in BT):
   * Run the subs import in production: /vendors, "Import subs/vendors from CSV", the 196 BT subs.
   * Leads: BT has 61, import via /leads Import Leads (idempotent).
   * Proposals: BT has 135; there is NO proposal importer yet.
   * Job 3640 Newcomb Rd Bldg1 is missing schedule, tasks, change orders, selections, estimate, files, client
     updates, receipts, comments, 16 bills and 2 POs. Existing migration endpoints only cover bills, POs,
     invoices and daily logs (src/app/api/v1/migration/*). Do not invent data.
7. Then the Handoff cost instructions into proposals, then Jarvis back on for proposals (see top).

## Environment notes

Hosting is Netlify (60 second function cap; background functions under netlify/functions). Production env vars
(Clerk, Supabase storage, Anthropic, CRON_SECRET, etc.) are set in Netlify, not in this repo. Never commit secrets.
Supabase Storage is needed for real uploads; locally, uploads fail with a clear "not configured" message, so seed
file rows with https URLs when testing.
