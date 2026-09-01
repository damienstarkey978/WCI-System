"use client";

import { useActionState } from "react";

import { updateCoverMessageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CoverMessageEditor({ proposalId, coverMessage }: { proposalId: string; coverMessage: string }) {
  const [state, formAction, pending] = useActionState(updateCoverMessageAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <textarea
        name="coverMessage"
        defaultValue={coverMessage}
        rows={4}
        placeholder="The paragraph the client reads first — what the project covers, key scope numbers, etc."
        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save cover message"}
        </button>
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
