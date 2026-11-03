import { describe, expect, it } from "vitest";

import {
  applyLineKindPricing,
  assertLineKindExclusive,
  MutualLineKindError,
} from "@/lib/estimates/line-kind";

describe("estimate line kind", () => {
  it("rejects ALLOWANCE + OWNER_SUPPLIED", () => {
    expect(() => assertLineKindExclusive({ allowance: true, ownerSupplied: true })).toThrow(MutualLineKindError);
  });

  it("zeros owner-supplied out of totals", () => {
    const priced = applyLineKindPricing({
      lineKind: "OWNER_SUPPLIED",
      unitCostCents: 5_000,
      builderCostCents: 5_000,
      clientTotalCents: 7_000,
    });
    expect(priced.unitCostCents).toBe(0);
    expect(priced.clientTotalCents).toBe(0);
    expect(priced.includeInTotals).toBe(false);
    expect(priced.groupLabelOverride).toBe("Owner-Supplied Materials");
  });

  it("keeps allowance in totals", () => {
    const priced = applyLineKindPricing({
      lineKind: "ALLOWANCE",
      unitCostCents: 10_000,
      builderCostCents: 10_000,
      clientTotalCents: 14_000,
    });
    expect(priced.includeInTotals).toBe(true);
    expect(priced.clientTotalCents).toBe(14_000);
  });
});
