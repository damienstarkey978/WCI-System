/**
 * Worked-hours and cost arithmetic for a single time clock entry. Pure, no database.
 *
 * Deliberately does NOT apply an overtime premium — overtime depends on a worker's
 * total hours across every job and cost code in a work week (see ./overtime.ts),
 * which is not something a single entry can know. Per-entry cost booked into the
 * commitment funnel is base hours × base rate; the OT premium is a payroll-period
 * reporting concern, computed separately, not mixed into per-job cost attribution.
 */

import { roundHalfAwayFromZero, type Cents } from "@/lib/money";

export interface BreakInterval {
  readonly startAt: Date;
  readonly endAt: Date | null;
}

export class OpenBreakError extends Error {
  constructor() {
    super("Cannot compute worked hours while a break is still open. End the break first.");
    this.name = "OpenBreakError";
  }
}

export class ClockNotClosedError extends Error {
  constructor() {
    super("Cannot compute worked hours before clocking out.");
    this.name = "ClockNotClosedError";
  }
}

/**
 * Hours worked between clock-in and clock-out, minus any break time.
 * Throws if the clock is still open or a break was never ended — both mean the
 * entry isn't finished, and computing "hours so far" would silently understate cost.
 */
export function workedHours(clockInAt: Date, clockOutAt: Date | null, breaks: readonly BreakInterval[]): number {
  if (clockOutAt === null) {
    throw new ClockNotClosedError();
  }
  if (breaks.some((b) => b.endAt === null)) {
    throw new OpenBreakError();
  }

  const totalMs = clockOutAt.getTime() - clockInAt.getTime();
  const breakMs = breaks.reduce((total, b) => total + (b.endAt!.getTime() - b.startAt.getTime()), 0);

  return Math.max(0, totalMs - breakMs) / 3_600_000;
}

/** Base cost of an entry: hours × hourly rate, with no overtime premium. */
export function baseLaborCostCents(hours: number, hourlyRateCents: Cents): Cents {
  return roundHalfAwayFromZero(hours * hourlyRateCents);
}
