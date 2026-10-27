/**
 * Canonical World Construction Inc. brand marks (repo assets, not invented).
 *
 * - Dark (nav / dark chrome): public/logo-mark-dark.png — white lettering on transparent
 * - Light (print, PDF, client email/SMS-linked views): public/logo-mark-light.png —
 *   dark lettering on transparent for white paper
 *
 * See src/components/shell/BrandMark.tsx.
 */

import { appBaseUrlFromEnv } from "@/lib/env";

/** Path for staff chrome on dark nav surfaces. */
export const BRAND_LOGO_DARK_PATH = "/logo-mark-dark.png";

/** Path for client-facing / printed / emailed documents on light backgrounds. */
export const BRAND_LOGO_LIGHT_PATH = "/logo-mark-light.png";

/**
 * Resolve the logo URL for an outbound document.
 * Preference: explicit override (proposal branding) → org logoPath if absolute →
 * canonical light brand mark. Never invent a text-only mark when the file exists.
 */
export function resolveOutboundLogoUrl(
  overrideUrl?: string | null,
  organizationLogoPath?: string | null,
): string {
  const override = overrideUrl?.trim();
  if (override) return override;

  const org = organizationLogoPath?.trim();
  if (org && (/^https?:\/\//i.test(org) || org.startsWith("/"))) return org;

  return BRAND_LOGO_LIGHT_PATH;
}

/** Absolute URL for email HTML / SMS-linked pages that need a full logo src. */
export function absoluteOutboundLogoUrl(
  overrideUrl?: string | null,
  organizationLogoPath?: string | null,
  requestOrigin?: string,
): string {
  const resolved = resolveOutboundLogoUrl(overrideUrl, organizationLogoPath);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  const base = (appBaseUrlFromEnv() ?? requestOrigin?.replace(/\/+$/, "") ?? "").replace(/\/+$/, "");
  return base ? `${base}${resolved.startsWith("/") ? resolved : `/${resolved}`}` : resolved;
}
