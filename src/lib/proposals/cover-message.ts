/**
 * Standard client cover-message opener (Handoff parity CR P1 #9).
 * Verbatim thank-you text from Damien's CR — do not paraphrase.
 */

export const STANDARD_PROPOSAL_COVER_OPENER =
  "Thank you for the opportunity to work on your project. Our goal is to make this process as smooth and transparent as possible for you.";

/** Banned AI filler from the CR — never allow this phrase on a client proposal. */
export const BANNED_COVER_PHRASE = "turning your project dreams into reality";

export class BannedCoverMessageError extends Error {
  constructor() {
    super(`Cover message must not include "${BANNED_COVER_PHRASE}".`);
    this.name = "BannedCoverMessageError";
  }
}

export function assertCoverMessageAllowed(message: string | null | undefined): void {
  if (!message) return;
  if (message.toLowerCase().includes(BANNED_COVER_PHRASE)) {
    throw new BannedCoverMessageError();
  }
}

/**
 * Ensure the cover message starts with the standard thank-you opener.
 * Replaces banned filler; prepends the opener when the AI wrote only scope.
 */
export function normalizeProposalCoverMessage(raw: string | null | undefined): string {
  const trimmed = raw?.trim() ?? "";
  const withoutBanned = trimmed
    .replace(new RegExp(BANNED_COVER_PHRASE, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!withoutBanned) return STANDARD_PROPOSAL_COVER_OPENER;

  if (withoutBanned.toLowerCase().startsWith(STANDARD_PROPOSAL_COVER_OPENER.toLowerCase())) {
    return withoutBanned;
  }
  if (/^thank you\b/i.test(withoutBanned)) {
    // Keep an alternate thank-you if present, as long as banned phrase is gone.
    return withoutBanned;
  }
  return `${STANDARD_PROPOSAL_COVER_OPENER}\n\n${withoutBanned}`;
}
