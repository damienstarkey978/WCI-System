/**
 * AI-drafted Daily Log entries (handoff-ai-analysis-and-jarvis-deep-integration-
 * spec.md Part 3.3a — "snap a photo, jot a note, the AI teammate writes the log").
 * A human still reviews and can edit the drafted text before it's ever saved — this
 * only produces a suggestion for the existing note textarea (src/app/jobs/[jobId]/
 * daily-logs/daily-log-form.tsx), it never writes a DailyLog row itself. Weather is
 * unaffected either way: src/lib/daily-logs/service.ts always fetches it live from
 * the job's coordinates at creation time, regardless of how the note was written.
 */

import Anthropic from "@anthropic-ai/sdk";

import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI daily log assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class DailyLogDraftError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DailyLogDraftError";
  }
}

const SYSTEM_PROMPT = `You help field staff at a residential construction company turn a quick, rough note
(and any site photos) into a clear, professional daily log entry.

Rules:
- Write in plain prose, third person or first person as the note implies — a couple
  of short paragraphs at most, not a bulleted report.
- Only describe what's stated in the note or visibly shown in the photos. Never
  invent crew names, quantities, weather, or work not mentioned or shown — this is a
  real project record, not a creative summary.
- If the note is already clear and complete, tidy the grammar rather than padding it
  with invented detail.
- Output only the drafted log entry text — no preamble, no "Here's a draft:", no
  markdown formatting.`;

export type DailyLogImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface DailyLogImageInput {
  readonly base64Data: string;
  readonly mediaType: DailyLogImageMediaType;
}

export interface DraftDailyLogInput {
  readonly notes: string;
  readonly images?: readonly DailyLogImageInput[];
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  cachedClient ??= new Anthropic();
  return cachedClient;
}

/**
 * Call Claude to turn a rough field note (+ optional photos) into a drafted daily
 * log entry. `client` is injectable so callers (and tests) can supply a fake instead
 * of hitting the real API.
 */
export async function draftDailyLogNote(
  input: DraftDailyLogInput,
  client: Pick<Anthropic["messages"], "create"> = getClient().messages,
): Promise<string> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const imageBlocks: Anthropic.ContentBlockParam[] = (input.images ?? []).map((image) => ({
    type: "image",
    source: { type: "base64", media_type: image.mediaType, data: image.base64Data },
  }));

  let message: Anthropic.Message;
  try {
    message = await client.create({
      model: "claude-opus-5",
      max_tokens: 1_024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: `Field note: ${input.notes}` }],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new DailyLogDraftError(`The AI daily log assistant couldn't draft this: ${error.message}`, { cause: error });
    }
    throw error;
  }

  if (message.stop_reason === "refusal") {
    throw new DailyLogDraftError("The AI daily log assistant declined to draft this entry.");
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new DailyLogDraftError("The AI daily log assistant didn't return a draft.");
  }

  return text;
}
