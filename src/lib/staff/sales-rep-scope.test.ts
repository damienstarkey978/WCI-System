import { describe, expect, it } from "vitest";

import { UserRole } from "@/generated/prisma/enums";
import {
  isSalesRepRole,
  salesRepJobWhere,
  salesRepLeadActivityWhere,
  salesRepLeadWhere,
} from "@/lib/staff/sales-rep-scope";

describe("salesRep scope", () => {
  const rep = { id: "user_rep", role: UserRole.SALES_REP };
  const admin = { id: "user_admin", role: UserRole.ADMIN };

  it("detects Sales Rep role", () => {
    expect(isSalesRepRole(UserRole.SALES_REP)).toBe(true);
    expect(isSalesRepRole(UserRole.OFFICE)).toBe(false);
  });

  it("scopes leads/jobs/activities for Sales Rep only", () => {
    expect(salesRepLeadWhere(rep)).toEqual({ assignedUserId: "user_rep" });
    expect(salesRepJobWhere(rep)).toEqual({ salespersonUserId: "user_rep" });
    expect(salesRepLeadActivityWhere(rep)).toEqual({ lead: { assignedUserId: "user_rep" } });

    expect(salesRepLeadWhere(admin)).toEqual({});
    expect(salesRepJobWhere(admin)).toEqual({});
    expect(salesRepLeadActivityWhere(admin)).toEqual({});
  });
});
