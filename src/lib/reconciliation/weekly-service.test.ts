import { describe, expect, it } from "vitest";

import type { JobMatchCandidate } from "@/lib/matching/road-name";
import type { QboPurchaseTransaction } from "@/lib/quickbooks/transactions";
import { classifyTransaction, type CandidateBill } from "@/lib/reconciliation/weekly-service";

function transaction(overrides: Partial<QboPurchaseTransaction> = {}): QboPurchaseTransaction {
  return {
    qboId: "1",
    txnDate: "2026-09-08",
    accountName: "Amex Business Card",
    payeeName: "Sherwin Williams",
    totalCents: 14599,
    memo: null,
    lineDescription: null,
    ...overrides,
  };
}

const redCedarJob: JobMatchCandidate = {
  id: "job-1",
  name: "283 Red Cedar",
  prefix: "283RC",
  addressLine1: "283 Red Cedar Dr",
};

const oakLaneJob: JobMatchCandidate = {
  id: "job-2",
  name: "48 Oak Lane",
  prefix: "48OL",
  addressLine1: "48 Oak Lane",
};

describe("classifyTransaction", () => {
  it("matches a transaction to an existing bill by vendor, amount, and nearby date", () => {
    const bill: CandidateBill = {
      id: "bill-1",
      jobId: "job-1",
      jobName: "283 Red Cedar",
      vendorName: "SHERWIN WILLIAMS #4521",
      totalCents: 14599,
      referenceDate: new Date("2026-09-09"),
    };

    const result = classifyTransaction(transaction(), [bill], [redCedarJob]);

    expect(result.status).toBe("MATCHED");
    expect(result.matchedBillId).toBe("bill-1");
    expect(result.matchedJobId).toBe("job-1");
  });

  it("does not match a bill with a different amount even if the vendor matches", () => {
    const bill: CandidateBill = {
      id: "bill-1",
      jobId: "job-1",
      jobName: "283 Red Cedar",
      vendorName: "Sherwin Williams",
      totalCents: 99999,
      referenceDate: new Date("2026-09-09"),
    };

    const result = classifyTransaction(transaction(), [bill], [redCedarJob]);
    expect(result.status).not.toBe("MATCHED");
  });

  it("does not match a bill outside the date tolerance window", () => {
    const bill: CandidateBill = {
      id: "bill-1",
      jobId: "job-1",
      jobName: "283 Red Cedar",
      vendorName: "Sherwin Williams",
      totalCents: 14599,
      referenceDate: new Date("2026-01-01"),
    };

    const result = classifyTransaction(transaction(), [bill], [redCedarJob]);
    expect(result.status).not.toBe("MATCHED");
  });

  it("falls back to a road-name job suggestion when no bill matches", () => {
    const result = classifyTransaction(
      transaction({ lineDescription: "283 Red Cedar Dr - interior paint" }),
      [],
      [redCedarJob, oakLaneJob],
    );

    expect(result.status).toBe("JOB_SUGGESTED");
    expect(result.matchedJobId).toBe("job-1");
    expect(result.matchedBillId).toBeNull();
  });

  it("reports unmatched when no bill and no confident job match exist", () => {
    const result = classifyTransaction(transaction({ payeeName: "Random Hardware Store", lineDescription: null, memo: null }), [], [
      redCedarJob,
      oakLaneJob,
    ]);

    expect(result.status).toBe("UNMATCHED");
    expect(result.matchedJobId).toBeNull();
    expect(result.matchedBillId).toBeNull();
  });

  it("reports unmatched rather than guessing between two ambiguous jobs", () => {
    const ambiguousJobA: JobMatchCandidate = { id: "job-3", name: "10 Cedar Ct", prefix: null, addressLine1: "10 Cedar Ct" };
    const ambiguousJobB: JobMatchCandidate = { id: "job-4", name: "20 Cedar Ct", prefix: null, addressLine1: "20 Cedar Ct" };

    const result = classifyTransaction(transaction({ payeeName: "Cedar Supply Co", lineDescription: "cedar" }), [], [
      ambiguousJobA,
      ambiguousJobB,
    ]);

    expect(result.status).toBe("UNMATCHED");
  });
});
