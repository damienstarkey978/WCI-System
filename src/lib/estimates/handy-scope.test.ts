import { describe, expect, it } from "vitest";

import { buildHandyPricingTerms, buildHandyScopeGroups } from "@/lib/estimates/handy-scope";

const groups = [
  {
    label: "Drywall",
    groupClientTotalCents: 112_000,
    items: [
      {
        id: "1",
        title: "Hang drywall",
        description: null,
        costCodeLabel: "04 · Drywall",
        costType: "LABOR",
        quantityMilli: 8000,
        unit: "hr",
        unitCostCents: 10_000,
        rateMode: "MARKUP",
        rateBasisPoints: 4000,
        builderCostCents: 80_000,
        clientTotalCents: 112_000,
      },
    ],
  },
] as const;

describe("handy-scope", () => {
  it("summarizes trade groups with labor hours", () => {
    const scope = buildHandyScopeGroups(groups);
    expect(scope).toHaveLength(1);
    expect(scope[0].label).toBe("Drywall");
    expect(scope[0].hoursLabel).toBe("8 hrs");
    expect(scope[0].summary).toContain("Hang drywall");
  });

  it("builds pricing terms from real line rates", () => {
    const terms = buildHandyPricingTerms({
      groups,
      totalClientCents: 112_000,
      totalBuilderCostCents: 80_000,
      lineItemCount: 1,
    });
    expect(terms.laborRateLabel).toBe("$100.00/hr");
    expect(terms.typicalMarkupLabel).toBe("40.0%");
    expect(terms.totalLabel).toBe("$1,120.00");
  });
});
