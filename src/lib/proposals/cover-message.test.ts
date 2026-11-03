import { describe, expect, it } from "vitest";

import {
  assertCoverMessageAllowed,
  BannedCoverMessageError,
  BANNED_COVER_PHRASE,
  normalizeProposalCoverMessage,
  STANDARD_PROPOSAL_COVER_OPENER,
} from "@/lib/proposals/cover-message";

describe("proposal cover message", () => {
  it("bans the dreams phrase", () => {
    expect(() => assertCoverMessageAllowed(`We love ${BANNED_COVER_PHRASE}!`)).toThrow(
      BannedCoverMessageError,
    );
  });

  it("normalizes empty/banned text to the standard opener", () => {
    expect(normalizeProposalCoverMessage(null)).toBe(STANDARD_PROPOSAL_COVER_OPENER);
    expect(normalizeProposalCoverMessage(BANNED_COVER_PHRASE)).toBe(STANDARD_PROPOSAL_COVER_OPENER);
  });

  it("prepends the opener when AI only wrote scope", () => {
    const out = normalizeProposalCoverMessage("This covers a garage remodel.");
    expect(out.startsWith(STANDARD_PROPOSAL_COVER_OPENER)).toBe(true);
    expect(out).toContain("garage remodel");
  });
});
