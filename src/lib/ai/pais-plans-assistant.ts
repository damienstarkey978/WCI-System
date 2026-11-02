/**
 * AI pull-products-from-plans → structured PAIS draft rows against org templates.
 * Always a draft for human review; never invents Florida approval numbers.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  buildPaisPlansDraftSchema,
  formatPaisTemplateCatalog,
  normalizePaisPlansDraft,
  type NormalizedPaisPlansDraft,
  type PaisTemplateOption,
  type RawPaisPlansDraft,
} from "@/lib/ai/pais-plans-draft";
import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super(
      "The AI PAIS plans assistant is not configured. Set ANTHROPIC_API_KEY to enable it.",
    );
    this.name = "AiNotConfiguredError";
  }
}

export class DraftGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftGenerationError";
  }
}

export const PAIS_PLANS_DRAFT_MAX_TOKENS = 8_000;

const SYSTEM_PROMPT = `You extract product-approval candidates from residential construction
plan / specification notes for a Florida permit PAIS (Product Approval Information Sheet).

Rules:
- Prefer matching the org's PAIS template catalog (TEMPLATE kind with templateId).
- Never invent a Florida approval / FL number. FREE_TEXT products must omit any FL#.
- If the plans mention a product that is not in the catalog, use FREE_TEXT with
  manufacturer + model only and note the missing catalog match in assumptions.
- Do not invent manufacturer or model names that are not supported by the notes.
- Confidence reflects how clearly the plans call out the product.`;

export interface DraftPaisFromPlansInput {
  readonly jobName: string;
  readonly planNotes: string;
  readonly templates: readonly PaisTemplateOption[];
}

/** Minimal surface for unit tests — injectable instead of a live Anthropic client. */
export interface PaisPlansParseClient {
  readonly messages: {
    parse: (params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: readonly { role: "user"; content: string }[];
      output_config: { format: unknown };
    }) => Promise<{ parsed_output: RawPaisPlansDraft | null }>;
  };
}

function getDefaultClient(): PaisPlansParseClient {
  return new Anthropic() as unknown as PaisPlansParseClient;
}

function buildUserPrompt(input: DraftPaisFromPlansInput): string {
  return `Job: ${input.jobName}

Plan / specification notes:
${input.planNotes}

Org PAIS template catalog (id | name | manufacturer | model | approvalNumber | category):
${formatPaisTemplateCatalog(input.templates)}

Draft PAIS product candidates for this package. Prefer TEMPLATE matches. Never invent FL#.`;
}

export async function draftPaisProductsFromPlans(
  input: DraftPaisFromPlansInput,
  client: PaisPlansParseClient = getDefaultClient(),
): Promise<NormalizedPaisPlansDraft> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const templateIds = input.templates.map((t) => t.id);
  const schema = buildPaisPlansDraftSchema(templateIds);

  try {
    const response = await client.messages.parse({
      model: "claude-sonnet-4-5",
      max_tokens: PAIS_PLANS_DRAFT_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(input) }],
      output_config: { format: zodOutputFormat(schema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new DraftGenerationError("The model returned no structured PAIS plans draft.");
    }
    return normalizePaisPlansDraft(parsed);
  } catch (error) {
    if (error instanceof DraftGenerationError || error instanceof AiNotConfiguredError) throw error;
    throw new DraftGenerationError(
      error instanceof Error ? error.message : "PAIS plans draft generation failed.",
      { cause: error },
    );
  }
}
