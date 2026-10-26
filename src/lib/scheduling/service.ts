/**
 * Database wiring for scheduling. Loads a schedule's items and the org's
 * non-working-day calendar, then hands them to the pure CPM engine in ./cpm.ts.
 */

import { db } from "@/lib/db";
import { clampBasisPoints } from "@/lib/scheduling/progress";
import { computeSchedule, projectFinishDate, type ScheduleItemInput } from "@/lib/scheduling/cpm";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class ScheduleNotFoundError extends Error {
  constructor(scheduleId: string) {
    super(`Schedule ${scheduleId} not found`);
    this.name = "ScheduleNotFoundError";
  }
}

export class ScheduleItemNotFoundError extends Error {
  constructor(itemId: string) {
    super(`Schedule item ${itemId} not found`);
    this.name = "ScheduleItemNotFoundError";
  }
}

async function nonWorkingDatesFor(organizationId: string): Promise<ReadonlySet<string>> {
  const rows = await db.nonWorkingDay.findMany({ where: { organizationId }, select: { date: true } });
  return new Set(rows.map((row) => row.date.toISOString().slice(0, 10)));
}

export interface CreateScheduleInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly name?: string;
}

export async function createSchedule(input: CreateScheduleInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.schedule.create({
    data: { organizationId: input.organizationId, jobId: input.jobId, name: input.name ?? "Schedule" },
  });
}

export interface CreateScheduleItemInput {
  readonly organizationId: string;
  readonly scheduleId: string;
  readonly title: string;
  readonly durationDays: number;
  readonly predecessorIds?: readonly string[];
  readonly lagDays?: number;
  readonly manualStartDate?: Date | null;
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly showOnGantt?: boolean;
  readonly assigneeUserIds?: readonly string[];
  readonly displayColor?: string | null;
  readonly isHourly?: boolean;
  readonly reminderDays?: number | null;
  readonly tags?: readonly string[];
  readonly notesInternal?: string | null;
  readonly notesSubs?: string | null;
  readonly notesClient?: string | null;
  readonly percentCompleteBasisPoints?: number;
  readonly phaseId?: string | null;
}

export async function addScheduleItem(input: CreateScheduleItemInput) {
  const schedule = await db.schedule.findFirst({
    where: { id: input.scheduleId, organizationId: input.organizationId },
  });
  if (!schedule) throw new ScheduleNotFoundError(input.scheduleId);

  const count = await db.scheduleItem.count({ where: { scheduleId: input.scheduleId } });

  return db.scheduleItem.create({
    data: {
      scheduleId: input.scheduleId,
      title: input.title,
      durationDays: input.durationDays,
      predecessorIds: [...(input.predecessorIds ?? [])],
      lagDays: input.lagDays ?? 0,
      manualStartDate: input.manualStartDate ?? null,
      clientVisible: input.clientVisible ?? true,
      subVisible: input.subVisible ?? true,
      showOnGantt: input.showOnGantt ?? true,
      assigneeUserIds: [...(input.assigneeUserIds ?? [])],
      displayColor: input.displayColor ?? null,
      isHourly: input.isHourly ?? false,
      reminderDays: input.reminderDays ?? null,
      tags: [...(input.tags ?? [])],
      notesInternal: input.notesInternal ?? null,
      notesSubs: input.notesSubs ?? null,
      notesClient: input.notesClient ?? null,
      percentCompleteBasisPoints: input.percentCompleteBasisPoints !== undefined ? clampBasisPoints(input.percentCompleteBasisPoints) : 0,
      phaseId: input.phaseId !== undefined ? await validPhaseId(input.scheduleId, input.phaseId) : null,
      sortOrder: count,
    },
  });
}

