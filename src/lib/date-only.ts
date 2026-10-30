/**
 * Date-only calendar values (bill issuedOn, daily-log logDate, schedule days).
 *
 * Stored in Postgres as DateTime. We pin the wall calendar to **UTC noon** so
 * JSON `YYYY-MM-DD` round-trips without shifting a day earlier in Eastern
 * (UTC midnight → 8pm previous day ET). API date-only fields serialize as
 * `YYYY-MM-DD`, never as full ISO timestamps.
 */

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when the instant is exactly UTC midnight (common import artifact). */
export function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  );
}

/** Parse `YYYY-MM-DD` (or a Date / ISO string) into a UTC-noon Date. */
export function parseDateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid date");
    return dateOnlyUtcNoon(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const trimmed = value.trim();
  const m = DATE_ONLY_RE.exec(trimmed);
  if (m) {
    return dateOnlyUtcNoon(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date-only value: ${value}`);
  // ISO with time: keep the UTC calendar day; date-only ISO midnight already is that day.
  return dateOnlyUtcNoon(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

function dateOnlyUtcNoon(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day, 12, 0, 0, 0));
}

/** Serialize a stored date-only DateTime as `YYYY-MM-DD` (UTC calendar day). */
export function formatDateOnly(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Today's calendar date in America/New_York, as UTC noon for that Y-M-D.
 * Used when creating a daily log without an explicit logDate.
 */
export function todayDateOnlyEastern(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parseDateOnly(parts);
}

/** Zod-friendly coerce: accepts YYYY-MM-DD or Date, stores UTC noon. */
export function coerceDateOnly(value: unknown): Date | undefined | null {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (value instanceof Date) return parseDateOnly(value);
  if (typeof value === "string") return parseDateOnly(value);
  throw new Error("Expected YYYY-MM-DD string or Date");
}
