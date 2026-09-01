"use client";

import { useActionState } from "react";

import { grantVendorJobAccessAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface JobOption {
  readonly id: string;
  readonly name: string;
}

export function GrantJobAccessForm({ vendorId, jobs }: { vendorId: string; jobs: readonly JobOption[] }) {
  const [state, formAction, pending] = useActionState(grantVendorJobAccessAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="vendorId" value={vendorId} />
      <h3 className="text-sm font-semibold text-[var(--bt-text)]">Grant job access</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          <input type="checkbox" name="canViewPurchaseOrders" defaultChecked />
          Purchase orders
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canViewBills" defaultChecked />
          Bills
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Grant access"}
        </button>
      </div>
    </form>
  );
}
