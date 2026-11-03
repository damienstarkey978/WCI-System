import { describe, expect, it } from "vitest";

import { nextVersionedTitle } from "@/lib/estimates/proposal-title";

describe("estimate copy versioning (CR P2 #19)", () => {
  it("appends v2 / v3 like proposal titles", () => {
    const base = "4212 Robin Hood Rd.-Dan Cook-Garage Remodel";
    expect(nextVersionedTitle(base, [base])).toBe(`${base} v2`);
    expect(nextVersionedTitle(base, [base, `${base} v2`])).toBe(`${base} v3`);
  });
});
