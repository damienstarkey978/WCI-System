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

Usage:
  python3 import_financials.py \\
    --api-base http://localhost:3000/api/v1 \\
    --api-key wci_xxx \\
    --job-query "7103 Holiday" \\
    --purchase-orders PurchaseOrders.xls \\
    --bills Bills.xls \\
    --invoices Invoices.xls \\
    --invoice-payments InvoicePayments.xls \\
    [--dry-run]

Pass --job-id directly instead of --job-query once you know it, to skip the fuzzy
match entirely. The script always prints which job it resolved to before writing
anything — read that line before trusting a real (non-dry-run) run.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

import requests
import xlrd

EXCEL_EPOCH = datetime(1899, 12, 30)


def xl_to_iso(value):
    """Buildertrend's exports store every date as an Excel serial float. None/blank
    cells come through as '' from xlrd, not 0 — never treat '' as day zero."""
    if value in ("", None):
        return None
    if isinstance(value, str):
        return value
    return (EXCEL_EPOCH + timedelta(days=value)).isoformat() + "Z"


def read_rows(path):
    """Every Buildertrend export shares the same shape: row 0 is a title, row 1 is
    blank, row 2 is the real header, and the last row is a spreadsheet-style totals
    row with a blank Job/ID column — skip both ends, not just the top."""
    wb = xlrd.open_workbook(path)
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
    if raw.startswith("Sub/Vendor Approved") or raw.startswith("Client Approved"):
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
        "Pending Approval": "IN_REVIEW",
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
    """Buildertrend joins multiple cost codes on one row with \\r\\n. The generic
    'Buildertrend Flat Rate' bucket rides along on almost every receipt-style bill
    with no dollar amount of its own — it's Buildertrend's own default tag, not a
    real second cost split, so it's dropped whenever a real code is also present."""
    names = [n.strip() for n in (raw or "").replace("\r\n", "\n").split("\n") if n.strip()]
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

def build_purchase_orders(rows, prefix, cost_code_ids, uploaded_by_user_id):
    payloads, po_number_map = [], {}
    for row in rows:
        label = f'PO #{row["PO #"]}'
        cc_id = resolve_cost_codes(row.get("Cost Code"), cost_code_ids, label, "purchase-orders")
        if not cc_id:
            continue
        status, approved_at = map_po_status(row.get("PO Status"), label)
        created_at = xl_to_iso(row.get("Created Date"))
        po_number = f'{prefix}-{row["PO #"]}'
        payloads.append({
            "poNumber": po_number,
            "vendorName": clean_vendor_name(row.get("Performed By")),
            "status": status,
            "approvedAt": approved_at or (created_at if status == "APPROVED" else None),
            "createdAt": created_at,
            "lineItems": [{
                "costCodeId": cc_id,
                "title": row.get("Title") or "Migrated from Buildertrend",
                "quantityMilli": 1000,
                "unitCostCents": round(float(row.get("Cost") or 0) * 100),
            }],
        })
        po_number_map[str(row["PO #"]).strip()] = po_number
    return payloads, po_number_map


def build_bills(rows, prefix, cost_code_ids, po_number_map, po_id_by_number):
    payloads = []
    for row in rows:
        label = f'Bill #{row["Bill #"]}'
        cc_id = resolve_cost_codes(row.get("Cost codes"), cost_code_ids, label, "bills")
        if not cc_id:
            continue
        related_po_raw = str(row.get("Related POs") or "").strip()
        purchase_order_id = None
        if related_po_raw:
            po_number_original = related_po_raw.split("-", 1)[0].strip()
            po_number = po_number_map.get(po_number_original)
            purchase_order_id = po_id_by_number.get(po_number) if po_number else None
            if related_po_raw and not purchase_order_id:
                warn("bills", label, f'Related PO "{related_po_raw}" was not resolved to an imported PO — left unlinked.')
        payloads.append({
            "purchaseOrderId": purchase_order_id,
            "vendorName": clean_vendor_name(row.get("Pay to")),
            "billNumber": f'{prefix}-{row["Bill #"]}',
            "approvalStatus": map_bill_status(row.get("Bill status"), label),
            "issuedOn": xl_to_iso(row.get("Invoice date")),
            "dueOn": xl_to_iso(row.get("Due date")),
            "paidAt": xl_to_iso(row.get("Date paid")),
            "createdAt": xl_to_iso(row.get("Created date")),
            "lineItems": [{
                "costCodeId": cc_id,
                "title": row.get("Bill title") or "Migrated from Buildertrend",
                "amountCents": round(float(row.get("Bill amount") or 0) * 100),
            }],
        })
    return payloads


