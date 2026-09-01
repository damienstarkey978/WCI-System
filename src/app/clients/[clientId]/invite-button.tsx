"use client";

import { useActionState } from "react";

import { issueClientPortalInviteAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/** Portal invites have no email provider configured yet — the raw link is shown once to copy and send manually. */
export function InvitePortalButton({ clientId }: { clientId: string }) {
  const [state, formAction, pending] = useActionState(issueClientPortalInviteAction, INITIAL);

  return (
    <form action={formAction}>
      <input type="hidden" name="clientId" value={clientId} />
      <button type="submit" disabled={pending} className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Issuing…" : "Issue portal invite link"}
      </button>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.inviteToken ? (
        <div className="mt-2 rounded border bg-[var(--bt-page-bg)] p-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
          <p className="text-[var(--bt-muted)]">
            Copy this link and send it to the client — it won&apos;t be shown again:
          </p>
          <code className="mt-1 block break-all text-[var(--bt-text)]">/portal/login?token={state.inviteToken}</code>
        </div>
      ) : null}
    </form>
  );
}
