"use client";

import { useEffect } from "react";

/** Registers the app-shell service worker (public/sw.js) so /field installs as a PWA. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing (e.g. a browser without SW support, or a dev proxy that
      // strips it) should never block the field app itself from working online.
    });
  }, []);

  return null;
}
