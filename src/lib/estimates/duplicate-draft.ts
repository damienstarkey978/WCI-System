/**
 * Duplicate AI draft detection (Handoff parity CR P1 #11).
 * Second DRAFT within the window for the same lead → 409 unless newVersion.
 */

export const DUPLICATE_DRAFT_WINDOW_HOURS = 4;

export class DuplicateEstimateDraftError extends Error {
  constructor(
    public readonly existingEstimateId: string,
    public readonly windowHours: number = DUPLICATE_DRAFT_WINDOW_HOURS,
  ) {
    super(
      `A draft estimate (${existingEstimateId}) was already created within the last ${windowHours} hours. Pass newVersion=true to create another.`,
    );
    this.name = "DuplicateEstimateDraftError";
  }
}

export function duplicateDraftCutoff(now: Date = new Date(), windowHours = DUPLICATE_DRAFT_WINDOW_HOURS): Date {
  return new Date(now.getTime() - windowHours * 60 * 60 * 1000);
}
