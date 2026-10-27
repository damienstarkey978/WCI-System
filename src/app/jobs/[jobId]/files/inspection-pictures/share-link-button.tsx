"use client";

import { useActionState, useState } from "react";

import {
  issueInspectionShareLinkAction,
  type ShareLinkActionState,
} from "./actions";

const INITIAL: ShareLinkActionState = {};

export function InspectionShareLinkButton({
  jobId,
  inspectionId,
  inspectionName,
}: {
  jobId: string;
  inspectionId: string;
  inspectionName: string;
}) {
  const [state, formAction, pending] = useActionState(issueInspectionShareLinkAction, INITIAL);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copied = Boolean(state.shareUrl && copiedUrl === state.shareUrl);

  async function copy() {
    if (!state.shareUrl) return;
    try {
      await navigator.clipboard.writeText(state.shareUrl);
      setCopiedUrl(state.shareUrl);
    } catch {
      setCopiedUrl(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="inspectionId" value={inspectionId} />
        <input
          name="label"
          placeholder="Inspector name (optional)"
          className="w-full min-w-0 flex-1 rounded border px-2.5 py-2 text-xs outline-none focus:border-[var(--bt-primary)] sm:max-w-[12rem] sm:py-1.5"
          style={{ borderColor: "var(--bt-border)" }}
          aria-label={`Inspector label for ${inspectionName}`}
        />
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded px-3 py-2.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-1.5"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create inspector link"}
        </button>
      </form>
      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.shareUrl ? (
        <div className="rounded border bg-[var(--bt-panel-bg)] p-2.5" style={{ borderColor: "var(--bt-border)" }}>
          <p className="text-[11px] text-[var(--bt-muted)]">
            Copy and send to the inspector — no login required. Previous link for this folder was revoked.
          </p>
          <code className="mt-1 block break-all text-[11px] text-[var(--bt-text)] sm:text-xs">{state.shareUrl}</code>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={copy}
              className="w-full rounded border px-3 py-2 text-xs font-semibold text-[var(--bt-text)] sm:w-auto sm:py-1.5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={`sms:?&body=${encodeURIComponent(`Inspection photos for ${inspectionName}: ${state.shareUrl}`)}`}
              className="inline-flex w-full items-center justify-center rounded border px-3 py-2 text-xs font-semibold text-[var(--bt-text)] sm:w-auto sm:py-1.5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Text link
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent(`${inspectionName} inspection photos`)}&body=${encodeURIComponent(`Please use this link to view and upload photos for ${inspectionName}:\n\n${state.shareUrl}`)}`}
              className="inline-flex w-full items-center justify-center rounded border px-3 py-2 text-xs font-semibold text-[var(--bt-text)] sm:w-auto sm:py-1.5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Email link
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
