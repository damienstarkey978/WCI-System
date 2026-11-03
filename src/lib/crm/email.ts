/**
 * Lead / client email normalization (Handoff parity CR item 22).
 * Fixes common TLD typos like `.comm` → `.com` before persistence.
 */

const TLD_TYPO_FIXES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\.comm$/i, ".com"],
  [/\.con$/i, ".com"],
  [/\.cpm$/i, ".com"],
  [/\.coom$/i, ".com"],
];

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
