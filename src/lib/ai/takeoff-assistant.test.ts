import { describe, expect, it, vi } from "vitest";

import {
  AiNotConfiguredError,
  draftTakeoffFromNotes,
  DraftGenerationError,
  type TakeoffParseClient,
} from "@/lib/ai/takeoff-assistant";
import type { CostCodeOption } from "@/lib/ai/takeoff-draft";

const CODES: readonly CostCodeOption[] = [
  { id: "cc_floor", code: "FLOOR-LVP", name: "LVP Flooring", defaultCostType: "MATERIAL" },
  { id: "cc_paint_mat", code: "PAINT-INT-M", name: "Int Paint Materials", defaultCostType: "MATERIAL" },
];

function fakeClient(parsed: unknown): TakeoffParseClient {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({ parsed_output: parsed }),
    },
  };
}

describe("draftTakeoffFromNotes", () => {
  it("refuses when ANTHROPIC_API_KEY is missing", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        draftTakeoffFromNotes(
          { jobName: "Job", notes: "1200 sf LVP", costCodes: CODES },
          fakeClient(null),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns a normalized takeoff draft", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({
      title: "Flooring takeoff",
      assumptions: ["Confirm room dims"],
      lineItems: [
        {
          costCodeId: "cc_floor",
          groupLabel: "Flooring",
          title: "LVP",
          quantity: 1200,
          unit: "sqft",
          unitCostDollars: 2.75,
          confidence: "HIGH",
        },
      ],
    });

    const draft = await draftTakeoffFromNotes(
      { jobName: "Newcomb 1", notes: "Main level LVP ~1200 sf", costCodes: CODES },
      client,
    );

    expect(draft.title).toBe("Flooring takeoff");
    expect(draft.lineItems).toHaveLength(1);
    expect(draft.lineItems[0].quantityMilli).toBe(1_200_000);
    expect(draft.lineItems[0].unitCostCents).toBe(275);
    expect(client.messages.parse).toHaveBeenCalledOnce();
  });

  it("wraps empty model output as DraftGenerationError", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    await expect(
      draftTakeoffFromNotes({ jobName: "Job", notes: "notes here ok", costCodes: CODES }, fakeClient(null)),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });
});
