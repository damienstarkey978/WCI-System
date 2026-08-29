/**
 * Org-level company information — the "World Construction Inc." card on Company
 * Settings (src/app/settings/company/page.tsx). Small and deliberately so: only the
 * fields the Organization model already has (used today by the Proposal PDF's
 * letterhead — src/app/proposals/[proposalId]/pdf/page.tsx) get an edit surface here.
 */

import { db } from "@/lib/db";

export interface UpdateOrganizationInfoInput {
  readonly name: string;
  readonly logoPath?: string | null;
  readonly addressLine1?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly postalCode?: string | null;
  readonly contactEmail?: string | null;
  readonly contactPhone?: string | null;
}

export async function updateOrganizationInfo(organizationId: string, input: UpdateOrganizationInfoInput) {
  return db.organization.update({
    where: { id: organizationId },
    data: {
      name: input.name,
      logoPath: input.logoPath ?? null,
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
    },
  });
}
