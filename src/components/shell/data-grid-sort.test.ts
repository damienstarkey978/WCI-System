import { describe, expect, it } from "vitest";

import { sortRows } from "./data-grid-sort";

describe("sortRows", () => {
  const rows = [{ v: 10 }, { v: 2 }, { v: null }, { v: 33 }];

  it("sorts numbers and keeps blanks last in both directions", () => {
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.v)).toEqual([2, 10, 33, null]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.v)).toEqual([33, 10, 2, null]);
  });

  it("uses natural string order and does not mutate the input", () => {
    const pos = [{ n: "PO 10" }, { n: "PO 2" }, { n: "po 1" }];
    expect(sortRows(pos, (r) => r.n, "asc").map((r) => r.n)).toEqual(["po 1", "PO 2", "PO 10"]);
    expect(pos[0].n).toBe("PO 10");
  });

  it("orders ISO dates correctly", () => {
    const d = [{ d: "2026-03-01T00:00:00.000Z" }, { d: "2025-12-31T00:00:00.000Z" }];
    expect(sortRows(d, (r) => r.d, "asc").map((r) => r.d)[0]).toBe("2025-12-31T00:00:00.000Z");
  });
});
