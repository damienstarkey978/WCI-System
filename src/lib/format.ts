/** Shared display formatting for the Buildertrend-match staff UI. */

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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1)}%`;
}
