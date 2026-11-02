"use client";

import { type ReactNode } from "react";

import { filterControlClassName, filterControlStyle } from "./ListFilterSidebar";

/** Shared multi-select chip control used by BT-style Filter sidebars. */
export function MultiSelectChips({
  options,
  selected,
  onChange,
  emptyLabel = "All",
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-10 flex-wrap gap-1.5 rounded border px-2 py-1.5 sm:min-h-0" style={filterControlStyle()}>
        {selected.length === 0 ? <span className="text-sm text-[var(--bt-muted)]">{emptyLabel}</span> : null}
        {selected.map((value) => {
          const label = options.find((o) => o.value === value)?.label ?? value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              {label}
              <span aria-hidden>×</span>
            </button>
          );
        })}
      </div>
      <select
        className={filterControlClassName}
        style={filterControlStyle()}
        value=""
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          if (!selected.includes(value)) onChange([...selected, value]);
          event.target.value = "";
        }}
        aria-label="Add filter value"
      >
        <option value="">Add…</option>
        {options
          .filter((o) => !selected.includes(o.value))
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </div>
  );
}

export function DatePresetSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={filterControlClassName} style={filterControlStyle()}>
      {options.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
  );
}

export const COMMON_DATE_PRESETS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "last90", label: "Last 90 days" },
] as const;

export function matchesDatePreset(iso: string, preset: string, now = Date.now()): boolean {
  if (preset === "all") return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const day = 86_400_000;
  switch (preset) {
    case "today":
      return t >= todayMs && t < todayMs + day;
    case "last7":
      return t >= now - 7 * day && t <= now;
    case "last30":
      return t >= now - 30 * day && t <= now;
    case "last90":
      return t >= now - 90 * day && t <= now;
    default:
      return true;
  }
}

export function countTruthyFilters(flags: readonly boolean[]): number {
  return flags.filter(Boolean).length;
}

export function FilterStack({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
