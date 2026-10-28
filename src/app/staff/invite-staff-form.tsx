"use client";

import { useActionState, useRef } from "react";

import { ROLE_DESCRIPTIONS, ASSIGNABLE_STAFF_ROLES } from "@/lib/staff/role-descriptions";

import { inviteStaffAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function InviteStaffForm() {
  const [state, formAction, pending] = useActionState(inviteStaffAction, INITIAL);
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
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">+ Internal user</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Name</span>
          <input name="name" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Email</span>
          <input name="email" type="email" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" placeholder="Sales Rep, Org Owner…" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Phone</span>
          <input name="phone" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Role</span>
          <select name="role" required defaultValue="" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              Choose…
            </option>
            {ASSIGNABLE_STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_DESCRIPTIONS[role].label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs text-[var(--bt-muted)]">
        Pre-authorizes this email for Clerk sign-in (no WCI OS password). When outbound email is configured, we also send sign-in instructions; otherwise copy the link from their profile.
      </p>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.notice ? (
        <p role="status" className="mt-2 text-xs text-green-700 dark:text-green-400">
          {state.notice}
        </p>
      ) : null}
      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Adding…" : "+ Internal user"}
        </button>
      </div>
    </form>
  );
}
