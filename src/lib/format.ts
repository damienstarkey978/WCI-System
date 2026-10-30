/** Shared display formatting for the Buildertrend-match staff UI. */

/**
 * WCI's business timezone (Jacksonville). Server-rendered clocks must use this —
 * without it, Node's default (UTC on Vercel/Netlify) shows clock-in times four or
 * five hours ahead of Eastern, which Heather reported as "3:41 PM when it was
 * 11:41 AM Eastern."
 */
export const DISPLAY_TIMEZONE = "America/New_York";

/**
 * Money, to the cent.
 *
 * This used to round to whole dollars, which quietly broke every screen that shows
 * an amount: $1,234.56 rendered as "$1,235", and a 20% markup on a $1 bill rendered
 * as "$1" — the markup was applied and stored correctly, it just wasn't visible.
 * That was reported as a markup bug, because from the screen it is indistinguishable
 * from one. An invoice a client is asked to pay has to show what they owe.
 */
export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * For date-only values stored as UTC midnight (schedule dates, workday exceptions).
 * formatDate() uses the viewer's time zone, which shows these a day early for anyone
 * west of UTC, and differs between the server render and the browser.
 */
export function formatDateUtc(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: DISPLAY_TIMEZONE,
  });
}

/** Wall-clock time in the WCI business timezone (e.g. "11:41 AM"). */
export function formatTime(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIMEZONE,
  });
}

/** Date + time in the WCI business timezone (e.g. "Oct 28, 2026, 11:41 AM"). */
export function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: DISPLAY_TIMEZONE,
  });
}

export function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1)}%`;
}

/** Calendar YYYY-MM-DD in {@link DISPLAY_TIMEZONE} (not UTC). */
export function calendarDateEastern(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Instant of Sunday 00:00:00 in {@link DISPLAY_TIMEZONE} for the week containing `date`.
 * Used for time-clock weekly OT windows — UTC midnight week boundaries shift late-evening
 * Eastern shifts into the wrong week.
 */
export function startOfWeekEastern(date: Date = new Date()): Date {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as { year: string; month: string; day: string; weekday: string };

  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const daysFromSunday = weekdayIndex[dateParts.weekday] ?? 0;
  const year = Number(dateParts.year);
  const monthIndex = Number(dateParts.month) - 1;
  const day = Number(dateParts.day) - daysFromSunday;

  // Noon UTC on that calendar Sunday, then read Eastern hour-of-day to recover the offset
  // (handles EST vs EDT without a TZ database dependency).
  const noonUtc = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0));
  const easternHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DISPLAY_TIMEZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(noonUtc),
  );
  const offsetHoursFromUtc = easternHour - 12;
  return new Date(Date.UTC(year, monthIndex, day, -offsetHoursFromUtc, 0, 0, 0));
}
