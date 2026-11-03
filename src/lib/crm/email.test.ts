import { describe, expect, it } from "vitest";

import { normalizeLeadEmail } from "@/lib/crm/email";

describe("normalizeLeadEmail", () => {
  it("fixes .comm → .com (Robin Hood Dan Cook typo)", () => {
    expect(normalizeLeadEmail("dancook428@yahoo.comm")).toBe("dancook428@yahoo.com");
  });

  it("lowercases and trims", () => {
    expect(normalizeLeadEmail("  Dan@Example.COM ")).toBe("dan@example.com");
  });

  it("returns null for blank", () => {
    expect(normalizeLeadEmail(null)).toBeNull();
    expect(normalizeLeadEmail("")).toBeNull();
  });
});
