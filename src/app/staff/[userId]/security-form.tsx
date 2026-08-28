"use client";

import { useActionState } from "react";

import { setStaffActiveAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function SecurityForm({ userId, isActive }: { userId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(setStaffActiveAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="isActive" value={(!isActive).toString()} />
      <span className="text-sm text-[var(--bt-text)]">
        This account is currently <strong>{isActive ? "active" : "inactive"}</strong>
        {isActive ? " — they can sign in." : " — they can't sign in."}
      </span>
      <button
        type="submit"
        disabled={pending}
        className={`rounded px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
          isActive ? "border border-red-300 text-red-700 hover:bg-red-50" : "text-white"
        }`}
        style={isActive ? undefined : { background: "var(--bt-primary)" }}
      >
        {pending ? "Saving…" : isActive ? "Deactivate" : "Reactivate"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
