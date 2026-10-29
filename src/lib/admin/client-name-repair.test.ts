import { describe, expect, it } from "vitest";

import { extractPersonNameFromJobStyleLabel } from "./client-name-repair";

describe("extractPersonNameFromJobStyleLabel", () => {
  it("pulls the person out of an address-person-scope label", () => {
    expect(extractPersonNameFromJobStyleLabel("1747 Debbie Ln-Suzanne Singleton-Bed/Bath Remodel")).toBe("Suzanne Singleton");
  });

  it("handles spaced hyphens", () => {
    expect(extractPersonNameFromJobStyleLabel("932 Candlebark Dr - Brian Falke - Room Addition")).toBe("Brian Falke");
  });

  it("leaves real person names alone", () => {
    expect(extractPersonNameFromJobStyleLabel("Brian Falke")).toBeNull();
    expect(extractPersonNameFromJobStyleLabel("Adam Kolb")).toBeNull();
  });

  it("returns null when there is no person segment", () => {
    expect(extractPersonNameFromJobStyleLabel("10290 Phillips Hwy - Remodel")).toBeNull();
  });
});
