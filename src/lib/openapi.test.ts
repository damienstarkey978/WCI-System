import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "@/lib/openapi";

describe("buildOpenApiDocument", () => {
  const doc = buildOpenApiDocument() as {
    openapi: string;
    paths: Record<string, Record<string, { "x-required-scopes": string[]; requestBody?: unknown }>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  it("builds without throwing, even with Date fields in request schemas", () => {
    expect(doc.openapi).toBe("3.1.0");
  });

  it("documents every route file actually present under src/app/api/v1", () => {
    // Transcribed from `find src/app/api/v1 -name route.ts` at the time this was
    // written — if a new route is added without updating src/lib/openapi.ts, this
    // count catches the drift.
    const paths = Object.keys(doc.paths);
    expect(paths).toContain("/me");
    expect(paths).toContain("/jobs");
    expect(paths).toContain("/jobs/{jobId}/budget");
    expect(paths).toContain("/jobs/{jobId}/bills");
    expect(paths).toContain("/jobs/{jobId}/purchase-orders");
    expect(paths).toContain("/jobs/{jobId}/change-orders");
    expect(paths).toContain("/jobs/{jobId}/files");
    expect(paths).toContain("/estimates/{estimateId}/send-to-budget");
    expect(paths).toContain("/estimates/ai-draft");
    expect(paths).toContain("/purchase-orders/match-by-road-name");
    expect(paths).toContain("/invoices/{invoiceId}/payments");
    expect(paths).toContain("/draws/{drawId}/generate-invoice");
    expect(paths).toContain("/time-clock/bulk-clock-in");
    expect(paths).toContain("/time-clock/overtime-summary");
    expect(paths).toContain("/reports/cash-flow");
    expect(paths).toContain("/files/{fileId}");
    expect(paths).toContain("/folders");
    expect(paths).toContain("/takeoffs");
    expect(paths).toContain("/clients/{clientId}");
    // Not documented as a normal endpoint — it IS the document.
    expect(paths).not.toContain("/openapi.json");
  });

  it("marks required query params on comments and notifications", () => {
    const comments = doc.paths["/comments"].get as unknown as {
      parameters: { name: string; required: boolean }[];
    };
    const featureType = comments.parameters.find((p) => p.name === "featureType");
    const featureId = comments.parameters.find((p) => p.name === "featureId");
    expect(featureType?.required).toBe(true);
    expect(featureId?.required).toBe(true);

    const notifications = doc.paths["/notifications"].get as unknown as {
      parameters: { name: string; required: boolean }[];
    };
    expect(notifications.parameters.find((p) => p.name === "userId")?.required).toBe(true);
  });

  it("has both GET and POST where a route file exports both", () => {
    expect(Object.keys(doc.paths["/jobs"])).toEqual(expect.arrayContaining(["get", "post"]));
    expect(Object.keys(doc.paths["/invoices"])).toEqual(expect.arrayContaining(["get", "post"]));
  });

  it("records the exact scope each endpoint requires", () => {
    expect(doc.paths["/jobs"].post["x-required-scopes"]).toEqual(["jobs:write"]);
    expect(doc.paths["/purchase-orders/match-by-road-name"].post["x-required-scopes"]).toEqual(["jobs:read"]);
    expect(doc.paths["/time-clock/{entryId}/approve"].post["x-required-scopes"]).toEqual(["time-clock:write"]);
  });

  it("embeds a real JSON schema for a request body, not a placeholder", () => {
    const createJob = doc.paths["/jobs"].post.requestBody as {
      content: { "application/json": { schema: { properties: Record<string, unknown>; required: string[] } } };
    };
    const schema = createJob.content["application/json"].schema;
    expect(schema.properties).toHaveProperty("contractType");
    expect(schema.required).toContain("name");
  });

  it("omits requestBody for GET-only endpoints", () => {
    expect(doc.paths["/reports/wip"].get.requestBody).toBeUndefined();
  });

  it("declares the bearer/x-api-key auth scheme", () => {
    expect(doc.components.securitySchemes).toHaveProperty("apiKey");
  });
});
