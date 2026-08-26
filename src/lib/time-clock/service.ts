/**
 * Database wiring for time clock entries. The arithmetic lives in ./geofence.ts,
 * ./hours.ts and ./overtime.ts and stays testable without a database.
 */

import { LaborRateSource, TimeClockApprovalStatus, UserRole } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { checkGeofence, type GpsPoint } from "@/lib/time-clock/geofence";
import { ClockNotClosedError, OpenBreakError, workedHours } from "@/lib/time-clock/hours";
import { computeWeeklyOvertime, type DailyHours } from "@/lib/time-clock/overtime";
import { acceptsNewCommitments } from "@/lib/job-status";
import type { Cents } from "@/lib/money";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class JobNotOpenError extends Error {
  constructor(jobId: string, status: string) {
    super(`Job ${jobId} is ${status} and cannot accept new time clock entries.`);
    this.name = "JobNotOpenError";
  }
}

export class CostCodeNotFoundError extends Error {
  constructor(costCodeId: string) {
    super(`Cost code ${costCodeId} not found in this organization.`);
    this.name = "CostCodeNotFoundError";
  }
}

export class NoLaborRateError extends Error {
  constructor(costCodeId: string) {
    super(`Cost code ${costCodeId} has no default hourly rate. Pass an explicit rate to clock in.`);
    this.name = "NoLaborRateError";
  }
}

export class UserAlreadyClockedInError extends Error {
  constructor(userId: string) {
    super(`User ${userId} is already clocked in on another entry. Clock out first.`);
    this.name = "UserAlreadyClockedInError";
  }
}

export class EntryNotFoundError extends Error {
  constructor(entryId: string) {
    super(`Time clock entry ${entryId} not found`);
    this.name = "EntryNotFoundError";
  }
}

export class EntryAlreadyClockedOutError extends Error {
  constructor(entryId: string) {
    super(`Time clock entry ${entryId} has already been clocked out.`);
    this.name = "EntryAlreadyClockedOutError";
  }
}

export class OpenBreakExistsError extends Error {
  constructor() {
    super("This entry already has an open break. End it before starting another.");
    this.name = "OpenBreakExistsError";
  }
}

export class NoOpenBreakError extends Error {
  constructor() {
    super("This entry has no open break to end.");
    this.name = "NoOpenBreakError";
  }
}

export class InsufficientRoleError extends Error {
  constructor(action: string) {
    super(`Only an admin or PM may ${action}.`);
    this.name = "InsufficientRoleError";
  }
}

async function resolveLaborRate(
  organizationId: string,
  costCodeId: string,
  overrideRateCents?: Cents,
): Promise<{ hourlyRateCents: Cents; rateSource: LaborRateSource }> {
  const costCode = await db.costCode.findFirst({
    where: { id: costCodeId, organizationId },
    select: { id: true, defaultHourlyRateCents: true },
  });
  if (!costCode) throw new CostCodeNotFoundError(costCodeId);

  if (overrideRateCents !== undefined) {
    return { hourlyRateCents: overrideRateCents, rateSource: LaborRateSource.MANUAL_OVERRIDE };
  }
  if (costCode.defaultHourlyRateCents === null) {
    throw new NoLaborRateError(costCodeId);
  }
  return { hourlyRateCents: costCode.defaultHourlyRateCents, rateSource: LaborRateSource.COST_CODE_DEFAULT };
}

export interface ClockInInput {
  readonly organizationId: string;
  readonly userId: string;
  readonly jobId: string;
  readonly costCodeId: string;
  readonly gps?: GpsPoint;
  readonly overrideRateCents?: Cents;
  /** Set when a supervisor is clocking someone else in. */
  readonly clockedInByUserId?: string;
  readonly clockInAt?: Date;
}

export async function clockIn(input: ClockInInput) {
  const job = await db.job.findFirst({
    where: { id: input.jobId, organizationId: input.organizationId },
    select: { id: true, status: true, latitude: true, longitude: true, geofenceRadiusMeters: true },
  });
  if (!job) throw new JobNotFoundError(input.jobId);
  if (!acceptsNewCommitments(job.status)) throw new JobNotOpenError(input.jobId, job.status);

  const openEntry = await db.timeClockEntry.findFirst({
    where: { organizationId: input.organizationId, userId: input.userId, clockOutAt: null },
    select: { id: true },
  });
  if (openEntry) throw new UserAlreadyClockedInError(input.userId);

  const { hourlyRateCents, rateSource } = await resolveLaborRate(
    input.organizationId,
    input.costCodeId,
    input.overrideRateCents,
  );

  const geofenceStatus = checkGeofence(job, input.gps ?? null);

  return db.timeClockEntry.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      jobId: input.jobId,
      costCodeId: input.costCodeId,
      clockInAt: input.clockInAt ?? new Date(),
      gpsInLatitude: input.gps?.latitude ?? null,
      gpsInLongitude: input.gps?.longitude ?? null,
      geofenceStatus,
      hourlyRateCents,
      rateSource,
      clockedInByUserId: input.clockedInByUserId ?? null,
    },
  });
}

export interface BulkClockInInput {
  readonly organizationId: string;
  readonly supervisorUserId: string;
  readonly supervisorRole: UserRole;
  readonly jobId: string;
  readonly costCodeId: string;
  readonly userIds: readonly string[];
  readonly gps?: GpsPoint;
}

const SUPERVISOR_ROLES: readonly UserRole[] = [UserRole.ADMIN, UserRole.PM];

