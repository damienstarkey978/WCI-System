import { describe, expect, it } from "vitest";

import {
  assertDepositWithinLimit,
  assertPaymentScheduleReady,
  DEFAULT_PROPOSAL_PAYMENT_SCHEDULE,
  DepositTooHighError,
  findPaymentScheduleIssues,
  PaymentScheduleIncompleteError,
} from "@/lib/proposals/payment-schedule";

describe("proposal payment schedule", () => {
  it("accepts the default WCI schedule", () => {
    expect(findPaymentScheduleIssues(DEFAULT_PROPOSAL_PAYMENT_SCHEDULE)).toEqual([]);
    expect(() => assertPaymentScheduleReady(DEFAULT_PROPOSAL_PAYMENT_SCHEDULE)).not.toThrow();
  });

  it("rejects a 25% deposit", () => {
    expect(() =>
      assertDepositWithinLimit([
        { title: "Deposit", pctOfContractBasisPoints: 2_500 },
        { title: "Due upon commencement of work", pctOfContractBasisPoints: 7_500 },
      ]),
    ).toThrow(DepositTooHighError);
  });

  it("requires 100% total and commencement second draw", () => {
    const issues = findPaymentScheduleIssues([
      { title: "Deposit", pctOfContractBasisPoints: 1_500, sortOrder: 0 },
      { title: "Rough-in", pctOfContractBasisPoints: 8_500, sortOrder: 1 },
    ]);
    expect(issues.some((i) => /commencement/i.test(i))).toBe(true);

    expect(() =>
      assertPaymentScheduleReady([{ title: "Deposit", pctOfContractBasisPoints: 1_500 }]),
    ).toThrow(PaymentScheduleIncompleteError);
  });
});
