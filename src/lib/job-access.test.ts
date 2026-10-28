import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/enums";
import { hasOrgWideJobAccess, ORG_WIDE_JOB_ACCESS_ROLES } from "@/lib/job-access";

describe("hasOrgWideJobAccess", () => {
  it("treats Admin, PM, and Office as org-wide (no per-job grants)", () => {
    expect(ORG_WIDE_JOB_ACCESS_ROLES).toEqual([UserRole.ADMIN, UserRole.PM, UserRole.OFFICE]);
    expect(hasOrgWideJobAccess(UserRole.ADMIN)).toBe(true);
    expect(hasOrgWideJobAccess(UserRole.PM)).toBe(true);
    expect(hasOrgWideJobAccess(UserRole.OFFICE)).toBe(true);
  });

  it("requires grants for Field (and denies Agent via a separate path)", () => {
    expect(hasOrgWideJobAccess(UserRole.FIELD)).toBe(false);
    expect(hasOrgWideJobAccess(UserRole.AGENT)).toBe(false);
  });
});
