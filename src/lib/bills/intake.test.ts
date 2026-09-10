import { describe, expect, it } from "vitest";

import { billingInboxAddress, orgSlugFromInboxAddress } from "./intake";

describe("billing inbox addressing", () => {
  it("derives a per-organization forwarding address from the slug", () => {
    expect(billingInboxAddress("world-construction")).toBe("bills-world-construction@inbox.worldconstructionjax.com");
  });

  it("round-trips back to the slug, which is how an inbound handler resolves the org", () => {
    const address = billingInboxAddress("world-construction");
    expect(orgSlugFromInboxAddress(address)).toBe("world-construction");
  });

  it("tolerates the casing and whitespace real mail headers arrive with", () => {
    expect(orgSlugFromInboxAddress("  Bills-World-Construction@Inbox.WorldConstructionJax.com ")).toBe(
      "world-construction",
    );
  });

  it("rejects addresses that aren't billing inboxes, rather than guessing a slug", () => {
    expect(orgSlugFromInboxAddress("office@worldconstructioninc.com")).toBeNull();
    expect(orgSlugFromInboxAddress("bills@inbox.worldconstructionjax.com")).toBeNull();
    expect(orgSlugFromInboxAddress("")).toBeNull();
  });
});
