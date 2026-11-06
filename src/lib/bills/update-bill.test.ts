import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findFirst,
  update,
  transaction,
  deleteMany,
  createMany,
  costCodeFindMany,
  vendorFindFirst,
  purchaseOrderFindFirst,
} = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  costCodeFindMany: vi.fn(),
  vendorFindFirst: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    bill: { findFirst, update },
    billLineItem: { deleteMany, createMany },
    costCode: { findMany: costCodeFindMany },
    vendor: { findFirst: vendorFindFirst },
    purchaseOrder: { findFirst: purchaseOrderFindFirst },
    $transaction: transaction,
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
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billLineItem: { deleteMany, createMany },
        bill: { update },
      }),
    );

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
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  });

  it("replaces cost lines when lineItems provided", async () => {
    findFirst.mockResolvedValue({ id: "b1", jobId: "job1", approvalStatus: "IN_REVIEW", vendorName: "Acme" });
    costCodeFindMany.mockResolvedValue([{ id: "cc1", defaultCostType: "LABOR" }]);
    deleteMany.mockResolvedValue({ count: 1 });
    createMany.mockResolvedValue({ count: 1 });
    update.mockResolvedValue({ id: "b1", lineItems: [] });
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billLineItem: { deleteMany, createMany },
        bill: { update },
      }),
    );

    await updateBill({
      organizationId: "org",
      billId: "b1",
      lineItems: [{ costCodeId: "cc1", title: "Labor", amountCents: 5000, costType: "LABOR" }],
    });

    expect(deleteMany).toHaveBeenCalledWith({ where: { billId: "b1" } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          billId: "b1",
          costCodeId: "cc1",
          title: "Labor",
          amountCents: 5000,
          costType: "LABOR",
          sortOrder: 0,
        }),
      ],
    });
  });

  it("updates Pay to vendor and Against PO on the same job", async () => {
    findFirst.mockResolvedValue({ id: "b1", jobId: "job1", approvalStatus: "READY_FOR_PAYMENT", vendorName: "Old" });
    vendorFindFirst.mockResolvedValue({ id: "v1", name: "Value Comfort Service LLC" });
    purchaseOrderFindFirst.mockResolvedValue({ id: "po1", jobId: "job1" });
    update.mockResolvedValue({ id: "b1" });
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        billLineItem: { deleteMany, createMany },
        bill: { update },
      }),
    );

    await updateBill({
      organizationId: "org",
      billId: "b1",
      vendorId: "v1",
      purchaseOrderId: "po1",
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: expect.objectContaining({
        vendorId: "v1",
        vendorName: "Value Comfort Service LLC",
        purchaseOrderId: "po1",
      }),
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });
  });
});
