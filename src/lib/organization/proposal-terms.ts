/**
 * Server-only loader for Damien's canonical proposal Terms & Conditions.
 * Exact wording lives in `prisma/data/wci-proposal-terms.md` (copied from
 * `/cursor/stores/self/docs/wci-proposal-terms.md`). Do not invent legal text.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadCanonicalProposalTerms(): string {
  const path = join(process.cwd(), "prisma/data/wci-proposal-terms.md");
  return readFileSync(path, "utf8").trim();
}

/** Prefer a proposal snapshot, then org default, then the canonical file. */
export function resolveProposalTermsText(parts: {
  readonly proposalTerms: string | null | undefined;
  readonly organizationTerms: string | null | undefined;
}): string {
  return parts.proposalTerms?.trim() || parts.organizationTerms?.trim() || loadCanonicalProposalTerms();
}
