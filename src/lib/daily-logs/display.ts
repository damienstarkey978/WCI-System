/** Display helpers for daily logs, shared by the list and the opened log. */

import { DISPLAY_TIMEZONE, formatDateUtc } from "@/lib/format";

export function weatherSummary(weather: unknown): { condition: string | null; tempF: number | null } | null {
  if (!weather || typeof weather !== "object") return null;
  const w = weather as Record<string, unknown>;
  const tempF = typeof w.temperatureF === "number" ? Math.round(w.temperatureF) : null;
  const condition = typeof w.condition === "string" ? w.condition : null;
  return tempF === null && condition === null ? null : { condition, tempF };
}

/**
 * Prefer logDate (date-only, UTC calendar) when present; otherwise createdAt in Eastern.
 * formatDateUtc keeps UTC-midnight / UTC-noon import stamps on the correct calendar day.
 */
export function logHeading(logDateOrCreatedAt: Date, title: string | null, opts?: { readonly preferUtcDay?: boolean }): string {
  const preferUtc = opts?.preferUtcDay ?? true;
  const day = preferUtc
    ? formatDateUtc(logDateOrCreatedAt)
    : logDateOrCreatedAt.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: DISPLAY_TIMEZONE,
      });
  // formatDateUtc is "Oct 23, 2026" — strip year for the compact list heading when present.
  const compact = preferUtc ? day.replace(/,\s*\d{4}$/, "") : day;
  return title ? `${compact} | ${title}` : compact;
}
