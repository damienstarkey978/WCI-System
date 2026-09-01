"use client";

import { useActionState } from "react";

import { updateMyProfileAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function MyProfileForm({ name, title, phone }: { name: string | null; title: string | null; phone: string | null }) {
  const [state, formAction, pending] = useActionState(updateMyProfileAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-3">
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Display name</span>
        <input
          name="name"
          defaultValue={name ?? ""}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
        <input
          name="title"
          defaultValue={title ?? ""}
          placeholder="Sales Rep, Org Owner…"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Phone</span>
        <input
          name="phone"
          defaultValue={phone ?? ""}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <div className="sm:col-span-3">
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
