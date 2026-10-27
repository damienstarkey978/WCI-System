import type { ComponentType } from "react";

import { CalendarIcon, CheckIcon, MailIcon, NoteIcon, PhoneIcon, TaskIcon } from "@/components/shell/icons";

export type LeadActivityTypeKey = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK";

export const ACTIVITY_TYPE_META: Record<
  LeadActivityTypeKey,
  { label: string; Icon: ComponentType<{ className?: string }>; accent: string }
> = {
  CALL: { label: "Call", Icon: PhoneIcon, accent: "#0d9488" },
  EMAIL: { label: "Email", Icon: MailIcon, accent: "#2563eb" },
  MEETING: { label: "Meeting", Icon: CalendarIcon, accent: "#7c3aed" },
  NOTE: { label: "Note", Icon: NoteIcon, accent: "#64748b" },
  TASK: { label: "Task", Icon: TaskIcon, accent: "#d97706" },
};

export const ACTIVITY_TYPE_ORDER: readonly LeadActivityTypeKey[] = ["CALL", "EMAIL", "MEETING", "NOTE", "TASK"];

/** Colored glyph used in Lead Activities list / detail / calendar — BT metaphors, WCI colors. */
export function ActivityTypeIcon({
  type,
  size = "md",
  completed = false,
}: {
  type: string;
  size?: "sm" | "md";
  completed?: boolean;
}) {
  const meta = ACTIVITY_TYPE_META[type as LeadActivityTypeKey] ?? ACTIVITY_TYPE_META.NOTE;
  const Icon = completed && type === "TASK" ? CheckIcon : meta.Icon;
  const box = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const glyph = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full`}
      style={{
        background: completed ? "var(--bt-status-open-bg)" : `color-mix(in srgb, ${meta.accent} 16%, transparent)`,
        color: completed ? "var(--bt-status-open-text)" : meta.accent,
      }}
      title={meta.label}
      aria-label={meta.label}
    >
      <Icon className={glyph} />
    </span>
  );
}

export function activityTypeLabel(type: string): string {
  return ACTIVITY_TYPE_META[type as LeadActivityTypeKey]?.label ?? type;
}
