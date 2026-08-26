/**
 * Scheduling engine — dependency auto-shift and critical path (CLAUDE.md 3:
 * "dependencies with auto-shift, critical path"). Pure, no database, no framework.
 *
 * Dates are computed, never stored, the same principle CLAUDE.md 2.3 applies to
 * the Budget: a ScheduleItem persists only its duration, predecessors, and lag —
 * start/end/float/critical-path are recomputed here every time, so editing one
 * item's duration or an org holiday calendar immediately reflows everything
 * downstream instead of leaving stale dates lying around.
 *
 * All arithmetic happens in whole calendar days internally but only ever *lands*
 * on working days — weekends (by default) and any date in `nonWorkingDates` are
 * skipped over, never scheduled onto.
 */

export class ScheduleCycleError extends Error {
  constructor(cycleItemIds: readonly string[]) {
    super(`Schedule has a dependency cycle involving: ${cycleItemIds.join(" -> ")}`);
    this.name = "ScheduleCycleError";
  }
}

export class MissingAnchorError extends Error {
  constructor(itemId: string) {
    super(`Schedule item ${itemId} has no predecessors and no manualStartDate to anchor it.`);
    this.name = "MissingAnchorError";
  }
}

export class UnknownPredecessorError extends Error {
  constructor(itemId: string, predecessorId: string) {
    super(`Schedule item ${itemId} lists predecessor ${predecessorId}, which is not in this schedule.`);
    this.name = "UnknownPredecessorError";
  }
}

export interface ScheduleItemInput {
  readonly id: string;
  /** Working-day span, inclusive of the start day. Must be >= 1. */
  readonly durationDays: number;
  readonly predecessorIds: readonly string[];
  /** Working days between a predecessor's finish and this item's earliest start. May be negative (lead time). */
  readonly lagDays: number;
  /** Required when predecessorIds is empty — the anchor the engine propagates everything else from. */
  readonly manualStartDate: Date | null;
}

export interface ComputeScheduleOptions {
  /** ISO yyyy-mm-dd dates (holidays, shutdowns) to skip over. */
  readonly nonWorkingDates?: ReadonlySet<string>;
  /** Default true: Saturday and Sunday are never scheduled onto. */
  readonly weekendIsNonWorking?: boolean;
}

export interface ComputedScheduleItem {
  readonly id: string;
  readonly startDate: Date;
  /** Inclusive — the last working day of the item, not the day after. */
  readonly endDate: Date;
  /** Working days of slack before this item would delay the overall finish. */
  readonly floatDays: number;
  readonly isCriticalPath: boolean;
}

const MS_PER_DAY = 86_400_000;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function makeIsWorkingDay(options: ComputeScheduleOptions): (date: Date) => boolean {
  const nonWorking = options.nonWorkingDates ?? new Set<string>();
  const weekendIsNonWorking = options.weekendIsNonWorking ?? true;
  return (date: Date) => {
    if (weekendIsNonWorking && isWeekend(date)) return false;
    return !nonWorking.has(toIsoDate(date));
  };
}

/** Step forward (or backward, for negative n) by exactly n working days. n=0 rolls forward onto the next working day if needed. */
function addWorkingDays(date: Date, n: number, isWorkingDay: (d: Date) => boolean): Date {
  let current = new Date(date.getTime());
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);

  // Landing day itself must be a working day before we start counting steps.
  while (!isWorkingDay(current)) {
    current = new Date(current.getTime() + step * MS_PER_DAY);
  }

  while (remaining > 0) {
    current = new Date(current.getTime() + step * MS_PER_DAY);
    if (isWorkingDay(current)) {
      remaining -= 1;
    }
  }
  return current;
}

/** Signed count of working-day steps from `from` to `to` (both assumed to already be working days). */
function workingDaysBetween(from: Date, to: Date, isWorkingDay: (d: Date) => boolean): number {
  if (from.getTime() === to.getTime()) return 0;
  const step = to.getTime() > from.getTime() ? 1 : -1;
  let current = new Date(from.getTime());
  let count = 0;
  while (current.getTime() !== to.getTime()) {
    current = new Date(current.getTime() + step * MS_PER_DAY);
    if (isWorkingDay(current)) count += step;
  }
  return count;
}

