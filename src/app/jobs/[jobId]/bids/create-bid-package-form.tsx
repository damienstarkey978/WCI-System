"use client";

import { useActionState, useState } from "react";

import { createBidPackageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateBidPackageForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createBidPackageAction, INITIAL);
  const [scopeRows, setScopeRows] = useState([0, 1, 2]);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
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

      <div className="mt-4">
        <div className="text-xs font-medium text-[var(--bt-muted)]">Scope — what each sub is pricing</div>
        <div className="mt-2 flex flex-col gap-2">
          {scopeRows.map((_, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <label className="grid min-w-48 flex-1 gap-1 text-sm">
                <span className="text-[10px] text-[var(--bt-muted)]">Item</span>
                <input
                  name="scopeTitle"
                  placeholder="Hang and finish drywall, level 4"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid w-24 gap-1 text-sm">
                <span className="text-[10px] text-[var(--bt-muted)]">Qty</span>
                <input
                  name="scopeQuantity"
                  inputMode="decimal"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid w-24 gap-1 text-sm">
                <span className="text-[10px] text-[var(--bt-muted)]">Unit</span>
                <input
                  name="scopeUnit"
                  placeholder="sq ft"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setScopeRows((rows) => [...rows, rows.length])}
          className="mt-2 text-xs font-medium hover:underline"
          style={{ color: "var(--bt-primary)" }}
        >
          Add another line
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      {/*
        Two buttons, one form. Releasing puts this scope in front of subcontractors,
        so it is a deliberate act rather than a side effect of filling in a title —
        a package saved as a draft can be built up first, and subs can't be invited
        to it until it goes out.
      */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="release"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Working…" : "Save and release to subs"}
        </button>
        <button
          type="submit"
          name="intent"
          value="draft"
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {pending ? "Working…" : "Save draft"}
        </button>
      </div>
    </form>
  );
}
