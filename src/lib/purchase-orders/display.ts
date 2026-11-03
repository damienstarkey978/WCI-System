/**
 * Buildertrend-facing display helpers for purchase orders.
 *
 * Import artifacts use prefixes like `JOB_5B13-0024` / `J167-PO-0011`; the staff
 * list shows the trailing numeric segment zero-padded to 4 digits, matching BT's
 * Standard View (`0011`). The stored `poNumber` is left alone — cleanup is a
 * separate data pass.
 */

export function formatPoNumberDisplay(poNumber: string, poSuffix?: string | null): string {
  const trimmed = poNumber.trim();
  let base: string;
  if (/^\d+$/.test(trimmed)) {
    base = trimmed.padStart(4, "0");
  } else {
    const match = trimmed.match(/(\d+)\s*$/);
    base = match ? match[1]!.padStart(4, "0") : trimmed;
  }
  return poSuffix ? `${base}-${poSuffix}` : base;
}

export function formatPoStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PENDING_APPROVAL":
      return "Pending Approval";
    case "APPROVED":
      return "Approved";
    case "DECLINED":
      return "Declined";
    case "COMPLETED":
      return "Completed";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

export function formatWorkStatusLabel(workStatus: string): string {
  switch (workStatus) {
    case "NOT_COMPLETE":
      return "Not Complete";
    case "WORK_COMPLETE":
      return "Work Complete";
    default:
      return workStatus.replace(/_/g, " ");
  }
}

/** Prefer the PO title; fall back to the first line-item title (common on BT imports). */
export function resolvePoTitle(title: string | null | undefined, firstLineTitle?: string | null): string | null {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;
  const line = firstLineTitle?.trim();
  return line || null;
}
