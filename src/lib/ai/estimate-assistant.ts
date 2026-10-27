/**
 * AI-assisted estimate drafting — WCI OS's answer to handoff.ai-style AI proposals.
 *
 * A PM or estimator writes rough field notes ("2 bed 1 bath interior repaint, walls
 * and trim, standard 8ft ceilings, ~1400 sqft"), optionally attaches site photos, and
 * this drafts a full line-item estimate against the org's real cost code catalog —
 * plus the client-facing Proposal narrative (grouped plain-language bullets).
 *
 * Output-size safety (required for large addition scopes):
 * 1. Strip financing / budget-range text from notes before drafting (kept on the lead).
 * 2. Multi-pass generation: pricing passes emit trade-grouped line items (with an
 *    `incomplete` continuation flag); a separate narrative pass emits cover + sections.
 *    Peak structured payload never includes every line *and* the full prose together.
 * 3. Raised per-pass max_tokens (pricing 24k, narrative 8k) vs the old single 16k call
 *    that packed both sides into one structured output.
 *
 * Per the AI-layer principle carried over from CLAUDE.md Phase 8 ("let the PM
 * review/edit before it sends"), the result is always created as a DRAFT estimate —
 * never locked, never sent to budget, never a sent proposal without human approval.
 *
 * After Convert to Proposal, staff/Jarvis can apply a saved Proposal Template
 * (`list_proposal_templates` / `apply_proposal_template`, or the UI apply-template
 * action) for standard prose / payment schedule so the drafter can stay pricing-first.
 *
 * Safety is structural, not just prompted: `costCodeId` is a Zod enum built from the
 * caller's actual catalog (src/lib/ai/estimate-draft.ts), so a schema-validated
 * response cannot contain an invented cost code.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import {
  buildEstimateNarrativeDraftSchema,
  buildEstimatePricingContinuationSchema,
  buildEstimatePricingDraftSchema,
  formatCostCodeCatalog,
  formatMaterialCatalog,
  mergeEstimateDraftParts,
  mergeEstimateLineItemChunks,
  normalizeEstimateDraft,
  type CostCodeOption,
  type MaterialCatalogOption,
  type NormalizedEstimateDraft,
  type RawEstimateLineItem,
  type RawEstimateNarrativeDraft,
  type RawEstimatePricingContinuation,
  type RawEstimatePricingDraft,
} from "@/lib/ai/estimate-draft";
import { stripNonScopeTextFromNotes } from "@/lib/ai/estimate-notes";
import {
  formatAiPreferenceInstructions,
  type AiPreferenceInstructionRow,
} from "@/lib/ai/preference-instructions";
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

/** Pricing pass output budget — line items only (no narrative). */
export const ESTIMATE_PRICING_MAX_TOKENS = 24_000;
/** Narrative pass output budget — cover + sections only. */
export const ESTIMATE_NARRATIVE_MAX_TOKENS = 8_000;
/** Hard stop on continuation pricing passes (each up to ESTIMATE_LINE_ITEMS_PER_PASS). */
export const ESTIMATE_MAX_PRICING_PASSES = 6;

const SYSTEM_PROMPT = `You are an experienced residential construction estimator working for a general
contractor. You draft line-item estimates — and, in a separate pass, the client-facing
proposal narrative — from a PM or salesperson's rough field notes, plus any site photos.

Rules:
- Use ONLY the cost codes given to you in the catalog. Never invent a cost code or
  describe work that doesn't map to any code in the catalog — if nothing fits, leave
  it out and mention the gap in "assumptions" instead.
- Prefer TRADE-GROUPED line items: one Electrical line (or labor + material pair) with
  quantities and task detail in the description, NOT a separate line for every outlet,
  switch, or fixture task. Same for plumbing, HVAC, framing, etc.
- Separate labor and material lines where the catalog has both, rather than one blended
  line — but still keep each at trade granularity, not per-task explosion.
- ALLOWANCES / SELECTIONS: for client-choice finishes (LVP, tile, vanity, ceiling fans,
  lighting fixtures, appliances), prefer a single allowance-style line (title like
  "Flooring allowance — LVP") with selection TBD in the description, rather than
  itemizing every SKU. Note allowances in assumptions when used.
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
- Ignore financing, HELOC, loan, mortgage, budget-range, and payment-plan chatter in
  the notes for pricing — those stay on the lead CRM record, not in the estimate.
- When "Company AI preference instructions" are provided in the user message, follow
  every enabled rule there for grouping, materials, allowances, takeoff detail, and
  proposal narrative. Those rules are the company's real Handoff Presets — do not
  invent conflicting company standards.
- This produces a DRAFT for a human estimator to review, edit, and price-check before
  anything is sent to a client. Do not hedge in the output itself — produce your best
  concrete numbers, and put caveats in "assumptions" instead.`;