export interface UpdateScheduleItemInput {
  readonly organizationId: string;
  readonly itemId: string;
  readonly title?: string;
  readonly durationDays?: number;
  readonly predecessorIds?: readonly string[];
  readonly lagDays?: number;
  readonly manualStartDate?: Date | null;
  readonly confirmationStatus?: "UNCONFIRMED" | "CONFIRMED";
  readonly clientVisible?: boolean;
  readonly subVisible?: boolean;
  readonly showOnGantt?: boolean;
  readonly assigneeUserIds?: readonly string[];
  /** Basis points, 0 to 10000; clamped. */
  readonly percentCompleteBasisPoints?: number;
  /** A phase on the same schedule, or null to ungroup. */
  readonly phaseId?: string | null;
  readonly displayColor?: string | null;
  readonly isHourly?: boolean;
  readonly reminderDays?: number | null;
  readonly tags?: readonly string[];
  readonly notesInternal?: string | null;
  readonly notesSubs?: string | null;
  readonly notesClient?: string | null;
}

export async function updateScheduleItem(input: UpdateScheduleItemInput) {
  const existing = await db.scheduleItem.findFirst({
    where: { id: input.itemId, schedule: { organizationId: input.organizationId } },
  });
  if (!existing) throw new ScheduleItemNotFoundError(input.itemId);

  return db.scheduleItem.update({
    where: { id: input.itemId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.durationDays !== undefined ? { durationDays: input.durationDays } : {}),
      ...(input.predecessorIds !== undefined ? { predecessorIds: [...input.predecessorIds] } : {}),
      ...(input.lagDays !== undefined ? { lagDays: input.lagDays } : {}),
      ...(input.manualStartDate !== undefined ? { manualStartDate: input.manualStartDate } : {}),
      ...(input.confirmationStatus !== undefined ? { confirmationStatus: input.confirmationStatus } : {}),
      ...(input.clientVisible !== undefined ? { clientVisible: input.clientVisible } : {}),
      ...(input.subVisible !== undefined ? { subVisible: input.subVisible } : {}),
      ...(input.showOnGantt !== undefined ? { showOnGantt: input.showOnGantt } : {}),
      ...(input.assigneeUserIds !== undefined ? { assigneeUserIds: [...input.assigneeUserIds] } : {}),
      ...(input.phaseId !== undefined ? { phaseId: await validPhaseId(existing.scheduleId, input.phaseId) } : {}),
      ...(input.percentCompleteBasisPoints !== undefined ? { percentCompleteBasisPoints: clampBasisPoints(input.percentCompleteBasisPoints) } : {}),
      ...(input.displayColor !== undefined ? { displayColor: input.displayColor } : {}),
      ...(input.isHourly !== undefined ? { isHourly: input.isHourly } : {}),
      ...(input.reminderDays !== undefined ? { reminderDays: input.reminderDays } : {}),
      ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
      ...(input.notesInternal !== undefined ? { notesInternal: input.notesInternal } : {}),
      ...(input.notesSubs !== undefined ? { notesSubs: input.notesSubs } : {}),
      ...(input.notesClient !== undefined ? { notesClient: input.notesClient } : {}),
    },
  });
}

