/**
 * Plain-English blurbs for the staff directory's Permissions tab. These describe
 * the *real* authorization role (see UserRole and requireRole in src/lib/auth.ts);
 * User.title is a separate, purely cosmetic label and has no bearing here.
 */

import { UserRole } from "@/generated/prisma/enums";

export interface RoleDescription {
  readonly label: string;
  readonly blurb: string;
}

export const ROLE_DESCRIPTIONS: Record<UserRole, RoleDescription> = {
  [UserRole.ADMIN]: {
    label: "Admin",
    blurb:
      "Full access to every job, financials, and settings — the only role that can invite staff, change roles, or deactivate accounts.",
  },
  [UserRole.PM]: {
    label: "Project Manager",
    blurb:
      "Runs assigned jobs end-to-end: budgets, schedule, change orders, daily logs, and client communication. Can't manage staff accounts or org-wide settings.",
  },
  [UserRole.OFFICE]: {
    label: "Office",
    blurb:
      "Office-based support across jobs — proposals, invoicing, purchasing, and vendor coordination. Can't manage staff accounts.",
  },
  [UserRole.FIELD]: {
    label: "Field Crew",
    blurb: "Field access for assigned jobs — daily logs, time clock, schedule, and to-dos. No pricing or cost visibility.",
  },
  [UserRole.AGENT]: {
    label: "Agent",
    blurb: "A non-human integration account (Heather, Duke, Hank, Vince, Neil, or Jarvis) authenticating via API key, not sign-in.",
  },
};

/** Roles an admin can assign to a human staff member from the staff directory. */
export const ASSIGNABLE_STAFF_ROLES = [UserRole.ADMIN, UserRole.PM, UserRole.OFFICE, UserRole.FIELD] as const;
