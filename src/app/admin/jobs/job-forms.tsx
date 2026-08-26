"use client";

import { useActionState } from "react";

import { ContractType, type JobStatus } from "@/generated/prisma/enums";
import { createJobAction, transitionJobStatusAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const inputClass =
  "w-full rounded border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-black/30 dark:focus:border-white/50";

export function CreateJobForm() {
  const [state, formAction, pending] = useActionState(createJobAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold">New job</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Name *</span>
          <input name="name" required className={inputClass} placeholder="283 Red Cedar" />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Contract type *</span>
          <select name="contractType" required defaultValue={ContractType.FIXED_PRICE} className={inputClass}>
            <option value={ContractType.FIXED_PRICE}>Fixed Price</option>
            <option value={ContractType.OPEN_BOOK}>Open Book</option>
          </select>
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Prefix</span>
          <input name="prefix" className={inputClass} placeholder="283RC" />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Address</span>
          <input name="addressLine1" className={inputClass} placeholder="283 Red Cedar Dr" />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">City</span>
          <input name="city" className={inputClass} placeholder="Jacksonville" />
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {pending ? "Creating…" : "Create job"}
        </button>
      </div>
    </form>
  );
}

export function TransitionForm({
  jobId,
  allowed,
}: {
  jobId: string;
  allowed: readonly JobStatus[];
}) {
  const [state, formAction, pending] = useActionState(transitionJobStatusAction, INITIAL);

  if (allowed.length === 0) {
    return <span className="text-xs text-black/40 dark:text-white/40">No transitions</span>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      {allowed.map((status) => (
        <button
          key={status}
          type="submit"
          name="status"
          value={status}
          disabled={pending}
          className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          → {status}
        </button>
      ))}
      {state.error ? (
        <span role="alert" className="w-full text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
