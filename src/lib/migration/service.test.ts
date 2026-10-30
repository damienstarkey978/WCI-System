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
  invoiceUpdate,
  invoiceFindFirstOrThrow,
  paymentCreateMany,
  scheduleFindFirst,
  scheduleCreate,
  scheduleUpdate,
  scheduleItemFindFirst,
  scheduleItemCreate,
  scheduleItemUpdate,
  scheduleItemCount,
  jobFindFirst,
  userFindFirst,
  vendorFindFirst,
  costCodeFindMany,
  clientFindFirst,
  estimateFindFirst,
  estimateCreate,
  proposalFindFirst,
  proposalCreate,
  budgetLineCount,
  sendEstimateToBudget,
} = vi.hoisted(() => ({
  dailyLogFindFirst: vi.fn(),
  dailyLogCreate: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
  purchaseOrderCreate: vi.fn(),
  billFindFirst: vi.fn(),
  billCreate: vi.fn(),
  invoiceFindFirst: vi.fn(),
  invoiceCreate: vi.fn(),
  invoiceUpdate: vi.fn(),
  invoiceFindFirstOrThrow: vi.fn(),
  paymentCreateMany: vi.fn(),
  scheduleFindFirst: vi.fn(),
  scheduleCreate: vi.fn(),
  scheduleUpdate: vi.fn(),
  scheduleItemFindFirst: vi.fn(),
  scheduleItemCreate: vi.fn(),
  scheduleItemUpdate: vi.fn(),
  scheduleItemCount: vi.fn(),
  jobFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  vendorFindFirst: vi.fn(),
  costCodeFindMany: vi.fn(),
  clientFindFirst: vi.fn(),
  estimateFindFirst: vi.fn(),
  estimateCreate: vi.fn(),
  proposalFindFirst: vi.fn(),
  proposalCreate: vi.fn(),
  budgetLineCount: vi.fn(),
  sendEstimateToBudget: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    job: { findFirst: jobFindFirst },
    user: { findFirst: userFindFirst },
    vendor: { findFirst: vendorFindFirst },
    costCode: { findMany: costCodeFindMany },
    client: { findFirst: clientFindFirst },
    estimate: { findFirst: estimateFindFirst, create: estimateCreate },
    proposal: { findFirst: proposalFindFirst, create: proposalCreate },
    budgetLine: { count: budgetLineCount },
    dailyLog: { findFirst: dailyLogFindFirst, create: dailyLogCreate },
    purchaseOrder: { findFirst: purchaseOrderFindFirst, create: purchaseOrderCreate },
    bill: { findFirst: billFindFirst, create: billCreate },
    invoice: {
      findFirst: invoiceFindFirst,
      create: invoiceCreate,
      update: invoiceUpdate,
      findFirstOrThrow: invoiceFindFirstOrThrow,
    },
    payment: { createMany: paymentCreateMany },
    schedule: {
      findFirst: scheduleFindFirst,
      create: scheduleCreate,
      update: scheduleUpdate,
    },
    scheduleItem: {
      findFirst: scheduleItemFindFirst,
      create: scheduleItemCreate,
      update: scheduleItemUpdate,
      count: scheduleItemCount,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        payment: { createMany: paymentCreateMany },
        invoice: { update: invoiceUpdate },
      }),
  },
}));

vi.mock("@/lib/budget/send-to-budget", () => ({
  sendEstimateToBudget: sendEstimateToBudget,
}));

