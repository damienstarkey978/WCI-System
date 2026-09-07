/**
 * The real World Construction Inc. logo (public/logo-mark-dark.png — transparent
 * background, white lettering/globe, teal "WORLD"), used wherever the brand sits on
 * a dark surface. Both skins' --bt-nav (src/app/globals.css) are dark enough (a deep
 * teal in the light skin, near-black in the dark skin) that this one mark reads
 * cleanly on either, so no theme-swap is needed here.
 *
 * The white-background/black-lettering counterpart lives at public/logo-mark-light.png
 * for anywhere the brand sits on a light surface instead (e.g. printed documents).
 */
export function BrandMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand mark, not a content image worth Next's optimizer
  return <img src="/logo-mark-dark.png" alt="World Construction Inc." className={className} />;
}
