import { describe, expect, it } from "vitest";

import { purchaseOrdersToCsv } from "./export-csv";

describe("purchaseOrdersToCsv", () => {
  it("exports Standard View columns with escaped cells", () => {
    const csv = purchaseOrdersToCsv([
      {
        jobName: '457 Roserush, "ADU"',
        poNumber: "11",
        poSuffix: null,
        title: "Drywall Labor",
        status: "DRAFT",
        workStatus: "NOT_COMPLETE",
        vendorName: "Unassigned",
        createdAt: "2026-10-26T12:00:00.000Z",
        totalCents: 400000,
      },
    ]);
    expect(csv).toContain("Job,PO #,Title,PO Status,Work Status,Performed By,Created Date,Total");
    expect(csv).toContain('"457 Roserush, ""ADU"""');
    expect(csv).toContain("0011");
    expect(csv).toContain("Drywall Labor");
    expect(csv).toContain("Draft");
    expect(csv).toContain("Not Complete");
    expect(csv).toContain("$4,000.00");
  });
});
