/**
 * Status pill colors shared by the PO list and detail views, so the same status
 * never renders two different ways depending on which screen you're looking at.
 *
 * Buildertrend's Standard View uses solid dark-grey / green pills with light text
 * (Draft / Not Complete vs Approved / Work Complete). Keep WCI brand greens via
 * --bt-badge-qb-bg for the positive states.
 */

export const PO_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#6b7280", text: "#ffffff" },
  PENDING_APPROVAL: { bg: "#d97706", text: "#ffffff" },
  APPROVED: { bg: "var(--bt-badge-qb-bg)", text: "#ffffff" },
  DECLINED: { bg: "var(--bt-danger)", text: "#ffffff" },
  COMPLETED: { bg: "var(--bt-primary)", text: "#ffffff" },
  CANCELLED: { bg: "#9ca3af", text: "#ffffff" },
};

export const WORK_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  NOT_COMPLETE: { bg: "#6b7280", text: "#ffffff" },
  WORK_COMPLETE: { bg: "var(--bt-badge-qb-bg)", text: "#ffffff" },
};

/** Statuses that show an info (i) glyph next to the pill in BT's list. */
export const PO_STATUS_SHOWS_INFO = new Set(["APPROVED", "COMPLETED"]);
export const WORK_STATUS_SHOWS_INFO = new Set(["WORK_COMPLETE"]);
