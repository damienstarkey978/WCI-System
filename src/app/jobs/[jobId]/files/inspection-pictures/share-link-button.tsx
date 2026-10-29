"use client";

import { useActionState, useEffect, useState } from "react";

import {
  issueInspectionShareLinkAction,
  type ShareLinkActionState,
} from "./actions";

const INITIAL: ShareLinkActionState = {};

export function InspectionShareLinkButton({
  jobId,
  inspectionId,
  inspectionName,
  existingShareUrl = null,
  existingExpiresAt = null,
}: {
  jobId: string;
  inspectionId: string;
  inspectionName: string;
  /** Absolute URL when an active durable link already exists (re-copyable). */
  existingShareUrl?: string | null;
  existingExpiresAt?: string | null;
}) {
  const [state, formAction, pending] = useActionState(issueInspectionShareLinkAction, INITIAL);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const shareUrl = state.shareUrl ?? existingShareUrl ?? null;
  const expiresAt = state.expiresAt ?? existingExpiresAt ?? null;
  const justCreated = Boolean(state.shareUrl);
  const copied = Boolean(shareUrl && copiedUrl === shareUrl);

  useEffect(() => {
    if (!state.shareUrl) return;
    void navigator.clipboard.writeText(state.shareUrl).then(
      () => setCopiedUrl(state.shareUrl!),
      () => {
        /* clipboard may be blocked; Copy still available */
      },
    );
  }, [state.shareUrl]);

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedUrl(shareUrl);
      return;
    } catch {
      /* fall through — select the URL so staff can copy manually */
    }
    const selection = window.getSelection();
    const code = document.getElementById(`inspection-share-url-${inspectionId}`);
    if (selection && code) {
      selection.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(code);
      selection.addRange(range);
    }
    setCopiedUrl(null);
  }

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="flex flex-col gap-2">
      {shareUrl ? (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3" style={{ borderColor: "var(--bt-border)" }}>
          <p className="text-[11px] text-[var(--bt-muted)]">
            {justCreated
              ? "Link created — copy it and text the inspector yourself (no login, no in-app SMS)."
              : "Copy anytime and text the inspector yourself. Folder-only access, no login."}
            {expiresLabel ? ` Expires ${expiresLabel}.` : ""}
          </p>
          <code
            id={`inspection-share-url-${inspectionId}`}
            className="mt-1.5 block break-all text-[11px] leading-snug text-[var(--bt-text)] sm:text-xs"
          >
            {shareUrl}
          </code>
          <div className="mt-3">
            <button
              type="button"
              onClick={copy}
              className="w-full rounded-lg px-3 py-3 text-sm font-semibold text-[var(--bt-on-primary)] sm:py-2.5"
              style={{ background: "var(--bt-primary)" }}
            >
              {copied ? "Copied — paste into your text" : "Copy share link"}
            </button>
          </div>
          <form action={formAction} className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--bt-border)" }}>
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="inspectionId" value={inspectionId} />
            <input
              name="label"
              placeholder="Inspector name (optional)"
              className="w-full min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--bt-primary)] sm:max-w-[14rem] sm:py-2"
              style={{ borderColor: "var(--bt-border)" }}
              aria-label={`Inspector label for ${inspectionName}`}
            />
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg border px-3 py-2.5 text-sm font-semibold text-[var(--bt-muted)] disabled:opacity-50 sm:w-auto"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {pending ? "Rotating…" : "Rotate link"}
            </button>
          </form>
          <p className="mt-1.5 text-[11px] text-[var(--bt-muted)]">
            Rotate only if the old link leaked — it revokes the previous URL for this folder.
          </p>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="inspectionId" value={inspectionId} />
          <input
            name="label"
            placeholder="Inspector name (optional)"
            className="w-full min-w-0 flex-1 rounded-lg border px-3 py-2.5 text-sm outline-none focus:border-[var(--bt-primary)] sm:max-w-[14rem] sm:py-2"
            style={{ borderColor: "var(--bt-border)" }}
            aria-label={`Inspector label for ${inspectionName}`}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg px-3 py-3 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-2.5"
            style={{ background: "var(--bt-primary)" }}
          >
            {pending ? "Creating…" : "Share with inspector"}
          </button>
        </form>
      )}
      {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}
