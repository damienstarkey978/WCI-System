import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";

import type { FunnelLine, JobFunnel } from "@/lib/budget/funnel";
import type { JobBudgetView } from "@/lib/budget/service";
import {
  buildScopeOfValuesFromBudget,
  composeScopeOfValuesPdf,
  sovSectionKeyForCostCode,
} from "@/lib/permitting/scope-of-values";

function line(partial: Partial<FunnelLine> & Pick<FunnelLine, "costCodeId">): FunnelLine {
  return {
    originalBudgetCostCents: 0,
    revisedBudgetCostCents: 0,
    pendingCostCents: 0,
    committedCostCents: 0,
    actualCostCents: 0,
    projectedCostCents: 0,
    costToCompleteCents: 0,
    originalClientPriceCents: 0,
    revisedClientPriceCents: 0,
    projectedProfitCents: 0,
    projectedMarginBasisPoints: 0,
    isOverBudget: false,
    varianceCents: 0,
    isUnbudgeted: false,
    ...partial,
  };
}

function fakeBudget(overrides?: Partial<JobBudgetView>): JobBudgetView {
  const funnel: JobFunnel = {
    lines: [
      line({
        costCodeId: "cc_paint",
        originalBudgetCostCents: 100_000,
        revisedBudgetCostCents: 120_000,
        projectedCostCents: 120_000,
        costToCompleteCents: 120_000,
        originalClientPriceCents: 150_000,
        revisedClientPriceCents: 160_000,
        projectedProfitCents: 40_000,
      }),
      line({
        costCodeId: "cc_elec",
        originalBudgetCostCents: 50_000,
        revisedBudgetCostCents: 50_000,
        projectedCostCents: 50_000,
        costToCompleteCents: 50_000,
        originalClientPriceCents: 70_000,
        revisedClientPriceCents: 70_000,
        projectedProfitCents: 20_000,
      }),
    ],
    totals: {
      originalBudgetCostCents: 150_000,
      revisedBudgetCostCents: 170_000,
      pendingCostCents: 0,
      committedCostCents: 0,
      actualCostCents: 0,
      projectedCostCents: 170_000,
      costToCompleteCents: 170_000,
      originalClientPriceCents: 220_000,
      revisedClientPriceCents: 230_000,
      projectedProfitCents: 60_000,
      projectedMarginBasisPoints: 0,
      amountInvoicedCents: 0,
      remainingToInvoiceCents: 230_000,
    },
  };

  return {
    job: {
      id: "job_1",
      name: "4212 Robin Hood Addition",
      contractType: "FIXED_PRICE",
      status: "OPEN",
      projectionReference: "GREATEST",
      accountingBasis: "ACCRUAL",
    },
    funnel,
    costCodes: {
      cc_paint: {
        code: "05-LABOR",
        name: "Int Paint Labor",
        group: { id: "g5", code: "05", name: "Painting" },
        defaultCostType: "LABOR",
      },
      cc_elec: {
        code: "12-MAT",
        name: "Electrical Materials",
        group: { id: "g12", code: "12", name: "Electrical" },
        defaultCostType: "MATERIAL",
      },
    },
    columns: [],
    costTypeTotals: [],
    sourceEstimate: {
      id: "est_1",
      title: "Addition estimate",
      sentToBudgetAt: "2026-11-01T00:00:00Z",
    },
    ...overrides,
  };
}

describe("sovSectionKeyForCostCode", () => {
  it("uses parent group as the trade section when present", () => {
    expect(
      sovSectionKeyForCostCode({
        code: "05-LABOR",
        name: "Int Paint Labor",
        parentCode: "05",
        parentName: "Painting",
      }),
    ).toEqual({ key: "05", title: "Painting" });
  });

  it("falls back to the leaf code when ungrouped", () => {
    expect(
      sovSectionKeyForCostCode({
        code: "MISC",
        name: "Misc",
        parentCode: null,
        parentName: null,
      }),
    ).toEqual({ key: "MISC", title: "Misc" });
  });
});

describe("buildScopeOfValuesFromBudget", () => {
  it("groups revised budget amounts by parent cost-code section", () => {
    const data = buildScopeOfValuesFromBudget(fakeBudget());
    expect(data.emptyBudget).toBe(false);
    expect(data.sections.map((s) => s.key)).toEqual(["05", "12"]);
    expect(data.sections[0].subtotalCents).toBe(120_000);
    expect(data.sections[1].subtotalCents).toBe(50_000);
    expect(data.grandTotalCents).toBe(170_000);
    expect(data.sourceEstimateTitle).toBe("Addition estimate");
  });

  it("can use revised client price instead of budget cost", () => {
    const data = buildScopeOfValuesFromBudget(fakeBudget(), "revisedClientPrice");
    expect(data.grandTotalCents).toBe(230_000);
  });

  it("marks empty when no non-zero amounts exist", () => {
    const budget = fakeBudget({
      funnel: {
        ...fakeBudget().funnel,
        lines: [],
        totals: {
          originalBudgetCostCents: 0,
          revisedBudgetCostCents: 0,
          pendingCostCents: 0,
          committedCostCents: 0,
          actualCostCents: 0,
          projectedCostCents: 0,
          costToCompleteCents: 0,
          originalClientPriceCents: 0,
          revisedClientPriceCents: 0,
          projectedProfitCents: 0,
          projectedMarginBasisPoints: 0,
          amountInvoicedCents: 0,
          remainingToInvoiceCents: 0,
        },
      },
    });
    const data = buildScopeOfValuesFromBudget(budget);
    expect(data.emptyBudget).toBe(true);
    expect(data.grandTotalCents).toBe(0);
  });
});

describe("composeScopeOfValuesPdf", () => {
  it("produces a PDF with at least one page", async () => {
    const bytes = await composeScopeOfValuesPdf(
      {
        packageName: "4212 Robin Hood Addition",
        propertyAddress: "4212 Robin Hood Rd",
        taxFolio: "100804-0000",
        owner: { name: "Owner", mailingAddress: "", phone: "", cellPhone: "", email: "" },
      },
      buildScopeOfValuesFromBudget(fakeBudget()),
    );
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
