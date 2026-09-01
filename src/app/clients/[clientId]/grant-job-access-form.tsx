"use client";

import { useActionState } from "react";

import { grantClientJobAccessAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface JobOption {
  readonly id: string;
  readonly name: string;
}

const FLAGS = [
  { name: "canViewDailyLogs", label: "Daily logs" },
  { name: "canViewSchedule", label: "Schedule" },
  { name: "canViewDocuments", label: "Documents" },
  { name: "canViewBudget", label: "Budget" },
  { name: "canViewInvoices", label: "Invoices" },
  { name: "canMakePayments", label: "Make payments" },
  { name: "canViewSelections", label: "Selections" },
  { name: "canApproveSelections", label: "Approve selections" },
  { name: "canViewChangeOrders", label: "Change orders" },
  { name: "canApproveChangeOrders", label: "Approve change orders" },
] as const;

export function GrantJobAccessForm({ clientId, jobs }: { clientId: string; jobs: readonly JobOption[] }) {
  const [state, formAction, pending] = useActionState(grantClientJobAccessAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="clientId" value={clientId} />
      <h3 className="text-sm font-semibold text-[var(--bt-text)]">Grant job access</h3>
      <label className="mt-3 grid max-w-xs gap-1 text-sm">
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
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-[var(--bt-muted)] sm:grid-cols-3">
        {FLAGS.map((flag) => (
          <label key={flag.name} className="flex items-center gap-1.5">
            <input type="checkbox" name={flag.name} defaultChecked />
            {flag.label}
          </label>
        ))}
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
