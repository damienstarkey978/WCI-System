import { describe, expect, it } from "vitest";

import {
  extractToken,
  generateApiKeyToken,
  hashSecret,
  parseApiKeyToken,
  secretMatches,
} from "@/lib/api-auth";
import { AGENT_DEFAULT_SCOPES, grantsAllScopes, grantsScope, isScope, missingScopes } from "@/lib/api-scopes";

describe("token generation", () => {
  it("produces a parseable wci_<tokenId>_<secret> token", () => {
    const { token, tokenId } = generateApiKeyToken();
    const parsed = parseApiKeyToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.tokenId).toBe(tokenId);
  });

  it("stores only a hash of the secret", () => {
    const { token, hashedSecret } = generateApiKeyToken();
    const parsed = parseApiKeyToken(token);
    expect(hashedSecret).not.toContain(parsed?.secret ?? "");
    expect(hashedSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats a token", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateApiKeyToken().token));
    expect(tokens.size).toBe(200);
  });
});

describe("token parsing", () => {
  it("rejects tokens with the wrong prefix", () => {
    expect(parseApiKeyToken("bt_abc_def")).toBeNull();
  });

  it("rejects tokens missing the secret segment", () => {
    expect(parseApiKeyToken("wci_abc")).toBeNull();
  });

  it("rejects a non-hex token id", () => {
    expect(parseApiKeyToken("wci_zzzz_secret")).toBeNull();
  });

  it("accepts a secret containing underscores, since base64url includes them", () => {
    // Regression: splitting on "_" rejected roughly half of all generated tokens.
    expect(parseApiKeyToken("wci_abc123_de_f-gh")).toEqual({ tokenId: "abc123", secret: "de_f-gh" });
  });

  it("round-trips every generated token", () => {
    for (let i = 0; i < 500; i += 1) {
      const { token, tokenId } = generateApiKeyToken();
      expect(parseApiKeyToken(token)?.tokenId, `failed to parse ${token}`).toBe(tokenId);
    }
  });

  it("rejects tokens with empty parts", () => {
    expect(parseApiKeyToken("wci__def")).toBeNull();
    expect(parseApiKeyToken("wci_abc_")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseApiKeyToken("")).toBeNull();
  });
});

describe("secret verification", () => {
  it("accepts the correct secret", () => {
    const { token, hashedSecret } = generateApiKeyToken();
    const parsed = parseApiKeyToken(token);
    expect(secretMatches(parsed?.secret ?? "", hashedSecret)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const { hashedSecret } = generateApiKeyToken();
    const other = generateApiKeyToken();
    const parsedOther = parseApiKeyToken(other.token);
    expect(secretMatches(parsedOther?.secret ?? "", hashedSecret)).toBe(false);
  });

  it("rejects a stored hash of the wrong length instead of throwing", () => {
    expect(secretMatches("anything", "tooshort")).toBe(false);
  });

  it("hashes deterministically", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
    expect(hashSecret("abc")).not.toBe(hashSecret("abd"));
  });
});

describe("extractToken", () => {
  const make = (headers: Record<string, string>) => new Request("https://example.test/api/v1/jobs", { headers });

  it("reads a bearer token", () => {
    expect(extractToken(make({ authorization: "Bearer wci_a_b" }))).toBe("wci_a_b");
  });

  it("is case-insensitive about the scheme", () => {
    expect(extractToken(make({ authorization: "bearer wci_a_b" }))).toBe("wci_a_b");
  });

  it("reads the x-api-key fallback header", () => {
    expect(extractToken(make({ "x-api-key": "wci_a_b" }))).toBe("wci_a_b");
  });

  it("returns null when no credentials are present", () => {
    expect(extractToken(make({}))).toBeNull();
  });

  it("returns null for a non-bearer authorization scheme", () => {
    expect(extractToken(make({ authorization: "Basic dXNlcjpwYXNz" }))).toBeNull();
  });
});

describe("scopes", () => {
  it("grants an exactly matching scope", () => {
    expect(grantsScope(["jobs:read"], "jobs:read")).toBe(true);
  });

  it("does not grant a different scope", () => {
    expect(grantsScope(["jobs:read"], "jobs:write")).toBe(false);
  });

  it("honours a resource wildcard", () => {
    expect(grantsScope(["bills:*"], "bills:write")).toBe(true);
    expect(grantsScope(["bills:*"], "jobs:write")).toBe(false);
  });

  it("honours a global wildcard", () => {
    expect(grantsScope(["*"], "invoices:write")).toBe(true);
  });

  it("never infers a wildcard from a specific grant", () => {
    expect(grantsScope(["bills:read"], "bills:write")).toBe(false);
  });

  it("requires every scope in a set", () => {
    expect(grantsAllScopes(["jobs:read", "jobs:write"], ["jobs:read", "jobs:write"])).toBe(true);
    expect(grantsAllScopes(["jobs:read"], ["jobs:read", "jobs:write"])).toBe(false);
  });

  it("reports exactly which scopes are missing", () => {
    expect(missingScopes(["jobs:read"], ["jobs:read", "jobs:write", "bills:read"])).toEqual([
      "jobs:write",
      "bills:read",
    ]);
  });
});

describe("agent default scopes", () => {
  it("defines a key for every agent in the roster", () => {
    expect(Object.keys(AGENT_DEFAULT_SCOPES).sort()).toEqual(
      ["duke", "hank", "heather", "jarvis", "neil", "vince"].sort(),
    );
  });

  it("only uses scopes the API actually defines", () => {
    for (const [agent, scopes] of Object.entries(AGENT_DEFAULT_SCOPES)) {
      for (const scope of scopes) {
        expect(isScope(scope), `${agent} has unknown scope ${scope}`).toBe(true);
      }
    }
  });

  it("scopes Duke to purchasing, not to everything", () => {
    const duke = AGENT_DEFAULT_SCOPES.duke;
    expect(grantsScope(duke, "purchase-orders:write")).toBe(true);
    expect(grantsScope(duke, "bills:write")).toBe(true);
    expect(grantsScope(duke, "invoices:write")).toBe(false);
    expect(grantsScope(duke, "jobs:write")).toBe(false);
  });

  it("keeps Jarvis read-heavy — no module write access", () => {
    const jarvis = AGENT_DEFAULT_SCOPES.jarvis;
    expect(grantsScope(jarvis, "bills:read")).toBe(true);
    expect(grantsScope(jarvis, "jobs:read")).toBe(true);
    expect(grantsScope(jarvis, "bills:write")).toBe(false);
    expect(grantsScope(jarvis, "purchase-orders:write")).toBe(false);
  });

  it("scopes Heather to daily logs and files", () => {
    const heather = AGENT_DEFAULT_SCOPES.heather;
    expect(grantsScope(heather, "daily-logs:write")).toBe(true);
    expect(grantsScope(heather, "files:write")).toBe(true);
    expect(grantsScope(heather, "bills:write")).toBe(false);
  });
});
