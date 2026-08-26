import { describe, expect, it } from "vitest";

import {
  bucketCashFlowByDay,
  buildCashFlowReport,
  computeBudgetedVsProjectedRow,
  computeInvoicingRow,
  computeLaborRow,
  computeProfitabilityRow,
  computeWipRow,
  sortByMarginAscending,
  type ProfitabilityRow,
} from "@/lib/reports/calc";

const JOB = { jobId: "job1", jobName: "283 Red Cedar" };

describe("computeWipRow", () => {
  it("computes percent complete and earned revenue proportionally", () => {
    const row = computeWipRow({
      ...JOB,
      revisedClientPriceCents: 200_000,
      actualCostCents: 50_000,
      projectedCostCents: 100_000,
      amountInvoicedCents: 0,
    });
    expect(row.percentCompleteBasisPoints).toBe(5_000); // 50%
    expect(row.earnedRevenueCents).toBe(100_000); // 50% of $2,000
  });

  it("flags overbilling when invoiced exceeds earned revenue", () => {
    const row = computeWipRow({
      ...JOB,
      revisedClientPriceCents: 200_000,
      actualCostCents: 25_000,
      projectedCostCents: 100_000,
      amountInvoicedCents: 150_000,
    });
    // 25% complete -> $500 earned, but $1,500 invoiced -> $1,000 overbilled.
    expect(row.overUnderBillingCents).toBe(100_000);
  });

  it("flags underbilling when invoiced trails earned revenue", () => {
    const row = computeWipRow({
      ...JOB,
      revisedClientPriceCents: 200_000,
      actualCostCents: 80_000,
      projectedCostCents: 100_000,
      amountInvoicedCents: 50_000,
    });
    // 80% complete -> $1,600 earned, only $500 invoiced -> $1,100 underbilled.
    expect(row.overUnderBillingCents).toBe(-110_000);
  });

  it("handles a job with no projected cost without dividing by zero", () => {
    const row = computeWipRow({
      ...JOB,
      revisedClientPriceCents: 0,
      actualCostCents: 0,
      projectedCostCents: 0,
      amountInvoicedCents: 0,
    });
    expect(row.percentCompleteBasisPoints).toBe(0);
    expect(row.earnedRevenueCents).toBe(0);
  });

  it("caps at effectively 100% when actual meets projected exactly", () => {
    const row = computeWipRow({
      ...JOB,
      revisedClientPriceCents: 200_000,
      actualCostCents: 100_000,
      projectedCostCents: 100_000,
      amountInvoicedCents: 200_000,
    });
    expect(row.percentCompleteBasisPoints).toBe(10_000);
    expect(row.earnedRevenueCents).toBe(200_000);
    expect(row.overUnderBillingCents).toBe(0);
  });
});

describe("computeBudgetedVsProjectedRow", () => {
  it("reports a positive variance when under budget", () => {
    const row = computeBudgetedVsProjectedRow({
      ...JOB,
      originalBudgetCostCents: 100_000,
      revisedBudgetCostCents: 100_000,
      projectedCostCents: 90_000,
    });
    expect(row.varianceCents).toBe(10_000);
    expect(row.isOverBudget).toBe(false);
  });

  it("reports a negative variance and flags over-budget when projected exceeds revised", () => {
    const row = computeBudgetedVsProjectedRow({
      ...JOB,
      originalBudgetCostCents: 100_000,
      revisedBudgetCostCents: 100_000,
      projectedCostCents: 115_000,
    });
    expect(row.varianceCents).toBe(-15_000);
    expect(row.isOverBudget).toBe(true);
  });
});

