import { randomBytes } from "node:crypto";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { decryptToken, encryptToken } from "@/lib/quickbooks/crypto";

describe("encryptToken / decryptToken", () => {
  beforeEach(() => {
    vi.stubEnv("QBO_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a plaintext token", () => {
    const stored = encryptToken("a-real-refresh-token");
    expect(decryptToken(stored)).toBe("a-real-refresh-token");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptToken("same-token")).not.toBe(encryptToken("same-token"));
  });

  it("rejects a tampered ciphertext", () => {
    const stored = encryptToken("a-real-refresh-token");
    const [iv, authTag, ciphertext] = stored.split(".");
    // Flip a bit in the decoded bytes rather than editing the base64url text.
    // Character-level edits are flaky here: the final character of a base64url string
    // can carry bits that decode to nothing, so a changed *string* can still decode to
    // the identical ciphertext, authenticate cleanly, and fail this assertion. Two
    // earlier attempts (writing "xx" over the tail, then flipping the last character)
    // both failed intermittently for exactly that reason.
    const bytes = Buffer.from(ciphertext, "base64url");
    bytes[0] ^= 0xff;
    const tampered = [iv, authTag, bytes.toString("base64url")].join(".");
    expect(tampered).not.toBe(stored);
    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects a malformed stored value", () => {
    expect(() => decryptToken("not-a-valid-stored-token")).toThrow();
  });

  it("throws when the key does not decode to 32 bytes", () => {
    vi.stubEnv("QBO_TOKEN_ENCRYPTION_KEY", Buffer.from("too-short").toString("base64"));
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });
});
