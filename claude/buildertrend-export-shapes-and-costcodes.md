# Buildertrend export shapes + distinct cost codes (Sept 2026)

Companion reference to `buildertrend-financials-uiux-audit-sept2026.md` and
`deployment-status.md` item 14. Captured by opening the actual CSVs, not inferred from
Buildertrend's UI — several fields the earlier migration plans assumed exist turned out not to.

Source files (Damien's Mac):
`~/Documents/wci-migration/financials-invoicing/all-open-jobs-exports-20260831/`

## Format rules that apply to all four files

- **Dates:** ISO 8601, `YYYY-MM-DDTHH:MM:SS[.fraction]`, **no timezone offset** — treat as
  local/naive, do not assume UTC.
- **Currency:** plain decimal, no `$`, no thousands separator, **negatives allowed** (see Bills).
- **Job reference: NAME STRING ONLY.** There is no Buildertrend job id/GUID column in any of the
  four files. Names carry literal trailing whitespace
  (e.g. `"10841 Reading Rd - Mcmullin - Ins Fire "`). Any import must trim and normalize before
  matching against `Job.name`, and should build **one persistent job-name→id lookup up front**
  rather than re-deriving a match per row per file.

## PurchaseOrders_all_open_jobs.csv — 1,542 rows

```
Job,PO #,Title,PO Status,Work Status,Performed By,Created Date,Cost,Paid Status,Cost Codes,Variance Codes,Est Complete,Files Count,RFI Count
10290 PHILLIPS HIGHWAY - Welton - Commercial Build,0015,Tile ,Internally Approved,Not Complete,G&S tile solutions,2026-08-27T18:31:36.68,1500,Not Paid,Tile Labor,,,0,0
10290 PHILLIPS HIGHWAY - Welton - Commercial Build,0014,Additional Drywall and Framing ,Internally Approved,Complete,G&S tile solutions,2026-08-18T11:19:23.863,1800,Paid,Drywall Labor,,,0,0
10841 Reading Rd - Mcmullin - Ins Fire ,0038,Flooring Repairs,Sub/Vendor Approved,Not Complete,G&S tile solutions,2026-08-13T11:58:54.953,1200,Not Paid,LVP Flooring Labor,,,0,0
```

**`PO Status` carries Buildertrend's real internal names, and there are TWO distinct approved
states** — `Internally Approved` (staff signed off) and `Sub/Vendor Approved` (the vendor
accepted). Both map to our `APPROVED`, but the distinction is real and worth preserving in a
separate column if we want to know which side actually signed off.

`Work Status` here uses `Not Complete` / `Complete` (our enum is `NOT_COMPLETE | WORK_COMPLETE`).

## Bills_all_open_jobs.csv — 5,226 rows

```
Job,Bill #,Title,Pay To,Bill Amount,Paid Status,Amount Paid,Remaining Balance,Invoice Date,Due Date,Date Paid,Paid By,Cost Codes,Created Date,Files Count
150 Stockton - Nexair - Commercial Remodel,0133,08-28-2026_1156 laminate .pdf,Buildertrend Misc.,593.94,Paid,593.94,0,2026-08-28T00:00:00,,2026-08-30T15:06:26,Garry Cofer,Buildertrend Flat Rate,2026-08-30T15:06:12.76,1
2603 Dupont Ave - Bullard - Addition,0020,The Home Depot receipt # 6365-14-3386,Buildertrend Misc.,-38.68,Paid,-38.68,0,2026-08-27T00:00:00,,2026-08-30T15:03:23.1666667,Garry Cofer,Buildertrend Flat Rate,2026-08-30T15:02:45.43,1
11613 Ft Caroline Rd- Logan Sadler- addition ,0059,ft caroline soffit.pdf,Buildertrend Misc.,884.71,Paid,884.71,0,2026-08-25T00:00:00,,2026-08-30T15:01:15,Garry Cofer,Soffit Materials,2026-08-30T15:00:06.773,1
```

- **CONFIRMED: no PO-linking column exists in this file.** No `PO #`, no purchase-order id,
  nothing. `Bill.linkedPurchaseOrderId` **cannot** be resolved from this export. Either pull it
  from Buildertrend's grid API JSON (`POST /api/v1/bills/grid` — see
  `buildertrend-grid-api-findings.md`) or import bills unlinked and backfill later.
- **Negative `Bill Amount` values are real** (row 2 above is `-38.68`) — refunds/credits. Handle
  as credits; do not reject as malformed.
- `Title` is very often literally the receipt filename, which is exactly why the audit's Bills
  intake design (drag-drop + OCR + email forwarding) matters — that's how these originate.

## Invoices_all_open_jobs.csv — 678 rows

