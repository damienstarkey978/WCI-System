import { describe, expect, it } from "vitest";

import { computeProposalTaxCents, formatProposalTaxLine } from "@/lib/proposals/tax";

describe("proposal tax", () => {
  it("is $0.00 at 0%", () => {
    expect(computeProposalTaxCents(140_000, 0)).toBe(0);
    expect(
      formatProposalTaxLine({
        taxRateBasisPoints: 0,
        taxCents: 0,
        formatMoney: (cents) => `$${(cents / 100).toFixed(2)}`,
      }),
    ).toBe("Tax 0% $0.00");
  });

  it("computes tax when rate is set", () => {
    expect(computeProposalTaxCents(10_000, 700)).toBe(700);
  });
});
