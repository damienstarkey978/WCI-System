"use client";

import { useActionState } from "react";

import { sendPermitReminderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function PermitReminderButton({
  jobId,
  permitId,
  disabled,
}: {
  jobId: string;
  permitId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(sendPermitReminderAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="permitId" value={permitId} />
      <button
        type="submit"
        disabled={pending || disabled}
        className="rounded border px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {pending ? "Sending…" : "Send Permit Reminder"}
      </button>
      {state.error ? <p className="text-[11px] text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-[11px] text-emerald-700">Sent{state.emailedTo ? ` to ${state.emailedTo}` : ""}.</p> : null}
    </form>
  );
}