```
Job,Invoice #,Title,Client,Invoice Amount,Paid Status,Amount Paid,Balance Due,Due Date,Date Paid,Date Released,Viewed By Owner On,Files Count
1531 Lockend Ct,0001,Retail Roof Replacement,Michelle Kindy,12000,Paid,12000,0,2023-09-20T23:59:00,2023-09-20T10:59:19,,,0
4856 River Basin Dr N Painting,0001,4856 River Basin Dr N Painting,Marilyn Parker,11021.05,Paid,11021.05,0,2023-10-20T23:59:00,,,,0
2720 Arlex Dr,0001,2720 Arlex Dr,Ivan Diaz,11767,Paid,11767,0,2023-11-03T23:59:00,2023-12-01T21:25:27,,,0
```

- Dates go back to **2023** — this is full invoice history for every currently-Open job, not just
  2026 activity.
- **`Invoice #` resets per job** (every job's first invoice is `0001`), so **dedup must key on
  Job + Invoice #**, never Invoice # alone.
- `Viewed By Owner On` is Buildertrend's equivalent of the audit's `clientLastViewedAt`.

## InvoicePayments_all_open_jobs.csv — 766 rows

```
Job,Invoice #,Client,Recorded By,Date Paid,Payment Amount,Payment Method,Status Code
2603 Dupont Ave - Bullard - Addition,0003,Clayton Bullard,QuickBooks,2026-08-21T00:00:00,10451.87,QuickBooks,0
1418 Perth Rd.-Maurice Elliot-Pavillion,0002,Maurice Elliot,QuickBooks,2026-08-21T00:00:00,11173.38,QuickBooks,0
11613 Ft Caroline Rd- Logan Sadler- addition ,0004,Logan Sadler,QuickBooks,2026-08-21T00:00:00,22285.23,QuickBooks,0
```

- `Payment Method` is literally `QuickBooks` on many rows — those payments were **already synced
  from QuickBooks into Buildertrend**. If we also pull payments directly from Intuit, these will
  double-count unless deduped.

## Distinct cost codes referenced across PurchaseOrders + Bills — 92 values

Produced by splitting the `Cost Codes` column on comma/semicolon and deduping. Diff against
`SELECT name FROM "CostCode"` (currently 102 rows); anything missing must be added **before**
inserting any PO/Bill/BudgetLine row that references it.

```
Accesories, Architectural Plans, Baseboard, Bathroom (General), Bathroom Labor, Bathroom
Materials, Batt Insulation, Bonus, Buildertrend Flat Rate, Cabinets, Carpet Labor, Carpet
Material, Casing, Cleaning Labor, Cleaning Material, Commission, Concrete/ Foundation Labor,
Concrete/ Foundation Materials:, Concrete/ Foundations, Concrete/ Foundations Materials,
Counters, Crown, Customer Payment, Demo Labor, Design Services, Drywall, Drywall Labor, Drywall
Materials, Dumpster Labor, Electrical L&M, Electrical Labor, Electrical Materials, Ext Doors, Ext
Doors Labor, Ext Doors Material, Ext Painting Labor, Ext Painting Materials, Exterior Painting,
Exterior Repairs Material, Fencing Labor, Finish Carpentry Labor, Finish Carpentry Materials,
Framing L&M, Framing Labor, Framing Materials, Gutters Labor, Hardwood, Insulation, Insulation
Labor, Insulation Materials, Int Doors Labor, Int Doors Materials, Int Paint Labor, Int Paint
Materials, Interior Doors, Interior Painting, Kitchen (General), Kitchen Labor, Kitchen
Materials, LVP, LVP Flooring Labor, LVP Flooring Materials, Laminate, Mechanical L&M, Mechanical
Labor, Mechanical Materials, Mirror, Plumbing L&M, Plumbing Labor, Plumbing Materials, Roofing
Labor, Roofing Materials, Room Remodel, Sales Tax, Siding Labor, Siding Materials, Siding/
Soffit, Sills, Soffit Labor, Soffit Materials, Structural Plans, Structural Repairs, Tile Labor,
Tile Materials, Tile and Grout, Toilet, Vanity, Windows, Windows Labor, Windows Materials, hinges
and handles, payment
```

**Two of these are not real cost codes:** `Customer Payment` and `payment` (lowercase) are
Buildertrend's own payment-tracking entries riding along in the same column. Don't create
`CostCode` rows for them — skip, or map to a generic misc/payment bucket.

Note also the source data's own inconsistencies, which will need normalizing rather than
importing verbatim: `Accesories` (misspelled), `Concrete/ Foundation Materials:` (trailing
colon), and the near-duplicate `Concrete/ Foundation Materials:` / `Concrete/ Foundations
Materials` pair.

## QuickBooks status (checked 2026-09-07)

Connected and responding. Company: **World Construction Co Inc**, industry code **238160**. The
"expired OAuth token" line in `deployment-status.md` item 13 is **stale — ignore it**.

This confirms basic read connectivity only. It does **not** confirm the app's own OAuth client
holds AP-write/bill-sync scopes. Test an actual write, or check the scopes the grant was issued
with, before building the Bill↔QuickBooks sync on the assumption reauth isn't needed.
