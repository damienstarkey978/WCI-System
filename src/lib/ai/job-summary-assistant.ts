/**
 * Agent-facing job status summarization — Phase 8. Unlike the weekly client digest,
 * this is written for staff/agents (Jarvis, Hank, ...), so it's allowed to say
 * exactly what the budget/schedule numbers are — there is no client-safety boundary
 * here. It is also deliberately NOT persisted: it's a point-in-time read, meant for
 * a Slack message or a chat reply, not a record anyone needs to look back at later
 * (that's what the underlying Budget/Schedule/RFI data already is).
 *
 * Free text, not structured output — nothing downstream parses this into a database
 * write, so there is no schema-validation safety property to buy here.
 */

import Anthropic from "@anthropic-ai/sdk";

import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI job summary assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class SummaryGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SummaryGenerationError";
  }
}

const SYSTEM_PROMPT = `You write concise job-status summaries for construction project managers and the
agents that assist them (Jarvis, Hank, Duke, Vince, Neil). Your audience already
knows the domain — use normal PM/financial terms freely (budget, committed cost,
critical path, RFI, etc.) rather than simplifying for a layperson.

Rules:
- Lead with the single most important thing about this job right now (behind
  schedule, over budget, blocked on an RFI, or "on track" if genuinely nothing is
  wrong — don't manufacture a concern that isn't there).
- Cite the actual numbers and item counts you were given rather than vague terms
  ("significantly over budget" -> give the dollar amount and the percent).
- 3-6 sentences. This is a status update, not a report — no headers, no bullet list,
  plain prose suitable for a chat message.`;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export interface GenerateJobSummaryInput {
  readonly jobName: string;
  /** Internal status context — budget, schedule, open items. Not client-safe. */
  readonly contextText: string;
}

/**
 * Call Claude to write a job status summary. `client` is injectable so callers (and
 * tests) can supply a fake instead of hitting the real API.
 */
export async function generateJobSummary(
  input: GenerateJobSummaryInput,
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
        content: [`Job: ${input.jobName}`, "", input.contextText, "", "Summarize this job's current status."].join("\n"),
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new SummaryGenerationError("The AI job summary assistant declined to summarize this job.");
  }

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock || textBlock.text.trim().length === 0) {
    throw new SummaryGenerationError(`The AI job summary assistant returned no text (stop_reason: ${response.stop_reason}).`);
  }

  return textBlock.text.trim();
}