/** Clock several workers in at once. Failures for individual workers don't abort the batch. */
export async function bulkClockIn(input: BulkClockInInput) {
  if (!SUPERVISOR_ROLES.includes(input.supervisorRole)) {
    throw new InsufficientRoleError("bulk clock in other workers");
  }

  const results = await Promise.allSettled(
    input.userIds.map((userId) =>
      clockIn({
        organizationId: input.organizationId,
        userId,
        jobId: input.jobId,
        costCodeId: input.costCodeId,
        gps: input.gps,
        clockedInByUserId: input.supervisorUserId,
      }),
    ),
  );

  return input.userIds.map((userId, index) => {
    const result = results[index];
    return result.status === "fulfilled"
      ? { userId, ok: true as const, entry: result.value }
      : { userId, ok: false as const, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
  });
}

export interface ClockOutInput {
  readonly organizationId: string;
  readonly entryId: string;
  readonly gps?: GpsPoint;
  readonly clockOutAt?: Date;
}

export async function clockOut(input: ClockOutInput) {
  const entry = await db.timeClockEntry.findFirst({
    where: { id: input.entryId, organizationId: input.organizationId },
    include: { job: true, breaks: true },
  });
  if (!entry) throw new EntryNotFoundError(input.entryId);
  if (entry.clockOutAt !== null) throw new EntryAlreadyClockedOutError(input.entryId);
  if (entry.breaks.some((b) => b.endAt === null)) throw new OpenBreakError();

  const clockOutAt = input.clockOutAt ?? new Date();

  return db.timeClockEntry.update({
    where: { id: entry.id },
    data: {
      clockOutAt,
      gpsOutLatitude: input.gps?.latitude ?? null,
      gpsOutLongitude: input.gps?.longitude ?? null,
    },
    include: { breaks: true },
  });
}

export async function startBreak(organizationId: string, entryId: string, startAt?: Date) {
  const entry = await db.timeClockEntry.findFirst({
    where: { id: entryId, organizationId },
    include: { breaks: true },
  });
  if (!entry) throw new EntryNotFoundError(entryId);
  if (entry.clockOutAt !== null) throw new EntryAlreadyClockedOutError(entryId);
  if (entry.breaks.some((b) => b.endAt === null)) throw new OpenBreakExistsError();

  return db.timeClockBreak.create({ data: { timeClockEntryId: entry.id, startAt: startAt ?? new Date() } });
}

export async function endBreak(organizationId: string, entryId: string, endAt?: Date) {
  const entry = await db.timeClockEntry.findFirst({ where: { id: entryId, organizationId } });
  if (!entry) throw new EntryNotFoundError(entryId);

  const openBreak = await db.timeClockBreak.findFirst({
    where: { timeClockEntryId: entryId, endAt: null },
    orderBy: { startAt: "desc" },
  });
  if (!openBreak) throw new NoOpenBreakError();

  return db.timeClockBreak.update({ where: { id: openBreak.id }, data: { endAt: endAt ?? new Date() } });
}

export interface ApprovalInput {
  readonly organizationId: string;
  readonly entryId: string;
  readonly approverUserId: string;
  readonly approverRole: UserRole;
}

async function assertApprovable(input: ApprovalInput) {
  if (!SUPERVISOR_ROLES.includes(input.approverRole)) {
    throw new InsufficientRoleError("approve or reject time clock entries");
  }
  const entry = await db.timeClockEntry.findFirst({ where: { id: input.entryId, organizationId: input.organizationId } });
  if (!entry) throw new EntryNotFoundError(input.entryId);
  if (entry.clockOutAt === null) throw new ClockNotClosedError();
  return entry;
}

export async function approveEntry(input: ApprovalInput) {
  await assertApprovable(input);
  return db.timeClockEntry.update({
    where: { id: input.entryId },
    data: {
      approvalStatus: TimeClockApprovalStatus.APPROVED,
      approvedByUserId: input.approverUserId,
      approvedAt: new Date(),
    },
  });
}

export async function rejectEntry(input: ApprovalInput) {
  await assertApprovable(input);
  return db.timeClockEntry.update({
    where: { id: input.entryId },
    data: {
      approvalStatus: TimeClockApprovalStatus.REJECTED,
      approvedByUserId: input.approverUserId,
      approvedAt: new Date(),
    },
  });
}

/** Every completed entry's worked hours, for the funnel and for weekly OT reporting. */
export async function computedHoursForEntry(entryId: string): Promise<number> {
  const entry = await db.timeClockEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: { breaks: true },
  });
  return workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks);
}

export interface WeeklyOvertimeSummaryInput {
  readonly organizationId: string;
  readonly userId: string;
  /** Inclusive start of the work week. */
  readonly weekStart: Date;
}

/** Weekly overtime summary for one worker, across every job and cost code that week. */
export async function weeklyOvertimeSummary(input: WeeklyOvertimeSummaryInput) {
  const weekEnd = new Date(input.weekStart.getTime() + 7 * 86_400_000);

  const entries = await db.timeClockEntry.findMany({
    where: {
      organizationId: input.organizationId,
      userId: input.userId,
      clockInAt: { gte: input.weekStart, lt: weekEnd },
      clockOutAt: { not: null },
    },
    include: { breaks: true },
  });

  const hoursByDate = new Map<string, number>();
  for (const entry of entries) {
    const hours = workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks);
    const date = entry.clockInAt.toISOString().slice(0, 10);
    hoursByDate.set(date, (hoursByDate.get(date) ?? 0) + hours);
  }

  const dailyHours: DailyHours[] = Array.from(hoursByDate.entries())
    .map(([date, hours]) => ({ date, hours }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { ...computeWeeklyOvertime(dailyHours), dailyHours, entryCount: entries.length };
}
