import { describe, expect, it } from "vitest";

import {
  formatPoNumberDisplay,
  formatPoStatusLabel,
  formatWorkStatusLabel,
  resolvePoTitle,
} from "./display";

describe("formatPoNumberDisplay", () => {
  it("pads pure numeric PO numbers to 4 digits", () => {
    expect(formatPoNumberDisplay("11")).toBe("0011");
    expect(formatPoNumberDisplay("0011")).toBe("0011");
  });

  it("extracts trailing digits from import prefixes", () => {
    expect(formatPoNumberDisplay("JOB_5B13-0024")).toBe("0024");
    expect(formatPoNumberDisplay("J167-PO-0011")).toBe("0011");
  });

  it("appends a suffix when present", () => {
    expect(formatPoNumberDisplay("0011", "A")).toBe("0011-A");
  });
});

describe("status labels", () => {
  it("uses Buildertrend title case", () => {
    expect(formatPoStatusLabel("DRAFT")).toBe("Draft");
    expect(formatPoStatusLabel("APPROVED")).toBe("Approved");
    expect(formatWorkStatusLabel("NOT_COMPLETE")).toBe("Not Complete");
    expect(formatWorkStatusLabel("WORK_COMPLETE")).toBe("Work Complete");
  });
});

describe("resolvePoTitle", () => {
  it("prefers the PO title over the line-item title", () => {
    expect(resolvePoTitle("Drywall Labor", "Something else")).toBe("Drywall Labor");
  });

  it("falls back to the first line-item title", () => {
    expect(resolvePoTitle(null, "Insulation")).toBe("Insulation");
    expect(resolvePoTitle("  ", "Framing")).toBe("Framing");
  });
});
