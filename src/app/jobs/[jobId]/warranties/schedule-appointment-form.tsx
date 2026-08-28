"use client";

import { useActionState, useState } from "react";

import { scheduleWarrantyAppointmentAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface VendorOption {
  readonly id: string;
  readonly name: string;
}

export function ScheduleAppointmentForm({ jobId, claimId, vendors }: { jobId: string; claimId: string; vendors: readonly VendorOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(scheduleWarrantyAppointmentAction, INITIAL);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Schedule appointment
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="claimId" value={claimId} />
      <input type="datetime-local" name="appointmentAt" required className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      <select name="assignedVendorId" defaultValue="" className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
        <option value="">No vendor</option>
        {vendors.map((vendor) => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
        Cancel
      </button>
      {state.error ? <span className="w-full text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
