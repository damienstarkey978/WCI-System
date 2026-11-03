import { describe, expect, it } from "vitest";

import {
  assertAiTitleMatchesLead,
  InventedProposalTitleError,
  nextVersionedTitle,
  resolveProposalTitle,
  stripTitleVersion,
} from "@/lib/estimates/proposal-title";

describe("proposal title", () => {
  it("uses BT lead title over AI invention", () => {
    expect(
      resolveProposalTitle({
        leadTitle: "4212 Robin Hood Rd.-Dan Cook-Garage Remodel",
        aiProposedTitle: "Beautiful Garage Makeover",
      }),
    ).toBe("4212 Robin Hood Rd.-Dan Cook-Garage Remodel");
  });

  it("builds Address-Client-Trade when lead title missing", () => {
    expect(
      resolveProposalTitle({
        addressLine1: "4212 Robin Hood Rd.",
        clientName: "Dan Cook",
        tradeOrProjectType: "Garage Remodel",
      }),
    ).toBe("4212 Robin Hood Rd.-Dan Cook-Garage Remodel");
  });

  it("versions with v2 / v3", () => {
    const base = "4212 Robin Hood Rd.-Dan Cook-Garage Remodel";
    expect(nextVersionedTitle(base, [base])).toBe(`${base} v2`);
    expect(nextVersionedTitle(base, [base, `${base} v2`])).toBe(`${base} v3`);
    expect(stripTitleVersion(`${base} v3`)).toBe(base);
  });

  it("throws on strict AI title mismatch", () => {
    expect(() => assertAiTitleMatchesLead("Lead Title", "Invented")).toThrow(InventedProposalTitleError);
  });
});
