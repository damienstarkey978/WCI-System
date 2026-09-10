/**
 * Status pill colors shared by the PO list and detail views, so the same status
 * never renders two different ways depending on which screen you're looking at.
 */

export const PO_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  PENDING_APPROVAL: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  COMPLETED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  CANCELLED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

export const WORK_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  NOT_COMPLETE: { bg: "#e5e7eb", text: "#374151" },
  WORK_COMPLETE: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
};
