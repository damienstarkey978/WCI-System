import { describe, expect, it } from "vitest";

import { generateSecureToken, hashSecret, parseSecureToken, secretMatches } from "@/lib/secure-tokens";

describe("secure-tokens", () => {
  it("round-trips tokenId through generate -> parse for an arbitrary prefix", () => {
    const { token, tokenId } = generateSecureToken("wcicps");
    expect(parseSecureToken("wcicps", token)?.tokenId).toBe(tokenId);
  });

  it("rejects a token generated under a different prefix", () => {
    const { token } = generateSecureToken("wcicps");
    expect(parseSecureToken("wcicpa", token)).toBeNull();
  });

  it("does not choke on a secret containing the delimiter itself", () => {
    for (let i = 0; i < 200; i += 1) {
      const { token, tokenId } = generateSecureToken("wcicpa");
      const parsed = parseSecureToken("wcicpa", token);
      expect(parsed?.tokenId, `failed to parse ${token}`).toBe(tokenId);
    }
  });

  it("rejects malformed input", () => {
    expect(parseSecureToken("wcicpa", "wcicpa_abc")).toBeNull();
    expect(parseSecureToken("wcicpa", "wcicpa_zzzz_secret")).toBeNull();
    expect(parseSecureToken("wcicpa", "")).toBeNull();
  });

  it("matches only the correct secret", () => {
    const { token, hashedSecret } = generateSecureToken("wcicpa");
    const parsed = parseSecureToken("wcicpa", token)!;
    expect(secretMatches(parsed.secret, hashedSecret)).toBe(true);

    const other = generateSecureToken("wcicpa");
    const otherParsed = parseSecureToken("wcicpa", other.token)!;
    expect(secretMatches(otherParsed.secret, hashedSecret)).toBe(false);
  });

  it("hashes deterministically", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
    expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
  });
});
