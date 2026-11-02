/**
 * Vendor invoice / bill numbers for QuickBooks push (Money rules 2026-11-02).
 *
 * Never invent or prefix numbers. JOB_<jobcode>-… was created by migration when
 * Job.prefix fell back to job.id[:8] (e.g. job_5e26… → JOB_5E26). Those copies
 * must not be created again, and must not be pushed to QBO.
 */

/** Matches invented migration numbers like JOB_5E26-0007 or JOB_755B-0094. */
const INVENTED_JOB_PREFIXED_BILL_NUMBER = /^JOB_[A-Za-z0-9]+-/i;

export function normalizeVendorInvoiceNumber(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/** True when the number looks like an OS-invented JOB_* twin, not a vendor invoice #. */
export function isInventedJobPrefixedBillNumber(billNumber: string | null | undefined): boolean {
  const normalized = normalizeVendorInvoiceNumber(billNumber);
  if (!normalized) return false;
  return INVENTED_JOB_PREFIXED_BILL_NUMBER.test(normalized);
}

/**
 * Numbers safe to send as QBO DocNumber: non-blank and not an invented JOB_* prefix.
 * Blank → hold/flag (do not generate). JOB_* → refuse.
 */
export function vendorInvoiceNumberPushBlockReason(billNumber: string | null | undefined): string | null {
  const normalized = normalizeVendorInvoiceNumber(billNumber);
  if (!normalized) {
    return "Vendor invoice number is blank — hold and enter the real number; do not invent or prefix one.";
  }
  if (isInventedJobPrefixedBillNumber(normalized)) {
    return `Bill number "${normalized}" looks like an OS-invented JOB_ prefix twin — use the vendor's real invoice number only.`;
  }
  return null;
}
