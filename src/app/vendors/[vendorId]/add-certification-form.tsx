"use client";

import { useActionState, useRef } from "react";

import { addVendorCertificationAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AddCertificationForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, pending] = useActionState(addVendorCertificationAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="vendorId" value={vendorId} />
      <h3 className="text-sm font-semibold text-[var(--bt-text)]">Add certification</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required placeholder="General liability insurance" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Expires</span>
          <input type="date" name="expiresAt" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Notes</span>
          <input name="notes" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Add certification"}
        </button>
      </div>
    </form>
  );
}