const NARRATIVE_SYSTEM_PROMPT = `You write the client-facing proposal narrative for a residential construction
estimate that has already been priced. You receive the estimate title and a compact
summary of priced line items (group, title, description) — not full cost numbers.

Rules:
- projectDescription is the short paragraph a proposal opens with — summarize the
  scope the way you'd describe it to the client in the first breath, one or two
  sentences, plus the key scope numbers (square footage, etc.) if known from the lines.
- proposalSections: write ONE section per groupLabel used in the line summary, with
  plain-language bullets a homeowner would read — no pricing, no cost-code jargon, no
  internal labor-hour breakdowns. Multiple related estimate lines can collapse into
  one client-facing bullet. Owner-supplied / allowance items should be called out.
- When "Company AI preference instructions" are provided, follow enabled PROPOSAL
  rules for narrative tone and structure.
- Do not invent scope that is not reflected in the line summary.`;

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
  /** Org AI preference instructions (Handoff Presets). Optional for backward-compatible callers/tests. */
  readonly preferenceInstructions?: readonly AiPreferenceInstructionRow[];
}

type StreamClient = Pick<Anthropic["messages"], "stream">;

interface StreamParseResult<T> {
  readonly parsed: T;
  readonly stopReason: string | null;
}

async function streamParsedOutput<T>(
  client: StreamClient,
  args: {
    readonly maxTokens: number;
    readonly system: string;
    readonly userContent: string | Anthropic.MessageCreateParams["messages"][0]["content"];
    readonly schema: z.ZodType<T>;
  },
): Promise<StreamParseResult<T>> {
  let response;
  try {
    response = await client
      .stream({
        model: "claude-opus-5",
        max_tokens: args.maxTokens,
        system: args.system,
        messages: [{ role: "user", content: args.userContent }],
        output_config: { format: zodOutputFormat(args.schema) },
      })
      .finalMessage();
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
    const truncated = response.stop_reason === "max_tokens";
    throw new DraftGenerationError(
      truncated
        ? "The AI estimate draft hit the output token ceiling mid-response. Retry with a narrower scope, or the multi-pass path should continue automatically."
        : "The AI did not return a parseable estimate draft.",
    );
  }

  return { parsed: response.parsed_output as T, stopReason: response.stop_reason ?? null };
}

function buildCatalogPreamble(input: {
  readonly jobName: string;
  readonly costCodes: readonly CostCodeOption[];
  readonly materialCatalog: readonly MaterialCatalogOption[];
  readonly preferenceInstructions: readonly AiPreferenceInstructionRow[];
  readonly scopeNotes: string;
}): string {
  return [
    `Job: ${input.jobName}`,
    "",
    "Cost code catalog (id | code | name | default cost type):",
    formatCostCodeCatalog(input.costCodes),
    "",
    "Materials catalog (vendor | description | unit | unit price):",
    formatMaterialCatalog(input.materialCatalog),
    "",
    "Company AI preference instructions (from Handoff Presets — follow these):",
    formatAiPreferenceInstructions(input.preferenceInstructions),
    "",
    "Field notes (scope only — financing/budget-range text already stripped):",
    input.scopeNotes || "(no scope notes after stripping non-scope text)",
  ].join("\n");
}

function summarizeLinesForNarrative(lineItems: readonly RawEstimateLineItem[]): string {
  return lineItems
    .map((line) => {
      const detail = line.description?.trim() ? ` — ${line.description.trim()}` : "";
      return `- [${line.groupLabel}] ${line.title}${detail}`;
    })
    .join("\n");
}

function alreadyEmittedSummary(lineItems: readonly RawEstimateLineItem[]): string {
  if (lineItems.length === 0) return "(none yet)";
  return lineItems.map((line) => `- ${line.groupLabel} / ${line.title} (${line.costCodeId})`).join("\n");
}

/**
 * Call Claude to draft an estimate + its proposal narrative via multi-pass generation.
 * `client` is injectable so callers (and tests) can supply a fake with a `messages.stream`
 * method instead of hitting the real API.
 *
 * Streamed rather than a single blocking `messages.parse()` call: keeps bytes flowing
 * so proxies don't kill long generations (see CLAUDE.md / prior prod 503 notes). Multi-
 * pass + raised max_tokens address the separate failure mode: structured output size.
 */
