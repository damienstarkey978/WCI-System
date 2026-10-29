import { describe, expect, it } from "vitest";

import { computeFunnelLine, type BudgetLineInput } from "@/lib/budget/funnel";
import {
  costTypeForLine,
  rollUpByCostType,
  spendPercent,
  spendVarianceCents,
} from "@/lib/budget/cost-types";
import type { CostCodeLookupEntry } from "@/lib/budget/grouping";

const budget = (costCodeId: string, cost: number): BudgetLineInput => ({
  costCodeId,
  originalBudgetCostCents: cost,
  revisedBudgetCostCents: cost,
  originalClientPriceCents: cost,
  revisedClientPriceCents: cost,
  rateMode: "MARKUP",
  rateBasisPoints: 0,
});

const COST_CODES: Record<string, CostCodeLookupEntry> = {
  labor: {
    code: "03-SIDING-LABOR",
    name: "Siding Labor",
    group: { id: "g3", code: "03", name: "Siding/ Soffit" },
    defaultCostType: "LABOR",
  },
  material: {
    code: "03-SIDING-MATERIALS",
    name: "Siding Materials",
    group: { id: "g3", code: "03", name: "Siding/ Soffit" },
    defaultCostType: "MATERIAL",
  },
};

describe("spendVarianceCents", () => {
  it("is revised budget minus actual", () => {
    expect(spendVarianceCents({ revisedBudgetCostCents: 100_000, actualCostCents: 40_000 })).toBe(60_000);
  });

  it("goes negative when actual exceeds budget", () => {
    expect(spendVarianceCents({ revisedBudgetCostCents: 100_000, actualCostCents: 150_000 })).toBe(-50_000);
  });
});

describe("spendPercent", () => {
  it("returns null when there is no budget", () => {
    expect(spendPercent({ revisedBudgetCostCents: 0, actualCostCents: 50_000 })).toBeNull();
  });

  it("rounds percent of budget spent", () => {
    expect(spendPercent({ revisedBudgetCostCents: 100_000, actualCostCents: 33_000 })).toBe(33);
  });
});

describe("rollUpByCostType", () => {
  it("splits labor and materials budgets and actuals", () => {
    const labor = computeFunnelLine(budget("labor", 200_000), [], [
      { costCodeId: "labor", approvalStatus: "PAID", amountCents: 50_000 },
    ]);
    const material = computeFunnelLine(budget("material", 100_000), [], [
      { costCodeId: "material", approvalStatus: "PAID", amountCents: 120_000 },
    ]);

    const totals = rollUpByCostType([labor, material], COST_CODES);
    expect(totals.map((t) => t.costType)).toEqual(["LABOR", "MATERIAL"]);

    const laborTotal = totals.find((t) => t.costType === "LABOR")!;
    expect(laborTotal.revisedBudgetCostCents).toBe(200_000);
    expect(laborTotal.actualCostCents).toBe(50_000);
    expect(laborTotal.isOverBudget).toBe(false);
    expect(laborTotal.spendVarianceCents).toBe(150_000);

    const materialTotal = totals.find((t) => t.costType === "MATERIAL")!;
    expect(materialTotal.actualCostCents).toBe(120_000);
    expect(materialTotal.isOverBudget).toBe(true);
    expect(materialTotal.spendVarianceCents).toBe(-20_000);
  });

  it("reads cost type from the cost-code catalog", () => {
    const line = computeFunnelLine(budget("labor", 10_000), [], []);
    expect(costTypeForLine(line, COST_CODES)).toBe("LABOR");
    expect(costTypeForLine(line, {})).toBe("NONE");
  });
});
