"use client";

import { useActionState, useRef } from "react";

import { postCommentAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CommentForm({ featureType, featureId, revalidate }: { featureType: string; featureId: string; revalidate: string }) {
  const [state, formAction, pending] = useActionState(postCommentAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="flex items-end gap-2 border-t px-4 py-3"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="featureType" value={featureType} />
      <input type="hidden" name="featureId" value={featureId} />
      <input type="hidden" name="revalidate" value={revalidate} />
      <textarea
        name="body"
        required
        rows={2}
        placeholder="Add a comment…"
        className="flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Posting…" : "Post"}
      </button>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
