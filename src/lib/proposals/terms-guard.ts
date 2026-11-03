/**
 * Proposal terms readiness (Handoff parity CR P1 #6).
 * Block save/send when placeholder tokens remain or a stub 1-year warranty
 * line stands in for WCI's full warranty section.
 */

const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /_TERMS_/i,
  /_FINANCIAL\s+TERMS_/i,
  /_X_/i,
  /_[A-Z][A-Z0-9 ]{0,40}_/,
];

/** Bare stub warranty line (not the full WCI warranty section). */
const STUB_ONE_YEAR_WARRANTY =
  /^\s*(?:\*|[-•])?\s*(?:one|1)[\s-]*(?:year|yr)\.?\s+warranty(?:\s+(?:only|period))?\s*\.?$/im;

export class IncompleteProposalTermsError extends Error {
  constructor(public readonly reasons: readonly string[]) {
    super(`Proposal terms are incomplete: ${reasons.join("; ")}`);
    this.name = "IncompleteProposalTermsError";
  }
}

export function findProposalTermsIssues(termsText: string | null | undefined): string[] {
  const text = termsText?.trim() ?? "";
  if (!text) return ["Terms text is empty — apply the WCI Terms & Conditions template."];

  const issues: string[] = [];
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      issues.push(`Unresolved placeholder matching ${pattern.source}`);
      break;
    }
  }
  if (STUB_ONE_YEAR_WARRANTY.test(text) && !/twenty\s*\(?\s*20\s*\)?\s*year\s+structural\s+warranty/i.test(text)) {
    issues.push("Replace the stub 1-year warranty line with the full WCI warranty section.");
  }
  return issues;
}

export function assertProposalTermsReady(termsText: string | null | undefined): string {
  const issues = findProposalTermsIssues(termsText);
  if (issues.length > 0) throw new IncompleteProposalTermsError(issues);
  return termsText!.trim();
}
