import { describe, expect, it } from "vitest";

import { computeInvoiceTotals, daysOverdue, dueDateFor } from "@/lib/invoicing/terms";

const ISSUED = new Date("2026-09-10T22:30:00.000Z");

describe("payment terms", () => {
  it("adds the net days to the issue date", () => {
    expect(dueDateFor("NET_30", ISSUED)!.toISOString()).toBe("2026-10-10T22:30:00.000Z");
    expect(dueDateFor("NET_15", ISSUED)!.toISOString()).toBe("2026-09-25T22:30:00.000Z");
  });

  it("makes a due-on-receipt invoice due the day it is issued", () => {
    expect(dueDateFor("DUE_ON_RECEIPT", ISSUED)!.toISOString()).toBe(ISSUED.toISOString());
  });

  it("refuses to compute a date the office set by hand", () => {
    expect(dueDateFor("CUSTOM", ISSUED)).toBeNull();
  });

  it("crosses a month end without losing a day", () => {
    // Issued late on the 10th; a naive +30 days on a local-time date can land on the
    // 9th or 11th depending on the server's timezone and DST.
    expect(dueDateFor("NET_30", new Date("2026-01-31T23:59:00.000Z"))!.toISOString()).toBe(
      "2026-03-02T23:59:00.000Z",
    );
  });
});

describe("overdue", () => {
  it("counts whole days past the due date", () => {
    expect(daysOverdue(new Date("2026-09-01T00:00:00Z"), new Date("2026-09-10T12:00:00Z"))).toBe(9);
  });

  it("is zero before the due date, not negative", () => {
    expect(daysOverdue(new Date("2026-10-01T00:00:00Z"), new Date("2026-09-10T00:00:00Z"))).toBe(0);
  });

  it("is zero when there is no due date at all", () => {
    expect(daysOverdue(null, new Date("2026-09-10T00:00:00Z"))).toBe(0);
  });
});

describe("invoice totals", () => {
  const LINES = [
    { amountCents: 100_000, taxable: true },
    { amountCents: 50_000, taxable: false },
  ];

  it("taxes only the taxable lines", () => {
    const totals = computeInvoiceTotals(LINES, 750);
    expect(totals.subtotalCents).toBe(150_000);
    expect(totals.taxableCents).toBe(100_000);
    expect(totals.taxCents).toBe(7_500);
    expect(totals.totalCents).toBe(157_500);
  });

  it("charges nothing at a zero rate", () => {
    expect(computeInvoiceTotals(LINES, 0).totalCents).toBe(150_000);
  });

  it("taxes the taxable subtotal as a whole rather than line by line", () => {
    // Three lines of $3.33 at 7.5%: per-line rounding gives 25+25+25 = 75c, but the
    // client reading the printed $9.99 subtotal computes 74.925 -> 75c. Here they
    // agree; the guard matters because the two methods diverge on other amounts.
    const lines = [
      { amountCents: 333, taxable: true },
      { amountCents: 333, taxable: true },
      { amountCents: 333, taxable: true },
    ];
    expect(computeInvoiceTotals(lines, 750).taxCents).toBe(75);
  });

  it("totals an invoice with no lines to nothing", () => {
    expect(computeInvoiceTotals([], 750)).toEqual({
      subtotalCents: 0,
      taxableCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});
