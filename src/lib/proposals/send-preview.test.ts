import { describe, expect, it } from "vitest";

import { STANDARD_PROPOSAL_COVER_OPENER } from "@/lib/proposals/cover-message";
import { DEFAULT_PROPOSAL_PAYMENT_SCHEDULE } from "@/lib/proposals/payment-schedule";
import { loadCanonicalProposalTerms } from "@/lib/organization/proposal-terms";
import { previewProposalSend } from "@/lib/proposals/send-preview";

describe("proposal send preview", () => {
  it("is ready when P1 gates + prepared-for are satisfied", () => {
    const result = previewProposalSend({
      title: "4212 Robin Hood Rd.-Dan Cook-Garage Remodel",
      coverMessage: STANDARD_PROPOSAL_COVER_OPENER,
      termsText: loadCanonicalProposalTerms(),
      requireSignature: true,
      draws: DEFAULT_PROPOSAL_PAYMENT_SCHEDULE,
      preparedFor: {
        name: "Dan Cook",
        email: "dancook428@yahoo.com",
        phone: "904-555-0100",
      },
    });
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("blocks .comm emails and missing phone", () => {
    const result = previewProposalSend({
      title: "Test",
      coverMessage: STANDARD_PROPOSAL_COVER_OPENER,
      termsText: loadCanonicalProposalTerms(),
      requireSignature: true,
      draws: DEFAULT_PROPOSAL_PAYMENT_SCHEDULE,
      preparedFor: {
        name: "Dan Cook",
        email: "dancook428@yahoo.comm",
        phone: null,
      },
    });
    expect(result.ready).toBe(false);
    expect(result.issues.some((i) => /mistyped|phone/i.test(i.message))).toBe(true);
  });
});
