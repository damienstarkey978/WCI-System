"use client";

import { useActionState } from "react";

import { updateVendorContactAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const INPUT_CLASS = "rounded border bg-[var(--bt-panel-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";

function Field({ label, name, defaultValue, type = "text", required = false, hint }: { label: string; name: string; defaultValue: string; type?: string; required?: boolean; hint?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--bt-muted)]">{label}</span>
      <input name={name} type={type} required={required} defaultValue={defaultValue} className={INPUT_CLASS} style={{ borderColor: "var(--bt-border)" }} />
      {hint ? <span className="text-xs text-amber-700 dark:text-amber-400">{hint}</span> : null}
    </label>
  );
}

export function EditVendorContactForm({
  vendor,
}: {
  vendor: { id: string; name: string; email: string | null; primaryContact: string | null; phone: string | null; cellPhone: string | null };
}) {
  const [state, formAction, pending] = useActionState(updateVendorContactAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="vendorId" value={vendor.id} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Contact info</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Company name" name="name" defaultValue={vendor.name} required />
        <Field label="Primary contact" name="primaryContact" defaultValue={vendor.primaryContact ?? ""} />
        <Field label="Email" name="email" type="email" defaultValue={vendor.email ?? ""} hint={vendor.email ? undefined : "No email on file — needed to invite them to the portal."} />
        <Field label="Phone" name="phone" type="tel" defaultValue={vendor.phone ?? ""} />
        <Field label="Cell" name="cellPhone" type="tel" defaultValue={vendor.cellPhone ?? ""} />
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="mt-2 text-xs text-green-700 dark:text-green-400">
          Saved.
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Save contact info"}
        </button>
      </div>
    </form>
  );
}
