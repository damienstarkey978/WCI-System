/**
 * Lead / client email normalization + validation (Handoff parity CR item 22).
 * Fixes common TLD typos like `.comm` → `.com` before persistence.
 */

const TLD_TYPO_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.comm$/i, ".com"],
  [/\.con$/i, ".com"],
  [/\.cpm$/i, ".com"],
  [/\.coom$/i, ".com"],
];

const INVALID_TLD_ENDINGS = [/\.comm$/i, /\.con$/i, /\.cpm$/i, /\.coom$/i];

/** Lowercase + trim + known TLD typo fixes. Returns null for blank. */
export function normalizeLeadEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  let value = trimmed.toLowerCase();
  for (const [pattern, replacement] of TLD_TYPO_FIXES) {
    value = value.replace(pattern, replacement);
  }
  return value;
}

/** Flag invalid endings (e.g. `.comm`) before send / prepared-for checks. */
export function findLeadEmailIssues(email: string | null | undefined): string[] {
  const trimmed = email?.trim();
  if (!trimmed) return ["Email is required."];
  if (INVALID_TLD_ENDINGS.some((pattern) => pattern.test(trimmed))) {
    return [`Email looks mistyped (${trimmed}) — expected a .com (or other valid) TLD.`];
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return [`Email is not a valid address (${trimmed}).`];
  }
  return [];
}
