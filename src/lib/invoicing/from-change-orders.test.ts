import { describe, expect, it } from "vitest";

import {
  changeOrderLineClientPriceCents,
  invoiceAmountForPercent,
} from "@/lib/invoicing/from-change-orders";

describe("changeOrderLineClientPriceCents", () => {
  it("prices quantity × unit cost with markup", () => {
    // 2 × $100 @ 20% markup → $240
    expect(
      changeOrderLineClientPriceCents({
        quantityMilli: 2000,
        unitCostCents: 10_000,
        rateMode: "MARKUP",
        rateBasisPoints: 2000,
      }),
    ).toBe(24_000);
  });

  it("prices with margin", () => {
    // $100 cost @ 20% margin → $125
    expect(
      changeOrderLineClientPriceCents({
        quantityMilli: 1000,
        unitCostCents: 10_000,
        rateMode: "MARGIN",
        rateBasisPoints: 2000,
      }),
    ).toBe(12_500);
  });
});

describe("invoiceAmountForPercent", () => {
  it("takes a percent of client price", () => {
    expect(invoiceAmountForPercent(10_000, 5000)).toBe(5_000);
    expect(invoiceAmountForPercent(10_000, 10_000)).toBe(10_000);
    expect(invoiceAmountForPercent(10_000, 0)).toBe(0);
  });

  it("rounds half away from zero on fractional cents", () => {
    // 33.33% of $10.00 → 3333 bp → $3.333 → $3.33
    expect(invoiceAmountForPercent(1000, 3333)).toBe(333);
  });
});
