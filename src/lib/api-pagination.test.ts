import { describe, expect, it } from "vitest";

import { toCursorPage } from "@/lib/api-pagination";

describe("toCursorPage", () => {
  it("pages with nextCursor when an extra row was fetched", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(toCursorPage(rows, 2)).toEqual({
      data: [{ id: "a" }, { id: "b" }],
      pagination: { nextCursor: "b", hasMore: true, limit: 2 },
    });
  });

  it("clears nextCursor on the final page", () => {
    expect(toCursorPage([{ id: "a" }], 25)).toEqual({
      data: [{ id: "a" }],
      pagination: { nextCursor: null, hasMore: false, limit: 25 },
    });
  });
});
