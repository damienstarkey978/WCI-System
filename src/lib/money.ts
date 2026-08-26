/**
 * Money and rate primitives.
 *
 * Every monetary amount in WCI OS is an integer number of **cents**, and every rate
 * (markup, margin, tax) is an integer number of **basis points** (1 bp = 0.01%).
 * Binary floats are never used to carry money — see CLAUDE.md section 5.
 */

/** An integer number of US cents. */
export type Cents = number;

/** An integer number of basis points. 10_000 bp = 100%. */
export type BasisPoints = number;

export const BASIS_POINTS_SCALE = 10_000;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertCents(value: unknown, label = "amount"): asserts value is Cents {
  if (!isCents(value)) {
    throw new MoneyError(`${label} must be a safe integer number of cents, received ${String(value)}`);
  }
}

export function assertBasisPoints(value: unknown, label = "rate"): asserts value is BasisPoints {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a safe integer number of basis points, received ${String(value)}`);
  }
}

/**
 * Round half away from zero, so that -0.5 rounds to -1 rather than to -0.
 * Math.round is biased toward positive infinity, which produces asymmetric results
 * on credits and negative change orders.
 */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Price a cost with a **markup**: price = cost × (1 + rate).
 * A 20% markup on $100 of cost yields $120.
 */
export function applyMarkup(costCents: Cents, markupBasisPoints: BasisPoints): Cents {
  assertCents(costCents, "costCents");
  assertBasisPoints(markupBasisPoints, "markupBasisPoints");
  return roundHalfAwayFromZero(costCents * (1 + markupBasisPoints / BASIS_POINTS_SCALE));
}

/**
 * Price a cost with a **margin**: price = cost ÷ (1 − rate), so that the resulting
 * profit is `rate` percent *of the price*. A 20% margin on $100 of cost yields $125.
 *
 * Markup and margin are different operations on the same inputs and are the single
 * most common source of quiet pricing errors — the estimate builder must always
 * record which one the user chose.
 */
export function applyMargin(costCents: Cents, marginBasisPoints: BasisPoints): Cents {
  assertCents(costCents, "costCents");
  assertBasisPoints(marginBasisPoints, "marginBasisPoints");
  if (marginBasisPoints >= BASIS_POINTS_SCALE) {
    throw new MoneyError("marginBasisPoints must be below 10000 (100%); a 100% margin has no finite price");
  }
  if (marginBasisPoints <= -BASIS_POINTS_SCALE) {
    throw new MoneyError("marginBasisPoints must be above -10000 (-100%)");
  }
  return roundHalfAwayFromZero(costCents / (1 - marginBasisPoints / BASIS_POINTS_SCALE));
}

/** Convert a margin rate to the markup rate that produces the same price. */
export function marginToMarkup(marginBasisPoints: BasisPoints): BasisPoints {
  assertBasisPoints(marginBasisPoints, "marginBasisPoints");
  if (marginBasisPoints >= BASIS_POINTS_SCALE) {
    throw new MoneyError("marginBasisPoints must be below 10000 (100%)");
  }
  const margin = marginBasisPoints / BASIS_POINTS_SCALE;
  return roundHalfAwayFromZero((margin / (1 - margin)) * BASIS_POINTS_SCALE);
}

/** Convert a markup rate to the margin rate that produces the same price. */
export function markupToMargin(markupBasisPoints: BasisPoints): BasisPoints {
  assertBasisPoints(markupBasisPoints, "markupBasisPoints");
  const markup = markupBasisPoints / BASIS_POINTS_SCALE;
  if (markup <= -1) {
    throw new MoneyError("markupBasisPoints must be above -10000 (-100%)");
  }
  return roundHalfAwayFromZero((markup / (1 + markup)) * BASIS_POINTS_SCALE);
}

/** Profit in cents between a price and its cost. */
export function profitCents(priceCents: Cents, costCents: Cents): Cents {
  assertCents(priceCents, "priceCents");
  assertCents(costCents, "costCents");
  return priceCents - costCents;
}

/**
 * Realised margin of a price over a cost, in basis points.
 * Returns 0 when the price is zero, since no margin is meaningful there.
 */
export function marginBasisPoints(priceCents: Cents, costCents: Cents): BasisPoints {
  assertCents(priceCents, "priceCents");
  assertCents(costCents, "costCents");
  if (priceCents === 0) return 0;
  return roundHalfAwayFromZero(((priceCents - costCents) / priceCents) * BASIS_POINTS_SCALE);
}

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format cents for display, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: Cents): string {
  assertCents(cents, "cents");
  return USD_FORMATTER.format(cents / 100);
}

/** Format basis points for display, e.g. 1550 -> "15.5%". */
export function formatBasisPoints(bp: BasisPoints): string {
  assertBasisPoints(bp, "bp");
  return `${Number((bp / 100).toFixed(2))}%`;
}

/**
 * Parse a user-entered dollar amount ("1,234.56", "$1234.56", 1234.56) into cents.
 * Throws rather than silently truncating, because a bad parse here becomes a bad invoice.
 */
export function parseDollarsToCents(input: string | number): Cents {
  const raw = typeof input === "number" ? String(input) : input.trim().replace(/[$,\s]/g, "");
  if (raw === "" || !/^-?\d*(\.\d+)?$/.test(raw)) {
    throw new MoneyError(`Cannot parse "${String(input)}" as a dollar amount`);
  }
  const dollars = Number(raw);
  if (!Number.isFinite(dollars)) {
    throw new MoneyError(`Cannot parse "${String(input)}" as a dollar amount`);
  }
  return roundHalfAwayFromZero(dollars * 100);
}

/** Parse a user-entered percentage ("15.5", "15.5%") into basis points. */
export function parsePercentToBasisPoints(input: string | number): BasisPoints {
  const raw = typeof input === "number" ? String(input) : input.trim().replace(/[%\s]/g, "");
  if (raw === "" || !/^-?\d*(\.\d+)?$/.test(raw)) {
    throw new MoneyError(`Cannot parse "${String(input)}" as a percentage`);
  }
  const percent = Number(raw);
  if (!Number.isFinite(percent)) {
    throw new MoneyError(`Cannot parse "${String(input)}" as a percentage`);
  }
  return roundHalfAwayFromZero(percent * 100);
}
