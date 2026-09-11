/**
 * POST /api/staff/bills/ocr-diagnose — admin-only. Takes one receipt image and
 * reports, step by step, exactly where bill OCR gives up on it.
 *
 * This exists because the vision API's refusal is a bare "Could not process image",
 * which is the same message for an oversized scan, a mislabelled file, a truncated
 * upload and a request the API won't take for reasons that have nothing to do with
 * the picture. Every one of those was a live theory for the inbound-email failures,
 * and none could be told apart from the outside.
 *
 * So each step runs independently and reports its own result rather than stopping at
 * the first failure. The two that matter most are the last two: the same image is
 * sent once as a plain vision request and once as the real OCR request, which are
 * identical but for the schema-constrained output. If the plain call succeeds and
 * the OCR call fails, the image was never the problem.
 */

import Anthropic from "@anthropic-ai/sdk";

import { UserRole } from "@/generated/prisma/enums";
import {
  imageFingerprint,
  imageInternals,
  probeImage,
  rejectionReason,
  structuralDefect,
} from "@/lib/ai/image-probe";
import { extractBillFromDocument, type BillOcrDocumentInput } from "@/lib/ai/bill-ocr-assistant";
import { AuthConfigurationError, requireRole } from "@/lib/auth";
import { isAnthropicConfigured } from "@/lib/env";

const ACCEPTED = new Set<BillOcrDocumentInput["mediaType"]>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

interface StepResult {
  readonly step: string;
  readonly ok: boolean;
  readonly detail: string;
  readonly requestId?: string;
}

function failureOf(error: unknown): { detail: string; requestId?: string } {
  const requestId = (error as { request_id?: unknown } | null)?.request_id;
  return {
    detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    requestId: typeof requestId === "string" && requestId.length > 0 ? requestId : undefined,
  };
}

/** The same image, with nothing but a trivial instruction and no output schema. */
async function plainVisionCall(document: BillOcrDocumentInput): Promise<StepResult> {
  const source =
    document.mediaType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: document.data } } as const)
      : ({ type: "image", source: { type: "base64", media_type: document.mediaType, data: document.data } } as const);

  try {
    const response = await new Anthropic().messages.create({
      model: "claude-opus-5",
      max_tokens: 64,
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: "In five words or fewer, what is this a picture of?" }],
        },
      ],
    });
    const text = response.content.find((block) => block.type === "text");
    return {
      step: "plain vision call (no output schema)",
      ok: true,
      detail: text?.type === "text" ? text.text.trim() : "(no text in response)",
    };
  } catch (error) {
    const { detail, requestId } = failureOf(error);
    return { step: "plain vision call (no output schema)", ok: false, detail, requestId };
  }
}

/** The real OCR request: same image, schema-constrained output. */
async function ocrCall(document: BillOcrDocumentInput): Promise<StepResult> {
  try {
    const extraction = await extractBillFromDocument({
      document,
      costCodes: [{ id: "diagnostic", code: "000", name: "Diagnostic", defaultCostType: "MATERIAL" }],
    });
    return {
      step: "bill OCR call (schema-constrained output)",
      ok: true,
      detail: `read ${extraction.lineItems.length} line item(s) from "${extraction.vendorName ?? "unnamed vendor"}"`,
    };
  } catch (error) {
    const { detail, requestId } = failureOf(error);
    return { step: "bill OCR call (schema-constrained output)", ok: false, detail, requestId };
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(UserRole.ADMIN);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
    }
    throw error;
  }

  let payload: { mimeType?: unknown; dataBase64?: unknown; fileName?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: { code: "invalid_body", message: "Body must be JSON." } }, { status: 400 });
  }

  const mediaType = String(payload.mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (!ACCEPTED.has(mediaType as BillOcrDocumentInput["mediaType"])) {
    return Response.json(
      { error: { code: "unsupported_type", message: `mimeType must be one of ${[...ACCEPTED].join(", ")}.` } },
      { status: 400 },
    );
  }
  if (typeof payload.dataBase64 !== "string" || payload.dataBase64.length === 0) {
    return Response.json(
      { error: { code: "missing_data", message: "dataBase64 is required (no data: prefix)." } },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(payload.dataBase64, "base64");
  const document: BillOcrDocumentInput = {
    data: bytes.toString("base64"),
    mediaType: mediaType as BillOcrDocumentInput["mediaType"],
  };

  const steps: StepResult[] = [
    {
      step: "base64 survives a decode/re-encode round trip",
      // If this ever fails, the string sent to the API is not the string that was
      // uploaded, and nothing further in the report can be trusted.
      ok: document.data === payload.dataBase64.replace(/\s/g, ""),
      detail: `${payload.dataBase64.length} chars in, ${document.data.length} out, ${bytes.byteLength} bytes decoded`,
    },
    {
      step: "bytes identify as a readable format",
      ok: probeImage(bytes).format !== "unknown",
      detail: imageFingerprint(bytes),
    },
    {
      step: "file structure is complete and undamaged",
      ok: structuralDefect(bytes) === null,
      detail: structuralDefect(bytes) ?? "all sections present and checksums agree",
    },
    {
      step: "passes the pre-flight the inbound-email path applies",
      ok: rejectionReason(bytes, mediaType) === null,
      detail: rejectionReason(bytes, mediaType) ?? "accepted",
    },
  ];

  if (!isAnthropicConfigured()) {
    steps.push({
      step: "vision API calls",
      ok: false,
      detail: "skipped — ANTHROPIC_API_KEY is not set in this environment",
    });
  } else {
    // Sequential, not parallel: a rate limit on one would be reported as a failure
    // of the other, and telling these two apart is the whole point of the route.
    steps.push(await plainVisionCall(document));
    steps.push(await ocrCall(document));
  }

  return Response.json({
    fileName: typeof payload.fileName === "string" ? payload.fileName : null,
    fingerprint: imageFingerprint(bytes),
    // What a dimension check cannot see. If every step below passes and the API
    // still refuses the file, the answer is in here.
    internals: imageInternals(bytes),
    steps,
    verdict: steps.find((step) => !step.ok)?.step ?? "every step succeeded",
  });
}
