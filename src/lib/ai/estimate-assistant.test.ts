import { describe, expect, it, vi } from "vitest";

import { RateMode } from "@/generated/prisma/enums";
import {
  AiNotConfiguredError,
  draftEstimateFromNotes,
  DraftGenerationError,
  ESTIMATE_NARRATIVE_MAX_TOKENS,
  ESTIMATE_PRICING_MAX_TOKENS,
} from "@/lib/ai/estimate-assistant";
import type { CostCodeOption, RawEstimateLineItem } from "@/lib/ai/estimate-draft";

const CODES: readonly CostCodeOption[] = [
  { id: "cc_paint_labor", code: "PAINT-INT-L", name: "Int Paint Labor", defaultCostType: "LABOR" },
  { id: "cc_paint_mat", code: "PAINT-INT-M", name: "Int Paint Materials", defaultCostType: "MATERIAL" },
  { id: "cc_elec_labor", code: "ELEC-L", name: "Electrical Labor", defaultCostType: "LABOR" },
  { id: "cc_floor_allow", code: "FLOOR-ALLOW", name: "Flooring Allowance", defaultCostType: "MATERIAL" },
];

function line(partial: Partial<RawEstimateLineItem> & Pick<RawEstimateLineItem, "costCodeId" | "title" | "groupLabel">): RawEstimateLineItem {
  return {
    quantity: 1,
    unitCostDollars: 100,
    ratePercent: 20,
    rateMode: RateMode.MARKUP,
    confidence: "HIGH",
    priceSource: "MARKET_RATE",
    ...partial,
  };
}

const PRICING_PASS = {
  title: "Interior repaint",
  assumptions: ["Assumes standard 8ft ceilings"],
  incomplete: false,
  lineItems: [
    line({
      costCodeId: "cc_paint_labor",
      groupLabel: "Painting",
      title: "Paint labor — walls and trim",
      quantity: 40,
      unitCostDollars: 45,
    }),
  ],
};

const NARRATIVE_PASS = {
  projectDescription: "A full interior repaint of walls and trim.",
  proposalSections: [{ title: "Painting", bullets: ["Paint all interior walls and trim, two coats"] }],
};

function fakeClient(responses: unknown[]) {
  let index = 0;
  const stream = vi.fn().mockImplementation(() => {
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return { finalMessage: vi.fn().mockResolvedValue(response) };
  });
  return { stream, get callCount() { return index; } };
}

