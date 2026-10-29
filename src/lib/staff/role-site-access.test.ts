import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/enums";
import {
  canAccessCommissionMenu,
  DEFAULT_ROLE_SITE_ACCESS,
  defaultRoleSiteAccess,
} from "@/lib/staff/role-site-access";
import { financialNavForAccess } from "@/lib/buildertrend-nav";

describe("Sales Rep site access defaults", () => {
  it("defaults job financials OFF for Sales Rep", () => {
    expect(DEFAULT_ROLE_SITE_ACCESS[UserRole.SALES_REP].canAccessFinancials).toBe(false);
    expect(defaultRoleSiteAccess(UserRole.SALES_REP).canAccessFinancials).toBe(false);
  });

  it("keeps Commission available for Sales Rep", () => {
    expect(canAccessCommissionMenu(UserRole.SALES_REP)).toBe(true);
    expect(canAccessCommissionMenu(UserRole.ADMIN)).toBe(false);
  });

  it("Financial menu is Commission-only when financials are off", () => {
    const items = financialNavForAccess({ canAccessFinancials: false, showCommission: true });
    expect(items).toEqual([{ label: "Commission", path: "/commission" }]);
  });

  it("Financial menu includes full items plus Commission when financials are on", () => {
    const items = financialNavForAccess({ canAccessFinancials: true, showCommission: true });
    expect(items.some((item) => item.path === "/budget")).toBe(true);
    expect(items.some((item) => item.path === "/commission")).toBe(true);
  });
});
