/**
 * Buildertrend populates the Jobs-rail Search field when you open a job, using a
 * short token from the job name (e.g. "purcell") so the list collapses to
 * "VIEW 1 OPEN JOB". Clearing the field's X restores the full Open list.
 *
 * Prefer the shortest alphabetic token (≥3 chars) that uniquely matches this job
 * among peers — skipping street-suffix / noise words — then fall back to the
 * longest non-noise token, then the trimmed name.
 */

const STREET_NOISE = new Set([
  "drive",
  "dr",
  "street",
  "st",
  "road",
  "rd",
  "avenue",
  "ave",
  "lane",
  "ln",
  "court",
  "ct",
  "boulevard",
  "blvd",
  "way",
  "circle",
  "cir",
  "place",
  "pl",
  "trail",
  "trl",
  "terrace",
  "ter",
  "north",
  "south",
  "east",
  "west",
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
  "the",
  "and",
  "of",
  "remodel",
  "addition",
  "adu",
  "new",
  "home",
  "house",
  "spec",
]);

export type SelectionFilterJob = {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
};

function jobMatchesQuery(job: SelectionFilterJob, q: string): boolean {
  const needle = q.toLowerCase();
  if (job.name.toLowerCase().includes(needle)) return true;
  if (job.prefix?.toLowerCase().includes(needle)) return true;
  return false;
}

function nameTokens(name: string): string[] {
  return name
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !STREET_NOISE.has(token.toLowerCase()));
}

/**
 * Prefer tokens from the leading address-ish segment (before the first hyphen),
 * then earlier / shorter unique tokens — BT's Purcell select uses "purcell", not
 * a later client surname of equal uniqueness.
 */
function orderedCandidateTokens(name: string): string[] {
  const segments = name.split("-").map((segment) => segment.trim()).filter(Boolean);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const segment of segments) {
    for (const token of nameTokens(segment)) {
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(token);
    }
  }
  // Any leftover tokens from the raw name (no hyphens / odd punctuation).
  for (const token of nameTokens(name)) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(token);
  }
  return ordered;
}

/** Lowercase Search token BT would paste when selecting `job` from `peers`. */
export function selectionFilterQuery(job: SelectionFilterJob, peers: readonly SelectionFilterJob[]): string {
  const tokens = orderedCandidateTokens(job.name);

  // Address-first order: first unique token is usually the street name (BT: "purcell").
  for (const token of tokens) {
    const q = token.toLowerCase();
    const matches = peers.filter((peer) => jobMatchesQuery(peer, q));
    if (matches.length === 1 && matches[0]?.id === job.id) return q;
  }

  // No unique short token — try the longest distinctive token, then the full name
  // (BT still lands on a Search string that isolates the selected job).
  const longest = [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
  if (longest) {
    const q = longest.toLowerCase();
    const matches = peers.filter((peer) => jobMatchesQuery(peer, q));
    if (matches.length === 1 && matches[0]?.id === job.id) return q;
  }

  return job.name.trim().toLowerCase();
}