import {
  importApprovedProposal,
  importDailyLog,
  importInvoice,
  importPurchaseOrder,
  importScheduleFlags,
  importScheduleItem,
} from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  jobFindFirst.mockResolvedValue({ id: "job_1" });
  userFindFirst.mockResolvedValue({ id: "user_1" });
  vendorFindFirst.mockResolvedValue({ id: "vendor_1" });
  costCodeFindMany.mockResolvedValue([{ id: "cc_1", defaultCostType: "MATERIAL" }]);
  clientFindFirst.mockResolvedValue({ id: "cli_1" });
  budgetLineCount.mockResolvedValue(0);
  sendEstimateToBudget.mockResolvedValue({ budgetLinesWritten: 1 });
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

  it("persists Buildertrend weather JSON when provided on create", async () => {
    dailyLogFindFirst.mockResolvedValue(null);
    const created = { id: "log_2", files: [] };
    dailyLogCreate.mockResolvedValue(created);
    const weather = { conditions: "Hazy", maxTemp: "78", minTemp: "70" };

    const result = await importDailyLog({
      organizationId: "org_1",
      jobId: "job_1",
      authorUserId: "user_1",
      note: "Taped drywall",
      createdAt: new Date("2026-10-28T20:39:00Z"),
      weather,
    });

    expect(result.created).toBe(true);
    expect(dailyLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ weather }),
      }),
    );
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
    const existing = {
      id: "inv_1",
      invoiceNumber: "ABC-0001",
      amountCents: 1000,
      paidAt: null,
      status: "SENT",
      payments: [],
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
    });

    expect(result.created).toBe(false);
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(paymentCreateMany).not.toHaveBeenCalled();
  });

  it("backfills payments onto an existing invoice that has none", async () => {
    const existing = {
      id: "inv_1",
      invoiceNumber: "ABC-0001",
      amountCents: 1000,
      paidAt: null,
      status: "SENT",
      payments: [],
      lineItems: [],
      files: [],
    };
    const refreshed = {
      ...existing,
      status: "PAID",
      paidAt: new Date("2026-01-03T12:00:00Z"),
      payments: [{ id: "pay_1", amountCents: 1000 }],
    };
    invoiceFindFirst.mockResolvedValue(existing);
    invoiceFindFirstOrThrow.mockResolvedValue(refreshed);
    paymentCreateMany.mockResolvedValue({ count: 1 });
    invoiceUpdate.mockResolvedValue(refreshed);

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
    expect(invoiceUpdate).toHaveBeenCalledWith({
      where: { id: "inv_1" },
      data: { status: "PAID", paidAt: receivedAt },
    });
    expect(result.record).toBe(refreshed);
  });

  it("does not double-create payments when the existing invoice already has some", async () => {
    const existing = {
      id: "inv_1",
      invoiceNumber: "ABC-0001",
      amountCents: 1000,
      paidAt: null,
      status: "SENT",
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
    scheduleCreate.mockResolvedValue({ id: "sched_1", isOnline: true });
    scheduleItemFindFirst.mockResolvedValue({
      id: "item_1",
      title: "Framing",
      durationDays: 10,
      percentCompleteBasisPoints: 0,
      clientVisible: true,
      subVisible: true,
      notesInternal: null,
    });

    const result = await importScheduleItem({
      organizationId: "org_1",
      jobId: "job_1",
      title: "Framing",
      durationDays: 10,
      manualStartDate: new Date("2026-08-31T00:00:00Z"),
    });

    expect(scheduleCreate).toHaveBeenCalledOnce();
    expect(result.created).toBe(false);
    expect(result.updated).toBe(false);
    expect(scheduleItemCreate).not.toHaveBeenCalled();
    expect(scheduleItemUpdate).not.toHaveBeenCalled();
  });

  it("repairs duration and flips Schedule.isOnline on schedule re-import", async () => {
    scheduleFindFirst.mockResolvedValue({ id: "sched_1", isOnline: true });
    scheduleUpdate.mockResolvedValue({ id: "sched_1", isOnline: false });
    scheduleItemFindFirst.mockResolvedValue({
      id: "item_1",
      title: "Framing",
      durationDays: 5,
      percentCompleteBasisPoints: 0,
      clientVisible: true,
      subVisible: true,
      notesInternal: null,
    });
    scheduleItemUpdate.mockResolvedValue({
      id: "item_1",
      title: "Framing",
      durationDays: 10,
    });

    const result = await importScheduleItem({
      organizationId: "org_1",
      jobId: "job_1",
      title: "  Framing  ",
      durationDays: 10,
      manualStartDate: new Date("2026-08-31T00:00:00Z"),
      scheduleIsOnline: false,
    });

    expect(scheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched_1" },
      data: { isOnline: false },
    });
    expect(scheduleItemUpdate).toHaveBeenCalledOnce();
    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    expect(scheduleItemCreate).not.toHaveBeenCalled();
  });

  it("creates or updates schedule online flags without items", async () => {
    scheduleFindFirst.mockResolvedValue(null);
    scheduleCreate.mockResolvedValue({ id: "sched_1", isOnline: false });

    const created = await importScheduleFlags({
      organizationId: "org_1",
      jobId: "job_1",
      isOnline: false,
    });
    expect(created.created).toBe(true);
    expect(scheduleCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ isOnline: false, name: "Schedule" }),
    });

    scheduleFindFirst.mockResolvedValue({ id: "sched_1", isOnline: true, isDraft: false });
    scheduleUpdate.mockResolvedValue({ id: "sched_1", isOnline: false });
    const updated = await importScheduleFlags({
      organizationId: "org_1",
      jobId: "job_1",
      isOnline: false,
    });
    expect(updated.created).toBe(false);
    expect(updated.updated).toBe(true);
    expect(scheduleUpdate).toHaveBeenCalledWith({
      where: { id: "sched_1" },
      data: { isOnline: false },
    });
  });

  it("skips recreating an approved proposal with the same bt-proposal external key", async () => {
    estimateFindFirst.mockResolvedValue({
      id: "est_1",
      aiPromptNotes: "bt-proposal:pine-st",
      lineItems: [],
      sentToBudgetAt: null,
    });
    proposalFindFirst.mockResolvedValue({ id: "prop_1" });

    const result = await importApprovedProposal({
      organizationId: "org_1",
      jobId: "job_1",
      clientId: "cli_1",
      title: "Proposal for Pine St",
      externalKey: "pine-st",
      lineItems: [
        {
          costCodeId: "cc_1",
          title: "Plans",
          quantityMilli: 1000,
          unitCostCents: 350000,
          markupBasisPoints: 2100,
        },
      ],
    });

    expect(result.created).toBe(false);
    expect(result.estimateId).toBe("est_1");
    expect(result.proposalId).toBe("prop_1");
    expect(estimateCreate).not.toHaveBeenCalled();
    expect(proposalCreate).not.toHaveBeenCalled();
    expect(sendEstimateToBudget).not.toHaveBeenCalled();
  });

  it("heals send-to-budget when the estimate already exists but the job has no BudgetLines", async () => {
    estimateFindFirst.mockResolvedValue({
      id: "est_1",
      aiPromptNotes: "bt-proposal:pine-st",
      sentToBudgetAt: null,
      lineItems: [{ id: "eli_1", costCodeId: "cc_1" }],
    });
    proposalFindFirst.mockResolvedValue({ id: "prop_1" });
    budgetLineCount.mockResolvedValue(0);
    sendEstimateToBudget.mockResolvedValue({ budgetLinesWritten: 3 });

    const result = await importApprovedProposal({
      organizationId: "org_1",
      jobId: "job_1",
      clientId: "cli_1",
      title: "Proposal for Pine St",
      externalKey: "pine-st",
      lineItems: [
        {
          costCodeId: "cc_1",
          title: "Plans",
          quantityMilli: 1000,
          unitCostCents: 350000,
          markupBasisPoints: 2100,
        },
      ],
    });

    expect(result.created).toBe(false);
    expect(result.budgetLinesWritten).toBe(3);
    expect(sendEstimateToBudget).toHaveBeenCalledWith({
      estimateId: "est_1",
      organizationId: "org_1",
      allowResend: false,
    });
  });
});
