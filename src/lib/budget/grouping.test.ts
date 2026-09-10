import { describe, expect, it } from "vitest";

import { computeFunnelLine, type BudgetLineInput } from "@/lib/budget/funnel";
import { UNGROUPED_KEY, groupFunnelLines, type CostCodeLookupEntry } from "@/lib/budget/grouping";

const budgetLine = (costCodeId: string, cost: number, price: number): BudgetLineInput => ({
  costCodeId,
  originalBudgetCostCents: cost,
  revisedBudgetCostCents: cost,
  originalClientPriceCents: price,
  revisedClientPriceCents: price,
  rateMode: "MARKUP",
  rateBasisPoints: 2_000,
});

const CONCRETE = { id: "g-concrete", code: "02", name: "Concrete/ Foundations" };
const PAINTING = { id: "g-painting", code: "05", name: "Painting" };

const COST_CODES: Record<string, CostCodeLookupEntry> = {
  "02-labor": { code: "02-CONCRETE-LABOR", name: "Concrete Labor", group: CONCRETE },
  "02-material": { code: "02-CONCRETE-MATERIAL", name: "Concrete Material", group: CONCRETE },
  "05-labor": { code: "05-PAINT-LABOR", name: "Paint Labor", group: PAINTING },
  orphan: { code: "99-MISC", name: "Miscellaneous", group: null },
};

/** $500 concrete labor, $1,500 concrete material, $1,000 paint, $200 unparented. */
const LINES = [
  computeFunnelLine(budgetLine("02-labor", 50_000, 60_000), [], []),
  computeFunnelLine(budgetLine("02-material", 150_000, 180_000), [], []),
  computeFunnelLine(budgetLine("05-labor", 100_000, 120_000), [], []),
  computeFunnelLine(budgetLine("orphan", 20_000, 24_000), [], []),
];

describe("grouping budget lines by parent cost code", () => {
  it("puts each line under its parent and orders groups by code", () => {
    const groups = groupFunnelLines(LINES, COST_CODES);
    expect(groups.map((group) => group.name)).toEqual(["Concrete/ Foundations", "Painting", "Ungrouped"]);
    expect(groups[0].lines.map((entry) => entry.name)).toEqual(["Concrete Labor", "Concrete Material"]);
  });

  it("subtotals each group from its own lines", () => {
    const [concrete] = groupFunnelLines(LINES, COST_CODES);
    expect(concrete.subtotal.revisedBudgetCostCents).toBe(200_000);
    expect(concrete.subtotal.revisedClientPriceCents).toBe(240_000);
    expect(concrete.subtotal.projectedProfitCents).toBe(40_000);
  });

  it("recomputes a group's margin rather than averaging its lines'", () => {
    // A $1,000 line at 50% margin and a $50,555 line at 10% average to 30%, but the
    // group really runs at 10.7% — weighting by size is the point of recomputing.
    const lines = [
      computeFunnelLine(budgetLine("02-labor", 50_000, 100_000), [], []),
      computeFunnelLine(budgetLine("02-material", 5_000_000, 5_555_556), [], []),
    ];
    const [concrete] = groupFunnelLines(lines, COST_CODES);
    expect(concrete.subtotal.projectedMarginBasisPoints).toBe(1_071);
  });

  it("keeps unparented lines in their own group rather than dropping them", () => {
    const groups = groupFunnelLines(LINES, COST_CODES);
    const ungrouped = groups.find((group) => group.key === UNGROUPED_KEY);
    expect(ungrouped?.subtotal.revisedBudgetCostCents).toBe(20_000);
  });

  it("keeps a line whose cost code isn't in the lookup at all", () => {
    const groups = groupFunnelLines(LINES, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNGROUPED_KEY);
    expect(groups[0].subtotal.revisedBudgetCostCents).toBe(320_000);
    expect(groups[0].lines[0].name).toBe("Unknown cost code");
  });

  it("flags a group containing an over-budget line", () => {
    const overspent = computeFunnelLine(budgetLine("05-labor", 100_000, 120_000), [], [
      { costCodeId: "05-labor", approvalStatus: "PAID", amountCents: 150_000 },
    ]);
    const groups = groupFunnelLines([overspent], COST_CODES);
    expect(groups[0].hasOverBudgetLine).toBe(true);
  });

  it("has nothing to group when the job has no budget lines", () => {
    expect(groupFunnelLines([], COST_CODES)).toEqual([]);
  });
});
