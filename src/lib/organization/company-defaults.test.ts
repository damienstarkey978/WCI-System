import { describe, expect, it } from "vitest";

import {
  WCI_COMPANY_DEFAULTS,
  WCI_COMPANY_SLOGAN,
  formatCompanyAddress,
  resolveCompanySlogan,
} from "./company-defaults";
import { loadCanonicalProposalTerms } from "./proposal-terms";

describe("formatCompanyAddress", () => {
  it("matches Damien's WCI letterhead format", () => {
    expect(formatCompanyAddress(WCI_COMPANY_DEFAULTS)).toBe(
      "6005 Powers Ave. #210 Jacksonville FL 32217",
    );
  });

  it("returns null when empty", () => {
    expect(formatCompanyAddress({ addressLine1: null, city: null, state: null, postalCode: null })).toBeNull();
  });
});

describe("resolveCompanySlogan", () => {
  it("uses the exact WCI slogan when unset", () => {
    expect(resolveCompanySlogan(null)).toBe(WCI_COMPANY_SLOGAN);
    expect(resolveCompanySlogan("")).toBe("Leaders in quality construction since 1994.");
  });

  it("preserves a custom slogan", () => {
    expect(resolveCompanySlogan("Custom tagline.")).toBe("Custom tagline.");
  });
});

describe("loadCanonicalProposalTerms", () => {
  it("includes wire instructions and warranty without altering wording", () => {
    const terms = loadCanonicalProposalTerms();
    expect(terms).toContain("## WIRE INSTRUCTIONS");
    expect(terms).toContain("062005690 routing");
    expect(terms).toContain("0280987397 account");
    expect(terms).toContain("World Construction Co, inc.");
    expect(terms).toContain("twenty (20) year structural warranty");
    expect(terms).toContain("Credit cards accepted with an 2.9% processing fee.");
  });
});