/** Get a schedule with every item's dates and critical-path status freshly computed. */
export async function getComputedSchedule(organizationId: string, scheduleId: string) {
  const schedule = await db.schedule.findFirst({
    where: { id: scheduleId, organizationId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!schedule) throw new ScheduleNotFoundError(scheduleId);

  const nonWorkingDates = await nonWorkingDatesFor(organizationId);

  const cpmInputs: ScheduleItemInput[] = schedule.items.map((item) => ({
    id: item.id,
    durationDays: item.durationDays,
    predecessorIds: item.predecessorIds,
    lagDays: item.lagDays,
    manualStartDate: item.manualStartDate,
  }));

  const computed = computeSchedule(cpmInputs, { nonWorkingDates });
  const computedById = new Map(computed.map((entry) => [entry.id, entry]));

  const items = schedule.items.map((item) => ({ ...item, ...computedById.get(item.id)! }));

  return {
    schedule: { id: schedule.id, jobId: schedule.jobId, name: schedule.name, isOnline: schedule.isOnline, isDraft: schedule.isDraft },
    phases: await db.schedulePhase.findMany({ where: { scheduleId: schedule.id }, orderBy: { sortOrder: "asc" } }),
    items,
    projectFinishDate: projectFinishDate(computed),
  };
}

/** Explicit conversion action: capture the current computed dates as the baseline snapshot. */
export async function snapshotBaseline(organizationId: string, scheduleId: string) {
  const view = await getComputedSchedule(organizationId, scheduleId);

  await db.$transaction(
    view.items.map((item) =>
      db.scheduleItem.update({
        where: { id: item.id },
        data: { baselineStart: item.startDate, baselineEnd: item.endDate },
      }),
    ),
  );

  return getComputedSchedule(organizationId, scheduleId);
}

export class NonWorkingDayExistsError extends Error {
  constructor(date: string) {
    super(`${date} is already a workday exception.`);
    this.name = "NonWorkingDayExistsError";
  }
}

export async function listNonWorkingDays(organizationId: string) {
  return db.nonWorkingDay.findMany({ where: { organizationId }, orderBy: { date: "asc" } });
}

/** `isoDate` is yyyy-mm-dd; stored as UTC midnight like everything the CPM engine reads. */
export async function addNonWorkingDay(organizationId: string, isoDate: string, reason: string | null) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date ${isoDate}`);
  const existing = await db.nonWorkingDay.findFirst({ where: { organizationId, date }, select: { id: true } });
  if (existing) throw new NonWorkingDayExistsError(isoDate);
  return db.nonWorkingDay.create({ data: { organizationId, date, reason } });
}

export async function deleteNonWorkingDay(organizationId: string, id: string) {
  await db.nonWorkingDay.deleteMany({ where: { id, organizationId } });
}

async function validPhaseId(scheduleId: string, phaseId: string | null): Promise<string | null> {
  if (phaseId === null) return null;
  const phase = await db.schedulePhase.findFirst({ where: { id: phaseId, scheduleId }, select: { id: true } });
  if (!phase) throw new SchedulePhaseNotFoundError(phaseId);
  return phase.id;
}

export class SchedulePhaseNotFoundError extends Error {
  constructor(phaseId: string) {
    super(`Phase ${phaseId} not found on this schedule`);
    this.name = "SchedulePhaseNotFoundError";
  }
}

export class SchedulePhaseNameTakenError extends Error {
  constructor(name: string) {
    super(`A phase named "${name}" already exists on this schedule.`);
    this.name = "SchedulePhaseNameTakenError";
  }
}

export async function createSchedulePhase(organizationId: string, scheduleId: string, rawName: string) {
  const name = rawName.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Phase name is required.");

  const schedule = await db.schedule.findFirst({ where: { id: scheduleId, organizationId }, select: { id: true } });
  if (!schedule) throw new ScheduleNotFoundError(scheduleId);

  const taken = await db.schedulePhase.findFirst({ where: { scheduleId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (taken) throw new SchedulePhaseNameTakenError(name);

  const last = await db.schedulePhase.findFirst({ where: { scheduleId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return db.schedulePhase.create({ data: { scheduleId, name, sortOrder: (last?.sortOrder ?? -1) + 1 } });
}

/** Items in the phase are ungrouped, never deleted (ScheduleItem.phaseId is SetNull). */
export async function deleteSchedulePhase(organizationId: string, phaseId: string) {
  const phase = await db.schedulePhase.findFirst({ where: { id: phaseId, schedule: { organizationId } }, select: { id: true } });
  if (!phase) throw new SchedulePhaseNotFoundError(phaseId);
  await db.schedulePhase.delete({ where: { id: phase.id } });
}

export async function setScheduleFlags(organizationId: string, scheduleId: string, flags: { isOnline?: boolean; isDraft?: boolean }) {
  const schedule = await db.schedule.findFirst({ where: { id: scheduleId, organizationId }, select: { id: true } });
  if (!schedule) throw new ScheduleNotFoundError(scheduleId);
  return db.schedule.update({ where: { id: scheduleId }, data: flags });
}
