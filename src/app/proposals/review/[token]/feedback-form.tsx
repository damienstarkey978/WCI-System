"use client";

import { useActionState } from "react";

import { submitFeedbackReviewAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function FeedbackForm({ token, accentColor }: { token: string; accentColor: string }) {
  const [state, formAction, pending] = useActionState(submitFeedbackReviewAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="token" value={token} />
      <textarea
        name="feedback"
        rows={3}
        placeholder="Questions or notes before you decide — e.g. &quot;like Option B but swap the fixtures&quot;"
        className="rounded border px-3 py-2 text-sm outline-none"
        style={{ borderColor: "#d1d5db" }}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ borderColor: accentColor, color: accentColor }}
        >
          {pending ? "Sending…" : "Send feedback"}
        </button>
        {state.ok ? <span className="text-xs font-medium" style={{ color: accentColor }}>Sent — thank you.</span> : null}
        {state.error ? (
          <span role="alert" className="text-xs text-red-600">
            {state.error}
          </span>
        ) : null}
      </div>
    </form>
  );
}
