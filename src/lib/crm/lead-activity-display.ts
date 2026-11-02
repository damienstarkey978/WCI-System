/**
 * Display helpers for Lead Activities — Buildertrend Activity view columns.
 *
 * Migrated BT rows store type/status/assignee in the note as
 * `[BT type: …] [BT status: …] [Assigned: …]` (see
 * scripts/migration/import_bt_lead_activities.mts). Native WCI rows have a
 * plain note and rely on LeadActivityType / dueDate / completedAt instead.
 */

export type ActivityDisplayStatus = "PAST_DUE" | "PENDING" | "COMPLETED" | "LOGGED";

export interface ParsedLeadActivityNote {
  readonly btType: string | null;
  readonly btStatus: string | null;
  readonly assigned: string | null;
  /** Note body with BT metadata tags stripped. */
  readonly body: string;
}

const BT_TYPE_RE = /\[BT type:\s*([^\]]+)\]/i;
const BT_STATUS_RE = /\[BT status:\s*([^\]]+)\]/i;
const ASSIGNED_RE = /\[Assigned:\s*([^\]]+)\]/i;

export function parseLeadActivityNote(note: string): ParsedLeadActivityNote {
  const btType = note.match(BT_TYPE_RE)?.[1]?.trim() || null;
  const btStatus = note.match(BT_STATUS_RE)?.[1]?.trim() || null;
  const assigned = note.match(ASSIGNED_RE)?.[1]?.trim() || null;
  const body = note
    .replace(BT_TYPE_RE, "")
    .replace(BT_STATUS_RE, "")
    .replace(ASSIGNED_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  return { btType, btStatus, assigned, body };
}

/** Map a coarse LeadActivityType (+ optional BT label) onto a display type string. */
export function activityTypeDisplayLabel(type: string, btType: string | null): string {
  if (btType) return btType;
  switch (type) {
    case "CALL":
      return "Call";
    case "EMAIL":
      return "Email";
    case "MEETING":
      return "Meeting";
    case "TASK":
      return "Follow-up";
    case "NOTE":
    default:
      return "General Update";
  }
}

/**
 * Status pill for the Activity view.
 * Prefer an explicit BT status tag; otherwise derive from completedAt / dueDate.
 */
export function activityDisplayStatus(input: {
  readonly btStatus: string | null;
  readonly completedAt: Date | string | null;
  readonly dueDate: Date | string | null;
  readonly type: string;
}): ActivityDisplayStatus {
  if (input.completedAt) return "COMPLETED";
  const raw = (input.btStatus ?? "").trim().toLowerCase();
  // Exact-ish BT labels first — never use includes("complete") (matches "Not Complete").
  if (raw === "past due" || raw === "overdue") return "PAST_DUE";
  if (raw === "pending") return "PENDING";
  if (raw === "not complete" || raw === "incomplete" || raw === "open") return "PENDING";
  if (raw === "complete" || raw === "completed" || raw === "done" || raw === "logged") return "COMPLETED";

  if (input.dueDate) {
    const due = typeof input.dueDate === "string" ? new Date(input.dueDate) : input.dueDate;
    if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now() && !input.completedAt) {
      return "PAST_DUE";
    }
    return "PENDING";
  }
  // Open tasks without a due date still show as Pending (BT activity view).
  if (input.type === "TASK") return "PENDING";
  return "LOGGED";
}

export function activityStatusLabel(status: ActivityDisplayStatus): string {
  switch (status) {
    case "PAST_DUE":
      return "Past Due";
    case "PENDING":
      return "Pending";
    case "COMPLETED":
      return "Completed";
    case "LOGGED":
      return "Logged";
  }
}

/** Contact date for the grid: due date when set (scheduled work), else occurredAt. */
export function activityContactDate(input: {
  readonly dueDate: Date | string | null;
  readonly occurredAt: Date | string;
}): Date {
  if (input.dueDate) {
    const due = typeof input.dueDate === "string" ? new Date(input.dueDate) : input.dueDate;
    if (!Number.isNaN(due.getTime())) return due;
  }
  return typeof input.occurredAt === "string" ? new Date(input.occurredAt) : input.occurredAt;
}
