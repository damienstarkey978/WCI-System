import { describe, expect, it } from "vitest";

/** Mirrors nextAutoPoNumber's numeric-max logic without hitting the database. */
function suggestNextPoNumber(existing: readonly string[]): string {
  let max = 0;
  for (const poNumber of existing) {
    const trimmed = poNumber.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    const value = Number.parseInt(trimmed, 10);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return String(max + 1).padStart(4, "0");
}

describe("suggestNextPoNumber", () => {
  it("starts at 0001 when none exist", () => {
    expect(suggestNextPoNumber([])).toBe("0001");
  });

  it("increments the highest numeric PO number", () => {
    expect(suggestNextPoNumber(["0001", "0003", "0002"])).toBe("0004");
  });

  it("ignores non-numeric legacy numbers", () => {
    expect(suggestNextPoNumber(["PO-A", "0010", "draft"])).toBe("0011");
  });
});
