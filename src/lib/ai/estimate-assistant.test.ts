import { describe, expect, it, vi } from "vitest";

import { RateMode } from "@/generated/prisma/enums";
import {
  AiNotConfiguredError,
  draftEstimateFromNotes,
  DraftGenerationError,
} from "@/lib/ai/estimate-assistant";
import type { CostCodeOption } from "@/lib/ai/estimate-draft";

const CODES: readonly CostCodeOption[] = [
  { id: "cc_paint_labor", code: "PAINT-INT-L", name: "Int Paint Labor", defaultCostType: "LABOR" },
  { id: "cc_paint_mat", code: "PAINT-INT-M", name: "Int Paint Materials", defaultCostType: "MATERIAL" },
];

const VALID_PARSED_OUTPUT = {
  title: "Interior repaint",
  projectDescription: "A full interior repaint of walls and trim.",
  assumptions: ["Assumes standard 8ft ceilings"],
  lineItems: [
    {
      costCodeId: "cc_paint_labor",
      groupLabel: "Painting",
      title: "Paint labor",
      quantity: 40,
      unitCostDollars: 45,
      ratePercent: 20,
      rateMode: RateMode.MARKUP,
      confidence: "HIGH" as const,
      priceSource: "MARKET_RATE" as const,
    },
  ],
  proposalSections: [{ title: "Painting", bullets: ["Paint all interior walls and trim, two coats"] }],
};

function fakeClient(response: unknown) {
  return { parse: vi.fn().mockResolvedValue(response) };
}

describe("draftEstimateFromNotes", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        draftEstimateFromNotes(
          { jobName: "Test job", notes: "notes", costCodes: CODES },
          fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" }),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns a normalized draft on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    const draft = await draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client);

    expect(draft.title).toBe("Interior repaint");
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0].unitCostCents).toBe(4_500);
    expect(draft.lineItems[0].rateBasisPoints).toBe(2_000);
  });

  it("passes the job's real cost codes into the schema, not a placeholder", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    await draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client);

    const call = client.parse.mock.calls[0][0];
    expect(call.messages[0].content).toContain("cc_paint_labor");
    expect(call.messages[0].content).toContain("PAINT-INT-L");
    expect(call.model).toBe("claude-opus-5");
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: null, stop_reason: "refusal" });

    await expect(
      draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });

  it("throws when parsing fails despite a normal stop reason", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: null, stop_reason: "end_turn" });

    await expect(
      draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: CODES }, client),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });

  it("refuses to draft against an empty cost code catalog", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    await expect(
      draftEstimateFromNotes({ jobName: "Test job", notes: "notes", costCodes: [] }, client),
    ).rejects.toThrow();
  });
});