/** Kahn's algorithm; throws ScheduleCycleError on any remaining node once the queue drains. */
function topologicalOrder(items: readonly ScheduleItemInput[]): readonly string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const inDegree = new Map<string, number>(items.map((item) => [item.id, 0]));

  for (const item of items) {
    for (const predecessorId of item.predecessorIds) {
      if (!byId.has(predecessorId)) {
        throw new UnknownPredecessorError(item.id, predecessorId);
      }
      inDegree.set(item.id, (inDegree.get(item.id) ?? 0) + 1);
    }
  }

  const successorsOf = new Map<string, string[]>();
  for (const item of items) {
    for (const predecessorId of item.predecessorIds) {
      const list = successorsOf.get(predecessorId) ?? [];
      list.push(item.id);
      successorsOf.set(predecessorId, list);
    }
  }

  const queue = items.filter((item) => (inDegree.get(item.id) ?? 0) === 0).map((item) => item.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const successorId of successorsOf.get(id) ?? []) {
      const remaining = (inDegree.get(successorId) ?? 0) - 1;
      inDegree.set(successorId, remaining);
      if (remaining === 0) queue.push(successorId);
    }
  }

  if (order.length !== items.length) {
    const stuck = items.map((item) => item.id).filter((id) => !order.includes(id));
    throw new ScheduleCycleError(stuck);
  }

  return order;
}

/**
 * Compute start/end/float/critical-path for every item in a schedule.
 *
 * @throws {UnknownPredecessorError} a predecessor id isn't in this item set
 * @throws {ScheduleCycleError} the dependency graph has a cycle
 * @throws {MissingAnchorError} a root item (no predecessors) has no manualStartDate
 */
export function computeSchedule(
  items: readonly ScheduleItemInput[],
  options: ComputeScheduleOptions = {},
): readonly ComputedScheduleItem[] {
  if (items.length === 0) return [];

  const isWorkingDay = makeIsWorkingDay(options);
  const byId = new Map(items.map((item) => [item.id, item]));
  const order = topologicalOrder(items);

  const successorsOf = new Map<string, { id: string; lagDays: number }[]>();
  for (const item of items) {
    for (const predecessorId of item.predecessorIds) {
      const list = successorsOf.get(predecessorId) ?? [];
      list.push({ id: item.id, lagDays: item.lagDays });
      successorsOf.set(predecessorId, list);
    }
  }

  // --- Forward pass: earliest start/finish ---------------------------------
  const earlyStart = new Map<string, Date>();
  const earlyFinish = new Map<string, Date>();

  for (const id of order) {
    const item = byId.get(id)!;

    let start: Date;
    if (item.predecessorIds.length === 0) {
      if (!item.manualStartDate) throw new MissingAnchorError(item.id);
      start = addWorkingDays(item.manualStartDate, 0, isWorkingDay);
    } else {
      const candidates = item.predecessorIds.map((predecessorId) =>
        addWorkingDays(earlyFinish.get(predecessorId)!, 1 + item.lagDays, isWorkingDay),
      );
      start = candidates.reduce((latest, candidate) => (candidate.getTime() > latest.getTime() ? candidate : latest));
    }

    const finish = addWorkingDays(start, item.durationDays - 1, isWorkingDay);
    earlyStart.set(id, start);
    earlyFinish.set(id, finish);
  }

  const projectFinish = [...earlyFinish.values()].reduce((latest, date) =>
    date.getTime() > latest.getTime() ? date : latest,
  );

  // --- Backward pass: latest start/finish, for float --------------------
  const lateFinish = new Map<string, Date>();
  const lateStart = new Map<string, Date>();

  for (const id of [...order].reverse()) {
    const item = byId.get(id)!;
    const successors = successorsOf.get(id) ?? [];

    const finish =
      successors.length === 0
        ? projectFinish
        : successors
            .map((successor) => addWorkingDays(lateStart.get(successor.id)!, -(1 + successor.lagDays), isWorkingDay))
            .reduce((earliest, candidate) => (candidate.getTime() < earliest.getTime() ? candidate : earliest));

    const start = addWorkingDays(finish, -(item.durationDays - 1), isWorkingDay);
    lateFinish.set(id, finish);
    lateStart.set(id, start);
  }

  return items.map((item) => {
    const floatDays = workingDaysBetween(earlyStart.get(item.id)!, lateStart.get(item.id)!, isWorkingDay);
    return {
      id: item.id,
      startDate: earlyStart.get(item.id)!,
      endDate: earlyFinish.get(item.id)!,
      floatDays,
      isCriticalPath: floatDays === 0,
    };
  });
}

/** The project's overall finish date — the latest early-finish across all items. */
export function projectFinishDate(computed: readonly ComputedScheduleItem[]): Date | null {
  if (computed.length === 0) return null;
  return computed.reduce((latest, item) => (item.endDate.getTime() > latest.getTime() ? item.endDate : latest), computed[0].endDate);
}
