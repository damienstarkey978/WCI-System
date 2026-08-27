"use client";

import { useActionState, useRef } from "react";

import { createLeadAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function LeadForm() {
  const [state, formAction, pending] = useActionState(createLeadAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <label className="grid min-w-40 flex-1 gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Name</span>
        <input
          name="name"
          required
          placeholder="Jane Homeowner"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid min-w-40 gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Email</span>
        <input
          name="email"
          type="email"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid min-w-32 gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Phone</span>
        <input
          name="phone"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid min-w-32 gap-1 text-xs">
        <span className="font-medium text-[var(--bt-muted)]">Source</span>
        <input
          name="source"
          placeholder="Referral"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Adding…" : "+ New lead"}
      </button>
    </form>
  );
}
