import { describe, expect, it } from "vitest";

import { ContractType } from "@/generated/prisma/enums";
import {
  clientPriceForLine,
  computeFunnelLine,
  computeJobFunnel,
  extendedCostCents,
  priceWithRate,
  selectProjectedCost,
  type BillCostInput,
  type BudgetLineInput,
  type PurchaseOrderCostInput,
} from "@/lib/budget/funnel";

/** $1,000 budgeted for interior paint labor at a 20% markup. */
const PAINT: BudgetLineInput = {
  costCodeId: "paint",
  originalBudgetCostCents: 100_000,
  revisedBudgetCostCents: 100_000,
  originalClientPriceCents: 120_000,
  revisedClientPriceCents: 120_000,
  rateMode: "MARKUP",
  rateBasisPoints: 2_000,
};

const line = (
  budget: BudgetLineInput = PAINT,
  pos: readonly PurchaseOrderCostInput[] = [],
  bills: readonly BillCostInput[] = [],
  options = {},
) => computeFunnelLine(budget, pos, bills, [], options);

describe("an untouched budget line", () => {
  it("projects at the budget with nothing spent or committed", () => {
    const result = line();
    expect(result.pendingCostCents).toBe(0);
    expect(result.committedCostCents).toBe(0);
    expect(result.actualCostCents).toBe(0);
    expect(result.projectedCostCents).toBe(100_000);
    expect(result.costToCompleteCents).toBe(100_000);
  });

  it("shows the full budgeted profit", () => {
    expect(line().projectedProfitCents).toBe(20_000);
  });
});

describe("pending vs committed", () => {
  it("counts an unapproved PO as pending, not committed", () => {
    const result = line(PAINT, [{ costCodeId: "paint", status: "PENDING_APPROVAL", amountCents: 90_000 }]);
    expect(result.pendingCostCents).toBe(90_000);
    expect(result.committedCostCents).toBe(0);
  });

  it("counts a draft PO as pending", () => {
    const result = line(PAINT, [{ costCodeId: "paint", status: "DRAFT", amountCents: 90_000 }]);
    expect(result.pendingCostCents).toBe(90_000);
  });

  it("moves a PO from pending to committed on approval", () => {
    const result = line(PAINT, [{ costCodeId: "paint", status: "APPROVED", amountCents: 90_000 }]);
    expect(result.pendingCostCents).toBe(0);
    expect(result.committedCostCents).toBe(90_000);
  });

  it("counts a completed PO as committed", () => {
    const result = line(PAINT, [{ costCodeId: "paint", status: "COMPLETED", amountCents: 90_000 }]);
    expect(result.committedCostCents).toBe(90_000);
  });

  it("ignores declined and cancelled POs entirely", () => {
    const result = line(PAINT, [
      { costCodeId: "paint", status: "DECLINED", amountCents: 50_000 },
      { costCodeId: "paint", status: "CANCELLED", amountCents: 50_000 },
    ]);
    expect(result.pendingCostCents).toBe(0);
    expect(result.committedCostCents).toBe(0);
  });

  it("counts unapproved labor as committed — the money is owed either way", () => {
    const result = computeFunnelLine(
      PAINT,
      [{ costCodeId: "paint", status: "APPROVED", amountCents: 60_000 }],
      [],
      [{ costCodeId: "paint", amountCents: 15_000 }],
    );
    expect(result.committedCostCents).toBe(75_000);
  });
});

describe("actual cost and accounting basis", () => {
  const bills: readonly BillCostInput[] = [
    { costCodeId: "paint", approvalStatus: "PAID", amountCents: 40_000 },
    { costCodeId: "paint", approvalStatus: "APPROVED", amountCents: 25_000 },
    { costCodeId: "paint", approvalStatus: "IN_REVIEW", amountCents: 10_000 },
  ];

  it("accrual counts open and paid bills", () => {
    expect(line(PAINT, [], bills, { accountingBasis: "ACCRUAL" }).actualCostCents).toBe(75_000);
  });

  it("cash counts only paid bills", () => {
    expect(line(PAINT, [], bills, { accountingBasis: "CASH" }).actualCostCents).toBe(40_000);
  });

  it("defaults to accrual", () => {
    expect(line(PAINT, [], bills).actualCostCents).toBe(75_000);
  });

  it("never counts a void bill, on either basis", () => {
    const withVoid = [...bills, { costCodeId: "paint", approvalStatus: "VOID" as const, amountCents: 99_999 }];
    expect(line(PAINT, [], withVoid, { accountingBasis: "ACCRUAL" }).actualCostCents).toBe(75_000);
    expect(line(PAINT, [], withVoid, { accountingBasis: "CASH" }).actualCostCents).toBe(40_000);
  });
});

