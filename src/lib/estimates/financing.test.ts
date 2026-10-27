import { describe, expect, it } from "vitest";

import { formatIllustrativeMonthly, illustrativeMonthlyPaymentCents } from "./financing";

describe("illustrativeMonthlyPaymentCents", () => {
  it("splits evenly across 60 months, rounding up cents", () => {
    expect(illustrativeMonthlyPaymentCents(203_840)).toBe(3_398);
  });

  it("returns 0 for empty totals", () => {
    expect(illustrativeMonthlyPaymentCents(0)).toBe(0);
  });
});

describe("formatIllustrativeMonthly", () => {
  it("formats a money string for positive totals", () => {
    expect(formatIllustrativeMonthly(203_840)).toMatch(/\$/);
  });

  it("returns null when there is nothing to finance", () => {
    expect(formatIllustrativeMonthly(0)).toBeNull();
  });
});
