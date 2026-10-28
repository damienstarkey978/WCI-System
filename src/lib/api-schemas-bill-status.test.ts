import { describe, expect, it } from "vitest";

import { updateBillStatusSchema } from "@/lib/api-schemas";

describe("updateBillStatusSchema QuickBooks intent", () => {
  it("requires sendToQuickBooks for READY_FOR_PAYMENT", () => {
    const parsed = updateBillStatusSchema.safeParse({ approvalStatus: "READY_FOR_PAYMENT" });
    expect(parsed.success).toBe(false);
  });

  it("accepts READY_FOR_PAYMENT with an explicit send choice", () => {
    const send = updateBillStatusSchema.safeParse({
      approvalStatus: "READY_FOR_PAYMENT",
      sendToQuickBooks: true,
    });
    expect(send.success).toBe(true);

    const skip = updateBillStatusSchema.safeParse({
      approvalStatus: "READY_FOR_PAYMENT",
      sendToQuickBooks: false,
      quickBooksSkipReason: "Materials — not sent to QuickBooks",
    });
    expect(skip.success).toBe(true);
    if (skip.success) {
      expect(skip.data.sendToQuickBooks).toBe(false);
      expect(skip.data.quickBooksSkipReason).toBe("Materials — not sent to QuickBooks");
    }
  });

  it("does not require sendToQuickBooks for other statuses", () => {
    const parsed = updateBillStatusSchema.safeParse({ approvalStatus: "APPROVED" });
    expect(parsed.success).toBe(true);
  });
});
