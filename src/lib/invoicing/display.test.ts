import { describe, expect, it } from "vitest";

import { displayInvoiceId, invoiceStatusLabel } from "./display";

describe("displayInvoiceId", () => {
  it("strips JOB_* prefixes used by migration imports", () => {
    expect(displayInvoiceId("JOB_5BBC-2")).toBe("2");
    expect(displayInvoiceId("JOB_5BBC-0002")).toBe("0002");
  });

  it("strips *-INV-* prefixes", () => {
    expect(displayInvoiceId("HASLETT-INV-0002")).toBe("0002");
  });

  it("leaves short BT-style ids alone", () => {
    expect(displayInvoiceId("0002")).toBe("0002");
  });
});

describe("invoiceStatusLabel", () => {
  it("matches Buildertrend Paid / Pending wording", () => {
    expect(invoiceStatusLabel("PAID")).toBe("Paid");
    expect(invoiceStatusLabel("SENT")).toBe("Pending/Sent");
  });
});
