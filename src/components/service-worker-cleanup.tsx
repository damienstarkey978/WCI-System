"use client";

import { useEffect } from "react";

/**
 * Mounted site-wide (root layout) to undo a real production bug: /field's service
 * worker (src/app/field/sw-register.tsx) used to register with no explicit scope,
 * which defaults to the whole origin since the script is served from the site root —
 * not just /field. Anyone who ever visited /field got a worker that silently
 * controlled every page on the site from then on, and fell back to a cached /field
 * page whenever any navigation's network request failed, trapping them there.
 *
 * A code fix that scopes new registrations to /field/ doesn't remove an already-
 * installed root-scoped one — the browser keeps using it until something explicitly
 * unregisters it. This runs on every page load, everywhere, and does exactly that:
 * anything not actually scoped under /field/ gets unregistered. It's a no-op once
 * everyone affected has loaded a page after this shipped, but stays in as a cheap
 * safeguard against the same mistake recurring.
 */
export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          if (!registration.scope.endsWith("/field/")) {
            registration.unregister();
          }
        }
      })
      .catch(() => {
        // Best-effort — a browser that can't enumerate registrations here also isn't
        // one where the bug this cleans up could have taken hold.
      });
  }, []);

  return null;
}
