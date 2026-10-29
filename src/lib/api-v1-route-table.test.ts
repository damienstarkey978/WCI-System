import { describe, expect, it } from "vitest";

import { API_V1_ROUTE_METHODS, matchApiV1Route } from "@/lib/api-v1-route-table";
import { buildOpenApiDocument } from "@/lib/openapi";

describe("api-v1-route-table", () => {
  it("stays in sync with OpenAPI ENDPOINTS paths", () => {
    const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };
    const openapiPaths = Object.keys(doc.paths).sort();
    const tablePaths = Object.keys(API_V1_ROUTE_METHODS).sort();
    expect(tablePaths).toEqual(openapiPaths);
  });

  it("matches parameterized paths and rejects unknowns", () => {
    expect(matchApiV1Route("/jobs/abc")).toEqual({
      kind: "matched",
      template: "/jobs/{jobId}",
      methods: expect.arrayContaining(["GET"]),
    });
    expect(matchApiV1Route("/jobs/abc/bills").kind).toBe("matched");
    expect(matchApiV1Route("/me").kind).toBe("matched");
    expect(matchApiV1Route("/does-not-exist")).toEqual({ kind: "not_found" });
  });

  it("knows allowed methods for 405", () => {
    const match = matchApiV1Route("/jobs");
    expect(match.kind).toBe("matched");
    if (match.kind === "matched") {
      expect(match.methods).toEqual(expect.arrayContaining(["GET", "POST"]));
      expect(match.methods).not.toContain("DELETE");
    }
  });
});
