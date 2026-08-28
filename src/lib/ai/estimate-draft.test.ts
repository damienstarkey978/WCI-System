import { describe, expect, it } from "vitest";

import { RateMode } from "@/generated/prisma/enums";
import {
  buildEstimateDraftSchema,
  buildLineItemSchema,
  EmptyCostCodeCatalogError,
  formatCostCodeCatalog,
  formatMaterialCatalog,
  normalizeEstimateDraft,
  type CostCodeOption,
  type RawEstimateDraft,
} from "@/lib/ai/estimate-draft";

const CODES: readonly CostCodeOption[] = [
  { id: "cc_paint_labor", code: "PAINT-INT-L", name: "Int Paint Labor", defaultCostType: "LABOR" },
  { id: "cc_paint_mat", code: "PAINT-INT-M", name: "Int Paint Materials", defaultCostType: "MATERIAL" },
];

describe("buildLineItemSchema — the hallucination guard", () => {
  it("accepts a cost code id from the given catalog", () => {
    const schema = buildLineItemSchema(["cc_paint_labor", "cc_paint_mat"]);
    const result = schema.safeParse({
      costCodeId: "cc_paint_labor",
      groupLabel: "Painting",
      title: "Paint labor",
      quantity: 40,
      unitCostDollars: 45,
      ratePercent: 20,
      confidence: "HIGH",
      priceSource: "MARKET_RATE",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a cost code id the model invented", () => {
    const schema = buildLineItemSchema(["cc_paint_labor"]);
    const result = schema.safeParse({
      costCodeId: "cc_made_up_code",
      groupLabel: "Painting",
      title: "Something",
      quantity: 1,
      unitCostDollars: 100,
      ratePercent: 10,
      confidence: "LOW",
      priceSource: "MARKET_RATE",
    });
    expect(result.success).toBe(false);
  });

  it("refuses to build a schema against an empty catalog", () => {
    expect(() => buildLineItemSchema([])).toThrow(EmptyCostCodeCatalogError);
  });

  it("defaults rateMode to markup when omitted", () => {
    const schema = buildLineItemSchema(["cc_paint_labor"]);
    const result = schema.parse({
      costCodeId: "cc_paint_labor",
      groupLabel: "Painting",
      title: "Paint labor",
      quantity: 1,
      unitCostDollars: 10,
      ratePercent: 10,
      confidence: "HIGH",
      priceSource: "MARKET_RATE",
    });
    expect(result.rateMode).toBe(RateMode.MARKUP);
  });

  it("rejects a negative or absurd quantity", () => {
    const schema = buildLineItemSchema(["cc_paint_labor"]);
    expect(
      schema.safeParse({
        costCodeId: "cc_paint_labor",
        groupLabel: "Painting",
        title: "x",
        quantity: -5,
        unitCostDollars: 10,
        ratePercent: 10,
        confidence: "HIGH",
        priceSource: "MARKET_RATE",
      }).success,
    ).toBe(false);
  });
});

describe("buildEstimateDraftSchema", () => {
  it("requires at least one line item", () => {
    const schema = buildEstimateDraftSchema(["cc_paint_labor"]);
    expect(
      schema.safeParse({
        title: "Empty",
        projectDescription: "Nothing here",
        lineItems: [],
        proposalSections: [],
        assumptions: [],
      }).success,
    ).toBe(false);
  });

  it("accepts a full valid draft", () => {
    const schema = buildEstimateDraftSchema(["cc_paint_labor", "cc_paint_mat"]);
    const result = schema.safeParse({
      title: "Interior paint",
      projectDescription: "A two-room interior repaint.",
      lineItems: [
        {
          costCodeId: "cc_paint_labor",
          groupLabel: "Painting",
          title: "Paint labor",
          quantity: 40,
          unitCostDollars: 45,
          ratePercent: 20,
          confidence: "HIGH",
          priceSource: "MARKET_RATE",
        },
      ],
      proposalSections: [{ title: "Painting", bullets: ["Paint two rooms, walls and trim"] }],
      assumptions: ["Assumes standard 8ft ceilings"],
    });
    expect(result.success).toBe(true);
  });
});

describe("normalizeEstimateDraft — the float-to-integer boundary", () => {
  const raw: RawEstimateDraft = {
    title: "Interior paint",
    projectDescription: "A two-room interior repaint.",
    assumptions: ["Assumes two coats"],
    lineItems: [
      {
        costCodeId: "cc_paint_labor",
        groupLabel: "Painting",
        title: "Paint labor",
        description: "Two coats, walls and trim",
        quantity: 40,
        unit: "hr",
        unitCostDollars: 45,
        ratePercent: 20,
        rateMode: RateMode.MARKUP,
        confidence: "HIGH",
        priceSource: "MARKET_RATE",
      },
      {
        costCodeId: "cc_paint_mat",
        groupLabel: "Painting",
        title: "Paint materials",
        quantity: 12.5,
        unitCostDollars: 52.99,
        ratePercent: 10,
        rateMode: RateMode.MARKUP,
        confidence: "MEDIUM",
        priceSource: "CATALOG",
      },
    ],
    proposalSections: [{ title: "Painting", bullets: ["Paint two rooms, walls and trim, two coats"] }],
  };

  it("converts quantity to milli-units", () => {
    const draft = normalizeEstimateDraft(raw);
    expect(draft.lineItems[0].quantityMilli).toBe(40_000);
    expect(draft.lineItems[1].quantityMilli).toBe(12_500);
  });

  it("converts dollars to cents", () => {
    const draft = normalizeEstimateDraft(raw);
    expect(draft.lineItems[0].unitCostCents).toBe(4_500);
    expect(draft.lineItems[1].unitCostCents).toBe(5_299);
  });

  it("converts percent to basis points", () => {
    const draft = normalizeEstimateDraft(raw);
    expect(draft.lineItems[0].rateBasisPoints).toBe(2_000);
    expect(draft.lineItems[1].rateBasisPoints).toBe(1_000);
  });

  it("defaults a missing description to null, not undefined", () => {
    const draft = normalizeEstimateDraft(raw);
    expect(draft.lineItems[1].description).toBeNull();
  });

  it("carries the title, assumptions and per-line confidence/groupLabel/priceSource through unchanged", () => {
    const draft = normalizeEstimateDraft(raw);
    expect(draft.title).toBe("Interior paint");
    expect(draft.projectDescription).toBe("A two-room interior repaint.");
    expect(draft.assumptions).toEqual(["Assumes two coats"]);
    expect(draft.lineItems[0].confidence).toBe("HIGH");
    expect(draft.lineItems[0].groupLabel).toBe("Painting");
    expect(draft.lineItems[1].priceSource).toBe("CATALOG");
  });

  it("carries proposal sections through unchanged", () => {
    const draft = normalizeEstimateDraft(raw);
    expect(draft.proposalSections).toEqual([{ title: "Painting", bullets: ["Paint two rooms, walls and trim, two coats"] }]);
  });
});

describe("formatCostCodeCatalog", () => {
  it("renders one line per code with its id, code, name and cost type", () => {
    const text = formatCostCodeCatalog(CODES);
    expect(text).toContain("cc_paint_labor | PAINT-INT-L | Int Paint Labor | LABOR");
    expect(text.split("\n")).toHaveLength(2);
  });

  it("renders nothing for an empty catalog rather than throwing", () => {
    expect(formatCostCodeCatalog([])).toBe("");
  });
});

describe("formatMaterialCatalog", () => {
  it("renders one line per material with vendor, description, unit and price", () => {
    const text = formatMaterialCatalog([{ vendor: "LOWES", description: "2x6x8 SPF stud", unit: "EA", unitCostCents: 899 }]);
    expect(text).toBe("LOWES | 2x6x8 SPF stud | EA | $8.99");
  });

  it("renders a placeholder for an empty catalog rather than an empty string", () => {
    expect(formatMaterialCatalog([])).toBe("(no materials catalog entries yet)");
  });
});
