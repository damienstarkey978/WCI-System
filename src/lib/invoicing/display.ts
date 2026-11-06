/**
 * Buildertrend shows short invoice IDs (0001, 0002). Migration/import numbers
 * often arrive as JOB_* or *-INV-* prefixes — strip those for staff UI only.
 * Stored invoiceNumber stays authoritative for uniqueness and QBO.
 */
export function displayInvoiceId(invoiceNumber: string): string {
  const jobPrefixed = invoiceNumber.match(/^JOB_[A-Za-z0-9]+-(.+)$/i);
  if (jobPrefixed?.[1]) return jobPrefixed[1];
  const invPrefixed = invoiceNumber.match(/^[A-Z0-9]+-INV-(.+)$/i);
  if (invPrefixed?.[1]) return invPrefixed[1];
  return invoiceNumber;
}

export function invoiceStatusLabel(status: string): string {
  switch (status) {
    case "PAID":
    case "APPLIED":
      return "Paid";
    case "SENT":
    case "ISSUED":
    case "REQUESTED":
    case "RECEIVED":
      return "Pending/Sent";
    case "PARTIALLY_PAID":
      return "Partially paid";
    case "DRAFT":
      return "Draft";
    case "VOID":
      return "Void";
    case "REFUNDED":
      return "Refunded";
    default:
      return status.replace(/_/g, " ");
  }
}

/** BT invoice status pills — green Paid, orange Pending/Sent. */
export const INVOICE_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  REQUESTED: { bg: "#fff4e5", text: "#b76e00" },
  SENT: { bg: "#fff4e5", text: "#b76e00" },
  ISSUED: { bg: "#fff4e5", text: "#b76e00" },
  RECEIVED: { bg: "#fff4e5", text: "#b76e00" },
  PARTIALLY_PAID: { bg: "#fff4e5", text: "#b76e00" },
  PAID: { bg: "#e6f4ea", text: "#1e7e34" },
  APPLIED: { bg: "#e6f4ea", text: "#1e7e34" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  REFUNDED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};
