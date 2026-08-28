/**
 * Live web-search fallback pricing (CLAUDE.md's AI estimating layer, extending the
 * staff-maintained Materials Catalog). Neither Lowe's nor Home Depot has a public
 * pricing API, so until one is integrated, this is the other half of the two-tier
 * pricing design in src/lib/materials/service.ts: staff enter verified prices by
 * hand, and this looks a price up on the open web on request, saving it back as an
 * unverified WEB_SEARCH-sourced catalog entry for a human to confirm.
 *
 * This is deliberately a separate, plain-text call rather than combined with
 * structured output (`output_config.format`) in one request — Claude's web search
 * tool runs its own multi-step tool loop before it can answer, and mixing that
 * with a strict output schema in a single call isn't supported. Instead the model
 * is instructed to answer in one strict single-line format, which a plain regex
 * parses — simpler and more robust than trying to force JSON out of a tool-using
 * turn.
 */

import Anthropic from "@anthropic-ai/sdk";

import { isAnthropicConfigured } from "@/lib/env";
import { parseDollarsToCents, type Cents } from "@/lib/money";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Web price lookup is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class WebPriceSearchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WebPriceSearchError";
  }
}

export interface WebMarketPrice {
  readonly vendor: "LOWES" | "HOME_DEPOT" | "OTHER";
  readonly unit: string;
  readonly unitCostCents: Cents;
  readonly sourceUrl: string;
}

const SYSTEM_PROMPT = `You look up current U.S. retail prices for construction materials using web search,
preferring Lowe's or Home Depot's own listed price for the item when you can find it.

Answer with EXACTLY ONE line, no other text before or after it, in this exact format:
PRICE: <vendor> | <price in dollars, digits and a decimal point only, no $ sign> | <unit of measure, e.g. EA, LF, SQFT, BAG> | <the URL of the page you found the price on>

<vendor> must be exactly one of: LOWES, HOME_DEPOT, OTHER

If you cannot find a real, current price for this item after searching, answer with exactly:
NOT_FOUND`;

const RESULT_PATTERN = /^PRICE:\s*(LOWES|HOME_DEPOT|OTHER)\s*\|\s*([\d.]+)\s*\|\s*([^|]+?)\s*\|\s*(\S+)\s*$/;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

/**
 * Search the web for a current market price for a material. Returns null when
 * nothing usable was found (never throws for a plain "not found" — only for a
 * real configuration or API failure, since a human explicitly asked for this and
 * should see why it didn't work).
 */
export async function searchWebForMaterialPrice(
  description: string,
  client: Pick<Anthropic["messages"], "create"> = getClient().messages,
): Promise<WebMarketPrice | null> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  let response;
  try {
    response = await client.create({
      model: "claude-opus-5",
      max_tokens: 2_048,
      system: SYSTEM_PROMPT,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: `Find the current price for: ${description}` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new WebPriceSearchError(`Web price lookup failed: ${error.message}`, { cause: error });
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new WebPriceSearchError("The web price lookup was declined.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  const match = RESULT_PATTERN.exec(text);
  if (!match) return null;

  const [, vendor, dollars, unit, sourceUrl] = match;
  return {
    vendor: vendor as WebMarketPrice["vendor"],
    unit: unit.trim(),
    unitCostCents: parseDollarsToCents(dollars),
    sourceUrl,
  };
}
