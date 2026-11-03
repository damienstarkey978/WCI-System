import { describe, expect, it } from "vitest";

import { buildEstimateGroups } from "@/lib/estimates/groups";

describe("buildEstimateGroups", () => {
  it("groups by area + groupLabel with builder and client subtotals", () => {
    const groups = buildEstimateGroups([
      {
        id: "1",
        groupLabel: "Demo",
        areaLabel: "Bedroom 1",
        quantityMilli: 1_000,
        unitCostCents: 10_000,
        rateMode: "MARKUP",
        rateBasisPoints: 4_000,
        sortOrder: 0,
      },
      {
        id: "2",
        groupLabel: "Demo",
        areaLabel: "Bedroom 1",
        quantityMilli: 2_000,
        unitCostCents: 5_000,
        rateMode: "MARKUP",
        rateBasisPoints: 4_000,
        sortOrder: 1,
      },
      {
        id: "3",
        groupLabel: "Paint",
        areaLabel: "Bedroom 2",
        quantityMilli: 1_000,
        unitCostCents: 8_000,
        rateMode: "MARKUP",
        rateBasisPoints: 4_000,
        sortOrder: 2,
      },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      name: "Demo",
      areaLabel: "Bedroom 1",
      lineIds: ["1", "2"],
      builderCostCents: 20_000, // 100 + 2*50
      clientSubtotalCents: 28_000, // 40% markup
    });
    expect(groups[1]).toMatchObject({
      name: "Paint",
      areaLabel: "Bedroom 2",
      builderCostCents: 8_000,
      clientSubtotalCents: 11_200,
    });
  });

  it("zeros OWNER_SUPPLIED out of group money but keeps the line id", () => {
    const groups = buildEstimateGroups([
      {
        id: "own",
        groupLabel: "Owner-Supplied Materials",
        quantityMilli: 1_000,
        unitCostCents: 0,
        rateMode: "MARKUP",
        rateBasisPoints: 4_000,
        lineKind: "OWNER_SUPPLIED",
      },
      {
        id: "paid",
        groupLabel: "Owner-Supplied Materials",
        quantityMilli: 1_000,
        unitCostCents: 1_000,
        rateMode: "MARKUP",
        rateBasisPoints: 4_000,
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lineIds).toEqual(["own", "paid"]);
    expect(groups[0].builderCostCents).toBe(1_000);
    expect(groups[0].clientSubtotalCents).toBe(1_400);
  });
});
