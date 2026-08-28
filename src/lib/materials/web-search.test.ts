import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, WebPriceSearchError, searchWebForMaterialPrice } from "@/lib/materials/web-search";

function fakeClient(response: unknown) {
  return { create: vi.fn().mockResolvedValue(response) };
}

describe("searchWebForMaterialPrice", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        searchWebForMaterialPrice("2x6x8 SPF stud", fakeClient({ stop_reason: "end_turn", content: [] })),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("parses a well-formed PRICE line", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "PRICE: LOWES | 8.99 | EA | https://www.lowes.com/pd/12345" }],
    });

    const result = await searchWebForMaterialPrice("2x6x8 SPF stud", client);

    expect(result).toEqual({
      vendor: "LOWES",
      unit: "EA",
      unitCostCents: 899,
      sourceUrl: "https://www.lowes.com/pd/12345",
    });
  });

  it("returns null when the model reports NOT_FOUND", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "NOT_FOUND" }] });

    const result = await searchWebForMaterialPrice("a made-up material that doesn't exist", client);

    expect(result).toBeNull();
  });

  it("returns null when the response doesn't match the expected format", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "I found a price of $8.99." }] });

    const result = await searchWebForMaterialPrice("2x6x8 SPF stud", client);

    expect(result).toBeNull();
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "refusal", content: [] });

    await expect(searchWebForMaterialPrice("2x6x8 SPF stud", client)).rejects.toBeInstanceOf(WebPriceSearchError);
  });
});
