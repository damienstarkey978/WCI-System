/**
 * AI-generated bid comparison summary (handoff.ai feature-parity pass) — a short
 * narrative over the same computed comparison grid the Bid Comparison page renders
 * (src/lib/bids/comparison.ts), for a PM who wants the gist without reading every
 * line. Free text, not structured output — nothing downstream parses this, and it
 * is deliberately not persisted (same reasoning as src/lib/ai/job-summary-assistant.ts):
 * it's a point-in-time read over live bid data, not a record to look back on later.
 */

import Anthropic from "@anthropic-ai/sdk";

import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI bid comparison assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class SummaryGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SummaryGenerationError";
  }
}

const SYSTEM_PROMPT = `You write short bid-comparison summaries for a construction project manager
deciding which subcontractor/vendor to award a bid package to. You will be given
the package's line items and, per vendor, their status, total price, per-line
pricing (when they itemized), any extra items they added that weren't on the
original list, and their free-text notes.

Rules:
- Lead with which vendor is cheapest overall, by how much, in dollars.
- Call out anything that changes the picture beyond raw price: a vendor who
  didn't itemize (so their number can't be checked line-by-line), notable price
  gaps on a specific line item, extra items one vendor added that others
  didn't quote, or a concerning/reassuring note.
- If only one vendor has responded, say so plainly rather than "comparing" one bid
  to itself.
- 3-5 sentences, plain prose, no headers or bullet list — this is a quick read
  before a decision, not a report.
- Never invent a number, vendor, or note that wasn't given to you.`;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export interface GenerateBidComparisonSummaryInput {
  readonly packageTitle: string;
  /** Rendered by the caller from computeBidComparison's result — see comparison-context.ts. */
  readonly contextText: string;
}

/**
 * Call Claude to write a bid comparison summary. `client` is injectable so callers
 * (and tests) can supply a fake instead of hitting the real API.
 */
export async function generateBidComparisonSummary(
  input: GenerateBidComparisonSummaryInput,
  client: Pick<Anthropic["messages"], "create"> = getClient().messages,
): Promise<string> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const response = await client.create({
    model: "claude-opus-5",
    max_tokens: 1_000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [`Bid package: ${input.packageTitle}`, "", input.contextText, "", "Summarize this comparison."].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new SummaryGenerationError("The AI bid comparison assistant declined to summarize this comparison.");
  }

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock || textBlock.text.trim().length === 0) {
    throw new SummaryGenerationError(`The AI bid comparison assistant returned no text (stop_reason: ${response.stop_reason}).`);
  }

  return textBlock.text.trim();
}
