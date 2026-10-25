import { describe, expect, it } from "vitest";

import { normalizeFolderName } from "./folders";

describe("normalizeFolderName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeFolderName("  Site   Plans \n")).toBe("Site Plans");
    expect(normalizeFolderName("   ")).toBe("");
  });
});