describe("the layers overlap and must never be summed", () => {
  it("does not double-count a PO that has been fully billed", () => {
    // $900 PO, approved, fully billed. The job cost $900 — not $1,800.
    const result = line(
      PAINT,
      [{ costCodeId: "paint", status: "APPROVED", amountCents: 90_000 }],
      [{ costCodeId: "paint", approvalStatus: "APPROVED", amountCents: 90_000 }],
    );
    expect(result.committedCostCents).toBe(90_000);
    expect(result.actualCostCents).toBe(90_000);
    expect(result.projectedCostCents).toBe(100_000); // still the budget, which is higher
    expect(result.projectedCostCents).not.toBe(180_000);
  });

  it("projects at actual once spending passes the budget and the commitment", () => {
    const result = line(
      PAINT,
      [{ costCodeId: "paint", status: "APPROVED", amountCents: 90_000 }],
      [{ costCodeId: "paint", approvalStatus: "APPROVED", amountCents: 130_000 }],
    );
    expect(result.projectedCostCents).toBe(130_000);
    expect(result.costToCompleteCents).toBe(0);
    expect(result.isOverBudget).toBe(true);
    expect(result.varianceCents).toBe(-30_000);
  });

  it("projects at the commitment when a PO exceeds the budget before any bill lands", () => {
    const result = line(PAINT, [{ costCodeId: "paint", status: "APPROVED", amountCents: 115_000 }]);
    expect(result.projectedCostCents).toBe(115_000);
    expect(result.costToCompleteCents).toBe(115_000);
    expect(result.isOverBudget).toBe(true);
  });

  it("never reports a negative cost to complete", () => {
    const result = line(PAINT, [], [{ costCodeId: "paint", approvalStatus: "PAID", amountCents: 150_000 }], {
      projectionReference: "REVISED_BUDGET",
    });
    expect(result.costToCompleteCents).toBe(0);
  });
});

describe("projection reference", () => {
  const layers = { revised: 100_000, committed: 115_000, actual: 90_000 };

  it("GREATEST takes the worst known number", () => {
    expect(selectProjectedCost(layers, "GREATEST")).toBe(115_000);
  });

  it("REVISED_BUDGET reports against the budget", () => {
    expect(selectProjectedCost(layers, "REVISED_BUDGET")).toBe(100_000);
  });

  it("COMMITTED reports against commitments", () => {
    expect(selectProjectedCost(layers, "COMMITTED")).toBe(115_000);
  });

  it("ACTUAL reports only what has been spent", () => {
    expect(selectProjectedCost(layers, "ACTUAL")).toBe(90_000);
  });

  it("never projects below actual, whatever the reference — spent money is gone", () => {
    const overspent = { revised: 100_000, committed: 90_000, actual: 140_000 };
    expect(selectProjectedCost(overspent, "REVISED_BUDGET")).toBe(140_000);
    expect(selectProjectedCost(overspent, "COMMITTED")).toBe(140_000);
    expect(selectProjectedCost(overspent, "GREATEST")).toBe(140_000);
  });
});

describe("cost codes stay isolated", () => {
  it("ignores POs and bills belonging to another cost code", () => {
    const result = line(
      PAINT,
      [{ costCodeId: "flooring", status: "APPROVED", amountCents: 500_000 }],
      [{ costCodeId: "flooring", approvalStatus: "PAID", amountCents: 500_000 }],
    );
    expect(result.committedCostCents).toBe(0);
    expect(result.actualCostCents).toBe(0);
    expect(result.projectedCostCents).toBe(100_000);
  });
});

