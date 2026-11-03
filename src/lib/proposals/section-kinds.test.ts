import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXCLUSIONS_BULLETS,
  defaultSectionsForProposal,
  mergeProposalSectionsWithDefaults,
} from "@/lib/proposals/section-kinds";

describe("proposal section kinds", () => {
  it("defaults EXCLUSIONS + WARRANTY", () => {
    const sections = defaultSectionsForProposal();
    expect(sections.map((s) => s.kind)).toEqual(["EXCLUSIONS", "WARRANTY"]);
    expect(sections[0].bullets).toEqual([...DEFAULT_EXCLUSIONS_BULLETS]);
  });

  it("swaps in 5-year roof warranty and wood language", () => {
    const sections = defaultSectionsForProposal({
      includeRoofWarranty: true,
      includeWoodReplacement: true,
    });
    expect(sections.find((s) => s.kind === "WARRANTY")?.bullets[0]).toMatch(/five \(5\) years/);
    expect(sections.find((s) => s.kind === "EXCLUSIONS")?.bullets.at(-1)).toMatch(/Damaged wood/);
  });

  it("appends missing defaults without duplicating supplied kinds", () => {
    const merged = mergeProposalSectionsWithDefaults([
      { title: "Kitchen", bullets: ["Demo cabinets"], kind: "SCOPE" },
      { title: "Custom exclusions", bullets: ["No painting"], kind: "EXCLUSIONS" },
    ]);
    expect(merged.map((s) => s.kind)).toEqual(["SCOPE", "EXCLUSIONS", "WARRANTY"]);
    expect(merged[1].bullets).toEqual(["No painting"]);
  });
});
