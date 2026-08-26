"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  getQueuedTimeClockAction,
  onFieldQueueChanged,
  setQueuedTimeClockAction,
  type QueuedTimeClockAction,
} from "@/lib/field-offline-queue";

import { clockInAction, clockOutAction, endBreakAction, startBreakAction } from "../actions";

interface JobOption {
  readonly id: string;
  readonly name: string;
}

interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

interface InitialEntry {
  readonly id: string;
  readonly jobName: string;
  readonly clockInAt: string;
  readonly openBreak: boolean;
}

async function captureGps(): Promise<{ latitude: number; longitude: number } | undefined> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return undefined;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(undefined),
      { timeout: 5000 },
    );
  });
}

export function TimeClockClient({
  jobs,
  costCodes,
  initialEntry,
}: {
  readonly jobs: readonly JobOption[];
  readonly costCodes: readonly CostCodeOption[];
  readonly initialEntry: InitialEntry | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [costCodeId, setCostCodeId] = useState(costCodes[0]?.id ?? "");
  const [queuedAction, setQueuedAction] = useState<QueuedTimeClockAction | null>(() => getQueuedTimeClockAction());

  useEffect(() => onFieldQueueChanged(() => setQueuedAction(getQueuedTimeClockAction())), []);

  const busy = isPending || queuedAction !== null;

  function handleClockIn() {
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (!job || !costCodeId) {
      setMessage("Pick a job and a cost code.");
      return;
    }
    startTransition(async () => {
      const gps = await captureGps();
      if (!navigator.onLine) {
        setQueuedTimeClockAction({ kind: "clockIn", jobId, jobName: job.name, costCodeId, gps, queuedAt: Date.now() });
        setMessage("Offline — clock-in queued, will sync once you're back online.");
        return;
      }
      const result = await clockInAction({ jobId, costCodeId, gps });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(null);
      router.refresh();
    });
  }

  function handleClockOut() {
    if (!initialEntry) return;
    startTransition(async () => {
      const gps = await captureGps();
      if (!navigator.onLine) {
        setQueuedTimeClockAction({ kind: "clockOut", entryId: initialEntry.id, gps, queuedAt: Date.now() });
        setMessage("Offline — clock-out queued, will sync once you're back online.");
        return;
      }
      const result = await clockOutAction({ entryId: initialEntry.id, gps });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(null);
      router.refresh();
    });
  }

  function handleBreak(kind: "startBreak" | "endBreak") {
    if (!initialEntry) return;
    startTransition(async () => {
      if (!navigator.onLine) {
        setQueuedTimeClockAction({ kind, entryId: initialEntry.id, queuedAt: Date.now() });
        setMessage("Offline — queued, will sync once you're back online.");
        return;
      }
      const result = kind === "startBreak" ? await startBreakAction({ entryId: initialEntry.id }) : await endBreakAction({ entryId: initialEntry.id });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {queuedAction ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Waiting to sync a queued {queuedAction.kind === "clockIn" ? "clock-in" : queuedAction.kind === "clockOut" ? "clock-out" : "break"} action.
          This screen updates automatically once it goes through.
        </div>
      ) : null}

      {initialEntry ? (
        <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <div className="text-sm font-medium">{initialEntry.jobName}</div>
          <p className="mt-1 text-xs text-black/55 dark:text-white/55">
            Clocked in since {new Date(initialEntry.clockInAt).toLocaleTimeString()}
            {initialEntry.openBreak ? " — on break" : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleBreak(initialEntry.openBreak ? "endBreak" : "startBreak")}
              className="rounded-md border border-black/15 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-white/20"
            >
              {initialEntry.openBreak ? "End break" : "Start break"}
            </button>
            <button
              type="button"
              disabled={busy || initialEntry.openBreak}
              onClick={handleClockOut}
              className="rounded-md bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              Clock out
            </button>
          </div>
          {initialEntry.openBreak ? (
            <p className="mt-2 text-xs text-black/50 dark:text-white/50">End your break before clocking out.</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Job
            <select
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              className="rounded-md border border-black/15 bg-transparent px-2 py-2 text-sm dark:border-white/20"
            >
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Cost code
            <select
              value={costCodeId}
              onChange={(event) => setCostCodeId(event.target.value)}
              className="rounded-md border border-black/15 bg-transparent px-2 py-2 text-sm dark:border-white/20"
            >
              {costCodes.map((costCode) => (
                <option key={costCode.id} value={costCode.id}>
                  {costCode.code} — {costCode.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy || !jobId || !costCodeId}
            onClick={handleClockIn}
            className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Clock in
          </button>
        </div>
      )}

      {message ? <p className="text-xs text-black/60 dark:text-white/60">{message}</p> : null}
    </div>
  );
}
