import { describe, expect, it } from "vitest";

import {
  isInventedJobPrefixedBillNumber,
  normalizeVendorInvoiceNumber,
  vendorInvoiceNumberPushBlockReason,
} from "./bill-number";

describe("bill-number Money rules", () => {
  it("normalizes blank to null", () => {
    expect(normalizeVendorInvoiceNumber(null)).toBeNull();
    expect(normalizeVendorInvoiceNumber("  ")).toBeNull();
    expect(normalizeVendorInvoiceNumber("256749")).toBe("256749");
  });

  it("detects invented JOB_ prefixes", () => {
    expect(isInventedJobPrefixedBillNumber("JOB_5B13-256749")).toBe(true);
    expect(isInventedJobPrefixedBillNumber("JOB_755B-0094")).toBe(true);
    expect(isInventedJobPrefixedBillNumber("0007")).toBe(false);
    expect(isInventedJobPrefixedBillNumber("256749")).toBe(false);
    expect(isInventedJobPrefixedBillNumber("J054-INV-0001")).toBe(false);
  });

  it("blocks blank and JOB_ for push", () => {
    expect(vendorInvoiceNumberPushBlockReason(null)).toMatch(/blank/i);
    expect(vendorInvoiceNumberPushBlockReason("JOB_5E26-0007")).toMatch(/JOB_/);
    expect(vendorInvoiceNumberPushBlockReason("0094")).toBeNull();
  });
});
