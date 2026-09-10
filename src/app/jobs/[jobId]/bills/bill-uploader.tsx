"use client";

import { useActionState, useRef, useState } from "react";

import { uploadBillsAction, type UploadState } from "./upload-actions";

const INITIAL: UploadState = {};

/**
 * The drop zone the Bills page opens with. Buildertrend's equivalent is the first
 * thing on the page rather than a manual-entry form, because that matches how bills
 * actually arrive: photographed or forwarded, not typed.
 *
 * Dropping files sets them on the real <input type="file"> and submits, so this
 * works identically whether someone drags a receipt in or clicks Browse — and it
 * still works with JS disabled, since the input and submit button are real.
 */
export function BillUploader({ jobId, inboxAddress }: { jobId: string; inboxAddress: string }) {
  const [state, formAction, pending] = useActionState(uploadBillsAction, INITIAL);
  const [dragging, setDragging] = useState(false);
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [copied, setCopied] = useState(false);

  function acceptFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (inputRef.current) {
      inputRef.current.files = files;
      setChosen(Array.from(files).map((file) => file.name));
    }
  }

  return (
    <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="jobId" value={jobId} />

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFiles(event.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition"
          style={{
            borderColor: dragging ? "var(--bt-primary)" : "var(--bt-border)",
            background: dragging ? "color-mix(in srgb, var(--bt-primary) 6%, transparent)" : "transparent",
          }}
        >
          <p className="text-sm font-medium text-[var(--bt-text)]">Drop bills &amp; receipts here</p>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">
            AI reads the vendor, amount, date, and cost codes. Nothing is payable until you confirm it.
          </p>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">PNG, JPEG, GIF, WebP, or PDF · up to 20MB per batch</p>

          <input
            ref={inputRef}
            type="file"
            name="files"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            onChange={(event) => setChosen(Array.from(event.target.files ?? []).map((file) => file.name))}
            className="hidden"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Browse
            </button>
            <button
              type="submit"
              disabled={pending || chosen.length === 0}
              className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              {pending ? "Reading…" : chosen.length > 0 ? `Upload ${chosen.length}` : "Upload"}
            </button>
          </div>

          {chosen.length > 0 && !pending ? (
            <p className="mt-2 max-w-full truncate text-xs text-[var(--bt-muted)]">{chosen.join(", ")}</p>
          ) : null}
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--bt-muted)]">
        <span>Or forward vendor bills to</span>
        <code className="rounded bg-black/5 px-1.5 py-0.5 text-[var(--bt-text)]">{inboxAddress}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(inboxAddress).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              },
              () => setCopied(false),
            );
          }}
          className="hover:underline"
          style={{ color: "var(--bt-primary)" }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm" style={{ color: "var(--bt-danger)" }}>
          {state.error}
        </p>
      ) : null}

      {state.results && state.results.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-xs">
          {state.results.map((result) => (
            <li key={result.fileName} style={{ color: result.ok ? "var(--bt-success)" : "var(--bt-danger)" }}>
              <span className="font-medium">{result.fileName}</span> — {result.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
