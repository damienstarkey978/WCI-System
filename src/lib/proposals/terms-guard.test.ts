import { describe, expect, it } from "vitest";

import {
  assertProposalTermsReady,
  findProposalTermsIssues,
  IncompleteProposalTermsError,
} from "@/lib/proposals/terms-guard";
import { loadCanonicalProposalTerms } from "@/lib/organization/proposal-terms";

describe("proposal terms guard", () => {
  it("rejects placeholder tokens", () => {
    expect(findProposalTermsIssues("See _TERMS_ below")).toEqual(
      expect.arrayContaining([expect.stringMatching(/placeholder/i)]),
    );
    expect(findProposalTermsIssues("Pay per _FINANCIAL TERMS_")).not.toEqual([]);
    expect(findProposalTermsIssues("Initial here _X_")).not.toEqual([]);
  });

  it("rejects a stub 1-year warranty without the structural warranty", () => {
    expect(findProposalTermsIssues("1-year warranty.")).toEqual(
      expect.arrayContaining([expect.stringMatching(/stub 1-year warranty/i)]),
    );
  });

  it("accepts the canonical WCI terms", () => {
    const terms = loadCanonicalProposalTerms();
    expect(findProposalTermsIssues(terms)).toEqual([]);
    expect(assertProposalTermsReady(terms)).toBe(terms);
  });

  it("throws IncompleteProposalTermsError when empty", () => {
    expect(() => assertProposalTermsReady("")).toThrow(IncompleteProposalTermsError);
  });
});
