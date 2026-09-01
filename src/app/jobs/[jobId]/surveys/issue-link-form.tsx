"use client";

import { useActionState, useState } from "react";

import { issueSurveyResponseLinkAction, type IssueLinkState } from "./actions";

const INITIAL: IssueLinkState = {};

export function IssueLinkForm({ jobId, surveyId }: { jobId: string; surveyId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(issueSurveyResponseLinkAction, INITIAL);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Send to recipient
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 rounded border p-2" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="surveyId" value={surveyId} />
      <div className="flex flex-wrap gap-2">
        <input name="recipientName" placeholder="Recipient name" className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        <input name="recipientEmail" type="email" placeholder="Recipient email" className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Issuing…" : "Generate link"}
        </button>
      </div>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.token ? (
        <div className="text-xs">
          <p className="text-[var(--bt-muted)]">Copy this link and send it — it won&apos;t be shown again:</p>
          <code className="mt-1 block break-all text-[var(--bt-text)]">/surveys/respond/{state.token}</code>
        </div>
      ) : null}
    </form>
  );
}
