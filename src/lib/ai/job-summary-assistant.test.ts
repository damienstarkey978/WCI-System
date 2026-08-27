import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, generateJobSummary, SummaryGenerationError } from "@/lib/ai/job-summary-assistant";

function fakeClient(response: unknown) {
  return { create: vi.fn().mockResolvedValue(response) };
}

const CONTEXT_INPUT = {
  jobName: "283 Red Cedar",
  contextText: "Budget: original $100,000.00, projected $112,500.00. 2 open RFI(s), 1 open todo(s).",
};

describe("generateJobSummary", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        generateJobSummary(
          CONTEXT_INPUT,
          fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "On track." }] }),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns the response's text block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "  Running about 12% over budget.  " }] });

    const summary = await generateJobSummary(CONTEXT_INPUT, client);

    expect(summary).toBe("Running about 12% over budget.");
  });

  it("sends the internal context text and job name, unmodified", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "On track." }] });

    await generateJobSummary(CONTEXT_INPUT, client);

    const call = client.create.mock.calls[0][0];
    expect(call.messages[0].content).toContain("283 Red Cedar");
    expect(call.messages[0].content).toContain("2 open RFI(s)");
    expect(call.model).toBe("claude-opus-5");
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "refusal", content: [] });

    await expect(generateJobSummary(CONTEXT_INPUT, client)).rejects.toBeInstanceOf(SummaryGenerationError);
  });

  it("throws when the response has no text block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [] });

    await expect(generateJobSummary(CONTEXT_INPUT, client)).rejects.toBeInstanceOf(SummaryGenerationError);
  });
});
