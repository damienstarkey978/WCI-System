/**
 * Road-name matching — Duke's PO/transaction-to-job matcher.
 *
 * Duke currently matches purchases to jobs by reading the road name off a PO or a
 * card transaction ("283 RED CEDAR DR", "red cedar", "283RC") and finding the job on
 * that street. Exposing it here means Duke calls one endpoint instead of
 * reimplementing the heuristic (CLAUDE.md 2.5), and when the matching improves,
 * every consumer improves with it.
 *
 * Pure and dependency-free so the scoring can be unit-tested against real strings.
 */

/** Street suffixes and unit markers that carry no signal for matching. */
const NOISE_TOKENS = new Set([
  "st", "street", "rd", "road", "dr", "drive", "ln", "lane", "ave", "avenue",
  "ct", "court", "cir", "circle", "way", "blvd", "boulevard", "pl", "place",
  "ter", "terrace", "trl", "trail", "pkwy", "parkway", "hwy", "highway",
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
  "north", "south", "east", "west",
  "apt", "unit", "ste", "suite", "lot", "bldg",
]);

/** Split a string into comparable lowercase tokens. */
export function tokenize(input: string): readonly string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Tokens with street noise and bare numbers removed — the actual road name. */
export function roadNameTokens(input: string): readonly string[] {
  return tokenize(input).filter((token) => !NOISE_TOKENS.has(token) && !/^\d+$/.test(token));
}

/** The leading house number, if the string starts with one. */
export function houseNumber(input: string): string | null {
  const match = /^\s*(\d{1,6})\b/.exec(input);
  return match ? match[1] : null;
}

/**
 * Every standalone number in a string.
 *
 * Card statements and PO descriptions bury the house number mid-string
 * ("SHERWIN WILLIAMS 283 RED CEDAR"), so a leading-number-only rule misses them and
 * then reports a false ambiguity between two houses on the same street. Scoring asks
 * the safe question — "does the query contain *this job's* number?" — rather than
 * trying to guess which number in the string is the address, so a store number like
 * "#4521" can never match a job it doesn't belong to.
 */
export function numericTokens(input: string): readonly string[] {
  return tokenize(input).filter((token) => /^\d+$/.test(token));
}

/**
 * Expand a compact prefix like "283RC" into its parts: the house number and the
 * initials of the road name. WCI's PO names use this form constantly.
 */
export function parsePrefix(input: string): { number: string | null; initials: string | null } {
  const match = /^\s*(\d{1,6})\s*([A-Za-z]{1,4})\s*$/.exec(input);
  if (!match) return { number: houseNumber(input), initials: null };
  return { number: match[1], initials: match[2].toLowerCase() };
}

/** First letters of each road-name token: "Red Cedar Dr" -> "rc". */
export function roadInitials(input: string): string {
  return roadNameTokens(input)
    .map((token) => token[0])
    .join("");
}

export interface JobMatchCandidate {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
  readonly addressLine1: string | null;
}

export interface JobMatch {
  readonly job: JobMatchCandidate;
  /** 0–100. 100 is an exact prefix hit. */
  readonly score: number;
  readonly reason: string;
}

/**
 * Score one job against a query string.
 *
 * The ladder, strongest signal first:
 *   1. exact prefix match ("283RC")           → 100
 *   2. road name + house number both match     → 95
 *   3. full road name matches                  → 80
 *   4. prefix initials + number match the road → 75
 *   5. partial road-name overlap               → up to 60
 */
export function scoreJob(query: string, job: JobMatchCandidate): JobMatch | null {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return null;

  const queryTokens = tokenize(normalizedQuery);
  const queryRoad = roadNameTokens(normalizedQuery);
  const queryNumbers = numericTokens(normalizedQuery);
  const queryPrefix = parsePrefix(normalizedQuery);

  // 1. Exact prefix.
  if (job.prefix) {
    const jobPrefix = job.prefix.toLowerCase();
    if (queryTokens.includes(jobPrefix) || normalizedQuery.toLowerCase().replace(/\s+/g, "") === jobPrefix) {
      return { job, score: 100, reason: `Prefix "${job.prefix}" matched exactly` };
    }
  }

  const address = job.addressLine1 ?? "";
  const jobRoad = roadNameTokens(address);
  const jobNumber = houseNumber(address);

  if (jobRoad.length > 0 && queryRoad.length > 0) {
    const overlap = jobRoad.filter((token) => queryRoad.includes(token));
    const fullRoadMatch = overlap.length === jobRoad.length;

    // 2. Road name matches and the query carries this job's house number.
    if (fullRoadMatch && jobNumber !== null && queryNumbers.includes(jobNumber)) {
      return { job, score: 95, reason: `Road name and house number both matched "${address}"` };
    }

    // 3. Full road name, no number to confirm.
    if (fullRoadMatch) {
      return { job, score: 80, reason: `Road name matched "${jobRoad.join(" ")}"` };
    }

    // 5. Partial overlap — weakest useful signal.
    if (overlap.length > 0) {
      const ratio = overlap.length / jobRoad.length;
      return {
        job,
        score: Math.round(40 + ratio * 20),
        reason: `Partial road-name match on ${overlap.join(", ")}`,
      };
    }
  }

  // 4. Compact prefix form in the query ("283RC") against the job's address.
  if (queryPrefix.initials && jobRoad.length > 0) {
    const initials = roadInitials(address);
    if (initials === queryPrefix.initials && (queryPrefix.number === null || queryPrefix.number === jobNumber)) {
      return { job, score: 75, reason: `Initials "${queryPrefix.initials}" matched "${address}"` };
    }
  }

  return null;
}

export interface MatchOptions {
  /** Matches below this score are not returned. Defaults to 60. */
  readonly minimumScore?: number;
  readonly limit?: number;
}

export interface MatchResult {
  readonly query: string;
  readonly matches: readonly JobMatch[];
  /**
   * The single confident answer, or null. Set only when the best match clears the
   * threshold *and* is clearly ahead of the runner-up — an ambiguous match is worse
   * than no match, because it silently books a cost to the wrong job.
   */
  readonly bestMatch: JobMatch | null;
  readonly ambiguous: boolean;
}

export function matchJobsByRoadName(
  query: string,
  jobs: readonly JobMatchCandidate[],
  options: MatchOptions = {},
): MatchResult {
  const minimumScore = options.minimumScore ?? 60;
  const limit = options.limit ?? 5;

  const scored = jobs
    .map((job) => scoreJob(query, job))
    .filter((match): match is JobMatch => match !== null && match.score >= minimumScore)
    .sort((a, b) => b.score - a.score);

  const matches = scored.slice(0, limit);
  const [best, runnerUp] = matches;

  // A tie between two jobs on the same street is exactly the case Duke has to
  // resolve by hand today; flag it rather than guessing.
  const ambiguous = best !== undefined && runnerUp !== undefined && best.score === runnerUp.score;

  return {
    query,
    matches,
    bestMatch: best !== undefined && !ambiguous ? best : null,
    ambiguous,
  };
}
