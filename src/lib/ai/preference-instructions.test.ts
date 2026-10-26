import { describe, expect, it } from "vitest";

import { formatAiPreferenceInstructions } from "@/lib/ai/preference-instructions";

describe("formatAiPreferenceInstructions", () => {
  it("returns a placeholder when empty", () => {
    expect(formatAiPreferenceInstructions([])).toBe("(none configured)");
  });

  it("formats label, forType, and body for each instruction", () => {
    const text = formatAiPreferenceInstructions([
      {
        id: "1",
        label: "Separate Interior Painting Section",
        instruction: "Always separate Interior Painting into its own section.",
        forType: "ESTIMATE",
        enabled: true,
        appliesToChangeOrder: false,
      },
      {
        id: "2",
        label: null,
        instruction: "Use $100/hr labor.",
        forType: "ESTIMATE",
        enabled: true,
        appliesToChangeOrder: true,
      },
    ]);
    expect(text).toContain("[ESTIMATE] Separate Interior Painting Section");
    expect(text).toContain("Always separate Interior Painting into its own section.");
    expect(text).toContain("[ESTIMATE (+ change orders)] Instruction 2");
    expect(text).toContain("Use $100/hr labor.");
  });
});
