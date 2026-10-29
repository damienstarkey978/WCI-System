import { describe, expect, it } from "vitest";

import {
  actorColumns,
  actorFromApiKey,
  actorFromUser,
  authorColumns,
  creatorColumns,
  formatActorAttribution,
  toPurchaseOrderActor,
  uploaderColumns,
} from "./actor";

describe("actorColumns", () => {
  it("stamps only the user FK for a browser actor", () => {
    expect(actorColumns(actorFromUser("user_1", "ADMIN"))).toEqual({
      actorUserId: "user_1",
      actorApiKeyId: null,
    });
  });

  it("stamps only the api key FK for a machine actor", () => {
    expect(actorColumns(actorFromApiKey("key_heather"))).toEqual({
      actorUserId: null,
      actorApiKeyId: "key_heather",
    });
  });

  it("leaves both null when there is no actor", () => {
    expect(actorColumns()).toEqual({ actorUserId: null, actorApiKeyId: null });
    expect(actorColumns(null)).toEqual({ actorUserId: null, actorApiKeyId: null });
  });
});

describe("column adapters", () => {
  it("maps to PO / creator / author / uploader field names without collapsing channels", () => {
    const api = actorFromApiKey("key_atlas");
    const user = actorFromUser("user_2", "PM");
    expect(toPurchaseOrderActor(api)).toEqual({ actorUserId: null, actorApiKeyId: "key_atlas" });
    expect(creatorColumns(user)).toEqual({ createdByUserId: "user_2", createdByApiKeyId: null });
    expect(authorColumns(api)).toEqual({ authorUserId: null, authorApiKeyId: "key_atlas" });
    expect(uploaderColumns(user)).toEqual({ uploadedByUserId: "user_2", uploadedByApiKeyId: null });
  });
});

describe("formatActorAttribution", () => {
  it("surfaces API channel with the key name (not a raw id)", () => {
    const display = formatActorAttribution({
      apiKey: { name: "heather", agentKind: "HEATHER" },
      user: { name: "Damien", email: "damien@example.com" },
    });
    expect(display).toMatchObject({
      label: "heather",
      channel: "api",
      channelLabel: "API",
      summary: "heather · API",
    });
  });

  it("surfaces Browser channel for staff users", () => {
    const display = formatActorAttribution({
      user: { name: "Damien Starkey", email: "damien@example.com" },
    });
    expect(display).toMatchObject({
      label: "Damien Starkey",
      channel: "browser",
      channelLabel: "Browser",
      summary: "Damien Starkey · Browser",
    });
  });

  it("falls back to email, then external, then system", () => {
    expect(formatActorAttribution({ user: { email: "office@wci.test" } }).label).toBe("office@wci.test");
    expect(formatActorAttribution({ externalLabel: "Vendor signed" }).channel).toBe("external");
    expect(formatActorAttribution({}).summary).toBe("System");
  });
});
