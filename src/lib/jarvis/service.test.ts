import { afterEach, describe, expect, it } from "vitest";

import { getJarvisRequestTimeoutMs } from "@/lib/jarvis/service";

describe("getJarvisRequestTimeoutMs", () => {
  afterEach(() => {
    delete process.env.JARVIS_REQUEST_TIMEOUT_MS;
  });

  it("defaults to 50 seconds when unset", () => {
    delete process.env.JARVIS_REQUEST_TIMEOUT_MS;
    expect(getJarvisRequestTimeoutMs()).toBe(50_000);
  });

  it("reads JARVIS_REQUEST_TIMEOUT_MS when set", () => {
    process.env.JARVIS_REQUEST_TIMEOUT_MS = "12345";
    expect(getJarvisRequestTimeoutMs()).toBe(12_345);
  });

  it("stays comfortably under Netlify's confirmed 60s hard ceiling by default", () => {
    // Not a tautology on the current constant — this exists so raising the default
    // later can't quietly reintroduce the exact bug this whole deadline chain fixes.
    expect(getJarvisRequestTimeoutMs()).toBeLessThan(60_000);
  });
});
