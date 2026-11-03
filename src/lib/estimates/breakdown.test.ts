import { describe, expect, it } from "vitest";

import { computeEstimateBreakdown, costTypeToBreakdownBucket } from "@/lib/estimates/breakdown";

describe("computeEstimateBreakdown", () => {
  it("buckets Material / Labor / Other with 40% markup → ~28.6% margin", () => {
    // Handoff reference shape: cost $100 material + $1000 labor + $100 other @ 40% markup
    const materialCost = 100_00;
    const laborCost = 1_000_00;
    const otherCost = 100_00;
    const markup = (cents: number) => Math.round(cents * 0.4);

    const breakdown = computeEstimateBreakdown([
      {
        costType: "MATERIAL",
        builderCostCents: materialCost,
        clientTotalCents: materialCost + markup(materialCost),
        rateBasisPoints: 4_000,
      },
      {
        costType: "LABOR",
        builderCostCents: laborCost,
        clientTotalCents: laborCost + markup(laborCost),
        rateBasisPoints: 4_000,
      },
      {
        costType: "SUBCONTRACTOR",
        builderCostCents: otherCost,
        clientTotalCents: otherCost + markup(otherCost),
        rateBasisPoints: 4_000,
      },
    ]);

    expect(breakdown.totalCostCents).toBe(1_200_00);
    expect(breakdown.totalMarkupCents).toBe(480_00);
    expect(breakdown.estimateTotalCents).toBe(1_680_00);
    expect(breakdown.subtotalCents).toBe(breakdown.estimateTotalCents);
    expect(breakdown.material.markupBasisPoints).toBe(4_000);
    expect(breakdown.labor.markupBasisPoints).toBe(4_000);
    expect(breakdown.other.markupBasisPoints).toBe(4_000);
    // profit / price = 480/1680 ≈ 28.57% → 2857 bp
    expect(breakdown.profitMarginBasisPoints).toBe(2_857);
  });

  it("maps EQUIPMENT and NONE into Other", () => {
    expect(costTypeToBreakdownBucket("EQUIPMENT")).toBe("OTHER");
    expect(costTypeToBreakdownBucket("NONE")).toBe("OTHER");
    expect(costTypeToBreakdownBucket("MATERIAL")).toBe("MATERIAL");
    expect(costTypeToBreakdownBucket("LABOR")).toBe("LABOR");
  });
});
