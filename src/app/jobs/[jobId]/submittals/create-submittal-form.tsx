"use client";

import { useActionState, useRef } from "react";

import { createSubmittalAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateSubmittalForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(createSubmittalAction, INITIAL);
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
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New submittal</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Type</span>
          <select name="type" defaultValue="MATERIAL_SPEC" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="MATERIAL_SPEC">Material spec</option>
            <option value="SHOP_DRAWING">Shop drawing</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Document link</span>
          <input name="documentUrl" type="url" required placeholder="https://…" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Notes</span>
        <textarea name="notes" rows={2} className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Creating…" : "Create submittal"}
        </button>
      </div>
    </form>
  );
}
