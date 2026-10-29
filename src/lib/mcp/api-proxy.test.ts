import { describe, expect, it } from "vitest";

import { buildApiV1Url, formatApiV1ProxyResult, normalizeApiV1Path } from "@/lib/mcp/api-proxy";

describe("normalizeApiV1Path", () => {
  it("accepts bare resource paths", () => {
    expect(normalizeApiV1Path("jobs")).toBe("/api/v1/jobs");
    expect(normalizeApiV1Path("/jobs/abc/progress")).toBe("/api/v1/jobs/abc/progress");
  });

  it("strips a duplicated /api/v1 prefix", () => {
    expect(normalizeApiV1Path("/api/v1/bills")).toBe("/api/v1/bills");
    expect(normalizeApiV1Path("api/v1/permits/xyz")).toBe("/api/v1/permits/xyz");
  });

  it("rejects absolute URLs", () => {
    expect(() => normalizeApiV1Path("https://evil.example/api/v1/jobs")).toThrow(/relative/);
  });

  it("rejects empty paths", () => {
    expect(() => normalizeApiV1Path("  ")).toThrow(/required/);
  });
});

describe("buildApiV1Url", () => {
  it("builds an absolute URL with query params", () => {
    expect(buildApiV1Url("https://app.example.com", "/jobs", { status: "OPEN", limit: 10 })).toBe(
      "https://app.example.com/api/v1/jobs?status=OPEN&limit=10",
    );
  });

  it("omits nullish query values", () => {
    expect(buildApiV1Url("https://app.example.com", "daily-logs", { jobId: undefined, limit: 5 })).toBe(
      "https://app.example.com/api/v1/daily-logs?limit=5",
    );
  });
});

describe("formatApiV1ProxyResult", () => {
  it("prefixes the status code", () => {
    expect(formatApiV1ProxyResult({ status: 200, bodyText: '{"data":[]}' })).toBe('HTTP 200\n{"data":[]}');
  });

  it("truncates oversized bodies", () => {
    const bodyText = "x".repeat(100);
    const formatted = formatApiV1ProxyResult({ status: 200, bodyText }, 40);
    expect(formatted).toContain("HTTP 200");
    expect(formatted).toContain("…(truncated");
    expect(formatted.length).toBeLessThan(bodyText.length + 20);
  });
});
