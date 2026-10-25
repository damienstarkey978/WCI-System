"use client";

import { useActionState, useRef } from "react";

import { createVendorAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const INPUT_CLASS = "rounded border bg-[var(--bt-panel-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";

function Field({ label, name, type = "text", required = false, placeholder }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--bt-muted)]">{label}</span>
      <input name={name} type={type} required={required} placeholder={placeholder} className={INPUT_CLASS} style={{ borderColor: "var(--bt-border)" }} />
    </label>
  );
}

export function CreateVendorForm() {
  const [state, formAction, pending] = useActionState(createVendorAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New sub/vendor</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Company name" name="name" required />
        <Field label="Trade" name="tradeType" placeholder="Electrical, Plumbing…" />
        <Field label="Primary contact" name="primaryContact" />
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone" name="phone" type="tel" />
        <Field label="Cell" name="cellPhone" type="tel" />
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="mt-2 text-xs text-green-700 dark:text-green-400">
          Sub/vendor added.
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Creating…" : "Create sub/vendor"}
        </button>
      </div>
    </form>
  );
}
