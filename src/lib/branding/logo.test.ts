import { afterEach, describe, expect, it } from "vitest";

import { absoluteOutboundLogoUrl, BRAND_LOGO_LIGHT_PATH, resolveOutboundLogoUrl } from "./logo";

describe("resolveOutboundLogoUrl", () => {
  it("prefers an explicit override", () => {
    expect(resolveOutboundLogoUrl("https://cdn.example/logo.png", "/ignored")).toBe("https://cdn.example/logo.png");
  });

  it("uses org logoPath when absolute or site-relative", () => {
    expect(resolveOutboundLogoUrl(null, "https://cdn.example/org.png")).toBe("https://cdn.example/org.png");
    expect(resolveOutboundLogoUrl(null, "/custom-logo.png")).toBe("/custom-logo.png");
  });

  it("falls back to the canonical light brand mark", () => {
    expect(resolveOutboundLogoUrl(null, null)).toBe(BRAND_LOGO_LIGHT_PATH);
    expect(resolveOutboundLogoUrl("", "not-a-path")).toBe(BRAND_LOGO_LIGHT_PATH);
  });
});

describe("absoluteOutboundLogoUrl", () => {
  afterEach(() => {
    delete process.env.APP_BASE_URL;
  });

  it("prefixes APP_BASE_URL for the canonical mark", () => {
    process.env.APP_BASE_URL = "https://app.example.com/";
    expect(absoluteOutboundLogoUrl(null, null)).toBe(`https://app.example.com${BRAND_LOGO_LIGHT_PATH}`);
  });

  it("leaves absolute overrides alone", () => {
    expect(absoluteOutboundLogoUrl("https://cdn.example/x.png", null)).toBe("https://cdn.example/x.png");
  });
});
