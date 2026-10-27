import { describe, expect, it } from "vitest";

import { stripNonScopeTextFromNotes } from "@/lib/ai/estimate-notes";

describe("stripNonScopeTextFromNotes", () => {
  it("keeps pure scope notes unchanged", () => {
    const notes = "Add 12x16 master suite addition with bath. Frame, drywall, paint.";
    expect(stripNonScopeTextFromNotes(notes)).toEqual({
      scopeNotes: notes,
      removedSnippets: [],
    });
  });

  it("strips HELOC / financing sentences while keeping scope", () => {
    const result = stripNonScopeTextFromNotes(
      "Build a 400 sqft addition with LVP throughout. Client will use a HELOC for funding. Include electrical rough-in.",
    );
    expect(result.scopeNotes).toContain("400 sqft addition");
    expect(result.scopeNotes).toContain("electrical rough-in");
    expect(result.scopeNotes).not.toMatch(/HELOC/i);
    expect(result.removedSnippets.some((s) => /HELOC/i.test(s))).toBe(true);
  });

  it("strips budget-range lines", () => {
    const result = stripNonScopeTextFromNotes(
      ["Kitchen gut remodel, new cabinets and quartz.", "Budget range: $45k–$60k.", "Financing via home equity line."].join(
        "\n",
      ),
    );
    expect(result.scopeNotes).toContain("Kitchen gut remodel");
    expect(result.scopeNotes).not.toMatch(/Budget range/i);
    expect(result.scopeNotes).not.toMatch(/Financing/i);
    expect(result.removedSnippets.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty notes", () => {
    expect(stripNonScopeTextFromNotes("   ")).toEqual({ scopeNotes: "", removedSnippets: [] });
  });
});
