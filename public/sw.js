/**
 * Field app service worker (Phase 7). Its only job is caching the app shell so the
 * PWA still opens with no connectivity at all — actual data mutations (daily logs,
 * time clock) are queued in localStorage by the page itself (src/lib/field-offline-
 * queue.ts) and synced by src/app/field/field-sync-manager.tsx, not by this worker.
 */

const CACHE_NAME = "wci-field-shell-v2";
const APP_SHELL = ["/field", "/field/time-clock", "/field/daily-log", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // Installing offline (no server reachable yet) — nothing to cache yet, the
        // worker will still activate and cache pages as they're visited on fetch.
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Network-first for page navigations: a field worker with signal always sees fresh
// jobs/state, and only falls back to the cached shell when there's no connectivity
// at all (not just a failed mutation — that's handled by the offline queue instead).
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/field"))),
  );
});
