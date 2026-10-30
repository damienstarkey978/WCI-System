import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(() => Promise.resolve()),
    },
  },
}));

import { apiKeyContextFromOAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

describe("apiKeyContextFromOAuth", () => {
  beforeEach(() => {
    vi.mocked(db.apiKey.findFirst).mockReset();
    vi.mocked(db.apiKey.update).mockReset();
    vi.mocked(db.apiKey.update).mockReturnValue(Promise.resolve() as never);
  });

  it("returns null for a null oauth context", async () => {
    expect(await apiKeyContextFromOAuth(null)).toBeNull();
  });

  it("falls back to OAuth client name when no actingApiKeyId is bound", async () => {
    const context = await apiKeyContextFromOAuth({
      accessTokenId: "tok_oauth_1",
      organizationId: "org_1",
      userId: "user_1",
      clientName: "Cursor",
      scopes: ["jobs:read"],
      actingApiKeyId: null,
      oauthClientId: "client_1",
    });
    expect(context).toEqual({
      apiKeyId: "tok_oauth_1",
      organizationId: "org_1",
      name: "Cursor",
      agentKind: null,
      scopes: ["jobs:read"],
    });
    expect(db.apiKey.findFirst).not.toHaveBeenCalled();
  });

  it("resolves heather ApiKey identity when actingApiKeyId is bound", async () => {
    vi.mocked(db.apiKey.findFirst).mockResolvedValue({
      id: "cmvtvcv3l0000lujs6i2gzn6o",
      organizationId: "org_1",
      name: "heather",
      agentKind: "HEATHER",
      scopes: ["*"],
      expiresAt: null,
      revokedAt: null,
    } as never);

    const context = await apiKeyContextFromOAuth({
      accessTokenId: "tok_oauth_cursor",
      organizationId: "org_1",
      userId: "user_1",
      clientName: "Cursor",
      scopes: ["jobs:read", "files:read"],
      actingApiKeyId: "cmvtvcv3l0000lujs6i2gzn6o",
      oauthClientId: "client_1",
    });

    expect(context).toEqual({
      apiKeyId: "cmvtvcv3l0000lujs6i2gzn6o",
      organizationId: "org_1",
      name: "heather",
      agentKind: "HEATHER",
      scopes: ["*"],
    });
    expect(db.apiKey.findFirst).toHaveBeenCalledWith({
      where: {
        id: "cmvtvcv3l0000lujs6i2gzn6o",
        organizationId: "org_1",
        revokedAt: null,
      },
    });
  });

  it("falls back to client name when the bound ApiKey is missing or revoked", async () => {
    vi.mocked(db.apiKey.findFirst).mockResolvedValue(null as never);

    const context = await apiKeyContextFromOAuth({
      accessTokenId: "tok_oauth_2",
      organizationId: "org_1",
      userId: "user_1",
      clientName: "Cursor",
      scopes: ["jobs:read"],
      actingApiKeyId: "missing_key",
      oauthClientId: "client_1",
    });

    expect(context?.name).toBe("Cursor");
    expect(context?.apiKeyId).toBe("tok_oauth_2");
    expect(context?.agentKind).toBeNull();
  });
});
