import { describe, expect, it } from "vitest";
import {
  enforceLeadSalespersonKeepList,
  normalizePersonName,
  resolveLeadSalespersonUserId,
  splitSalespersonCell,
} from "./salesperson";

const BRIAN = "user_brian";
const WILLIAM = "user_william";
const map = new Map<string, string>([
  [normalizePersonName("Brian Wilkins"), BRIAN],
  [normalizePersonName("William Antonelli"), WILLIAM],
  [normalizePersonName("Damien Starkey"), "user_damien"],
  [normalizePersonName("Heather Lawrence"), "user_heather"],
]);

describe("resolveLeadSalespersonUserId", () => {
  it("keeps Brian when BT lists Brian", () => {
    expect(resolveLeadSalespersonUserId("Brian Wilkins", map)).toEqual({
      userId: BRIAN,
      reason: "brian",
    });
  });

  it("keeps William when BT lists William", () => {
    expect(resolveLeadSalespersonUserId("William Antonelli", map)).toEqual({
      userId: WILLIAM,
      reason: "william",
    });
  });

  it("prefers Brian when both are listed", () => {
    expect(resolveLeadSalespersonUserId("Brian Wilkins, William Antonelli", map).userId).toBe(BRIAN);
  });

  it("defaults to Brian for blank / other reps", () => {
    expect(resolveLeadSalespersonUserId(null, map)).toEqual({ userId: BRIAN, reason: "default-brian" });
    expect(resolveLeadSalespersonUserId("Damien Starkey", map)).toEqual({
      userId: BRIAN,
      reason: "default-brian",
    });
    expect(resolveLeadSalespersonUserId("Heather Lawrence, Mark Brzozowski", map).reason).toBe("default-brian");
  });
});

describe("enforceLeadSalespersonKeepList", () => {
  it("keeps Brian and William; remaps others to Brian", () => {
    expect(enforceLeadSalespersonKeepList(BRIAN, BRIAN, WILLIAM)).toBe(BRIAN);
    expect(enforceLeadSalespersonKeepList(WILLIAM, BRIAN, WILLIAM)).toBe(WILLIAM);
    expect(enforceLeadSalespersonKeepList(null, BRIAN, WILLIAM)).toBe(BRIAN);
    expect(enforceLeadSalespersonKeepList("user_damien", BRIAN, WILLIAM)).toBe(BRIAN);
  });
});

describe("splitSalespersonCell", () => {
  it("splits comma lists", () => {
    expect(splitSalespersonCell("Brian Wilkins, William Antonelli")).toEqual([
      "brian wilkins",
      "william antonelli",
    ]);
  });
});
