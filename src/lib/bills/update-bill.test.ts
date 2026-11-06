import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    bill: { findFirst, update },
  },
}));

vi.mock("@/lib/bills/bill-number", () => ({
  isInventedJobPrefixedBillNumber: (value: string) => value.startsWith("JOB_"),
  normalizeVendorInvoiceNumber: (value: string | null | undefined) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed || null;
  },
}));

import { BillNotEditableError, BillNotFoundError, InventedBillNumberError, updateBill } from "./service";

describe("updateBill", () => {
  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
  });

  it("refuses PAID bills", async () => {
    findFirst.mockResolvedValue({ id: "b1", approvalStatus: "PAID" });
    await expect(
      updateBill({
        organizationId: "org",
        billId: "b1",
        title: "x",
      }),
    ).rejects.toBeInstanceOf(BillNotEditableError);
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses missing bills", async () => {
    findFirst.mockResolvedValue(null);
    await expect(updateBill({ organizationId: "org", billId: "missing" })).rejects.toBeInstanceOf(BillNotFoundError);
  });

  it("refuses invented JOB_ bill numbers", async () => {
    findFirst.mockResolvedValue({ id: "b1", approvalStatus: "IN_REVIEW" });
    await expect(
      updateBill({
        organizationId: "org",
        billId: "b1",
        billNumber: "JOB_123",
      }),
    ).rejects.toBeInstanceOf(InventedBillNumberError);
  });

  it("persists QuickBooks + billable intent on editable bills", async () => {
    findFirst.mockResolvedValue({ id: "b1", approvalStatus: "APPROVED" });
    update.mockResolvedValue({ id: "b1" });

    await updateBill({
      organizationId: "org",
      billId: "b1",
      title: "Drywall labor",
      billNumber: "INV-9",
      sendToQuickBooks: true,
      billableToClient: true,
      quickBooksSkipReason: null,
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({
        title: "Drywall labor",
        billNumber: "INV-9",
        sendToQuickBooks: true,
        billableToClient: true,
        quickBooksSkipReason: null,
      }),
    });
  });
});
