import { describe, expect, it } from "vitest";

import { normalizeQboPurchase } from "@/lib/quickbooks/transactions";

describe("normalizeQboPurchase", () => {
  it("normalizes a typical credit-card Purchase entity", () => {
    const raw = {
      Id: "204",
      TxnDate: "2026-09-08",
      TotalAmt: 145.99,
      AccountRef: { value: "35", name: "Amex Business Card" },
      EntityRef: { value: "56", name: "Sherwin Williams", type: "Vendor" },
      PrivateNote: "Paint for the Red Cedar job",
      Line: [{ Amount: 145.99, Description: "283 Red Cedar Dr - interior paint" }],
    };

    expect(normalizeQboPurchase(raw)).toEqual({
      qboId: "204",
      txnDate: "2026-09-08",
      accountName: "Amex Business Card",
      payeeName: "Sherwin Williams",
      totalCents: 14599,
      memo: "Paint for the Red Cedar job",
      lineDescription: "283 Red Cedar Dr - interior paint",
    });
  });

  it("joins multiple line descriptions", () => {
    const raw = {
      Id: "205",
      TxnDate: "2026-09-09",
      TotalAmt: 10,
      Line: [{ Description: "first" }, { Description: "second" }],
    };
    expect(normalizeQboPurchase(raw)?.lineDescription).toBe("first | second");
  });

  it("defaults missing fields to null rather than throwing", () => {
    const raw = { Id: "206", TxnDate: "2026-09-10" };
    expect(normalizeQboPurchase(raw)).toEqual({
      qboId: "206",
      txnDate: "2026-09-10",
      accountName: null,
      payeeName: null,
      totalCents: 0,
      memo: null,
      lineDescription: null,
    });
  });

  it("returns null for an entity missing an Id", () => {
    expect(normalizeQboPurchase({ TxnDate: "2026-09-10" })).toBeNull();
  });

  it("returns null for an entity missing a TxnDate", () => {
    expect(normalizeQboPurchase({ Id: "1" })).toBeNull();
  });

  it("returns null for a non-object", () => {
    expect(normalizeQboPurchase(null)).toBeNull();
    expect(normalizeQboPurchase("not an object")).toBeNull();
  });
});
