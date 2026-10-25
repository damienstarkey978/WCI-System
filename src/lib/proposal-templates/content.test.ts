import { describe, expect, it } from "vitest";

import {
  drawsToText,
  parseDrawsText,
  parseSectionsText,
  proposalTemplateContentSchema,
  readTemplateDraws,
  readTemplateSections,
  sectionsToText,
} from "./content";

describe("proposalTemplateContentSchema", () => {
  it("accepts a normal template and defaults empty sections and draws", () => {
    const parsed = proposalTemplateContentSchema.parse({ name: " Kitchen remodel " });
    expect(parsed.name).toBe("Kitchen remodel");
    expect(parsed.sections).toEqual([]);
    expect(parsed.draws).toEqual([]);
  });

  it("rejects a payment schedule over 100%", () => {
    const result = proposalTemplateContentSchema.safeParse({
      name: "Bad",
      draws: [
        { title: "Deposit", pctOfContractBasisPoints: 6000 },
        { title: "Final", pctOfContractBasisPoints: 4001 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("allows exactly 100%", () => {
    const result = proposalTemplateContentSchema.safeParse({
      name: "Ok",
      draws: [
        { title: "Deposit", pctOfContractBasisPoints: 3000 },
        { title: "Final", pctOfContractBasisPoints: 7000 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("text editor format", () => {
  it("round trips sections", () => {
    const sections = [
      { title: "Demo", bullets: ["Remove cabinets", "Haul away debris"] },
      { title: "Finish", bullets: ["Paint walls"] },
    ];
    expect(parseSectionsText(sectionsToText(sections))).toEqual(sections);
  });

  it("puts bullets with no heading under a default section", () => {
    expect(parseSectionsText("- one\n- two")).toEqual([{ title: "Scope of work", bullets: ["one", "two"] }]);
  });

  it("parses draws as percent and skips bad lines", () => {
    expect(parseDrawsText("Deposit | 30\nnonsense\nFinal | 70%\nZero | 0")).toEqual([
      { title: "Deposit", pctOfContractBasisPoints: 3000 },
      { title: "Final", pctOfContractBasisPoints: 7000 },
    ]);
    expect(parseDrawsText(drawsToText([{ title: "Deposit", pctOfContractBasisPoints: 2550 }]))).toEqual([
      { title: "Deposit", pctOfContractBasisPoints: 2550 },
    ]);
  });
});

describe("reading stored json", () => {
  it("returns an empty list for malformed json instead of throwing", () => {
    expect(readTemplateSections({ nope: true })).toEqual([]);
    expect(readTemplateDraws("x")).toEqual([]);
  });
});
