"use client";

import { useActionState } from "react";

import { sendStaffInviteAction, type SendInviteState } from "./[userId]/actions";

const INITIAL: SendInviteState = {};

/**
 * Login-column Send control for Inactive internal users — confirms, activates
 * the account, and emails Clerk sign-in instructions (or shows the link).
 */
export function SendInviteButton({ userId, email, emailConfigured }: { userId: string; email: string; emailConfigured: boolean }) {
  const [state, formAction, pending] = useActionState(sendStaffInviteAction, INITIAL);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const message = emailConfigured
          ? `Send sign-in instructions to ${email}? They'll move from Inactive to Pending until they sign in.`
          : `Activate ${email} and show the sign-in link? Outbound email isn't configured — you'll need to share the link yourself.`;
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-2 py-0.5 text-xs font-semibold text-[var(--bt-primary)] hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {pending ? "Sending…" : "Send"}
      </button>
      {state.error ? (
        <span role="alert" className="max-w-[12rem] text-[10px] leading-tight text-red-600">
          {state.error}
        </span>
      ) : null}
      {state.invite?.emailed ? (
        <span role="status" className="max-w-[12rem] text-[10px] leading-tight text-green-700 dark:text-green-400">
          Sent
        </span>
      ) : null}
      {state.invite && !state.invite.emailed && !state.error ? (
        <span role="status" className="max-w-[14rem] break-all text-[10px] leading-tight text-[var(--bt-muted)]">
          {state.invite.signInUrl}
        </span>
      ) : null}
    </form>
  );
}
