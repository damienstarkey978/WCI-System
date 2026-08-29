"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { enqueueDailyLog, listQueuedDailyLogs, onFieldQueueChanged, type QueuedDailyLog } from "@/lib/field-offline-queue";

import { submitDailyLogAction } from "../actions";

interface JobOption {
  readonly id: string;
  readonly name: string;
}

interface RecentLog {
  readonly id: string;
  readonly jobName: string;
  readonly note: string;
  readonly createdAt: string;
}

export function DailyLogClient({
  jobs,
  initialRecentLogs,
}: {
  readonly jobs: readonly JobOption[];
  readonly initialRecentLogs: readonly RecentLog[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [jobId, setJobId] = useState(jobs[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [queued, setQueued] = useState<readonly QueuedDailyLog[]>(() => listQueuedDailyLogs());

  useEffect(() => onFieldQueueChanged(() => setQueued(listQueuedDailyLogs())), []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const job = jobs.find((candidate) => candidate.id === jobId);
    const trimmed = note.trim();
    if (!job || !trimmed) {
      setMessage("Pick a job and write a note first.");
      return;
    }

    startTransition(async () => {
      if (!navigator.onLine) {
        enqueueDailyLog({ jobId, jobName: job.name, note: trimmed });
        setNote("");
        setMessage("Offline — log queued, will sync once you're back online.");
        return;
      }
      const result = await submitDailyLogAction({ jobId, note: trimmed });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setNote("");
      setMessage("Log submitted.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
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
          What happened today
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="rounded-md border border-black/15 bg-transparent px-2 py-2 text-sm dark:border-white/20"
            placeholder="Framing crew finished second floor walls, waiting on inspection..."
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !jobId || !note.trim()}
          className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-[var(--bt-panel-bg)] dark:text-black"
        >
          Submit
        </button>
        {message ? <p className="text-xs text-black/60 dark:text-white/60">{message}</p> : null}
      </form>

      {queued.length > 0 ? (
        <div data-testid="queued-daily-logs" className="flex flex-col gap-2">
          <div className="text-xs font-medium text-black/60 dark:text-white/60">
            Queued, waiting to sync ({queued.length})
          </div>
          {queued.map((item) => (
            <div key={item.id} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              <div className="font-medium">{item.jobName}</div>
              <p className="mt-1">{item.note}</p>
            </div>
          ))}
        </div>
      ) : null}

      {initialRecentLogs.length > 0 ? (
        <div data-testid="recent-logs" className="flex flex-col gap-2">
          <div className="text-xs font-medium text-black/60 dark:text-white/60">Recent logs</div>
          {initialRecentLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-black/10 p-3 text-xs dark:border-white/15">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{log.jobName}</span>
                <span className="text-black/45 dark:text-white/45">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-black/70 dark:text-white/70">{log.note}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
