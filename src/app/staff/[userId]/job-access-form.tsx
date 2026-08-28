"use client";

import { useActionState } from "react";

import { grantJobAccessAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface JobOption {
  readonly id: string;
  readonly name: string;
}

export function JobAccessForm({ userId, jobs }: { userId: string; jobs: readonly JobOption[] }) {
  const [state, formAction, pending] = useActionState(grantJobAccessAction, INITIAL);

  return (
    <form action={formAction} className="rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="userId" value={userId} />
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Grant job access</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Job</span>
          <select name="jobId" required defaultValue="" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              Choose a job
            </option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Schedule visibility</span>
          <select name="scheduleScope" defaultValue="ASSIGNED_ONLY" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="ASSIGNED_ONLY">Assigned items only</option>
            <option value="ALL_ITEMS">All schedule items</option>
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-[var(--bt-muted)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canViewDocuments" defaultChecked />
          Documents
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canViewPricing" />
          Pricing
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canViewCostDetail" />
          Cost detail
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canManageSchedule" />
          Manage schedule
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canApproveChangeOrders" />
          Approve change orders
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canCommunicateWithClient" />
          Communicate with client
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Grant access"}
        </button>
      </div>
    </form>
  );
}
