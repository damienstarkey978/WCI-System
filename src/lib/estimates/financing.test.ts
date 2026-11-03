import { describe, expect, it } from "vitest";

import {
  formatIllustrativeMonthly,
  illustrativeMonthlyPaymentCents,
  leadDeclinesFinancing,
  resolveShowFinancing,
} from "./financing";

describe("illustrativeMonthlyPaymentCents", () => {
  it("splits evenly across 60 months, rounding up cents", () => {
    expect(illustrativeMonthlyPaymentCents(203_840)).toBe(3_398);
  });

  it("returns 0 for empty totals", () => {
    expect(illustrativeMonthlyPaymentCents(0)).toBe(0);
  });
});

describe("formatIllustrativeMonthly", () => {
  it("formats a money string for positive totals", () => {
    expect(formatIllustrativeMonthly(203_840)).toMatch(/\$/);
  });

  it("returns null when there is nothing to finance", () => {
    expect(formatIllustrativeMonthly(0)).toBeNull();
  });
});

describe("financing toggle", () => {
  it("detects decline language in lead notes", () => {
    expect(leadDeclinesFinancing("Client says financing isn't needed.")).toBe(true);
    expect(leadDeclinesFinancing("Paying cash / cash only.")).toBe(true);
    expect(leadDeclinesFinancing("Interested in financing options")).toBe(false);
  });

  it("resolves showFinancing with explicit override", () => {
    expect(resolveShowFinancing({ showFinancing: false, leadNotes: null })).toBe(false);
    expect(resolveShowFinancing({ showFinancing: true, leadNotes: "cash only" })).toBe(true);
    expect(resolveShowFinancing({ leadNotes: "no financing" })).toBe(false);
    expect(resolveShowFinancing({ leadNotes: "Kitchen remodel" })).toBe(true);
  });
});
