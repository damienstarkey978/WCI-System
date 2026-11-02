import { describe, expect, it } from "vitest";

import { filterActivePaisProducts } from "@/lib/permitting/package-products";

describe("filterActivePaisProducts", () => {
  it("hides products whose expiresAt is in the past", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const rows = filterActivePaisProducts(
      [
        { id: "a", expiresAt: null },
        { id: "b", expiresAt: new Date("2026-11-03T00:00:00Z") },
        { id: "c", expiresAt: new Date("2026-11-01T00:00:00Z") },
      ],
      now,
    );
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
