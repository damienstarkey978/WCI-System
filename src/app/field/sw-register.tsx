"use client";

import { useEffect } from "react";

/**
 * Registers the app-shell service worker (public/sw.js) so /field installs as a PWA.
 * The explicit `scope: "/field/"` matters: /sw.js is served from the site root, so
 * without it the worker's default scope is "/" — the whole origin, not just the field
 * app. A root-scoped copy of this worker was live in production for a while (see
 * service-worker-cleanup.tsx for the fix for anyone who already has one registered);
 * it intercepted every navigation on the entire site and fell back to a cached /field
 * page whenever a request failed, silently trapping every page load in the field app
 * the moment a visitor's connection so much as hiccuped.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/field/" }).catch(() => {
      // Registration failing (e.g. a browser without SW support, or a dev proxy that
      // strips it) should never block the field app itself from working online.
    });
  }, []);

  return null;
}
