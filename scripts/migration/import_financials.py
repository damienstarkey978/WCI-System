#!/usr/bin/env python3
"""
Buildertrend -> WCI OS financial history importer.

Reads the four export files Buildertrend can actually produce (PurchaseOrders.xls,
Bills.xls, Invoices.xls, InvoicePayments.xls — see buildertrend-export-options-audit.md
for what each contains and why there's no fifth "DailyLogs.xls") and pushes them into
WCI OS via the bulk migration API (POST /api/v1/migration/{purchase-orders,bills,invoices}),
NOT the normal create endpoints — those force every new record to start at a live
starting status (DRAFT/IN_REVIEW) on a job that still accepts commitments, which is
wrong for history that's already fully settled. See src/lib/migration/service.ts.

Requires: pip install xlrd requests   (xlrd 2.x reads legacy .xls/BIFF8 just fine —
Buildertrend's exports are NOT real .xlsx despite what a renamed extension might
suggest; `file` reports them as "Composite Document File V2").

Usage (single job):
  python3 import_financials.py \\
    --api-base http://localhost:3000/api/v1 \\
    --api-key wci_xxx \\
    --uploaded-by-user-id user_xxx \\
    --job-query "7103 Holiday" \\
    --purchase-orders PurchaseOrders.xls \\
    --bills Bills.xls \\
    --invoices Invoices.xls \\
    --invoice-payments InvoicePayments.xls \\
    [--dry-run]

Usage (all open jobs from Buildertrend CSV exports with a Job column):
  python3 import_financials.py \\
    --api-base https://app.worldconstructionjax.com/api/v1 \\
    --api-key wci_xxx \\
    --uploaded-by-user-id user_xxx \\
    --all-jobs \\
    --purchase-orders PurchaseOrders_all_open_jobs.csv \\
    --bills Bills_all_open_jobs.csv \\
    --invoices Invoices_all_open_jobs.csv \\
    --invoice-payments InvoicePayments_all_open_jobs.csv \\
    [--dry-run]

Pass --job-id directly instead of --job-query once you know it, to skip the fuzzy
match entirely. The script always prints which job it resolved to before writing
anything — read that line before trusting a real (non-dry-run) run. Re-runs are
safe: the migration API returns already_exists for natural-key matches.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
import xlrd

EXCEL_EPOCH = datetime(1899, 12, 30)


def xl_to_iso(value):
    """Buildertrend's exports store every date as an Excel serial float. None/blank
    cells come through as '' from xlrd, not 0 — never treat '' as day zero.
    UI CSVs also use placeholders like '-' / 'N/A' for unpaid/missing dates."""
    if value in ("", None):
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text or text in {"-", "--", "—", "N/A", "n/a", "NA", "null"}:
            return None
        # Normalize "YYYY-MM-DD HH:MM:SS" UI CSV datetimes to ISO-8601.
        if len(text) >= 19 and text[10] == " " and text[4] == "-" and text[7] == "-":
            return text[:10] + "T" + text[11:19] + "Z"
        if len(text) == 10 and text[4] == "-" and text[7] == "-":
            return text + "T00:00:00Z"
        return text
    return (EXCEL_EPOCH + timedelta(days=value)).isoformat() + "Z"


def read_rows(path):
    """Buildertrend .xls exports: row 0 title, row 1 blank, row 2 header, trailing
    totals row with a blank first column. CSV exports from the all-open-jobs path
    are plain header-on-row-0 files (see claude/buildertrend-export-shapes-and-
    costcodes.md) — detect by extension and parse accordingly."""
    path = Path(path)
    if path.suffix.lower() == ".csv":
        import csv

        with path.open(newline="", encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            rows = []
            for row in reader:
                # Skip blank / totals-ish rows.
                first = next(iter(row.values()), "") if row else ""
                if not str(first or "").strip():
                    continue
                rows.append({k: (v if v is not None else "") for k, v in row.items()})
            return rows

    wb = xlrd.open_workbook(str(path))
    sheet = wb.sheet_by_index(0)
    headers = [sheet.cell_value(2, c) for c in range(sheet.ncols)]
    rows = []
    for r in range(3, sheet.nrows):
        values = [sheet.cell_value(r, c) for c in range(sheet.ncols)]
        row = dict(zip(headers, values))
        if not str(row.get(headers[0], "")).strip():
            continue  # the trailing totals row
        rows.append(row)
    return rows


def cell(row, *keys):
    """Return the first non-empty value among alternate Buildertrend column names
    (.xls vs all-open-jobs CSV use slightly different headers)."""
    for key in keys:
        if key in row and row[key] not in ("", None):
            return row[key]
    for key in keys:
        if key in row:
            return row[key]
    return ""


def normalize_job_name(name):
    """BT job-name cells often carry trailing whitespace; match trimmed+casefold."""
    return " ".join(str(name or "").split()).casefold()


def derive_job_prefix(job):
    """PO/bill/invoice numbers are `{prefix}-{BT id}`. Prefer Job.prefix; when null,
    derive the leading street/lot number from Job.name (BT convention:
    '932 Candlebark…'). Never fall back to job.id[:8] first — cuid truncations
    collide across jobs created in the same batch (CMVS* duplicates) and are not
    stable human identifiers. id[:8] remains a last resort only when the name
    has no leading digits."""
    existing = (job.get("prefix") or "").strip()
    if existing:
        return existing, "job.prefix"
    name = (job.get("name") or "").strip()
    match = re.match(r"^(\d+)\b", name)
    if match:
        return match.group(1), "job.name leading number"
    return job["id"][:8].upper(), "job.id[:8] last-resort"


class ImportWarning:
    def __init__(self, source, row_label, message):
        self.source = source
        self.row_label = row_label
        self.message = message

    def __str__(self):
        return f"[{self.source}] {self.row_label}: {self.message}"


WARNINGS = []


def warn(source, row_label, message):
    WARNINGS.append(ImportWarning(source, row_label, message))


# ---------------------------------------------------------------------------
# Status mapping — only strings actually confirmed in a real export map without a
# warning. Anything else still imports (never silently drops a record) but is
# flagged loudly, because guessing an enum value wrong is worse than a visible
# fallback: an unmapped PO status defaults to PENDING_APPROVAL (never assumed
# already-approved), an unmapped Bill/Invoice status defaults to PAID only when the
# row's own Amount Paid == the total (i.e. the export already told us it's settled),
# otherwise IN_REVIEW/DRAFT.
# ---------------------------------------------------------------------------

def map_po_status(raw, row_label):
    raw = (raw or "").strip()
    if raw == "Draft":
        return "DRAFT", None
    if raw == "Sent":
        return "PENDING_APPROVAL", None
    # Buildertrend's real export uses both "Internally Approved" (staff) and
    # "Sub/Vendor Approved" / "Client Approved" — all three are APPROVED in WCI.
    if (
        raw.startswith("Sub/Vendor Approved")
        or raw.startswith("Client Approved")
        or raw.startswith("Internally Approved")
        or raw == "Approved"
    ):
        # "Sub/Vendor Approved - 8-13-26" — the date after the dash, if present.
        parts = raw.split(" - ", 1)
        approved_at = None
        if len(parts) == 2:
            for fmt in ("%m-%d-%y", "%m-%d-%Y"):
                try:
                    approved_at = datetime.strptime(parts[1].strip(), fmt).isoformat() + "Z"
                    break
                except ValueError:
                    continue
        return "APPROVED", approved_at
    if "Declined" in raw:
        return "DECLINED", None
    if "Cancel" in raw:
        return "CANCELLED", None
    if "Complete" in raw:
        return "COMPLETED", None
    warn("purchase-orders", row_label, f'Unrecognized PO Status "{raw}" — defaulted to PENDING_APPROVAL, verify manually.')
    return "PENDING_APPROVAL", None


def map_bill_status(raw, row_label):
    raw = (raw or "").strip()
    known = {
        "Paid": "PAID",
        "Approved": "APPROVED",
        "Ready for Payment": "READY_FOR_PAYMENT",
        "Ready For Payment": "READY_FOR_PAYMENT",  # UI CSV capitalization
        "Ready For Payment - Requested": "READY_FOR_PAYMENT",
        "Pending Approval": "IN_REVIEW",
        "Open": "IN_REVIEW",
        "Open - Requested": "IN_REVIEW",
        "Void": "VOID",
        "Voided": "VOID",
    }
    if raw in known:
        return known[raw]
    warn("bills", row_label, f'Unrecognized Bill status "{raw}" — defaulted to IN_REVIEW, verify manually.')
    return "IN_REVIEW"


def map_invoice_status(raw, amount_paid, total, row_label):
    raw = (raw or "").strip()
    known = {
        "Paid": "PAID",
        "Sent": "SENT",
        "Draft": "DRAFT",
        "Void": "VOID",
        "Voided": "VOID",
    }
    if raw in known:
        return known[raw]
    if raw in ("Partial", "Partially Paid"):
        return "PARTIALLY_PAID"
    # Fall back on what the export itself already tells us about the dollars,
    # rather than a blind guess at an unseen status string.
    if amount_paid and total and abs(amount_paid - total) < 0.01:
        result = "PAID"
    elif amount_paid:
        result = "PARTIALLY_PAID"
    else:
        result = "SENT"
    warn("invoices", row_label, f'Unrecognized Invoice status "{raw}" — inferred {result} from Amount Paid vs Total Price, verify manually.')
    return result


def map_payment_method(raw, row_label):
    raw = (raw or "").strip()
    if raw == "QuickBooks":
        return "QBO_SYNC"
    if raw in ("Stripe", "Credit Card", "Online Payment"):
        return "STRIPE_CARD"
    known_manual = {"Check", "Cash", "ACH", "Wire", "Money Order"}
    if raw in known_manual:
        return "MANUAL"
    warn("invoice-payments", row_label, f'Unrecognized Payment method "{raw}" — defaulted to MANUAL, verify manually.')
    return "MANUAL"


FLAT_RATE_CODE = "Buildertrend Flat Rate"


def resolve_cost_codes(raw, cost_code_ids, row_label, source):
    """Buildertrend joins multiple cost codes on one row with \\r\\n or commas.
    The generic 'Buildertrend Flat Rate' bucket rides along on almost every
    receipt-style bill with no dollar amount of its own — it's Buildertrend's own
    default tag, not a real second cost split, so it's dropped whenever a real
    code is also present."""
    text = str(raw or "").replace("\r\n", "\n").replace(";", "\n").replace(",", "\n")
    names = [n.strip() for n in text.split("\n") if n.strip()]
    real = [n for n in names if n != FLAT_RATE_CODE] or names
    if len(real) > 1:
        warn(source, row_label, f"Multiple cost codes ({', '.join(real)}) with no per-code dollar split in this export — full amount booked to \"{real[0]}\".")
    resolved = []
    for name in real[:1]:  # only ever the first — see warning above
        cc_id = cost_code_ids.get(name.strip().lower())
        if not cc_id:
            warn(source, row_label, f'Cost code "{name}" not found in WCI OS — row skipped.')
            return None
        resolved.append(cc_id)
    return resolved[0] if resolved else None


def clean_vendor_name(raw):
    raw = (raw or "").strip()
    return "Unassigned" if raw in ("", "-- Unassigned --") else raw


# ---------------------------------------------------------------------------
# API client
# ---------------------------------------------------------------------------

class WciClient:
    def __init__(self, base_url, api_key):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})

    def get(self, path, params=None):
        resp = self.session.get(f"{self.base_url}{path}", params=params)
        resp.raise_for_status()
        return resp.json()["data"]

    def post(self, path, body):
        resp = self.session.post(f"{self.base_url}{path}", data=json.dumps(body))
        if resp.status_code >= 400:
            print(f"POST {path} -> {resp.status_code}: {resp.text}", file=sys.stderr)
            resp.raise_for_status()
        return resp.json()["data"]

    def all_jobs(self):
        jobs, cursor = [], None
        while True:
            params = {"limit": 200, "includeTemplates": "false"}
            if cursor:
                params["cursor"] = cursor
            page = self.session.get(f"{self.base_url}/jobs", params=params)
            page.raise_for_status()
            body = page.json()
            jobs.extend(body["data"])
            cursor = body.get("pagination", {}).get("nextCursor")
            if not cursor:
                return jobs

    def cost_code_map(self):
        codes = self.get("/cost-codes", params={"includeInactive": "true"})
        return {c["name"].strip().lower(): c["id"] for c in codes}


def resolve_job(client, job_id, job_query):
    if job_id:
        job = client.get(f"/jobs/{job_id}")
        return job
    jobs = client.all_jobs()
    query = job_query.strip().lower()
    matches = [j for j in jobs if query in j["name"].lower() or (j.get("addressLine1") or "").lower().find(query) >= 0]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        print(f'No job matched "{job_query}". Pass --job-id explicitly. Jobs in this org:', file=sys.stderr)
        for j in jobs:
            print(f'  {j["id"]}  {j["name"]}', file=sys.stderr)
        sys.exit(1)
    print(f'"{job_query}" matched {len(matches)} jobs — pass --job-id explicitly:', file=sys.stderr)
    for j in matches:
        print(f'  {j["id"]}  {j["name"]}', file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Row -> payload builders
# ---------------------------------------------------------------------------

def build_purchase_orders(rows, prefix, cost_code_ids):
    payloads, po_number_map = [], {}
    for row in rows:
        po_raw = cell(row, "PO #", "PO#")
        label = f"PO #{po_raw}"
        cc_id = resolve_cost_codes(cell(row, "Cost Code", "Cost Codes"), cost_code_ids, label, "purchase-orders")
        if not cc_id:
            continue
        status, approved_at = map_po_status(cell(row, "PO Status"), label)
        created_at = xl_to_iso(cell(row, "Created Date"))
        if created_at is None:
            warn("purchase-orders", label, "Missing Created Date — row skipped.")
            continue
        po_number = f"{prefix}-{str(po_raw).strip()}"
        cost = cell(row, "Cost", "Cost Amount") or 0
        payloads.append({
            "poNumber": po_number,
            "vendorName": clean_vendor_name(cell(row, "Performed By", "Vendor")),
            "status": status,
            "approvedAt": approved_at or (created_at if status == "APPROVED" else None),
            "createdAt": created_at,
            "lineItems": [{
                "costCodeId": cc_id,
                "title": cell(row, "Title") or "Migrated from Buildertrend",
                "quantityMilli": 1000,
                "unitCostCents": round(float(cost or 0) * 100),
            }],
        })
        po_number_map[str(po_raw).strip()] = po_number
    return payloads, po_number_map


def map_bill_status_flexible(row, label):
    """Prefer explicit Bill status; fall back to Paid Status from all-open-jobs CSV."""
    raw = cell(row, "Bill status", "Bill Status", "Paid Status")
    return map_bill_status(raw, label)


def build_bills(rows, prefix, cost_code_ids, po_number_map, po_id_by_number):
    payloads = []
    missing_cost_code_count = 0
    for row in rows:
        bill_raw = cell(row, "Bill #", "Bill#")
        label = f"Bill #{bill_raw}"
        # Buildertrend's cross-job Bills UI CSV often omits Cost Codes entirely
        # (see docs/bt-exports README). Historical grid/CSV exports use
        # "Buildertrend Flat Rate" as the catch-all — fall back to that so we
        # still import the dollars instead of silently dropping every bill.
        raw_codes = cell(row, "Cost codes", "Cost Codes", "Cost Code")
        if not str(raw_codes or "").strip():
            raw_codes = FLAT_RATE_CODE
            missing_cost_code_count += 1
        cc_id = resolve_cost_codes(raw_codes, cost_code_ids, label, "bills")
        if not cc_id:
            continue
        related_po_raw = str(cell(row, "Related POs", "Related PO") or "").strip()
        purchase_order_id = None
        if related_po_raw:
            po_number_original = related_po_raw.split("-", 1)[0].strip()
            po_number = po_number_map.get(po_number_original)
            purchase_order_id = po_id_by_number.get(po_number) if po_number else None
            if related_po_raw and not purchase_order_id:
                warn("bills", label, f'Related PO "{related_po_raw}" was not resolved to an imported PO — left unlinked.')
        created_at = xl_to_iso(cell(row, "Created date", "Created Date"))
        if created_at is None:
            created_at = xl_to_iso(cell(row, "Invoice date", "Invoice Date", "Date paid", "Date Paid"))
        if created_at is None:
            warn("bills", label, "Missing dates — row skipped.")
            continue
        amount = cell(row, "Bill amount", "Bill Amount") or 0
        payloads.append({
            "purchaseOrderId": purchase_order_id,
            "vendorName": clean_vendor_name(cell(row, "Pay to", "Pay To")),
            "billNumber": f"{prefix}-{str(bill_raw).strip()}",
            "approvalStatus": map_bill_status_flexible(row, label),
            "issuedOn": xl_to_iso(cell(row, "Invoice date", "Invoice Date")),
            "dueOn": xl_to_iso(cell(row, "Due date", "Due Date")),
            "paidAt": xl_to_iso(cell(row, "Date paid", "Date Paid")),
            "createdAt": created_at,
            "lineItems": [{
                "costCodeId": cc_id,
                "title": cell(row, "Bill title", "Title") or "Migrated from Buildertrend",
                "amountCents": round(float(amount or 0) * 100),
            }],
        })
    if missing_cost_code_count:
        warn(
            "bills",
            f"{missing_cost_code_count} row(s)",
            f'No Cost Codes in export — booked to "{FLAT_RATE_CODE}".',
        )
    return payloads


def normalize_invoice_id_keys(raw):
    """BT Invoices.csv ID# is often '1' while InvoicePayments.csv Invoice is '0001'.
    Return every lookup key that should match the same logical invoice."""
    s = str(raw or "").strip()
    if not s:
        return []
    keys = {s}
    if s.isdigit():
        keys.add(str(int(s)))  # '0001' → '1'
    return list(keys)


def build_invoices(rows, prefix, payments_by_invoice):
    payloads = []
    for row in rows:
        original_id = str(cell(row, "ID#", "Invoice #", "Invoice#") or "").strip()
        label = f"Invoice #{original_id}"
        total = float(cell(row, "Total Price", "Invoice Amount") or 0)
        amount_paid = float(cell(row, "Amount Paid") or 0)
        status = map_invoice_status(
            cell(row, "Status", "Paid Status"),
            amount_paid,
            total,
            label,
        )
        created_at = (
            xl_to_iso(cell(row, "Date Paid", "Date Released", "Created Date"))
            or xl_to_iso(cell(row, "Deadline", "Due Date"))
        )
        if created_at is None:
            warn("invoices", label, "Missing dates — row skipped.")
            continue
        # Payments keyed by invoice # within a job; zero-pad variants resolve here.
        payments = []
        for key in normalize_invoice_id_keys(original_id):
            if key in payments_by_invoice:
                payments = payments_by_invoice[key]
                break
        payloads.append({
            "type": "FLAT",
            "invoiceNumber": f"{prefix}-{original_id}",
            "status": status,
            "amountCents": round(total * 100),
            "dueOn": xl_to_iso(cell(row, "Deadline", "Due Date")),
            "paidAt": xl_to_iso(cell(row, "Date Paid")),
            "createdAt": created_at,
            "payments": payments,
        })
    return payloads


def build_payments_by_invoice(rows):
    by_invoice = {}
    for row in rows:
        invoice_id = str(cell(row, "Invoice", "Invoice #", "Invoice#") or "").strip()
        if not invoice_id:
            continue
        label = f"Payment on invoice #{invoice_id}"
        payment = {
            "method": map_payment_method(cell(row, "Payment method", "Payment Method"), label),
            "amountCents": round(float(cell(row, "Payment amount", "Payment Amount") or 0) * 100),
            "receivedAt": xl_to_iso(cell(row, "Date paid", "Date Paid")),
        }
        # Index under every zero-pad variant so lookup from Invoices ID# succeeds.
        for key in normalize_invoice_id_keys(invoice_id):
            by_invoice.setdefault(key, []).append(payment)
    return by_invoice


def group_rows_by_job(rows):
    """Split an all-open-jobs export (has a Job column) into {normalizedName: rows}.
    Single-job exports without a Job column return {None: rows}."""
    if not rows or "Job" not in rows[0]:
        return {None: rows}
    grouped = {}
    for row in rows:
        key = normalize_job_name(row.get("Job"))
        grouped.setdefault(key, []).append(row)
    return grouped


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def import_for_job(client, job, cost_code_ids, uploaded_by_user_id, po_rows, bill_rows, invoice_rows, payment_rows, dry_run):
    prefix, prefix_source = derive_job_prefix(job)
    print(f'\nResolved job: {job["name"]}  (id={job["id"]}, status={job["status"]}, prefix="{prefix}")')
    if prefix_source != "job.prefix":
        print(
            f'  NOTE: no Job.prefix — using "{prefix}" from {prefix_source} '
            "so PO/Invoice numbers stay unique and human-readable across jobs."
        )

    po_payloads, po_number_map = ([], {})
    if po_rows:
        po_payloads, po_number_map = build_purchase_orders(po_rows, prefix, cost_code_ids)

    po_id_by_number = {}
    if po_payloads:
        print(f"  Purchase Orders: {len(po_payloads)}")
        if dry_run:
            print(json.dumps(po_payloads[:3], indent=2)[:1500])
        else:
            for i in range(0, len(po_payloads), 100):
                batch = po_payloads[i:i + 100]
                results = client.post("/migration/purchase-orders", {
                    "purchaseOrders": [{**p, "uploadedByUserId": uploaded_by_user_id, "jobId": job["id"]} for p in batch],
                })
                for result, payload in zip(results, batch):
                    status = result["status"]
                    print(f'    {payload["poNumber"]}: {status}' + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("purchaseOrderId")}'))
                    if status in ("success", "already_exists"):
                        po_id_by_number[payload["poNumber"]] = result["purchaseOrderId"]

    if bill_rows:
        bill_payloads = build_bills(bill_rows, prefix, cost_code_ids, po_number_map, po_id_by_number)
        print(f"  Bills: {len(bill_payloads)}")
        if dry_run:
            print(json.dumps(bill_payloads[:3], indent=2)[:1500])
        else:
            for i in range(0, len(bill_payloads), 100):
                batch = bill_payloads[i:i + 100]
                results = client.post("/migration/bills", {
                    "bills": [{**p, "uploadedByUserId": uploaded_by_user_id, "jobId": job["id"]} for p in batch],
                })
                for result, payload in zip(results, batch):
                    status = result["status"]
                    print(f'    {payload["billNumber"]}: {status}' + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("billId")}'))

    if invoice_rows:
        payments_by_invoice = build_payments_by_invoice(payment_rows) if payment_rows else {}
        invoice_payloads = build_invoices(invoice_rows, prefix, payments_by_invoice)
        print(f"  Invoices: {len(invoice_payloads)}")
        if dry_run:
            print(json.dumps(invoice_payloads[:3], indent=2)[:1500])
        else:
            for i in range(0, len(invoice_payloads), 100):
                batch = invoice_payloads[i:i + 100]
                results = client.post("/migration/invoices", {
                    "invoices": [{**p, "uploadedByUserId": uploaded_by_user_id, "jobId": job["id"]} for p in batch],
                })
                for result, payload in zip(results, batch):
                    status = result["status"]
                    print(f'    {payload["invoiceNumber"]}: {status}' + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("invoiceId")}'))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-base", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--job-id")
    parser.add_argument("--job-query")
    parser.add_argument(
        "--all-jobs",
        action="store_true",
        help="Treat export files as multi-job (Job column) and import every matched WCI job.",
    )
    parser.add_argument("--uploaded-by-user-id", required=True, help="A real User.id in this org — attributed as the importer.")
    parser.add_argument("--purchase-orders")
    parser.add_argument("--bills")
    parser.add_argument("--invoices")
    parser.add_argument("--invoice-payments")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.all_jobs and not args.job_id and not args.job_query:
        parser.error("pass --job-id, --job-query, or --all-jobs")

    client = WciClient(args.api_base, args.api_key)
    cost_code_ids = client.cost_code_map()

    po_all = read_rows(args.purchase_orders) if args.purchase_orders else []
    bill_all = read_rows(args.bills) if args.bills else []
    invoice_all = read_rows(args.invoices) if args.invoices else []
    payment_all = read_rows(args.invoice_payments) if args.invoice_payments else []

    if args.all_jobs:
        jobs = client.all_jobs()
        by_name = {normalize_job_name(j["name"]): j for j in jobs}
        # Also index by trimmed address-ish prefixes for fuzzy recovery later.
        po_groups = group_rows_by_job(po_all)
        bill_groups = group_rows_by_job(bill_all)
        invoice_groups = group_rows_by_job(invoice_all)
        payment_groups = group_rows_by_job(payment_all)
        job_keys = sorted(
            (set(po_groups) | set(bill_groups) | set(invoice_groups) | set(payment_groups)) - {None}
        )
        print(f"Multi-job import: {len(job_keys)} distinct Job names in exports; {len(jobs)} WCI jobs loaded.")
        unmatched = []
        for key in job_keys:
            job = by_name.get(key)
            if not job:
                unmatched.append(key)
                warn("jobs", key, "No WCI Job.name match (after trim/casefold) — skipped.")
                continue
            import_for_job(
                client,
                job,
                cost_code_ids,
                args.uploaded_by_user_id,
                po_groups.get(key, []),
                bill_groups.get(key, []),
                invoice_groups.get(key, []),
                payment_groups.get(key, []),
                args.dry_run,
            )
        if unmatched:
            print(f"\n=== {len(unmatched)} BT job name(s) with no WCI match ===")
            for name in unmatched[:50]:
                print(f"  {name}")
    else:
        job = resolve_job(client, args.job_id, args.job_query)
        # When a single-job export still has a Job column, keep only matching rows.
        def filter_job(rows):
            grouped = group_rows_by_job(rows)
            if None in grouped:
                return grouped[None]
            key = normalize_job_name(job["name"])
            return grouped.get(key, [])

        import_for_job(
            client,
            job,
            cost_code_ids,
            args.uploaded_by_user_id,
            filter_job(po_all),
            filter_job(bill_all),
            filter_job(invoice_all),
            filter_job(payment_all),
            args.dry_run,
        )

    if WARNINGS:
        print(f"\n=== {len(WARNINGS)} warning(s) — review these, nothing here failed the import but some assumptions were made ===")
        for w in WARNINGS:
            print(f"  {w}")


if __name__ == "__main__":
    main()
