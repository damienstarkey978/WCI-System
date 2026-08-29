"use client";

import { useActionState, useRef, useState } from "react";

import { uploadFilesAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function UploadForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(uploadFilesAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileCount, setFileCount] = useState(0);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
        setFileCount(0);
      }}
      className="rounded-lg border bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (inputRef.current && event.dataTransfer.files.length > 0) {
            inputRef.current.files = event.dataTransfer.files;
            setFileCount(event.dataTransfer.files.length);
          }
        }}
        onClick={() => inputRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm transition"
        style={{
          borderColor: dragOver ? "var(--bt-primary)" : "var(--bt-border)",
          background: dragOver ? "var(--bt-status-open-bg)" : "transparent",
          color: "var(--bt-muted)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          className="hidden"
          onChange={(event) => setFileCount(event.currentTarget.files?.length ?? 0)}
        />
        {fileCount > 0 ? (
          <span className="font-medium text-[var(--bt-text)]">{fileCount} file{fileCount === 1 ? "" : "s"} selected</span>
        ) : (
          <>
            <span className="font-medium text-[var(--bt-text)]">Drag and drop files here</span>
            <span>or click to browse</span>
          </>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Category</span>
          <select name="category" defaultValue="DOCUMENT" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="DOCUMENT">Document</option>
            <option value="PHOTO">Photo</option>
            <option value="PRESALE_PHOTO">Pre-Sale Photo</option>
            <option value="VIDEO">Video</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--bt-muted)]">
          <input type="checkbox" name="clientVisible" defaultChecked />
          Visible to client
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--bt-muted)]">
          <input type="checkbox" name="subVisible" defaultChecked />
          Visible to subs
        </label>
        <button
          type="submit"
          disabled={pending || fileCount === 0}
          className="ml-auto rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>

      {state.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
