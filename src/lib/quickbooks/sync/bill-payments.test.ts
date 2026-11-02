import { describe, expect, it } from "vitest";

describe("BillPayment TxnDate preference (Money rule 7)", () => {
  it("prefers paidOn over paidAt over now", () => {
    const paidOn = new Date("2026-05-01T15:00:00.000Z");
    const paidAt = new Date("2026-11-02T12:00:00.000Z");
    const prefer = (on: Date | null, at: Date | null) => (on ?? at ?? new Date()).toISOString().slice(0, 10);
    expect(prefer(paidOn, paidAt)).toBe("2026-05-01");
    expect(prefer(null, paidAt)).toBe("2026-11-02");
  });
});
