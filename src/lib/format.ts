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

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatPercent(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(1)}%`;
}
