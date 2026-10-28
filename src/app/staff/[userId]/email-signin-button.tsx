"use client";

import { useActionState, useState } from "react";

import { emailStaffSignInAction, type EmailStaffSignInState } from "./actions";

const INITIAL: EmailStaffSignInState = {};

export function EmailSignInButton({
  userId,
  email,
  emailConfigured,
  alreadyLinked,
}: {
  userId: string;
  email: string;
  emailConfigured: boolean;
  alreadyLinked: boolean;
}) {
  const [state, formAction, pending] = useActionState(emailStaffSignInAction, INITIAL);
  const [copied, setCopied] = useState(false);
  const invite = state.invite;

  if (alreadyLinked) {
    return (
      <p className="text-sm text-[var(--bt-muted)]">
        This person has already signed in with Clerk — no invite email is needed.
      </p>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (emailConfigured && !window.confirm(`Email sign-in instructions to ${email} now?`)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Sending…" : emailConfigured ? "Email sign-in instructions" : "Show sign-in link"}
      </button>
      {!emailConfigured ? (
        <p className="text-xs text-[var(--bt-muted)]">
          Outbound email isn&apos;t configured (EMAIL_PROVIDER_API_KEY + EMAIL_FROM). You can still copy the sign-in link.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {invite ? (
        <div role="status" className="rounded border bg-[var(--bt-page-bg)] p-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
          {invite.emailed ? (
            <p className="font-medium text-green-700 dark:text-green-400">Instructions emailed to {invite.email}.</p>
          ) : (
            <p className="text-[var(--bt-muted)]">
              {invite.emailError ? `Couldn't send the email (${invite.emailError}). ` : null}
              Copy this link and send it to {invite.email}:
            </p>
          )}
          {!invite.emailed ? (
            <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-start">
              <code className="block min-w-0 flex-1 break-all text-[var(--bt-text)]">{invite.signInUrl}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(invite.signInUrl).then(() => setCopied(true));
                }}
                className="shrink-0 rounded border px-2 py-1 font-semibold text-[var(--bt-text)] hover:bg-black/5 dark:hover:bg-white/10"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
