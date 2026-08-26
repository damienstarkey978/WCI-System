/**
 * Database wiring for scheduling. Loads a schedule's items and the org's
 * non-working-day calendar, then hands them to the pure CPM engine in ./cpm.ts.
 */

import { db } from "@/lib/db";
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
  readonly assigneeUserIds?: readonly string[];
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
      assigneeUserIds: [...(input.assigneeUserIds ?? [])],
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
  readonly assigneeUserIds?: readonly string[];
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
      ...(input.assigneeUserIds !== undefined ? { assigneeUserIds: [...input.assigneeUserIds] } : {}),
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
    schedule: { id: schedule.id, jobId: schedule.jobId, name: schedule.name },
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
