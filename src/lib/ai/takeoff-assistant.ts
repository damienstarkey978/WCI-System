/**
 * AI quantity takeoff from plans/measurement notes → structured lines against the
 * org cost-code catalog. Always DRAFT for human review; never queues purchasing or
 * creates a PO (explicit conversion lives in src/lib/takeoffs/service.ts).
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  buildTakeoffDraftSchema,
  formatCostCodeCatalog,
  normalizeTakeoffDraft,
  type CostCodeOption,
  type NormalizedTakeoffDraft,
  type RawTakeoffDraft,
} from "@/lib/ai/takeoff-draft";
import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI takeoff assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class DraftGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftGenerationError";
  }
}

export const TAKEOFF_DRAFT_MAX_TOKENS = 12_000;

const SYSTEM_PROMPT = `You are an experienced residential construction estimator producing a
quantity takeoff for purchasing. Given plan/measurement notes (and optional dimensions),
emit structured takeoff lines the purchasing agent can order from.

Rules:
- Use ONLY the cost codes in the catalog. Never invent a cost code.
- Prefer MATERIAL lines for things that must be purchased (lumber, LVP, stucco mix, paint).
  Include LABOR quantity lines only when the notes clearly call for labor takeoff.
- Quantities must be numbers with a clear unit (sqft, lf, ea, cy, sheets, gallons).
- Apply a reasonable waste factor when notes imply cutting/fit (state it in description).
- If a dimension is missing, put a LOW-confidence line with a conservative estimate and
  name the gap in assumptions — do not invent precise plan measurements you were not given.
- Group by trade (Framing, Flooring, Stucco, Paint, Electrical materials, etc.).
- unitCostDollars may be 0 when unknown; prefer a market-rate estimate when the notes
  or typical residential Jacksonville pricing make a ballpark reasonable.`;

export interface DraftTakeoffInput {
  readonly jobName: string;
  readonly notes: string;
  readonly costCodes: readonly CostCodeOption[];
}

/** Minimal surface for unit tests — injectable instead of a live Anthropic client. */
export interface TakeoffParseClient {
  readonly messages: {
    parse: (params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: readonly { role: "user"; content: string }[];
      output_config: { format: unknown };
    }) => Promise<{ parsed_output: RawTakeoffDraft | null }>;
  };
}

function getDefaultClient(): TakeoffParseClient {
  return new Anthropic() as unknown as TakeoffParseClient;
}

function buildUserPrompt(input: DraftTakeoffInput): string {
  return `Job: ${input.jobName}

Plan / measurement notes:
${input.notes}

Cost code catalog (id | code | name | default type):
${formatCostCodeCatalog(input.costCodes)}

Draft a purchasing-oriented quantity takeoff for this job.`;
}

export async function draftTakeoffFromNotes(
  input: DraftTakeoffInput,
  client: TakeoffParseClient = getDefaultClient(),
): Promise<NormalizedTakeoffDraft> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const costCodeIds = input.costCodes.map((code) => code.id);
  const schema = buildTakeoffDraftSchema(costCodeIds);

  try {
    const response = await client.messages.parse({
      model: "claude-sonnet-4-5",
      max_tokens: TAKEOFF_DRAFT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      output_config: { format: zodOutputFormat(schema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new DraftGenerationError("The model returned no structured takeoff draft.");
    }
    return normalizeTakeoffDraft(parsed);
  } catch (error) {
    if (error instanceof DraftGenerationError || error instanceof AiNotConfiguredError) throw error;
    throw new DraftGenerationError(
      error instanceof Error ? error.message : "Takeoff draft generation failed.",
      { cause: error },
    );
  }
}
