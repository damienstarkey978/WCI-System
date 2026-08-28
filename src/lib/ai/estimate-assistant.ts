/**
 * AI-assisted estimate drafting — WCI OS's answer to handoff.ai-style AI proposals.
 *
 * A PM or estimator writes rough field notes ("2 bed 1 bath interior repaint, walls
 * and trim, standard 8ft ceilings, ~1400 sqft"), optionally attaches site photos, and
 * this drafts a full line-item estimate against the org's real cost code catalog —
 * plus, in the same call, the client-facing Proposal narrative (grouped plain-language
 * bullets) that goes with it. Per the AI-layer principle carried over from CLAUDE.md
 * Phase 8 ("let the PM review/edit before it sends"), the result is always created as
 * a DRAFT estimate — it is never locked, never sent to budget, and never becomes a
 * sent proposal without a human approving it.
 *
 * Safety is structural, not just prompted: `costCodeId` is a Zod enum built from the
 * caller's actual catalog (src/lib/ai/estimate-draft.ts), so a schema-validated
 * response cannot contain an invented cost code.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  buildEstimateDraftSchema,
  formatCostCodeCatalog,
  formatMaterialCatalog,
  normalizeEstimateDraft,
  type CostCodeOption,
  type MaterialCatalogOption,
  type NormalizedEstimateDraft,
} from "@/lib/ai/estimate-draft";
import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI estimate assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class DraftGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DraftGenerationError";
  }
}

const SYSTEM_PROMPT = `You are an experienced residential construction estimator working for a general
contractor. You draft line-item estimates — and the client-facing proposal narrative
that goes with them — from a PM or salesperson's rough field notes, plus any site
photos they attach.

Rules:
- Use ONLY the cost codes given to you in the catalog. Never invent a cost code or
  describe work that doesn't map to any code in the catalog — if nothing fits, leave
  it out and mention the gap in "assumptions" instead.
- Break the work into the same granularity a real estimate uses: separate labor and
  material lines where the catalog has both, rather than one blended line.
- Group every line under a groupLabel matching standard residential construction
  phases (Plans & Permitting, Demolition & Site Prep, Foundation & Concrete, Framing &
  Structural, Roofing, Windows & Doors, Stucco & Exterior Finish, Electrical &
  Lighting, Insulation & Drywall, Cabinets & Trim, Painting, Cleanup & Final
  Inspection, etc.) — use whichever of these actually apply to the scope, in
  construction sequence order.
- For material lines, check the given materials catalog FIRST and use its price
  verbatim (mark priceSource "CATALOG") when an item matches. Only fall back to a
  realistic current U.S. market rate (priceSource "MARKET_RATE") when nothing in the
  catalog matches.
- Where the notes or photos don't give you a quantity or a clear scope, make a
  reasonable assumption and say so explicitly in "assumptions" — never silently guess
  on something that materially changes the price.
- Mark each line's "confidence" honestly: HIGH when the notes/photos gave you a clear
  scope and quantity, MEDIUM when you inferred a reasonable quantity, LOW when you are
  largely guessing and the estimator should treat the line as a placeholder.
- For proposalSections: write ONE section per groupLabel used in lineItems, with
  plain-language bullets a homeowner would read — no pricing, no cost-code jargon, no
  internal labor-hour breakdowns. Multiple related estimate lines can collapse into
  one client-facing bullet (e.g. three separate concrete material lines become one
  bullet: "Pour and finish a new concrete slab-on-grade"). Owner-supplied /
  allowance items should be called out as such.
- projectDescription is the short paragraph a proposal opens with — summarize the
  scope the way you'd describe it to the client in the first breath, one or two
  sentences, plus the key scope numbers (square footage, etc.) if known.
- This produces a DRAFT for a human estimator to review, edit, and price-check before
  anything is sent to a client. Do not hedge in the output itself — produce your best
  concrete numbers, and put caveats in "assumptions" instead.`;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export interface DraftEstimateImageInput {
  readonly base64Data: string;
  readonly mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export interface DraftEstimateInput {
  readonly jobName: string;
  readonly notes: string;
  readonly costCodes: readonly CostCodeOption[];
  readonly materialCatalog?: readonly MaterialCatalogOption[];
  readonly images?: readonly DraftEstimateImageInput[];
}

/**
 * Call Claude to draft an estimate + its proposal narrative. `client` is injectable
 * so callers (and tests) can supply a fake with a `messages.parse` method instead of
 * hitting the real API.
 */
export async function draftEstimateFromNotes(
  input: DraftEstimateInput,
  client: Pick<Anthropic["messages"], "parse"> = getClient().messages,
): Promise<NormalizedEstimateDraft> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const schema = buildEstimateDraftSchema(input.costCodes.map((code) => code.id));
  const catalog = formatCostCodeCatalog(input.costCodes);
  const materials = formatMaterialCatalog(input.materialCatalog ?? []);

  const promptText = [
    `Job: ${input.jobName}`,
    "",
    "Cost code catalog (id | code | name | default cost type):",
    catalog,
    "",
    "Materials catalog (vendor | description | unit | unit price):",
    materials,
    "",
    "Field notes:",
    input.notes,
    "",
    "Draft a line-item estimate and its client-facing proposal sections from these notes" +
      (input.images?.length ? " and the attached photos." : "."),
  ].join("\n");

  const images = input.images ?? [];
  const userContent =
    images.length === 0
      ? promptText
      : [
          ...images.map((image) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: image.mediaType, data: image.base64Data },
          })),
          { type: "text" as const, text: promptText },
        ];

  let response;
  try {
    response = await client.parse({
      model: "claude-opus-5",
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
      output_config: { format: zodOutputFormat(schema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new DraftGenerationError(`The AI estimate assistant call failed: ${error.message}`, { cause: error });
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new DraftGenerationError("The AI declined to draft this estimate.");
  }
  if (!response.parsed_output) {
    throw new DraftGenerationError("The AI did not return a parseable estimate draft.");
  }

  return normalizeEstimateDraft(response.parsed_output);
}
