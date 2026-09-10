import { describe, expect, it } from "vitest";

import { canTransition } from "./workflow";

/**
 * Pure transition-rule tests. The mutating functions in workflow.ts all go through
 * the database, and this repo has no DB-integration test harness, so the table those
 * functions consult is what's covered here.
 */
describe("canTransition", () => {
  it("walks a PO through the happy path", () => {
    expect(canTransition("DRAFT", "PENDING_APPROVAL")).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "COMPLETED")).toBe(true);
  });

  it("lets a declined PO be re-sent, since the normal fix is to amend and re-offer", () => {
    expect(canTransition("PENDING_APPROVAL", "DECLINED")).toBe(true);
    expect(canTransition("DECLINED", "PENDING_APPROVAL")).toBe(true);
  });

  it("treats recall as terminal", () => {
    expect(canTransition("CANCELLED", "PENDING_APPROVAL")).toBe(false);
    expect(canTransition("CANCELLED", "APPROVED")).toBe(false);
    expect(canTransition("CANCELLED", "DRAFT")).toBe(false);
  });

  it("allows recall from every status that isn't already dead", () => {
    expect(canTransition("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransition("PENDING_APPROVAL", "CANCELLED")).toBe(true);
    expect(canTransition("APPROVED", "CANCELLED")).toBe(true);
    expect(canTransition("DECLINED", "CANCELLED")).toBe(true);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(true);
  });

  it("refuses to approve a PO nobody sent for approval", () => {
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
  });

  it("refuses to decline an already-approved PO — that is a recall, not a decline", () => {
    expect(canTransition("APPROVED", "DECLINED")).toBe(false);
  });
});
