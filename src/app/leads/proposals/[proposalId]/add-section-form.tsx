"use client";

import { useActionState } from "react";

import { addSectionAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AddSectionForm({ proposalId }: { proposalId: string }) {
  const [state, formAction, pending] = useActionState(addSectionAction, INITIAL);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <input
        name="title"
        placeholder="New section title, e.g. Framing & Structural"
        className="flex-1 rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {pending ? "…" : "Add section"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
