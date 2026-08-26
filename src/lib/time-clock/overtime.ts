/**
 * Weekly overtime calculation. Pure, no database.
 *
 * CLAUDE.md 3: "daily+weekly OT taking the greater value." Two independent rules can
 * both flag overtime for the same week — a worker who does 9/9/9/9/4 (44 total, 4
 * daily-OT hours) and a worker who does 8/8/8/8/8 (40 total, 0 daily-OT) are
 * different cases the daily and weekly rules see differently. Computing both and
 * taking whichever credits the worker with *more* overtime hours is the
 * worker-favorable interpretation, and the one that never under-counts either rule.
 */

export const DAILY_OVERTIME_THRESHOLD_HOURS = 8;
export const WEEKLY_OVERTIME_THRESHOLD_HOURS = 40;
export const OVERTIME_MULTIPLIER = 1.5;

export interface DailyHours {
  /** ISO date (yyyy-mm-dd) the hours were worked on. */
  readonly date: string;
  readonly hours: number;
}

export interface WeeklyOvertimeResult {
  readonly totalHours: number;
  readonly regularHours: number;
  readonly overtimeHours: number;
  /** Which rule produced the overtime figure — surfaced so a payroll review can see why. */
  readonly rule: "DAILY" | "WEEKLY" | "NONE";
  readonly dailyOvertimeHours: number;
  readonly weeklyOvertimeHours: number;
}

/**
 * Compute regular vs. overtime hours for one worker's week from their daily totals.
 * `dailyHours` should already be summed across every job and cost code the worker
 * touched that day — overtime is a property of the worker's week, not of any one job.
 */
export function computeWeeklyOvertime(dailyHours: readonly DailyHours[]): WeeklyOvertimeResult {
  const totalHours = dailyHours.reduce((total, day) => total + day.hours, 0);

  const dailyOvertimeHours = dailyHours.reduce(
    (total, day) => total + Math.max(0, day.hours - DAILY_OVERTIME_THRESHOLD_HOURS),
    0,
  );
  const weeklyOvertimeHours = Math.max(0, totalHours - WEEKLY_OVERTIME_THRESHOLD_HOURS);

  const overtimeHours = Math.max(dailyOvertimeHours, weeklyOvertimeHours);
  const rule: WeeklyOvertimeResult["rule"] =
    overtimeHours === 0 ? "NONE" : dailyOvertimeHours >= weeklyOvertimeHours ? "DAILY" : "WEEKLY";

  return {
    totalHours,
    regularHours: totalHours - overtimeHours,
    overtimeHours,
    rule,
    dailyOvertimeHours,
    weeklyOvertimeHours,
  };
}

/**
 * The overtime premium owed on top of straight-time pay, in cents, given a base
 * hourly rate. Straight-time pay for all hours is assumed booked separately (as the
 * per-entry base labor cost in ./hours.ts) — this returns only the extra 0.5x (or
 * whatever OVERTIME_MULTIPLIER - 1 is) owed for the overtime hours.
 */
export function overtimePremiumCents(overtimeHours: number, baseHourlyRateCents: number): number {
  return Math.round(overtimeHours * baseHourlyRateCents * (OVERTIME_MULTIPLIER - 1));
}
