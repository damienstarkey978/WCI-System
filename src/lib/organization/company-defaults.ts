/**
 * Canonical World Construction Inc company contact for letterhead / proposals.
 * Source: worldconstructioninc.com + Damien confirmation 2026-10-27.
 * Seed + empty-org backfill use these; Settings → Company remains editable.
 * Keep this module client-safe (no fs) — ClientProposalView imports it.
 */

export const WCI_COMPANY_SLOGAN = "Leaders in quality construction since 1994.";

export const WCI_COMPANY_DEFAULTS = {
  addressLine1: "6005 Powers Ave. #210",
  city: "Jacksonville",
  state: "FL",
  postalCode: "32217",
  /** Display form for proposals / Settings. E.164 equivalent: +19047171729 */
  contactPhone: "904-717-1729",
  contactEmail: "office@worldconstructioninc.com",
  slogan: WCI_COMPANY_SLOGAN,
} as const;

export type CompanyAddressBits = {
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
};

/** Damien format: `6005 Powers Ave. #210 Jacksonville FL 32217` (no comma after street). */
export function formatCompanyAddress(org: CompanyAddressBits | null | undefined): string | null {
  if (!org) return null;
  const street = org.addressLine1?.trim() || null;
  const rest = [org.city?.trim(), org.state?.trim(), org.postalCode?.trim()].filter(Boolean).join(" ");
  if (street && rest) return `${street} ${rest}`;
  return street || rest || null;
}

export function resolveCompanySlogan(slogan: string | null | undefined): string {
  const trimmed = slogan?.trim();
  return trimmed || WCI_COMPANY_SLOGAN;
}
