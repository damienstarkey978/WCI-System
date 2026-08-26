import { describe, expect, it } from "vitest";

import { blendedMarkup, rollUpEstimateLines, type EstimateLineForRollup } from "@/lib/budget/send-to-budget";
import { applyMarkup } from "@/lib/money";

const paintLabor: EstimateLineForRollup = {
  costCodeId: "paint-int-l",
  quantityMilli: 40_000, // 40 hours
  unitCostCents: 4_500, // $45/hr
  rateMode: "MARKUP",
  rateBasisPoints: 2_000,
};

const paintMaterials: EstimateLineForRollup = {
  costCodeId: "paint-int-m",
  quantityMilli: 12_000, // 12 gallons
  unitCostCents: 5_200, // $52/gal
  rateMode: "MARKUP",
  rateBasisPoints: 1_000,
};

describe("rollUpEstimateLines", () => {
  it("extends quantity × unit cost per line", () => {
    const [labor] = rollUpEstimateLines([paintLabor]);
    expect(labor.costCents).toBe(180_000); // 40 × $45
    expect(labor.clientPriceCents).toBe(216_000); // +20%
  });

  it("keeps separate cost codes separate", () => {
    const rollups = rollUpEstimateLines([paintLabor, paintMaterials]);
    expect(rollups).toHaveLength(2);
    expect(rollups.map((r) => r.costCodeId)).toEqual(["paint-int-l", "paint-int-m"]);
  });

  it("sums multiple lines under one cost code", () => {
    const rollups = rollUpEstimateLines([paintLabor, { ...paintLabor, quantityMilli: 10_000 }]);
    expect(rollups).toHaveLength(1);
    expect(rollups[0].costCents).toBe(225_000); // 50 hours total
  });

  it("prices each line at its own rate, then sums — not the other way round", () => {
    // Two lines, same cost code, different markups. Pricing the summed cost at
    // either rate would be wrong; only per-line pricing gives $2,400.
    const rollups = rollUpEstimateLines([
      { ...paintLabor, quantityMilli: 1_000, unitCostCents: 100_000, rateBasisPoints: 1_000 },
      { ...paintLabor, quantityMilli: 1_000, unitCostCents: 100_000, rateBasisPoints: 3_000 },
    ]);
    // $1,000 at 10% = $1,100, plus $1,000 at 30% = $1,300 -> $2,400.
    expect(rollups[0].costCents).toBe(200_000);
    expect(rollups[0].clientPriceCents).toBe(240_000);
    expect(rollups[0].clientPriceCents).not.toBe(applyMarkup(200_000, 1_000));
    expect(rollups[0].clientPriceCents).not.toBe(applyMarkup(200_000, 3_000));
  });

  it("records a blended rate that reproduces the price from the cost", () => {
    const rollups = rollUpEstimateLines([
      { ...paintLabor, quantityMilli: 1_000, unitCostCents: 100_000, rateBasisPoints: 1_000 },
      { ...paintLabor, quantityMilli: 1_000, unitCostCents: 100_000, rateBasisPoints: 3_000 },
    ]);
    expect(rollups[0].blendedMarkupBasisPoints).toBe(2_000); // the average, here
    expect(applyMarkup(rollups[0].costCents, rollups[0].blendedMarkupBasisPoints)).toBe(
      rollups[0].clientPriceCents,
    );
  });

  it("handles margin-mode lines", () => {
    const rollups = rollUpEstimateLines([
      { ...paintLabor, quantityMilli: 1_000, unitCostCents: 100_000, rateMode: "MARGIN", rateBasisPoints: 2_000 },
    ]);
    expect(rollups[0].clientPriceCents).toBe(125_000);
  });

  it("handles fractional quantities without drift", () => {
    const rollups = rollUpEstimateLines([
      { ...paintLabor, quantityMilli: 2_500, unitCostCents: 1_000, rateBasisPoints: 0 },
    ]);
    expect(rollups[0].costCents).toBe(2_500); // 2.5 × $10.00
  });

  it("returns nothing for an empty estimate", () => {
    expect(rollUpEstimateLines([])).toEqual([]);
  });
});

describe("blendedMarkup", () => {
  it("derives the rate that turns cost into price", () => {
    expect(blendedMarkup(100_000, 120_000)).toBe(2_000);
    expect(blendedMarkup(100_000, 100_000)).toBe(0);
  });

  it("returns zero for a zero cost rather than dividing by zero", () => {
    expect(blendedMarkup(0, 50_000)).toBe(0);
  });

  it("reports a negative rate on a line sold below cost", () => {
    expect(blendedMarkup(100_000, 90_000)).toBe(-1_000);
  });
});
