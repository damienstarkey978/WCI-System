/**
 * Schedule progress. Each item carries a staff-entered percentCompleteBasisPoints
 * (10000 = 100%); a schedule's overall progress weights each item by its working-day
 * duration, so a 20 day framing task moves the needle more than a 1 day inspection.
 * Pure (no db) so it is unit-testable.
 */

import { BASIS_POINTS_SCALE, roundHalfAwayFromZero, type BasisPoints } from "@/lib/money";

export interface ProgressItem {
  readonly durationDays: number;
  readonly percentCompleteBasisPoints: BasisPoints;
}

export function clampBasisPoints(value: number): BasisPoints {
  if (!Number.isFinite(value)) return 0;
  return Math.min(BASIS_POINTS_SCALE, Math.max(0, Math.round(value)));
}

/** Duration weighted percent complete; null when there is nothing to weigh. */
export function weightedPercentComplete(items: readonly ProgressItem[]): BasisPoints | null {
  const totalDays = items.reduce((sum, item) => sum + Math.max(0, item.durationDays), 0);
  if (totalDays === 0) return null;
  const doneDays = items.reduce((sum, item) => sum + Math.max(0, item.durationDays) * clampBasisPoints(item.percentCompleteBasisPoints), 0);
  return roundHalfAwayFromZero(doneDays / totalDays);
}
