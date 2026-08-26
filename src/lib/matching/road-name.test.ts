import { describe, expect, it } from "vitest";

import {
  houseNumber,
  matchJobsByRoadName,
  parsePrefix,
  roadInitials,
  roadNameTokens,
  type JobMatchCandidate,
} from "@/lib/matching/road-name";

const redCedar: JobMatchCandidate = {
  id: "job-rc",
  name: "283 Red Cedar",
  prefix: "283RC",
  addressLine1: "283 Red Cedar Dr",
};

const pineValley: JobMatchCandidate = {
  id: "job-pv",
  name: "1120 Pine Valley",
  prefix: "1120PV",
  addressLine1: "1120 Pine Valley Rd",
};

/** Same street, different house — the case that must never auto-match. */
const redCedarTwo: JobMatchCandidate = {
  id: "job-rc2",
  name: "291 Red Cedar",
  prefix: "291RC",
  addressLine1: "291 Red Cedar Dr",
};

const JOBS = [redCedar, pineValley, redCedarTwo];

describe("tokenizing", () => {
  it("strips street suffixes and house numbers", () => {
    expect(roadNameTokens("283 Red Cedar Dr")).toEqual(["red", "cedar"]);
  });

  it("strips directionals and unit markers", () => {
    expect(roadNameTokens("1120 N Pine Valley Rd Apt 4")).toEqual(["pine", "valley"]);
  });

  it("handles punctuation and casing from card statements", () => {
    expect(roadNameTokens("HOME DEPOT #4521 - 283 RED CEDAR DR.")).toEqual([
      "home", "depot", "red", "cedar",
    ]);
  });

  it("pulls the house number", () => {
    expect(houseNumber("283 Red Cedar Dr")).toBe("283");
    expect(houseNumber("Red Cedar Dr")).toBeNull();
  });

  it("computes road initials", () => {
    expect(roadInitials("283 Red Cedar Dr")).toBe("rc");
    expect(roadInitials("1120 Pine Valley Rd")).toBe("pv");
  });

  it("parses the compact prefix form WCI uses on POs", () => {
    expect(parsePrefix("283RC")).toEqual({ number: "283", initials: "rc" });
    expect(parsePrefix("1120 PV")).toEqual({ number: "1120", initials: "pv" });
  });
});

describe("matching", () => {
  it("matches an exact prefix with full confidence", () => {
    const result = matchJobsByRoadName("283RC", JOBS);
    expect(result.bestMatch?.job.id).toBe("job-rc");
    expect(result.bestMatch?.score).toBe(100);
  });

  it("matches a full address", () => {
    const result = matchJobsByRoadName("283 Red Cedar Dr", JOBS);
    expect(result.bestMatch?.job.id).toBe("job-rc");
    expect(result.bestMatch?.score).toBe(95);
  });

  it("matches a PO description with vendor noise around the address", () => {
    const result = matchJobsByRoadName("SHERWIN WILLIAMS 283 RED CEDAR", JOBS);
    expect(result.bestMatch?.job.id).toBe("job-rc");
  });

  it("distinguishes two houses on the same street by number", () => {
    expect(matchJobsByRoadName("291 Red Cedar Dr", JOBS).bestMatch?.job.id).toBe("job-rc2");
    expect(matchJobsByRoadName("283 Red Cedar Dr", JOBS).bestMatch?.job.id).toBe("job-rc");
  });

  it("refuses to guess between two jobs on the same street with no house number", () => {
    // This is the case that would otherwise book a cost to the wrong job.
    const result = matchJobsByRoadName("Red Cedar", JOBS);
    expect(result.ambiguous).toBe(true);
    expect(result.bestMatch).toBeNull();
    expect(result.matches.length).toBeGreaterThan(1);
  });

  it("returns no match for an unrelated transaction", () => {
    const result = matchJobsByRoadName("SHELL OIL 4471", JOBS);
    expect(result.bestMatch).toBeNull();
    expect(result.matches).toEqual([]);
  });

  it("returns no match for an empty query", () => {
    expect(matchJobsByRoadName("   ", JOBS).matches).toEqual([]);
  });

  it("is case- and punctuation-insensitive", () => {
    expect(matchJobsByRoadName("283 red cedar dr.", JOBS).bestMatch?.job.id).toBe("job-rc");
    expect(matchJobsByRoadName("283RC", JOBS).bestMatch?.job.id).toBe("job-rc");
  });

  it("respects the minimum score", () => {
    const loose = matchJobsByRoadName("Pine", JOBS, { minimumScore: 10 });
    expect(loose.matches.length).toBeGreaterThan(0);
    const strict = matchJobsByRoadName("Pine", JOBS, { minimumScore: 90 });
    expect(strict.matches).toEqual([]);
  });

  it("caps the number of returned matches", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `job-${i}`,
      name: `Job ${i}`,
      prefix: null,
      addressLine1: "500 Red Cedar Dr",
    }));
    expect(matchJobsByRoadName("Red Cedar", many, { limit: 3 }).matches).toHaveLength(3);
  });

  it("explains why each match was made", () => {
    const result = matchJobsByRoadName("283RC", JOBS);
    expect(result.bestMatch?.reason).toContain("283RC");
  });

  it("tolerates jobs with no address or prefix", () => {
    const sparse: JobMatchCandidate = { id: "x", name: "Unknown", prefix: null, addressLine1: null };
    expect(() => matchJobsByRoadName("283 Red Cedar", [sparse])).not.toThrow();
    expect(matchJobsByRoadName("283 Red Cedar", [sparse]).matches).toEqual([]);
  });
});
