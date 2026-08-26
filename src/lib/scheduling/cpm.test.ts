import { describe, expect, it } from "vitest";

import {
  computeSchedule,
  MissingAnchorError,
  projectFinishDate,
  ScheduleCycleError,
  UnknownPredecessorError,
  type ScheduleItemInput,
} from "@/lib/scheduling/cpm";

// Monday, 2026-01-05.
const MONDAY = new Date("2026-01-05T00:00:00Z");
const iso = (date: Date) => date.toISOString().slice(0, 10);

function item(overrides: Partial<ScheduleItemInput> & { id: string }): ScheduleItemInput {
  return { durationDays: 1, predecessorIds: [], lagDays: 0, manualStartDate: null, ...overrides };
}

describe("a single anchored item", () => {
  it("starts on its manual start date", () => {
    const [result] = computeSchedule([item({ id: "a", manualStartDate: MONDAY, durationDays: 3 })]);
    expect(iso(result.startDate)).toBe("2026-01-05");
    expect(iso(result.endDate)).toBe("2026-01-07"); // Mon, Tue, Wed
    expect(result.isCriticalPath).toBe(true);
    expect(result.floatDays).toBe(0);
  });

  it("rolls a weekend anchor forward to the next working day", () => {
    const saturday = new Date("2026-01-10T00:00:00Z");
    const [result] = computeSchedule([item({ id: "a", manualStartDate: saturday, durationDays: 1 })]);
    expect(iso(result.startDate)).toBe("2026-01-12"); // Monday
  });
});

describe("finish-to-start dependency with auto-shift", () => {
  it("starts the next working day after its predecessor finishes, with zero lag", () => {
    const items = [
      item({ id: "a", manualStartDate: MONDAY, durationDays: 2 }), // Mon-Tue
      item({ id: "b", predecessorIds: ["a"], durationDays: 1 }),
    ];
    const [, b] = computeSchedule(items);
    expect(iso(b.startDate)).toBe("2026-01-07"); // Wednesday
  });

  it("inserts extra days for positive lag", () => {
    const items = [
      item({ id: "a", manualStartDate: MONDAY, durationDays: 1 }), // Mon
      item({ id: "b", predecessorIds: ["a"], lagDays: 2, durationDays: 1 }),
    ];
    const [, b] = computeSchedule(items);
    // a finishes Mon; +1 (next day) +2 lag = Thu.
    expect(iso(b.startDate)).toBe("2026-01-08");
  });

  it("shifting the predecessor's duration auto-shifts the successor (nothing stored, always recomputed)", () => {
    const base = [
      item({ id: "a", manualStartDate: MONDAY, durationDays: 2 }),
      item({ id: "b", predecessorIds: ["a"], durationDays: 1 }),
    ];
    const extended = [
      item({ id: "a", manualStartDate: MONDAY, durationDays: 5 }),
      item({ id: "b", predecessorIds: ["a"], durationDays: 1 }),
    ];
    const [, bBase] = computeSchedule(base);
    const [, bExtended] = computeSchedule(extended);
    expect(bExtended.startDate.getTime()).toBeGreaterThan(bBase.startDate.getTime());
  });

  it("skips weekends when a task's duration would otherwise land on one", () => {
    // Friday, duration 3 -> Fri, then skip Sat/Sun, then Mon = 2 working days used, need 1 more -> Tue.
    const friday = new Date("2026-01-09T00:00:00Z");
    const [result] = computeSchedule([item({ id: "a", manualStartDate: friday, durationDays: 3 })]);
    expect(iso(result.startDate)).toBe("2026-01-09");
    expect(iso(result.endDate)).toBe("2026-01-13"); // Fri, Mon, Tue
  });

  it("skips an explicit non-working (holiday) date", () => {
    const [result] = computeSchedule(
      [item({ id: "a", manualStartDate: MONDAY, durationDays: 3 })],
      { nonWorkingDates: new Set(["2026-01-06"]) }, // Tuesday off
    );
    // Mon, (skip Tue), Wed, Thu = 3 working days.
    expect(iso(result.endDate)).toBe("2026-01-08");
  });
});

