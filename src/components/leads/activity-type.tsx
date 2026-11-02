import type { ComponentType } from "react";

import { CalendarIcon, CheckIcon, ClipboardIcon, DocumentIcon, MailIcon, NoteIcon, PhoneIcon, TaskIcon } from "@/components/shell/icons";

export type LeadActivityTypeKey = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK";

export const ACTIVITY_TYPE_META: Record<
  LeadActivityTypeKey,
  { label: string; Icon: ComponentType<{ className?: string }>; accent: string }
> = {
  CALL: { label: "Call", Icon: PhoneIcon, accent: "#1e4d5c" },
  EMAIL: { label: "Email", Icon: MailIcon, accent: "#1e4d5c" },
  MEETING: { label: "Meeting", Icon: CalendarIcon, accent: "#1e4d5c" },
  NOTE: { label: "Note", Icon: NoteIcon, accent: "#1e4d5c" },
  TASK: { label: "Task", Icon: TaskIcon, accent: "#5c3a2e" },
};

export const ACTIVITY_TYPE_ORDER: readonly LeadActivityTypeKey[] = ["CALL", "EMAIL", "MEETING", "NOTE", "TASK"];

type ActivityGlyph = "phone" | "mail" | "calendar" | "document" | "clipboard" | "task" | "note" | "check";

const ACTIVITY_GLYPHS: Record<ActivityGlyph, ComponentType<{ className?: string }>> = {
  phone: PhoneIcon,
  mail: MailIcon,
  calendar: CalendarIcon,
  document: DocumentIcon,
  clipboard: ClipboardIcon,
  task: TaskIcon,
  note: NoteIcon,
  check: CheckIcon,
};

/**
 * Pick a glyph key from a free-text BT activity type label when the coarse enum
 * is too blunt (e.g. "Production Docs Uploaded" → document, not generic Note).
 */
function glyphKeyForBtLabel(btLabel: string | null | undefined): ActivityGlyph | null {
  if (!btLabel) return null;
  const t = btLabel.toLowerCase();
  if (t.includes("call") || t.includes("phone")) return "phone";
  if (t.includes("email") || t.includes("mail")) return "mail";
  if (t.includes("meet") || t.includes("appoint") || t.includes("visit")) return "calendar";
  if (t.includes("doc") || t.includes("upload") || t.includes("permit")) return "document";
  if (t.includes("update") || t.includes("general")) return "clipboard";
  if (t.includes("follow") || t.includes("task") || t.includes("review") || t.includes("confirm")) return "task";
  return null;
}

function glyphKeyForType(type: string): ActivityGlyph {
  switch (type) {
    case "CALL":
      return "phone";
    case "EMAIL":
      return "mail";
    case "MEETING":
      return "calendar";
    case "TASK":
      return "task";
    case "NOTE":
    default:
      return "note";
  }
}

/**
 * BT Activity view type glyph: solid dark circle + white icon (WCI teal/brown
 * fills — metaphor and weight match Buildertrend, colors stay WCI).
 */
export function ActivityTypeIcon({
  type,
  size = "md",
  completed = false,
  btLabel,
}: {
  type: string;
  size?: "sm" | "md";
  completed?: boolean;
  /** Optional Buildertrend type label for a more specific glyph. */
  btLabel?: string | null;
}) {
  const meta = ACTIVITY_TYPE_META[type as LeadActivityTypeKey] ?? ACTIVITY_TYPE_META.NOTE;
  const glyphKey: ActivityGlyph =
    completed && type === "TASK" ? "check" : (glyphKeyForBtLabel(btLabel) ?? glyphKeyForType(type));
  const Glyph = ACTIVITY_GLYPHS[glyphKey];
  const box = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const glyph = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const fill = completed ? "var(--bt-status-open-text)" : meta.accent;
  return (
    <span
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full text-white`}
      style={{ background: fill }}
      title={btLabel || meta.label}
      aria-label={btLabel || meta.label}
    >
      <Glyph className={glyph} />
    </span>
  );
}

export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_META[type as LeadActivityTypeKey]?.label ?? type;
}

/** Past Due / Pending / Completed / Logged status pill — BT Activity view. */
export function ActivityStatusPill({ status }: { status: "PAST_DUE" | "PENDING" | "COMPLETED" | "LOGGED" }) {
  const styles: Record<typeof status, { bg: string; text: string; label: string }> = {
    PAST_DUE: { bg: "#fde8e8", text: "#b42318", label: "Past Due" },
    PENDING: { bg: "#fef3c7", text: "#92400e", label: "Pending" },
    COMPLETED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)", label: "Completed" },
    LOGGED: { bg: "var(--bt-panel-bg-muted)", text: "var(--bt-muted)", label: "Logged" },
  };
  const s = styles[status];
  return (
    <span
      className="inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}
