"use client";

import { useActionState, useState } from "react";

import { recordPaymentAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function RecordPaymentForm({ jobId, invoiceId }: { jobId: string; invoiceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(recordPaymentAction, INITIAL);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Record payment
      </button>
    );
  }

  return (
    <form
      action={async (formData) => {
        await formAction(formData);
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input
        name="amount"
        inputMode="decimal"
        placeholder="0.00"
        required
        className="w-24 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <select
        name="method"
        defaultValue="MANUAL"
        className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <option value="MANUAL">Manual</option>
        <option value="STRIPE_CARD">Card</option>
        <option value="STRIPE_ACH">ACH</option>
        <option value="QBO_SYNC">QuickBooks</option>
      </select>
      <input
        name="reference"
        placeholder="Reference"
        className="w-28 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
        Cancel
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <span className="text-xs text-green-700">Recorded.</span> : null}
    </form>
  );
}
