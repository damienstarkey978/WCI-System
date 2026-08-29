import { describe, expect, it } from "vitest";

import { buildComparisonContextText, computeBidComparison } from "@/lib/bids/comparison";

const LINE_ITEMS = [
  { id: "line-1", title: "Framing labor", unit: "hr", quantityMilli: 40_000 },
  { id: "line-2", title: "Lumber", unit: "ea", quantityMilli: 1_000 },
];

describe("computeBidComparison", () => {
  it("computes an itemized vendor's total as the sum of their extended line costs", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      {
        id: "sub-1",
        vendorName: "Acme Framing",
        status: "SUBMITTED",
        totalCents: null,
        notes: null,
        lineItems: [
          { bidPackageLineItemId: "line-1", title: "Framing labor", quantityMilli: 40_000, unitCostCents: 5_000 },
          { bidPackageLineItemId: "line-2", title: "Lumber", quantityMilli: 1_000, unitCostCents: 200_000 },
        ],
      },
    ]);

    expect(result.columns[0].isItemized).toBe(true);
    expect(result.columns[0].totalCents).toBe(400_000);
    expect(result.rows[0].cellsBySubmissionId["sub-1"]).toBe(200_000);
    expect(result.rows[1].cellsBySubmissionId["sub-1"]).toBe(200_000);
  });

  it("falls back to the submission's flat total when the vendor didn't itemize", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      { id: "sub-1", vendorName: "Bravo Framing", status: "SUBMITTED", totalCents: 350_000, notes: null, lineItems: [] },
    ]);

    expect(result.columns[0].isItemized).toBe(false);
    expect(result.columns[0].totalCents).toBe(350_000);
    expect(result.rows[0].cellsBySubmissionId["sub-1"]).toBeNull();
  });

  it("puts a vendor-only extra line (no matching package line item) into unmatchedItems, not a row", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      {
        id: "sub-1",
        vendorName: "Charlie Framing",
        status: "SUBMITTED",
        totalCents: null,
        notes: null,
        lineItems: [
          { bidPackageLineItemId: "line-1", title: "Framing labor", quantityMilli: 40_000, unitCostCents: 5_000 },
          { bidPackageLineItemId: null, title: "Scaffold rental", quantityMilli: 1_000, unitCostCents: 15_000 },
        ],
      },
    ]);

    expect(result.columns[0].unmatchedItems).toEqual([{ title: "Scaffold rental", extendedCostCents: 15_000 }]);
    expect(result.columns[0].totalCents).toBe(200_000 + 15_000);
  });

  it("identifies the lowest total among submissions that have one", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      { id: "sub-1", vendorName: "Acme", status: "SUBMITTED", totalCents: 400_000, notes: null, lineItems: [] },
      { id: "sub-2", vendorName: "Bravo", status: "SUBMITTED", totalCents: 350_000, notes: null, lineItems: [] },
      { id: "sub-3", vendorName: "Charlie", status: "INVITED", totalCents: null, notes: null, lineItems: [] },
    ]);

    expect(result.lowestTotalSubmissionId).toBe("sub-2");
  });

  it("returns null for lowestTotalSubmissionId when no submission has a total yet", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      { id: "sub-1", vendorName: "Acme", status: "INVITED", totalCents: null, notes: null, lineItems: [] },
    ]);

    expect(result.lowestTotalSubmissionId).toBeNull();
  });
});

describe("buildComparisonContextText", () => {
  it("describes each vendor's status, total, and notes", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      { id: "sub-1", vendorName: "Acme", status: "SUBMITTED", totalCents: 400_000, notes: "2-week lead time", lineItems: [] },
    ]);

    const text = buildComparisonContextText(result);
    expect(text).toContain("Acme: SUBMITTED");
    expect(text).toContain("flat (not itemized), total $4,000");
    expect(text).toContain('notes: "2-week lead time"');
  });

  it("says a vendor hasn't bid yet instead of a total for INVITED/DRAFT", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      { id: "sub-1", vendorName: "Acme", status: "INVITED", totalCents: null, notes: null, lineItems: [] },
    ]);

    expect(buildComparisonContextText(result)).toContain("Acme: INVITED — has not bid yet");
  });

  it("includes a line-item breakdown section only for itemized vendors", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      {
        id: "sub-1",
        vendorName: "Acme",
        status: "SUBMITTED",
        totalCents: null,
        notes: null,
        lineItems: [{ bidPackageLineItemId: "line-1", title: "Framing labor", quantityMilli: 40_000, unitCostCents: 5_000 }],
      },
      { id: "sub-2", vendorName: "Bravo", status: "SUBMITTED", totalCents: 350_000, notes: null, lineItems: [] },
    ]);

    const text = buildComparisonContextText(result);
    expect(text).toContain("Line-item breakdown (itemized vendors only):");
    expect(text).toContain("Framing labor: Acme $2,000");
    expect(text).not.toContain("Bravo $"); // Bravo didn't itemize, so it never appears in the breakdown
  });

  it("omits the breakdown section entirely when no vendor itemized", () => {
    const result = computeBidComparison(LINE_ITEMS, [
      { id: "sub-1", vendorName: "Acme", status: "SUBMITTED", totalCents: 400_000, notes: null, lineItems: [] },
    ]);

    expect(buildComparisonContextText(result)).not.toContain("Line-item breakdown");
  });
});
