import { describe, expect, it } from "vitest";

import { applyPayment, computeDrawAmountCents, OverpaymentError, totalDrawPercentage } from "@/lib/invoicing/calc";

describe("computeDrawAmountCents", () => {
  it("computes the dollar amount of a percentage draw", () => {
    expect(computeDrawAmountCents(1_000_000, 2_500)).toBe(250_000); // 25% of $10,000
  });

  it("handles a 100% draw", () => {
    expect(computeDrawAmountCents(500_000, 10_000)).toBe(500_000);
  });

  it("rounds a fractional-cent draw amount", () => {
    expect(computeDrawAmountCents(100_000, 3_333)).toBe(33_330); // 33.33% of $1,000 = $333.30
  });

  it("returns zero for a zero contract price", () => {
    expect(computeDrawAmountCents(0, 5_000)).toBe(0);
  });
});

describe("applyPayment", () => {
  it("marks an invoice partially paid when it isn't fully covered", () => {
    const result = applyPayment(100_000, 0, 40_000);
    expect(result.totalPaidCents).toBe(40_000);
    expect(result.remainingCents).toBe(60_000);
    expect(result.status).toBe("PARTIALLY_PAID");
  });

  it("marks an invoice paid once the full amount is covered", () => {
    const result = applyPayment(100_000, 40_000, 60_000);
    expect(result.remainingCents).toBe(0);
    expect(result.status).toBe("PAID");
  });

  it("accumulates across multiple partial payments", () => {
    const first = applyPayment(100_000, 0, 30_000);
    const second = applyPayment(100_000, first.totalPaidCents, 30_000);
    const third = applyPayment(100_000, second.totalPaidCents, 40_000);
    expect(third.status).toBe("PAID");
    expect(third.remainingCents).toBe(0);
  });

  it("refuses an overpayment rather than silently accepting it", () => {
    expect(() => applyPayment(100_000, 0, 150_000)).toThrow(OverpaymentError);
  });

  it("refuses a payment that would exceed what's left after prior payments", () => {
    expect(() => applyPayment(100_000, 80_000, 30_000)).toThrow(OverpaymentError);
  });

  it("refuses a zero or negative payment", () => {
    expect(() => applyPayment(100_000, 0, 0)).toThrow();
    expect(() => applyPayment(100_000, 0, -100)).toThrow();
  });

  it("allows a payment that exactly zeroes the remaining balance", () => {
    expect(() => applyPayment(100_000, 99_999, 1)).not.toThrow();
  });
});

describe("totalDrawPercentage", () => {
  it("sums draw percentages", () => {
    expect(totalDrawPercentage([2_500, 2_500, 5_000])).toBe(10_000);
  });

  it("returns zero for an empty schedule", () => {
    expect(totalDrawPercentage([])).toBe(0);
  });
});
