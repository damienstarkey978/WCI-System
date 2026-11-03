import { describe, expect, it } from "vitest";

import { RateMode } from "@/generated/prisma/enums";
import { normalizeEstimateDraft, type RawEstimateDraft } from "@/lib/ai/estimate-draft";

const rawWindows: RawEstimateDraft = {
  title: "Garage windows",
  projectDescription: "Replace and cut-in windows.",
  assumptions: [],
  proposalSections: [],
  lineItems: [
    {
      costCodeId: "cc_win",
      groupLabel: "Windows & Doors",
      title: "Window — new opening",
      description: "Cut-in new opening",
      quantity: 2,
      unit: "ea",
      unitCostDollars: 999,
      ratePercent: 20,
      rateMode: RateMode.MARKUP,
      confidence: "HIGH",
      priceSource: "MARKET_RATE",
    },
    {
      costCodeId: "cc_win",
      groupLabel: "Windows & Doors",
      title: "Window R&R",
      description: "Remove and replace",
      quantity: 2,
      unit: "ea",
      unitCostDollars: 999,
      ratePercent: 20,
      rateMode: RateMode.MARKUP,
      confidence: "HIGH",
      priceSource: "MARKET_RATE",
    },
  ],
};

describe("normalizeEstimateDraft + pricing rules", () => {
  it("forces RULE window prices for Alterations & Repairs (2×$250 + 2×$300 unit costs)", () => {
    const draft = normalizeEstimateDraft(rawWindows, {
      permitWorkType: "ALTERATIONS_AND_REPAIRS",
      costCodes: [
        { id: "cc_win", code: "WIN", name: "Windows", defaultCostType: "MATERIAL" },
      ],
    });
    expect(draft.lineItems[0].unitCostCents).toBe(25_000);
    expect(draft.lineItems[0].unit).toBe("EA");
    expect(draft.lineItems[0].priceSource).toBe("RULE");
    expect(draft.lineItems[0].rateBasisPoints).toBe(4_000);
    expect(draft.lineItems[1].unitCostCents).toBe(30_000);
    expect(draft.lineItems[1].priceSource).toBe("RULE");
  });

  it("applies COST_DB defaults when cost code has default unit/cost", () => {
    const raw = {
      ...rawWindows,
      lineItems: [
        {
          ...rawWindows.lineItems[0],
          title: "Generic paint labor",
          description: "Interior walls",
          groupLabel: "Painting",
          unitCostDollars: 1,
          priceSource: "MARKET_RATE" as const,
        },
      ],
    };
    const draft = normalizeEstimateDraft(raw, {
      permitWorkType: "ALTERATIONS_AND_REPAIRS",
      costCodes: [
        {
          id: "cc_win",
          code: "PAINT",
          name: "Int Paint Labor",
          defaultCostType: "LABOR",
          defaultUnit: "SF",
          defaultUnitCostCents: 125,
        },
      ],
    });
    expect(draft.lineItems[0].unitCostCents).toBe(125);
    expect(draft.lineItems[0].unit).toBe("SF");
    expect(draft.lineItems[0].priceSource).toBe("COST_DB");
  });
});
