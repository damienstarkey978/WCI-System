import { describe, expect, it } from "vitest";

import {
  applyMargin,
  applyMarkup,
  formatBasisPoints,
  formatCents,
  marginBasisPoints,
  marginToMarkup,
  markupToMargin,
  MoneyError,
  parseDollarsToCents,
  parsePercentToBasisPoints,
  profitCents,
  roundHalfAwayFromZero,
} from "@/lib/money";

describe("applyMarkup", () => {
  it("adds the rate to the cost", () => {
    expect(applyMarkup(10_000, 2_000)).toBe(12_000); // $100 + 20% = $120
  });

  it("returns the cost unchanged at a zero rate", () => {
    expect(applyMarkup(12_345, 0)).toBe(12_345);
  });

  it("rounds to whole cents", () => {
    // $33.33 + 15% = $38.3295 -> $38.33
    expect(applyMarkup(3_333, 1_500)).toBe(3_833);
  });

  it("handles credits (negative cost) symmetrically", () => {
    expect(applyMarkup(-10_000, 2_000)).toBe(-12_000);
  });

  it("rejects fractional cents", () => {
    expect(() => applyMarkup(100.5, 1_000)).toThrow(MoneyError);
  });
});

describe("applyMargin", () => {
  it("prices so the profit is the given share of the price", () => {
    // $100 cost at 20% margin -> $125 price, of which $25 (20%) is profit.
    expect(applyMargin(10_000, 2_000)).toBe(12_500);
  });

  it("differs from markup at the same rate — the classic estimating error", () => {
    expect(applyMarkup(10_000, 2_000)).toBe(12_000);
    expect(applyMargin(10_000, 2_000)).toBe(12_500);
  });

  it("refuses a 100% margin, which has no finite price", () => {
    expect(() => applyMargin(10_000, 10_000)).toThrow(MoneyError);
  });

  it("refuses margins beyond -100%", () => {
    expect(() => applyMargin(10_000, -10_000)).toThrow(MoneyError);
  });
});

describe("margin and markup conversion", () => {
  it("round-trips a 20% margin to a 25% markup", () => {
    expect(marginToMarkup(2_000)).toBe(2_500);
    expect(markupToMargin(2_500)).toBe(2_000);
  });

  it("produces the same price either way, to within integer-rate rounding", () => {
    // Converting a margin to a markup goes through integer basis points, so a rate like
    // 30% margin -> 42.857…% markup is stored as 4286 bp. The round-trip is therefore
    // lossy by a few cents on large amounts — acceptable, but a reason the estimate
    // builder must persist the rate the user actually chose rather than a converted one.
    const cost = 87_650;
    const marginRate = 3_000;
    const viaMarkup = applyMarkup(cost, marginToMarkup(marginRate));
    const viaMargin = applyMargin(cost, marginRate);
    expect(Math.abs(viaMarkup - viaMargin)).toBeLessThanOrEqual(5);
  });
});

describe("profit and realised margin", () => {
  it("computes profit in cents", () => {
    expect(profitCents(12_500, 10_000)).toBe(2_500);
  });

  it("computes realised margin in basis points", () => {
    expect(marginBasisPoints(12_500, 10_000)).toBe(2_000);
  });

  it("reports a negative margin on a loss", () => {
    expect(marginBasisPoints(10_000, 12_500)).toBe(-2_500);
  });

  it("returns zero margin on a zero price rather than dividing by zero", () => {
    expect(marginBasisPoints(0, 5_000)).toBe(0);
  });
});

describe("roundHalfAwayFromZero", () => {
  it("rounds .5 away from zero in both directions", () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });
});

describe("parsing", () => {
  it("parses dollar strings with symbols and separators", () => {
    expect(parseDollarsToCents("$1,234.56")).toBe(123_456);
    expect(parseDollarsToCents("1234.56")).toBe(123_456);
    expect(parseDollarsToCents(1234.56)).toBe(123_456);
    expect(parseDollarsToCents("-45.10")).toBe(-4_510);
  });

  it("rejects unparseable amounts instead of silently returning zero", () => {
    expect(() => parseDollarsToCents("")).toThrow(MoneyError);
    expect(() => parseDollarsToCents("twelve")).toThrow(MoneyError);
    expect(() => parseDollarsToCents("1.2.3")).toThrow(MoneyError);
  });

  it("parses percentages into basis points", () => {
    expect(parsePercentToBasisPoints("15.5%")).toBe(1_550);
    expect(parsePercentToBasisPoints(20)).toBe(2_000);
  });
});

describe("formatting", () => {
  it("formats cents as USD", () => {
    expect(formatCents(123_456)).toBe("$1,234.56");
    expect(formatCents(0)).toBe("$0.00");
  });

  it("formats basis points as a percentage", () => {
    expect(formatBasisPoints(1_550)).toBe("15.5%");
    expect(formatBasisPoints(2_000)).toBe("20%");
  });
});
