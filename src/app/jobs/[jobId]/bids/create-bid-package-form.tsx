"use client";

import { useActionState } from "react";

import { createBidPackageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateBidPackageForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createBidPackageAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New bid package</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
          <input
            type="date"
            name="dueDate"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
        <textarea
          name="description"
          rows={2}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create bid package"}
        </button>
      </div>
    </form>
  );
}