describe("draftEstimateFromNotes", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        draftEstimateFromNotes(
          { jobName: "Test job", notes: "notes", costCodes: CODES },
          fakeClient([{ parsed_output: PRICING_PASS, stop_reason: "end_turn" }]),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns a normalized draft from pricing + narrative passes", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([
      { parsed_output: PRICING_PASS, stop_reason: "end_turn" },
      { parsed_output: NARRATIVE_PASS, stop_reason: "end_turn" },
    ]);

    const draft = await draftEstimateFromNotes({ jobName: "Test job", notes: "repaint walls", costCodes: CODES }, client);

    expect(draft.title).toBe("Interior repaint");
    expect(draft.projectDescription).toBe("A full interior repaint of walls and trim.");
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0].unitCostCents).toBe(4_500);
    expect(draft.lineItems[0].rateBasisPoints).toBe(2_000);
    expect(draft.proposalSections).toEqual(NARRATIVE_PASS.proposalSections);
    expect(client.stream).toHaveBeenCalledTimes(2);
  });

  it("uses a higher pricing max_tokens and a separate narrative budget", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([
      { parsed_output: PRICING_PASS, stop_reason: "end_turn" },
      { parsed_output: NARRATIVE_PASS, stop_reason: "end_turn" },
    ]);

    await draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client);

    expect(client.stream.mock.calls[0][0].max_tokens).toBe(ESTIMATE_PRICING_MAX_TOKENS);
    expect(client.stream.mock.calls[1][0].max_tokens).toBe(ESTIMATE_NARRATIVE_MAX_TOKENS);
    expect(ESTIMATE_PRICING_MAX_TOKENS).toBeGreaterThan(16_000);
  });

  it("strips HELOC/financing text from the pricing prompt and records an assumption", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([
      { parsed_output: PRICING_PASS, stop_reason: "end_turn" },
      { parsed_output: NARRATIVE_PASS, stop_reason: "end_turn" },
    ]);

    const draft = await draftEstimateFromNotes(
      {
        jobName: "Test job",
        notes: "Repaint living room. Client financing via HELOC. Budget range: $8k.",
        costCodes: CODES,
      },
      client,
    );

    const pricingPrompt = client.stream.mock.calls[0][0].messages[0].content as string;
    expect(pricingPrompt).toContain("Repaint living room");
    expect(pricingPrompt).not.toMatch(/HELOC/i);
    expect(pricingPrompt).not.toMatch(/Budget range/i);
    expect(draft.assumptions.some((a) => /Financing\/budget notes were kept/i.test(a))).toBe(true);
  });

  it("merges continuation pricing chunks then runs narrative once", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const firstLines = Array.from({ length: 3 }, (_, i) =>
      line({
        costCodeId: "cc_elec_labor",
        groupLabel: "Electrical & Lighting",
        title: `Electrical package ${i + 1}`,
        description: "Trade-grouped rough-in quantities in description",
      }),
    );
    const moreLines = [
      line({
        costCodeId: "cc_floor_allow",
        groupLabel: "Flooring",
        title: "Flooring allowance — LVP",
        description: "Client selection TBD",
      }),
      line({
        costCodeId: "cc_paint_labor",
        groupLabel: "Painting",
        title: "Paint labor — addition",
      }),
    ];

    const client = fakeClient([
      {
        parsed_output: {
          title: "Large addition",
          assumptions: ["Phase 1 of pricing"],
          incomplete: true,
          lineItems: firstLines,
        },
        stop_reason: "end_turn",
      },
      {
        parsed_output: {
          assumptions: ["Phase 2 of pricing"],
          incomplete: false,
          lineItems: moreLines,
        },
        stop_reason: "end_turn",
      },
      {
        parsed_output: {
          projectDescription: "A large residential addition.",
          proposalSections: [
            { title: "Electrical & Lighting", bullets: ["Electrical rough-in and trim"] },
            { title: "Flooring", bullets: ["LVP flooring allowance"] },
            { title: "Painting", bullets: ["Interior paint"] },
          ],
        },
        stop_reason: "end_turn",
      },
    ]);

    const draft = await draftEstimateFromNotes(
      { jobName: "Addition", notes: "big addition with electrical, LVP allowance, paint", costCodes: CODES },
      client,
    );

    expect(client.stream).toHaveBeenCalledTimes(3);
    expect(draft.lineItems).toHaveLength(5);
    expect(draft.lineItems.map((l) => l.title)).toContain("Flooring allowance — LVP");
    expect(draft.assumptions).toEqual(expect.arrayContaining(["Phase 1 of pricing", "Phase 2 of pricing"]));

    const continuationPrompt = client.stream.mock.calls[1][0].messages[0].content as string;
    expect(continuationPrompt).toContain("Line items already emitted");
    expect(continuationPrompt).toContain("Electrical package 1");

    const narrativePrompt = client.stream.mock.calls[2][0].messages[0].content as string;
    expect(narrativePrompt).toContain("Priced line summary");
    expect(narrativePrompt).toContain("Flooring allowance — LVP");
  });

  it("dedupes overlapping lines across pricing chunks", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const shared = line({
      costCodeId: "cc_paint_labor",
      groupLabel: "Painting",
      title: "Paint labor",
    });
    const client = fakeClient([
      {
        parsed_output: { title: "Paint", assumptions: [], incomplete: true, lineItems: [shared] },
        stop_reason: "end_turn",
      },
      {
        parsed_output: {
          assumptions: [],
          incomplete: false,
          lineItems: [
            shared,
            line({ costCodeId: "cc_paint_mat", groupLabel: "Painting", title: "Paint materials" }),
          ],
        },
        stop_reason: "end_turn",
      },
      { parsed_output: NARRATIVE_PASS, stop_reason: "end_turn" },
    ]);

    const draft = await draftEstimateFromNotes({ jobName: "Job", notes: "paint", costCodes: CODES }, client);
    expect(draft.lineItems).toHaveLength(2);
  });

  it("passes the job's real cost codes into the pricing prompt", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([
      { parsed_output: PRICING_PASS, stop_reason: "end_turn" },
      { parsed_output: NARRATIVE_PASS, stop_reason: "end_turn" },
    ]);

    await draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client);

    const call = client.stream.mock.calls[0][0];
    expect(call.messages[0].content).toContain("cc_paint_labor");
    expect(call.messages[0].content).toContain("PAINT-INT-L");
    expect(call.model).toBe("claude-opus-5");
    expect(call.messages[0].content).toContain("Draft PRICING ONLY");
  });

  it("includes company AI preference instructions in the pricing prompt when provided", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([
      { parsed_output: PRICING_PASS, stop_reason: "end_turn" },
      { parsed_output: NARRATIVE_PASS, stop_reason: "end_turn" },
    ]);

    await draftEstimateFromNotes(
      {
        jobName: "Test job",
        notes: "notes",
        costCodes: CODES,
        preferenceInstructions: [
          {
            id: "pref1",
            label: "Separate Interior Painting Section",
            instruction: "Always separate Interior Painting into its own section.",
            forType: "ESTIMATE",
            enabled: true,
            appliesToChangeOrder: false,
          },
        ],
      },
      client,
    );

    const call = client.stream.mock.calls[0][0];
    expect(call.messages[0].content).toContain("Company AI preference instructions");
    expect(call.messages[0].content).toContain("Separate Interior Painting Section");
  });

  it("throws when the model refuses on the pricing pass", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([{ parsed_output: null, stop_reason: "refusal" }]);

    await expect(
      draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });

  it("throws when parsing fails despite a normal stop reason", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([{ parsed_output: null, stop_reason: "end_turn" }]);

    await expect(
      draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });

  it("refuses to draft against an empty cost code catalog", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient([{ parsed_output: PRICING_PASS, stop_reason: "end_turn" }]);

    await expect(
      draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: [] }, client),
    ).rejects.toThrow();
  });
});
