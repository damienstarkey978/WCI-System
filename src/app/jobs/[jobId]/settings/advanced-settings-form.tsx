"use client";

import { useActionState } from "react";

import { AccountingBasis, ProjectionReference } from "@/generated/prisma/enums";
import type { JobModel } from "@/generated/prisma/models";

import { updateAdvancedSettingsAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const inputClass = "w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";
const inputStyle = { borderColor: "var(--bt-border)" };

const PROJECTION_LABELS: Record<ProjectionReference, string> = {
  [ProjectionReference.GREATEST]: "System projection (greatest of budget/committed/actual)",
  [ProjectionReference.REVISED_BUDGET]: "Revised budget",
  [ProjectionReference.COMMITTED]: "Committed cost",
  [ProjectionReference.ACTUAL]: "Actual cost",
};

export function AdvancedSettingsForm({ job }: { job: JobModel }) {
  const action = updateAdvancedSettingsAction.bind(null, job.id);
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={inputStyle}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--bt-text)]">Project management options</h2>
        <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
          <input type="checkbox" name="geofencingEnabled" defaultChecked={job.geofenceRadiusMeters !== null} />
          Enable geofencing on Time Clock shifts
        </label>
        {job.geofenceRadiusMeters !== null ? (
          <label className="mt-2 grid max-w-[10rem] gap-1 text-xs">
            <span className="text-[var(--bt-muted)]">Radius (meters)</span>
            <input name="geofenceRadiusMeters" type="number" min={1} defaultValue={job.geofenceRadiusMeters} className={inputClass} style={inputStyle} />
          </label>
        ) : (
          <input type="hidden" name="geofenceRadiusMeters" value="150" />
        )}
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={inputStyle}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--bt-text)]">Template options</h2>
        <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
          <input type="checkbox" name="isTemplate" defaultChecked={job.isTemplate} />
          Make this job a working template
        </label>
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 sm:col-span-2" style={inputStyle}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--bt-text)]">Budget</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Projection reference default</span>
            <select name="projectionReference" defaultValue={job.projectionReference} className={inputClass} style={inputStyle}>
              {Object.values(ProjectionReference).map((value) => (
                <option key={value} value={value}>
                  {PROJECTION_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Accounting basis</span>
            <select name="accountingBasis" defaultValue={job.accountingBasis} className={inputClass} style={inputStyle}>
              <option value={AccountingBasis.ACCRUAL}>Accrual (counts open + paid bills)</option>
              <option value={AccountingBasis.CASH}>Cash (counts only paid bills)</option>
            </select>
          </label>
        </div>
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="mt-2 text-xs text-emerald-700">Saved.</p> : null}
      </div>
    </form>
  );
}