def build_invoices(rows, prefix, payments_by_invoice):
    payloads = []
    for row in rows:
        original_id = str(row.get("ID#") or "").strip()
        label = f"Invoice #{original_id}"
        total = float(row.get("Total Price") or 0)
        amount_paid = float(row.get("Amount Paid") or 0)
        status = map_invoice_status(row.get("Status"), amount_paid, total, label)
        created_at = xl_to_iso(row.get("Date Paid")) or xl_to_iso(row.get("Deadline"))
        payments = payments_by_invoice.get(original_id, [])
        payloads.append({
            "type": "FLAT",
            "invoiceNumber": f"{prefix}-{original_id}",
            "status": status,
            "amountCents": round(total * 100),
            "dueOn": xl_to_iso(row.get("Deadline")),
            "paidAt": xl_to_iso(row.get("Date Paid")),
            "createdAt": created_at,
            "payments": payments,
        })
    return payloads


def build_payments_by_invoice(rows):
    by_invoice = {}
    for row in rows:
        invoice_id = str(row.get("Invoice") or "").strip()
        if not invoice_id:
            continue
        label = f"Payment on invoice #{invoice_id}"
        by_invoice.setdefault(invoice_id, []).append({
            "method": map_payment_method(row.get("Payment method"), label),
            "amountCents": round(float(row.get("Payment amount") or 0) * 100),
            "receivedAt": xl_to_iso(row.get("Date paid")),
        })
    return by_invoice


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--api-base", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--job-id")
    parser.add_argument("--job-query")
    parser.add_argument("--uploaded-by-user-id", required=True, help="A real User.id in this org — attributed as the importer.")
    parser.add_argument("--purchase-orders")
    parser.add_argument("--bills")
    parser.add_argument("--invoices")
    parser.add_argument("--invoice-payments")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.job_id and not args.job_query:
        parser.error("pass --job-id or --job-query")

    client = WciClient(args.api_base, args.api_key)
    job = resolve_job(client, args.job_id, args.job_query)
    prefix = job.get("prefix") or job["id"][:8].upper()
    print(f'Resolved job: {job["name"]}  (id={job["id"]}, status={job["status"]}, using number prefix "{prefix}")')
    if not job.get("prefix"):
        print(f'  NOTE: this job has no `prefix` set — using "{prefix}" (first 8 chars of its id) so PO/Invoice numbers stay unique. Set a real prefix in Job Settings first if you want a readable one instead.')

    cost_code_ids = client.cost_code_map()

    po_payloads, po_number_map = ([], {})
    if args.purchase_orders:
        po_payloads, po_number_map = build_purchase_orders(read_rows(args.purchase_orders), prefix, cost_code_ids, args.uploaded_by_user_id)

    po_id_by_number = {}
    if po_payloads:
        print(f"\n=== Purchase Orders: {len(po_payloads)} to import ===")
        if args.dry_run:
            print(json.dumps(po_payloads, indent=2)[:3000])
        else:
            for i in range(0, len(po_payloads), 100):
                batch = po_payloads[i:i + 100]
                results = client.post("/migration/purchase-orders", {"purchaseOrders": [{**p, "uploadedByUserId": args.uploaded_by_user_id, "jobId": job["id"]} for p in batch]})
                for result, payload in zip(results, batch):
                    status = result["status"]
                    print(f'  {payload["poNumber"]}: {status}' + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("purchaseOrderId")}'))
                    if status == "success":
                        po_id_by_number[payload["poNumber"]] = result["purchaseOrderId"]

    bill_payloads = []
    if args.bills:
        bill_payloads = build_bills(read_rows(args.bills), prefix, cost_code_ids, po_number_map, po_id_by_number)
    if bill_payloads:
        print(f"\n=== Bills: {len(bill_payloads)} to import ===")
        if args.dry_run:
            print(json.dumps(bill_payloads, indent=2)[:3000])
        else:
            for i in range(0, len(bill_payloads), 100):
                batch = bill_payloads[i:i + 100]
                results = client.post("/migration/bills", {"bills": [{**p, "uploadedByUserId": args.uploaded_by_user_id, "jobId": job["id"]} for p in batch]})
                for result, payload in zip(results, batch):
                    status = result["status"]
                    print(f'  {payload["billNumber"]}: {status}' + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("billId")}'))

    if args.invoices:
        payments_by_invoice = build_payments_by_invoice(read_rows(args.invoice_payments)) if args.invoice_payments else {}
        invoice_payloads = build_invoices(read_rows(args.invoices), prefix, payments_by_invoice)
        print(f"\n=== Invoices: {len(invoice_payloads)} to import ===")
        if args.dry_run:
            print(json.dumps(invoice_payloads, indent=2)[:3000])
        else:
            for i in range(0, len(invoice_payloads), 100):
                batch = invoice_payloads[i:i + 100]
                results = client.post("/migration/invoices", {"invoices": [{**p, "uploadedByUserId": args.uploaded_by_user_id, "jobId": job["id"]} for p in batch]})
                for result, payload in zip(results, batch):
                    status = result["status"]
                    print(f'  {payload["invoiceNumber"]}: {status}' + (f' ({result.get("error")})' if status == "error" else f' -> {result.get("invoiceId")}'))

    if WARNINGS:
        print(f"\n=== {len(WARNINGS)} warning(s) — review these, nothing here failed the import but some assumptions were made ===")
        for w in WARNINGS:
            print(f"  {w}")


if __name__ == "__main__":
    main()
