import { describe, expect, it } from "vitest";

import { isStaleServerActionError } from "@/lib/errors/stale-server-action";

describe("isStaleServerActionError", () => {
  it("detects Next.js's stale-action message", () => {
    const error = new Error(
      'Failed to find Server Action "abc123". This request might be from an older or newer deployment.',
    );
    expect(isStaleServerActionError(error)).toBe(true);
  });

  it("detects the docs-link variant of the message", () => {
    const error = new Error("See https://nextjs.org/docs/messages/failed-to-find-server-action for more information.");
    expect(isStaleServerActionError(error)).toBe(true);
  });

  it("returns false for an unrelated error", () => {
    expect(isStaleServerActionError(new Error("Connection error"))).toBe(false);
  });

  it("returns false for a non-Error value", () => {
    expect(isStaleServerActionError("some string")).toBe(false);
    expect(isStaleServerActionError(undefined)).toBe(false);
  });
});
