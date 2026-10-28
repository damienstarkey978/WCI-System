/**
 * Job label helpers for staff UI (sidebar, mobile drawer, etc.).
 *
 * Buildertrend job names usually already start with the street number. WCI's
 * optional `Job.prefix` is often that same number — rendering both produces
 * "932 932 Candlebark…". Suppress the prefix chip when the name already
 * leads with it as a whole token.
 */

/**
 * True when `name` already begins with `prefix` as a leading token
 * (followed by whitespace, a common address separator, or end-of-string).
 * Does not treat "12" as matching "1200 Main".
 */
export function jobNameAlreadyIncludesPrefix(
  name: string,
  prefix: string | null | undefined,
): boolean {
  const trimmedPrefix = prefix?.trim();
  if (!trimmedPrefix) return false;
  const trimmedName = name.trim();
  if (!trimmedName) return false;

  const escaped = trimmedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}(?:\\s|[-_/.,]|$)`, "i").test(trimmedName);
}

/** Whether the muted prefix chip should render beside the job name. */
export function shouldShowJobPrefix(
  name: string,
  prefix: string | null | undefined,
): boolean {
  const trimmed = prefix?.trim();
  if (!trimmed) return false;
  return !jobNameAlreadyIncludesPrefix(name, trimmed);
}
