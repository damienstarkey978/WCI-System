"use client";

import { useActionState } from "react";

import { ContractType } from "@/generated/prisma/enums";
import type { JobGroupModel, JobModel } from "@/generated/prisma/models";

import { updateJobDetailsAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const inputClass =
  "w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";
const inputStyle = { borderColor: "var(--bt-border)" };

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--bt-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function JobDetailsForm({ job, jobGroups }: { job: JobModel; jobGroups: readonly JobGroupModel[] }) {
  const action = updateJobDetailsAction.bind(null, job.id);
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={inputStyle}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job name *">
          <input name="name" required defaultValue={job.name} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Prefix">
          <input name="prefix" defaultValue={job.prefix ?? ""} className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Contract type *">
          <select name="contractType" required defaultValue={job.contractType} className={inputClass} style={inputStyle}>
            <option value={ContractType.FIXED_PRICE}>Fixed price</option>
            <option value={ContractType.OPEN_BOOK}>Open book</option>
          </select>
        </Field>
        <Field label="Job group">
          <select name="jobGroupId" defaultValue={job.jobGroupId ?? ""} className={inputClass} style={inputStyle}>
            <option value="">None</option>
            {jobGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Street address">
          <input name="addressLine1" defaultValue={job.addressLine1 ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Address line 2">
          <input name="addressLine2" defaultValue={job.addressLine2 ?? ""} className={inputClass} style={inputStyle} />
        </Field>

        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="City">
            <input name="city" defaultValue={job.city ?? ""} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="State">
            <input name="state" defaultValue={job.state ?? ""} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="ZIP">
            <input name="postalCode" defaultValue={job.postalCode ?? ""} className={inputClass} style={inputStyle} />
          </Field>
        </div>

        <Field label="Square footage">
          <input name="sqft" type="number" min={0} defaultValue={job.sqft ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Permit number">
          <input name="permitNumber" defaultValue={job.permitNumber ?? ""} className={inputClass} style={inputStyle} />
        </Field>

        <Field label="Lot info">
          <input name="lotInfo" defaultValue={job.lotInfo ?? ""} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Schedule color">
          <input name="scheduleColor" type="color" defaultValue={job.scheduleColor ?? "#2563eb"} className="h-9 w-16 rounded border" style={inputStyle} />
        </Field>

        <Field label="Projected start">
          <input name="projectedStart" type="date" defaultValue={toDateInputValue(job.projectedStart)} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Projected completion">
          <input name="projectedEnd" type="date" defaultValue={toDateInputValue(job.projectedEnd)} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Actual start">
          <input name="actualStart" type="date" defaultValue={toDateInputValue(job.actualStart)} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Actual completion">
          <input name="actualEnd" type="date" defaultValue={toDateInputValue(job.actualEnd)} className={inputClass} style={inputStyle} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="text-xs text-emerald-700">Saved.</p> : null}
      </div>
    </form>
  );
}
