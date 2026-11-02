import { describe, expect, it, vi } from "vitest";

import {
  AiNotConfiguredError,
  draftPaisProductsFromPlans,
  DraftGenerationError,
  type PaisPlansParseClient,
} from "@/lib/ai/pais-plans-assistant";
import type { PaisTemplateOption } from "@/lib/ai/pais-plans-draft";

const TEMPLATES: readonly PaisTemplateOption[] = [
  {
    id: "tmpl_hardie",
    name: "Hardie Plank",
    manufacturer: "James Hardie",
    model: "HZ5",
    approvalNumber: "FL1234",
    category: "Siding",
    codeVersion: "2023",
    qaExpiration: null,
  },
];

function fakeClient(parsed: unknown): PaisPlansParseClient {
  return {
    messages: {
      parse: vi.fn().mockResolvedValue({ parsed_output: parsed }),
    },
  };
}

describe("draftPaisProductsFromPlans", () => {
  it("refuses when ANTHROPIC_API_KEY is missing", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        draftPaisProductsFromPlans(
          { jobName: "Job", planNotes: "Hardie plank on elevations", templates: TEMPLATES },
          fakeClient(null),
        ),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns a normalized draft", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({
      products: [
        { kind: "TEMPLATE", templateId: "tmpl_hardie", confidence: "HIGH", notes: "south elev" },
      ],
      assumptions: [],
    });
    const draft = await draftPaisProductsFromPlans(
      { jobName: "Robin Hood add", planNotes: "Hardie HZ5 siding", templates: TEMPLATES },
      client,
    );
    expect(draft.products).toHaveLength(1);
    expect(draft.products[0]).toMatchObject({ kind: "TEMPLATE", templateId: "tmpl_hardie" });
    expect(client.messages.parse).toHaveBeenCalledOnce();
  });

  it("wraps empty model output as DraftGenerationError", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    await expect(
      draftPaisProductsFromPlans(
        { jobName: "Job", planNotes: "notes long enough", templates: TEMPLATES },
        fakeClient(null),
      ),
    ).rejects.toBeInstanceOf(DraftGenerationError);
  });
});
