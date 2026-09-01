"use client";

import { useActionState } from "react";

import { createScheduleAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateScheduleButton({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createScheduleAction, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Creating…" : "Create schedule"}
      </button>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
