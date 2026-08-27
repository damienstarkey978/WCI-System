import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, extractBillFromDocument, OcrExtractionError } from "@/lib/ai/bill-ocr-assistant";
import type { CostCodeOption } from "@/lib/ai/bill-ocr-draft";

const CODES: readonly CostCodeOption[] = [
  { id: "cc_lumber", code: "FRAME-MAT", name: "Framing Materials", defaultCostType: "MATERIAL" },
  { id: "cc_delivery", code: "FRAME-DEL", name: "Framing Delivery", defaultCostType: "MATERIAL" },
];

const VALID_PARSED_OUTPUT = {
  vendorName: "ACME Lumber Supply",
  billNumber: "INV-4471",
  issuedOn: "2026-08-20",
  assumptions: ["Tax line rolled into the lumber line item"],
  lineItems: [
    { costCodeId: "cc_lumber", title: "2x4x8 lumber", amountDollars: 412.5 },
    { costCodeId: "cc_delivery", title: "Delivery fee", amountDollars: 35 },
  ],
};

const SAMPLE_DOCUMENT = { data: "ZmFrZS1pbWFnZS1ieXRlcw==", mediaType: "image/jpeg" as const };

function fakeClient(response: unknown) {
  return { parse: vi.fn().mockResolvedValue(response) };
}

describe("extractBillFromDocument", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        extractBillFromDocument(
          { document: SAMPLE_DOCUMENT, costCodes: CODES },
          fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" }),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns a normalized extraction on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    const extraction = await extractBillFromDocument({ document: SAMPLE_DOCUMENT, costCodes: CODES }, client);

    expect(extraction.vendorName).toBe("ACME Lumber Supply");
    expect(extraction.billNumber).toBe("INV-4471");
    expect(extraction.issuedOn?.toISOString().slice(0, 10)).toBe("2026-08-20");
    expect(extraction.lineItems).toHaveLength(2);
    expect(extraction.lineItems[0].amountCents).toBe(41_250);
    expect(extraction.lineItems[1].amountCents).toBe(3_500);
  });

  it("sends the document as an image block and the real cost code catalog as text", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    await extractBillFromDocument({ document: SAMPLE_DOCUMENT, costCodes: CODES }, client);

    const call = client.parse.mock.calls[0][0];
    const content = call.messages[0].content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(content[1].text).toContain("cc_lumber");
    expect(content[1].text).toContain("FRAME-MAT");
    expect(call.model).toBe("claude-opus-5");
  });

  it("sends a PDF as a document block, not an image block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    await extractBillFromDocument(
      { document: { data: "ZmFrZS1wZGYtYnl0ZXM=", mediaType: "application/pdf" }, costCodes: CODES },
      client,
    );

    const content = client.parse.mock.calls[0][0].messages[0].content;
    expect(content[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: null, stop_reason: "refusal" });

    await expect(
      extractBillFromDocument({ document: SAMPLE_DOCUMENT, costCodes: CODES }, client),
    ).rejects.toBeInstanceOf(OcrExtractionError);
  });

  it("throws when parsing fails despite a normal stop reason", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: null, stop_reason: "end_turn" });

    await expect(
      extractBillFromDocument({ document: SAMPLE_DOCUMENT, costCodes: CODES }, client),
    ).rejects.toBeInstanceOf(OcrExtractionError);
  });

  it("refuses to extract against an empty cost code catalog", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ parsed_output: VALID_PARSED_OUTPUT, stop_reason: "end_turn" });

    await expect(
      extractBillFromDocument({ document: SAMPLE_DOCUMENT, costCodes: [] }, client),
    ).rejects.toThrow();
  });
});
