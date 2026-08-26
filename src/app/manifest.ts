import type { MetadataRoute } from "next";

/**
 * Served at /manifest.webmanifest and auto-linked into every page's <head> by Next.js.
 * start_url points at the field app (Phase 7) — that's the screen a crew member
 * installs this for, not the office admin screens.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WCI OS Field",
    short_name: "WCI Field",
    description: "Offline-capable daily logs and time clock for World Construction Inc field crews.",
    start_url: "/field",
    scope: "/field",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
