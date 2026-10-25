/**
 * Buildertrend's "Activation" pill for a portal contact (client or sub/vendor), derived
 * from the fields we already store rather than a separate status column:
 *   - no email on file          → "No Email" (can't be invited at all)
 *   - activatedAt set           → "Active" (has logged into the portal)
 *   - invitedAt set, not active → "Pending" (invite sent, not yet used)
 *   - otherwise                 → "Inactive" (has an email, never invited)
 */

import type { ActivationFilter } from "./params";

export type ActivationLabel = "Active" | "Pending" | "Inactive" | "No Email";

export function activationOf(contact: { email: string | null; invitedAt: Date | null; activatedAt: Date | null }): ActivationLabel {
  if (!contact.email) return "No Email";
  if (contact.activatedAt) return "Active";
  if (contact.invitedAt) return "Pending";
  return "Inactive";
}

/** Prisma `where` fragment for an activation filter — the inverse of activationOf above. */
export function activationWhere(status: ActivationFilter | null, emailIsOptional: boolean): Record<string, unknown> {
  switch (status) {
    case "active":
      return emailIsOptional ? { email: { not: null }, activatedAt: { not: null } } : { activatedAt: { not: null } };
    case "pending":
      return emailIsOptional ? { email: { not: null }, activatedAt: null, invitedAt: { not: null } } : { activatedAt: null, invitedAt: { not: null } };
    case "inactive":
      return emailIsOptional ? { email: { not: null }, activatedAt: null, invitedAt: null } : { activatedAt: null, invitedAt: null };
    case "no-email":
      return { email: null };
    default:
      return {};
  }
}
