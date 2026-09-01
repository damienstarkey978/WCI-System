"use client";

import { useActionState, useState } from "react";

import { convertLeadAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ConvertToJobButton({ leadId, defaultName }: { leadId: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(convertLeadAction, INITIAL);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)]"
        style={{ background: "var(--bt-primary)" }}
      >
        Convert to job
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="leadId" value={leadId} />
      <input
        name="name"
        required
        defaultValue={defaultName}
        className="rounded border px-2 py-1 text-xs outline-none"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <select name="contractType" defaultValue="FIXED_PRICE" className="rounded border px-2 py-1 text-xs outline-none" style={{ borderColor: "var(--bt-border)" }}>
        <option value="FIXED_PRICE">Fixed Price</option>
        <option value="OPEN_BOOK">Open Book</option>
      </select>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create job"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)]">
          Cancel
        </button>
      </div>
    </form>
  );
}
