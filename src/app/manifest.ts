import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest and auto-linked into every page's <head> by Next.js
 * — there is exactly one of these per origin, shared by every page on the site. It
 * used to point start_url/scope at /field (Phase 7), back when only field crews were
 * expected to install this. Now that office staff, vendors, and clients all add it to
 * their home screens too, a /field-scoped manifest sends everyone's icon to the field
 * mini-app and (via `scope`) breaks standalone mode the moment they navigate outside
 * it. start_url is "/" so installed icons land wherever a signed-in visitor actually
 * belongs — src/app/page.tsx sends staff to /dashboard, src/proxy.ts sends a
 * signed-out staff visitor to /sign-in — and scope is "/" so the whole site, not just
 * one section, stays in standalone (no browser chrome) mode.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WCI OS",
    short_name: "WCI OS",
    description: "Construction management for World Construction Inc.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