describe("computeProfitabilityRow and sortByMarginAscending", () => {
  it("computes profit and margin", () => {
    const row = computeProfitabilityRow({ ...JOB, revisedClientPriceCents: 120_000, projectedCostCents: 100_000 });
    expect(row.projectedProfitCents).toBe(20_000);
    expect(row.projectedMarginBasisPoints).toBe(1_667);
  });

  it("sorts the worst-margin job first", () => {
    const rows: ProfitabilityRow[] = [
      computeProfitabilityRow({ jobId: "a", jobName: "A", revisedClientPriceCents: 120_000, projectedCostCents: 100_000 }),
      computeProfitabilityRow({ jobId: "b", jobName: "B", revisedClientPriceCents: 100_000, projectedCostCents: 110_000 }),
      computeProfitabilityRow({ jobId: "c", jobName: "C", revisedClientPriceCents: 150_000, projectedCostCents: 100_000 }),
    ];
    const sorted = sortByMarginAscending(rows);
    expect(sorted.map((r) => r.jobId)).toEqual(["b", "a", "c"]);
  });
});

describe("computeInvoicingRow", () => {
  it("computes outstanding as invoiced minus paid", () => {
    const row = computeInvoicingRow({
      ...JOB,
      revisedClientPriceCents: 200_000,
      amountInvoicedCents: 100_000,
      remainingToInvoiceCents: 100_000,
      totalPaidCents: 60_000,
    });
    expect(row.outstandingCents).toBe(40_000);
  });
});

describe("computeLaborRow", () => {
  it("flags over-budget labor", () => {
    const row = computeLaborRow({ ...JOB, budgetedLaborCostCents: 100_000, approvedLaborCostCents: 120_000 });
    expect(row.varianceCents).toBe(-20_000);
    expect(row.isOverBudget).toBe(true);
  });

  it("reports favorable variance when under budget", () => {
    const row = computeLaborRow({ ...JOB, budgetedLaborCostCents: 100_000, approvedLaborCostCents: 80_000 });
    expect(row.varianceCents).toBe(20_000);
    expect(row.isOverBudget).toBe(false);
  });
});

describe("bucketCashFlowByDay", () => {
  it("buckets events onto the correct day", () => {
    const days = bucketCashFlowByDay(
      "2026-01-01",
      3,
      [{ date: "2026-01-01", amountCents: 50_000 }],
      [{ date: "2026-01-02", amountCents: 20_000 }],
    );
    expect(days).toHaveLength(3);
    expect(days[0]).toEqual({ date: "2026-01-01", cashInCents: 50_000, cashOutCents: 0, netCents: 50_000 });
    expect(days[1]).toEqual({ date: "2026-01-02", cashInCents: 0, cashOutCents: 20_000, netCents: -20_000 });
    expect(days[2]).toEqual({ date: "2026-01-03", cashInCents: 0, cashOutCents: 0, netCents: 0 });
  });

  it("fills quiet days as zero rather than omitting them", () => {
    const days = bucketCashFlowByDay("2026-01-01", 5, [], []);
    expect(days).toHaveLength(5);
    expect(days.every((d) => d.netCents === 0)).toBe(true);
  });

  it("sums multiple events on the same day", () => {
    const days = bucketCashFlowByDay(
      "2026-01-01",
      1,
      [
        { date: "2026-01-01", amountCents: 10_000 },
        { date: "2026-01-01", amountCents: 15_000 },
      ],
      [],
    );
    expect(days[0].cashInCents).toBe(25_000);
  });
});

describe("buildCashFlowReport", () => {
  it("sums the historical net and carries the projection through", () => {
    const historical = bucketCashFlowByDay(
      "2026-01-01",
      2,
      [{ date: "2026-01-01", amountCents: 50_000 }],
      [{ date: "2026-01-02", amountCents: 20_000 }],
    );
    const report = buildCashFlowReport(historical, { projectedCashInCents: 500_000, projectedCashOutCents: 300_000 });
    expect(report.historicalNetCents).toBe(30_000);
    expect(report.projection.projectedCashInCents).toBe(500_000);
    expect(report.projection.projectedCashOutCents).toBe(300_000);
  });
});
