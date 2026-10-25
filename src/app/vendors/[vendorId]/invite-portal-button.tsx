"use client";

import { useActionState, useState } from "react";

import { inviteVendorAction, type InviteVendorState } from "./actions";

const INITIAL: InviteVendorState = {};

export function InvitePortalButton({ vendorId, hasEmail, alreadyInvited, emailConfigured }: { vendorId: string; hasEmail: boolean; alreadyInvited: boolean; emailConfigured: boolean }) {
  const [state, formAction, pending] = useActionState(inviteVendorAction, INITIAL);
  const [copied, setCopied] = useState(false);
  const invite = state.invite;

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        // A real email goes out on this click, so make the person confirm it.
        if (emailConfigured && !window.confirm("Send this sub a portal invite email now?")) event.preventDefault();
      }}
    >
      <input type="hidden" name="vendorId" value={vendorId} />
      <button
        type="submit"
        disabled={pending || !hasEmail}
        className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Sending…" : alreadyInvited ? "Resend invite" : emailConfigured ? "Email portal invite" : "Create portal invite link"}
      </button>
      {!hasEmail ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Add an email above to invite this sub.</p> : null}
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {invite ? (
        <div role="status" className="mt-2 rounded border bg-[var(--bt-page-bg)] p-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
          {invite.emailed ? (
            <p className="font-medium text-green-700 dark:text-green-400">Invite emailed to {invite.email}.</p>
          ) : (
            <p className="text-[var(--bt-muted)]">
              {invite.emailError ? `Couldn't send the email (${invite.emailError}). ` : emailConfigured ? "" : "Email sending isn't set up yet. "}
              Copy this link and send it to {invite.vendorName} — it works once and won&apos;t be shown again:
            </p>
          )}
          {!invite.emailed ? (
            <div className="mt-1 flex items-start gap-2">
              <code className="block flex-1 break-all text-[var(--bt-text)]">{invite.link}</code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(invite.link).then(() => setCopied(true));
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
