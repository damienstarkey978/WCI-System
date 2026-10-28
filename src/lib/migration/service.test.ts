import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dailyLogFindFirst,
  dailyLogCreate,
  purchaseOrderFindFirst,
  purchaseOrderCreate,
  billFindFirst,
  billCreate,
  invoiceFindFirst,
  invoiceCreate,
  invoiceFindFirstOrThrow,
  paymentCreateMany,
  scheduleFindFirst,
  scheduleCreate,
  scheduleItemFindFirst,
  scheduleItemCreate,
  scheduleItemCount,
  jobFindFirst,
  userFindFirst,
  vendorFindFirst,
  costCodeFindMany,
} = vi.hoisted(() => ({
  dailyLogFindFirst: vi.fn(),
  dailyLogCreate: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
  purchaseOrderCreate: vi.fn(),
  billFindFirst: vi.fn(),
  billCreate: vi.fn(),
  invoiceFindFirst: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceFindFirstOrThrow: vi.fn(),
  paymentCreateMany: vi.fn(),
  scheduleFindFirst: vi.fn(),
  scheduleCreate: vi.fn(),
  scheduleItemFindFirst: vi.fn(),
  scheduleItemCreate: vi.fn(),
  scheduleItemCount: vi.fn(),
  jobFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  vendorFindFirst: vi.fn(),
  costCodeFindMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: jobFindFirst },
    user: { findFirst: userFindFirst },
    vendor: { findFirst: vendorFindFirst },
    costCode: { findMany: costCodeFindMany },
    dailyLog: { findFirst: dailyLogFindFirst, create: dailyLogCreate },
    purchaseOrder: { findFirst: purchaseOrderFindFirst, create: purchaseOrderCreate },
    bill: { findFirst: billFindFirst, create: billCreate },
    invoice: { findFirst: invoiceFindFirst, create: invoiceCreate, findFirstOrThrow: invoiceFindFirstOrThrow },
    payment: { createMany: paymentCreateMany },
    schedule: { findFirst: scheduleFindFirst, create: scheduleCreate },
    scheduleItem: {
      findFirst: scheduleItemFindFirst,
      create: scheduleItemCreate,
      count: scheduleItemCount,
    },
  },
}));

import {
  importDailyLog,
  importInvoice,
  importPurchaseOrder,
  importScheduleItem,
} from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  jobFindFirst.mockResolvedValue({ id: "job_1" });
  userFindFirst.mockResolvedValue({ id: "user_1" });
  vendorFindFirst.mockResolvedValue({ id: "vendor_1" });
  costCodeFindMany.mockResolvedValue([{ id: "cc_1", defaultCostType: "MATERIAL" }]);
});

