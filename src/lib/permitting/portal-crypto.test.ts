import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { decryptPortalPassword, encryptPortalPassword } from "@/lib/permitting/portal-crypto";

describe("encryptPortalPassword / decryptPortalPassword", () => {
  beforeEach(() => {
    vi.stubEnv("QBO_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a portal password", () => {
    const stored = encryptPortalPassword("epics-secret");
    expect(decryptPortalPassword(stored)).toBe("epics-secret");
  });

  it("never stores plaintext", () => {
    const stored = encryptPortalPassword("epics-secret");
    expect(stored).not.toContain("epics-secret");
    expect(stored.split(".")).toHaveLength(3);
  });

  it("uses a fresh IV each call", () => {
    expect(encryptPortalPassword("same")).not.toBe(encryptPortalPassword("same"));
  });
});
