import { describe, expect, it } from "vitest";

import { looksLikeHtml, sanitizeRichTextHtml } from "./rich-text";

describe("rich-text", () => {
  it("detects html-ish strings", () => {
    expect(looksLikeHtml("<b>hello</b>")).toBe(true);
    expect(looksLikeHtml("plain text")).toBe(false);
  });

  it("strips scripts and event handlers on the server path", () => {
    const dirty = `<p onclick="alert(1)">ok</p><script>evil()</script><b>keep</b>`;
    const clean = sanitizeRichTextHtml(dirty);
    expect(clean).not.toMatch(/script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).toContain("<b>keep</b>");
  });
});
