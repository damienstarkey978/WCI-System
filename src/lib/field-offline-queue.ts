/**
 * Client-side offline queue for the field PWA (Phase 7). Backed by localStorage, not
 * IndexedDB — the payloads here are a handful of small JSON records (no photos/binary
 * attachments in this phase's scope), so the simpler synchronous API is enough and
 * avoids hand-rolling IndexedDB transaction/versioning boilerplate for no real benefit.
 *
 * Two independent queues, not one generic one, because they don't have the same
 * correctness shape:
 *   - Daily logs are independent of each other — any number can queue and sync in
 *     any order.
 *   - Time clock actions are NOT independent — clock-out/breaks reference the entryId
 *     a clock-in creates, and that id doesn't exist until the clock-in has actually
 *     reached the server. So only one time-clock action is ever queued at a time; the
 *     field UI blocks starting a second one until the first has synced (see
 *     time-clock-client.tsx). This is a deliberate scope limit, not an oversight —
 *     see CLAUDE.md's Phase 7 deviations entry.
 *
 * Every mutator fires a "wci-field-queue-changed" window event so mounted client
 * components (which each hold their own React state mirroring these queues) know to
 * re-read after field-sync-manager.tsx flushes something in the background.
 */

const DAILY_LOG_KEY = "wci-field-queue:daily-logs";
const TIME_CLOCK_KEY = "wci-field-queue:time-clock-action";
const QUEUE_CHANGED_EVENT = "wci-field-queue-changed";

export interface QueuedDailyLog {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly note: string;
  readonly queuedAt: number;
}

export type QueuedTimeClockAction =
  | {
      readonly kind: "clockIn";
      readonly jobId: string;
      readonly jobName: string;
      readonly costCodeId: string;
      readonly gps?: { readonly latitude: number; readonly longitude: number };
      readonly queuedAt: number;
    }
  | {
      readonly kind: "clockOut";
      readonly entryId: string;
      readonly gps?: { readonly latitude: number; readonly longitude: number };
      readonly queuedAt: number;
    }
  | { readonly kind: "startBreak"; readonly entryId: string; readonly queuedAt: number }
  | { readonly kind: "endBreak"; readonly entryId: string; readonly queuedAt: number };

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full/unavailable localStorage should never crash the field UI — the worst
    // case is the action isn't queued and the worker has to retry once back online.
  }
  window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
}

export function onFieldQueueChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(QUEUE_CHANGED_EVENT, listener);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, listener);
}

export function listQueuedDailyLogs(): readonly QueuedDailyLog[] {
  return readJson(DAILY_LOG_KEY, []);
}

export function enqueueDailyLog(entry: Omit<QueuedDailyLog, "id" | "queuedAt">): void {
  const items = [...listQueuedDailyLogs(), { ...entry, id: crypto.randomUUID(), queuedAt: Date.now() }];
  writeJson(DAILY_LOG_KEY, items);
}

export function removeQueuedDailyLog(id: string): void {
  writeJson(
    DAILY_LOG_KEY,
    listQueuedDailyLogs().filter((item) => item.id !== id),
  );
}

export function getQueuedTimeClockAction(): QueuedTimeClockAction | null {
  return readJson(TIME_CLOCK_KEY, null);
}

export function setQueuedTimeClockAction(action: QueuedTimeClockAction | null): void {
  if (action === null) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(TIME_CLOCK_KEY);
    } catch {
      // best-effort, same reasoning as writeJson above
    }
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
    return;
  }
  writeJson(TIME_CLOCK_KEY, action);
}
