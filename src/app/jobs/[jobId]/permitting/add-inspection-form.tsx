"use client";

import { useActionState } from "react";

import { addPermitInspectionAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AddInspectionForm({
  jobId,
  permitId,
  catalogNames,
  existingNames,
}: {
  jobId: string;
  permitId: string;
  catalogNames: readonly string[];
  existingNames: readonly string[];
}) {
  const [state, formAction, pending] = useActionState(addPermitInspectionAction, INITIAL);
  const existing = new Set(existingNames.map((n) => n.toLowerCase()));
  const available = catalogNames.filter((name) => !existing.has(name.toLowerCase()));

  if (available.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-[var(--bt-muted)]">
        All catalog inspections for this trade are already on the job.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="permitId" value={permitId} />
      <select
        name="name"
        required
        defaultValue=""
        className="w-full min-w-0 flex-1 rounded border bg-white px-2.5 py-2 text-xs outline-none focus:border-[var(--bt-primary)] sm:py-1.5"
        style={{ borderColor: "var(--bt-border)" }}
        aria-label="Add inspection required for this job"
      >
        <option value="" disabled>
          Add inspection needed for this job…
        </option>
        {available.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded px-3 py-2.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-1.5"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {state.error ? <p className="text-xs text-red-600 sm:basis-full">{state.error}</p> : null}
    </form>
  );
}
