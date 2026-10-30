import { describe, expect, it } from "vitest";

import { formatJobLabel, jobNameAlreadyIncludesPrefix, shouldShowJobPrefix } from "./job-display";

describe("jobNameAlreadyIncludesPrefix", () => {
  it("detects street-number prefixes already in the BT-style name", () => {
    expect(jobNameAlreadyIncludesPrefix("932 Candlebark Dr-Brian Falke", "932")).toBe(true);
    expect(jobNameAlreadyIncludesPrefix("409 Seventeenth St_Collins", "409")).toBe(true);
    expect(jobNameAlreadyIncludesPrefix("8044 Oakwood St - Winningham", "8044")).toBe(true);
  });

  it("does not match a shorter number that is only a prefix of a longer one", () => {
    expect(jobNameAlreadyIncludesPrefix("1200 Main St", "12")).toBe(false);
    expect(jobNameAlreadyIncludesPrefix("1200 Main St", "120")).toBe(false);
  });

  it("is case-insensitive and tolerates empty/null prefix", () => {
    expect(jobNameAlreadyIncludesPrefix("abc remodel", "ABC")).toBe(true);
    expect(jobNameAlreadyIncludesPrefix("932 Candlebark", null)).toBe(false);
    expect(jobNameAlreadyIncludesPrefix("932 Candlebark", "  ")).toBe(false);
  });
});

describe("shouldShowJobPrefix", () => {
  it("hides prefix when the name already leads with it", () => {
    expect(shouldShowJobPrefix("932 Candlebark Dr-Brian Falke", "932")).toBe(false);
  });

  it("shows prefix when it adds information", () => {
    expect(shouldShowJobPrefix("Candlebark Addition", "932")).toBe(true);
    expect(shouldShowJobPrefix("Seminole remodel", null)).toBe(false);
  });
});

describe("formatJobLabel", () => {
  it("does not double a street-number prefix already in the name", () => {
    expect(formatJobLabel("7935 Parramore Rd.-Slate Medical-Concrete", "7935")).toBe(
      "7935 Parramore Rd.-Slate Medical-Concrete",
    );
  });

  it("keeps a useful prefix when the name lacks it", () => {
    expect(formatJobLabel("Candlebark Addition", "932")).toBe("932 Candlebark Addition");
  });
});
