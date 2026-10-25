import { describe, expect, it } from "vitest";

import { isSchedulePublished } from "./publish";

describe("isSchedulePublished", () => {
  it("needs online on and draft off", () => {
    expect(isSchedulePublished({ isOnline: true, isDraft: false })).toBe(true);
    expect(isSchedulePublished({ isOnline: false, isDraft: false })).toBe(false);
    expect(isSchedulePublished({ isOnline: true, isDraft: true })).toBe(false);
    expect(isSchedulePublished({ isOnline: false, isDraft: true })).toBe(false);
  });
});
