"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  getQueuedTimeClockAction,
  listQueuedDailyLogs,
  removeQueuedDailyLog,
  setQueuedTimeClockAction,
  type QueuedTimeClockAction,
} from "@/lib/field-offline-queue";

import { clockInAction, clockOutAction, endBreakAction, startBreakAction, submitDailyLogAction } from "./actions";

function runQueuedTimeClockAction(action: QueuedTimeClockAction) {
  switch (action.kind) {
    case "clockIn":
      return clockInAction({ jobId: action.jobId, costCodeId: action.costCodeId, gps: action.gps });
    case "clockOut":
      return clockOutAction({ entryId: action.entryId, gps: action.gps });
    case "startBreak":
      return startBreakAction({ entryId: action.entryId });
    case "endBreak":
      return endBreakAction({ entryId: action.entryId });
  }
}

/**
 * Mounted once in the field layout. Replays whatever field-offline-queue.ts has
 * queued whenever the app comes back online — on mount (covers "was offline when the
 * page loaded, now isn't"), on the browser's `online` event, and on a slow poll as a
 * backstop for phones that don't fire `online` reliably after airplane mode / a dead
 * zone. Never runs two flushes concurrently (the `syncing` ref), and always processes
 * the time-clock slot before daily logs — not because daily logs depend on it, but so
 * a worker who queued a clock-in then immediately a clock-out sees the clock-in land
 * first, in order.
 */
export function FieldSyncManager() {
  const router = useRouter();
  const syncing = useRef(false);

  useEffect(() => {
    async function flush() {
      if (syncing.current || typeof navigator === "undefined" || !navigator.onLine) return;
      syncing.current = true;
      let changed = false;
      try {
        const pendingTimeClock = getQueuedTimeClockAction();
        if (pendingTimeClock) {
          const result = await runQueuedTimeClockAction(pendingTimeClock);
          if (result.ok) {
            setQueuedTimeClockAction(null);
            changed = true;
          }
          // On failure, leave it queued — the domain error (e.g. a stale entryId) will
          // otherwise repeat every retry, so surfacing it live isn't attempted here;
          // the worker sees "queued" in the UI and can open the app to check state.
        }

        for (const log of listQueuedDailyLogs()) {
          const result = await submitDailyLogAction({ jobId: log.jobId, note: log.note });
          if (result.ok) {
            removeQueuedDailyLog(log.id);
            changed = true;
          }
        }
      } finally {
        syncing.current = false;
        if (changed) router.refresh();
      }
    }

    flush();
    window.addEventListener("online", flush);
    const interval = setInterval(flush, 30_000);
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
