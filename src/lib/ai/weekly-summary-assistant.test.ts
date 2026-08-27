import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, generateWeeklySummary, SummaryGenerationError } from "@/lib/ai/weekly-summary-assistant";

const VALID_PARSED_OUTPUT = {
  headline: "Framing wrapped up, drywall starts Monday",
  body: "This week the framing crew finished the second floor walls...",
  highlights: ["Second floor framing complete", "Rough electrical inspection passed"],
};

function fakeClient(response: unknown) {
  return { parse: vi.fn().mockResolvedValue(response) };
}

describe("generateWeeklySummary", () => {
  const input = {
    jobName: "283 Red Cedar",
    periodStart: new Date("2026-08-17T00:00:00.000Z"),
    periodEnd: new Date("2026-08-24T00:00:00.000Z"),
    activityText: "- Site log 2026-08-19: Framing crew finished second floor walls.",
  };

  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        generateWeeklySummary(input, fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" })),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns the parsed draft on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    const draft = await generateWeeklySummary(input, client);

    expect(draft.headline).toBe("Framing wrapped up, drywall starts Monday");
    expect(draft.highlights).toHaveLength(2);
  });

  it("only sends the client-safe activity text, plus job name and dates", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    await generateWeeklySummary(input, client);

    const call = client.parse.mock.calls[0][0];
    expect(call.messages[0].content).toContain("283 Red Cedar");
    expect(call.messages[0].content).toContain("Framing crew finished second floor walls");
    expect(call.model).toBe("claude-opus-5");
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: null, stop_reason: "refusal" });

    await expect(generateWeeklySummary(input, client)).rejects.toBeInstanceOf(SummaryGenerationError);
  });

  it("throws when parsing fails despite a normal stop reason", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: null, stop_reason: "end_turn" });

    await expect(generateWeeklySummary(input, client)).rejects.toBeInstanceOf(SummaryGenerationError);
  });
});
