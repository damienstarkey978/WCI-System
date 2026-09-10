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
    // Flip the last character to one it definitely isn't. Overwriting with a fixed
    // string instead (this used to write "xx") is flaky: the parts are base64url,
    // where "x" is a legal character, so roughly one ciphertext in 4096 already
    // ended in "xx" — making the "tampered" value identical to the original, which
    // then decrypts fine and fails the assertion.
    const last = ciphertext.slice(-1);
    const tampered = [iv, authTag, `${ciphertext.slice(0, -1)}${last === "A" ? "B" : "A"}`].join(".");
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
