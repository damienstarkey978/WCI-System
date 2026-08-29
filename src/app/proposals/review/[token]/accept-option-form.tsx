"use client";

import { useActionState } from "react";

import { acceptProposalReviewAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AcceptOptionForm({ token, optionId, accentColor }: { token: string; optionId: string; accentColor: string }) {
  const [state, formAction, pending] = useActionState(acceptProposalReviewAction, INITIAL);

  if (state.ok) {
    return <p className="text-sm font-semibold" style={{ color: accentColor }}>Accepted — thank you!</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="optionId" value={optionId} />
      <input
        name="clientSignatureName"
        placeholder="Type your full name to sign"
        required
        className="rounded border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "#d1d5db" }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: accentColor }}
      >
        {pending ? "Accepting…" : "Accept this option"}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
