import { describe, expect, it } from "vitest";

import { FINANCIAL_NAV, JOBS_NAV } from "@/lib/buildertrend-nav";

describe("FINANCIAL_NAV", () => {
  it("exposes Budget (commitment funnel) and not Estimate builder", () => {
    const labels = FINANCIAL_NAV.map((item) => item.label);
    expect(labels).toContain("Budget");
    expect(labels).not.toContain("Estimate");
    expect(labels).not.toContain("Job Costing Budget");

    const budget = FINANCIAL_NAV.find((item) => item.label === "Budget");
    expect(budget?.path).toBe("/budget");
  });

  it("keeps Bills, Purchase Orders, and Invoices as sibling Financial routes", () => {
    const byLabel = Object.fromEntries(FINANCIAL_NAV.map((item) => [item.label, item.path]));
    expect(byLabel["Purchase Orders"]).toBe("/purchase-orders");
    expect(byLabel.Bills).toBe("/bills");
    expect(byLabel.Invoices).toBe("/invoices");
  });
});

describe("JOBS_NAV", () => {
  it("still deep-links Job Price Summary to the same budget page", () => {
    const priceSummary = JOBS_NAV.find((item) => item.label === "Job Price Summary");
    expect(priceSummary).toMatchObject({ kind: "job", jobPath: "/budget" });
  });
});
