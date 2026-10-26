"use client";

import { useActionState } from "react";

import {
  approveAndEmailWeeklySummaryAction,
  saveWeeklySummaryAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = {};

export function SummaryEditor({
  jobId,
  summary,
  primaryClientEmail,
}: {
  jobId: string;
  summary: {
    id: string;
    headline: string;
    body: string;
    highlights: readonly string[];
    approvedAt: Date | null;
    emailedAt: Date | null;
    emailedTo: string | null;
  };
  primaryClientEmail: string | null;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveWeeklySummaryAction, INITIAL);
  const [emailState, emailAction, emailPending] = useActionState(approveAndEmailWeeklySummaryAction, INITIAL);
  const sent = summary.emailedAt != null;
  const pending = savePending || emailPending;

  const statusLabel = sent
    ? `Emailed${summary.emailedTo ? ` to ${summary.emailedTo}` : ""}`
    : summary.approvedAt
      ? "Approved"
      : "Ready for review";

  return (
    <div className="flex flex-col gap-3 border-t px-3 py-3 sm:px-4" style={{ borderColor: "var(--bt-border)" }} id={`update-${summary.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={
            sent
              ? { background: "color-mix(in srgb, var(--bt-status-open-bg) 80%, transparent)", color: "var(--bt-status-open-text)" }
              : { background: "color-mix(in srgb, var(--bt-hazard) 18%, transparent)", color: "var(--bt-hazard)" }
          }
        >
          {statusLabel}
        </span>
        {!sent && primaryClientEmail ? (
          <span className="text-xs text-[var(--bt-muted)]">Primary client: {primaryClientEmail}</span>
        ) : null}
        {!sent && !primaryClientEmail ? (
          <span className="text-xs text-red-600">Add a client with email on this job before sending.</span>
        ) : null}
      </div>

      {sent ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium text-[var(--bt-text)]">{summary.headline}</p>
          <p className="whitespace-pre-wrap text-[var(--bt-text)]">{summary.body}</p>
          {summary.highlights.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-[var(--bt-muted)]">
              {summary.highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <form action={saveAction} className="flex flex-col gap-3">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="summaryId" value={summary.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Headline</span>
            <input
              name="headline"
              required
              defaultValue={summary.headline}
              className="w-full rounded border px-3 py-2.5 text-base outline-none focus:border-[var(--bt-primary)] sm:py-2 sm:text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Body</span>
            <textarea
              name="body"
              required
              rows={6}
              defaultValue={summary.body}
              className="w-full rounded border px-3 py-2.5 text-base outline-none focus:border-[var(--bt-primary)] sm:py-2 sm:text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Highlights (one per line)</span>
            <textarea
              name="highlights"
              rows={3}
              defaultValue={summary.highlights.join("\n")}
              className="w-full rounded border px-3 py-2.5 text-base outline-none focus:border-[var(--bt-primary)] sm:py-2 sm:text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded border px-4 py-2.5 text-sm font-semibold text-[var(--bt-text)] disabled:opacity-50 sm:w-auto sm:py-2"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {savePending ? "Saving…" : "Save edits"}
            </button>
            <button
              type="submit"
              formAction={emailAction}
              disabled={pending || !primaryClientEmail}
              className="w-full rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-2"
              style={{ background: "var(--bt-primary)" }}
            >
              {emailPending ? "Sending…" : "Approve and Email to Client"}
            </button>
          </div>

          {saveState.error || emailState.error ? (
            <p role="alert" className="text-xs text-red-600">
              {emailState.error ?? saveState.error}
            </p>
          ) : null}
          {saveState.ok && !emailState.ok ? <p className="text-xs text-emerald-700">Saved.</p> : null}
          {emailState.ok ? (
            <p className="text-xs text-emerald-700">
              Approved and emailed{emailState.emailedTo ? ` to ${emailState.emailedTo}` : ""}.
            </p>
          ) : null}
        </form>
      )}
    </div>
  );
}
