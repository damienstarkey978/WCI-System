"use client";

import { useActionState } from "react";

import { generateAiEstimateDraftAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const inputClass =
  "w-full rounded border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-black/30 dark:focus:border-white/50";

export function AiEstimateForm({ jobs }: { jobs: readonly { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(generateAiEstimateDraftAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <label className="grid gap-1 text-xs">
        <span className="text-black/60 dark:text-white/60">Job *</span>
        <select name="jobId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            Choose a job…
          </option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs">
        <span className="text-black/60 dark:text-white/60">Field notes *</span>
        <textarea
          name="notes"
          required
          rows={6}
          className={inputClass}
          placeholder="e.g. Interior repaint, walk-through with homeowner today. 3 bed / 2 bath, roughly 1600 sqft. Walls, ceilings and trim throughout, standard 8ft ceilings. Homeowner wants to keep the accent wall in the primary bedroom. Cabinets are not included."
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      {state.result ? (
        <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs dark:border-emerald-700 dark:bg-emerald-950/40">
          <p className="font-medium">
            Draft created: {state.result.title} ({state.result.lineItemCount} line
            {state.result.lineItemCount === 1 ? "" : "s"})
          </p>
          {state.result.assumptions.length > 0 ? (
            <>
              <p className="mt-2 font-medium">Assumptions to confirm:</p>
              <ul className="mt-1 list-disc pl-4">
                {state.result.assumptions.map((assumption, index) => (
                  <li key={index}>{assumption}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-2 text-black/50 dark:text-white/50">
            Estimate id: <span className="font-mono">{state.result.estimateId}</span> — review and edit the
            line items via the API before sending to budget.
          </p>
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Drafting…" : "Draft estimate with AI"}
        </button>
      </div>
    </form>
  );
}