describe("job-level rollup", () => {
  const flooring: BudgetLineInput = {
    costCodeId: "flooring",
    originalBudgetCostCents: 200_000,
    revisedBudgetCostCents: 250_000, // a change order raised it
    originalClientPriceCents: 240_000,
    revisedClientPriceCents: 300_000,
    rateMode: "MARKUP",
    rateBasisPoints: 2_000,
  };

  const funnel = computeJobFunnel(
    [PAINT, flooring],
    [
      { costCodeId: "paint", status: "APPROVED", amountCents: 95_000 },
      { costCodeId: "flooring", status: "PENDING_APPROVAL", amountCents: 240_000 },
    ],
    [{ costCodeId: "paint", approvalStatus: "PAID", amountCents: 95_000 }],
  );

  it("totals each layer across cost codes", () => {
    expect(funnel.totals.originalBudgetCostCents).toBe(300_000);
    expect(funnel.totals.revisedBudgetCostCents).toBe(350_000);
    expect(funnel.totals.pendingCostCents).toBe(240_000);
    expect(funnel.totals.committedCostCents).toBe(95_000);
    expect(funnel.totals.actualCostCents).toBe(95_000);
  });

  it("totals projected cost per line rather than projecting the totals", () => {
    // paint projects at 100_000 (budget still highest), flooring at 250_000.
    expect(funnel.totals.projectedCostCents).toBe(350_000);
  });

  it("computes job profit from the revised client price", () => {
    expect(funnel.totals.revisedClientPriceCents).toBe(420_000);
    expect(funnel.totals.projectedProfitCents).toBe(70_000);
  });

  it("returns one line per budget row", () => {
    expect(funnel.lines).toHaveLength(2);
    expect(funnel.lines.map((l) => l.costCodeId)).toEqual(["paint", "flooring"]);
  });

  it("handles a job with no budget lines without dividing by zero", () => {
    const empty = computeJobFunnel([], [], []);
    expect(empty.totals.projectedCostCents).toBe(0);
    expect(empty.totals.projectedMarginBasisPoints).toBe(0);
  });
});

describe("contract type drives what the client is billed", () => {
  // Budgeted $1,000, actually spent $1,300 — a 30% overrun.
  const overrun = line(
    PAINT,
    [],
    [{ costCodeId: "paint", approvalStatus: "APPROVED", amountCents: 130_000 }],
  );

  it("fixed price holds the client price and eats the overrun", () => {
    const price = clientPriceForLine(ContractType.FIXED_PRICE, overrun, "MARKUP", 2_000);
    expect(price).toBe(120_000);
    expect(price - overrun.actualCostCents).toBe(-10_000); // a real loss
  });

  it("open book passes the overrun through and keeps the margin", () => {
    const price = clientPriceForLine(ContractType.OPEN_BOOK, overrun, "MARKUP", 2_000);
    expect(price).toBe(156_000);
    expect(price - overrun.actualCostCents).toBe(26_000);
  });

  it("agrees when the job lands exactly on budget", () => {
    const onBudget = line(PAINT, [], [{ costCodeId: "paint", approvalStatus: "PAID", amountCents: 100_000 }]);
    expect(clientPriceForLine(ContractType.FIXED_PRICE, onBudget, "MARKUP", 2_000)).toBe(
      clientPriceForLine(ContractType.OPEN_BOOK, onBudget, "MARKUP", 2_000),
    );
  });
});

describe("line arithmetic", () => {
  it("extends fractional quantities without floating-point drift", () => {
    expect(extendedCostCents(2_500, 1_000)).toBe(2_500); // 2.5 × $10.00 = $25.00
    expect(extendedCostCents(1_000, 3_333)).toBe(3_333);
    expect(extendedCostCents(333, 10_000)).toBe(3_330); // 0.333 × $100 = $33.30
  });

  it("rounds a half cent away from zero", () => {
    expect(extendedCostCents(1_500, 1_667)).toBe(2_501); // 1.5 × 1667 = 2500.5
  });

  it("prices with markup or margin per the chosen mode", () => {
    expect(priceWithRate(100_000, "MARKUP", 2_000)).toBe(120_000);
    expect(priceWithRate(100_000, "MARGIN", 2_000)).toBe(125_000);
  });
});

describe("margin reporting", () => {
  it("reports the realised margin against projected cost", () => {
    expect(line().projectedMarginBasisPoints).toBe(1_667); // 20k profit on 120k price
  });

  it("reports a negative margin on a loss-making line", () => {
    const result = line(PAINT, [], [{ costCodeId: "paint", approvalStatus: "PAID", amountCents: 150_000 }]);
    expect(result.projectedProfitCents).toBe(-30_000);
    expect(result.projectedMarginBasisPoints).toBeLessThan(0);
  });
});
