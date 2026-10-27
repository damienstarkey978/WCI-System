import { describe, expect, it } from "vitest";

import { parsePendingProposalDraft } from "@/lib/crm/pending-proposal-draft";

describe("parsePendingProposalDraft", () => {
  it("accepts a valid cover + sections payload", () => {
    const draft = parsePendingProposalDraft({
      coverMessage: "Kitchen remodel summary",
      sections: [{ title: "Kitchen", bullets: ["New cabinets", "Quartz counters"] }],
    });
    expect(draft?.coverMessage).toBe("Kitchen remodel summary");
    expect(draft?.sections).toHaveLength(1);
  });

  it("rejects empty sections", () => {
    expect(parsePendingProposalDraft({ coverMessage: "x", sections: [] })).toBeNull();
  });
});
