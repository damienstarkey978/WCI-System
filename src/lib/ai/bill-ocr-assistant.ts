/**
 * AI receipt/bill OCR — Phase 8. A staff member or agent photographs/scans a
 * receipt or vendor invoice; this extracts vendor, date, and line items against the
 * org's real cost code catalog, the same structural safety property as AI estimate
 * drafting (src/lib/ai/estimate-assistant.ts): `costCodeId` is a Zod enum built from
 * the actual catalog, so a hallucinated code cannot pass schema validation.
 *
 * The result is never auto-approved — src/lib/ai/bill-ocr-service.ts persists it as
 * a real Bill with `fromOcr: true` and the normal `IN_REVIEW` default approval
 * status, so it goes through the exact same human review as a hand-entered bill.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import {
  buildBillOcrSchema,
  formatCostCodeCatalog,
  normalizeBillOcrExtraction,
  type CostCodeOption,
  type NormalizedBillOcrExtraction,
} from "@/lib/ai/bill-ocr-draft";
import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI bill OCR assistant is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class OcrExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OcrExtractionError";
  }
}

const SYSTEM_PROMPT = `You are a bookkeeper's assistant reading scanned receipts and vendor invoices for a
residential construction company. You extract structured data so a human bookkeeper
can review and approve it before it's paid — you never make payment decisions.

Rules:
- Read the vendor name, document/invoice number, and date exactly as printed. If a
  field isn't printed or isn't legible, say so in "assumptions" and use null rather
  than guessing.
- Use ONLY the cost codes given to you in the catalog for each line item. Never
  invent a cost code — if a charge doesn't clearly map to any code in the catalog,
  pick the closest reasonable one and say so explicitly in "assumptions" instead of
  silently misclassifying it.
- Break out the document's own line items where legible (materials, labor, delivery,
  tax, fees) rather than collapsing everything into one line — a bookkeeper needs to
  see what they're approving.
- If the image is blurry, cropped, or partially illegible, extract what you can read
  confidently and list every illegible or uncertain field in "assumptions" — never
  fabricate a number to fill a gap.
- This produces a DRAFT bill for a human to review before it's approved for payment.
  Report your best concrete reading of the document; put caveats in "assumptions".`;

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export type BillOcrImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export interface BillOcrDocumentInput {
  /** Base64-encoded image or PDF bytes, no data-URL prefix. */
  readonly data: string;
  readonly mediaType: BillOcrImageMediaType | "application/pdf";
}

export interface ExtractBillFromDocumentInput {
  readonly document: BillOcrDocumentInput;
  readonly costCodes: readonly CostCodeOption[];
}

function documentContentBlock(document: BillOcrDocumentInput): Anthropic.ContentBlockParam {
  if (document.mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: document.data } };
  }
  return { type: "image", source: { type: "base64", media_type: document.mediaType, data: document.data } };
}

/**
 * Call Claude to extract bill data from a receipt/invoice image or PDF. `client` is
 * injectable so callers (and tests) can supply a fake with a `messages.parse` method
 * instead of hitting the real API.
 */
export async function extractBillFromDocument(
  input: ExtractBillFromDocumentInput,
  client: Pick<Anthropic["messages"], "parse"> = getClient().messages,
): Promise<NormalizedBillOcrExtraction> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const schema = buildBillOcrSchema(input.costCodes.map((code) => code.id));
  const catalog = formatCostCodeCatalog(input.costCodes);

  const response = await client.parse({
    model: "claude-opus-5",
    max_tokens: 8_000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          documentContentBlock(input.document),
          {
            type: "text",
            text: [
              "Cost code catalog (id | code | name | default cost type):",
              catalog,
              "",
              "Extract this receipt/bill's data per the schema.",
            ].join("\n"),
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new OcrExtractionError(
      `The AI bill OCR assistant could not extract this document (stop_reason: ${response.stop_reason}).`,
    );
  }

  return normalizeBillOcrExtraction(response.parsed_output);
}
