import { describe, expect, it } from "vitest";

import { normalizeSubject } from "./threads";

describe("normalizeSubject", () => {
  it("collapses whitespace, trims and caps length", () => {
    expect(normalizeSubject("  Window   delivery \n date ")).toBe("Window delivery date");
    expect(normalizeSubject("x".repeat(300))).toHaveLength(200);
    expect(normalizeSubject("   ")).toBe("");
  });
});
