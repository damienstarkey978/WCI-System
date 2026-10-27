"use client";

import { useActionState } from "react";

import {
  emailProposalAction,
  textProposalAction,
  type DeliveryActionState,
} from "./actions";

const INITIAL: DeliveryActionState = {};

export function SendProposalButtons({
  proposalId,
  clientEmail,
  clientPhone,
  emailConfigured,
  smsConfigured,
}: {
  readonly proposalId: string;
  readonly clientEmail: string | null;
  readonly clientPhone: string | null;
  readonly emailConfigured: boolean;
  readonly smsConfigured: boolean;
}) {
  const [emailState, emailAction, emailPending] = useActionState(emailProposalAction, INITIAL);
  const [smsState, smsAction, smsPending] = useActionState(textProposalAction, INITIAL);

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
        <form action={emailAction} className="min-w-0 flex-1 sm:flex-none">
          <input type="hidden" name="proposalId" value={proposalId} />
          <button
            type="submit"
            disabled={emailPending || !clientEmail}
            title={
              !clientEmail
                ? "Client has no email on file"
                : emailConfigured
                  ? `Email ${clientEmail}`
                  : "Email provider not configured"
            }
            className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] shadow-sm disabled:opacity-50 sm:min-h-10 sm:w-auto sm:text-xs"
            style={{ background: "var(--bt-primary)" }}
          >
            <SendIcon />
            {emailPending ? "Sending…" : "Email"}
          </button>
        </form>
        <form action={smsAction} className="min-w-0 flex-1 sm:flex-none">
          <input type="hidden" name="proposalId" value={proposalId} />
          <button
            type="submit"
            disabled={smsPending || !clientPhone}
            title={
              !clientPhone
                ? "Client has no phone on file"
                : smsConfigured
                  ? `Text ${clientPhone}`
                  : "SMS provider not configured"
            }
            className="inline-flex min-h-11 w-full touch-manipulation items-center justify-center gap-1.5 rounded-md border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] disabled:opacity-50 sm:min-h-10 sm:w-auto sm:text-xs"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
          >
            {smsPending ? "Texting…" : "Text"}
          </button>
        </form>
      </div>
      <DeliveryStatus state={emailState} channel="Email" configured={emailConfigured} hasContact={Boolean(clientEmail)} contact={clientEmail} />
      <DeliveryStatus state={smsState} channel="Text" configured={smsConfigured} hasContact={Boolean(clientPhone)} contact={clientPhone} />
      {!emailConfigured || !smsConfigured ? (
        <p className="max-w-sm text-[11px] text-[var(--bt-muted)]">
          {!emailConfigured ? "Email needs EMAIL_PROVIDER_API_KEY + EMAIL_FROM on Netlify. " : null}
          {!smsConfigured ? "Text needs QUO_API_KEY and QUO_FROM_NUMBER (Quo inbox E.164)." : null}
        </p>
      ) : null}
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M1.5 7.2L12.2 2.4L8.1 12.1L6.2 8.3L1.5 7.2Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeliveryStatus({
  state,
  channel,
  configured,
  hasContact,
  contact,
}: {
  readonly state: DeliveryActionState;
  readonly channel: string;
  readonly configured: boolean;
  readonly hasContact: boolean;
  readonly contact: string | null;
}) {
  if (state.error) {
    return <p className="max-w-sm text-xs text-red-600">{channel}: {state.error}</p>;
  }
  if (state.ok) {
    return (
      <p className="max-w-sm text-xs text-[var(--bt-muted)]">
        {channel} sent to {state.to}
        {state.reviewUrl ? (
          <>
            {" "}
            ·{" "}
            <a href={state.reviewUrl} className="text-[var(--bt-primary)] hover:underline" target="_blank" rel="noreferrer">
              open link
            </a>
          </>
        ) : null}
      </p>
    );
  }
  if (!hasContact) {
    return (
      <p className="max-w-sm text-[11px] text-[var(--bt-muted)]">
        {channel}: add a client {channel === "Email" ? "email" : "phone"} first.
      </p>
    );
  }
  if (!configured) {
    return null;
  }
  return contact ? (
    <p className="max-w-sm text-[11px] text-[var(--bt-muted)]">
      {channel} → {contact}
    </p>
  ) : null;
}
