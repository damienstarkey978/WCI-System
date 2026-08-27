/**
 * AI weekly client-update summaries — Phase 8. Turns a week's worth of
 * client-visible activity on a job into a short, friendly digest for the Client
 * Portal.
 *
 * Safety here is structural, not just prompted: the caller (weekly-summary-
 * service.ts) builds `input.activityText` from ONLY clientVisible DailyLogs and
 * ScheduleItems — no budget, cost, PO, or bill data ever reaches this function's
 * arguments, so there is nothing internal for the model to leak even if the prompt
 * were somehow subverted.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { weeklySummaryDraftSchema, type WeeklySummaryDraft } from "@/lib/ai/weekly-summary-draft";
import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI weekly summary assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class SummaryGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SummaryGenerationError";
  }
}

const SYSTEM_PROMPT = `You write short, friendly weekly progress updates for homeowners whose home is
under construction. Your audience is the client, not the contractor — write in plain
language, no trade jargon, no internal project-management terms.

Rules:
- You will be given only client-facing activity: daily site logs and schedule items
  that are already marked visible to this client. Never mention or imply anything
  about cost, price, budget, profit, or internal scheduling terms like "critical
  path" — those concepts are not in your input, and must never appear in your output
  even if you can infer something adjacent to them.
- If there was little or no activity this week, say so plainly and warmly — don't
  pad the summary with vague filler ("great progress continues!") when there's
  nothing concrete to report.
- Keep the tone warm and confident, like a PM who is genuinely glad to update their
  client, not a corporate status report.`;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export interface GenerateWeeklySummaryInput {
  readonly jobName: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  /** Plain-text digest of ONLY client-visible activity — see the file header. */
  readonly activityText: string;
}

/**
 * Call Claude to write a weekly client-update digest. `client` is injectable so
 * callers (and tests) can supply a fake with a `messages.parse` method instead of
 * hitting the real API.
 */
export async function generateWeeklySummary(
  input: GenerateWeeklySummaryInput,
  client: Pick<Anthropic["messages"], "parse"> = getClient().messages,
): Promise<WeeklySummaryDraft> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const dateRange = `${input.periodStart.toISOString().slice(0, 10)} to ${input.periodEnd.toISOString().slice(0, 10)}`;

  const response = await client.parse({
    model: "claude-opus-5",
    max_tokens: 4_000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          `Job: ${input.jobName}`,
          `Week: ${dateRange}`,
          "",
          "Client-visible activity this week:",
          input.activityText || "(no client-visible activity logged this week)",
          "",
          "Write this week's client update.",
        ].join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(weeklySummaryDraftSchema) },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new SummaryGenerationError(
      `The AI weekly summary assistant could not write this update (stop_reason: ${response.stop_reason}).`,
    );
  }

  return response.parsed_output;
}