describe("migration import idempotency", () => {
  it("skips recreating a daily log with the same job+createdAt+note", async () => {
    const existing = { id: "log_1", files: [] };
    dailyLogFindFirst.mockResolvedValue(existing);

    const result = await importDailyLog({
      organizationId: "org_1",
      jobId: "job_1",
      authorUserId: "user_1",
      note: "Framed walls",
      createdAt: new Date("2026-01-02T12:00:00Z"),
    });

    expect(result.created).toBe(false);
    expect(result.record).toBe(existing);
    expect(dailyLogCreate).not.toHaveBeenCalled();
  });

  it("skips recreating a purchase order with the same org+poNumber", async () => {
    const existing = {
      id: "po_1",
      poNumber: "ABC-0001",
      lineItems: [{ quantityMilli: 1000, unitCostCents: 500 }],
      files: [],
    };
    purchaseOrderFindFirst.mockResolvedValue(existing);

    const result = await importPurchaseOrder({
      organizationId: "org_1",
      jobId: "job_1",
      uploadedByUserId: "user_1",
      poNumber: "ABC-0001",
      vendorName: "Acme",
      status: "APPROVED",
      createdAt: new Date("2026-01-02T12:00:00Z"),
      lineItems: [{ costCodeId: "cc_1", title: "Tile", unitCostCents: 500 }],
    });

    expect(result.created).toBe(false);
    expect(result.record.id).toBe("po_1");
    expect(result.record.totalCents).toBe(500);
    expect(purchaseOrderCreate).not.toHaveBeenCalled();
  });

  it("skips recreating an invoice with the same org+invoiceNumber", async () => {
    const existing = { id: "inv_1", invoiceNumber: "ABC-0001", amountCents: 1000, payments: [], lineItems: [], files: [] };
    invoiceFindFirst.mockResolvedValue(existing);

    const result = await importInvoice({
      organizationId: "org_1",
      jobId: "job_1",
      uploadedByUserId: "user_1",
      type: "FLAT",
      invoiceNumber: "ABC-0001",
      status: "PAID",
      amountCents: 1000,
      createdAt: new Date("2026-01-02T12:00:00Z"),
    });

    expect(result.created).toBe(false);
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(paymentCreateMany).not.toHaveBeenCalled();
  });

  it("backfills payments onto an existing invoice that has none", async () => {
    const existing = { id: "inv_1", invoiceNumber: "ABC-0001", amountCents: 1000, payments: [], lineItems: [], files: [] };
    const refreshed = {
      ...existing,
      payments: [{ id: "pay_1", amountCents: 1000 }],
    };
    invoiceFindFirst.mockResolvedValue(existing);
    invoiceFindFirstOrThrow.mockResolvedValue(refreshed);
    paymentCreateMany.mockResolvedValue({ count: 1 });

    const receivedAt = new Date("2026-01-03T12:00:00Z");
    const result = await importInvoice({
      organizationId: "org_1",
      jobId: "job_1",
      uploadedByUserId: "user_1",
      type: "FLAT",
      invoiceNumber: "ABC-0001",
      status: "PAID",
      amountCents: 1000,
      createdAt: new Date("2026-01-02T12:00:00Z"),
      payments: [{ method: "MANUAL", amountCents: 1000, receivedAt }],
    });

    expect(result.created).toBe(false);
    expect(result.paymentsBackfilled).toBe(true);
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(paymentCreateMany).toHaveBeenCalledWith({
      data: [
        {
          organizationId: "org_1",
          invoiceId: "inv_1",
          method: "MANUAL",
          amountCents: 1000,
          reference: null,
          receivedAt,
          createdAt: receivedAt,
        },
      ],
    });
    expect(result.record).toBe(refreshed);
  });

  it("does not double-create payments when the existing invoice already has some", async () => {
    const existing = {
      id: "inv_1",
      invoiceNumber: "ABC-0001",
      amountCents: 1000,
      payments: [{ id: "pay_1" }],
      lineItems: [],
      files: [],
    };
    invoiceFindFirst.mockResolvedValue(existing);

    const result = await importInvoice({
      organizationId: "org_1",
      jobId: "job_1",
      uploadedByUserId: "user_1",
      type: "FLAT",
      invoiceNumber: "ABC-0001",
      status: "PAID",
      amountCents: 1000,
      createdAt: new Date("2026-01-02T12:00:00Z"),
      payments: [{ method: "MANUAL", amountCents: 1000, receivedAt: new Date("2026-01-03T12:00:00Z") }],
    });

    expect(result.created).toBe(false);
    expect(result.paymentsBackfilled).toBe(false);
    expect(paymentCreateMany).not.toHaveBeenCalled();
  });

  it("creates a schedule when missing, then skips duplicate title+start", async () => {
    scheduleFindFirst.mockResolvedValue(null);
    scheduleCreate.mockResolvedValue({ id: "sched_1" });
    scheduleItemFindFirst.mockResolvedValue({ id: "item_1", title: "Framing" });

    const result = await importScheduleItem({
      organizationId: "org_1",
      jobId: "job_1",
      title: "Framing",
      durationDays: 10,
      manualStartDate: new Date("2026-08-31T00:00:00Z"),
    });

    expect(scheduleCreate).toHaveBeenCalledOnce();
    expect(result.created).toBe(false);
    expect(scheduleItemCreate).not.toHaveBeenCalled();
  });
});
