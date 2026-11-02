import { describe, expect, it } from "vitest";

import {
  activityContactDate,
  activityDisplayStatus,
  activityTypeDisplayLabel,
  parseLeadActivityNote,
} from "./lead-activity-display";

describe("parseLeadActivityNote", () => {
  it("extracts BT metadata and leaves the body", () => {
    const parsed = parseLeadActivityNote(
      "[BT type: Follow up] [BT status: Past Due] [Assigned: Brian Wilkins] Proposal has been sent.",
    );
    expect(parsed.btType).toBe("Follow up");
    expect(parsed.btStatus).toBe("Past Due");
    expect(parsed.assigned).toBe("Brian Wilkins");
    expect(parsed.body).toBe("Proposal has been sent.");
  });

  it("handles a plain native note", () => {
    const parsed = parseLeadActivityNote("Called homeowner about permit.");
    expect(parsed.btType).toBeNull();
    expect(parsed.btStatus).toBeNull();
    expect(parsed.assigned).toBeNull();
    expect(parsed.body).toBe("Called homeowner about permit.");
  });
});

describe("activityDisplayStatus", () => {
  it("prefers BT Past Due / Pending tags", () => {
    expect(
      activityDisplayStatus({ btStatus: "Past Due", completedAt: null, dueDate: null, type: "TASK" }),
    ).toBe("PAST_DUE");
    expect(
      activityDisplayStatus({ btStatus: "Pending", completedAt: null, dueDate: null, type: "TASK" }),
    ).toBe("PENDING");
  });

  it("maps BT Not Complete to Pending, not Completed", () => {
    expect(
      activityDisplayStatus({ btStatus: "Not Complete", completedAt: null, dueDate: null, type: "CALL" }),
    ).toBe("PENDING");
  });

  it("marks completed when completedAt is set", () => {
    expect(
      activityDisplayStatus({
        btStatus: "Past Due",
        completedAt: new Date("2026-01-01"),
        dueDate: null,
        type: "TASK",
      }),
    ).toBe("COMPLETED");
  });
});

describe("activityTypeDisplayLabel", () => {
  it("uses the BT type label when present", () => {
    expect(activityTypeDisplayLabel("TASK", "Call back follow up")).toBe("Call back follow up");
  });

  it("falls back to a BT-ish coarse label", () => {
    expect(activityTypeDisplayLabel("TASK", null)).toBe("Follow-up");
    expect(activityTypeDisplayLabel("CALL", null)).toBe("Call");
  });
});

describe("activityContactDate", () => {
  it("prefers dueDate when set", () => {
    const due = new Date("2026-04-06T12:00:00Z");
    const occurred = new Date("2026-01-01T12:00:00Z");
    expect(activityContactDate({ dueDate: due, occurredAt: occurred }).toISOString()).toBe(due.toISOString());
  });
});
