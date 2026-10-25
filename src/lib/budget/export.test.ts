import { describe, expect, it } from "vitest";

import { budgetToCsv, csvEscape } from "./export";

describe("csvEscape", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("a\nb")).toBe('"a\nb"');
  });
});

describe("budgetToCsv", () => {
  const totals = {
    originalBudgetCostCents: 100_000,
    revisedBudgetCostCents: 100_000,
    pendingCostCents: 0,
    committedCostCents: 50_000,
    actualCostCents: 25_050,
    projectedCostCents: 100_000,
    costToCompleteCents: 74_950,
    originalClientPriceCents: 125_000,
    revisedClientPriceCents: 125_000,
    projectedProfitCents: 25_000,
    projectedMarginBasisPoints: 2_000,
    amountInvoicedCents: 40_000,
    remainingToInvoiceCents: 85_000,
  };
  const line = { ...totals, costCodeId: "c1", isOverBudget: false, varianceCents: 0, isUnbudgeted: false };

  it("writes dollars with two decimals, a group subtotal and a totals row with invoicing", () => {
    const csv = budgetToCsv({
      groups: [{ key: "g", code: "02", name: "Concrete, Foundations", lines: [{ line, code: "02-L", name: "Labor" }], subtotal: totals, hasOverBudgetLine: false }],
      totals,
      columns: ["revisedBudgetCost", "actualCost", "amountInvoiced", "projectedMarginPct"],
    });
    const rows = csv.trim().split("\r\n");
    expect(rows[0]).toBe("Cost code,Description,Row type,Revised budget,Actual cost,Amount invoiced,Margin");
    expect(rows[1]).toBe("02-L,Labor,Line,1000.00,250.50,,20.0");
    expect(rows[2]).toBe('02,"Concrete, Foundations",Group subtotal,1000.00,250.50,,20.0');
    expect(rows[3]).toBe(",Total,Total,1000.00,250.50,400.00,20.0");
  });
});
