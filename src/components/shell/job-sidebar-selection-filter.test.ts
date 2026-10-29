import { describe, expect, it } from "vitest";

import { selectionFilterQuery } from "./job-sidebar-selection-filter";

const PURCELL = {
  id: "job_purcell",
  name: "455 Purcell Drive-Janice Frasca Cabazares-ADU",
  prefix: null,
};

const PEERS = [
  PURCELL,
  { id: "job_pine", name: "11296 Pine St - Lamb", prefix: "8056" },
  { id: "job_bancroft", name: "4802 Bancroft Remodel", prefix: null },
  { id: "job_haslett", name: "3745 Haslett Drive", prefix: null },
];

describe("selectionFilterQuery", () => {
  it("picks a short unique street token like Buildertrend (purcell)", () => {
    expect(selectionFilterQuery(PURCELL, PEERS)).toBe("purcell");
  });

  it("skips street suffixes and ADU noise", () => {
    const q = selectionFilterQuery(PURCELL, PEERS);
    expect(q).not.toBe("drive");
    expect(q).not.toBe("adu");
  });

  it("falls back to the full name when every token collides", () => {
    const twins = [
      { id: "a", name: "Oak Remodel", prefix: null },
      { id: "b", name: "Oak Addition", prefix: null },
    ];
    expect(selectionFilterQuery(twins[0]!, twins)).toBe("oak remodel");
  });

  it("falls back to the full name when shared tokens are not unique", () => {
    const jobs = [
      { id: "a", name: "Unit A Spec", prefix: "100A" },
      { id: "b", name: "Unit B Spec", prefix: "100B" },
    ];
    expect(selectionFilterQuery(jobs[0]!, jobs)).toBe("unit a spec");
  });
});
