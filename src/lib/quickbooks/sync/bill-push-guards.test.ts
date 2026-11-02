import { describe, expect, it } from "vitest";

import { BillApprovalStatus } from "@/generated/prisma/enums";
import { isBillQuickBooksPushUnsafeByStatus } from "@/lib/bills/quickbooks-intent";
import { vendorInvoiceNumberPushBlockReason } from "@/lib/bills/bill-number";
import {
  assertBillPushBatchSizeAllowed,
  BillQuickBooksBulkTooLargeError,
  QBO_BILL_PUSH_HANDFUL_LIMIT,
} from "@/lib/quickbooks/sync/bill-push-preview";

describe("Money push guards (unit)", () => {
  it("refuses PAID / VOID / paidAt", () => {
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: BillApprovalStatus.PAID })).toBe(true);
    expect(isBillQuickBooksPushUnsafeByStatus({ approvalStatus: BillApprovalStatus.VOID })).toBe(true);
    expect(
      isBillQuickBooksPushUnsafeByStatus({
        approvalStatus: BillApprovalStatus.READY_FOR_PAYMENT,
        paidAt: new Date(),
      }),
    ).toBe(true);
  });

  it("blocks blank and JOB_ invoice numbers", () => {
    expect(vendorInvoiceNumberPushBlockReason(null)).toMatch(/blank/i);
    expect(vendorInvoiceNumberPushBlockReason("JOB_5B13-256749")).toMatch(/JOB_/);
    expect(vendorInvoiceNumberPushBlockReason("256749")).toBeNull();
  });

  it("enforces handful bulk limit without approval env", () => {
    expect(() => assertBillPushBatchSizeAllowed(QBO_BILL_PUSH_HANDFUL_LIMIT)).not.toThrow();
    expect(() => assertBillPushBatchSizeAllowed(QBO_BILL_PUSH_HANDFUL_LIMIT + 1)).toThrow(
      BillQuickBooksBulkTooLargeError,
    );
  });
});
