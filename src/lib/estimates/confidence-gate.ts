/**
 * Low-confidence AI line review gate (Handoff parity CR P3 #28).
 * LOW (and optionally MEDIUM) lines must be staff-reviewed before send.
 */

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | null | undefined;

export interface ConfidenceGateLine {
  readonly id: string;
  readonly title?: string | null;
  readonly confidence?: ConfidenceLevel;
  readonly confidenceReviewedAt?: Date | string | null;
}

/** Lines that still need a human review before the proposal can send. */
export function findUnreviewedConfidenceLines(
  lines: readonly ConfidenceGateLine[],
  options?: { readonly alsoGateMedium?: boolean },
): ConfidenceGateLine[] {
  const gateMedium = options?.alsoGateMedium !== false;
  return lines.filter((line) => {
    if (line.confidenceReviewedAt) return false;
    if (line.confidence === "LOW") return true;
    if (gateMedium && line.confidence === "MEDIUM") return true;
    return false;
  });
}

export function findConfidenceGateIssues(lines: readonly ConfidenceGateLine[]): string[] {
  return findUnreviewedConfidenceLines(lines).map((line) => {
    const level = line.confidence ?? "LOW";
    const title = line.title?.trim() || line.id;
    return `Review ${level}-confidence line "${title}" before send.`;
  });
}
