import { describe, expect, it } from "vitest";

import {
  buildPaisPlansDraftSchema,
  EmptyPaisTemplateCatalogError,
  normalizePaisPlansDraft,
} from "@/lib/ai/pais-plans-draft";

describe("buildPaisPlansDraftSchema", () => {
  it("refuses an empty template catalog", () => {
    expect(() => buildPaisPlansDraftSchema([])).toThrow(EmptyPaisTemplateCatalogError);
  });

  it("accepts TEMPLATE products bound to catalog ids", () => {
    const schema = buildPaisPlansDraftSchema(["tmpl_hardie", "tmpl_gaf"]);
    const parsed = schema.parse({
      products: [
        { kind: "TEMPLATE", templateId: "tmpl_hardie", confidence: "HIGH", notes: "elevations" },
        {
          kind: "FREE_TEXT",
          manufacturer: "Unknown Brand",
          model: "Widget",
          confidence: "LOW",
        },
      ],
      assumptions: ["Widget has no org FL template"],
    });
    const normalized = normalizePaisPlansDraft(parsed);
    expect(normalized.products).toHaveLength(2);
    expect(normalized.products[0]).toMatchObject({ kind: "TEMPLATE", templateId: "tmpl_hardie" });
    expect(normalized.products[1]).toMatchObject({
      kind: "FREE_TEXT",
      manufacturer: "Unknown Brand",
      model: "Widget",
    });
  });

  it("rejects a hallucinated template id", () => {
    const schema = buildPaisPlansDraftSchema(["tmpl_hardie"]);
    expect(() =>
      schema.parse({
        products: [{ kind: "TEMPLATE", templateId: "tmpl_invented", confidence: "HIGH" }],
        assumptions: [],
      }),
    ).toThrow();
  });
});
