"use client";

import { useActionState } from "react";

import { assignPermitVendorAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AssignVendorForm({
  jobId,
  permitId,
  vendorId,
  vendors,
}: {
  jobId: string;
  permitId: string;
  vendorId: string | null;
  vendors: readonly { id: string; name: string; email: string | null; tradeType: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(assignPermitVendorAction, INITIAL);

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="permitId" value={permitId} />
      <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-[11px] font-medium text-[var(--bt-muted)]">
        Sub for reminders
        <select
          name="vendorId"
          defaultValue={vendorId ?? ""}
          className="rounded border px-2 py-1.5 text-xs text-[var(--bt-text)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <option value="">None</option>
          {/* Reminder email needs an address — put those first; disable no-email
              rows so the dropdown stops looking like a broken vendor list (#35). */}
          {[...vendors]
            .sort((a, b) => {
              const aHas = a.email ? 0 : 1;
              const bHas = b.email ? 0 : 1;
              if (aHas !== bHas) return aHas - bHas;
              return a.name.localeCompare(b.name);
            })
            .map((vendor) => (
              <option
                key={vendor.id}
                value={vendor.id}
                disabled={!vendor.email && vendor.id !== vendorId}
              >
                {vendor.email ? `${vendor.name} (${vendor.email})` : `${vendor.name} — no email (can't remind)`}
              </option>
            ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state.error ? <p className="text-[11px] text-red-600 sm:basis-full">{state.error}</p> : null}
    </form>
  );
}