export async function draftEstimateFromNotes(
  input: DraftEstimateInput,
  client: StreamClient = getClient().messages,
): Promise<NormalizedEstimateDraft> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const costCodeIds = input.costCodes.map((code) => code.id);
  // Throws EmptyCostCodeCatalogError before any API call when the catalog is empty.
  buildEstimatePricingDraftSchema(costCodeIds);

  const { scopeNotes, removedSnippets } = stripNonScopeTextFromNotes(input.notes);
  const materialCatalog = input.materialCatalog ?? [];
  const preferenceInstructions = input.preferenceInstructions ?? [];
  const catalogPreamble = buildCatalogPreamble({
    jobName: input.jobName,
    costCodes: input.costCodes,
    materialCatalog,
    preferenceInstructions,
    scopeNotes,
  });

  const images = input.images ?? [];
  const withImages = (text: string): string | Anthropic.MessageCreateParams["messages"][0]["content"] =>
    images.length === 0
      ? text
      : [
          ...images.map((image) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: image.mediaType, data: image.base64Data },
          })),
          { type: "text" as const, text },
        ];

  const pricingPrompt = [
    catalogPreamble,
    "",
    "Draft PRICING ONLY for this scope: title, trade-grouped lineItems, assumptions.",
    "Do NOT write proposalSections or projectDescription in this pass.",
    "Prefer trade-level lines with quantities in descriptions; use allowance lines for",
    "LVP/tile/vanity/fans/fixtures the client will select later.",
    "If the scope needs more than the per-pass line cap, set incomplete=true and cover",
    "the earliest construction phases first — a continuation pass will follow.",
    images.length ? "Use the attached photos as additional scope context." : "",
  ]
    .filter(Boolean)
    .join("\n");

  const firstPass = await streamParsedOutput<RawEstimatePricingDraft>(client, {
    maxTokens: ESTIMATE_PRICING_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    userContent: withImages(pricingPrompt),
    schema: buildEstimatePricingDraftSchema(costCodeIds),
  });

  // max_tokens mid-JSON usually yields null parsed_output (thrown above). If we got
  // a parse but the model still hit the ceiling, treat it as incomplete and continue.
  let incomplete = firstPass.parsed.incomplete || firstPass.stopReason === "max_tokens";
  const lineChunks: RawEstimateLineItem[][] = [firstPass.parsed.lineItems];
  const assumptionParts: string[][] = [firstPass.parsed.assumptions];
  const title = firstPass.parsed.title;

  let pass = 1;
  while (incomplete && pass < ESTIMATE_MAX_PRICING_PASSES) {
    pass += 1;
    const emitted = mergeEstimateLineItemChunks(lineChunks);
    const continuationPrompt = [
      catalogPreamble,
      "",
      `Estimate title (already chosen): ${title}`,
      "",
      "Line items already emitted — do NOT repeat these:",
      alreadyEmittedSummary(emitted),
      "",
      "Continue PRICING ONLY for the remaining scope. Emit only NEW trade-grouped",
      "lineItems. Set incomplete=false when the priced scope is fully covered.",
    ].join("\n");

    const continuation = await streamParsedOutput<RawEstimatePricingContinuation>(client, {
      maxTokens: ESTIMATE_PRICING_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // Continuations are text-only — images already informed the first pass.
      userContent: continuationPrompt,
      schema: buildEstimatePricingContinuationSchema(costCodeIds),
    });

    lineChunks.push(continuation.parsed.lineItems);
    if (continuation.parsed.assumptions.length > 0) {
      assumptionParts.push(continuation.parsed.assumptions);
    }
    incomplete = continuation.parsed.incomplete || continuation.stopReason === "max_tokens";
  }

  if (incomplete) {
    assumptionParts.push([
      `Pricing stopped after ${ESTIMATE_MAX_PRICING_PASSES} passes with remaining scope flagged incomplete — review and add missing trades before sending.`,
    ]);
  }

  const lineItems = mergeEstimateLineItemChunks(lineChunks);
  if (lineItems.length === 0) {
    throw new DraftGenerationError("The AI returned no priced line items.");
  }

  const narrativePrompt = [
    `Job: ${input.jobName}`,
    `Estimate title: ${title}`,
    "",
    "Company AI preference instructions (from Handoff Presets — follow these):",
    formatAiPreferenceInstructions(preferenceInstructions),
    "",
    "Priced line summary (group | title — description):",
    summarizeLinesForNarrative(lineItems),
    "",
    "Write the client-facing projectDescription and proposalSections only.",
    "One proposal section per groupLabel in the summary. No pricing numbers.",
  ].join("\n");

  const narrative = await streamParsedOutput<RawEstimateNarrativeDraft>(client, {
    maxTokens: ESTIMATE_NARRATIVE_MAX_TOKENS,
    system: NARRATIVE_SYSTEM_PROMPT,
    userContent: narrativePrompt,
    schema: buildEstimateNarrativeDraftSchema(),
  });

  const financingAssumptions =
    removedSnippets.length > 0
      ? [
          `Financing/budget notes were kept on the lead and not used for pricing (${removedSnippets.length} snippet(s) stripped).`,
        ]
      : [];

  const assumptions = dedupeStrings([
    ...assumptionParts.flat(),
    ...financingAssumptions,
  ]);

  const merged = mergeEstimateDraftParts({
    title,
    lineItems,
    assumptions,
    projectDescription: narrative.parsed.projectDescription,
    proposalSections: narrative.parsed.proposalSections,
  });

  return normalizeEstimateDraft(merged);
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}
