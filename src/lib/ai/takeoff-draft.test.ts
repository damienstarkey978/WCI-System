import { describe, expect, it } from "vitest";

import {
  buildTakeoffDraftSchema,
  EmptyCostCodeCatalogError,
  normalizeTakeoffDraft,
} from "@/lib/ai/takeoff-draft";

const CODES = ["cc_paint_mat", "cc_floor", "cc_frame"] as const;

describe("takeoff draft schema", () => {
  it("rejects an empty cost-code catalog", () => {
    expect(() => buildTakeoffDraftSchema([])).toThrow(EmptyCostCodeCatalogError);
  });

  it("rejects a hallucinated cost code", () => {
    const schema = buildTakeoffDraftSchema(CODES);
    const result = schema.safeParse({
      title: "Flooring takeoff",
      assumptions: [],
      lineItems: [
        {
          costCodeId: "not-a-real-code",
          groupLabel: "Flooring",
          title: "LVP",
          quantity: 100,
          unit: "sqft",
          unitCostDollars: 3.5,
          confidence: "HIGH",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("normalizes quantities to milli and dollars to cents", () => {
    const schema = buildTakeoffDraftSchema(CODES);
    const raw = schema.parse({
      title: "Main takeoff",
      assumptions: ["Verify waste on plans"],
      lineItems: [
        {
          costCodeId: "cc_floor",
          groupLabel: "Flooring",
          title: "LVP main level",
          description: "Includes 10% waste",
          quantity: 1.25,
          unit: "sqft",
          unitCostDollars: 3.5,
          confidence: "MEDIUM",
        },
      ],
    });
    const normalized = normalizeTakeoffDraft(raw);
    expect(normalized.lineItems[0].quantityMilli).toBe(1_250);
    expect(normalized.lineItems[0].unitCostCents).toBe(350);
    expect(normalized.assumptions).toEqual(["Verify waste on plans"]);
  });
});
