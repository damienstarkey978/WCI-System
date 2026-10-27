/**
 * Real WCI logo for light surfaces: client proposals, change-order previews,
 * invoices, PDFs, and print CSS. Uses public/logo-mark-light.png unless an
 * override URL is supplied (e.g. per-proposal branding).
 */

import { resolveOutboundLogoUrl } from "@/lib/branding/logo";

export function OutboundBrandMark({
  logoUrl,
  organizationLogoPath,
  className = "h-12 w-auto object-contain",
  alt = "World Construction Inc.",
}: {
  readonly logoUrl?: string | null;
  readonly organizationLogoPath?: string | null;
  readonly className?: string;
  readonly alt?: string;
}) {
  const src = resolveOutboundLogoUrl(logoUrl, organizationLogoPath);
  // eslint-disable-next-line @next/next/no-img-element -- brand mark; may be absolute or /public path
  return <img src={src} alt={alt} className={className} />;
}
