import { describe, expect, it } from "vitest";

import { buildJobPurchasingSummary } from "@/lib/takeoffs/purchasing-summary";

describe("buildJobPurchasingSummary", () => {
  it("buckets takeoff lines and POs without double-counting ordered lines", () => {
    const summary = buildJobPurchasingSummary({
      jobId: "job_1",
      takeoffLines: [
        {
          id: "tl_ready",
          takeoffId: "tk_1",
          takeoffTitle: "Stucco takeoff",
          title: "Stucco mix",
          costCodeId: "cc_stucco",
          costCodeLabel: "STUCCO — Stucco materials",
          quantityMilli: 2_100_000,
          unit: "sqft",
          unitCostCents: 120,
          status: "READY",
          purchaseOrderId: null,
          intentStatus: null,
        },
        {
          id: "tl_queued",
          takeoffId: "tk_1",
          takeoffTitle: "Stucco takeoff",
          title: "Corner bead",
          costCodeId: "cc_stucco",
          costCodeLabel: "STUCCO — Stucco materials",
          quantityMilli: 80_000,
          unit: "ea",
          unitCostCents: 250,
          status: "QUEUED",
          purchaseOrderId: null,
          intentStatus: "QUEUED",
        },
        {
          id: "tl_ordered",
          takeoffId: "tk_1",
          takeoffTitle: "Stucco takeoff",
          title: "Already ordered mesh",
          costCodeId: "cc_stucco",
          costCodeLabel: "STUCCO — Stucco materials",
          quantityMilli: 10_000,
          unit: "rolls",
          unitCostCents: 4_000,
          status: "ORDERED",
          purchaseOrderId: "po_1",
          intentStatus: "CONVERTED",
        },
      ],
      purchaseOrders: [
        {
          id: "po_1",
          poNumber: "PO-100",
          title: "Stucco materials",
          vendorName: "ABC Supply",
          status: "APPROVED",
          workStatus: "NOT_COMPLETE",
          sourceType: "TAKEOFF",
          sourceId: "tk_1",
          totalCents: 40_000,
          lineCostCodeIds: ["cc_stucco"],
        },
        {
          id: "po_2",
          poNumber: "PO-101",
          title: "Lumber package",
          vendorName: "84 Lumber",
          status: "COMPLETED",
          workStatus: "WORK_COMPLETE",
          sourceType: "SCRATCH",
          sourceId: null,
          totalCents: 12_000_00,
          lineCostCodeIds: ["cc_frame"],
        },
      ],
    });

    expect(summary.totals.notYetCount).toBe(1);
    expect(summary.totals.queuedCount).toBe(1);
    expect(summary.totals.onOrderCount).toBe(1);
    expect(summary.totals.purchasedCount).toBe(1);
    expect(summary.rows.some((row) => row.id === "tl_ordered")).toBe(false);
    expect(summary.rows.find((row) => row.id === "po_1")?.bucket).toBe("on_order");
    expect(summary.rows.find((row) => row.id === "po_2")?.bucket).toBe("purchased");
    expect(summary.rows.find((row) => row.id === "tl_ready")?.href).toContain("/takeoffs/tk_1");
  });

  it("skips cancelled/declined POs and cancelled takeoff lines", () => {
    const summary = buildJobPurchasingSummary({
      jobId: "job_1",
      takeoffLines: [
        {
          id: "tl_x",
          takeoffId: "tk_1",
          takeoffTitle: "T",
          title: "Cancelled line",
          costCodeId: "cc",
          costCodeLabel: "cc",
          quantityMilli: 1000,
          unit: "ea",
          unitCostCents: 100,
          status: "CANCELLED",
          purchaseOrderId: null,
          intentStatus: null,
        },
      ],
      purchaseOrders: [
        {
          id: "po_x",
          poNumber: "PO-X",
          title: null,
          vendorName: "X",
          status: "CANCELLED",
          workStatus: "NOT_COMPLETE",
          sourceType: "SCRATCH",
          sourceId: null,
          totalCents: 100,
          lineCostCodeIds: [],
        },
      ],
    });
    expect(summary.rows).toHaveLength(0);
  });
});