describe("converging dependencies (diamond)", () => {
  //      B
  //    /   \
  //  A       D
  //    \   /
  //      C
  const items = [
    item({ id: "a", manualStartDate: MONDAY, durationDays: 1 }), // Mon
    item({ id: "b", predecessorIds: ["a"], durationDays: 5 }), // long path: Tue-Mon(+1wk)
    item({ id: "c", predecessorIds: ["a"], durationDays: 1 }), // short path: Tue
    item({ id: "d", predecessorIds: ["b", "c"], durationDays: 1 }),
  ];
  const results = computeSchedule(items);
  const byId = new Map(results.map((r) => [r.id, r]));

  it("starts D after the LATER of its two predecessors, not the first one computed", () => {
    expect(iso(byId.get("d")!.startDate)).toBe(iso(addOneWorkingDay(byId.get("b")!.endDate)));
  });

  it("marks the longer path critical and the shorter path non-critical", () => {
    expect(byId.get("b")!.isCriticalPath).toBe(true);
    expect(byId.get("c")!.isCriticalPath).toBe(false);
    expect(byId.get("c")!.floatDays).toBeGreaterThan(0);
  });

  it("marks the converging item and the anchor critical", () => {
    expect(byId.get("a")!.isCriticalPath).toBe(true);
    expect(byId.get("d")!.isCriticalPath).toBe(true);
  });

  function addOneWorkingDay(date: Date): Date {
    let next = new Date(date.getTime() + 86_400_000);
    while (next.getUTCDay() === 0 || next.getUTCDay() === 6) {
      next = new Date(next.getTime() + 86_400_000);
    }
    return next;
  }
});

describe("multiple independent chains", () => {
  it("computes the project finish as the latest end date across every item", () => {
    const items = [
      item({ id: "a", manualStartDate: MONDAY, durationDays: 1 }),
      item({ id: "b", manualStartDate: MONDAY, durationDays: 10 }),
    ];
    const results = computeSchedule(items);
    const finish = projectFinishDate(results);
    expect(iso(finish!)).toBe(iso(results.find((r) => r.id === "b")!.endDate));
  });

  it("returns null project finish for an empty schedule", () => {
    expect(projectFinishDate([])).toBeNull();
  });
});

describe("error cases", () => {
  it("throws MissingAnchorError for a root item with no manual start date", () => {
    expect(() => computeSchedule([item({ id: "a" })])).toThrow(MissingAnchorError);
  });

  it("throws UnknownPredecessorError for a dangling reference", () => {
    expect(() =>
      computeSchedule([item({ id: "a", manualStartDate: MONDAY, predecessorIds: ["ghost"] })]),
    ).toThrow(UnknownPredecessorError);
  });

  it("throws ScheduleCycleError for a direct two-item cycle", () => {
    const items = [
      item({ id: "a", predecessorIds: ["b"] }),
      item({ id: "b", predecessorIds: ["a"] }),
    ];
    expect(() => computeSchedule(items)).toThrow(ScheduleCycleError);
  });

  it("throws ScheduleCycleError for a longer cycle", () => {
    const items = [
      item({ id: "a", predecessorIds: ["c"] }),
      item({ id: "b", predecessorIds: ["a"] }),
      item({ id: "c", predecessorIds: ["b"] }),
    ];
    expect(() => computeSchedule(items)).toThrow(ScheduleCycleError);
  });

  it("returns an empty array for an empty schedule without throwing", () => {
    expect(computeSchedule([])).toEqual([]);
  });
});

describe("weekendIsNonWorking: false", () => {
  it("schedules straight through the weekend when disabled", () => {
    const [result] = computeSchedule(
      [item({ id: "a", manualStartDate: new Date("2026-01-09T00:00:00Z"), durationDays: 3 })],
      { weekendIsNonWorking: false },
    );
    // Fri, Sat, Sun — no skipping.
    expect(iso(result.endDate)).toBe("2026-01-11");
  });
});
