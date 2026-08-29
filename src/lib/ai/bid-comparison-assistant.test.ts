import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, generateBidComparisonSummary, SummaryGenerationError } from "@/lib/ai/bid-comparison-assistant";

function fakeClient(response: unknown) {
  return { create: vi.fn().mockResolvedValue(response) };
}

const CONTEXT_INPUT = {
  packageTitle: "Framing",
  contextText: "Acme Framing: SUBMITTED, itemized, total $4,000.00.\nBravo Framing: SUBMITTED, flat total $3,500.00.",
};

describe("generateBidComparisonSummary", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        generateBidComparisonSummary(
          CONTEXT_INPUT,
          fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "Bravo is cheaper." }] }),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns the response's text block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "  Bravo Framing is $500 cheaper.  " }] });

    const summary = await generateBidComparisonSummary(CONTEXT_INPUT, client);

    expect(summary).toBe("Bravo Framing is $500 cheaper.");
  });

  it("sends the package title and comparison context, unmodified", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "Bravo is cheaper." }] });

    await generateBidComparisonSummary(CONTEXT_INPUT, client);

    const call = client.create.mock.calls[0][0];
    expect(call.messages[0].content).toContain("Framing");
    expect(call.messages[0].content).toContain("Bravo Framing: SUBMITTED");
    expect(call.model).toBe("claude-opus-5");
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "refusal", content: [] });

    await expect(generateBidComparisonSummary(CONTEXT_INPUT, client)).rejects.toBeInstanceOf(SummaryGenerationError);
  });

  it("throws when the response has no text block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [] });

    await expect(generateBidComparisonSummary(CONTEXT_INPUT, client)).rejects.toBeInstanceOf(SummaryGenerationError);
  });
});
