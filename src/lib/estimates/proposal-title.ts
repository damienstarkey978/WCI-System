/**
 * Proposal/estimate title rules (Handoff parity CR P1 #10).
 * BT lead title shape: `<Address>-<Client>-<Trade>`; versions append ` v2` / ` v3`.
 * AI must not invent a title when the lead already has one.
 */

const VERSION_SUFFIX = /\s+v(\d+)$/i;

export class InventedProposalTitleError extends Error {
  constructor(expected: string, got: string) {
    super(`AI may not invent titles — expected "${expected}" (got "${got}").`);
    this.name = "InventedProposalTitleError";
  }
}

/** Strip optional ` vN` suffix for base comparison. */
export function stripTitleVersion(title: string): string {
  return title.trim().replace(VERSION_SUFFIX, "").trim();
}

export function parseTitleVersion(title: string): number {
  const match = title.trim().match(VERSION_SUFFIX);
  return match ? Number(match[1]) : 1;
}

/** Next version label: base, base v2, base v3, … */
export function nextVersionedTitle(baseOrExisting: string, existingTitles: readonly string[]): string {
  const base = stripTitleVersion(baseOrExisting);
  const versions = existingTitles
    .filter((title) => stripTitleVersion(title) === base)
    .map((title) => parseTitleVersion(title));
  const max = versions.length > 0 ? Math.max(...versions) : 0;
  if (max <= 0) return base;
  return `${base} v${max + 1}`;
}

/**
 * Canonical BT-style title from lead fields when `lead.title` is missing.
 * Prefers the stored lead title when present.
 */
export function resolveProposalTitle(params: {
  readonly leadTitle?: string | null;
  readonly addressLine1?: string | null;
  readonly clientName?: string | null;
  readonly tradeOrProjectType?: string | null;
  /** When AI supplies a title and the lead already has one, force the lead's. */
  readonly aiProposedTitle?: string | null;
  readonly allowAiInventedTitle?: boolean;
}): string {
  const leadTitle = params.leadTitle?.trim();
  if (leadTitle) {
    if (
      params.aiProposedTitle &&
      !params.allowAiInventedTitle &&
      stripTitleVersion(params.aiProposedTitle) !== stripTitleVersion(leadTitle)
    ) {
      // Soft-correct: keep the BT lead title rather than throwing mid-draft.
      return leadTitle;
    }
    return leadTitle;
  }

  const address = params.addressLine1?.trim();
  const client = params.clientName?.trim();
  const trade = params.tradeOrProjectType?.trim();
  if (address && client && trade) {
    return `${address}-${client}-${trade}`;
  }
  if (params.aiProposedTitle?.trim()) return params.aiProposedTitle.trim();
  if (client && trade) return `${client}-${trade}`;
  return params.aiProposedTitle?.trim() || client || "Untitled proposal";
}

/** Strict check used by API when force-validating an AI title against the lead. */
export function assertAiTitleMatchesLead(leadTitle: string, aiTitle: string): void {
  if (stripTitleVersion(aiTitle) !== stripTitleVersion(leadTitle)) {
    throw new InventedProposalTitleError(leadTitle, aiTitle);
  }
}
